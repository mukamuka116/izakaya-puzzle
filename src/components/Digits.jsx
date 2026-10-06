// 固定桁数の数字。上位の0は薄く表示する（例: 03 → 薄い0 + 3）
export default function Digits({ value, width = 2 }) {
  const max = 10 ** width - 1
  const text = String(Math.max(0, Math.min(Math.round(value), max))).padStart(width, '0')
  const lead = text.search(/[1-9]/) === -1 ? width - 1 : text.search(/[1-9]/)
  return (
    <span className="digits">
      {text.split('').map((d, i) => <b key={i} className={i < lead ? 'dim' : ''}>{d}</b>)}
    </span>
  )
}
