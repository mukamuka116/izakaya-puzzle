# Puzzle & Beers API（Lambda + DynamoDB）

アカウント管理・スコア管理・ランキングを1本の Lambda（`api/`）で提供する。Google ログインやメールアドレスなどの個人情報は使わない。

## 確認済みの動作
`api/test/run.mjs` が、メモリ上のDBでAPI全体を動かして12項目を確認する（AWSには接続しない）。

```
cd lambda/api
node test/run.mjs
```

## API
| メソッド・パス | 内容 | ログインの札 |
|---|---|---|
| GET /account/questions | 秘密の質問の一覧（固定8個） | 不要 |
| POST /account/register | 登録（ID・パスワード・ニックネーム・アバター・質問ID・答え） | 不要 |
| POST /account/login | ログイン → 札を返す | 不要 |
| POST /account/recovery/verify | ID＋質問の選択＋答え → 一致したら再設定用の札（5分） | 不要 |
| POST /account/recovery/reset | 再設定用の札＋新しいパスワード → ログイン済みの札を返す | 不要 |
| GET /account/me | プロフィール・ベスト5・累積ビール数・累積げろげろ回数 | 必要 |
| PUT /account/me | ニックネーム・アバター・ゲーム設定の更新 | 必要 |
| POST /account/password | パスワード変更（現在のパスワードが必要。他の端末のログインは切れる） | 必要 |
| POST /account/delete | アカウント削除（パスワードが必要。ランキングの記録も消える） | 必要 |
| POST /scores/start | ゲーム開始の札（難易度を渡す。30分以内に結果を送る） | 必要 |
| POST /scores/submit | スコア送信（開始の札、素点、最終pt、ビール数、げろげろ数） | 必要 |
| GET /ranking?difficulty=easy\|normal\|hard\|any&period=today\|all | ランキング（上位100位＋自分の順位） | 任意 |

札は `Authorization: Bearer <札>` で送る。

### ランキングの返し方
- 8種類：難易度（しらふ・ほろ酔い・泥酔・**any＝難易度を問わない**）×（本日・総合）。
- 各行は「順位・ニックネーム・アバター・最終pt・素点・難易度・ビール数・げろげろ数・mine」。**ログインIDは返さない。**
- `mine: true` は、ログイン中の本人の行（画面で赤く点滅させる）。
- `me` は本人の順位。101位以下のとき `me.outside: true` になり、順位表の下に「あなたの順位」を別枠で出す。
- 本日は日本時間の0時で切り替わる。本日の記録は、日が変わって2日後にDynamoDBのTTLで自動削除される。

## テーブル（DynamoDB・オンデマンド課金）
### PuzzleBeersAccounts
- パーティションキー：`loginId`（文字列）
- 主な項目：`passwordHash`・`answerHash`（scrypt＋ユーザーごとの塩）、`nickname`、`avatar`、`settings`、`questionId`、`best`（ベスト5）、`totalBeers`、`totalGero`、`rankKeys`（各ランキングでの自分の記録の控え）、`failCount`・`lockUntil`（ロック）、`tokenVer`（パスワード変更で古い札を無効にする）、`ver`（同時更新の防止）

### PuzzleBeersScores
- パーティションキー：`board`（例 `all#hard`、`d:2026-10-05#any`）、ソートキー：`sk`
- `sk` は「9999999999 − 最終pt」を10桁にそろえた文字列＋時刻＋ID。小さい順に取り出すと上位から並ぶ。同点は先に出した人が上位。
- TTL属性：`ttl`（エポック秒）。ゲーム開始の札の使用済み印（`board = USED`）にも付ける。

## 対策
- パスワード・秘密の答え：scrypt＋塩でハッシュ化。答えは、全角半角・大文字小文字・カタカナ→ひらがな・空白をそろえてから比較。
- **ログイン・秘密の答えの失敗が合計10回で、そのIDを10分ロック。** 存在しないIDも同じ時間をかけて照合し、IDの有無を悟らせない。
- スコア：開始の札（署名付き・1回だけ有効）、最短・最長のプレイ時間、素点の上限（経過秒あたり）、最終pt＝素点×難易度倍率の一致、ビール数・げろげろ数の上限を確認する。
- API Gateway 側で、回数制限（スロットル）を設定する。

## 公開状況（AWS・東京リージョン）
| 項目 | 名前 |
|---|---|
| API | `puzzle-beers-api`（https://qt8oye8dhb.execute-api.ap-northeast-1.amazonaws.com） |
| Lambda | `puzzleBeersApi`（Node.js 24） |
| DynamoDB | `PuzzleBeersAccounts`、`PuzzleBeersScores`（TTL: `ttl`） |
| IAM ロール | `puzzleBeersApi-role` |

Takoyaki Cascade のリソースには触れていない。画面側は、`izakaya_puzzle/.env` の `VITE_API_URL` で、このAPIにつながっている（空にするとダミーに戻る）。

### 作り直し・更新
- 初回の作成：`bash deploy.sh`（すでにあるものは飛ばす。`AUTH_SECRET` は、中で乱数から作り、画面には出さない）
- コードだけの更新：`bash update-code.sh`（環境変数・秘密・テーブル・APIには触れない）
- 更新の前に `cd api && node test/run.mjs` で12項目のテストを通すこと。

### あとで決めること
- `ALLOW_ORIGIN` は、CloudFront の配信URLだけに絞ってある。独自ドメインを付けたときは、`deploy-web.sh` の中の `DIST_DOMAIN` を、そのドメインに合わせて変える。
- `AUTH_SECRET` を変えると、全員のログインが切れる。
- API Gateway のスロットルは、毎秒10回・バースト20回。

## 画面の公開（S3 + CloudFront）
| 項目 | 名前 |
|---|---|
| 公開URL | https://d316zzwdl94civ.cloudfront.net |
| S3 バケット | `puzzle-beers-web-092958527830`（非公開。CloudFront だけが読める） |
| CloudFront 配信 | `EYHBCSBEPJTOP`（コメント: Puzzle & Beers）、OAC: `puzzle-beers-oac` |

- 更新するとき：`cd izakaya_puzzle && bash deploy-web.sh`（ビルド → アップロード → キャッシュの入れ替え。作成済みのものは飛ばす）。
- `--delete` を付けているので、`dist` にないファイルは、バケットからも消える。
- `index.html` と `manifest` は常に最新を取りに行き、`assets/` は長期キャッシュ、画像・音は1日キャッシュ。
- Takoyaki Cascade のバケット・配信には触れていない。
