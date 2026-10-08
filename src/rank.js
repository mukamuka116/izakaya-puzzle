// rank.js — ログインユーザーのランク。累計ビールから決まる（サーバーの lambda/api/rank.mjs と同じ内容）
export const RANK_MAX = 100
export const RANK_MIN_PT = 500        // このスコア（素点）未満のゲームは、記録も累計も更新しない
const FEVER_BONUS_STEP = 10           // ランク10ごとに
const FEVER_BONUS_SEC = 0.5           // フィーバーが0.5秒のびる

// ランク r から r+1 に上がるのに必要なビール：5 ＋ r 杯（ランク0→1は5杯、1→2は6杯…）
export function rankInfo(totalBeers = 0) {
  let rank = 0
  let left = Math.max(0, Math.floor(totalBeers) || 0)
  while (rank < RANK_MAX && left >= 5 + rank) { left -= 5 + rank; rank++ }
  return { rank, into: left, need: rank >= RANK_MAX ? null : 5 + rank }
}
export const feverBonusSec = (rank) => Math.floor(rank / FEVER_BONUS_STEP) * FEVER_BONUS_SEC

// そのランクになるまでに必要な、累計ビール（ランク0は0杯）
export const beersForRank = (rank) => 5 * rank + (rank * (rank - 1)) / 2
