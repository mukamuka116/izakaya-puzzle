// config.mjs — サーバー側の固定設定（ゲーム側 src/constants.js の難易度倍率と合わせる）

// 秘密の質問（固定8個）。IDだけをDBに保存し、文面はここで管理する
export const QUESTIONS = [
  { id: 1, text: '小学校のときの担任の名字は？' },
  { id: 2, text: '子どもの頃のあだ名は？' },
  { id: 3, text: '初めて飼ったペットの名前は？' },
  { id: 4, text: '子どもの頃の好きだった食べ物は？' },
  { id: 5, text: '初めて行った旅行先は？' },
  { id: 6, text: '一番好きなゲームのタイトルは？' },
  { id: 7, text: '母親の旧姓は？' },
  { id: 8, text: '生まれた街の名前は？' },
];

// 難易度ごとの最終ポイント倍率（スコア検証に使う）
export const DIFFICULTIES = {
  easy: { mult: 0.8 },
  normal: { mult: 1.2 },
  hard: { mult: 2.0 },
};

export const RULES = {
  loginId: /^[A-Za-z0-9_]{4,16}$/,
  passwordMin: 8,
  passwordMax: 32,
  nicknameMax: 10,
  answerMax: 40,
  avatarMax: 20,
};

// 総当たり対策：ログイン・秘密の答えの失敗がこの回数に達したら、ロックする
export const LOCK = { maxFails: 10, lockSeconds: 10 * 60 };

export const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // ログインの札の有効期間（30日）
export const RESET_TTL_SEC = 5 * 60;            // パスワード再設定用の札（5分）
export const TITLE_MIN_PT = 1000;             // 称号を獲得できる、最低のスコア（素点）
export const START_TTL_SEC = 30 * 60;           // ゲーム開始の札（30分以内に結果を送る）

// スコア送信の妥当性チェック（ゲームの仕様に対してゆるめの上限）
export const SCORE_RULES = {
  minElapsedSec: 30,        // 開始から結果送信までの最短（時間が減る要素があるため短めに）
  maxElapsedSec: 30 * 60,
  rawPerSecMax: 3000,       // 経過秒あたりの素点の上限
  rawMax: 5_000_000,
  beersMax: 60,
  geroMax: 60,
};

export const RANKING_LIMIT = 100;
export const BEST_COUNT = 5;
export const TODAY_TTL_BUFFER_SEC = 2 * 24 * 60 * 60; // 本日ランキングの記録は、日が変わった後の2日後に自動削除
