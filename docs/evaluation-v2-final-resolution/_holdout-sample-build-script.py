import json
from collections import defaultdict

manifest = [json.loads(l) for l in open('/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/manifest.jsonl')]
by_id = {r['gtUnitId']: r for r in manifest}

sample = json.load(open('/home/user/headroom/docs/evaluation-v2-final-resolution/07-taxonomy-study-sample.json'))
ORIGINAL_65 = set(sample['frozenCaseIds'])

manifest_sorted = sorted(manifest, key=lambda r: (r['datasetKey'], r['gtUnitId']))
eligible = [r for r in manifest_sorted if r['gtUnitId'] not in ORIGINAL_65]
print('eligible pool (excluding original 65):', len(eligible))

selected = {}
reasons = defaultdict(list)

def add(r, reason):
    gid = r['gtUnitId']
    selected[gid] = r
    if reason not in reasons[gid]:
        reasons[gid].append(reason)

# 1. TARGETED: chapeau-shaped units (the exact mechanism under test), diverse datasets, diverse sibling counts
chapeau_pool = [r for r in eligible if r['sig'].get('isChapeauShape')]
print('chapeau-shaped units available (excl original 65):', len(chapeau_pool))
by_dataset_chapeau = defaultdict(list)
for r in chapeau_pool:
    by_dataset_chapeau[r['datasetKey']].append(r)
for ds, pool in by_dataset_chapeau.items():
    pool.sort(key=lambda r: r['gtUnitId'])
    for r in pool[:6]:
        add(r, 'CHAPEAU_TARGETED_RETEST')

# 2. TARGETED: sibling-adjacent non-chapeau units (siblingCount > 0, not chapeau) - the fwrg-6.06-b-ii-style mechanism
sibling_pool = [r for r in eligible if not r['sig'].get('isChapeauShape') and r['sig'].get('siblingCount', 0) >= 2
                and r['sig']['matchStatus'] == 'UNREPRESENTED']
by_dataset_sib = defaultdict(list)
for r in sibling_pool:
    by_dataset_sib[r['datasetKey']].append(r)
for ds, pool in by_dataset_sib.items():
    pool.sort(key=lambda r: r['gtUnitId'])
    for r in pool[:4]:
        add(r, 'SIBLING_ADJACENCY_TARGETED_RETEST')

# 3. GENERAL diversity: cover the other strata broadly (not just the fixed mechanism), same fill approach as original,
#    excluding already-selected and the original 65
STRATUM_NAMES = {1:'clear_credit',2:'clear_no_credit',3:'discovery_only',4:'partial',5:'unresolved',6:'unsupported_silent',
 8:'verification_incomplete',10:'qualitative',11:'quantitative',12:'definitions',13:'conditions',14:'exceptions',
 17:'cross_reference_heavy',18:'amendment_sensitive',19:'composite'}
by_stratum = defaultdict(list)
for r in eligible:
    for s in r['strata']:
        by_stratum[s].append(r)

materiality_rank = {'CRITICAL':0,'MATERIAL':1,'REVIEW_UNCERTAIN':2,'INFORMATIONAL':3}
TARGET_PER_STRATUM = 2
for s in sorted(STRATUM_NAMES.keys()):
    already = sum(1 for gid,r in selected.items() if s in r['strata'])
    need = max(0, TARGET_PER_STRATUM - already)
    if need == 0:
        continue
    pool = [r for r in by_stratum.get(s, []) if r['gtUnitId'] not in selected]
    pool.sort(key=lambda r: (materiality_rank.get(r.get('materiality'), 4), r['gtUnitId']))
    for r in pool[:need]:
        add(r, f'STRATUM_{s}_{STRATUM_NAMES[s]}_FILL')

print('TOTAL HOLDOUT SELECTED:', len(selected))
ds_counts = defaultdict(int)
for r in selected.values():
    ds_counts[r['datasetKey']] += 1
print('per-dataset:', dict(ds_counts))

chapeau_count = sum(1 for r in selected.values() if r['sig'].get('isChapeauShape'))
sib_count = sum(1 for r in selected.values() if r['sig'].get('siblingCount', 0) >= 2)
print('chapeau-shaped in holdout:', chapeau_count, '| sibling-adjacent (siblingCount>=2) in holdout:', sib_count)

# verify zero overlap
overlap = set(selected.keys()) & ORIGINAL_65
print('overlap with original 65 (must be empty):', overlap)

out = []
for gid in sorted(selected.keys()):
    r = selected[gid]
    out.append({
        'caseId': gid,
        'datasetKey': r['datasetKey'],
        'documentId': r['documentId'],
        'sectionRef': r.get('sectionRef'),
        'materiality': r.get('materiality'),
        'isChapeauShape': r['sig'].get('isChapeauShape'),
        'siblingCount': r['sig'].get('siblingCount'),
        'strataMembership': r['strata'],
        'selectionReasons': reasons[gid],
    })
with open('/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/holdout_sample.json', 'w') as f:
    json.dump(out, f, indent=2)
print('Wrote', len(out), 'records to holdout_sample.json')
