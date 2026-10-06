// titles.js — 称号の一覧（lambda/api/titles.mjs と同じ内容。gen_titles.py から生成）
// yomi は、五十音順に並べるための読みがな
export const NONE_TITLE = 'なし' // 称号を表示しない状態（初期値）
export const TITLES = [
  { name: "酒呑童子", yomi: "しゅてんどうじ" },
  { name: "怒り上戸", yomi: "おこりじょうご" },
  { name: "泣き上戸", yomi: "なきじょうご" },
  { name: "笑い上戸", yomi: "わらいじょうご" },
  { name: "下戸", yomi: "げこ" },
  { name: "酒池肉林", yomi: "しゅちにくりん" },
  { name: "飲んでも飲まれるな", yomi: "のんでものまれるな" },
  { name: "無礼講", yomi: "ぶれいこう" },
  { name: "酒は百薬の長", yomi: "さけはひゃくやくのちょう" },
  { name: "酔拳", yomi: "すいけん" },
  { name: "五臓六腑にしみる", yomi: "ごぞうろっぷにしみる" },
  { name: "はしご酒", yomi: "はしござけ" },
  { name: "幹事", yomi: "かんじ" },
  { name: "酒豪", yomi: "しゅごう" },
  { name: "酒乱", yomi: "しゅらん" },
  { name: "痛飲", yomi: "つういん" },
  { name: "禁酒", yomi: "きんしゅ" },
  { name: "アルコール中毒", yomi: "あるこーるちゅうどく" },
  { name: "スサノオ", yomi: "すさのお" },
  { name: "ヤマタノオロチ", yomi: "やまたのおろち" },
  { name: "とりあえず生中！", yomi: "とりあえずなまちゅう" },
  { name: "水のように飲む", yomi: "みずのようにのむ" },
  { name: "鉄の肝臓", yomi: "てつのかんぞう" },
  { name: "酒場の主", yomi: "さかばのぬし" },
  { name: "常連客", yomi: "じょうれんきゃく" },
  { name: "お酌名人", yomi: "おしゃくめいじん" },
  { name: "宴会部長", yomi: "えんかいぶちょう" },
  { name: "杯を交わす", yomi: "さかずきをかわす" },
  { name: "酒盛り", yomi: "さかもり" },
  { name: "飲みニケーション", yomi: "のみにけーしょん" },
  { name: "一気飲み", yomi: "いっきのみ" },
  { name: "ちゃんぽん", yomi: "ちゃんぽん" },
  { name: "記憶喪失", yomi: "きおくそうしつ" },
  { name: "二日酔い", yomi: "ふつかよい" },
  { name: "悪酔い", yomi: "わるよい" },
  { name: "二次会", yomi: "にじかい" },
  { name: "三次会", yomi: "さんじかい" },
  { name: "終電逃し", yomi: "しゅうでんのがし" },
  { name: "朝までコース", yomi: "あさまでこーす" },
  { name: "もう一杯！", yomi: "もういっぱい" },
  { name: "ラストオーダー", yomi: "らすとおーだー" },
  { name: "飲み放題", yomi: "のみほうだい" },
  { name: "寝酒", yomi: "ねざけ" },
  { name: "昼酒", yomi: "ひるざけ" },
  { name: "朝酒", yomi: "あさざけ" },
  { name: "やけ酒", yomi: "やけざけ" },
  { name: "酔っぱらい", yomi: "よっぱらい" },
  { name: "酒好き", yomi: "さけずき" },
  { name: "王様", yomi: "おうさま" },
  { name: "酒仙人", yomi: "しゅせんにん" },
  { name: "酒神様", yomi: "さけがみさま" },
  { name: "うわばみ", yomi: "うわばみ" },
  { name: "ザル", yomi: "ざる" },
  { name: "ノンアル", yomi: "のんある" },
  { name: "運転代行", yomi: "うんてんだいこう" },
]

// 称号リスト：獲得済みを上に、未獲得を下にまとめ、それぞれ五十音順。「なし」は、獲得済みの先頭
export function listTitles(owned) {
  const have = new Set(owned || [])
  const byYomi = (a, b) => a.yomi.localeCompare(b.yomi, 'ja')
  const own = TITLES.filter((t) => have.has(t.name)).sort(byYomi)
  const rest = TITLES.filter((t) => !have.has(t.name)).sort(byYomi)
  return [
    { name: NONE_TITLE, owned: true },
    ...own.map((t) => ({ name: t.name, owned: true })),
    ...rest.map((t) => ({ name: t.name, owned: false })),
  ]
}
