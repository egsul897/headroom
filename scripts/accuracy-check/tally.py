#!/usr/bin/env python3
"""MEASUREMENT-ONLY tally for datasets/measurement-only/accuracy-check-20261017/scores.json.
Prints headline counts by class, per-check breakdown, census by root-cause mechanism and the
per-check table (markdown). Never use this sample for tuning."""
import json, sys, os
from collections import Counter
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '../../datasets/measurement-only/accuracy-check-20261017')
S = json.load(open(os.path.join(D, 'scores.json')))
CLS = ['CORRECT', 'FAIL-CLOSED-OK', 'FAIL-CLOSED-OVERCAUTIOUS', 'WRONG', 'FALSE-CONFIDENT']
sc = [x for x in S if x['cls'] != 'N/A']
c = Counter(x['cls'] for x in sc)
print(f"## Headline ({len(sc)} scored checks, {len(S)-len(sc)} N/A, {len({x['id'] for x in S})} agreements)\n")
print('| class | n | % |\n|---|---:|---:|')
for k in CLS: print(f"| {k} | {c[k]} | {100*c[k]/len(sc):.0f}% |")
print('\n## By check\n')
checks = ['FIN_COVENANT', 'EBITDA_ADDBACKS', 'RATIO_BASKET', 'GENERAL_BASKET', 'FAIL_CLOSED']
print('| check | ' + ' | '.join(CLS) + ' | N/A |\n|---|' + '---:|' * (len(CLS) + 1))
for ch in checks:
    cc = Counter(x['cls'] for x in S if x['check'] == ch)
    print(f"| {ch} | " + ' | '.join(str(cc[k]) for k in CLS) + f" | {cc['N/A']} |")
print('\n## Census by root-cause mechanism (non-correct checks)\n')
bad = [x for x in sc if x['cls'] in ('WRONG', 'FALSE-CONFIDENT', 'FAIL-CLOSED-OVERCAUTIOUS')]
mech = Counter(x['mechanism'] for x in bad)
print('| mechanism | FALSE-CONFIDENT | WRONG | OVERCAUTIOUS | total | agreements |\n|---|---:|---:|---:|---:|---|')
for m, n in mech.most_common(key=None) if False else sorted(mech.items(), key=lambda kv: (-sum(1 for x in bad if x['mechanism']==kv[0] and x['cls']=='FALSE-CONFIDENT'), -kv[1])):
    xs = [x for x in bad if x['mechanism'] == m]
    f = lambda k: sum(1 for x in xs if x['cls'] == k)
    print(f"| {m} | {f('FALSE-CONFIDENT')} | {f('WRONG')} | {f('FAIL-CLOSED-OVERCAUTIOUS')} | {n} | {', '.join(sorted({x['id'] for x in xs}))} |")
print('\n## Per-check table\n')
print('| doc | check | class | mechanism | engine output | governing clause | note |\n|---|---|---|---|---|---|---|')
esc = lambda s: (s or '').replace('|', '\\|').replace('\n', ' ')
for x in S:
    print(f"| {x['id']} | {x['check']} | **{x['cls']}** | {x['mechanism']} | {esc(x['engine'])} | {esc(x['clause'])} | {esc(x['note'])} |")
