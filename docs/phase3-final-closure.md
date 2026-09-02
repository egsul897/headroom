# Phase 3 Final Closure: Pass A Inventory Stability + Whole-Agreement Completion

Narrative for the closure mission run against evidence head `55e29d6` and frozen production `976a565`. Machine-readable evidence for every claim is in `docs/phase3-final-closure/00..24`. Production ended frozen at **`1957105c58be77465745566167f1a05708d4d3b5`** (FINAL_PASS_A_STABILITY_SHA, after the independent audit's remediation; the first v2 freeze `bd3b5be` is recorded as superseded in `07`).

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

## Independent audits and remediation

Three fresh agents audited this work; none of them wrote it.

**Audit 1** (against the first v2 cut) returned **BLOCKER** (`22`): an empty inventory over text carrying only the generic vocabulary could still be `INVENTORY_OK`; non-material echo items from the gap call could close a surfaced gap; completeness keyed on the status string alone; the matcher credited value changes and some folds; the omission cluster was mislocated; the exact-id figure mixed denominators. Fixed in commit 8a inside the same bounded scope - the gap decision moved before the empty-inventory branch, only CRITICAL/MATERIAL spans count as coverage, Pass C and compile refuse completeness on any residual segment, the matcher refuses differing values and flags folds under any different role, and the strict-fold lower bound is reported - with 6 new tests, then re-frozen.

**Audit 2** (against that remediated freeze) returned residual gaps: a quantitative value sitting under a REVIEW_UNCERTAIN item was still credited as covered; a REVIEW_UNCERTAIN item left MISSING_FROM_COMPOSITION did not block completeness; an accountability result that was not `semanticallyComplete` could pass compile unreported when no other accountability reason fired; and a proviso tail after a comma was hidden behind a covered main clause. All four are fixed in commit 8c: `ACCOUNTING_SPAN` now gates value coverage exactly as it gates text, REVIEW_UNCERTAIN-missing blocks completeness (materiality undetermined is never treated as immaterial), `SEMANTIC_ACCOUNTABILITY_INCOMPLETE` is a compile failure reason, and a conditional tail is its own segment admitted at a lower 16-character floor so a missing condition is never dropped for being short. Two tests added; 169/169. The auditor also asked for the general 40-character floor to be lowered to 24; that was tried and rejected on evidence - it made colon-terminated lead-ins fire as gaps across eleven corpus scenarios, and calibrating a detector by loosening it until the corpus breaks is not a fix. The floor stays 40 and is carried as a disclosed limitation, with the conditional-tail rule covering the case the auditor was actually protecting.

**Audit 3** ran against the final freeze `1957105` and returned **BLOCKER** - the most important result of this mission. It did not read the code and reason about it; it drove the real `runSemanticInventory` / `reconcileInventoryWithComposition` / `rollupAgreementSemanticStatus` with a scripted caller and showed material operative text being dropped with *zero* signal: a springing guarantee plus an all-assets lien grant (silent because it matches none of the segment vocabulary), an absolute debt prohibition and four enumerated Lien carve-outs (silent because they fall under the 40-character floor), a 30-day cure period and a maturity date (silent because completeness counts only MONEY/PERCENT/RATIO values), and a `$75M` cap inside an expanded definition (silent because both text and value accounting are scoped to the region literally named `operative`). Each ends in `INVENTORY_OK`, `semanticallyComplete: true`, no failure reason, and an agreement rollup of `SEMANTICALLY_COMPLETE`. The verbatim report is in `22`.

What the audit could *not* break matters too, and it says so itself: once a gap is detected it cannot be talked away - a non-covering gap item, a throwing gap call and non-material gap items all leave the gap open, and both reconciliation and compile key on `uninventoriedSegments.length` independently of the status string. The layer is sound on the detected path and unsound on the detection path, which is five conjunctive filters each individually sufficient to silence a material omission.

Nothing was patched in response. Three of the findings are one-line fixes and four require redesigning the detection layer, which this mission's scope forbids; patching the easy ones would have meant shipping further unaudited changes past the final freeze in a mission whose gates had already failed. They are recorded as an ordered backlog in `24`. What *was* done is documentary: every artifact claim the audit falsified has been withdrawn (`05.postAuditCorrection`), so no document in this package asserts a guarantee the evidence does not support.

The accurate description of the layer is the auditor's, not the one this package originally used: it surfaces uncovered operative text that happens to match a fixed connective vocabulary, exceeds a length floor, falls on a punctuation boundary, and sits in the operative region. It cannot be described as making silent omission of material operative content impossible.

## What could not run

The Gateway credential is HTTP 402 (`$150.49 / $150.00`, `08`). Every paid step stayed blocked: the targeted stability rerun the v2 change requires (`09-11`), whole-agreement run-1 regions 4-12 and run-2 (`12-14`), the whole-agreement gates (`15` refuses any aggregate pass: 6 of 8 families never ran), and the mandatory real shared-cap trace (`16`). The harness is ready to resume from region 4 with per-region SHA disclosure; zero paid calls were made in this mission.

## What did run

- Agreement-level rollup recomputed over all 16 completed real units: 0 false `SEMANTICALLY_COMPLETE` (`17`).
- Verifier taxonomy over 84 material findings: 12 inventory omissions, 47 composition omissions, 15 composition additions, 10 semantic disagreements; verifier untouched (`18`).
- 14/14 false-credit controls unchanged and passing (`19`).
- FWRG, LSB, CONMED, DSGR, Riot, Superior identical between the pre-mission head and HEAD in throwaway-worktree reruns (`20`).
- Postgres restored; tsc 0 new errors; lint clean; full vitest with 0 attributable regressions (`21`).

## Verdict

**`PHASE_3_NOT_CLOSED`** - limiting layer **`TRUST_BOUNDARY_REGRESSION`** (gate R), with `PASS_A_MODEL_STABILITY_LIMIT` failing gate A on independent real evidence and `ENVIRONMENT_BLOCKED` covering everything the provider budget prevented.

Gates A-R stand at 8 pass, 10 fail (`23`). Seven failures are environment-blocked; three are evidence failures - A (semantic inventory stability 77.6% conservative against 95%), J (disposition label stability 86.7%), and R (the audit blocker). The gate was not moved to fit the result, no aggregate pass is claimed from partial regions, and the audit that failed the mission was commissioned by it.

Two different things are needed next, and they should not be confused. The stability question is bounded and costed: raise the Gateway budget, run `09`'s command twice, resume `15`'s pre-registered manifest from region 4, run `17`'s shared-cap trace - roughly $43 against scripts that already exist. The trust-boundary question is not about spending: the detection path needs rework before any claim of semantic accountability is credible, starting with the two one-line fixes and the region-scope decision in `24.auditBacklog`.

Full machine-readable verdict: `24-final-verdict.json`; gate table: `23-phase3-release-gate.json`; audits: `22-independent-audit.json`.
