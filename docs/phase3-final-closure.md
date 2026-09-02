# Phase 3 Final Closure: Pass A Inventory Stability + Whole-Agreement Completion

Narrative for the closure mission run against evidence head `55e29d6` and frozen production `976a565`. Machine-readable evidence for every claim is in `docs/phase3-final-closure/00..24`. Production ended frozen at **`c496751f91cbc91e5b27b87a1cc128e0757f5a11`** (FINAL_PASS_A_STABILITY_SHA, after the independent audit's remediation; the first v2 freeze `bd3b5be` is recorded as superseded in `07`).

## What the 90.11% actually measured

The previous release gate reported "Pass-A-derived disposition stability 90.11%". Zero-cost forensics over the two preserved post-RVD-1 holdout runs (`01`, `02`) show that number was `sameDisposition / inBoth` over the 91 material items sharing an **exact content-derived id**; its 9 disagreements were Pass B disposition *labels* flipping (UNSUPPORTED to REPRESENTED), 7 of them one UNSUPPORTED cascade in a single unit. The 372 "inventory-variance" items were outside that denominator entirely.

Rebuilt on a source-first semantic matcher (`scripts/lib/pass-a-semantic-matcher.ts`, zero LLM: spans, roles, deterministic values only), the 372 decompose into 196 span-boundary, 108 split/merge, 44 role-label differences (93.5% identity-attributable, harmless downstream: captured-status stability 98.98%), 9 true semantic variance, 1 unknown, and 14 material genuine omissions. Semantic inventory stability against the pre-registered 95% (applied to the conservative figure only):

| metric | value |
|---|---|
| lenient (present in both runs, values agree) | 90.4% |
| **conservative** (folded conditional roles never credited) | **77.6%** |
| strict-fold lower bound (every material fragment unstable) | 64.8% |
| adjudicated (uses model prose; informational only) | 88.0% |
| exact content-derived id | 18.88% |

## Earliest failure layer and the decision

Source context is byte-identical across runs; a truncated inventory cannot parse and becomes `INVENTORY_FAILED`; the anti-hallucination and duplicate gates dropped 1 and 3 items. The residual is **PASS_A_MODEL_OMISSION** with two measured signatures: region-tail and sub-clause omission. After the audit's correction (`04`), the 4 CRITICAL items of the cited cluster sit in a cross-reference *expansion* region, where inventorying is discretionary by the Pass A contract; in the operative regions the genuine material omissions are 10 with 0 CRITICAL semantic omissions.

Decision (`05`): **Option C**, bounded to Pass A. Deterministic clause segmentation, an uncovered-segment rule, one targeted gap re-inventory call that receives only the uncovered segments and can only *add* items through the identical gates, and a surfaced `INVENTORY_COVERAGE_GAP` status that blocks completeness and compile `COMPLETED`. Running the detector over the synthetic corpus exposed three scenarios whose ground truth omitted the definitional lead-in and a "without duplication" condition; the corpus was extended, not the detector weakened (`06`).

## Independent audit and remediation

A fresh agent audited the first v2 cut and returned **BLOCKER** (`22`): an empty inventory over text carrying only the generic vocabulary could still be `INVENTORY_OK`; non-material echo items from the gap call could close a surfaced gap; completeness keyed on the status string alone; the matcher credited value changes and some folds; the omission cluster was mislocated; the exact-id figure mixed denominators. All were fixed in commit 8a within the same bounded scope (gap decided before the empty-inventory branch; only CRITICAL/MATERIAL spans count as coverage; Pass C and compile refuse completeness on any residual segment; matcher refuses differing values and flags folds under any different role; strict-fold lower bound reported), with 6 new tests (167/167), and production was re-frozen. A second fresh agent re-audited the blocker items against the remediated freeze; its report is in `22`. The operative-region-only scope of coverage accounting and the 40-character floor remain as disclosed limitations.

## What could not run

The Gateway credential is HTTP 402 (`$150.49 / $150.00`, `08`). Every paid step stayed blocked: the targeted stability rerun the v2 change requires (`09-11`), whole-agreement run-1 regions 4-12 and run-2 (`12-14`), the whole-agreement gates (`15` refuses any aggregate pass: 6 of 8 families never ran), and the mandatory real shared-cap trace (`16`). The harness is ready to resume from region 4 with per-region SHA disclosure; zero paid calls were made in this mission.

## What did run

- Agreement-level rollup recomputed over all 16 completed real units: 0 false `SEMANTICALLY_COMPLETE` (`17`).
- Verifier taxonomy over 84 material findings: 12 inventory omissions, 47 composition omissions, 15 composition additions, 10 semantic disagreements; verifier untouched (`18`).
- 14/14 false-credit controls unchanged and passing (`19`).
- FWRG, LSB, CONMED, DSGR, Riot, Superior identical between the pre-mission head and HEAD in throwaway-worktree reruns (`20`).
- Postgres restored; tsc 0 new errors; lint clean; full vitest with 0 attributable regressions (`21`).

## Verdict

See `24-final-verdict.json`; gate table in `23-phase3-release-gate.json`.
