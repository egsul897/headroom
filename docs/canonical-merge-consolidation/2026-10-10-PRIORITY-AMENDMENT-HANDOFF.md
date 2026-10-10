# Immediate Merge Priority Amendment — Handoff

**Date:** 2026-10-10  
**Starting main (this amendment):** `342a6b059e3385fb14d605b8d1593e878a221578`  
**Ending main:** `fa26d602f4b0551ad4fabf481a50355fcef61322`  
**Verdict:** Priority batch completed with sequential validation; integration agent CLOSED.

---

## Per-PR disposition

### #268 — cross-surface trusted issuer / remaining authority
| Field | Value |
|---|---|
| Disposition | **MERGED** |
| Exact tip | `d7cb0c6b1dacac303b8a32926874f2c7b9a6b14f` |
| CI (tip) | home overview + P3-R0 + Vercel SUCCESS; reviewDecision empty |
| Review requirements | Independent integration review (this agent); no required GitHub reviewers |
| Dependencies | None blocking; 26 commits behind at tip but ort-merge clean onto main |
| Evidence | Local merge preserved `#269` `remaining-authority.ts` + multi-constraint election; capacity 35/35 + election/shared-lien 54/54; post-merge main 83/83 |
| Merge commit | `89802b2316f78fb770843bc9966f622a61a4b537` |

### #276 — sealed independent WOR holdout
| Field | Value |
|---|---|
| Disposition | **MERGED** (+ typecheck fix **#277**) |
| Exact tip | `83ec8854105735119f26f33df8d14ca07cdff0fb` |
| CI (tip) | Vercel FAIL (large fixtures ~3.6MB); no production lib paths |
| Review requirements | Docs/fixtures only; seal hashes verified locally |
| Dependencies | None |
| Evidence | raw/extracted SHA256 matched seal for doc-a/doc-b; legal-reference chronology sealed; `productionCodeChanged: false`; false favorable capacity 0 |
| Merge commit | `6abe42bae6dfe69bb72467daa7f460b727200d1b` |
| Follow-up | **#277** `9895b253e90db027ac0c910a176a9fc7d136823e` restored `tsc` (script typing / `packageKey` / `healthDiagnostics`) |

### #274 — confirmed instrument identity + amendment precedence
| Field | Value |
|---|---|
| Disposition | **MERGED** (persistence **live-DB not verified**) |
| Exact tip | `48950c804ff55001972ea7aa5a4812658becdd86` |
| CI (tip) | certified path + Vercel SUCCESS |
| Review requirements | Ready for review; no required reviewers |
| Dependencies | Independent of #268/#273 |
| Evidence | In-memory: amendment-operative-handoff 8, canonical-identity 9, persistence-membership-plan 5 — all pass. `persistence-identity.test.ts` **4 skipped** (`HEADROOM3_ALLOW_EVAL_DB` unset; Neon unreachable) |
| Merge commit | `b23e312afedb53ea6771c2ead1afbcdd758edd86` |
| Blocker note | Do **not** claim Neon persistence identity verified until `HEADROOM3_ALLOW_EVAL_DB=1` against isolated EVAL DB |

### #273 — authenticated financial evidence contract
| Field | Value |
|---|---|
| Disposition | **SELECTIVE_PORT** (via **#279**) |
| Exact tip | `61c037dc3a37b7682eb852175d6418e1cc395b90` |
| CI (tip) | Vercel SUCCESS; draft |
| Review requirements | Independent integration review; conflicts with #268 |
| Dependencies | Conceptual dep on #268 — **merged first** |
| Evidence | Conflicts reconciled; kept #268 gates + #273 duplicate-usage refusal + financial-evidence modules; capacity 54/54 |
| Merge commit | `c6fbd2a7626244f2bca86c980f966b36b9c8f92d` (#279) |
| Original PR | Remains open/conflicting — close-eligible as SUPERSEDED by #279 |

### #266 — generalized executable covenant compiler (PP002 slice)
| Field | Value |
|---|---|
| Disposition | **MERGED** |
| Exact tip | `628eefa4b04686b1aeec5c2fdcaf80cb6fbeb29a` |
| CI (tip) | certified path + Vercel SUCCESS |
| Review requirements | Marked ready; workstream closed pending integration review |
| Dependencies | Behind main; ort-merge clean; stage-structure additive OCR whitespace fix only — `#261` definitions inventory retained |
| Evidence | Verdict `GREATER_OF_VERTICAL_SLICE_PASSED — PRODUCTION_CAPACITY_REFUSED`; compiler + flywheel + authority tests green; tsc clean |
| Merge commit | `93857be59214c7410de9f005ff87870a47bf10ce` |

### #275 — truthful customer workflow
| Field | Value |
|---|---|
| Disposition | **SELECTIVE_PORT** (via **#280**) |
| Exact tip | `deaa977e36fdc543c0c48e82b98e44a4c9433155` |
| CI (tip) | home overview + dashboard invent-absence + Vercel SUCCESS; CONFLICTING vs post-#268 main |
| Review requirements | Draft; independent reconciliation required |
| Dependencies | Conflicts with #268 `position/page.tsx` |
| Evidence | Took #275 StatusChip UI; wired `utilizationRemainingAuthority`; MODELED unless PRODUCTION_AUTHORITATIVE |
| Merge commit | `fa26d602f4b0551ad4fabf481a50355fcef61322` (#280) |
| Original PR | Remains open/conflicting — close-eligible as SUPERSEDED by #280 |

---

## Explicitly not merged
- **#246** — frozen KF blockers unchanged
- Historical conflicting product queue — not cleared for queue hygiene

---

## Cross-workstream integration tests (ending main `fa26d602`)

| Suite | Result |
|---|---|
| `tsc --noEmit` | clean |
| capacity + customer-workflow + identity + greater-of + shared-lien spot | **119/119** |
| persistence-identity (live DB) | **SKIPPED / Neon unreachable** |

---

## Production activation blockers
1. Host IdP wiring for trusted issuer (no mock IdP)
2. Authenticated APPROVED financial evidence + utilization completeness for production remaining
3. Live EVAL DB run of #274 persistence-identity
4. PP002 still refuses PRODUCTION capacity (correct)
5. #246 KF graph uniqueness / duplicates / self-loops / rollback — still frozen

---

## Next three bounded engineering assignments
1. Run #274 persistence-identity against isolated EVAL Neon (`HEADROOM3_ALLOW_EVAL_DB=1`).
2. Wire host IdP → `resolveTrustedIssuerAuthFromHost` for one non-production path.
3. Close superseded tips `#273` / `#275` after owner ack; keep `#246` frozen.

---

## Agent closeout

```
WORKSTREAM STATUS: CLOSED
FINAL MAIN SHA: fa26d602f4b0551ad4fabf481a50355fcef61322
MERGED: #268, #276(+#277 fix), #274, #266, #273-via-#279, #275-via-#280
SELECTIVE_PORT: #273, #275
BLOCKED_CLAIM: #274 live persistence DB verification (env)
NOT_MERGED: #246 + historical conflict queue
HANDOFF: docs/canonical-merge-consolidation/2026-10-10-PRIORITY-AMENDMENT-HANDOFF.md
ARCHIVE STATUS: SAFE_TO_ARCHIVE
```
