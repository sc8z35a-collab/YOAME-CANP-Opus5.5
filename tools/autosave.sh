#!/usr/bin/env bash
# Periodic WIP autosave: commits & pushes every N seconds (default 300) so work is never lost.
cd "$(dirname "$0")/.." || exit 1
INTERVAL=${1:-300}
while true; do
  sleep "$INTERVAL"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A && git commit -qm "wip(autosave): $(date '+%Y-%m-%d %H:%M:%S')" && git push -q origin HEAD 2>/dev/null
  fi
done
