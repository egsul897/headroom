import json, hashlib
from collections import defaultdict

manifest = [json.loads(l) for l in open('/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/manifest.jsonl')]
by_id = {r['gtUnitId']: r for r in manifest}

FALSE_CREDIT_IDS = ['doc-a::VI::6.01-chapeau','doc-a::VI::6.04-chapeau','doc-a::VI::6.04-unrestricted-sub-valuation',
 'doc-a::VI::6.05-chapeau','doc-a::VI::6.05-ip-flush-prohibition','doc-a::VI::6.08b-chapeau','doc-a::VI::6.10-chapeau',
 'doc-b::VI::6-01-lead-in','doc-b::VI::6-04-lead-in','doc-b::VI::6-05-lead-in','doc-d::VI::6-01-chapeau',
 'doc-d::VI::6-04-chapeau','doc-d::VI::6-05-chapeau','doc-d::VI::6-08-b-chapeau']

STRATUM_NAMES = {
 1:'clear_credit',2:'clear_no_credit',3:'discovery_only',4:'partial',5:'unresolved',6:'unsupported_silent',
 7:'ambiguous',8:'verification_incomplete',9:'exact_verified',10:'qualitative',11:'quantitative',12:'definitions',
 13:'conditions',14:'exceptions',15:'sibling_subprovisions',16:'chapeaus',17:'cross_reference_heavy',
 18:'amendment_sensitive',19:'composite'
}

# deterministic ordering: by dataset then gtUnitId, so selection is reproducible
manifest_sorted = sorted(manifest, key=lambda r: (r['datasetKey'], r['gtUnitId']))

selected = {}  # gtUnitId -> record
selection_reason = defaultdict(list)  # gtUnitId -> [reasons]

def add(rec, reason):
    gid = rec['gtUnitId']
    selected[gid] = rec
    if reason not in selection_reason[gid]:
        selection_reason[gid].append(reason)

# 1. Force-include all 14 false-credit controls
for fid in FALSE_CREDIT_IDS:
    add(by_id[fid], 'FALSE_CREDIT_NEGATIVE_CONTROL')

# 2. All of FWRG + LSB (small, rich, manageable: 18+14=32)
for r in manifest_sorted:
    if r['datasetKey'] in ('fwrg-2021-credit-agreement', 'lsb-2023-abl-credit-agreement'):
        add(r, 'FULL_SMALL_DATASET_COVERAGE')

# 3. Per-stratum target selection across CONMED + DSGR (excluding already-selected), capped count per stratum
TARGET_PER_STRATUM = 4  # additional NEW cases to add per stratum beyond what's already selected
MAX_CANDIDATES_TO_SCAN_PER_STRATUM = 999999

by_stratum = defaultdict(list)
for r in manifest_sorted:
    for s in r['strata']:
        by_stratum[s].append(r)

materiality_rank = {'CRITICAL':0,'MATERIAL':1,'REVIEW_UNCERTAIN':2,'INFORMATIONAL':3}

for s in range(1,20):
    if s in (7,9):
        continue  # structurally empty strata; document separately
    already = sum(1 for gid,r in selected.items() if s in r['strata'])
    need = max(0, TARGET_PER_STRATUM - already)
    if need == 0:
        continue
    pool = [r for r in by_stratum.get(s, []) if r['gtUnitId'] not in selected]
    # prefer conmed first (underrepresented so far), then dsgr; within, prefer higher materiality, then stable id order
    pool.sort(key=lambda r: (0 if r['datasetKey']=='conmed-2025-credit-facility' else 1,
                              materiality_rank.get(r.get('materiality'), 4),
                              r['gtUnitId']))
    for r in pool[:need]:
        add(r, f'STRATUM_{s}_{STRATUM_NAMES[s]}_FILL')

# 3b. CONMED is architecturally distinct (zero compiled-representation layer; discovery+audit-findings
#     only) but the generic stratum fill above starved it because its strata mostly duplicate what FWRG/LSB
#     already cover. Force explicit CONMED representation: its chapeau/sibling basket structure, its
#     amendment-heavy documents c/d, and its cross-reference-heavy/reclassification provisions.
CONMED_FORCE_IDS = [
    'a-7.2',      # chapeau, 18 siblings, reclassification right
    'a-7.2-d',    # sibling basket, quantitative
    'a-7.2-k',    # sibling basket, exception, safety-flagged
    'a-7.3',      # chapeau, Liens
    'a-7.3-h',    # sibling basket (the operative Lien authorization itself)
    'a-7.6',      # chapeau, Restricted Payments
    'a-7.6-e',    # sibling basket, ratio-gated unlimited
    'a-7.8',      # chapeau, Investments
    'a-7.8-j',    # sibling basket, cross-reference-heavy (crossRefCount=2)
    'c-2a-i',     # amendment: numeric definition change
    'c-2b',       # amendment: restates a maintenance covenant with a stepped schedule
    'd-2',        # amendment: activates new commitments
    'd-4',        # amendment: reaffirmation
    'b-2.1',      # guaranty creation (distinct document, distinct claim family)
]
for cid in CONMED_FORCE_IDS:
    add(by_id[cid], 'CONMED_ARCHITECTURAL_REPRESENTATION')

# 4. Also include a handful of CONTRADICTORY cases (not one of the 19 strata, but an important disposition
#    category not covered by any stratum above) - one per dataset where available, not already selected
contradictory_by_dataset = defaultdict(list)
for r in manifest_sorted:
    if r['sig']['matchStatus'] == 'CONTRADICTORY' and r['gtUnitId'] not in selected:
        contradictory_by_dataset[r['datasetKey']].append(r)
for ds, pool in contradictory_by_dataset.items():
    for r in pool[:2]:
        add(r, 'CONTRADICTORY_DISPOSITION_COVERAGE')

print('TOTAL SELECTED:', len(selected))
print()
print('Per-dataset counts:')
ds_counts = defaultdict(int)
for r in selected.values():
    ds_counts[r['datasetKey']] += 1
for k,v in sorted(ds_counts.items()):
    print(' ', k, v)

print()
print('Per-stratum counts (in final sample):')
strat_counts = defaultdict(int)
for r in selected.values():
    for s in r['strata']:
        strat_counts[s] += 1
for s in range(1,20):
    print(' ', s, STRATUM_NAMES[s], strat_counts.get(s,0))

print()
print('matchStatus distribution in sample:')
ms_counts = defaultdict(int)
for r in selected.values():
    ms_counts[r['sig']['matchStatus']] += 1
for k,v in sorted(ms_counts.items()):
    print(' ', k, v)

# write output
out = []
for gid in sorted(selected.keys()):
    r = selected[gid]
    out.append({
        'caseId': gid,
        'datasetKey': r['datasetKey'],
        'documentId': r['documentId'],
        'sectionRef': r.get('sectionRef'),
        'materiality': r.get('materiality'),
        'strataMembership': r['strata'],
        'selectionReasons': selection_reason[gid],
        'isFalseCreditNegativeControl': gid in FALSE_CREDIT_IDS,
    })

with open('/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/selected_sample.json', 'w') as f:
    json.dump(out, f, indent=2)

print()
print('Wrote', len(out), 'records to selected_sample.json')
