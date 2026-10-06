// migrate-sortkey.mjs — ランキングの並び順キーを、新しい形式（スコア→ビール→げろげろ→時刻）に作り直す（一度だけ実行）
// 使い方: node migrate-sortkey.mjs          … 確認のみ（何も書き換えない）
//         node migrate-sortkey.mjs --apply  … 実際に書き換える
// 古い形式（「#」で区切って3つ）の記録だけが対象。新しい形式は触らないので、やり直しても安全。
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { sortKey } from './scores.mjs';

const APPLY = process.argv.includes('--apply');
const SCORES = process.env.SCORES_TABLE ?? 'PuzzleBeersScores';
const ACCOUNTS = process.env.ACCOUNTS_TABLE ?? 'PuzzleBeersAccounts';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' }));

async function scanAll(table) {
  const items = [];
  let last;
  do {
    const r = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey: last }));
    items.push(...(r.Items ?? []));
    last = r.LastEvaluatedKey;
  } while (last);
  return items;
}

const scores = (await scanAll(SCORES)).filter((i) => i.board !== 'USED' && String(i.sk).split('#').length === 3);
const map = new Map(); // `${board}|${旧sk}` → 新sk
for (const it of scores) map.set(`${it.board}|${it.sk}`, sortKey(it.finalPt, it.beers ?? 0, it.gero ?? 0, it.at, it.loginId));
console.log(`スコア表：作り直す記録 ${scores.length} 件`);

const accounts = await scanAll(ACCOUNTS);
const fixes = [];
for (const a of accounts) {
  for (const [board, v] of Object.entries(a.rankKeys ?? {})) {
    const n = map.get(`${board}|${v.sk}`);
    if (n) fixes.push({ loginId: a.loginId, board, from: v.sk, to: n });
  }
}
console.log(`アカウント表：控えを直す ${fixes.length} 件`);

if (!APPLY) { console.log('（確認のみ。書き換えるには --apply を付けて実行）'); process.exit(0); }

for (const it of scores) {
  const sk = map.get(`${it.board}|${it.sk}`);
  await doc.send(new PutCommand({ TableName: SCORES, Item: { ...it, sk } }));
  await doc.send(new DeleteCommand({ TableName: SCORES, Key: { board: it.board, sk: it.sk } }));
}
for (const f of fixes) {
  await doc.send(new UpdateCommand({
    TableName: ACCOUNTS, Key: { loginId: f.loginId },
    UpdateExpression: 'SET rankKeys.#b.sk = :n', ConditionExpression: 'rankKeys.#b.sk = :o',
    ExpressionAttributeNames: { '#b': f.board }, ExpressionAttributeValues: { ':n': f.to, ':o': f.from },
  }));
}
console.log('完了');
