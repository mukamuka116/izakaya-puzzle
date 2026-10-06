// mock.js — APIを公開する前の画面確認用。ブラウザ内（localStorage）にダミーのアカウントと記録を持つ。
// 本物のAPI（lambda/api）と同じ形で返す。パスワードなどは確認用なので、ここでは平文（本物はハッシュ化）。

import { TITLES } from '../titles.js'
import { TITLE_MIN_PT } from '../constants'
import { rankInfo } from '../rank'

const KEY = 'pb_mock_db';
const QUESTIONS = [
  { id: 1, text: '小学校のときの担任の名字は？' },
  { id: 2, text: '子どもの頃のあだ名は？' },
  { id: 3, text: '初めて飼ったペットの名前は？' },
  { id: 4, text: '子どもの頃の好きだった食べ物は？' },
  { id: 5, text: '初めて行った旅行先は？' },
  { id: 6, text: '一番好きなゲームのタイトルは？' },
  { id: 7, text: '母親の旧姓は？' },
  { id: 8, text: '生まれた街の名前は？' },
];
const MULT = { easy: 0.8, normal: 1.2, hard: 2.0 };

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const normalize = (t) => String(t ?? '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 順位表が空にならないよう、最初にダミーの記録を入れておく
function seed() {
  const names = ['たこ焼き', 'ビール党', 'ゆうこ', 'ハイボール', '枝豆マン', 'ポテト', 'さけ好き', 'ミーコ', '焼き鳥', '二日酔い', 'ナナ', 'りょう', '串カツ', 'ほろよい', 'ケンタ'];
  const entries = [];
  names.forEach((nickname, i) => {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const raw = Math.round((30000 - i * 1400) * (0.7 + Math.random() * 0.5) / 10) * 10;
      entries.push({
        nickname, difficulty, rawPt: raw, finalPt: Math.round(raw * MULT[difficulty]),
        title: i % 3 === 0 ? TITLES[(i * 7) % TITLES.length].name : '', beers: 3 + ((i * 7 + 1) % 9), gero: (i * 3) % 5, at: Date.now() - i * 3600 * 1000 * (difficulty === 'hard' ? 7 : 20), owner: `seed${i}`,
      });
    }
  });
  return { accounts: {}, entries };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 読めないときは作り直す */ }
  const db = seed();
  save(db);
  return db;
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 保存できなくても動かす */ }
}

function profile(a) {
  return { loginId: a.loginId, nickname: a.nickname, avatar: a.avatar, settings: a.settings ?? {}, best: a.best ?? [], totalBeers: a.totalBeers ?? 0, totalGero: a.totalGero ?? 0, questionId: a.questionId, titles: a.titles ?? [], title: a.title ?? '' };
}
const tokenOf = (a) => `mock:${a.loginId}`;
function userOf(db, token) {
  const id = String(token ?? '').replace(/^mock:/, '');
  const a = db.accounts[id];
  if (!a || !String(token).startsWith('mock:')) throw new ApiError(401, 'ログインが必要です');
  return a;
}
const wait = (v) => new Promise((r) => setTimeout(() => r(v), 150));

function checkId(id) { return /^[A-Za-z0-9_]{4,16}$/.test(id ?? '') ? null : 'IDは半角英数と「_」の4〜16文字で入力してください'; }
function checkPw(pw, id) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 32) return 'パスワードは8〜32文字で入力してください';
  if (pw === id) return 'パスワードはIDと同じにできません';
  return null;
}
function checkNick(n) { const t = String(n ?? '').trim(); return !t || t.length > 10 ? 'ニックネームは1〜10文字で入力してください' : null; }

export const mockApi = {
  async getQuestions() { return wait({ questions: QUESTIONS }); },

  async register(b) {
    const db = load();
    const e = checkId(b.loginId) || checkPw(b.password, b.loginId) || checkNick(b.nickname);
    if (e) throw new ApiError(400, e);
    if (!QUESTIONS.some((q) => q.id === b.questionId)) throw new ApiError(400, '秘密の質問を選んでください');
    if (!normalize(b.answer)) throw new ApiError(400, '答えを入力してください');
    if (db.accounts[b.loginId]) throw new ApiError(409, 'このIDはすでに使われています');
    const a = {
      loginId: b.loginId, password: b.password, nickname: b.nickname.trim(), avatar: b.avatar ?? '1', settings: {},
      questionId: b.questionId, answer: normalize(b.answer), best: [], totalBeers: 0, totalGero: 0, titles: [], title: '', fails: 0, lockUntil: 0,
    };
    db.accounts[a.loginId] = a;
    save(db);
    return wait({ token: tokenOf(a), profile: profile(a) });
  },

  async login(b) {
    const db = load();
    const a = db.accounts[b.loginId];
    if (a?.lockUntil > Date.now()) throw new ApiError(429, '失敗が続いたため、しばらくロックされています');
    if (!a || a.password !== b.password) {
      if (a && ++a.fails >= 10) { a.lockUntil = Date.now() + 10 * 60 * 1000; a.fails = 0; }
      save(db);
      throw new ApiError(401, 'IDまたはパスワードが違います');
    }
    a.fails = 0; save(db);
    return wait({ token: tokenOf(a), profile: profile(a) });
  },

  async getMe(token) { return wait({ profile: profile(userOf(load(), token)) }); },

  async updateMe(token, b) {
    const db = load();
    const a = userOf(db, token);
    if (b.nickname !== undefined) { const e = checkNick(b.nickname); if (e) throw new ApiError(400, e); a.nickname = b.nickname.trim(); }
    if (b.avatar !== undefined) a.avatar = String(b.avatar);
    if (b.title !== undefined) {
      if (b.title === '' || b.title === 'なし') a.title = ''
      else if ((a.titles ?? []).includes(b.title)) a.title = b.title
      else throw new ApiError(400, 'まだ獲得していない称号です')
    }
    if (b.settings !== undefined) a.settings = b.settings;
    save(db);
    return wait({ profile: profile(a) });
  },

  async changePassword(token, b) {
    const db = load();
    const a = userOf(db, token);
    if (a.password !== b.oldPassword) throw new ApiError(401, '現在のパスワードが違います');
    const e = checkPw(b.newPassword, a.loginId);
    if (e) throw new ApiError(400, e);
    a.password = b.newPassword; save(db);
    return wait({ token: tokenOf(a), profile: profile(a) });
  },

  async deleteAccount(token, b) {
    const db = load();
    const a = userOf(db, token);
    if (a.password !== b.password) throw new ApiError(401, 'パスワードが違います');
    delete db.accounts[a.loginId];
    db.entries = db.entries.filter((x) => x.owner !== a.loginId);
    save(db);
    return wait({ deleted: true });
  },

  async recoveryVerify(b) {
    const db = load();
    const a = db.accounts[b.loginId];
    if (a?.lockUntil > Date.now()) throw new ApiError(429, '失敗が続いたため、しばらくロックされています');
    if (!a || a.questionId !== b.questionId || a.answer !== normalize(b.answer)) {
      if (a && ++a.fails >= 10) { a.lockUntil = Date.now() + 10 * 60 * 1000; a.fails = 0; }
      save(db);
      throw new ApiError(401, 'IDまたは質問・答えが一致しません');
    }
    a.fails = 0; save(db);
    return wait({ resetToken: `mockreset:${a.loginId}` });
  },

  async recoveryReset(b) {
    const db = load();
    const id = String(b.resetToken ?? '').replace(/^mockreset:/, '');
    const a = db.accounts[id];
    if (!a || !String(b.resetToken).startsWith('mockreset:')) throw new ApiError(401, '有効期限が切れました。最初からやり直してください');
    const e = checkPw(b.newPassword, a.loginId);
    if (e) throw new ApiError(400, e);
    a.password = b.newPassword; save(db);
    return wait({ token: tokenOf(a), profile: profile(a) });
  },

  async startScore(token, b) {
    userOf(load(), token);
    return wait({ startToken: `mockstart:${b.difficulty}:${Date.now()}` });
  },

  async submitScore(token, b) {
    const db = load();
    const a = userOf(db, token);
    const difficulty = String(b.startToken ?? '').split(':')[1];
    if (!MULT[difficulty]) throw new ApiError(400, 'ゲームの開始情報が無効です');
    const entry = { finalPt: b.finalPt, rawPt: b.rawPt, difficulty, beers: b.beers, gero: b.gero, at: Date.now(), playRank: rankInfo(a.totalBeers).rank };
    a.best = [...a.best, entry].sort((x, y) => y.finalPt - x.finalPt || y.beers - x.beers || x.gero - y.gero).slice(0, 5);
    a.totalBeers += b.beers; a.totalGero += b.gero;
    // 新しい称号：まだ持っていない中から1つ（すべて持っていれば、なし）
    a.titles ??= []
    const unowned = b.rawPt >= TITLE_MIN_PT ? TITLES.filter((t) => !a.titles.includes(t.name)) : [] // スコアが足りないと獲得できない
    const newTitle = unowned.length ? unowned[Math.floor(Math.random() * unowned.length)].name : null
    if (newTitle) a.titles.push(newTitle)
    db.entries.push({ ...entry, nickname: a.nickname, owner: a.loginId });
    save(db);
    const rank = (scope, period) => rankList(db, a, scope, period).findIndex((r) => r.mine) + 1;
    return wait({
      best: a.best, totalBeers: a.totalBeers, totalGero: a.totalGero, newTitle,
      ranks: { [`all#${difficulty}`]: rank(difficulty, 'all'), 'all#any': rank('any', 'all'), [`today#${difficulty}`]: rank(difficulty, 'today'), 'today#any': rank('any', 'today') },
    });
  },

  async getRanking(token, q) {
    const db = load();
    let user = null;
    try { user = token ? userOf(db, token) : null; } catch { user = null; }
    const scope = q?.difficulty ?? 'any';
    const period = q?.period ?? 'all';
    if (!['easy', 'normal', 'hard', 'any'].includes(scope) || !['all', 'today'].includes(period)) throw new ApiError(400, 'ランキングの種類が不正です');
    const all = rankList(db, user, scope, period);
    const rows = all.slice(0, 100);
    const idx = all.findIndex((r) => r.mine);
    const me = idx >= 0 ? { ...all[idx], rank: idx + 1, outside: idx >= 100 } : null;
    return wait({ board: `${period}#${scope}`, limit: 100, rows, me });
  },
};

// 1人につき、その種類のランキングでのベストだけを並べる（IDは含めない）
function rankList(db, user, scope, period) {
  const t = today();
  const best = new Map();
  for (const e of db.entries) {
    if (scope !== 'any' && e.difficulty !== scope) continue;
    if (period === 'today' && new Date(e.at + 9 * 3600 * 1000).toISOString().slice(0, 10) !== t) continue;
    const cur = best.get(e.owner);
    if (!cur || e.finalPt > cur.finalPt || (e.finalPt === cur.finalPt && (e.beers > cur.beers || (e.beers === cur.beers && e.gero < cur.gero)))) best.set(e.owner, e);
  }
  return [...best.values()].sort((a, b) => b.finalPt - a.finalPt || b.beers - a.beers || a.gero - b.gero || a.at - b.at).map((e, i) => ({
    rank: i + 1, nickname: db.accounts[e.owner]?.nickname ?? e.nickname, avatar: '1', title: db.accounts[e.owner] ? (db.accounts[e.owner].title ?? '') : (e.title ?? ''), playerRank: e.playRank ?? rankInfo(db.accounts[e.owner]?.totalBeers ?? (e.beers ?? 0) * 3).rank,
    finalPt: e.finalPt, rawPt: e.rawPt, difficulty: e.difficulty, beers: e.beers, gero: e.gero, at: e.at, mine: !!user && e.owner === user.loginId,
  }));
}

export { ApiError };
