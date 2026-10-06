import { BOARD, CHEST, CHEST_OPEN, KEY, MAIN_KINDS, MAIN_PER_GAME, SHIME_KINDS, SPECIAL_FEVER_MULT, SPECIAL_MAX_EACH, SPECIAL_RATES, TSUKIDASHI_KINDS } from './constants'

let nextId = 1
const newPiece = (kinds, extra = {}) => ({
  id: nextId++,
  type: kinds[Math.floor(Math.random() * kinds.length)].id,
  ...extra,
})

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]

// 1ゲームで使う種類：通常4 + つきだし1 + しめ1
export function pickKinds(exclude = []) {
  const ok = (list) => list.filter((k) => !exclude.includes(k.id))
  return [...shuffle(ok(MAIN_KINDS)).slice(0, MAIN_PER_GAME), pickOne(ok(TSUKIDASHI_KINDS)), pickOne(ok(SHIME_KINDS))]
}

// 最初から3つ揃っていない盤面を作る
export function makeGrid(kinds) {
  const g = Array.from({ length: BOARD }, () => Array(BOARD).fill(null))
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      let p
      do {
        p = newPiece(kinds)
      } while (
        (c >= 2 && g[r][c - 1].type === p.type && g[r][c - 2].type === p.type) ||
        (r >= 2 && g[r - 1][c].type === p.type && g[r - 2][c].type === p.type)
      )
      g[r][c] = p
    }
  }
  return g
}

// 通常の料理ピースだけが揃えて消せる（宝箱・鍵・アイテムは対象外）
const matchable = (p) => !!p && p.type !== CHEST && p.type !== KEY && p.type !== CHEST_OPEN && !p.type.startsWith('item:')

// 詰み判定：同じ料理が3つ以上ある種類がなく、宝箱と鍵の組み合わせもない盤面
export function isDeadlocked(grid) {
  const count = {}
  let chest = false, key = false
  for (const p of grid.flat()) {
    if (!p) continue
    if (p.type === CHEST) chest = true
    else if (p.type === KEY) key = true
    else if (matchable(p)) count[p.type] = (count[p.type] || 0) + 1
  }
  if (chest && key) return false
  return !Object.values(count).some((n) => n >= 3)
}

// 3つ以上並んだ塊を探す（つながった同種は1グループ＝1コンボ）
export function findGroups(grid) {
  const marked = Array.from({ length: BOARD }, () => Array(BOARD).fill(false))
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; ) {
      let e = c
      while (e + 1 < BOARD && grid[r][e + 1]?.type === grid[r][c]?.type) e++
      if (matchable(grid[r][c]) && e - c + 1 >= 3) for (let k = c; k <= e; k++) marked[r][k] = true
      c = e + 1
    }
  }
  for (let c = 0; c < BOARD; c++) {
    for (let r = 0; r < BOARD; ) {
      let e = r
      while (e + 1 < BOARD && grid[e + 1][c]?.type === grid[r][c]?.type) e++
      if (matchable(grid[r][c]) && e - r + 1 >= 3) for (let k = r; k <= e; k++) marked[k][c] = true
      r = e + 1
    }
  }
  const seen = Array.from({ length: BOARD }, () => Array(BOARD).fill(false))
  const groups = []
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      if (!marked[r][c] || seen[r][c]) continue
      const type = grid[r][c].type
      const cells = []
      const stack = [[r, c]]
      seen[r][c] = true
      while (stack.length) {
        const [y, x] = stack.pop()
        cells.push({ r: y, c: x })
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy, nx = x + dx
          if (ny < 0 || nx < 0 || ny >= BOARD || nx >= BOARD) continue
          if (seen[ny][nx] || !marked[ny][nx] || grid[ny][nx].type !== type) continue
          seen[ny][nx] = true
          stack.push([ny, nx])
        }
      }
      groups.push({ type, cells })
    }
  }
  return groups
}

export function dropAndRefill(grid, kinds, fever = false) {
  // 宝箱・鍵は、補充ピースとしてまれに出る（それぞれ盤面に最大2個まで）
  const mult = fever ? SPECIAL_FEVER_MULT : 1
  const onBoard = { [CHEST]: 0, [KEY]: 0 }
  for (const p of grid.flat()) if (p && !p.clearing && p.type in onBoard) onBoard[p.type]++
  const specialOrNormal = (extra) => {
    for (const t of [CHEST, KEY]) {
      if (onBoard[t] < SPECIAL_MAX_EACH && Math.random() < SPECIAL_RATES[t] * mult) {
        onBoard[t]++
        return { id: nextId++, type: t, ...extra }
      }
    }
    return newPiece(kinds, extra)
  }
  const next = Array.from({ length: BOARD }, () => Array(BOARD).fill(null))
  for (let c = 0; c < BOARD; c++) {
    const col = []
    for (let r = BOARD - 1; r >= 0; r--) {
      const p = grid[r][c]
      if (p && !p.clearing) col.push(p)
    }
    const missing = BOARD - col.length
    for (let r = BOARD - 1, i = 0; r >= missing; r--, i++) next[r][c] = col[i]
    for (let r = 0; r < missing; r++) next[r][c] = specialOrNormal({ fromR: r - missing })
  }
  return next
}
