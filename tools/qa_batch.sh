#!/usr/bin/env bash
# Run a list of QA shots sequentially in background. Usage: tools/qa_batch.sh name "query" [name "query" ...]
cd "$(dirname "$0")/.." || exit 1
mkdir -p build/shots
while [ $# -ge 2 ]; do
  n=$1; q=$2; shift 2
  timeout 330 python3 tools/qa_shot.py "$q" "build/shots/$n.jpg" > "build/shots/$n.log" 2>&1
  echo "$n done $(date +%T)" >> build/shots/batch.log
done
echo ALL_DONE >> build/shots/batch.log
