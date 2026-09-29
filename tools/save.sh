#!/usr/bin/env bash
# commit + rebase onto remote + push (safe against concurrent pushes from other sessions)
cd "$(dirname "$0")/.." || exit 1
MSG=${1:-"wip: $(date '+%Y-%m-%d %H:%M:%S')"}
git add -A
git diff --cached --quiet || git commit -qm "$MSG"
for i in 1 2 3; do
  git pull -q --rebase origin genspark_ai_developer 2>/dev/null || { git rebase --abort 2>/dev/null; git pull -q --no-rebase -X ours origin genspark_ai_developer; }
  git push -q origin HEAD:genspark_ai_developer && break
  sleep 2
done
git log --oneline -1
