#!/usr/bin/env bash
# update-code.sh — Lambda のコードだけを更新する（環境変数・秘密・テーブル・APIには触れない）
# 使い方: cd lambda && bash update-code.sh
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
FUNC_NAME="puzzleBeersApi"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
WORKW="$(cygpath -m "$WORK")"

cd "$HERE/api"
npm install --omit=dev --no-audit --no-fund --silent
python - "$WORK/api.zip" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d != 'test']
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, '.').replace(os.sep, '/'))
PY

aws lambda update-function-code --region "$REGION" --function-name "$FUNC_NAME" --zip-file "fileb://$WORKW/api.zip" --query LastModified --output text
aws lambda wait function-updated-v2 --region "$REGION" --function-name "$FUNC_NAME"
echo "コードを更新しました"
