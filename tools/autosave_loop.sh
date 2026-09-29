#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
while true; do sleep "${1:-90}"; [ -n "$(git status --porcelain)" ] && bash tools/save.sh "wip(autosave): $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1; done
