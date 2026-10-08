# Live Corpus Quality Gate — Phase 3 Report

**Verdict:** `LIVE_CORPUS_QUALITY_GATE_PHASE3_REMEDIATION_VERIFICATION_RECORDED`

**Starting PR:** #153
**Starting SHA:** `18e2ed4bd66eaa9caff25eac49ef490c2fbb1816`
**Frozen evaluation content SHA:** `cebec8ab3aaecd894b1903ac0b758828655a88df`
**Generation HEAD:** `af9bbda1ef437e9afae7c34a125707ef44d7cb49`
**Paid calls:** `0`
**Certification impact:** `NONE`
**Production fixes in this branch:** `false`
**Phase-1 oracle untouched:** `true`
**Merges:** `false`

## 1. Original findings preserved

- Freeze intact: **true**
- Frozen findings: **46** listed / **45** unique
- Phase-1 unique IDs still reproducible: **45**

## 2. Finding-ID collision resolved (versioned harness)

- Harness: `live-corpus-quality-gate.phase3-harness.v1`
- Stable IDs: **46** (all individually addressable: **true**)
- Collision groups: [{"originalFindingId":"gib-doc-a:exception_and_condition_recall:legally_verified:pass","occurrences":2,"stableFindingIds":["LCQG-F-012","LCQG-F-013"],"ordinals":[11,12]}]

## 3–4. Production fix replays / defect statuses

| Defect | Status |
|---|---|
| `LCQG-GIB-FALSE-AFFIRM-SHARED-CAP` | **INDEPENDENTLY_ADJUDICATED** |
| `LCQG-SUP-AMEND-RESTATES-MISSING` | **INDEPENDENTLY_ADJUDICATED** |
| `LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT` | **OPEN** |
| `LCQG-GIB-STRUCT-AMBIGUOUS-TOC` | **INDEPENDENTLY_ADJUDICATED** |
| `LCQG-GIB-XREF-LOW-RESOLVE` | **OPEN** |
| `LCQG-HARNESS-FINDING-ID-COLLISION` | **INDEPENDENTLY_ADJUDICATED** |

Status rollup: {"OPEN":2,"FIX_PROPOSED":0,"REPLAY_FAILED":0,"REPLAY_PASSED":0,"INDEPENDENTLY_ADJUDICATED":4,"CLOSED":0}

## 5. False-permission adversarial

{
  "passFailClosed": 3,
  "failUnsafe": 2,
  "unverified": 2,
  "denominator": 7
}

## 6. Newly evaluated authentic documents

Count: **12** (heuristic expansion probes; not GT-backed PASS).

## 7–8. Legal-safety metrics / unverified

See `26-legal-safety-metrics.json`. Unavailable GT never converted to PASS.

## 9. SHA / tests / CI / PR

- HEAD: `af9bbda1ef437e9afae7c34a125707ef44d7cb49`
- Tests: `npm run live-corpus-quality-gate:phase3` · `npx vitest run tests/live-corpus-quality-gate/`
- PR: #153 draft — do not merge

## P0 Shared-capacity independent replay (ADV-FP-01/02)

- Baseline `8f87a06` reproduces false shared_cap / SHARED_CAP_CANDIDATE.
- Fix `83cde5b` (PR #136) corrects labeling; genuine shared language retained.
- Defect `LCQG-GIB-FALSE-AFFIRM-SHARED-CAP`: **INDEPENDENTLY_ADJUDICATED** (not CLOSED).
- Artifact: `28-p0-shared-cap-independent-replay.json` · `28-p0-shared-cap-REPORT.md`
