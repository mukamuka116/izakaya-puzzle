// index.mjs — puzzleBeersApi（アカウント・スコア・ランキング）。API Gateway(HTTP API) から呼ばれる入口
import { getDb } from './db.mjs';
import * as account from './account.mjs';
import * as scores from './scores.mjs';

// 許可するアクセス元（ALLOW_ORIGIN に、カンマ区切りで複数書ける。"*" なら全許可）
const ALLOWED = (process.env.ALLOW_ORIGIN || '*').split(',').map((v) => v.trim()).filter(Boolean);
const corsHeaders = (event) => {
  const origin = event?.headers?.origin ?? event?.headers?.Origin;
  const allow = ALLOWED.includes('*') ? '*' : (ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    Vary: 'Origin',
  };
};
// テストではメモリ上のDBを渡して使う。本番の handler は DynamoDB を使う
// （Lambda は2つ目の引数に実行情報(context)を渡してくるので、DBは引数で受け取らない）
export const makeHandler = (injectedDb) => async (event) => {
  const headers = corsHeaders(event)
  const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  const path = (event.rawPath ?? event.path ?? '').replace(/\/+$/, '');
  if (method === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { return reply(400, { error: '不正なリクエストです' }); }
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  const query = event.queryStringParameters ?? {};

  try {
    const db = injectedDb ?? (await getDb());
    const route = `${method} ${path}`;
    switch (route) {
      case 'GET /account/questions': return reply(200, account.getQuestions());
      case 'POST /account/register': return reply(200, await account.register(db, body));
      case 'POST /account/login': return reply(200, await account.login(db, body));
      case 'POST /account/recovery/verify': return reply(200, await account.recoveryVerify(db, body));
      case 'POST /account/recovery/reset': return reply(200, await account.recoveryReset(db, body));
      case 'GET /account/me': return reply(200, await account.getMe(db, auth));
      case 'PUT /account/me': { const r = await account.updateMe(db, auth, body); scores.clearRankingCache(); return reply(200, r); }
      case 'POST /account/password': return reply(200, await account.changePassword(db, auth, body));
      case 'POST /account/delete':
        return reply(200, await account.deleteAccount(db, auth, body, (a) => scores.deleteUserScores(db, a)));
      case 'POST /scores/start': return reply(200, scores.startGame(await account.requireUser(db, auth), body));
      case 'POST /scores/submit': return reply(200, await scores.submitScore(db, await account.requireUser(db, auth), body));
      case 'GET /ranking': {
        // ログインしていれば「自分の行」「あなたの順位」を付ける。未ログインでも見られる
        let user = null;
        if (auth) { try { user = await account.requireUser(db, auth); } catch { user = null; } }
        return reply(200, await scores.getRanking(db, user, query));
      }
      default: return reply(404, { error: 'not found' });
    }
  } catch (e) {
    if (e instanceof account.HttpError) return reply(e.status, { error: e.message });
    console.error('予期しないエラー:', e);
    return reply(500, { error: 'サーバーでエラーが起きました' });
  }
};

export const handler = makeHandler();
