import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BEER_FULL, BOARD, CHEST, CHEST_OPEN, FEVER_SEC, EXTEND_SEC, GAME_SEC, GERO_PENALTY, ITEMS, KEY, KIND_BY_ID, NOTES, SAKE_GERO, WATER_GERO, SHIME_SEC, TSUKIDASHI_SEC,
  itemTypeId, BUG_FREE_MS, BUG_LOTTERY_MS, BUG_MAX, BUG_SIDE_JA, BUG_STAY_MS, BELL_CURE, POISON_GERO, POISON_TIME_SEC,
} from '../constants'
import { dropAndRefill, findGroups, isDeadlocked, makeGrid, pickKinds } from '../gameLogic'
import { bgm } from '../bgm'
import { feverBonusSec } from '../rank'
import { playSound } from '../sound'
import { getSettings, sfxVolume, useSettings } from '../settings'
import BeerMug from './BeerMug'
import Digits from './Digits'
import Piece from './Piece'

// 色分け：つきだし=緑 / しめ=赤 / それ以外=黄色系（黄色の中で色相と明るさを変えて区別）
const MAIN_BGS = ['hsla(30, 90%, 55%, 0.34)', 'hsla(48, 95%, 55%, 0.34)', 'hsla(62, 85%, 50%, 0.34)', 'hsla(40, 70%, 70%, 0.34)']
const bgOf = (kinds) => {
  let i = 0
  return Object.fromEntries(kinds.map((k) => [
    k.id,
    k.group === 'tsukidashi' ? 'hsla(130, 70%, 45%, 0.36)'
      : k.group === 'shime' ? 'hsla(0, 80%, 50%, 0.36)'
      : MAIN_BGS[i++ % MAIN_BGS.length],
  ]))
}


const POUR_INTERVAL_MS = 600 // 1杯ぶん注ぐ間隔（大きいほどゆっくり）

// げろげろアイコン：%に応じて絵が変わる。アイテム獲得・使用時は虫アイテムを3秒表示
const GERO_DIR = '/images/gero/'
const GERO_BAD = ['げろげろ3', 'げろげろ4'] // 59%以下の気分が悪い絵（ファイルがなければ3のみ）
function GeroIcon({ gero, itemUntil, burstAt }) {
  const [now, setNow] = useState(Date.now())
  const start = useRef(Date.now())
  const bad = useRef({ cycle: -1, name: 'げろげろ3' })
  const [has4, setHas4] = useState(false)
  const { powerSave } = useSettings()
  useEffect(() => {
    const img = new Image()
    img.onload = () => setHas4(true)
    img.src = `${GERO_DIR}げろげろ4.png`
  }, [])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), powerSave ? 250 : 50) // 省電力：0.25秒ごと
    return () => clearInterval(id)
  }, [powerSave])

  let name
  if (burstAt && now - burstAt < 4000) {
    name = 'げろげろ100-1' // 100%到達：4秒
  } else if (burstAt && now - burstAt < 8000) {
    name = 'げろげろ100-2' // 続けて4秒（100-1・100-2の間は、アイテム獲得・使用でも切り替えない）
  } else if (now < itemUntil) {
    name = 'げろげろ虫アイテム'
  } else if (gero >= 90) name = 'げろげろ90'
  else if (gero >= 75) name = 'げろげろ75'
  else if (gero >= 60) name = 'げろげろ60'
  else {
    // 1,2を0.55秒おきに5回繰り返し（5.5秒）→ 3か4を4秒 → くり返し（9.5秒周期）
    const t = now - start.current
    const cycle = Math.floor(t / 9500)
    const pos = t % 9500
    if (pos < 5500) {
      name = Math.floor(pos / 550) % 2 === 0 ? 'げろげろ1' : 'げろげろ2'
    } else {
      if (bad.current.cycle !== cycle) {
        bad.current = { cycle, name: has4 && Math.random() < 0.5 ? 'げろげろ4' : 'げろげろ3' }
      }
      name = bad.current.name
    }
  }
  return <img src={`${GERO_DIR}${name}.png`} alt="" className={`row-icon gero-icon${name === 'げろげろ90' ? ' metronome' : name === 'げろげろ100-1' ? ' shake' : ''}`} />
}

// 残り時間（10ミリ秒単位）。ゲーム全体を再描画しないよう、ここだけ短い周期で更新する
function TimeNum({ read }) {
  const [t, setT] = useState(read())
  useEffect(() => {
    let raf
    let n = 0
    const loop = () => {
      if (!getSettings().powerSave || ++n % 6 === 0) setT(read()) // 省電力：更新は6回に1回
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [read])
  const cs = Math.floor(t * 100) // 10ミリ秒単位
  return <span className="timenum">{Math.floor(cs / 100)} <span className="unit">S</span> {String(cs % 100).padStart(2, '0')} <span className="unit">ms</span></span>
}

// 7桁固定（0,000,000）。上位の0とカンマは薄く表示
function ScoreDigits({ value }) {
  const text = String(Math.max(0, Math.min(Math.round(value), 9999999))).padStart(7, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const firstNonZero = text.search(/[1-9]/)
  const lead = firstNonZero === -1 ? text.length - 1 : firstNonZero
  return (
    <span className="digits">
      {text.split('').map((ch, i) => <b key={i} className={i < lead ? 'dim' : ''}>{ch}</b>)}
    </span>
  )
}

const MISS_PENALTY_SEC = 2 // ノーコンボ時に失う秒数

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const play = (name, vol = 0.6) => playSound(name, sfxVolume(vol)) // ゲーム設定の効果音の音量を反映

export default function Game({ diff, onFinish, paused = false, onPlayable, rank: rankProp = 0 }) {
  const kinds = useMemo(() => pickKinds(diff.exclude), [])
  const bgs = useMemo(() => bgOf(kinds), [kinds])
  const [grid, setGridState] = useState(() => makeGrid(kinds))
  const [score, setScoreState] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_SEC)
  const [pours, setPoursState] = useState(0)
  const [pourTotal, setPourTotal] = useState(0)
  const [fever, setFever] = useState(false)
  const [feverStart, setFeverStart] = useState(0)
  const [fullCount, setFullCount] = useState(1) // 乾杯の1杯めから数える
  const [gero, setGeroState] = useState(0)
  const [geroRed, setGeroRed] = useState(null)
  const [burstAt, setBurstAt] = useState(0) // げろげろ100%に達した時刻
  const [pops, setPops] = useState([])
  const [timePops, setTimePops] = useState([]) // タイマーの数字の上に出る、時間の増減表示
  const [combo, setCombo] = useState(null)
  const [drag, setDrag] = useState(null)
  const [toast, setToast] = useState(null)
  const [itemCounts, setItemCounts] = useState({}) // アイテム所持数（今は未実装＝すべて0）
  const [bugs, setBugs] = useState([])
  const [rank] = useState(rankProp) // このゲームのランク（開始時に固定）
  const feverSec = FEVER_SEC + feverBonusSec(rank) // ランク10ごとに、フィーバーが0.5秒のびる
  const { pest } = useSettings()
  const [targeting, setTargeting] = useState(false) // ハリセン使用中（虫をタップして叩く）
  const [timeUp, setTimeUp] = useState(false) // タイムアップ後（アイテムは使えない）
  const [over, setOver] = useState(false)
  const [starting, setStarting] = useState(true)
  const [count, setCount] = useState(3) // 開始前のカウントダウン（3→2→1→乾杯）

  const R = useRef({
    grid, score: 0, timeLeft: GAME_SEC, extend: 0, pours: 0, fever: false, feverEnd: 0, gero: 0,
    fullCount: 1, geroFull: 0, bugs: [], bugId: 0, bugClock: 0, bugElapsed: 0, targeting: false, geroLock: false, timeUp: false, allowFever: false, busy: false, paused: false, userPaused: false, pourQueue: 0, pumping: false, ended: false, ready: false, startAt: Date.now(), popId: 0, drag: null,
  }).current
  const boardRef = useRef(null)

  // 中断中は進まない待ち時間（中断した時間は数えない）
  const psleep = async (ms) => {
    let left = ms
    while (left > 0) {
      await new Promise((r) => setTimeout(r, Math.min(50, left)))
      if (!R.userPaused) left -= 50
    }
  }

  const setGrid = (g) => { R.grid = g; setGridState(g) }
  const setScore = (v) => { R.score = v; setScoreState(v) }
  const setPours = (v) => { R.pours = v; setPoursState(v) }
  const setGero = (v) => { R.gero = v; setGeroState(v) }

  const pop = (text, type, ms = 1000) => {
    const id = ++R.popId
    setPops((p) => [...p.slice(-4), { id, text, type, ms }])
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), ms)
  }
  const timePop = (text, ms = 1500) => {
    const id = ++R.popId
    setTimePops((p) => [...p.slice(-3), { id, text, ms }])
    setTimeout(() => setTimePops((p) => p.filter((x) => x.id !== id)), ms)
  }
  const showToast = (text, img) => {
    setToast({ text, img, key: Date.now() })
    setTimeout(() => setToast(null), 1400)
  }

  // ---- フィーバー / げろげろ ----
  // げろげろ100%：吐く → 少し待ってスコア25%減、ゲージはリセット値へ
  const geroOverflow = () => {
    R.geroLock = true
    setGero(100)
    R.geroFull += 1
    play('吐く')
    setBurstAt(Date.now())
    setTimeout(() => {
      const loss = Math.round(R.score * GERO_PENALTY)
      setScore(R.score - loss)
      pop(`-${loss.toLocaleString()}`, 'minus', 3000) // げろげろで失ったptは長めに表示
      setGero(diff.geroReset)
      showToast('げろげろ…！ スコア-25%')
      R.geroLock = false
    }, 500)
  }
  // 毒ピースなどで、げろげろをその場で増やす
  const raiseGero = (delta) => {
    if (R.geroLock) return
    const to = R.gero + delta
    if (to >= 100 - 1e-9) geroOverflow()
    else setGero(to)
  }

  // add: げろげろの増加量（日本酒の強制フィーバーもビールの回数に数える）
  const startFever = (add = diff.geroAdd) => {
    R.fever = true
    R.feverEnd = Date.now() + feverSec * 1000
    setFever(true)
    bgm.setFever(true)
    setFeverStart(Date.now())
    R.fullCount += 1
    setFullCount((c) => c + 1)
    setPours(0)
    R.pourQueue = 0

    const from = R.gero
    const to = from + add
    setGeroRed({ from, to: Math.min(to, 100), key: Date.now() })
    setTimeout(() => {
      setGeroRed(null)
      if (to >= 100 - 1e-9) {
        geroOverflow()
      } else {
        setGero(to)
      }
    }, 1000)
  }
  const endFever = () => {
    R.fever = false
    setFever(false)
    bgm.setFever(false)
    setPours(0)
    if (R.timeUp) R.allowFever = !!(R.busy || R.drag || R.pumping) // 操作中のコンボなら、新たなフィーバーになってもよい
  }

  const addPours = (n) => {
    if (R.fever || R.ended) return
    if (R.timeUp && !R.allowFever) return // タイムアップ後は、新しいフィーバーを始めない
    const p = Math.min(BEER_FULL, R.pours + n)
    setPours(p)
    setPourTotal((t) => t + n)
    if (p >= BEER_FULL) startFever()
  }

  // ---- タイマー ----
  useEffect(() => {
    play('「3」')
    const timers = [
      setTimeout(() => { setCount(2); play('「2」') }, 1000),
      setTimeout(() => { setCount(1); play('「1」') }, 2000),
      setTimeout(() => { setCount(null); play('開始') }, 3000),
      setTimeout(() => {
        R.ready = true
        R.startAt = Date.now()
        setStarting(false)
        bgm.start() // 乾杯のあと、BGMを流し始める
      }, 5000),
    ]
    const id = setInterval(() => {
      if (!R.ready || R.paused || R.userPaused) return
      const now = Date.now()
      const left = Math.max(0, GAME_SEC + R.extend / 1000 - (now - R.startAt) / 1000)
      R.timeLeft = left
      if (!getSettings().powerSave || (R.tick = (R.tick || 0) + 1) % 5 === 0 || left <= 0) setTimeLeft(left) // 省電力：画面の更新は0.5秒ごと
      // 時間が来ても、操作中とそのコンボが終わるまでは、フィーバーを終わらせない
      if (R.fever && now >= R.feverEnd && !R.busy && !R.drag) endFever()
      // フィーバー中・コンボ処理中・操作中・ビールを注いでいる間は、0秒でもタイムアップにしない
      const hold = R.fever || R.busy || R.drag || R.pumping || R.pourQueue > 0
      if (left <= 0 && !R.timeUp) {
        // タイムアップ：以後アイテムは使えない。操作中のコンボなら、フィーバーになってもよい
        R.timeUp = true
        R.allowFever = !!(R.busy || R.drag || R.pumping || R.pourQueue > 0)
        R.targeting = false
        setTargeting(false)
        setArmed(null)
        setTimeUp(true)
      }
      if (left <= 0 && !R.ended && !hold) {
        R.ended = true
        bgm.stop()
        clearInterval(id)
        setDrag(null)
        R.drag = null
        setOver(true)
        play('終了')
        setTimeout(() => onFinish(R.score, { fever: R.fullCount, gero: R.geroFull }), 2200)
      }
    }, 100)
    return () => { clearInterval(id); timers.forEach(clearTimeout); bgm.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 得点 ----
  const elapsed = GAME_SEC + R.extend / 1000 - timeLeft
  const tsukiActive = elapsed < TSUKIDASHI_SEC
  const shimeActive = timeLeft <= SHIME_SEC
  const typeMult = (id) => {
    const g = KIND_BY_ID[id].group
    if (g === 'tsukidashi' && GAME_SEC + R.extend / 1000 - R.timeLeft < TSUKIDASHI_SEC) return 1.5
    if (g === 'shime' && R.timeLeft <= SHIME_SEC) return 2
    return 1
  }
  const calcPoints = (group, comboNo) => {
    const n = group.cells.length
    const sizeBonus = 1 + 0.5 * (n - 3)
    const comboMult = 1 + 0.25 * (comboNo - 1)
    return Math.round(n * (10 + rank) * sizeBonus * comboMult * typeMult(group.type) * (R.fever ? 2 : 1))
  }

  // ---- アイテム：2回タップで発動（1回目で選択、もう一度タップで使用）----
  const [armed, setArmed] = useState(null)
  const [itemUntil, setItemUntil] = useState(0) // この時刻まで、げろげろアイコンを虫アイテムにする
  const flashItem = () => setItemUntil(Date.now() + 3000)
  const poisonedCells = () => {
    const list = []
    R.grid.forEach((row, r) => row.forEach((p, c) => { if (p?.poison) list.push({ r, c }) }))
    return list
  }
  // 条件を満たさず、アイテムが使えない状況か（使えないときは、アイコンを薄く表示する）
  const unusable = (img) => {
    if (R.timeUp) return true
    if (img === 'お冷') return R.gero <= 0
    if (img === '日本酒') return R.fever
    if (img === 'ハリセン') return R.targeting || !R.bugs.some((x) => !x.dying)
    if (img === '呼び鈴') return !poisonedCells().length
    return false
  }
  const tapItem = (img) => {
    if (R.ended || R.paused || R.userPaused || !R.ready) return
    if ((itemCounts[img] || 0) <= 0 || unusable(img)) return // 使えない状況では、選択もしない
    if (armed !== img) {
      setArmed(img)
      clearTimeout(R.armTimer)
      R.armTimer = setTimeout(() => setArmed(null), 3000)
      return
    }
    clearTimeout(R.armTimer)
    setArmed(null)
    setItemCounts((c) => ({ ...c, [img]: c[img] - 1 }))
    flashItem()
    if (img !== 'ハリセン' && img !== '呼び鈴') play('アイテム獲得・使用')
    if (img === 'お冷') {
      setGero(Math.max(0, R.gero - WATER_GERO))
    } else if (img === 'ストップウォッチ') {
      R.extend += EXTEND_SEC * 1000
      showToast(`+${EXTEND_SEC}秒`)
    } else if (img === '日本酒') {
      startFever(SAKE_GERO)
    } else if (img === 'ハリセン') {
      R.targeting = true // 虫が赤く点滅。叩きたい虫のいるマスをタップ
      setTargeting(true)
    } else if (img === '呼び鈴') {
      play('呼び鈴')
      const cure = new Set(poisonedCells().sort(() => Math.random() - 0.5).slice(0, BELL_CURE).map(({ r, c }) => r * BOARD + c))
      setGrid(R.grid.map((row, r) => row.map((p, c) => (p && cure.has(r * BOARD + c) ? { ...p, poison: false } : p))))
    }
  }

  // ---- 虫 ----
  const placeBug = (b) => {
    // 上下左右のどこかの端から、反対側へ向かって進む（画像は出現した側のもの）
    const side = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]
    const i = Math.floor(Math.random() * BOARD)
    const at = {
      up: { r: 0, c: i, dr: 1, dc: 0 },
      down: { r: BOARD - 1, c: i, dr: -1, dc: 0 },
      left: { r: i, c: 0, dr: 0, dc: 1 },
      right: { r: i, c: BOARD - 1, dr: 0, dc: -1 },
    }[side]
    Object.assign(b, at, { side, stay: 0, n: (b.n || 0) + 1 })
  }
  const bugLottery = () => {
    if (!diff.bugRate || Math.random() >= diff.bugRate) return
    const alive = R.bugs.filter((b) => !b.dying)
    const roach = alive.filter((b) => b.kind === 'roach').length
    const fly = alive.filter((b) => b.kind === 'fly').length
    const kinds = []
    if (alive.length < Math.min(BUG_MAX.total, diff.bugMax)) {
      if (roach < BUG_MAX.roach) kinds.push('roach')
      if (fly < BUG_MAX.fly) kinds.push('fly')
    }
    if (!kinds.length) return
    const b = { id: ++R.bugId, kind: kinds[Math.floor(Math.random() * kinds.length)] }
    placeBug(b)
    R.bugs.push(b)
    setBugs([...R.bugs])
    flashItem() // 虫が出たら、げろげろ画像を虫アイテムに
  }
  const poisonAt = (r, c) => {
    const p = R.grid[r]?.[c]
    if (p && !p.poison) setGrid(R.grid.map((row, y) => row.map((q, x) => (y === r && x === c ? { ...q, poison: true } : q))))
  }
  useEffect(() => {
    const id = setInterval(() => {
      if (!R.ready || R.paused || R.userPaused || R.ended) return
      R.bugClock += 100
      R.bugElapsed += 100
      if (R.bugClock >= BUG_LOTTERY_MS) { R.bugClock = 0; if (R.bugElapsed >= BUG_FREE_MS) bugLottery() } // 最初の10秒は抽選しない
      let changed = false
      for (const b of R.bugs) {
        if (b.dying) continue
        b.stay += 100
        if (b.stay < BUG_STAY_MS) continue
        poisonAt(b.r, b.c) // 5秒居座られたマスのピースは毒になる
        b.stay = 0
        const nr = b.r + b.dr, nc = b.c + b.dc
        if (nr < 0 || nc < 0 || nr >= BOARD || nc >= BOARD) placeBug(b) // 反対側の端まで行ったら、別の端から再登場
        else { b.r = nr; b.c = nc }
        changed = true
      }
      if (changed) setBugs([...R.bugs])
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const hitBug = (r, c) => {
    const b = R.bugs.find((x) => !x.dying && x.r === r && x.c === c)
    if (!b) return false
    b.dying = true
    b.rot = Math.floor(Math.random() * 360)
    play('ハリセン')
    R.targeting = false
    setTargeting(false)
    setBugs([...R.bugs])
    setTimeout(() => { R.bugs = R.bugs.filter((x) => x !== b); setBugs([...R.bugs]) }, 500)
    return true
  }

  // ---- 宝箱イベント：宝箱と鍵が隣りあうと開く（この間タイマーも止める）----
  const findSpecial = () => {
    // 盤面の上・左から順に調べ、隣りあう宝箱と鍵の最初の1組を返す
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        if (R.grid[r][c]?.type !== CHEST) continue
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const y = r + dy, x = c + dx
          if (R.grid[y]?.[x]?.type === KEY) return { chest: { r, c }, key: { r: y, c: x } }
        }
      }
    }
    return null
  }
  const openChest = async ({ chest, key }) => {
    const t0 = Date.now()
    R.paused = true
    const edit = (pos, fn) => setGrid(R.grid.map((row, y) => row.map((p, x) => (p && y === pos.r && x === pos.c ? fn(p) : p))))
    edit(key, (p) => ({ ...p, clearing: true }))
    edit(chest, (p) => ({ ...p, type: CHEST_OPEN }))
    play('宝箱を開ける')
    await psleep(700)
    // 宝箱から出るアイテムは、重み(weight)に応じた確率で選ぶ
    let roll = Math.random() * ITEMS.reduce((sum, it) => sum + it.weight, 0)
    const item = ITEMS.find((it) => (roll -= it.weight) < 0) || ITEMS[0]
    edit(chest, (p) => ({ ...p, type: itemTypeId(item.img) }))
    play('アイテム獲得・使用')
    flashItem()
    await psleep(600)
    setItemCounts((c) => ({ ...c, [item.img]: (c[item.img] || 0) + 1 }))
    edit(chest, (p) => ({ ...p, clearing: true }))
    await psleep(350)
    setGrid(dropAndRefill(R.grid, kinds, R.fever))
    await psleep(480)
    // 止めていた時間ぶん、タイマーとフィーバーを後ろにずらす
    const d = Date.now() - t0
    R.startAt += d
    R.feverEnd += d
    setFeverStart((f) => f + d)
    R.paused = false
  }

  // ---- 消去ループ ----
  const resolve = async (moved = false) => {
    R.busy = true
    let combo = 0
    while (!R.ended) {
      const groups = findGroups(R.grid)
      if (!groups.length) {
        const sp = findSpecial()
        if (!sp) break
        await openChest(sp)
        // 宝箱を開けたことも1コンボとして数える（コンボ倍率・ビールの注ぎに反映）
        combo++
        const key = Date.now()
        setCombo({ n: combo, key })
        setTimeout(() => setCombo((c) => (c && c.key === key ? null : c)), 1000)
        continue
      }
      // 下にあるものから順に（同じ高さなら左から）消す
      const bottom = (g) => Math.max(...g.cells.map((x) => x.r))
      const leftOf = (g) => Math.min(...g.cells.filter((x) => x.r === bottom(g)).map((x) => x.c))
      groups.sort((a, b) => bottom(b) - bottom(a) || leftOf(a) - leftOf(b))
      // 1コンボずつ、0.3秒の間隔をあけて順番に消す
      for (const g of groups) {
        if (R.ended) break
        combo++
        const no = combo
        const pts = calcPoints(g, no)
        setScore(R.score + pts)
        pop(`+${pts.toLocaleString()}`, 'plus')
        play(NOTES[Math.min(no - 1, NOTES.length - 1)])
        const key = Date.now()
        setCombo({ n: no, key })
        setTimeout(() => setCombo((c) => (c && c.key === key ? null : c)), 1000)
        // 毒ピースを消すと、1個ごとに制限時間が減り、げろげろゲージが増える
        const poisonN = g.cells.filter(({ r, c }) => R.grid[r][c]?.poison).length
        if (poisonN) {
          R.startAt -= poisonN * POISON_TIME_SEC * 1000
          raiseGero(poisonN * POISON_GERO)
          timePop(`-${poisonN * POISON_TIME_SEC}秒`) // タイマーの上に表示
        }
        const marked = new Set(g.cells.map(({ r, c }) => r * BOARD + c))
        setGrid(R.grid.map((row, r) => row.map((p, c) => (p && marked.has(r * BOARD + c) ? { ...p, clearing: true } : p))))
        await psleep(330 + 300)
      }
      if (R.ended) break
      setGrid(dropAndRefill(R.grid, kinds, R.fever))
      await psleep(480)
    }
    // コンボが止まったら、そのコンボ数ぶんまとめて注ぐ
    // ピースを動かしたのにコンボが1つもなかったら、2秒失う
    if (moved && combo === 0 && !R.ended) {
      R.startAt -= MISS_PENALTY_SEC * 1000
      showToast(`-${MISS_PENALTY_SEC}秒`)
    }
    // 消せる組み合わせが盤面にまったくない場合は、総入れ替え
    if (!R.ended && isDeadlocked(R.grid)) {
      setGrid(R.grid.map((row) => row.map((p) => p && { ...p, clearing: true })))
      await psleep(400)
      const before = R.grid
      setGrid(makeGrid(kinds).map((row, r) => row.map((p, c) => ({ ...p, fromR: r - BOARD, poison: !!before[r][c]?.poison }))))
      await psleep(600)
    }
    R.busy = false // 注いでいる間も盤面を操作できる
    R.pourQueue += combo
    pump()
  }

  // ビールを1杯ずつゆっくり注ぐ（盤面操作とは別に進む）
  const pump = async () => {
    if (R.pumping) return
    R.pumping = true
    while (R.pourQueue > 0 && !R.ended) {
      while (R.paused) await psleep(100)
      if (R.fever) { R.pourQueue = 0; break }
      R.pourQueue--
      addPours(1)
      await psleep(POUR_INTERVAL_MS)
    }
    R.pumping = false
  }

  // ---- ドラッグ操作（パズドラ式：指でなぞるとピースが入れ替わる）----
  const local = (e) => {
    // 枠線の内側（ピースが並ぶ範囲）を基準にする
    const el = boardRef.current
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left - el.clientLeft, y: e.clientY - rect.top - el.clientTop, size: el.clientWidth }
  }
  const cellOf = (x, y, size) => {
    const cs = size / BOARD
    return {
      c: Math.max(0, Math.min(BOARD - 1, Math.floor(x / cs))),
      r: Math.max(0, Math.min(BOARD - 1, Math.floor(y / cs))),
    }
  }
  const onDown = (e) => {
    if (R.busy || R.ended || R.userPaused || !R.ready) return
    const { x, y, size } = local(e)
    const { r, c } = cellOf(x, y, size)
    if (R.targeting && !R.timeUp) { hitBug(r, c); return } // ハリセン：虫のいるマスをタップ
    const piece = R.grid[r][c]
    if (!piece) return
    boardRef.current.setPointerCapture(e.pointerId)
    R.drag = { id: piece.id, r, c }
    clearTimeout(R.dragTimer)
    R.dragTimer = setTimeout(() => onUp(), diff.dragSec * 1000)
    setDrag({ id: piece.id, x: x - size / BOARD / 2, y: y - size / BOARD / 2 })
  }
  const onMove = (e) => {
    const d = R.drag
    if (!d) return
    const { x, y, size } = local(e)
    const half = size / BOARD / 2
    setDrag({ id: d.id, x: Math.max(-half, Math.min(size - half, x - half)), y: Math.max(-half, Math.min(size - half, y - half)) })
    const { r, c } = cellOf(x, y, size)
    if (r === d.r && c === d.c) return
    const g = R.grid.map((row) => [...row])
    const moving = g[d.r][d.c]
    g[d.r][d.c] = g[r][c]
    g[r][c] = moving
    d.r = r
    d.c = c
    d.moved = true
    setGrid(g)
  }
  const onUp = () => {
    if (!R.drag) return
    clearTimeout(R.dragTimer)
    const moved = !!R.drag.moved
    R.drag = null
    setDrag(null)
    resolve(moved)
  }

  // ---- 中断（App側のボタンで切り替え）----
  useEffect(() => {
    if (paused) {
      if (R.drag) onUp() // つかんでいたピースは離した扱いにする
      R.userPaused = true
      R.pauseAt = Date.now()
      bgm.pause()
    } else if (R.userPaused) {
      const d = Date.now() - R.pauseAt
      R.userPaused = false
      bgm.resume()
      R.startAt += d // 中断していた時間ぶん、タイマーとフィーバーを後ろにずらす
      R.feverEnd += d
      setFeverStart((f) => f + d)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])
  // 開始前・終了後は中断できない
  useEffect(() => {
    onPlayable?.(!starting && !over)
    return () => onPlayable?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting, over])

  const readTime = useCallback(
    () => (R.ready && !R.paused && !R.userPaused && !R.ended ? Math.max(0, GAME_SEC + R.extend / 1000 - (Date.now() - R.startAt) / 1000) : Math.max(0, R.timeLeft)),
    [R],
  )
  const feverLeft = fever ? Math.max(0, feverSec - (Date.now() - feverStart) / 1000) : 0

  return (
    <div className={`game${fever ? ' fever' : ''}`}>
      {fever && <div className="fever-screen" aria-hidden="true" />}
      <div className={`diff-label ${diff.key}`}>{diff.label}（{diff.sub}）</div>
      <header className="hud">
        <img src="/images/ストップウォッチ.png" alt="" className="hud-icon" />
        <div className="timebar"><div className={`timefill${tsukiActive ? ' tsuki' : shimeActive ? ' shime' : ''}`} style={{ width: `${Math.min(100, (timeLeft / GAME_SEC) * 100)}%` }} />
          {tsukiActive && <span className="timetag">つきだしタイム × 1.5</span>}
          {shimeActive && <span className="timetag">しめタイム × 2</span>}</div>
        <div className="time-wrap">
          <div className="time-pops">
            {timePops.map((p) => <span key={p.id} className="time-pop" style={{ animationDuration: `${p.ms}ms` }}>{p.text}</span>)}
          </div>
          <TimeNum read={readTime} />
        </div>
      </header>

      <div className="board" ref={boardRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {grid.flatMap((row, r) => row.map((p, c) => p && (
          <Piece key={p.id} piece={p} r={r} c={c} bg={bgs[p.type]} poison={!!p.poison}
            drag={drag && drag.id === p.id ? drag : null}
            glow={['special', 'item'].includes(KIND_BY_ID[p.type].group) || (KIND_BY_ID[p.type].group === 'tsukidashi' && tsukiActive) || (KIND_BY_ID[p.type].group === 'shime' && shimeActive)} />
        )))}
        {bugs.map((b) => (
          <div key={`${b.id}-${b.n}`} className={`bug${pest === 'mouse' ? ' mouse' : ''}${targeting && !b.dying ? ' target' : ''}${b.dying ? ' dying' : ''}`}
            style={{ transform: `translate(calc(var(--cell) * ${b.c}), calc(var(--cell) * ${b.r}))` }}>
            <img src={b.dying ? '/images/ケムリ.png' : pest === 'mouse' ? `/images/bug/ねずみ${b.side === 'up' || b.side === 'left' ? '上左' : '下右'}.png` : `/images/bug/${b.kind === 'fly' ? 'ハエ' : 'ゴキブリ'}${BUG_SIDE_JA[b.side]}.png`}
              style={b.dying ? { rotate: `${b.rot}deg` } : undefined} alt="" draggable={false} />
          </div>
        ))}
        {drag && <div className="dragbar" style={{ animationDuration: `${diff.dragSec}s` }} />}
        {combo && combo.n >= 2 && <div key={combo.key} className="combo">{combo.n} COMBO!</div>}
        {toast && <div key={toast.key} className="toast">{toast.img && <img src={toast.img} alt="" />}{toast.text}</div>}
        {starting && count !== null && <div className="over"><span key={count} className="countdown">{count}</span></div>}
        {starting && count === null && <div className="over"><img src="/images/乾杯.png" alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} /></div>}
        {over && <div className="over"><img src="/images/終了.png" alt="" /></div>}
      </div>

      <div className="lower">
        <div className="left">
          <div className="row score-row">
            <span className="pt-icon">
              <img src="/images/ポイント.png" alt="" className="row-icon" />
              <i>SCORE</i>
            </span>
            <span className="score"><ScoreDigits value={score} /><small>pt</small></span>
            <div className="pops">
              {pops.map((p) => <span key={p.id} className={`pop ${p.type}`} style={{ animationDuration: `${p.ms}ms` }}>{p.text}</span>)}
            </div>
          </div>
          <div className="row gero-row">
            <GeroIcon gero={gero} itemUntil={itemUntil} burstAt={burstAt} />
            <div className="gauge-wrap">
              <div className="gauge">
                <div className="gauge-fill" style={{ width: `${gero}%` }} />
                {geroRed && (
                  <div key={geroRed.key} className="gauge-add"
                    style={{ left: `${geroRed.from}%`, width: `${geroRed.to - geroRed.from}%` }} />
                )}
                <span className="gauge-num">{Math.ceil(gero - 1e-9)}%</span>
              </div>
              <div className="gauge-label">げろげろゲージ</div>
            </div>
            <div className="beer-count">
              <img src="/images/ビール.png" alt="" />
              <Digits value={fullCount} width={2} />
            </div>
          </div>
          <div className={`items${timeUp ? ' locked' : ''}`}>
            {ITEMS.map(({ img, label }) => (
              <div key={img} className="item-wrap" onClick={() => tapItem(img)}>
                <div className={`item${(itemCounts[img] || 0) > 0 ? '' : ' empty'}${unusable(img) ? ' locked' : ''}${armed === img ? ' armed' : ''}`}>
                  <img src={`/images/${img}.png`} alt={label} />
                  <span className="item-num">{itemCounts[img] || 0}</span>
                </div>
                <span className="item-label">{armed === img ? 'もう一度' : label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="right">
          {fever && (
            <div className="fever-text" aria-hidden="true">
              {'FEVER!'.split('').map((ch, i) => <span key={i} style={{ color: `hsl(${i * 60}, 95%, 60%)` }}>{ch}</span>)}
            </div>
          )}
          <BeerMug paused={paused} introFull={starting} level={pours / BEER_FULL} fever={fever} feverStart={feverStart} feverMs={feverSec * 1000} pourTotal={pourTotal} />
        </div>
      </div>
    </div>
  )
}
