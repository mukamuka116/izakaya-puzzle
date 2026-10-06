// settings.js — ゲーム設定（BGM音量・効果音音量・省電力モード）。端末に保存し、ログイン中はアカウントにも保存する
import { useSyncExternalStore } from 'react'

const KEY = 'pb_settings'
export const DEFAULT_SETTINGS = { bgmVolume: 0.2, sfxVolume: 0.8, powerSave: false, pest: 'bug' } // pest：お邪魔キャラ（bug＝ハエ・ゴキブリ／mouse＝ねずみ）

const clamp01 = (v, d) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d)
const clean = (s) => ({
  bgmVolume: clamp01(s?.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
  sfxVolume: clamp01(s?.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
  powerSave: !!s?.powerSave,
  pest: s?.pest === 'mouse' ? 'mouse' : 'bug',
})

function load() {
  try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return { ...DEFAULT_SETTINGS } }
}

let state = load()
const listeners = new Set()

// 省電力モードは body のクラスで、光る・点滅する演出を止める
const apply = () => document.body.classList.toggle('power-save-mode', state.powerSave)
apply()

function commit(next) {
  state = clean(next)
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 保存できなくても動かす */ }
  apply()
  listeners.forEach((l) => l())
}

export const getSettings = () => state
export const setSettings = (patch) => commit({ ...state, ...patch })
export const resetSettings = () => commit({ ...DEFAULT_SETTINGS, pest: state.pest }) // お邪魔キャラは、リセットしても変えない
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const useSettings = () => useSyncExternalStore(subscribe, getSettings)

// 効果音の音量：標準の音量(0.8)のときは、元の音量そのまま
export const sfxVolume = (base = 0.6) => Math.min(1, (base * state.sfxVolume) / DEFAULT_SETTINGS.sfxVolume)
