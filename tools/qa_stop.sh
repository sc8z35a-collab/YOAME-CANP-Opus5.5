#!/usr/bin/env bash
# Stop any running QA batch / screenshot / headless chromium WITHOUT matching the caller's shell
# (pkill -f with a pattern that appears in the calling command line kills the caller itself).
self=$$; parent=$PPID
for pid in $(pgrep -f 'qa_batch\.sh|qa_shot\.py|chrome-headless-shell'); do
  [ "$pid" = "$self" ] || [ "$pid" = "$parent" ] && continue
  kill "$pid" 2>/dev/null
done
sleep 1
echo "qa processes left: $(pgrep -fc 'qa_shot\.py|chrome-headless-shell')"
