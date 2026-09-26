#!/usr/bin/env bash
# Production deploy to GitHub Pages via the `gh-pages` branch (no Actions/workflow permission needed).
#   1. run the node test suites (abort on failure)
#   2. build the clean dist/ bundle (tools/build_site.sh)
#   3. force-push dist/ as a single-commit orphan `gh-pages` branch
#   4. make sure Pages is enabled for gh-pages (GitHub REST API, uses the stored git credential)
set -euo pipefail
cd "$(dirname "$0")/.."
npm test --silent > /tmp/deploy_tests.log 2>&1 || { echo "TESTS FAILED - not deploying"; grep FAIL /tmp/deploy_tests.log; exit 1; }
echo "tests: $(grep -c PASS /tmp/deploy_tests.log) passed"
bash tools/build_site.sh
SRC=$(git rev-parse --short HEAD)
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r dist/. "$TMP/"
(
  cd "$TMP"
  git init -q -b gh-pages
  git config user.name "$(git -C "$OLDPWD" config user.name)"
  git config user.email "$(git -C "$OLDPWD" config user.email)"
  git add -A
  git commit -qm "deploy: site bundle from $SRC"
  git push -q -f "$REMOTE" gh-pages
)
rm -rf "$TMP"
echo "pushed gh-pages ($SRC)"

# enable / point Pages at gh-pages
REPO=$(echo "$REMOTE" | sed -E 's#.*github.com[:/]##; s#\.git$##')
TOKEN=$(sed -nE 's#https://[^:]+:([^@]+)@github.com.*#\1#p' ~/.git-credentials | head -1)
API="https://api.github.com/repos/$REPO/pages"
H=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json")
code=$(curl -s -o /tmp/pages.json -w '%{http_code}' "${H[@]}" "$API")
if [ "$code" = "404" ]; then
  code=$(curl -s -o /tmp/pages.json -w '%{http_code}' -X POST "${H[@]}" "$API" -d '{"source":{"branch":"gh-pages","path":"/"}}')
  echo "enable pages: HTTP $code"
else
  curl -s -o /dev/null -X PUT "${H[@]}" "$API" -d '{"source":{"branch":"gh-pages","path":"/"}}' || true
fi
python3 -c "import json;d=json.load(open('/tmp/pages.json'));print('pages url:', d.get('html_url'), '| status:', d.get('status'), '|', d.get('message',''))"
