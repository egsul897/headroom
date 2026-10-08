# Phase 2 — Ground-Truth Integrity

**Starting PR:** #149  
**Starting SHA:** `66f8164ac85eb6aec37f3a7cb60451d614079a4f`  
**Verdict:** `SOURCE_TO_COVENANT_PHASE2_INTEGRITY_DELIVERED`  
**Nature:** Data/eval integrity — not a compiler replacement; not a certification change.

## Mandatory return (summary)

| # | Item | Result |
|---|---|---|
| 1 | Authentic examples added | **208** (total corpus **229**; prior seed 21) |
| 2 | Independently verified labels | **0** (none have `verification_record_id` + independent reviewer) |
| 3 | Labels lacking independent review | **229** (all); **13** demoted from Phase-1 `HUMAN_SOURCE_VERIFIED` |
| 4 | Controlling-context completeness | SOURCE_WINDOW_PRESENT on all; **80** COMPLETE; **141** CONTEXT_INCOMPLETE; remainder SOURCE_WINDOW_PRESENT-only |
| 5 | Duplicate/leakage findings | Exact-dup pairs documented; intentional probe + shared-context decisions retained; **0** held-out issuer leakage |
| 6 | Training-eligible records | **0** (SFT blocked) |
| 7 | Evaluation-eligible records | **227** |
| 8 | Import results | KF delivery package prepared for **229**; **0** accepted for import (blocked pending independent verification + rights) |
| 9 | SHA / tests / CI / PR | See PR update; focused tests **16/16** pass; draft PR #149; no merge |

## Verification audit

Phase-1 claimed 13 `HUMAN_SOURCE_VERIFIED` records. Independent review **cannot be demonstrated**: the dataset builder authored the candidate labels and the verification mark. Per mission rules, those claims were **demoted** to `HUMAN_HYPOTHESIS` with `verificationHistory` preserved. No reviewers were invented.

## Expansion limits (honest)

Target was +200 examples across ≥50 issuers. Achieved **+208 authentic examples** across **7 acquired issuers** in-repo (LSB, FWRG, CONMED, DSGR, Chewy, Gibraltar, Riot). The 50-issuer target is **not met** because EDGAR Historical Backfill has not delivered ≥50 acquired document packages into this workspace. No synthetic examples were added to the real-source subset.

Coordination with peer corpora (read-only): exception DB, basket formula library exports under `datasets/source-to-covenant/peer-inputs/`.

## SFT safety

`exports/sft-ready.jsonl` is **empty**. `exports/sft-export-block.json` states the block. No fine-tuning and no weight downloads.

## Evaluation benchmark

`benchmark/evaluation-benchmark.json` — challenge-tagged cases; **no compiler/model executed**; **no performance metrics reported**.

## Knowledge-factory import

`exports/knowledge-factory-import.json` conforms to `corpus-dataset-delivery-contract.v1` without creating a competing Prisma schema. Idempotent content identity = exampleId + windowSha256 + document/amendment identity. All rows currently `importable: false`.
