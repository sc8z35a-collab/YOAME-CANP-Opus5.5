#!/usr/bin/env bash
# commit + rebase onto remote + push (safe against concurrent pushes from other sessions)
# - collab/**/*.md use merge=union (.gitattributes), so shared notes never lose lines
# - a real code conflict is NOT auto-resolved any more (the old `-X ours` fallback silently threw
#   away other agents' edits to the same file): the rebase is aborted and the script says so
cd "$(dirname "$0")/.." || exit 1
MSG=${1:-"wip: $(date '+%Y-%m-%d %H:%M:%S')"}
git add -A
git diff --cached --quiet || git commit -qm "$MSG"
ok=0
for i in 1 2 3 4; do
  if ! git pull -q --rebase origin genspark_ai_developer; then
    git rebase --abort 2>/dev/null
    echo "!! save.sh: rebase conflict with remote (local commit kept, NOT pushed). Resolve: git pull --rebase, fix, git rebase --continue" >&2
    git diff --name-only --diff-filter=U 2>/dev/null >&2
    exit 2
  fi
  git push -q origin HEAD:genspark_ai_developer && { ok=1; break; }
  sleep $((i * 2))
done
[ $ok = 1 ] || echo "!! save.sh: push failed 4x (network?) — commit is local only" >&2
git log --oneline -1
