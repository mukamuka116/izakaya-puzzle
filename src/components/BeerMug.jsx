import { useEffect, useRef } from 'react'
import { createLoop } from '../sound'
import { getSettings, sfxVolume } from '../settings'

const W = 150, H = 210
const L = 12, R = 108, TOP = 26, BOTTOM = 196

/**
 * ビールジョッキ。
 * level: 0〜1（通常時の中身）/ fever: フィーバー中は10秒かけて減る
 * pourTotal: 消したピース累計。増えた分だけ上から注ぐ演出
 */
export default function BeerMug({ level, fever, feverStart, feverMs, pourTotal, introFull, paused }) {
  const ref = useRef(null)
  const st = useRef({ cur: 0, queue: 0, seen: 0, clock: 0, t: 0, bubbles: [], props: {} })
  st.current.props = { level, fever, feverStart, feverMs, introFull, paused }

  useEffect(() => {
    const s = st.current
    const d = pourTotal - s.seen
    if (d > 0) s.queue += d
    s.seen = pourTotal
  }, [pourTotal])

  useEffect(() => {
    const cv = ref.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = W * dpr
    cv.height = H * dpr
    const ctx = cv.getContext('2d')
    const s = st.current
    let raf

    const frame = () => {
      const p = s.props
      if (p.paused) { raf = requestAnimationFrame(frame); s.audio?.stop(); s.drinking = false; return } // 中断中は止める
      s.t++
      const target = p.fever
        ? Math.max(0, 1 - Math.max(0, Date.now() - p.feverStart - 400) / (p.feverMs - 400))
        : p.level
      if (p.introFull) { s.cur = 1; s.draining = true } // 開始前〜乾杯中は満タン（フィーバーではない）
      else if (p.fever) { s.cur = s.cur < target ? s.cur + (target - s.cur) * 0.2 : target; s.draining = false }
      else {
        // 乾杯のあとは、実際の量までゆっくり下げる
        s.cur += (target - s.cur) * (s.draining ? 0.008 : 0.03)
        if (Math.abs(target - s.cur) < 0.02) { s.draining = false; s.cur = target } // 下がりきったらぴたっと止める
      }
      // 中身が減っている間だけ「飲む」音をくり返し再生。下まで下がりきったら止める
      const falling = (s.prev ?? s.cur) - s.cur
      if (falling > 0.0004 && s.cur > 0.003) {
        s.still = 0
        if (!s.drinking) {
          s.drinking = true
          s.audio = s.audio || createLoop('飲む')
          s.audio.setVolume(sfxVolume(0.6))
          s.audio.play(true) // 頭から
        }
      } else if (s.drinking && (++s.still > 6 || s.cur <= 0.003)) {
        s.drinking = false
        s.audio?.stop()
      }
      s.prev = s.cur
      if (s.queue > 0 && ++s.clock >= 36) { s.queue--; s.clock = 0 }

      if (getSettings().powerSave && s.t % 3 !== 0) { raf = requestAnimationFrame(frame); return } // 省電力：描画は3回に1回
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const cur = s.cur
      const foamH = cur > 0.01 ? 6 + cur * 10 : 0
      const surface = BOTTOM - 4 - cur * (BOTTOM - 4 - (TOP + 6)) // 満タンで泡の上端がグラスのふちに届く
      const pouring = s.queue > 0

      // 中身
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(L + 3, TOP - 8, R - L - 6, BOTTOM - TOP + 5, [0, 0, 14, 14])
      ctx.clip()
      if (cur > 0.01) {
        const g = ctx.createLinearGradient(0, surface, 0, BOTTOM)
        g.addColorStop(0, '#ffc436')
        g.addColorStop(1, '#c46808')
        ctx.fillStyle = g
        ctx.fillRect(L, surface + foamH, R - L, BOTTOM)
        ctx.fillStyle = '#fff3d0'
        ctx.fillRect(L, surface, R - L, foamH)
        for (let x = L; x <= R; x += 9) {
          const bump = 3 + Math.sin(s.t * 0.05 + x) * 1.2 + (pouring ? Math.sin(s.t * 0.4 + x * 0.3) : 0)
          ctx.beginPath()
          ctx.arc(x + 4, surface + 1, bump + 3, Math.PI, 0)
          ctx.fill()
        }
        // 泡
        if (s.bubbles.length < 28 && Math.random() < 0.3) {
          s.bubbles.push({ x: L + 8 + Math.random() * (R - L - 16), y: BOTTOM - 6, r: 0.8 + Math.random() * 1.4, v: 0.3 + Math.random() * 0.6 })
        }
        ctx.strokeStyle = 'rgba(255,244,210,0.85)'
        ctx.lineWidth = 0.7
        s.bubbles = s.bubbles.filter((b) => {
          b.y -= b.v
          if (b.y < surface + foamH + 2) return false
          ctx.beginPath()
          ctx.arc(b.x + Math.sin(s.t * 0.1 + b.y) * 0.8, b.y, b.r, 0, Math.PI * 2)
          ctx.stroke()
          return true
        })
      } else {
        s.bubbles = []
      }
      ctx.restore()

      // 満タン（ほぼ100%）：泡がふちからこんもりと盛り上がる（表面張力）
      const swell = Math.max(0, Math.min(1, (cur - 0.92) / 0.08))
      if (swell > 0) {
        const e = swell * swell * (3 - 2 * swell)
        const cx = (L + R) / 2
        const rx = (R - L) / 2 - 1 + e * 3 // ふちより少し外へふくらむ
        const dh = e * (13 + Math.sin(s.t * 0.06) * 0.8 + (pouring ? Math.sin(s.t * 0.4) * 1.2 : 0))
        ctx.fillStyle = '#fff3d0'
        ctx.beginPath()
        ctx.ellipse(cx, TOP + 6, rx, dh + 6, 0, Math.PI, 0)
        ctx.closePath()
        ctx.fill()
        // 泡のつぶつぶ
        ctx.fillStyle = '#ffe9b0'
        for (let i = 0; i < 7; i++) {
          const bx = cx - rx * 0.75 + (rx * 1.5 * i) / 6
          const k = 1 - Math.pow((bx - cx) / rx, 2)
          ctx.beginPath()
          ctx.arc(bx, TOP + 6 - (dh + 6) * Math.sqrt(Math.max(0, k)) * 0.82, 2 + (i % 3) * 0.7, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.ellipse(cx, TOP + 6, rx, dh + 6, 0, Math.PI * 1.1, Math.PI * 1.45)
        ctx.stroke()
      }

      // 注ぎ口からの流れ
      if (pouring) {
        const x = (L + R) / 2 + Math.sin(s.t * 0.1) * 8
        const end = cur > 0.01 ? surface + foamH : BOTTOM - 4
        const g = ctx.createLinearGradient(0, 0, 0, end)
        g.addColorStop(0, '#ffd45a')
        g.addColorStop(1, '#e8960c')
        ctx.fillStyle = g
        ctx.fillRect(x - 3.5, 0, 7, Math.max(0, end))
      }

      // ガラス
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(L, TOP + 10) // ガラスのふちの上端を、両側とも10px短くする
      ctx.lineTo(L, BOTTOM - 14)
      ctx.arcTo(L, BOTTOM, L + 14, BOTTOM, 14)
      ctx.lineTo(R - 14, BOTTOM)
      ctx.arcTo(R, BOTTOM, R, BOTTOM - 14, 14)
      ctx.lineTo(R, TOP + 10)
      ctx.stroke()
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(R + 2, TOP + 35) // 取っ手：7px下へ
      ctx.bezierCurveTo(R + 48, TOP + 25, R + 48, BOTTOM - 31, R + 2, BOTTOM - 37)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(L + 7, TOP + 6, 8, BOTTOM - TOP - 40)

      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => { cancelAnimationFrame(raf); s.audio?.stop() }
  }, [])

  return <canvas ref={ref} className="mug-canvas" style={{ width: '100%', aspectRatio: `${W} / ${H}` }} />
}
