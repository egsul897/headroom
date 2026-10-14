#!/bin/bash
# usage: sbrun.sh NAME SNAP RULESARG TREE NSHARD
cd "$(git rev-parse --show-toplevel)"
N=${5:-4}; mkdir -p ${OUT:-/tmp/clf-shards}
for i in $(seq 0 $((N-1))); do
  CLF_SCOREBOARD_TREE=$4 npx tsx scripts/covenant-learning-factory/scoreboard.ts --snapshot=$2 $3 --shard=$i/$N --write-report=${OUT:-/tmp/clf-shards}/$1.$i.json --write-findings=${OUT:-/tmp/clf-shards}/$1.$i.jsonl > ${OUT:-/tmp/clf-shards}/$1.$i.log 2>&1 &
done
wait
python3 - "$1" "$N" <<'PY'
import json,sys
name,n=sys.argv[1],int(sys.argv[2])
per=[]
for i in range(n): per+=json.load(open(f'${OUT:-/tmp/clf-shards}/{name}.{i}.json'))['perSource']
tot={}
for s in per:
    if s.get('duplicateOf'): continue
    t=tot.setdefault(s['split'],{'total':0,'sources':0,'COVERAGE_GAP':0,'DISCOVERY_GAP':0,'UNSUPPORTED_SEMANTICS':0})
    t['total']+=s['total'];t['sources']+=1
    for k,v in s['counts'].items(): t[k]+=v
json.dump({'totals':tot,'perSource':per},open(f'${OUT:-/tmp/clf-shards}/{name}.json','w'))
print(name,json.dumps(tot))
PY
cat ${OUT:-/tmp/clf-shards}/$1.*.jsonl > ${OUT:-/tmp/clf-shards}/$1.jsonl
