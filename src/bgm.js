// bgm.js — BGM（通常時とフィーバー時の2曲をループ再生）。音量は、ゲーム設定のBGM音量に合わせる
import { getSettings, subscribe } from './settings'
import { createLoop } from './sound'

// 効果音より小さくするための係数。BGM音量スライダーが100%でも、効果音(標準0.6)と同じ程度に収まる
const BGM_GAIN = 0.6
const volume = () => Math.min(1, getSettings().bgmVolume * BGM_GAIN)

let normal = null
let fever = null
let mode = 'stop' // 'normal' | 'fever' | 'stop'
let paused = false

const ensure = () => {
  normal ??= createLoop('BGM')
  fever ??= createLoop('フィーバー時')
}

// いまの状態に合わせて、再生・停止・音量をそろえる
function sync() {
  if (!normal) return
  normal.setVolume(volume())
  fever.setVolume(volume())
  if (mode === 'normal' && !paused) normal.play(); else normal.pause()
  if (mode === 'fever' && !paused) fever.play(); else fever.pause()
}
subscribe(sync) // 設定で音量を変えたら、すぐ反映

export const bgm = {
  // ゲーム開始（通常のBGMを頭から）
  start() { ensure(); normal.stop(); fever.stop(); mode = 'normal'; paused = false; sync(); normal.play(true) },
  // フィーバー開始・終了で曲を切り替える（通常のBGMは、止めた位置から続きを流す）
  setFever(on) {
    if (mode === 'stop') return
    ensure()
    if (on) { mode = 'fever'; fever.stop() } else mode = 'normal'
    sync()
  },
  pause() { paused = true; sync() },
  resume() { paused = false; sync() },
  stop() { mode = 'stop'; paused = false; normal?.stop(); fever?.stop() },
  // 確認用：いま流れている曲
  playing() { return { normal: !!normal?.playing, fever: !!fever?.playing, mode } },
}
