#!/usr/bin/env bash
# Watchdog for headless shots on a 1GB sandbox: kills chrome-headless-shell when available memory < 60MB.
#   python3 tools/qa_shot.py "..." out.jpg & bash tools/memguard.sh &
LIM=${1:-60}
while pgrep -f "python3 tools/(qa_shot|cshot|uishot|ishot)\.py" >/dev/null; do  # (pattern must not match this script's own argv)
  a=$(free -m | awk '/Mem/{print $7}'); echo "$(date +%T) avail=$a" >> /tmp/memguard.log
  [ "$a" -lt "$LIM" ] && { pkill -f chrome-headless-shell; echo "$(date +%T) KILLED (avail=$a)" >> /tmp/memguard.log; }
  sleep 3
done
