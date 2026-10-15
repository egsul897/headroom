#!/bin/bash
# usage: shard-run.sh NAME SNAP RULESARG TREE NSHARD
# Runs N shards in parallel, then merges them with merge-shards.ts, which refuses missing sources / shard indexes /
# mixed snapshots and requires the merged snapshot identity to equal the shards' identity. Fails (exit != 0) otherwise.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
N=${5:-4}; OUT=${OUT:-/tmp/clf-shards}; mkdir -p "$OUT"
pids=()
for i in $(seq 0 $((N-1))); do
  CLF_SCOREBOARD_TREE=$4 npx tsx scripts/covenant-learning-factory/scoreboard.ts --snapshot=$2 $3 --shard=$i/$N --write-report=$OUT/$1.$i.json --write-findings=$OUT/$1.$i.jsonl > $OUT/$1.$i.log 2>&1 &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
shards=(); for i in $(seq 0 $((N-1))); do shards+=("$OUT/$1.$i.json"); done
npx tsx scripts/covenant-learning-factory/scoreboard/merge-shards.ts "$OUT/$1.json" "${shards[@]}"
cat $OUT/$1.*.jsonl > $OUT/$1.jsonl
