// rank.mjs — ランク。累計ビールから決まる（画面の src/rank.js と同じ内容）
export const RANK_MAX = 100;
export const RANK_MIN_PT = 500; // このスコア（素点）未満のゲームは、記録も累計も更新しない

// ランク r から r+1 に上がるのに必要なビール：5 ＋ r 杯
export function rankInfo(totalBeers = 0) {
  let rank = 0;
  let left = Math.max(0, Math.floor(totalBeers) || 0);
  while (rank < RANK_MAX && left >= 5 + rank) { left -= 5 + rank; rank++; }
  return { rank, into: left, need: rank >= RANK_MAX ? null : 5 + rank };
}
