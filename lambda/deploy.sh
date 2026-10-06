#!/usr/bin/env bash
# deploy.sh — Puzzle & Beers のAWSリソースを新規に作る（Takoyaki Cascade のものには触れない）
# 使い方（Git Bash など）: cd lambda && bash deploy.sh
#
# ・認証情報のファイルは読まない（aws コマンドが自分で使う）
# ・AUTH_SECRET は、このスクリプトの中で乱数から作り、画面には出さない。一時ファイルは最後に消す
# ・途中で失敗したら止まる。作り直すときは、できたものを確認してから消す（この中には削除の処理は入れていない）
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
ACCOUNTS_TABLE="PuzzleBeersAccounts"
SCORES_TABLE="PuzzleBeersScores"
ROLE_NAME="puzzleBeersApi-role"
FUNC_NAME="puzzleBeersApi"
API_NAME="puzzle-beers-api"

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT   # 一時ファイル（秘密を含む）は、終わったら必ず消す
WORKW="$(cygpath -m "$WORK")"  # Windows版のaws CLIが読める形（C:/...）

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "アカウント: ${ACCOUNT_ID} / リージョン: ${REGION}"

echo "== 1/6 コードをまとめる"
cd "$HERE/api"
npm install --omit=dev --no-audit --no-fund --silent
python - "$WORK/api.zip" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
skip = {'test'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in skip]
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, '.').replace(os.sep, '/'))
PY
echo "   zip: $(du -h "$WORK/api.zip" | cut -f1)"

echo "== 2/6 DynamoDB テーブル"
table_exists() { aws dynamodb describe-table --region "$REGION" --table-name "$1" >/dev/null 2>&1; }
if table_exists "$ACCOUNTS_TABLE"; then echo "   ${ACCOUNTS_TABLE} は作成済み（飛ばす）"; else
aws dynamodb create-table --region "$REGION" --table-name "$ACCOUNTS_TABLE" \
  --attribute-definitions AttributeName=loginId,AttributeType=S \
  --key-schema AttributeName=loginId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null
fi
if table_exists "$SCORES_TABLE"; then echo "   ${SCORES_TABLE} は作成済み（飛ばす）"; else
aws dynamodb create-table --region "$REGION" --table-name "$SCORES_TABLE" \
  --attribute-definitions AttributeName=board,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=board,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST >/dev/null
fi
aws dynamodb wait table-exists --region "$REGION" --table-name "$ACCOUNTS_TABLE"
aws dynamodb wait table-exists --region "$REGION" --table-name "$SCORES_TABLE"
aws dynamodb update-time-to-live --region "$REGION" --table-name "$SCORES_TABLE" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" >/dev/null 2>&1 || true  # 有効化済みならエラーになるので無視
echo "   ${ACCOUNTS_TABLE}, ${SCORES_TABLE} を作成（TTL有効）"

echo "== 3/6 IAM ロール"
cat > "$WORK/trust.json" <<JSON
{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" } ] }
JSON
cat > "$WORK/policy.json" <<JSON
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow",
  "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchGetItem"],
  "Resource": [
    "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${ACCOUNTS_TABLE}",
    "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${SCORES_TABLE}"
  ] } ] }
JSON
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then echo "   ${ROLE_NAME} は作成済み（飛ばす）"; else
aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "file://$WORKW/trust.json" >/dev/null
echo "   ロールの反映を待つ（15秒）"; sleep 15
fi
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name puzzleBeersApi-dynamodb --policy-document "file://$WORKW/policy.json"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo "== 4/6 Lambda（AUTH_SECRET は画面に出さない）"
if aws lambda get-function --region "$REGION" --function-name "$FUNC_NAME" >/dev/null 2>&1; then echo "   ${FUNC_NAME} は作成済み（飛ばす）"; else
SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")"
cat > "$WORK/env.json" <<JSON
{ "Variables": { "ACCOUNTS_TABLE": "${ACCOUNTS_TABLE}", "SCORES_TABLE": "${SCORES_TABLE}", "AUTH_SECRET": "${SECRET}", "ALLOW_ORIGIN": "*" } }
JSON
unset SECRET
aws lambda create-function --region "$REGION" --function-name "$FUNC_NAME" \
  --runtime nodejs24.x --handler index.handler --role "$ROLE_ARN" \
  --timeout 10 --memory-size 256 \
  --zip-file "fileb://$WORKW/api.zip" --environment "file://$WORKW/env.json" >/dev/null
aws lambda wait function-active-v2 --region "$REGION" --function-name "$FUNC_NAME"
echo "   ${FUNC_NAME} を作成"
fi
FUNC_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNC_NAME}"

echo "== 5/6 API Gateway（HTTP API）"
API_ID="$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)"
if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  API_ID="$(aws apigatewayv2 create-api --region "$REGION" --name "$API_NAME" --protocol-type HTTP --target "$FUNC_ARN" --query ApiId --output text)"
else
  echo "   ${API_NAME} は作成済み（飛ばす）"
fi
aws lambda add-permission --region "$REGION" --function-name "$FUNC_NAME" --statement-id apigw-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" >/dev/null 2>&1 || true
aws apigatewayv2 update-stage --region "$REGION" --api-id "$API_ID" --stage-name '$default' \
  --default-route-settings ThrottlingBurstLimit=20,ThrottlingRateLimit=10 >/dev/null
API_URL="$(aws apigatewayv2 get-api --region "$REGION" --api-id "$API_ID" --query ApiEndpoint --output text)"

echo "== 6/6 完了"
echo "API_URL=${API_URL}"
