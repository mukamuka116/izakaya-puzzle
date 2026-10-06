// api/index.js — 画面から使うAPI。
// VITE_API_URL が空のあいだは、ブラウザ内のダミー(mock.js)で動く。
// 公開したAPIのURLを .env に VITE_API_URL=https://xxxx.execute-api.ap-northeast-1.amazonaws.com と書くだけで本物につながる。
import { mockApi, ApiError } from './mock.js'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const isMock = !API_URL

async function call(method, path, { token, body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  let res
  try {
    res = await fetch(`${API_URL}${path}${qs}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, '通信できませんでした。電波の良いところでもう一度お試しください')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || 'エラーが起きました')
  return data
}

const real = {
  getQuestions: () => call('GET', '/account/questions'),
  register: (b) => call('POST', '/account/register', { body: b }),
  login: (b) => call('POST', '/account/login', { body: b }),
  getMe: (token) => call('GET', '/account/me', { token }),
  updateMe: (token, b) => call('PUT', '/account/me', { token, body: b }),
  changePassword: (token, b) => call('POST', '/account/password', { token, body: b }),
  deleteAccount: (token, b) => call('POST', '/account/delete', { token, body: b }),
  recoveryVerify: (b) => call('POST', '/account/recovery/verify', { body: b }),
  recoveryReset: (b) => call('POST', '/account/recovery/reset', { body: b }),
  startScore: (token, b) => call('POST', '/scores/start', { token, body: b }),
  submitScore: (token, b) => call('POST', '/scores/submit', { token, body: b }),
  getRanking: (token, q) => call('GET', '/ranking', { token, query: q }),
}

export const api = isMock ? mockApi : real
export { ApiError }
