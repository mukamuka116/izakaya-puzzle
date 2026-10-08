// scores.mjs — ゲーム開始の札、スコア送信、ランキング
import { randomUUID } from 'node:crypto';
import {
  BEST_COUNT, DIFFICULTIES, RANKING_LIMIT, SCORE_RULES, START_TTL_SEC, TITLE_MIN_PT, TODAY_TTL_BUFFER_SEC,
} from './config.mjs';
import { signToken, verifyToken } from './auth.mjs';
import { HttpError, publicProfile, requireUser } from './account.mjs';
import { TITLES } from './titles.mjs';
import { RANK_MIN_PT, rankInfo } from './rank.mjs';

const now = () => Math.floor(Date.now() / 1000);
const bad = (m) => new HttpError(400, m);

// 「本日」は日本時間（JST）の日付で区切る
export const todayKey = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const endOfDayEpoch = (dateKey) => Math.floor(Date.parse(`${dateKey}T23:59:59+09:00`) / 1000);

// ランキングの種類。period: 'all' | 'today'、scope: 'easy' | 'normal' | 'hard' | 'any'（難易度問わず）
const SCOPES = ['easy', 'normal', 'hard', 'any'];
const boardKey = (periodKey, scope) => `${periodKey}#${scope}`;
const periodKeyOf = (period) => (period === 'today' ? `d:${todayKey()}` : 'all');

// 並び順キー：①点数が高い ②同点ならビールが多い ③それも同じならげろげろが少ない ④それでも同じなら先に出した人が上位
export const sortKey = (finalPt, beers, gero, atMs, loginId) =>
  `${String(9_999_999_999 - finalPt).padStart(10, '0')}#${String(999_999 - beers).padStart(6, '0')}#${String(gero).padStart(6, '0')}#${String(atMs).padStart(13, '0')}#${loginId}`;
// 新しい記録が、これまでの記録より上位か（上の①②③と同じ順）
export const isBetter = (a, b) => a.finalPt !== b.finalPt ? a.finalPt > b.finalPt : a.beers !== b.beers ? a.beers > b.beers : a.gero < b.gero;

// ---- ゲーム開始の札 ----
export function startGame(user, body) {
  const difficulty = body?.difficulty;
  if (!DIFFICULTIES[difficulty]) throw bad('難易度が不正です');
  return { startToken: signToken('start', { sub: user.loginId, diff: difficulty, nonce: randomUUID(), st: now() }, START_TTL_SEC) };
}

// ---- スコア送信 ----
export async function submitScore(db, user0, body) {
  const { startToken, rawPt, finalPt, beers, gero } = body ?? {};
  const start = verifyToken(startToken, 'start');
  if (!start || start.sub !== user0.loginId) throw new HttpError(400, 'ゲームの開始情報が無効です');
  const difficulty = start.diff;
  const elapsed = now() - start.st;
  if (elapsed < SCORE_RULES.minElapsedSec || elapsed > SCORE_RULES.maxElapsedSec) throw bad('プレイ時間が不正です');

  const ints = [rawPt, finalPt, beers, gero];
  if (!ints.every((v) => Number.isInteger(v) && v >= 0)) throw bad('スコアの値が不正です');
  // ランクが高いほど基本点が増えるので、上限もそれに合わせて上げる
  const rankMult = 1 + rankInfo(user0.totalBeers ?? 0).rank / 10;
  const rawCap = Math.min(SCORE_RULES.rawMax * rankMult, SCORE_RULES.rawPerSecMax * rankMult * elapsed);
  if (rawPt > rawCap || beers > SCORE_RULES.beersMax || gero > SCORE_RULES.geroMax) throw bad('スコアの値が不正です');
  if (Math.abs(finalPt - Math.round(rawPt * DIFFICULTIES[difficulty].mult)) > 1) throw bad('スコアの値が不正です');

  // スコアが足りないゲームは、何も更新しない（記録・累計ビール・称号・ランキング）
  if (rawPt < RANK_MIN_PT) return { skipped: true };

  // 同じ開始の札で2回送れない
  if (!(await db.claimStart(start.nonce, start.exp + 3600))) throw new HttpError(409, 'このスコアはすでに送信済みです');

  const at = Date.now();
  const playRank = rankInfo(user0.totalBeers ?? 0).rank; // このゲームを遊んだときのランク（記録に残す）
  const entry = { finalPt, rawPt, difficulty, beers, gero, at };
  const today = todayKey();
  const todayTtl = endOfDayEpoch(today) + TODAY_TTL_BUFFER_SEC;
  const boards = [
    { key: boardKey('all', difficulty), ttl: undefined }, { key: boardKey('all', 'any'), ttl: undefined },
    { key: boardKey(`d:${today}`, difficulty), ttl: todayTtl }, { key: boardKey(`d:${today}`, 'any'), ttl: todayTtl },
  ];

  // アカウントを更新（競合したら読み直して最大3回やり直す）。ランキングへの書き込みは保存に成功してから行う
  let account, writes, deletes, ranksFor, newTitle;
  for (let attempt = 0; attempt < 3; attempt++) {
    account = attempt === 0 ? user0 : await db.getAccount(user0.loginId);
    if (!account) throw new HttpError(401, 'アカウントが見つかりません');
    account.best = [...(account.best ?? []), entry].sort((a, b) => b.finalPt - a.finalPt || b.beers - a.beers || a.gero - b.gero || a.at - b.at).slice(0, BEST_COUNT);
    account.totalBeers = (account.totalBeers ?? 0) + beers;
    account.totalGero = (account.totalGero ?? 0) + gero;
    // 新しい称号：まだ持っていない中から、ランダムに1つ（すべて持っていれば、なし）。スコアが TITLE_MIN_PT 未満（放置プレイなど）では獲得できない
    const have = new Set(account.titles ?? []);
    const unowned = rawPt >= TITLE_MIN_PT ? TITLES.filter((t) => !have.has(t)) : [];
    newTitle = unowned.length ? unowned[Math.floor(Math.random() * unowned.length)] : null;
    if (newTitle) account.titles = [...(account.titles ?? []), newTitle];
    account.rankKeys ??= {};
    // 古い日付のボードの記録は自動削除されるので、手元の控えも消す
    for (const k of Object.keys(account.rankKeys)) if (k.startsWith('d:') && !k.startsWith(`d:${today}#`)) delete account.rankKeys[k];

    writes = [];
    deletes = [];
    ranksFor = [];
    for (const b of boards) {
      const old = account.rankKeys[b.key];
      if (!old || isBetter(entry, { finalPt: old.pt, beers: old.beers ?? 0, gero: old.gero ?? 0 })) {
        const sk = sortKey(finalPt, beers, gero, at, account.loginId);
        writes.push({ board: b.key, sk, loginId: account.loginId, finalPt, rawPt, difficulty, beers, gero, at, playRank, ttl: b.ttl });
        if (old) deletes.push({ board: b.key, sk: old.sk });
        account.rankKeys[b.key] = { sk, pt: finalPt, rawPt, difficulty, beers, gero, at, playRank };
      }
      ranksFor.push(b.key);
    }
    if (await db.saveAccount(account)) break;
    if (attempt === 2) throw new HttpError(409, '更新が重なりました。もう一度お試しください');
  }

  for (const w of writes) await db.putScore(w);
  for (const d of deletes) await db.deleteScore(d.board, d.sk);

  // 書き込んだ順位表の、覚えてあるデータを捨てる
  for (const w of writes) rankCache.delete(w.board);

  // 画面が、あらためて自分の情報を取り直さなくて済むよう、更新後のプロフィールも返す
  return { best: account.best, totalBeers: account.totalBeers, totalGero: account.totalGero, newTitle, at, profile: publicProfile(account), renewed: writes.map((w) => w.board) };
}

// ---- ランキング ----
const rankCache = new Map(); // 順位表の名前 → { at, items, accounts }
// 返すのはニックネームなど表示用の項目だけ。ログインIDは含めない
export async function getRanking(db, userOrNull, query) {
  const scope = query?.difficulty ?? 'any';
  const period = query?.period ?? 'all';
  if (!SCOPES.includes(scope) || !['all', 'today'].includes(period)) throw bad('ランキングの種類が不正です');
  const key = boardKey(periodKeyOf(period), scope);

  // 順位表（上位100件）と名前などは、サーバーの中で少しのあいだ覚えておき、DynamoDBへの読み取りを減らす
  const ttl = Number(process.env.RANKING_CACHE_MS ?? 30_000);
  let cached = rankCache.get(key);
  if (!cached || Date.now() - cached.at >= ttl) {
    const items = await db.queryBoard(key, RANKING_LIMIT);
    const accounts = await db.getAccounts([...new Set(items.map((i) => i.loginId))]);
    cached = { at: Date.now(), items, accounts };
    rankCache.set(key, cached);
  }
  const { items, accounts } = cached;
  const rows = items.map((it, i) => ({
    rank: i + 1,
    nickname: accounts[it.loginId]?.nickname ?? '???',
    avatar: accounts[it.loginId]?.avatar ?? '1',
    title: accounts[it.loginId]?.title ?? '',
    // 記録したときのランク（古い記録には残っていないので、そのときは今のランク）
    playerRank: it.playRank ?? rankInfo(accounts[it.loginId]?.totalBeers ?? 0).rank,
    finalPt: it.finalPt, rawPt: it.rawPt, difficulty: it.difficulty, beers: it.beers, gero: it.gero, at: it.at,
    mine: !!userOrNull && it.loginId === userOrNull.loginId, // 自分の行（画面で赤く点滅させる）
  }));

  // 101位以下でも見られるよう、自分の順位は別枠で返す
  let me = null;
  const mine = userOrNull?.rankKeys?.[key];
  if (mine) {
    const inList = items.findIndex((i) => i.sk === mine.sk);
    me = {
      rank: inList >= 0 ? inList + 1 : (await db.countBefore(key, mine.sk)) + 1, // 上位100位以内なら、読み取りなしで分かる
      nickname: userOrNull.nickname, avatar: userOrNull.avatar, title: userOrNull.title ?? '', playerRank: mine.playRank ?? rankInfo(userOrNull.totalBeers ?? 0).rank,
      finalPt: mine.pt, rawPt: mine.rawPt, difficulty: mine.difficulty, beers: mine.beers, gero: mine.gero, at: mine.at,
    };
    me.outside = me.rank > RANKING_LIMIT;
  }
  return { board: key, limit: RANKING_LIMIT, rows, me };
}

// 名前・称号が変わったときなどに、順位表の記憶を捨てる
export const clearRankingCache = () => rankCache.clear();

// アカウント削除時：ランキング上の記録も消す
export async function deleteUserScores(db, account) {
  rankCache.clear();
  for (const [board, v] of Object.entries(account.rankKeys ?? {})) await db.deleteScore(board, v.sk);
}
