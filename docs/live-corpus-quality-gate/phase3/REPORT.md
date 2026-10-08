# Live Corpus Quality Gate — Phase 3 Report

**Verdict:** `LIVE_CORPUS_QUALITY_GATE_PHASE3_REMEDIATION_VERIFICATION_RECORDED`

**Starting PR:** #153
**Starting SHA:** `18e2ed4bd66eaa9caff25eac49ef490c2fbb1816`
**Frozen evaluation content SHA:** `cebec8ab3aaecd894b1903ac0b758828655a88df`
**Generation HEAD:** `80d6c3587e7eb533eb07c2705e0c018597149240`
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

## 8b. Shared-capacity P0 E2E closure (scripted)

- Production tip probed: `0e31c360c040df6bc7284ff8d3ca8c62a22bdd11` (labeling fix `83cde5b` still ancestor)
- Artifacts: `29-p0-shared-cap-e2e-closure.json` · `29-p0-shared-cap-e2e-REPORT.md` (plus prior `28-*` labeling replay)
- Scripted compile→capacity: ordinary aggregate alone → zero executable shared pools; genuine shared positives + fail-closed unquantified share verified
- Gibraltar frozen-51 strata: 42 ordinary aggregate / 9 helper-shared but Pass-A nodeId-dropped
- Ticket remains **INDEPENDENTLY_ADJUDICATED** (live unpaid LLM compile boundary)

## 9. SHA / tests / CI / PR

- HEAD: `80d6c3587e7eb533eb07c2705e0c018597149240` (E2E closure artifacts landed)
- Tests: `npm run live-corpus-quality-gate:phase3` · `npx vitest run tests/live-corpus-quality-gate/`
- PR: #153 draft — do not merge
