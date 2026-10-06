// auth.mjs — パスワードのハッシュ化、署名付きの札（トークン）、入力チェック
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { RULES } from './config.mjs';

const SECRET = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET が設定されていません');
  return s;
};

const scryptAsync = (plain, salt) =>
  new Promise((resolve, reject) => scrypt(plain, salt, 64, (e, key) => (e ? reject(e) : resolve(key))));

// パスワードや秘密の答え → "scrypt$塩$ハッシュ"（ユーザーごとに塩が違う）
export async function hashSecret(plain) {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifySecret(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(plain, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// 存在しないIDでも、同じ時間をかけて照合し、IDの有無を時間差で悟られないようにする
let dummyHash;
export async function dummyVerify(plain) {
  dummyHash ??= await hashSecret('dummy-password-for-timing');
  await verifySecret(plain, dummyHash);
}

// 秘密の答えの正規化：全角半角（NFKC）・大文字小文字・カタカナ→ひらがな・空白除去をそろえる
export function normalizeAnswer(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

// ---- 署名付きの札（JWTに近い軽い形式）----
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (body) => createHmac('sha256', SECRET()).update(body).digest('base64url');

// type: 'login' | 'reset' | 'start' など。用途違いの札を使い回せないようにする
export function signToken(type, data, ttlSec) {
  const body = b64u(JSON.stringify({ t: type, exp: Math.floor(Date.now() / 1000) + ttlSec, ...data }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token, type) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')); } catch { return null; }
  if (payload.t !== type || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ---- 入力チェック（エラー文字列 or null）----
export function checkLoginId(id) {
  return typeof id === 'string' && RULES.loginId.test(id) ? null : 'IDは半角英数と「_」の4〜16文字で入力してください';
}
export function checkPassword(pw, loginId) {
  if (typeof pw !== 'string' || pw.length < RULES.passwordMin || pw.length > RULES.passwordMax) {
    return `パスワードは${RULES.passwordMin}〜${RULES.passwordMax}文字で入力してください`;
  }
  if (loginId && pw === loginId) return 'パスワードはIDと同じにできません';
  return null;
}
export function checkNickname(name) {
  const t = String(name ?? '').trim();
  if (!t || t.length > RULES.nicknameMax) return `ニックネームは1〜${RULES.nicknameMax}文字で入力してください`;
  return null;
}
