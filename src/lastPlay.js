// lastPlay.js — 直近に記録を送ったゲームの時刻（ランキングの My で、そのスコアを赤く点滅させるために使う）
let lastAt = 0
export const setLastPlayAt = (at) => { lastAt = at || 0 }
export const getLastPlayAt = () => lastAt
