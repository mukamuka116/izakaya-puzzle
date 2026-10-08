// db.mjs — DynamoDBへのアクセスを1か所にまとめる。
// 上の層（account / scores）はここの関数だけを使うので、テストでは test/memdb.mjs と差し替えられる。
//
// テーブル
//   アカウント表 (ACCOUNTS_TABLE) : キー loginId
//   スコア表     (SCORES_TABLE)   : キー board（ランキングの種類）+ sk（順位の並び順キー）
//     ・ランキングの記録 … board 例 "all#hard" / "d:2026-10-05#any"、sk は小さい順＝上位
//     ・ゲーム開始の札の使用済み印 … board "USED"、sk 札のID（ttlで自動削除）

let cached;

export async function getDb() {
  if (cached) return cached;
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand } = await import('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const ACCOUNTS = process.env.ACCOUNTS_TABLE;
  const SCORES = process.env.SCORES_TABLE;

  cached = {
    async getAccount(loginId) {
      const r = await doc.send(new GetCommand({ TableName: ACCOUNTS, Key: { loginId } }));
      return r.Item ?? null;
    },
    // 新規作成。同じIDがあれば false
    async createAccount(item) {
      try {
        await doc.send(new PutCommand({
          TableName: ACCOUNTS, Item: { ...item, ver: 1 }, ConditionExpression: 'attribute_not_exists(loginId)',
        }));
        return true;
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') return false;
        throw e;
      }
    },
    // 楽観ロック：読み込んだ時点の ver と同じときだけ上書き。ずれていたら false
    async saveAccount(item) {
      try {
        await doc.send(new PutCommand({
          TableName: ACCOUNTS, Item: { ...item, ver: item.ver + 1 },
          ConditionExpression: 'ver = :v', ExpressionAttributeValues: { ':v': item.ver },
        }));
        item.ver += 1;
        return true;
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') return false;
        throw e;
      }
    },
    async deleteAccount(loginId) {
      await doc.send(new DeleteCommand({ TableName: ACCOUNTS, Key: { loginId } }));
    },
    async getAccounts(ids) {
      const out = {};
      for (let i = 0; i < ids.length; i += 100) {
        const keys = ids.slice(i, i + 100).map((loginId) => ({ loginId }));
        const r = await doc.send(new BatchGetCommand({ RequestItems: { [ACCOUNTS]: { Keys: keys, ProjectionExpression: 'loginId, nickname, avatar, totalBeers, #t', ExpressionAttributeNames: { '#t': 'title' } } } }));
        for (const it of r.Responses?.[ACCOUNTS] ?? []) out[it.loginId] = it;
      }
      return out;
    },
    async putScore(item) {
      await doc.send(new PutCommand({ TableName: SCORES, Item: item }));
    },
    async deleteScore(board, sk) {
      await doc.send(new DeleteCommand({ TableName: SCORES, Key: { board, sk } }));
    },
    async queryBoard(board, limit) {
      const r = await doc.send(new QueryCommand({
        TableName: SCORES, KeyConditionExpression: 'board = :b', ExpressionAttributeValues: { ':b': board }, Limit: limit,
      }));
      return r.Items ?? [];
    },
    // sk より上位（キーが小さい）の件数。順位 = この件数 + 1
    async countBefore(board, sk) {
      let count = 0, last;
      do {
        const r = await doc.send(new QueryCommand({
          TableName: SCORES, Select: 'COUNT', ExclusiveStartKey: last,
          KeyConditionExpression: 'board = :b AND sk < :s', ExpressionAttributeValues: { ':b': board, ':s': sk },
        }));
        count += r.Count ?? 0;
        last = r.LastEvaluatedKey;
      } while (last);
      return count;
    },
    // ゲーム開始の札の使用済み印。すでに使われていたら false（二重送信の防止）
    async claimStart(nonce, ttlEpochSec) {
      try {
        await doc.send(new PutCommand({
          TableName: SCORES, Item: { board: 'USED', sk: nonce, ttl: ttlEpochSec },
          ConditionExpression: 'attribute_not_exists(sk)',
        }));
        return true;
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') return false;
        throw e;
      }
    },
  };
  return cached;
}
