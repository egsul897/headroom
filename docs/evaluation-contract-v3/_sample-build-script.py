import json
from collections import defaultdict

manifest = [json.loads(l) for l in open('/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/manifest.jsonl')]
by_id = {r['gtUnitId']: r for r in manifest}

FALSE_CREDIT_IDS = ['doc-a::VI::6.01-chapeau','doc-a::VI::6.04-chapeau','doc-a::VI::6.04-unrestricted-sub-valuation',
 'doc-a::VI::6.05-chapeau','doc-a::VI::6.05-ip-flush-prohibition','doc-a::VI::6.08b-chapeau','doc-a::VI::6.10-chapeau',
 'doc-b::VI::6-01-lead-in','doc-b::VI::6-04-lead-in','doc-b::VI::6-05-lead-in','doc-d::VI::6-01-chapeau',
 'doc-d::VI::6-04-chapeau','doc-d::VI::6-05-chapeau','doc-d::VI::6-08-b-chapeau']

manifest_sorted = sorted(manifest, key=lambda r: (r['datasetKey'], r['gtUnitId']))

selected = {}
reasons = defaultdict(list)

def add(r, reason):
    gid = r['gtUnitId']
    selected[gid] = r
    if reason not in reasons[gid]:
        reasons[gid].append(reason)

for fid in FALSE_CREDIT_IDS:
    add(by_id[fid], 'FALSE_CREDIT_NEGATIVE_CONTROL')

# EC-V3 stratum categories -> old manifest stratum numbers / derived signals
CATEGORY_RULES = {
    'clear_credit': lambda r: r['sig']['matchStatus'] in ('EXACT_SINGLE','EXACT_COMPOSITE') and r['sig']['confidence']=='HIGH',
    'clear_no_credit': lambda r: r['sig']['matchStatus']=='UNREPRESENTED' and r['sig']['confidence']=='HIGH',
    'specifically_surfaced_failure': lambda r: r['sig']['matchStatus'] in ('UNREPRESENTED','HONESTLY_UNRESOLVED') and r['sig']['hasSafetyFlagCandidate'],
    'silent_failure': lambda r: r['sig']['matchStatus']=='UNREPRESENTED' and not r['sig']['hasSafetyFlagCandidate'] and r['sig']['dangerousUnaccountedV2'],
    'partial_representation': lambda r: r['sig']['matchStatus']=='PARTIAL',
    'conditions': lambda r: 13 in r['strata'],
    'exceptions': lambda r: 14 in r['strata'],
    'definitions': lambda r: 12 in r['strata'],
    'chapeaus': lambda r: 16 in r['strata'],
    'sibling_provisions': lambda r: 15 in r['strata'],
    'quantitative': lambda r: 11 in r['strata'],
    'qualitative': lambda r: 10 in r['strata'],
    'cross_reference_heavy': lambda r: 17 in r['strata'],
    'amendment_sensitive': lambda r: 18 in r['strata'],
    'composite': lambda r: r['sig']['matchStatus']=='EXACT_COMPOSITE',
}

TARGET_PER_CATEGORY = 4
materiality_rank = {'CRITICAL':0,'MATERIAL':1,'REVIEW_UNCERTAIN':2,'INFORMATIONAL':3}

for cat, rule in CATEGORY_RULES.items():
    already = sum(1 for r in selected.values() if rule(r))
    need = max(0, TARGET_PER_CATEGORY - already)
    if need == 0:
        continue
    pool = [r for r in manifest_sorted if rule(r) and r['gtUnitId'] not in selected]
    pool.sort(key=lambda r: (materiality_rank.get(r.get('materiality'), 4), r['gtUnitId']))
    for r in pool[:need]:
        add(r, f'CATEGORY_{cat}_FILL')

# dataset diversity top-up: ensure each of FWRG/LSB/CONMED gets a reasonable presence
by_dataset_target = {'fwrg-2021-credit-agreement': 9, 'lsb-2023-abl-credit-agreement': 9, 'conmed-2025-credit-facility': 9}
for ds, target in by_dataset_target.items():
    have = sum(1 for r in selected.values() if r['datasetKey']==ds)
    need = max(0, target - have)
    if need == 0:
        continue
    pool = [r for r in manifest_sorted if r['datasetKey']==ds and r['gtUnitId'] not in selected]
    pool.sort(key=lambda r: (materiality_rank.get(r.get('materiality'), 4), r['gtUnitId']))
    for r in pool[:need]:
        add(r, f'DATASET_DIVERSITY_{ds}_FILL')

print('TOTAL SELECTED:', len(selected))
ds_counts = defaultdict(int)
for r in selected.values():
    ds_counts[r['datasetKey']] += 1
print('per-dataset:', dict(ds_counts))

cat_counts = {}
for cat, rule in CATEGORY_RULES.items():
    cat_counts[cat] = sum(1 for r in selected.values() if rule(r))
print('per-category coverage in final sample:', cat_counts)

out = []
for gid in sorted(selected.keys()):
    r = selected[gid]
    out.append({
        'caseId': gid,
        'datasetKey': r['datasetKey'],
        'documentId': r['documentId'],
        'sectionRef': r.get('sectionRef'),
        'materiality': r.get('materiality'),
        'selectionReasons': reasons[gid],
        'isFalseCreditNegativeControl': gid in FALSE_CREDIT_IDS,
    })
with open('/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/ecv3_sample.json', 'w') as f:
    json.dump(out, f, indent=2)
print('Wrote', len(out), 'records')
