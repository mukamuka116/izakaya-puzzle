import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { AuthProvider, useAuth } from './auth'
import { setPhase as markPhase } from './clickSound'
import Panels from './components/account/Panels'
import { DIFFICULTY, TITLE_MIN_PT } from './constants'
import { RANK_MIN_PT, rankInfo } from './rank'
import { setLastPlayAt } from './lastPlay'

// 次のランクまで、あと何杯か（最高ランクなら null）
const nextLeft = (totalBeers) => { const i = rankInfo(totalBeers); return i.need === null ? null : i.need - i.into }
import Digits from './components/Digits'
import Game from './components/Game'
import Header from './components/Header'
import { useSettings } from './settings'

// スマホを横向きにして高さが足りないときの案内（CSSで条件が合うときだけ表示）
function LandscapeLock() {
  return (
    <div className="landscape-lock-overlay">
      <div className="landscape-lock-icon"><img src="/images/icon/information/スマホ.png" alt="" /></div>
      <p className="landscape-lock-text">画面を縦向きにしてください</p>
    </div>
  )
}

function AppInner() {
  const [phase, setPhase] = useState('title') // title | play | result
  const [diffKey, setDiffKey] = useState('normal')
  const [rawScore, setRawScore] = useState(0)
  const [round, setRound] = useState(0)
  // 省電力モードを切りかえて保存したときは、HOMEに戻る（ゲーム設定の保存から呼ばれる）
  useEffect(() => {
    const goHome = () => setPhase('title')
    window.addEventListener('pb-go-home', goHome)
    return () => window.removeEventListener('pb-go-home', goHome)
  }, [])
  // HOMEの2つのリンクの並び：虫が上になる確率7割、バッテリーが上は3割。HOMEに戻るたびに、決め直す
  const [bugFirst, setBugFirst] = useState(() => Math.random() < 0.7)
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (phase === 'title') setBugFirst(Math.random() < 0.7)
  }, [phase])
  const [paused, setPaused] = useState(false)
  const [playable, setPlayable] = useState(false) // 開始前・終了後は中断できない
  const [stats, setStats] = useState({ fever: 0, gero: 0 })
  const diff = DIFFICULTY[diffKey]
  useEffect(() => { markPhase(phase) }, [phase]) // ゲーム中は、クリック音を鳴らさない（例外あり）
  const { user, token, openPanel, refresh } = useAuth()
  const { pest, powerSave } = useSettings()
  const startTokenRef = useRef(null)
  const [submit, setSubmit] = useState(null) // スコア送信の結果（ログイン中のみ）

  // ゲーム開始：ログイン中なら、サーバーから開始の札をもらっておく（スコア送信に使う）
  // 通信に失敗したときは、4秒おきに最大4回やり直す（ゲームが始まってから約16秒以内なら、結果の送信に間に合う）
  const startSeq = useRef(0)
  const fetchStartToken = (difficulty, seq, attempt = 0) => {
    api.startScore(token, { difficulty })
      .then((r) => { if (startSeq.current === seq) startTokenRef.current = r.startToken })
      .catch(() => { if (startSeq.current === seq && attempt < 4) setTimeout(() => fetchStartToken(difficulty, seq, attempt + 1), 4000) })
  }
  const startGame = () => {
    startTokenRef.current = null
    setSubmit(null)
    const seq = ++startSeq.current
    if (user) fetchStartToken(diffKey, seq)
    setRound((n) => n + 1)
    setPhase('play')
  }

  // ゲーム終了：ログイン中なら、スコア・ビール数・げろげろ数を送る
  const finishGame = (rawPt, st) => {
    setPaused(false); setRawScore(rawPt); setStats(st); setPhase('result')
    const startToken = startTokenRef.current
    if (user && rawPt < RANK_MIN_PT) {
      setSubmit({ status: 'skipped' }) // スコアが足りないゲームは、何も更新しない
    } else if (user && startToken) {
      const before = rankInfo(user.totalBeers).rank
      setSubmit({ status: 'sending' })
      api.submitScore(token, { startToken, difficulty: diffKey, rawPt, finalPt: Math.round(rawPt * diff.mult), beers: st.fever, gero: st.gero })
        .then((r) => { setLastPlayAt(r.at); const after = rankInfo(r.totalBeers).rank; setSubmit({ status: 'ok', ranks: r.ranks, newTitle: r.newTitle, rankUp: after > before ? after : null, nextLeft: nextLeft(r.totalBeers) }); refresh() })
        .catch((e) => setSubmit({ status: 'error', message: e.message }))
    } else if (user) {
      // 開始の札を受け取れなかったとき：黙って飛ばさず、画面に出す
      setSubmit({ status: 'error', message: 'ゲーム開始の情報を受け取れませんでした。通信を確認してください' })
    } else {
      setSubmit(null)
    }
  }

  if (phase === 'play') {
    return (
      <>
        <Header menu={false} pause onPause={() => setPaused(true)} pauseDisabled={!playable || paused} />
        <Game key={round} diff={diff} paused={paused} onPlayable={setPlayable} rank={rankInfo(user?.totalBeers).rank}
          onFinish={finishGame} />
        {paused && (
          <div className="pause-layer">
            <button className="btn" onClick={() => setPaused(false)}>再開</button>
            <button className="btn cancel" onClick={() => { setPaused(false); setPhase('title') }}>HOMEに戻る</button>
          </div>
        )}
      </>
    )
  }

  if (phase === 'result') {
    return (
      <>
      <Header />
      <div className="screen with-header result">
        <h1>結果</h1>
        <p className="line">スコア <b>{rawScore.toLocaleString()}</b> pt</p>
        <p className="line">{diff.label}ボーナス × {diff.mult}</p>
        <p className="final">最終 <span className="num">{Math.round(rawScore * diff.mult).toLocaleString()}</span> pt</p>
        <div className="stats">
          <span className="stat"><img src="/images/ビール.png" alt="フィーバー回数" /><Digits value={stats.fever} width={2} /></span>
          <span className="stat"><img src="/images/gero/げろげろ100-1.png" alt="げろげろ100%回数" /><Digits value={stats.gero} width={2} /></span>
        </div>
        {(!user || submit?.status === 'ok') && (
          <div className="result-card">
            <div>
              {!user && <>ログインすると称号を獲得できます <button className="link" onClick={() => openPanel('login')}>ログインはこちら</button></>}
              {user && (submit.newTitle
                ? <>称号：<span className="title-name">{submit.newTitle}</span><span style={{ fontSize: '0.8em' }}> を獲得した！</span></>
                : (rawScore >= TITLE_MIN_PT ? '称号：すべて獲得済みです' : `スコア${TITLE_MIN_PT.toLocaleString()}pt以上で称号を獲得できます`))}
            </div>
            {user && submit.rankUp && <div>ランクアップ！ <span className="title-name">ランク{submit.rankUp}</span> になった！</div>}
            {user && submit.nextLeft !== null && <div>{<>次のランクまで、あと <img className="beer-inline" src="/images/ビール.png" alt="ビール" /><span className="title-name">{submit.nextLeft}</span></>}</div>}
          </div>
        )}
        <p className="line submit-line">
          {!user && <>ログインすると記録がランキングに載ります <button className="link" onClick={() => openPanel('login')}>ログインはこちら</button></>}
          {user && submit?.status === 'skipped' && `スコア${RANK_MIN_PT}pt未満のため、記録されません`}
          {user && submit?.status === 'sending' && '記録を送信中…'}
          {user && submit?.status === 'error' && `記録を送れませんでした（${submit.message}）`}
          {user && submit?.status === 'ok' && <button className="link rank-link" onClick={() => openPanel('ranking')}>ランキングを確認する</button>}
        </p>
        <button className="btn" onClick={startGame}>{diff.label}で再プレイ</button>
        <button className="btn cancel" onClick={() => setPhase('title')}>タイトルへ</button>
      </div>
      </>
    )
  }

  return (
    <>
    <Header />
    <div className="screen with-header home">
      <h1 className="ghost">Puzzle & Beers</h1>
      <div className="home-account">
        {user ? (
          <span style={{ textAlign: 'center' }}><span className="home-title">{user.title || '称号未設定'}</span>ランク <span className="rank-num">{rankInfo(user.totalBeers).rank}</span><br />{nextLeft(user.totalBeers) !== null && <><span className="rank-sub">（次のランクまで、あと<img className="beer-inline" src="/images/ビール.png" alt="ビール" /><span className="next-left">{nextLeft(user.totalBeers)}</span>）</span><br /></>}<span style={{ fontSize: '1.2em', color: '#ffd9ae' }}><svg className="play-mark" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.4 1.6 L8 5 L2.4 8.4 Z" /></svg>{user.nickname}<br />（{user.loginId}）</span>でプレイ中</span>
        ) : (
          <>
            <span className="guest-text">ゲスト<span style={{ fontSize: '0.8em', color: 'var(--fg)' }}>としてプレイ中</span></span>
            <button className="btn small" onClick={() => openPanel('login')}>ログインはこちら</button>
          </>
        )}
      </div>
      <p className="lead">3つ以上そろえて消そう！<br />ビールが満タンでフィーバー！</p>
      <p className="diffs-title">難易度選択</p>
      <div className="diffs">
        {Object.entries(DIFFICULTY).map(([k, d]) => (
          <button key={k} className={`diff ${k}${k === diffKey ? ' on' : ''}`} onClick={() => setDiffKey(k)}>
            <b>{d.label}</b><small><span className="sub">{d.sub}</span>（最終pt × {d.mult}）</small>
          </button>
        ))}
      </div>
      <button className="btn start" onClick={startGame}>スタート</button>
      {[
        { key: 'pest', show: !(user && pest === 'mouse'), label: '虫が苦手な人はこちらで設定変更', onClick: () => openPanel(user ? 'edit' : 'login', 'pest') },
        { key: 'battery', show: !powerSave, label: 'バッテリーの減りがはやい場合', onClick: () => openPanel('settings') },
      ].sort((a) => ((a.key === 'pest') === bugFirst ? -1 : 1)) // 虫を上にするか下にするかで、並びを決める
        .filter((l) => l.show)
        .map((l, n) => <button key={l.key} className={`link pest-link ${n === 0 ? 'pest-up' : 'battery-up'}`} onClick={l.onClick}>{l.label}</button>)}
    </div>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
      <Panels />
      <LandscapeLock />
    </AuthProvider>
  )
}
