import { useState } from 'react'
import ManualOverlay from './ManualOverlay'
import { useAuth } from '../auth'

// ハンバーガーメニューの項目。アカウントの中身は、ログイン状態で変わる
const accountItems = (user) => (user
  ? [
    { id: 'edit', label: 'アカウント編集・削除', icon: 'information/アカウント設定' },
    { id: 'logout', label: 'ログアウト', icon: 'information/ログアウト' },
  ]
  : [
    { id: 'signup', label: 'アカウント作成', icon: 'information/サインアップ' },
    { id: 'login', label: 'ログイン', icon: 'information/ログイン' },
  ])
const menuOf = (user) => [
  { id: 'manual', label: 'マニュアル', icon: 'information/マニュアル' },
  { id: 'ranking', label: 'ランキング・My統計', icon: 'ranking/金' },
  { id: 'account', label: 'アカウント関連', icon: 'information/アカウント', children: accountItems(user) },
  { id: 'settings', label: 'ゲーム設定', icon: 'information/設定' },
]
const Icon = ({ name }) => <img src={`/images/icon/${name}.png`} alt="" className="menu-icon" />

// 木目板のヘッダー。menu=true のときだけハンバーガーメニューを出す（ゲーム中は隠す）
export default function Header({ menu = true, pause = false, onPause, pauseDisabled = false }) {
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const { user, openPanel } = useAuth()

  const pick = (id) => {
    setOpen(false)
    if (id === 'manual') setManual(true)
    else openPanel(id)
  }

  return (
    <>
      <header className="app-header">
        <img src="/images/タイトルロゴ.png" alt="Puzzle & Beers" className="header-logo" />
        {pause && (
          <button className="burger pause" aria-label="中断" disabled={pauseDisabled} onClick={onPause}>
            <div className="bars"><i /><i /></div>
            <em>中断</em>
          </button>
        )}
        {menu && (
          <button className={`burger${open ? ' open' : ''}`} aria-label="メニュー" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span /><span /><span />
            <em>menu</em>
          </button>
        )}
      </header>

      {menu && open && (
        <div className="menu-back drawer" onClick={() => setOpen(false)}>
          <nav className="menu" onClick={(e) => e.stopPropagation()}>
            {menuOf(user).map((m) => (
              <div key={m.id} className="menu-group">
                {m.children ? (
                  <>
                    <div className="menu-head"><Icon name={m.icon} />{m.label}</div>
                    {m.children.map((c) => (
                      <button key={c.id} className="menu-item sub" onClick={() => pick(c.id)}><Icon name={c.icon} />{c.label}</button>
                    ))}
                  </>
                ) : (
                  <button className="menu-item" onClick={() => pick(m.id)}><Icon name={m.icon} />{m.label}</button>
                )}
              </div>
            ))}
          </nav>
        </div>
      )}

      {manual && <ManualOverlay onClose={() => setManual(false)} />}
    </>
  )
}
