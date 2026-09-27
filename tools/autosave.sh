#!/usr/bin/env bash
# Periodic WIP autosave: commits & pushes the working branch every N seconds (default 60) so work
# survives sandbox resets. The PR (genspark_ai_developer -> main) updates automatically on push.
cd "$(dirname "$0")/.." || exit 1
INTERVAL=${1:-60}
while true; do
  sleep "$INTERVAL"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A && git commit -qm "wip(autosave): $(date '+%Y-%m-%d %H:%M:%S')"
  fi
  git push -q origin HEAD 2>/dev/null
done
