// auth.jsx — ログイン状態と、開いているパネル（ログイン・ランキングなど）を全体で共有する
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, clearRankingCache } from './api'
import { setSettings } from './settings'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const TOKEN_KEY = 'pb_token'
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
const writeToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* 保存できなくても動かす */ } }

// アカウントに保存してあるゲーム設定があれば、この端末に反映する
const applyAccountSettings = (profile) => {
  if (profile?.settings && Object.keys(profile.settings).length) setSettings(profile.settings)
}

// お邪魔キャラの変更はログインが必要なので、ログインしていないときは「虫」に戻す
const resetPest = () => setSettings({ pest: 'bug' })

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null) // ログイン中のプロフィール（未ログインは null）
  const [panel, setPanel] = useState(null) // 開いているパネルのID
  const [focus, setFocus] = useState(null) // パネルを開いた目的（'pest'＝お邪魔キャラの設定へ）
  const openPanel = useCallback((id, f = null) => { setPanel(id); setFocus(f) }, [])

  // 起動時：保存してある札があれば、プロフィールを取り直す
  useEffect(() => {
    if (!token) { resetPest(); return }
    api.getMe(token).then((r) => { setUser(r.profile); applyAccountSettings(r.profile) }).catch(() => { writeToken(null); setToken(null); setUser(null); resetPest() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = useCallback((res) => { writeToken(res.token); setToken(res.token); setUser(res.profile); applyAccountSettings(res.profile) }, [])
  const signOut = useCallback(() => { writeToken(null); setToken(null); setUser(null); resetPest(); clearRankingCache() }, [])
  const setProfile = useCallback((profile) => { if (profile) setUser(profile) }, []) // サーバーが返した最新のプロフィールで、そのまま差しかえる（取り直さない）
  const refresh = useCallback(async () => {
    if (!token) return
    const r = await api.getMe(token)
    setUser(r.profile)
  }, [token])

  const value = { user, token, signIn, signOut, refresh, setProfile, panel, focus, openPanel, closePanel: () => { setPanel(null); setFocus(null) } }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
