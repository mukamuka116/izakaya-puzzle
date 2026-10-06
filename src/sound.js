// sound.js — 音の再生。
// 音は、最初にまとめて読み込み・変換しておき、鳴らすときは変換済みのデータをすぐ再生する（遅れ・取りこぼしを防ぐ）。
// スマホのブラウザは「最初のタップ」までは音を出せないので、最初の操作で再生機能を有効にする。

export const SOUND_NAMES = [
  'ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ', 'ド2',
  '「1」', '「2」', '「3」', '開始', '終了', '吐く', '飲む',
  'アイテム獲得・使用', '宝箱を開ける', 'ハリセン', '呼び鈴', '決定ボタンを押す', 'ボタン押下',
  'BGM', 'フィーバー時',
]

let ctx = null
const buffers = new Map()
const loading = new Map()

const getCtx = () => {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  return ctx
}

// iPhone(iOS 17以降)のサイレントスイッチがONでも、ゲームの音を鳴らす設定
try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch { /* 対応していない端末は、そのまま */ }

// 1つの音を読み込んで変換する（読み込み済みなら、すぐ返す）
export function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (loading.has(name)) return loading.get(name)
  const c = getCtx()
  if (!c) return Promise.resolve(null)
  const p = fetch(`/sounds/${name}.mp3`)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
    .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej))) // 古いSafariでも動く形
    .then((b) => { buffers.set(name, b); return b })
    .catch(() => { loading.delete(name); return null }) // 失敗したら、次に鳴らすときに、もう一度試す
  loading.set(name, p)
  return p
}

// すべての音を先に読み込む（失敗した音があっても、ほかは使える）
export const preloadAll = () => Promise.all(SOUND_NAMES.map(load))

export const isLoaded = (name) => buffers.has(name)
export const loadedCount = () => buffers.size
export const state = () => (ctx ? ctx.state : 'none')

// 効果音を1回鳴らす。volume は 0〜1
export function playSound(name, volume = 0.6) {
  const c = getCtx()
  const b = buffers.get(name)
  if (c && b) {
    if (c.state !== 'running') c.resume().catch(() => {})
    const src = c.createBufferSource()
    src.buffer = b
    const g = c.createGain()
    g.gain.value = volume
    src.connect(g).connect(c.destination)
    src.start(0)
    return
  }
  // まだ読み込み中：読み込みを進めつつ、とりあえず普通のAudioで鳴らす
  load(name)
  try {
    const a = new Audio(`/sounds/${name}.mp3`)
    a.volume = volume
    a.play().catch(() => {})
  } catch { /* 鳴らせなくても、ゲームは続ける */ }
}

// ループ再生（BGMなど）。一時停止すると、止めた位置から続きを流せる
export function createLoop(name) {
  let src = null, gain = null, t0 = 0, offset = 0, volume = 0.5, want = false
  const begin = () => {
    const c = getCtx()
    const b = buffers.get(name)
    if (!c || !b) { load(name).then(() => { if (want && !src) begin() }); return } // 読み込みが終わったら、始める
    if (c.state !== 'running') c.resume().catch(() => {})
    const at = offset % b.duration
    src = c.createBufferSource()
    src.buffer = b
    src.loop = true
    gain = c.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(c.destination)
    src.start(0, at)
    t0 = c.currentTime - at
  }
  const halt = () => {
    if (!src) return
    try { src.stop() } catch { /* すでに止まっている */ }
    src.disconnect()
    src = null
  }
  return {
    play(fromStart = false) { if (fromStart) { halt(); offset = 0 } want = true; if (!src) begin() },
    pause() { want = false; if (src) { offset = getCtx().currentTime - t0; halt() } },
    stop() { want = false; offset = 0; halt() },
    setVolume(v) { volume = v; if (gain) gain.gain.value = v },
    get playing() { return !!src },
  }
}

// ---- 最初の操作で、再生機能を有効にする ----
function unlock() {
  const c = getCtx()
  if (!c) return
  if (c.state !== 'running') c.resume().catch(() => {})
  try { // 無音を1回鳴らして、iOSの制限を外す
    const s = c.createBufferSource()
    s.buffer = c.createBuffer(1, 1, 22050)
    s.connect(c.destination)
    s.start(0)
  } catch { /* 外せなくても、次の操作でもう一度試す */ }
  if (c.state === 'running') EVENTS.forEach((e) => window.removeEventListener(e, unlock, true))
}
const EVENTS = ['pointerdown', 'touchend', 'click', 'keydown']
EVENTS.forEach((e) => window.addEventListener(e, unlock, true))
// ほかのアプリから戻ったときなど、止まっていたら動かし直す
document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}) })
