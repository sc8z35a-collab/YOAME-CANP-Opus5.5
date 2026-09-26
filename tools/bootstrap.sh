#!/usr/bin/env bash
# Re-create the dev environment after a sandbox reset (idempotent).
cd "$(dirname "$0")/.." || exit 1
pip install -q openai pyyaml playwright pillow numpy scipy >/tmp/boot_pip.log 2>&1
python3 -m playwright install chromium >/tmp/boot_pw.log 2>&1
python3 - <<'PY' 2>/dev/null || sudo python3 -m playwright install-deps chromium >/tmp/boot_deps.log 2>&1
from playwright.sync_api import sync_playwright
with sync_playwright() as p: p.chromium.launch().close()
PY
pgrep -f "http.server 8080" >/dev/null || nohup python3 -m http.server 8080 >/tmp/http.log 2>&1 &
pgrep -f autosave.sh >/dev/null || nohup tools/autosave.sh 240 >/tmp/autosave.log 2>&1 &
echo BOOTSTRAP_DONE
