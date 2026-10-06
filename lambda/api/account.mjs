// account.mjs — 登録・ログイン・プロフィール・パスワード再設定・削除
import { LOCK, QUESTIONS, RESET_TTL_SEC, RULES, TOKEN_TTL_SEC } from './config.mjs';
import { NONE_TITLE } from './titles.mjs';
import {
  checkLoginId, checkNickname, checkPassword, dummyVerify, hashSecret, normalizeAnswer, signToken, verifySecret, verifyToken,
} from './auth.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const unauthorized = (m = 'ログインが必要です') => new HttpError(401, m);

const now = () => Math.floor(Date.now() / 1000);

// 返してよい項目だけ（ハッシュ類は絶対に返さない）
export function publicProfile(a) {
  return {
    loginId: a.loginId, nickname: a.nickname, avatar: a.avatar, settings: a.settings ?? {},
    best: a.best ?? [], totalBeers: a.totalBeers ?? 0, totalGero: a.totalGero ?? 0, questionId: a.questionId,
    titles: a.titles ?? [], title: a.title ?? '',
  };
}

// ログインの札からアカウントを取り出す
export async function requireUser(db, authHeader) {
  const token = String(authHeader ?? '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token, 'login');
  if (!payload) throw unauthorized();
  const account = await db.getAccount(payload.sub);
  if (!account || (account.tokenVer ?? 0) !== payload.tv) throw unauthorized('ログインの有効期限が切れました');
  return account;
}

// ロック中か確認（ロック中なら 429）
function assertNotLocked(account) {
  if (account.lockUntil && account.lockUntil > now()) {
    const min = Math.ceil((account.lockUntil - now()) / 60);
    throw new HttpError(429, `失敗が続いたため、あと約${min}分ロックされています`);
  }
}
// 失敗を記録。上限に達したらロック
async function recordFail(db, account) {
  account.failCount = (account.failCount ?? 0) + 1;
  if (account.failCount >= LOCK.maxFails) {
    account.lockUntil = now() + LOCK.lockSeconds;
    account.failCount = 0;
  }
  await db.saveAccount(account);
}
async function clearFails(db, account) {
  if (account.failCount || account.lockUntil) {
    account.failCount = 0;
    account.lockUntil = 0;
    await db.saveAccount(account);
  }
}

export const getQuestions = () => ({ questions: QUESTIONS });

export async function register(db, body) {
  const { loginId, password, nickname, avatar, questionId, answer } = body ?? {};
  const e = checkLoginId(loginId) || checkPassword(password, loginId) || checkNickname(nickname);
  if (e) throw bad(e);
  if (!QUESTIONS.some((q) => q.id === questionId)) throw bad('秘密の質問を選んでください');
  const normalized = normalizeAnswer(answer);
  if (!normalized || normalized.length > RULES.answerMax) throw bad(`答えは1〜${RULES.answerMax}文字で入力してください`);

  const account = {
    loginId,
    passwordHash: await hashSecret(password),
    nickname: String(nickname).trim(),
    avatar: String(avatar ?? '1').slice(0, RULES.avatarMax),
    settings: {},
    questionId,
    answerHash: await hashSecret(normalized),
    best: [], totalBeers: 0, totalGero: 0, rankKeys: {}, titles: [], title: '',
    failCount: 0, lockUntil: 0, tokenVer: 0, createdAt: now(),
  };
  if (!(await db.createAccount(account))) throw new HttpError(409, 'このIDはすでに使われています');
  return loginResponse(account);
}

function loginResponse(account) {
  return { token: signToken('login', { sub: account.loginId, tv: account.tokenVer ?? 0 }, TOKEN_TTL_SEC), profile: publicProfile(account) };
}

export async function login(db, body) {
  const { loginId, password } = body ?? {};
  if (typeof loginId !== 'string' || typeof password !== 'string') throw bad('IDとパスワードを入力してください');
  const account = await db.getAccount(loginId);
  const generic = new HttpError(401, 'IDまたはパスワードが違います');
  if (!account) { await dummyVerify(password); throw generic; }
  assertNotLocked(account);
  if (!(await verifySecret(password, account.passwordHash))) {
    await recordFail(db, account);
    throw generic;
  }
  await clearFails(db, account);
  return loginResponse(account);
}

export async function getMe(db, auth) {
  return { profile: publicProfile(await requireUser(db, auth)) };
}

export async function updateMe(db, auth, body) {
  const { nickname, avatar, settings, title } = body ?? {};
  // 同時に更新が重なったときは、読み直してやり直す（最大3回）
  for (let attempt = 0; attempt < 3; attempt++) {
    const account = await requireUser(db, auth);
    if (nickname !== undefined) {
      const e = checkNickname(nickname);
      if (e) throw bad(e);
      account.nickname = String(nickname).trim();
    }
    if (avatar !== undefined) account.avatar = String(avatar).slice(0, RULES.avatarMax);
    if (title !== undefined) {
      if (title === '' || title === NONE_TITLE) account.title = ''
      else if ((account.titles ?? []).includes(title)) account.title = title
      else throw bad('まだ獲得していない称号です')
    }
    if (settings !== undefined) {
      if (typeof settings !== 'object' || settings === null || JSON.stringify(settings).length > 2000) throw bad('ゲーム設定が不正です');
      account.settings = settings;
    }
    if (await db.saveAccount(account)) return { profile: publicProfile(account) };
  }
  throw new HttpError(409, '更新が重なりました。もう一度お試しください');
}

export async function changePassword(db, auth, body) {
  const account = await requireUser(db, auth);
  const { oldPassword, newPassword } = body ?? {};
  assertNotLocked(account);
  if (!(await verifySecret(String(oldPassword ?? ''), account.passwordHash))) {
    await recordFail(db, account);
    throw new HttpError(401, '現在のパスワードが違います');
  }
  const e = checkPassword(newPassword, account.loginId);
  if (e) throw bad(e);
  account.passwordHash = await hashSecret(newPassword);
  account.tokenVer = (account.tokenVer ?? 0) + 1; // ほかの端末のログインは切れる
  account.failCount = 0;
  if (!(await db.saveAccount(account))) throw new HttpError(409, '更新が重なりました。もう一度お試しください');
  return loginResponse(account);
}

export async function deleteAccount(db, auth, body, deleteScores) {
  const account = await requireUser(db, auth);
  assertNotLocked(account);
  if (!(await verifySecret(String(body?.password ?? ''), account.passwordHash))) {
    await recordFail(db, account);
    throw new HttpError(401, 'パスワードが違います');
  }
  await deleteScores(account); // ランキング上の記録も消す
  await db.deleteAccount(account.loginId);
  return { deleted: true };
}

// パスワード再設定の1段階目：ID＋質問の選択＋答え。一致したら短時間有効の札を返す
export async function recoveryVerify(db, body) {
  const { loginId, questionId, answer } = body ?? {};
  if (typeof loginId !== 'string' || typeof answer !== 'string') throw bad('IDと答えを入力してください');
  const generic = new HttpError(401, 'IDまたは質問・答えが一致しません');
  const account = await db.getAccount(loginId);
  if (!account) { await dummyVerify(answer); throw generic; }
  assertNotLocked(account);
  const questionOk = account.questionId === questionId;
  const answerOk = await verifySecret(normalizeAnswer(answer), account.answerHash);
  if (!questionOk || !answerOk) {
    await recordFail(db, account);
    throw generic;
  }
  await clearFails(db, account);
  // 札に tokenVer を入れ、再設定が済んだら同じ札を使えなくする
  return { resetToken: signToken('reset', { sub: account.loginId, tv: account.tokenVer ?? 0 }, RESET_TTL_SEC) };
}

// 2段階目：新しいパスワードを設定
export async function recoveryReset(db, body) {
  const { resetToken, newPassword } = body ?? {};
  const payload = verifyToken(resetToken, 'reset');
  if (!payload) throw new HttpError(401, '有効期限が切れました。最初からやり直してください');
  const account = await db.getAccount(payload.sub);
  if (!account || (account.tokenVer ?? 0) !== payload.tv) throw new HttpError(401, '有効期限が切れました。最初からやり直してください');
  const e = checkPassword(newPassword, account.loginId);
  if (e) throw bad(e);
  account.passwordHash = await hashSecret(newPassword);
  account.tokenVer = (account.tokenVer ?? 0) + 1;
  account.failCount = 0;
  account.lockUntil = 0;
  if (!(await db.saveAccount(account))) throw new HttpError(409, '更新が重なりました。もう一度お試しください');
  return loginResponse(account);
}
