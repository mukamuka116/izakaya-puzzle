import { memo, useEffect, useState } from 'react'
import { KIND_BY_ID } from '../constants'

// 画像は固定サイズの枠に、縦横比を保ったまま収める（object-fit: contain）
function Piece({ piece, r, c, drag, glow, bg, poison }) {
  const [shown, setShown] = useState(piece.fromR === undefined)
  useEffect(() => {
    if (shown) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(id)
  }, [shown])

  const row = shown ? r : piece.fromR
  const style = drag
    ? { transform: `translate(${drag.x}px, ${drag.y}px) scale(1.15)`, transition: 'none', zIndex: 10 }
    : { transform: `translate(calc(var(--cell) * ${c}), calc(var(--cell) * ${row}))` }

  return (
    <div className={`piece${piece.clearing ? ' clearing' : ''}${glow ? ' glow' : ''}`} style={style}>
      <div className="pic" style={{ background: poison ? `linear-gradient(135deg, transparent 55%, hsla(280, 80%, 45%, 0.9) 100%), ${bg}` : bg }}>
        <img src={KIND_BY_ID[piece.type].src} alt="" draggable={false} />
        {poison && <img src="/images/どくろ.png" alt="" className="skull" draggable={false} />}
      </div>
    </div>
  )
}

export default memo(Piece)
