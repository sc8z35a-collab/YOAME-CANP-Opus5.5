#!/usr/bin/env bash
# Watchdog for headless shots on a 1GB sandbox: kills chrome-headless-shell when available memory < 60MB.
#   python3 tools/qa_shot.py "..." out.jpg & bash tools/memguard.sh &
LIM=${1:-60}
while pgrep -f "qa_shot.py|cshot.py|uishot.py|ishot.py" >/dev/null; do
  a=$(free -m | awk '/Mem/{print $7}'); echo "$(date +%T) avail=$a" >> /tmp/memguard.log
  [ "$a" -lt "$LIM" ] && { pkill -f chrome-headless-shell; echo "$(date +%T) KILLED (avail=$a)" >> /tmp/memguard.log; }
  sleep 3
done
