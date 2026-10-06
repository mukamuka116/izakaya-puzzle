// clickSound.js — ゲーム中以外の、ボタンやタブ・選択肢のクリック・タップで「ボタン押下」を鳴らす。
// 例外：ゲーム中でも、中断ボタン・中断中の「再開」「HOMEに戻る」は鳴らす。
// 盤面の操作とアイテムのタップなど、ゲーム中の操作では鳴らさない。
import { playSound } from './sound'
import { sfxVolume } from './settings'

// 押せるもの（ボタン・タブ・リンク・選択肢）だけ。入力欄・ラベル・パネルの外側・余白では鳴らさない
const CLICKABLE = 'button, a, select, summary, [role="button"], [role="option"]'
// ゲーム中でも鳴らすもの
const ALWAYS = '.burger.pause, .pause-layer'

function onClick(e) {
  if (!e.isTrusted) return // プログラムからのクリックは、鳴らさない
  const t = e.target
  if (!(t instanceof Element)) return
  const inGame = document.body.dataset.phase === 'play'
  if (inGame && !t.closest(ALWAYS)) return
  const el = t.closest(CLICKABLE)
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return
  // スライダーは、ドラッグのたびに鳴ると うるさいので対象外（効果音の音量は、離したときに別に鳴らす）
  if (t.closest('input[type="range"]')) return
  playSound('ボタン押下', sfxVolume(0.6))
}

document.addEventListener('click', onClick, true)

// 画面の状態（ゲーム中かどうか）を、body に書いておく
export const setPhase = (phase) => { document.body.dataset.phase = phase }
