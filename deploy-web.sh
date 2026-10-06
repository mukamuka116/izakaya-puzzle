#!/usr/bin/env bash
# deploy-web.sh — 画面（dist）を S3 + CloudFront で公開する。Takoyaki Cascade のものには触れない。
# 使い方（Git Bash など）: cd izakaya_puzzle && bash deploy-web.sh
#   ・初回：バケット・OAC・配信を作り、アップロードして、APIの ALLOW_ORIGIN を配信のURLに絞る
#   ・2回目以降：作成済みのものは飛ばし、ビルド → アップロード → キャッシュの入れ替えだけ行う
# AUTH_SECRET などの秘密は、画面にもログにも出さない（Lambda の環境変数を書き換えるときも、中で受け渡すだけ）。
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="puzzle-beers-web-${ACCOUNT_ID}"
OAC_NAME="puzzle-beers-oac"
COMMENT="Puzzle & Beers"
FUNC_NAME="puzzleBeersApi"

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
WORKW="$(cygpath -m "$WORK")"
cd "$HERE"

echo "== 1/7 ビルド（.env の VITE_API_URL を埋め込む）"
npm run build --silent >/dev/null
echo "   dist: $(du -sh dist | cut -f1)"

echo "== 2/7 S3 バケット（非公開）"
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "   ${BUCKET} は作成済み（飛ばす）"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  echo "   ${BUCKET} を作成（インターネットへの直接公開は、すべて禁止）"
fi

echo "== 3/7 CloudFront の OAC（バケットを CloudFront だけに読ませる仕組み）"
OAC_ID="$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id | [0]" --output text)"
if [ "$OAC_ID" = "None" ] || [ -z "$OAC_ID" ]; then
  OAC_ID="$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=${OAC_NAME},Description=Puzzle and Beers,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query OriginAccessControl.Id --output text)"
  echo "   OAC を作成"
else
  echo "   OAC は作成済み（飛ばす）"
fi

echo "== 4/7 CloudFront の配信"
DIST_ID="$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='${COMMENT}'].Id | [0]" --output text)"
if [ "$DIST_ID" = "None" ] || [ -z "$DIST_ID" ]; then
  python - "$WORK/dist.json" "$BUCKET" "$REGION" "$OAC_ID" "$COMMENT" <<'PY'
import json, sys, time
out, bucket, region, oac, comment = sys.argv[1:6]
origin = f"{bucket}.s3.{region}.amazonaws.com"
cfg = {
  "CallerReference": f"puzzle-beers-{int(time.time())}",
  "Comment": comment,
  "Enabled": True,
  "DefaultRootObject": "index.html",
  "HttpVersion": "http2and3",
  "PriceClass": "PriceClass_200",
  "Origins": {"Quantity": 1, "Items": [{
    "Id": "s3-web", "DomainName": origin, "OriginAccessControlId": oac,
    "S3OriginConfig": {"OriginAccessIdentity": ""},
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-web",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": True,
    "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",  # CachingOptimized（AWS標準）
  },
  # 存在しないパスは index.html を返す（1ページのアプリのため）
  "CustomErrorResponses": {"Quantity": 2, "Items": [
    {"ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10},
    {"ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10},
  ]},
}
json.dump(cfg, open(out, "w"))
PY
  DIST_ID="$(aws cloudfront create-distribution --distribution-config "file://$WORKW/dist.json" --query Distribution.Id --output text)"
  echo "   配信を作成: ${DIST_ID}"
else
  echo "   配信は作成済み（飛ばす）: ${DIST_ID}"
fi
DIST_DOMAIN="$(aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.DomainName --output text)"

echo "== 5/7 バケットポリシー（この配信からの読み取りだけ許可）"
cat > "$WORK/policy.json" <<JSON
{ "Version": "2012-10-17", "Statement": [ {
  "Sid": "AllowCloudFrontRead", "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject", "Resource": "arn:aws:s3:::${BUCKET}/*",
  "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}" } }
} ] }
JSON
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$WORKW/policy.json"

echo "== 6/7 アップロード"
# 中身が変わる名前ごとに、キャッシュの期間を分ける
aws s3 sync dist/ "s3://${BUCKET}/" --delete --only-show-errors \
  --exclude "index.html" --exclude "assets/*" --cache-control "public,max-age=86400"
aws s3 sync dist/assets/ "s3://${BUCKET}/assets/" --delete --only-show-errors \
  --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://${BUCKET}/index.html" --only-show-errors \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"
aws s3 cp dist/manifest.webmanifest "s3://${BUCKET}/manifest.webmanifest" --only-show-errors \
  --cache-control "no-cache" --content-type "application/manifest+json"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null
echo "   アップロードとキャッシュの入れ替えを依頼"

echo "== 7/7 API の ALLOW_ORIGIN を、この配信のURL（と手元の開発用）に絞る（AUTH_SECRET は中で受け渡すだけ。表示しない）"
aws lambda get-function-configuration --region "$REGION" --function-name "$FUNC_NAME" --query Environment.Variables --output json \
  | python -c "
import json, sys
v = json.load(sys.stdin)
v['ALLOW_ORIGIN'] = 'https://${DIST_DOMAIN},http://localhost:5173,http://localhost:4173'  # 公開URL＋手元の開発用
json.dump({'Variables': v}, open(r'$WORKW/env.json', 'w'))
"
aws lambda update-function-configuration --region "$REGION" --function-name "$FUNC_NAME" \
  --environment "file://$WORKW/env.json" >/dev/null
aws lambda wait function-updated-v2 --region "$REGION" --function-name "$FUNC_NAME"

echo "   配信の反映を待つ（数分かかる）"
aws cloudfront wait distribution-deployed --id "$DIST_ID"
echo "== 完了"
echo "URL=https://${DIST_DOMAIN}"
