# Phase 3 Final Closure: Pass A Inventory Stability + Whole-Agreement Completion

Narrative for the closure mission run against evidence head `55e29d6` and frozen production `976a565`. Machine-readable evidence for every claim is in `docs/phase3-final-closure/00..24`. Production ended frozen at **`bd3b5bec2c955e8c9c99a379e288e10e056a95e9`** (FINAL_PASS_A_STABILITY_SHA).

## What the 90.11% actually measured

The previous release gate reported "Pass-A-derived disposition stability 90.11%". Zero-cost forensics over the two preserved post-RVD-1 holdout runs (`01`, `02`) show that number was `sameDisposition / inBoth` over the 91 material items that shared an **exact content-derived id**; its 9 disagreements were Pass B disposition *labels* flipping (UNSUPPORTED to REPRESENTED), 7 of them one UNSUPPORTED cascade in a single unit. The 372 "inventory-variance" items were outside that denominator entirely.

Rebuilt on a source-first semantic matcher (`scripts/lib/pass-a-semantic-matcher.ts`, zero LLM: spans, roles, deterministic values only), the 372 decompose into 196 span-boundary, 108 split/merge, 44 role-label differences (93.5% identity-attributable, harmless downstream: captured-status stability 98.98%), 9 true semantic variance, 1 unknown, and **14 material genuine omissions** (13 semantic after removing one connective header; 4 CRITICAL, all one cluster: run-2 never inventoried the trailing third definition of the interest-expense unit). Semantic inventory stability is **90.4% lenient / 88.4% adjudicated / 78.4% conservative** (folded conditions never normalized away) against the pre-registered 95%, which stays authoritative. Exact-id stability was only 19.65%. Coverage-weighted stability (86.7%) is reported as supplementary, never as the gate.

## Earliest failure layer and the decision

Source context is byte-identical across runs; a truncated inventory cannot parse and becomes `INVENTORY_FAILED` (all 12 were `INVENTORY_OK`); the anti-hallucination and duplicate gates dropped 1 and 3 items in total. The residual is **PASS_A_MODEL_OMISSION** with two measured signatures: region-tail omission (9/22 in the last 20% of the region) and sub-clause omission (10/22 under 60 characters). Production had no accounting for operative *text* it left uncovered, only for values.

Decision (`05`): **Option C**, bounded to Pass A. Deterministic clause segmentation, an uncovered-segment rule (<50% covered, >=40 non-whitespace chars, generic operative/conditional drafting vocabulary), one targeted gap re-inventory call that receives only the uncovered segments and can only *add* items through the identical gates, and a surfaced `INVENTORY_COVERAGE_GAP` status that blocks completeness and compile `COMPLETED`. Nothing is merged, relabelled, rewritten, or normalized away. 22 new tests (161/161 total); running the detector over the synthetic corpus exposed three scenarios whose ground truth omitted the definitional lead-in and a "without duplication" condition, so the corpus was extended, not the detector weakened (`06`).

## What could not run

The Gateway credential is HTTP 402 (`$150.49 / $150.00`, `08`). Every paid step stayed blocked: the targeted stability rerun the v2 change requires (`09-11`), whole-agreement run-1 regions 4-12 and run-2 (`12-14`), the whole-agreement gates (`15` refuses any aggregate pass: 6 of 8 families never ran), and the mandatory real shared-cap trace (`16`: the pre-registered region failed at the provider before any inventory existed). The harness is ready to resume from region 4 with per-region SHA disclosure; zero paid calls were made in this mission.

## What did run

- Agreement-level rollup recomputed with the real rollup over all 16 completed units: 0 false `SEMANTICALLY_COMPLETE` (`17`).
- Verifier taxonomy over 84 material findings: 12 inventory omissions, 47 composition omissions, 15 composition additions, 10 semantic disagreements; the verifier is untouched (`18`).
- 14/14 false-credit controls unchanged and passing (`19`).
- FWRG, LSB, CONMED, DSGR, Riot, Superior: identical between the pre-mission head and HEAD in throwaway-worktree reruns; historical artifacts those scripts rewrite were restored (`20`).
- Postgres restored; tsc 0 new errors; lint clean; 285/290 vitest files, the 3 non-baseline failures reproduced as load/timing-sensitive and pass in isolation at both heads (`21`).
- Fresh independent audit by a separate agent (`22`).

## Verdict

See `24-final-verdict.json`. Gate table in `23-phase3-release-gate.json`.
