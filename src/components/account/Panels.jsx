// Panels.jsx — ログイン・登録・パスワード再設定・アカウント編集・ログアウト・ランキング・ゲーム設定の各パネル
import { useEffect, useRef, useState } from 'react'
import { api, isMock } from '../../api'
import { useAuth } from '../../auth'
import { playSound } from '../../sound'
import { getSettings, resetSettings, setSettings, sfxVolume, useSettings } from '../../settings'
import Digits from '../Digits'
import { rankInfo } from '../../rank'
import { getLastPlayAt } from '../../lastPlay'
import { listTitles, NONE_TITLE } from '../../titles'

const CROWN = { 1: '金', 2: '銀', 3: '銅' } // 1〜3位の王冠（Takoyaki Cascade と同じ画像）
const RankMark = ({ rank }) => (CROWN[rank]
  ? <img src={`/images/icon/ranking/${CROWN[rank]}.png`} alt={`${rank}位`} className="crown" />
  : rank)
// 称号の選択：獲得済みを上に、未獲得を半透明で下に（それぞれ五十音順）。未獲得は選べない
function TitleSelect({ owned, value, onChange }) {
  const [open, setOpen] = useState(false)
  const items = listTitles(owned)
  const shown = value || NONE_TITLE
  const got = items.filter((t) => t.owned && t.name !== NONE_TITLE).length
  return (
    <div className="title-select">
      <button type="button" className="title-current" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{shown}</span><i>{open ? '▲' : '▼'}</i>
      </button>
      {open && (
        <ul className="title-list" role="listbox">
          {items.map((t) => (
            <li key={t.name} role="option" aria-selected={t.name === shown} aria-disabled={!t.owned}
              className={`title-item${t.owned ? '' : ' locked'}${t.name === shown ? ' sel' : ''}`}
              onClick={() => { if (t.owned) { onChange(t.name === NONE_TITLE ? '' : t.name); setOpen(false) } }}>
              {t.name}
            </li>
          ))}
        </ul>
      )}
      <small className="field-hint">獲得した称号：{got} / {items.length - 1}</small>
    </div>
  )
}

// 日付は小さく2行（上: YYYY、下: MM/DD）
const DateCell = ({ at }) => {
  if (!at) return <td className="date" />
  const d = new Date(at)
  return (
    <td className="date">
      <span>{d.getFullYear()}</span>
      <span>{String(d.getMonth() + 1).padStart(2, '0')}/{String(d.getDate()).padStart(2, '0')}</span>
    </td>
  )
}
const DIFF_JA = { easy: 'しらふ', normal: 'ほろ酔い', hard: '泥酔', any: 'すべて' }

// 共通の枠（外側を押す／✕で閉じる）
function Sheet({ title, onClose, children, wide, big, pulse }) {
  return (
    <div className="menu-back center" onClick={onClose}>
      <div className={`sheet${wide ? ' wide' : ''}${big ? ' big' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className={`manual-close sheet-close${pulse ? ' pulse' : ''}`} onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

const useBusy = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e.message || 'エラーが起きました') } finally { setBusy(false) }
  }
  return { busy, error, setError, run }
}

const Note = () => isMock && <p className="mock-note">※ いまは確認用のダミーです（このブラウザの中だけで動きます）</p>

// ---------------- ログイン ----------------
function LoginPanel() {
  const { signIn, closePanel, openPanel, focus } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useBusy()
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      signIn(await api.login({ loginId, password }))
      if (focus === 'pest') openPanel('edit', 'pest') // お邪魔キャラの設定から来たときは、そのまま設定へ
      else closePanel()
    })
  }
  return (
    <Sheet title="ログイン" onClose={closePanel}>
      {focus === 'pest' && <p className="login-need">この設定を変更するには<br />ログインが必要です</p>}
      <form onSubmit={submit}>
        <Field label="ID"><input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" /></Field>
        <Field label="パスワード"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn small" disabled={busy}>ログイン</button>
      </form>
      <div className="sheet-links">
        <button onClick={() => openPanel('recovery')}>パスワードを忘れた</button>
        <button onClick={() => openPanel('signup')}>アカウント作成</button>
      </div>
      <Note />
    </Sheet>
  )
}

// ---------------- アカウント作成 ----------------
function SignupPanel() {
  const { signIn, closePanel, openPanel } = useAuth()
  const [questions, setQuestions] = useState([])
  const [f, setF] = useState({ loginId: '', password: '', password2: '', nickname: '', questionId: 1, answer: '' })
  const { busy, error, setError, run } = useBusy()
  useEffect(() => { api.getQuestions().then((r) => setQuestions(r.questions)).catch(() => {}) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    if (f.password !== f.password2) { setError('パスワードが一致しません'); return }
    run(async () => {
      signIn(await api.register({ loginId: f.loginId, password: f.password, nickname: f.nickname, avatar: '1', questionId: Number(f.questionId), answer: f.answer }))
      closePanel()
    })
  }
  return (
    <Sheet title="アカウント作成" onClose={closePanel}>
      <form onSubmit={submit}>
        <Field label="ID" hint="半角英数と「_」の4〜16文字"><input value={f.loginId} onChange={set('loginId')} autoCapitalize="none" autoComplete="username" /></Field>
        <Field label="パスワード" hint="8〜32文字（IDと同じは不可）"><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="パスワード（確認）"><input type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" /></Field>
        <Field label="ニックネーム" hint="10文字以内。ランキングにはこの名前が出ます"><input value={f.nickname} onChange={set('nickname')} maxLength={10} /></Field>
        <Field label="パスワードを忘れたときの質問">
          <select value={f.questionId} onChange={set('questionId')}>
            {questions.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
          </select>
        </Field>
        <Field label="質問の答え"><input value={f.answer} onChange={set('answer')} maxLength={40} /></Field>
        <p className="warn">※ メールアドレスなどの個人情報は使いません。そのため、IDやパスワード・質問の答えをすべて忘れると、復旧できません。</p>
        {error && <p className="form-error">{error}</p>}
        <button className="btn small" disabled={busy}>登録する</button>
      </form>
      <div className="sheet-links"><button onClick={() => openPanel('login')}>ログインはこちら</button></div>
      <Note />
    </Sheet>
  )
}

// ---------------- パスワード再設定 ----------------
function RecoveryPanel() {
  const { signIn, closePanel, openPanel } = useAuth()
  const [questions, setQuestions] = useState([])
  const [step, setStep] = useState(1)
  const [f, setF] = useState({ loginId: '', questionId: 1, answer: '', password: '', password2: '' })
  const [resetToken, setResetToken] = useState('')
  const { busy, error, setError, run } = useBusy()
  useEffect(() => { api.getQuestions().then((r) => setQuestions(r.questions)).catch(() => {}) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const verify = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await api.recoveryVerify({ loginId: f.loginId, questionId: Number(f.questionId), answer: f.answer })
      setResetToken(r.resetToken); setStep(2)
    })
  }
  const reset = (e) => {
    e.preventDefault()
    if (f.password !== f.password2) { setError('パスワードが一致しません'); return }
    run(async () => { signIn(await api.recoveryReset({ resetToken, newPassword: f.password })); closePanel() })
  }
  return (
    <Sheet title="パスワードの再設定" onClose={closePanel}>
      {step === 1 ? (
        <form onSubmit={verify}>
          <p className="sheet-text">IDと、登録のときに選んだ質問・答えを入力してください。両方が一致すると、新しいパスワードを入力できます。</p>
          <Field label="ID"><input value={f.loginId} onChange={set('loginId')} autoCapitalize="none" /></Field>
          <Field label="登録のときに選んだ質問">
            <select value={f.questionId} onChange={set('questionId')}>
              {questions.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
            </select>
          </Field>
          <Field label="答え"><input value={f.answer} onChange={set('answer')} /></Field>
          {error && <p className="form-error">{error}</p>}
          <button className="btn small" disabled={busy}>確認する</button>
        </form>
      ) : (
        <form onSubmit={reset}>
          <p className="sheet-text">確認できました。新しいパスワードを入力してください。</p>
          <Field label="新しいパスワード" hint="8〜32文字（IDと同じは不可）"><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
          <Field label="新しいパスワード（確認）"><input type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" /></Field>
          {error && <p className="form-error">{error}</p>}
          <button className="btn small" disabled={busy}>パスワードを変更する</button>
        </form>
      )}
      <div className="inline center back-row"><button className="btn cancel small" onClick={() => openPanel('login')}>ログインへ戻る</button></div>
      <Note />
    </Sheet>
  )
}

// ---------------- アカウント編集（削除） ----------------
function EditPanel() {
  const { user, token, signIn, signOut, refresh, closePanel, focus } = useAuth()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' })
  const [delPw, setDelPw] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [msg, setMsg] = useState('')
  const [where, setWhere] = useState('') // 結果メッセージを出す場所（nick / title / pw / del）
  const [title, setTitle] = useState(user?.title ?? '')
  const { busy, error, run: runBusy } = useBusy()
  const pestRef = useRef(null)
  useEffect(() => {
    if (focus === 'pest') setTimeout(() => pestRef.current?.scrollIntoView({ block: 'start' }), 50) // お邪魔キャラの項目まで自動でスライド
  }, [])
  const { pest } = useSettings()
  if (!user) return null
  const run = (key, fn) => { setWhere(key); setMsg(''); return runBusy(fn) }
  const Result = ({ k }) => where === k && (
    <>
      {msg && <p className="form-ok center-text result-ok">{msg}</p>}
      {error && <p className="form-error center-text">{error}</p>}
    </>
  )

  const saveNick = () => run('nick', async () => { await api.updateMe(token, { nickname }); await refresh(); setMsg('ニックネームを変更しました') })
  const saveTitle = (next) => run('title', async () => {
    setTitle(next)
    try { await api.updateMe(token, { title: next }); await refresh(); setMsg('称号を変更しました') }
    catch (e) { setTitle(user.title ?? ''); throw e } // 失敗したら、選択を元に戻す
  })
  const savePest = (next) => run('pest', async () => {
    const prev = getSettings().pest
    setSettings({ pest: next })
    try { await api.updateMe(token, { settings: getSettings() }); setMsg('お邪魔キャラを変更しました') }
    catch (e) { setSettings({ pest: prev }); throw e } // 失敗したら、選択を元に戻す
  })
  const savePw = () => run('pw', async () => {
    signIn(await api.changePassword(token, pw)); setPw({ oldPassword: '', newPassword: '' }); setMsg('パスワードを変更しました')
  })
  const del = () => run('del', async () => { await api.deleteAccount(token, { password: delPw }); signOut(); closePanel() })

  return (
    <Sheet title={<><img src="/images/icon/information/アカウント設定.png" alt="" className="set-icon" /> アカウント編集</>} onClose={closePanel} wide pulse={!!msg && !error}>
      <div className="stat-box"><div>ID：<b>{user.loginId}</b></div></div>

      <h3 className="sec"><img src="/images/icon/information/アカウント.png" alt="" className="set-icon" /> ニックネーム</h3>
      <Field label="新しいニックネーム"><input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={10} /></Field>
      <button className="btn small" onClick={saveNick} disabled={busy}>変更</button>
      <Result k="nick" />

      <h3 className="sec"><img src="/images/icon/information/称号.png" alt="" className="set-icon" /> 称号変更</h3>
      <TitleSelect owned={user.titles} value={title} onChange={saveTitle} />
      <Result k="title" />

      <h3 className="sec" ref={pestRef}><img src="/images/icon/information/お邪魔.png" alt="" className="set-icon" /> お邪魔キャラの変更</h3>
      <p className="sheet-text">虫が苦手な人向けの設定です。初期は虫（ハエ・ゴキブリ）です。</p>
      <div className="toggle-row">
        <button className={`toggle-btn${pest === 'bug' ? ' active' : ''}`} onClick={() => savePest('bug')} disabled={busy}>虫</button>
        <button className={`toggle-btn${pest === 'mouse' ? ' active' : ''}`} onClick={() => savePest('mouse')} disabled={busy}>ねずみ</button>
      </div>
      <Result k="pest" />

      <h3 className="sec"><img src="/images/icon/information/鍵.png" alt="" className="set-icon" /> パスワードの変更</h3>
      <Field label="現在のパスワード"><input type="password" value={pw.oldPassword} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })} autoComplete="current-password" /></Field>
      <Field label="新しいパスワード"><input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
      <button className="btn small" onClick={savePw} disabled={busy}>パスワードを変更</button>
      <Result k="pw" />

      <h3 className="sec danger"><img src="/images/icon/information/ゴミ箱.png" alt="" className="set-icon" /> アカウントの削除</h3>
      {!confirmDel ? (
        <button className="btn small" onClick={() => setConfirmDel(true)}>アカウントを削除する</button>
      ) : (
        <div>
          <p className="warn">削除すると、記録もランキングから消え、元に戻せません。パスワードを入力してください。</p>
          <Field label="パスワード"><input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></Field>
          <div className="inline center">
            <button className="btn cancel small" onClick={() => setConfirmDel(false)}>やめる</button>
            <button className="btn small" onClick={del} disabled={busy}>削除する</button>
          </div>
          <Result k="del" />
        </div>
      )}
      <Note />
    </Sheet>
  )
}

// ---------------- ログアウト ----------------
function LogoutPanel() {
  const { signOut, closePanel } = useAuth()
  return (
    <Sheet title="ログアウト" onClose={closePanel}>
      <p className="sheet-text">ログアウトしますか？</p>
      <div className="inline center">
        <button className="btn cancel small" onClick={closePanel}>やめる</button>
        <button className="btn small" onClick={() => { signOut(); closePanel() }}>ログアウト</button>
      </div>
    </Sheet>
  )
}

// ---------------- ランキング ----------------
// 各ランキングには、1人につきベスト1件だけが載る（本日なら、その日のベストだけ）
function RankRow({ r, showDiff, showRank }) {
  return (
    <tr className={r.mine ? 'mine' : ''}>
      <td className="rank"><RankMark rank={r.rank} /></td>
      <td className="name">
        {/* 称号とランクを、5秒ごとに切りかえて表示（称号がなければ、ランクだけ） */}
        {(r.title || r.playerRank !== undefined) && <small className="title-tag">{r.title && !(showRank && r.playerRank !== undefined) ? r.title : `ランク ${r.playerRank}`}</small>}
        <span>{r.nickname}</span>
      </td>
      <td className="num">
        {showDiff && <small className={`diff-tag ${r.difficulty}`}>{DIFF_JA[r.difficulty]}</small>}
        {r.finalPt.toLocaleString()}<small>pt</small>
      </td>
      <td className="num">{r.beers}</td>
      <td className="num">{r.gero}</td>
      <DateCell at={r.at} />
    </tr>
  )
}

const RankHead = () => (
  <thead>
    <tr>
      <th>順位</th><th>名前</th><th>スコア</th>
      <th><img src="/images/ビール.png" alt="ビール" /></th><th><img src="/images/gero/げろげろ100-1.png" alt="げろげろ" /></th><th>日付</th>
    </tr>
  </thead>
)

// My：自分の統計と、ベスト5
function MyTab() {
  const { user, openPanel } = useAuth()
  if (!user) {
    return (
      <p className="sheet-text">ログインすると、自分のベスト5と統計が見られます。
        <button className="link" onClick={() => openPanel('login')}>ログインはこちら</button></p>
    )
  }
  const rk = rankInfo(user.totalBeers)
  return (
    <>
      <div className="stat-box">
        <div className="my-name">{user.nickname}</div>
        <div className="stat-line"><span>ランク <i className="rank-val"><b>{rk.rank}</b>{rk.need ? <>（次のランクまで、あと<img className="beer-inline" src="/images/ビール.png" alt="ビール" /><span className="next-left">{rk.need - rk.into}</span>）</> : '（最高ランク）'}</i></span></div>
        <div className="stat-line">
          <span><img src="/images/ビール.png" alt="" /> 累積ビール <b><Digits value={user.totalBeers} width={4} /></b></span>
          <span><img src="/images/gero/げろげろ100-1.png" alt="" /> 累積げろげろ <b><Digits value={user.totalGero} width={4} /></b></span>
        </div>
      </div>
      <h3>ベスト5</h3>
      {user.best.length === 0 ? <p className="sheet-text">まだ記録がありません</p> : (
        <table className="rank-table">
          <thead>
            <tr>
              <th>順位</th><th>難易度</th><th>スコア</th>
              <th><img src="/images/ビール.png" alt="ビール" /></th><th><img src="/images/gero/げろげろ100-1.png" alt="げろげろ" /></th><th>日付</th>
            </tr>
          </thead>
          <tbody>
            {/* 直近のプレイの記録は、赤く点滅（mine） */}
            {user.best.map((b, i) => (
              <tr key={i} className={getLastPlayAt() && b.at === getLastPlayAt() ? 'mine' : ''}>
                <td className="rank"><RankMark rank={i + 1} /></td>
                <td className="name"><small className={`diff-tag ${b.difficulty}`}>{DIFF_JA[b.difficulty]}</small></td>
                <td className="num">{b.finalPt.toLocaleString()}<small>pt</small></td>
                <td className="num">{b.beers}</td>
                <td className="num">{b.gero}</td>
                <DateCell at={b.at} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function RankingPanel() {
  const { token, user, closePanel, openPanel } = useAuth()
  const [tab, setTab] = useState('today') // today | all | my
  const [scope, setScope] = useState('any')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [showRank, setShowRank] = useState(false) // 名前の上の表示：称号 ⇔ ランク（5秒ごと）
  useEffect(() => { const id = setInterval(() => setShowRank((v) => !v), 5000); return () => clearInterval(id) }, [])

  useEffect(() => {
    if (tab === 'my') return undefined
    let alive = true
    setData(null); setError('')
    api.getRanking(token, { difficulty: scope, period: tab }).then((r) => alive && setData(r)).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [tab, scope, token])

  return (
    <Sheet title="ランキング" onClose={closePanel} wide big>
      <div className="tabs">
        {[['today', '本日'], ['all', '総合'], ['my', 'My']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'my' ? <MyTab /> : (
        <>
          <div className="tabs sub">
            {['any', 'easy', 'normal', 'hard'].map((k) => (
              <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{DIFF_JA[k]}</button>
            ))}
          </div>

          {error && <p className="form-error">{error}</p>}
          {!data && !error && <p className="sheet-text">読み込み中…</p>}
          {data && (
            <>
              {data.rows.length === 0 ? <p className="sheet-text">まだ記録がありません</p> : (
                <table className="rank-table">
                  <RankHead />
                  <tbody>
                    {data.rows.map((r) => <RankRow key={r.rank} r={r} showDiff={scope === 'any'} showRank={showRank} />)}
                  </tbody>
                </table>
              )}
              {data.me && data.me.outside && (
                <div className="me-box">
                  <div className="me-title">あなたの順位</div>
                  <table className="rank-table"><tbody>
                    <RankRow r={{ ...data.me, mine: true }} showDiff={scope === 'any'} showRank={showRank} />
                  </tbody></table>
                </div>
              )}
              {!user && (
                <p className="sheet-text">ログインすると、自分の記録の文字が赤く点滅し、順位も表示されます。
                  <button className="link" onClick={() => openPanel('login')}>ログインはこちら</button></p>
              )}
            </>
          )}
        </>
      )}
      <Note />
    </Sheet>
  )
}

// ---------------- ゲーム設定（Takoyaki Cascade から移植） ----------------
// スライダーを離したときの確認音（ボタンのクリック音は、全体の仕組み(clickSound.js)が鳴らす）
const sliderSound = () => playSound('ボタン押下', sfxVolume(0.6))

function SettingsPanel() {
  const { closePanel, user, token } = useAuth()
  const st = useSettings()
  const saveTimer = useRef(null)
  const initialPowerSave = useRef(st.powerSave) // 開いたときの省電力モード（切りかえて保存したら、HOMEへ戻す）
  const [dirty, setDirty] = useState(false) // 設定を変えたら、保存ボタンで知らせる

  // 変更したら端末に保存し、ログイン中はアカウントにも保存する（少し待ってまとめて送る）
  const change = (patch) => {
    setDirty(true)
    setSettings(patch)
    if (user) {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => api.updateMe(token, { settings: getSettings() }).catch(() => {}), 800)
    }
  }
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // 保存：設定は変更のたびに端末へ保存済み。ログイン中は、待たずにアカウントへ送って閉じる
  const save = () => {
    clearTimeout(saveTimer.current)
    if (user) api.updateMe(token, { settings: getSettings() }).catch(() => {})
    closePanel()
    if (getSettings().powerSave !== initialPowerSave.current) window.dispatchEvent(new Event('pb-go-home')) // 省電力モードを切りかえて保存したら、HOMEへ
  }

  const reset = () => { setDirty(true); resetSettings(); if (user) api.updateMe(token, { settings: getSettings() }).catch(() => {}) }

  return (
    <Sheet title={<><img src="/images/icon/information/設定.png" alt="" className="set-icon" /> ゲーム設定</>} onClose={closePanel}>
      <div className="set-section">
        <h3><img src="/images/icon/information/音量調整.png" alt="" className="set-icon" /> 音量調整</h3>
        <p className="sheet-text">BGMや効果音の大きさを調整します</p>
        <div className="volume-row">
          <label><img src="/images/icon/information/BGM.png" alt="" className="set-icon" /> BGM</label>
          <input type="range" min="0" max="100" value={Math.round(st.bgmVolume * 100)} onChange={(e) => change({ bgmVolume: e.target.value / 100 })} className="volume-slider" />
          <span className="volume-value">{Math.round(st.bgmVolume * 100)}%</span>
        </div>
        <div className="volume-row">
          <label><img src="/images/icon/information/効果音.png" alt="" className="set-icon" /> 効果音</label>
          <input type="range" min="0" max="100" value={Math.round(st.sfxVolume * 100)} onChange={(e) => change({ sfxVolume: e.target.value / 100 })}
            onPointerUp={sliderSound} onKeyUp={sliderSound} className="volume-slider" />
          <span className="volume-value">{Math.round(st.sfxVolume * 100)}%</span>
        </div>
        <p className="field-hint">※ BGMは、効果音より小さい音で流れます</p>
      </div>

      <div className="set-section">
        <h3><img src="/images/icon/information/省エネ.png" alt="" className="set-icon" /> 省電力モード</h3>
        <p className="sheet-text">画面の光る・点滅する演出を抑え、スマホの発熱やバッテリー消費を軽くします</p>
        <div className="toggle-row">
          <button className={`toggle-btn${st.powerSave ? ' active' : ''}`} onClick={() => change({ powerSave: true })}>ON</button>
          <button className={`toggle-btn${!st.powerSave ? ' active' : ''}`} onClick={() => change({ powerSave: false })}>OFF</button>
        </div>
      </div>

      {user ? <p className="field-hint">ログイン中は、設定がアカウントにも保存されます</p>
        : <p className="field-hint">ログインすると、設定がアカウントに保存され、別の端末でも使えます</p>}

      <div className="inline center set-buttons">
        <button className={`btn small set-save${dirty ? ' nudge' : ''}`} onClick={save}>保存</button>
        <button className="btn small set-reset" onClick={reset}>初期値に戻す</button>
      </div>
    </Sheet>
  )
}

export default function Panels() {
  const { panel, user } = useAuth()
  switch (panel) {
    case 'login': return <LoginPanel />
    case 'signup': return <SignupPanel />
    case 'recovery': return <RecoveryPanel />
    case 'edit': return user ? <EditPanel /> : <LoginPanel />
    case 'logout': return <LogoutPanel />
    case 'ranking': return <RankingPanel />
    case 'settings': return <SettingsPanel />
    default: return null
  }
}
