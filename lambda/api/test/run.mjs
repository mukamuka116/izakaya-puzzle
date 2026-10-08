// run.mjs — メモリ上のDBでAPI全体を動かす確認テスト（AWSには接続しない）。実行: node test/run.mjs
process.env.AUTH_SECRET = 'test-secret-test-secret-1234';
process.env.RANKING_CACHE_MS = '0'; // ふだんのテストでは、順位表を覚えない
import assert from 'node:assert/strict';
import { makeHandler } from '../index.mjs';
import { createMemDb } from './memdb.mjs';

const db = createMemDb();
const handler = makeHandler(db);
let clock = Date.now();
Date.now = () => clock; // 時間を進められるようにする

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('ok -', name); };

async function call(method, path, { body, token, query } = {}) {
  const res = await handler({
    requestContext: { http: { method } }, rawPath: path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    queryStringParameters: query, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : null };
}

const reg = (loginId, extra = {}) => call('POST', '/account/register', {
  body: { loginId, password: 'password1', nickname: `N_${loginId}`, avatar: '2', questionId: 3, answer: 'ポチ', ...extra },
});

async function play(token, difficulty, rawPt, beers = 3, gero = 1) {
  const s = await call('POST', '/scores/start', { token, body: { difficulty } });
  assert.equal(s.status, 200);
  clock += 100 * 1000; // 100秒たったことにする
  const mult = { easy: 0.8, normal: 1.2, hard: 2.0 }[difficulty];
  return call('POST', '/scores/submit', {
    token, body: { startToken: s.data.startToken, difficulty, rawPt, finalPt: Math.round(rawPt * mult), beers, gero },
  });
}

let alice;

await test('登録：成功・重複・不正なID/パスワード', async () => {
  const r = await reg('alice01');
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  assert.equal(r.data.profile.nickname, 'N_alice01');
  assert.equal(r.data.profile.passwordHash, undefined);
  alice = r.data.token;
  assert.equal((await reg('alice01')).status, 409);
  assert.equal((await reg('ab')).status, 400);
  assert.equal((await reg('bob_0001', { password: 'short' })).status, 400);
  assert.equal((await reg('bob_0001', { password: 'bob_0001' })).status, 400);
  assert.equal((await reg('bob_0001', { questionId: 99 })).status, 400);
});

await test('パスワードは平文で保存されない', async () => {
  const a = db._accounts.get('alice01');
  assert.ok(a.passwordHash.startsWith('scrypt$'));
  assert.ok(!JSON.stringify(a).includes('password1'));
  assert.ok(!JSON.stringify(a).includes('ポチ'));
});

await test('ログイン：成功・失敗', async () => {
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'alice01', password: 'password1' } })).status, 200);
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'alice01', password: 'wrongpass' } })).status, 401);
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'nobody99', password: 'password1' } })).status, 401);
});

await test('ロック：10回失敗で10分ロック、時間がたてば解除', async () => {
  await reg('lock0001');
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/account/login', { body: { loginId: 'lock0001', password: 'bad-bad-bad' } })).status, 401);
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'lock0001', password: 'password1' } })).status, 429); // 正しくてもロック中
  clock += 10 * 60 * 1000 + 1000;
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'lock0001', password: 'password1' } })).status, 200);
});

await test('パスワード再設定：質問と答えが一致したときだけ', async () => {
  const v = (b) => call('POST', '/account/recovery/verify', { body: b });
  assert.equal((await v({ loginId: 'alice01', questionId: 3, answer: 'タマ' })).status, 401);
  assert.equal((await v({ loginId: 'alice01', questionId: 4, answer: 'ポチ' })).status, 401); // 質問が違う
  assert.equal((await v({ loginId: 'nobody99', questionId: 3, answer: 'ポチ' })).status, 401);
  const ok = await v({ loginId: 'alice01', questionId: 3, answer: ' ぽち ' }); // ひらがな・空白でも一致
  assert.equal(ok.status, 200);
  const reset = await call('POST', '/account/recovery/reset', { body: { resetToken: ok.data.resetToken, newPassword: 'newpass123' } });
  assert.equal(reset.status, 200);
  alice = reset.data.token;
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'alice01', password: 'password1' } })).status, 401);
  assert.equal((await call('POST', '/account/login', { body: { loginId: 'alice01', password: 'newpass123' } })).status, 200);
  // 同じ再設定用の札は2回使えない
  assert.equal((await call('POST', '/account/recovery/reset', { body: { resetToken: ok.data.resetToken, newPassword: 'another1234' } })).status, 401);
});

await test('プロフィール更新・設定の保存', async () => {
  const r = await call('PUT', '/account/me', { token: alice, body: { nickname: 'アリス', avatar: '5', settings: { volume: 0.5 } } });
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.nickname, 'アリス');
  assert.equal((await call('GET', '/account/me', { token: alice })).data.profile.settings.volume, 0.5);
  assert.equal((await call('PUT', '/account/me', { token: alice, body: { nickname: 'あ'.repeat(11) } })).status, 400);
  assert.equal((await call('GET', '/account/me')).status, 401);
});

await test('スコア送信：ベスト5・累積・ランキング', async () => {
  const r = await play(alice, 'hard', 10000, 4, 2);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.best[0].finalPt, 20000);
  assert.equal(r.data.profile.totalBeers, 4); // 更新後のプロフィールも返す（画面が取り直さなくて済む）
  assert.ok(Array.isArray(r.data.profile.titles));
  assert.equal(r.data.totalBeers, 4);
  assert.equal(r.data.totalGero, 2);
  for (const rawPt of [5000, 6000, 7000, 8000, 9000]) await play(alice, 'normal', rawPt, 1, 0);
  const me = (await call('GET', '/account/me', { token: alice })).data.profile;
  assert.equal(me.best.length, 5); // ベスト5まで
  assert.equal(me.best[0].finalPt, 20000);
  assert.equal(me.totalBeers, 9);
});

await test('不正なスコア：値の矛盾・二重送信・時間不足・他人の札', async () => {
  const s = await call('POST', '/scores/start', { token: alice, body: { difficulty: 'easy' } });
  clock += 100 * 1000;
  const submit = (b) => call('POST', '/scores/submit', { token: alice, body: { startToken: s.data.startToken, difficulty: 'easy', ...b } });
  assert.equal((await submit({ rawPt: 1000, finalPt: 99999, beers: 1, gero: 0 })).status, 400); // 倍率と合わない
  assert.equal((await submit({ rawPt: 99_000_000, finalPt: 79_200_000, beers: 1, gero: 0 })).status, 400); // 大きすぎる
  assert.equal((await submit({ rawPt: 1000, finalPt: 800, beers: 1, gero: 0 })).status, 200);
  assert.equal((await submit({ rawPt: 1000, finalPt: 800, beers: 1, gero: 0 })).status, 409); // 同じ札は1回だけ
  const quick = await call('POST', '/scores/start', { token: alice, body: { difficulty: 'easy' } });
  clock += 5 * 1000;
  const early = await call('POST', '/scores/submit', { token: alice, body: { startToken: quick.data.startToken, rawPt: 10, finalPt: 8, beers: 0, gero: 0 } });
  assert.equal(early.status, 400); // 短すぎる
  const bobReg = await reg('bob_0001', { nickname: 'ボブ' });
  const foreign = await call('POST', '/scores/submit', { token: bobReg.data.token, body: { startToken: quick.data.startToken, rawPt: 10, finalPt: 8, beers: 0, gero: 0 } });
  assert.equal(foreign.status, 400); // 他人の札は使えない
});

await test('ランキング：IDは出さず、自分の行に印、難易度別・難易度問わず・本日', async () => {
  const bob = (await call('POST', '/account/login', { body: { loginId: 'bob_0001', password: 'password1' } })).data.token;
  await play(bob, 'hard', 12000, 5, 3);
  for (const [diff, period] of [['hard', 'all'], ['any', 'all'], ['hard', 'today'], ['any', 'today']]) {
    const r = await call('GET', '/ranking', { token: alice, query: { difficulty: diff, period } });
    assert.equal(r.status, 200);
    assert.ok(r.data.rows.length >= 2, `${diff}/${period}`);
    assert.ok(!JSON.stringify(r.data).includes('alice01'), 'IDが漏れている');
    assert.ok(!JSON.stringify(r.data).includes('bob_0001'), 'IDが漏れている');
  }
  const r = await call('GET', '/ranking', { token: alice, query: { difficulty: 'hard', period: 'all' } });
  assert.deepEqual(r.data.rows.map((x) => x.nickname), ['ボブ', 'アリス']); // 24000 > 20000
  assert.deepEqual(r.data.rows.map((x) => x.mine), [false, true]);
  assert.equal(r.data.rows[0].beers, 5);
  assert.ok(Number.isFinite(r.data.rows[0].at)); // 日付（ミリ秒）が含まれる
  assert.equal(r.data.me.rank, 2);
  const anon = await call('GET', '/ranking', { query: { difficulty: 'hard', period: 'all' } });
  assert.deepEqual(anon.data.rows.map((x) => x.mine), [false, false]);
  assert.equal(anon.data.me, null);
  assert.equal((await call('GET', '/ranking', { query: { difficulty: 'x' } })).status, 400);
});

await test('日が変わると「本日」の記録は対象外（総合は残る）', async () => {
  clock += 36 * 3600 * 1000;
  const today = await call('GET', '/ranking', { token: alice, query: { difficulty: 'hard', period: 'today' } });
  assert.equal(today.data.rows.length, 0);
  const all = await call('GET', '/ranking', { token: alice, query: { difficulty: 'hard', period: 'all' } });
  assert.equal(all.data.rows.length, 2);
});

await test('101位以下でも「あなたの順位」を別枠で返す', async () => {
  // 150人ぶんの記録を直接入れる
  for (let i = 0; i < 150; i++) {
    const pt = 100000 + i;
    await db.putScore({ board: 'all#easy', sk: `${String(9_999_999_999 - pt).padStart(10, '0')}#${String(i).padStart(13, '0')}#dummy${i}`, loginId: `dummy${i}`, finalPt: pt, rawPt: pt, difficulty: 'easy', beers: 1, gero: 0 });
  }
  const r = await call('GET', '/ranking', { token: alice, query: { difficulty: 'easy', period: 'all' } });
  assert.equal(r.data.rows.length, 100);
  assert.equal(r.data.me.rank, 151); // 自分の800ptは150人の下
  assert.equal(r.data.me.outside, true);
  assert.equal(r.data.rows.some((x) => x.mine), false);
});

await test('称号：ゲームごとに新しく獲得・設定・ランキング表示', async () => {
  const { TITLES } = await import('../titles.mjs');
  const me0 = (await call('GET', '/account/me', { token: alice })).data.profile;
  assert.equal(me0.title, ''); // 初期値は、なし（表示しない）
  assert.equal(me0.titles.length, 7); // ここまでに正常に送信した7ゲーム = 7個を獲得（重複なし）
  assert.equal(new Set(me0.titles).size, 7);
  assert.ok(me0.titles.every((t) => TITLES.includes(t)));

  // 未獲得の称号は設定できない／獲得済み・なしは設定できる
  const unowned = TITLES.find((t) => !me0.titles.includes(t));
  assert.equal((await call('PUT', '/account/me', { token: alice, body: { title: unowned } })).status, 400);
  assert.equal((await call('PUT', '/account/me', { token: alice, body: { title: 'でたらめな称号' } })).status, 400);
  const set = await call('PUT', '/account/me', { token: alice, body: { title: me0.titles[0] } });
  assert.equal(set.status, 200);
  assert.equal(set.data.profile.title, me0.titles[0]);

  // ランキングの自分の行に、設定した称号が出る（相手の行は、なし）
  const rk = await call('GET', '/ranking', { token: alice, query: { difficulty: 'hard', period: 'all' } });
  const mine = rk.data.rows.find((r) => r.mine);
  assert.equal(mine.title, me0.titles[0]);
  assert.ok(rk.data.rows.filter((r) => !r.mine).every((r) => r.title === ''));
  assert.ok(!JSON.stringify(rk.data).includes('alice01'));

  // 称号を「なし」に戻せる
  assert.equal((await call('PUT', '/account/me', { token: alice, body: { title: 'なし' } })).data.profile.title, '');

  // 1ゲームごとに、新しい称号が1つ増える。すべて獲得したあとは、もう増えない
  const before = (await call('GET', '/account/me', { token: alice })).data.profile.titles.length;
  const r1 = await play(alice, 'easy', 1000, 1, 0);
  assert.ok(typeof r1.data.newTitle === 'string');
  assert.equal((await call('GET', '/account/me', { token: alice })).data.profile.titles.length, before + 1);
  // スコア1000pt未満（放置プレイなど）では、称号を獲得できない
  const r0 = await play(alice, 'easy', 999, 0, 0);
  assert.equal(r0.status, 200);
  assert.equal(r0.data.newTitle, null);
  assert.equal((await call('GET', '/account/me', { token: alice })).data.profile.titles.length, before + 1);
  const acc = db._accounts.get('alice01');
  acc.titles = TITLES.slice(); // すべて獲得済みにする
  const r2 = await play(alice, 'easy', 1000, 1, 0);
  assert.equal(r2.data.newTitle, null);
  assert.equal((await call('GET', '/account/me', { token: alice })).data.profile.titles.length, TITLES.length);
});

await test('ランキングの順序：スコア高い→ビール多い→げろげろ少ない→先に出した人', async () => {
  const { sortKey, isBetter } = await import('../scores.mjs');
  const k = (pt, beers, gero, at) => sortKey(pt, beers, gero, at, 'x');
  assert.ok(k(2000, 0, 9, 5) < k(1000, 9, 0, 1)); // スコアが高いほうが上
  assert.ok(k(1000, 5, 9, 5) < k(1000, 4, 0, 1)); // 同点ならビールが多いほうが上
  assert.ok(k(1000, 5, 1, 5) < k(1000, 5, 2, 1)); // それも同じならげろげろが少ないほうが上
  assert.ok(k(1000, 5, 1, 1) < k(1000, 5, 1, 2)); // すべて同じなら先に出したほうが上
  assert.ok(isBetter({ finalPt: 1000, beers: 5, gero: 1 }, { finalPt: 1000, beers: 4, gero: 0 }));
  assert.ok(!isBetter({ finalPt: 1000, beers: 5, gero: 1 }, { finalPt: 1000, beers: 5, gero: 1 }));
});

await test('ランク：累計ビールで上がる／500pt未満は何も更新しない', async () => {
  const { rankInfo } = await import('../rank.mjs');
  assert.deepEqual(rankInfo(0), { rank: 0, into: 0, need: 5 });
  assert.equal(rankInfo(4).rank, 0);
  assert.equal(rankInfo(5).rank, 1); // 0→1は5杯
  assert.equal(rankInfo(10).rank, 1);
  assert.equal(rankInfo(11).rank, 2); // 1→2は6杯（累計11）
  assert.equal(rankInfo(18).rank, 3); // 2→3は7杯（累計18）
  assert.equal(rankInfo(5450).rank, 100); // 100まで上がるのに必要な累計
  assert.equal(rankInfo(5449).rank, 99);
  assert.equal(rankInfo(999999).rank, 100); // 最大100
  assert.equal(rankInfo(999999).need, null);
  // 499ptでは、記録・累計ビール・称号を更新しない
  const before = (await call('GET', '/account/me', { token: alice })).data.profile;
  const r = await play(alice, 'easy', 499, 3, 1);
  assert.equal(r.status, 200);
  assert.equal(r.data.skipped, true);
  const after = (await call('GET', '/account/me', { token: alice })).data.profile;
  assert.equal(after.totalBeers, before.totalBeers);
  assert.equal(after.totalGero, before.totalGero);
  assert.equal(after.titles.length, before.titles.length);
  assert.deepEqual(after.best, before.best);
  // 500ptなら更新される
  const r2 = await play(alice, 'easy', 500, 3, 1);
  assert.equal(r2.status, 200);
  assert.equal((await call('GET', '/account/me', { token: alice })).data.profile.totalBeers, before.totalBeers + 3);
});

await test('ランキングのランク：記録したときのランクを表示（あとで上がっても変わらない）', async () => {
  const acc = db._accounts.get('alice01');
  acc.totalBeers = 5; // ランク1
  await play(alice, 'hard', 250000, 3, 0); // これまでの記録より上位にする
  const rowOf = async () => (await call('GET', '/ranking', { token: alice, query: { difficulty: 'hard', period: 'all' } })).data.rows.find((r) => r.mine);
  assert.equal((await rowOf()).playerRank, 1);
  db._accounts.get('alice01').totalBeers = 500; // あとで、ランクが大きく上がっても
  assert.equal((await rowOf()).playerRank, 1); // 記録のランクは、そのまま
});

await test('ランキング：覚えている間は、DynamoDBを読み直さない', async () => {
  process.env.RANKING_CACHE_MS = '30000';
  let reads = 0;
  const orig = db.queryBoard;
  db.queryBoard = async (...a) => { reads++; return orig(...a); };
  try {
    await call('GET', '/ranking', { query: { difficulty: 'normal', period: 'all' } });
    await call('GET', '/ranking', { query: { difficulty: 'normal', period: 'all' } });
    await call('GET', '/ranking', { token: alice, query: { difficulty: 'normal', period: 'all' } });
    assert.equal(reads, 1); // 3回見ても、読むのは1回
    await play(alice, 'normal', 9000, 1, 0); // 記録を書くと、その順位表は捨てられる
    await call('GET', '/ranking', { query: { difficulty: 'normal', period: 'all' } });
    assert.equal(reads, 2);
  } finally { db.queryBoard = orig; process.env.RANKING_CACHE_MS = '0'; }
});

await test('アカウント削除：ランキングの記録も消える', async () => {
  assert.equal((await call('POST', '/account/delete', { token: alice, body: { password: 'wrong-pass' } })).status, 401);
  assert.equal((await call('POST', '/account/delete', { token: alice, body: { password: 'newpass123' } })).status, 200);
  const r = await call('GET', '/ranking', { query: { difficulty: 'hard', period: 'all' } });
  assert.deepEqual(r.data.rows.map((x) => x.nickname), ['ボブ']);
  assert.equal((await call('GET', '/account/me', { token: alice })).status, 401);
});

console.log(`\n${passed} 件のテストが成功しました`);
