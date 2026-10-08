# Covenant Precedent Research Interface — Integration Gate (PR #152)

**Gate head:** see git tip after merge with `origin/main`  
**Phase 3 code tip:** `5434ca302f5441a53129e164ced29d78b4822bec`  
**Docs tip before main-merge:** `a9ba35d5fc375d64ac6fed7283fe03fd24b50843`

## Commits since Phase 3 report tip `5434ca3`

1. `a9ba35d` — Record Phase 3 CI green; document Phase 3 CLI flags (docs only).
2. Merge `origin/main` — resolve sole conflict in `package.json` by unioning scripts (`research:covenant` + `dataset:source-to-covenant` + CKG benchmark scripts). **No research corpus expansion.**

## Independent evaluation (authoritative — do not substitute held-out)

| Metric | Value |
| --- | ---: |
| Recall@5 | **0.4314** |
| Recall@10 | **0.5651** |
| Precision@5 | 0.3556 |
| MRR | 0.4049 |
| Citation correctness | **0.5714** |
| Version correctness | 1.0 |
| Unsupported refusal | 1.0 |
| Query count | 57 (SUP issuer-disjoint) |

Held-out rerank scores (Recall@5 1.0 / Precision@5 0.3364) are secondary diagnostics only.

## Integration checks

| Check | Result |
| --- | --- |
| Changed paths vs merge-base | 42 research-owned paths (plus main merge tree) |
| Production legal-rule / certification edits | **None** in research PR paths |
| Duplicate source registry | Research `ingest-registry` coexists with main `datasets/source-to-covenant`; research does **not** ingest that peer dataset |
| `npm test -- tests/covenant-research` | **57/57** |
| `tsc --noEmit` | **clean** |
| Verification distribution (6,607 entries) | FIXTURE 12 · UNVERIFIED 6,429 · HYPOTHESIS 166 · SOURCE_VERIFIED 0 · INDEPENDENTLY_LEGALLY_VERIFIED 0 |
| Auto-promotion / executable certification | **Impossible** via research surface (read-only; refusals for certify/promote/permit) |
| CKF adapters | Fixture-tested only; `realExportTested=false` for `exports/*` contract |
| DB | `DB_INTEGRATION_UNVERIFIED` |
| Fail-closed (unresolved / missing authority / superseded as-of / permit asks) | **Verified** |

## Merge recommendation

**READY FOR INTEGRATION LEAD MERGE** through branch protections after CI green on the post-main-merge tip. Non-promoting research CLI only; no certification advancement.
