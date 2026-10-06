export const BOARD = 6          // 盤面サイズ（6×6）
export const CELL = 60          // 1マスのpx
export const PIECE_BOX = 50     // 画像を収める固定枠のpx
export const GAME_SEC = 100     // 制限時間
export const FEVER_SEC = 10     // フィーバー時間
export const BEER_FULL = 10     // 満タンまでの注ぎ回数
export const TSUKIDASHI_SEC = 25 // 開始からこの秒数の間、つきだしが1.5倍
export const SHIME_SEC = 25      // 終了前のこの秒数の間、しめが2倍
export const GERO_PENALTY = 0.25 // げろげろ100%でスコアが減る割合

const food = (name, group = 'main', dir = '') => ({
  id: name,
  group,
  src: `/images/food/${dir}${name}.png`,
})

export const MAIN_KINDS = ['おでん', 'たこわさ', 'だし巻き卵', 'ポテト盛り', '串カツ', '刺身盛り', '唐揚げ', '天ぷら', '焼き魚', '焼き鳥']
  .map((n) => food(n))
export const TSUKIDASHI_KINDS = ['きゅうり', 'ポテトサラダ', '冷やっこ', '枝豆']
  .map((n) => food(n, 'tsukidashi', 'つきだし/'))
export const SHIME_KINDS = ['お茶漬け', '焼きおにぎり']
  .map((n) => food(n, 'shime', 'しめ/'))

export const ALL_KINDS = [...MAIN_KINDS, ...TSUKIDASHI_KINDS, ...SHIME_KINDS]

// アイテム（所持枠に並ぶ5種）。見出しは表示用の別名
export const ITEMS = [
  { weight: 2, img: 'お冷', label: 'お冷' },
  { weight: 1.5, img: '日本酒', label: '日本酒' },
  { weight: 3, img: 'ストップウォッチ', label: '延長' },
  { weight: 2, img: 'ハリセン', label: 'ハリセン' },
  { weight: 1.5, img: '呼び鈴', label: '呼び鈴' },
]
export const WATER_GERO = 30     // お冷：げろげろゲージの減少量(%)
export const SAKE_GERO = 50      // 日本酒：げろげろゲージの増加量(%)
export const EXTEND_SEC = 12     // 延長：制限時間の延長秒数

// 宝箱イベント用の特殊ピース（通常の種類には含めない）
export const CHEST = '宝箱1-1'
export const CHEST_OPEN = '宝箱1-2'
export const KEY = '鍵1'
// 補充1個あたりの出現率（宝箱・鍵それぞれ盤面に1個まで）
export const SPECIAL_RATES = { [CHEST]: 0.15, [KEY]: 0.15 }
export const SPECIAL_MAX_EACH = 2 // 宝箱・鍵それぞれ、盤面に出せる上限
export const SPECIAL_FEVER_MULT = 2 // フィーバー中は出現率がさらにこの倍率
const SPECIAL_KINDS = [CHEST, CHEST_OPEN, KEY].map((n) => ({ id: n, group: 'special', src: `/images/${n}.png` }))
export const itemTypeId = (img) => `item:${img}`
const ITEM_KINDS = ITEMS.map((it) => ({ id: itemTypeId(it.img), group: 'item', src: `/images/${it.img}.png` }))

export const KIND_BY_ID = Object.fromEntries([...ALL_KINDS, ...SPECIAL_KINDS, ...ITEM_KINDS].map((k) => [k.id, k]))

// 1ゲームで使う種類数（多すぎると揃いにくいため）
export const MAIN_PER_GAME = 4

const BUG_MAX_TOTAL = 3
export const DIFFICULTY = {
  easy:   { label: 'しらふ',   sub: 'やさしい', geroAdd: 10, geroReset: 0,  mult: 0.8, dragSec: 10, bugRate: 0, bugMax: 0, exclude: ['きゅうり', 'たこわさ', 'ポテト盛り', '串カツ', 'おでん'] },
  normal: { label: 'ほろ酔い', sub: 'ふつう',   geroAdd: 25, geroReset: 30, mult: 1.2, dragSec: 7, bugRate: 0.16, bugMax: 2, exclude: ['たこわさ', 'おでん'] },
  hard:   { label: '泥酔',     sub: 'むずかしい', geroAdd: 100 / 3, geroReset: 40, mult: 2.0, dragSec: 5, bugRate: 0.32, bugMax: BUG_MAX_TOTAL, exclude: [] },
}

export const NOTES = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ', 'ド2']

// ---- 虫 ----
export const BUG_LOTTERY_MS = 5000   // 出現の抽選間隔（スタートから5秒おき）
export const BUG_FREE_MS = 10000     // ゲーム開始からこの間は虫が出ない
export const BUG_STAY_MS = 7000      // 1マスに滞在する時間（超えるとピースが毒になり、次のマスへ）
export const BUG_MAX = { roach: 2, fly: 3, total: BUG_MAX_TOTAL } // 種類ごとの上限と、合計の上限（難易度ごとの bugMax がさらに絞る）
export const POISON_TIME_SEC = 0.5   // 毒ピースを消すと1個ごとに減る秒数
export const POISON_GERO = 5         // 毒ピースを消すと1個ごとに増えるげろげろ(%)
export const BELL_CURE = 6           // 呼び鈴で解除できる毒ピースの数
export const BUG_SIDE_JA = { up: '上', down: '下', left: '左', right: '右' }

export const TITLE_MIN_PT = 1000 // 称号を獲得できる、最低のスコア（素点）
