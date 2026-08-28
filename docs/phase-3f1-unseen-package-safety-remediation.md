# Phase 3F.1 — Unseen-Package Safety Remediation V1: Final Report

**Verdict: `PHASE_3F_1_SAFETY_REMEDIATION_NEEDS_ITERATION`**

The controlling safety gate (`DANGEROUS_UNFLAGGED_OMISSION = 0`, same strict/broad definitions as Phase 3F) is **not met** on the DSGR remediation regression: 89 CRITICAL ground-truth units remain dangerously unflagged omissions under the strict reading, 27 under the broad reading. Both are a real, measured improvement over the Phase 3F first-blind baseline (93 / 29 under the identical, corrected scoring methodology — see item 51), but neither reaches zero. All three frozen false-positive/review-burden thresholds pass comfortably, and 23 of 263 original violations are individually confirmed resolved by the intended mechanisms — but this is genuine, honest, partial progress, not a closed safety gate. Per the task's own historical-immutability requirement, DSGR is a **known regression package** for this run, never re-labeled unseen or blind; the frozen Phase 3F first-blind result, ground truth, and error taxonomy are untouched and remain the permanent record they always were.

This report covers: the purpose and scope of the four remediation workstreams, what each fixed and how it was tested, the pre-DSGR freeze, the $0 DSGR remediation regression rerun, its scoring against the same frozen ground truth, the exhaustive violation disposition table, the false-positive/review-burden gate results, the benchmark-contamination and historical-integrity checks, the full regression suite, the final verdict, and an explicit readiness recommendation for a future Phase 3F.2.

---

## 1–8: Purpose, scope, and governing constraints

1. **Purpose.** Phase 3F's frozen first-blind run against a genuinely unseen DSGR credit-facility package returned `PHASE_3F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION`, diagnosing 6 generalized architectural defects (F1–F6). Phase 3F.1's purpose was to remediate the underlying architecture — not to make DSGR specifically "pass" — so that any future unseen package benefits from the fix, per the task's own Core Architectural Principle.

2. **Scope: exactly four bounded workstreams**, matching F1/F2/F3/F6 one-to-one: A (hierarchical routing closure), B (contextual materiality propagation), C (operative-state honesty), D (compile-failure observability). F4 (structural parser noise) and F5 (discovery-layer recall) were explicitly out of scope and were not touched — no bounded supporting fix was mechanically required by A or B.

3. **Historical evidence immutability, verified, not merely asserted.** The Phase 3F first-blind run's own integrity manifest (`tests/fixtures/unseen-packages/phase-3f-first-blind-run/phase-3f-first-run-integrity-manifest.json`) was re-hashed after all Phase 3F.1 work completed: **all files match their recorded SHA-256 hashes, zero mismatches.** `git status` confirms zero modifications to any file under `tests/fixtures/unseen-packages/phase-3f-*` or `docs/phase-3f-unseen-package-validation.md` for the entire duration of this phase. The strict-119/broad-34 first-blind counts are unchanged and unchangeable by anything in this report.

4. **DSGR framing discipline.** Every artifact this phase produced under `tests/fixtures/unseen-packages/phase-3f1-*` uses a distinct run identifier (`PHASE_3F_1_DSGR_REMEDIATION_REGRESSION`), a separate output directory, and explicit "known regression package, not blind/unseen" language in its own generated summaries (`scripts/phase-3f1-dsgr-remediation-regression.ts`'s own console output and `final-summary.json.note`). No artifact in this phase claims generalization was proven.

5. **No package-specific production logic.** A grep across all of `lib/` for DSGR/company-name/CIK/known-count/fixture-ID tokens, run both before the DSGR rerun (frozen in the pre-DSGR freeze manifest) and re-run after it (item 55 below), found the same 4 raw hits — all doc-comments explaining the DSGR-motivated root cause of a generic fix, zero executable hits. Every closure trigger, materiality-floor rule, operative-state field, and failure-classification regex is a generic legal-drafting or software-observability pattern.

6. **Governing docs re-read** at phase start: `docs/HEADROOM-NORTH-STAR.md`, `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`, `docs/HEADROOM-ROADMAP.md`, `docs/phase-3f-unseen-package-validation.md` — confirmed this is a bounded remediation per Architecture Invariants #31 (local bugs → diagnosis → generalized remediation → regression test, never abandon the roadmap), not requiring a macro `ARCHITECTURE_CHANGE_PROPOSAL`.

7. **Stop condition honored.** This phase did not modify the first-blind historical result, tune DSGR-specific logic, repair DSGR's own amendment-target ambiguity, expand Phase 2B discovery, acquire a new unseen package, begin Phase 4, ingest financial data, or build UI.

8. **Commits in scope**, in order: `ba69777` (Workstream D), `b9454c2` (Workstream C), `a9c8826` (Workstream B), `2a2c591` + `c391da1` (Workstream A), `3e0b16f` (algorithm-version bump), `e78206c` (pre-DSGR freeze manifest), `c58f12c` (DSGR regression rerun + scoring).

## 9–15: Workstream D (F6) — compile-failure observability

9. **Root cause (F6).** `compileCovenantToIR` could lose a real thrown exception's own message: both the `caller.compile(input)` call and the normalize/validate block ran outside any local try/catch that preserved error content, so a caller's own try/catch (as in the Phase 3F first-blind run script) discarded it, leaving `{candidateRef, status: "FAILED"}` with no diagnostic trail — exactly the 2 unexplained failures Phase 3F's own taxonomy flagged.

10. **Fix.** New `SemanticCompilerErrorDetail` type and `errorDetail` field on `SemanticCompilationResult`; new `"TRANSPORT_OR_INTERNAL_ERROR"` failure reason; `sanitizeErrorMessage` (strips anything credential/token-shaped) and `classifyFailureCategory` (TRANSPORT vs INTERNAL, by message-shape heuristics, generic) helpers; both compile call-sites wrapped so a thrown exception now always produces a structured, non-null `errorDetail` instead of an opaque `FAILED` with no trail. `package-compile.ts`'s own outer catch now reuses the same classifier (defense in depth, since `compileCovenantToIR` no longer throws).

11. **Tests.** `tests/contract-model/phase-3f1-failure-observability.test.ts`, 10 tests: transport vs internal classification, credential/token sanitization, both call-sites' exception paths, and a fixture-bug fix along the way (empty `rules`/`definitions` unintentionally tripped the pre-existing `PARTIAL_COMPILATION` path in 4 tests — corrected).

12. **Regression check.** Full `tests/contract-model/semantic-compiler/` suite (88 tests) re-verified passing, no behavior change to a successful compile.

13–15. *(Reserved — Workstream D closed with no further open items; see the full regression suite in items 58–63 for its final confirmation.)*

## 16–24: Workstream C (F3) — operative-state honesty

16. **Root cause (F3).** `computeOperativeContractState` could report `status: OPERATIVE_STATE_RESOLVED` with `provisions: []` whenever an amendment effect's target instrument was genuinely unresolved — a status literally naming "resolved" success while zero provisions had actually been computed, risking a downstream consumer reading it as "nothing to disclose" instead of "nothing could be confidently resolved."

17. **Fix.** New `unattachedEffects: AmendmentEffectCandidate[]` field on `OperativeContractState`, populated from `groupEffectsByProvision`'s own unattached return plus an optional caller-asserted `unresolvedTargetEffectsForThisInstrument` (never inferred inside the function itself — Architecture Invariants #20's instrument-isolation discipline: the caller must supply real package-graph evidence, never a guess). `worstStatus` no longer defaults to RESOLVED when unattached activity is known; the status vocabulary (`OPERATIVE_STATE_RESOLVED | PARTIAL | REVIEW_REQUIRED | CONFLICTED`) now honestly reflects it.

18. **Coverage-layer wiring.** New `applyOperativeStateFindingsToCoverage` in `cross-reference-audit.ts`, wired into `pipeline.ts` between reconciliation and document-coverage rollup — closes the previously-dead `SemanticCoverageState.OPERATIVE_STATE_UNRESOLVED` and `PackageSemanticCoverageStatus.PACKAGE_OPERATIVE_STATE_UNRESOLVED` states, which existed in the type system but were never actually reachable.

19. **Tests.** `tests/contract-model/phase-3f1-operative-state-honesty.test.ts`, 6 tests, including an explicit instrument-isolation proof (test #40: an ambiguous effect passed only via the generic `allEffects` array, not the explicit per-instrument assertion field, does not leak into a different instrument's computed state).

20. **Regression check.** 2 existing fault-injection tests extended with new wiring-proof assertions (not replaced); full `tests/contract-model/` suite confirmed the 14 pre-existing failures are DB-connectivity, unrelated (git-stash-isolated proof, item 13 of the original investigation).

21. **DSGR-specific application (item 44 below covers the real-package result).** The 4 amendment effects the frozen first-blind run discovered all have `targetInstrumentKey: null`, and the package graph's own `relationshipCandidates`/`modificationCandidates` mark every one of them `status: "UNRESOLVED"` with explicit `unresolvedReason` text ("2 candidate documents of type CREDIT_AGREEMENT exist in this package and none matches the referenced execution date... never guessed from title similarity alone") — this is F3's mechanism confirmed verbatim in the real package's own frozen evidence, not a hypothetical.

22–24. *(Reserved — see items 44–46 for the DSGR-specific operative-state recomputation result.)*

## 25–35: Workstream B (F2) — contextual materiality propagation

25. **Root cause (F2).** `classifyMateriality()` evaluated a unit's own local text signals in complete isolation from its structural role; a qualitative exception-list sub-item with no inline dollar/percentage/keyword token of its own defaulted to `INFORMATIONAL`, even when membership in an operative restriction's exception list is itself what gives the item real legal/economic effect.

26. **Fix, part 1 (cross-reference bump).** `classifyMateriality` gains a second `ownText` parameter and a generic `CROSS_REFERENCE_PATTERN`: a unit whose own text is a bare cross-reference to another provision's economics ("permitted under Section 6.04", "described in clause (c) of the definition of...") with no local signal is now `REVIEW_UNCERTAIN`, never confidently `INFORMATIONAL`.

27. **Fix, part 2 (contextual materiality floor).** New `applyContextualMaterialityFloor`, a document-level post-processing pass (runs after all per-region units are hypothesized, since it needs cross-region parent/child visibility): floors a unit's materiality to `MATERIAL` — never `CRITICAL`, preserving the documented CRITICAL/MATERIAL distinction — when its immediate structural parent is itself operative (`PROHIBITION_SIGNAL`/`OBLIGATION_SIGNAL`/"except" in `detectedSignals`) and materially significant (`CRITICAL`/`MATERIAL`). New `contextuallyElevated: boolean` field on `MaterialSemanticUnit` records when the floor (not local signals) drove the tier, for downstream explainability.

28. **Selective, not universal — proven, not just asserted.** A materially-significant but merely `DEFINITIONAL_SIGNAL` parent does not elevate its children (dedicated test); units already at/above the floor, raw-source-fallback units, and units whose parent was never itself hypothesized are all left unchanged.

29. **Tests.** `tests/contract-model/phase-3f1-contextual-materiality.test.ts`, 11 tests: the cross-reference bump, direct `applyContextualMaterialityFloor` unit tests, and 2 end-to-end tests through the real router/hypothesis pipeline recovering the exact DSGR-confirmed pattern (a basket item with no inline numeric token, floored from INFORMATIONAL to MATERIAL).

30. **Regression check.** Full `tests/contract-model/semantic-coverage-*.test.ts` suite (129/129, later 148/148 after Workstream A) re-verified, including the real FWRG/LSB zero-cost regressions unchanged.

31–35. *(Reserved — see items 40–47 for the real DSGR materiality-elevation counts.)*

## 36–47: Workstream A (F1) — hierarchical routing closure

36. **Root cause (F1), the largest single driver of the original gate failure.** The router admitted a structural node only if its own local text independently tripped one of four narrow detectors. Real DSGR structure showed the actual failure shape: an operative prohibition ("shall not ... except:") and its lettered exception-list items are separate structural nodes, each independently evaluated — a qualitative basket item with no inline signal of its own was never routed at all, so no downstream materiality fix (Workstream B) could recover a unit that was never hypothesized because its region was never admitted.

37. **Fix — bounded, evidence-based closure**, running after the existing local-signal seed pass, never replacing it: `CHILD_OF_ROUTED_COVENANT_REGION` (direct children of an operative seed — one whose own signals include a prohibition/permission/exception marker — admitted even with zero local signal; recursion into a child's own children only continues when the child is itself enumerated, bounded by `MAX_CLOSURE_DEPTH = 3`); `SIBLING_IN_ROUTED_EXCEPTION_LIST` (once one list item qualifies, siblings under the same parent are pulled in); `CHAPEAU_OF_ROUTED_ENUMERATION` (the governing introductory clause is admitted even with no independent signal of its own); `TRAILING_PROVISO_OF_ROUTED_REGION` (a "provided, that..." continuation paragraph); `ANCESTOR_SCOPE_CONTEXT` (one further bounded hop to an ancestor ARTICLE/SECTION whose own heading independently carries a family headline — relevant because `HEADLINE_SECTION` admission is SECTION-only, so an ARTICLE-level umbrella heading is never self-admitted).

38. **False-positive control, proven in code and by test.** A `HEADLINE_SECTION`-only or `DEFINITION_NODE`-only seed (no operative prohibition/permission/exception signal) never triggers `CHILD_OF_ROUTED_COVENANT_REGION` closure — a bare family-keyword or definitional hit is not treated as an operative scope to expand from.

39. **Boundedness, measured, not asserted.** Every closure region records `closureDepth` and `closureSourceNodeKey`; a per-seed node cap (`MAX_CLOSURE_NODES_PER_SEED = 40`) stops runaway expansion from a single seed, disclosed via `RoutingClosureStats.capped` rather than silently truncating; `DocumentRoutingResult.closureStats` reports `seedRegionCount`/`closureAdmittedRegionCount`/`expansionFactor`/`maxClosureDepth`/`largestClosureGroupSize` for every routing run — mechanically checkable, not a post-hoc estimate.

40. **Tests.** `tests/contract-model/phase-3f1-routing-closure.test.ts`, 19 tests: end-to-end child/sibling/chapeau closure and false-positive control through the real parser/router pipeline, plus direct unit tests of the exported `closeRoutedRegions` (ancestor-scope, trailing-proviso, per-seed cap, max-depth bound, raw-source-fallback inertness, mixed raw+structural seed lists, and two independence checks) against a hand-built fake `StructuralIndex`.

41. **Regression check.** Full `tests/contract-model/semantic-coverage-*.test.ts` + `phase-3f1-*.test.ts` suite: 148/148 passing across 16 files, including the real FWRG/LSB zero-cost regressions unchanged (closure adds no new admissions there — their content already carries local signals at every exception-list item, the expected, disclosed behavior).

42. **Algorithm-version discipline.** `SEMANTIC_COVERAGE_ALGORITHM_VERSION` and `SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION` bumped v1 → v2, so every region/unit computed under the remediated algorithm is content-hash distinct from anything computed under the pre-remediation v1 algorithm — a precondition for the DSGR regression rerun below, which must tell recomputed Phase 3E output apart from the frozen first-blind v1 output it is compared against. `SEMANTIC_COVERAGE_PROMPT_VERSION` stays v1 (the AI Layer C prompt was not touched).

43. **Cumulative test count across all four workstreams: 46 dedicated Phase 3F.1 tests** (D: 10, C: 6, B: 11, A: 19), against the task's own ~55-test target across 8 categories. Raw-source-fallback got 2 dedicated tests rather than the originally-scoped 5 — the raw-source-fallback path itself was explicitly out of scope (F4/F5 excluded) and already carries its own pre-existing Phase 2F.1 test coverage, unmodified by this phase. This is disclosed here rather than silently reported as fully satisfying every category.

## 44–47: Real DSGR effect of Workstreams A/B/C, measured directly

44. **Operative-state (Workstream C) on real DSGR data.** Recomputing `computeOperativeContractState` with the frozen amendment effects and the caller-asserted `unresolvedTargetEffectsForThisInstrument` (justified by real package-graph UNRESOLVED evidence, item 21) moves status from the original `OPERATIVE_STATE_RESOLVED` with 0 provisions (the exact F3 finding) to `OPERATIVE_STATE_REVIEW_REQUIRED` with 4 honestly-surfaced `unattachedEffects` — the false "fully resolved" reading is gone. Because zero units end up anchored to any `operativeState.provisions` entry for this package (there are none, by the same genuine amendment-target ambiguity), `auditOperativeStateForUnits` produces zero findings for DSGR specifically — F3's coverage-layer wiring (item 18) is correctly implemented and unit-tested, but this real package's own irreducible ambiguity means its *observable* effect on DSGR's dangerous-omission count is limited to the status-honesty improvement itself, not a new wave of flagged units. This is disclosed as a real, specific finding, not glossed over.

45. **Unit inventory, whole package (Workstreams A+B combined effect).** Total units 6,210 → 7,517 (ratio 1.21x); `MATERIAL`+`CRITICAL` 2,214 → 2,766 (ratio 1.25x); `CRITICAL` alone **unchanged at 431** — direct, real-data confirmation that the contextual floor never manufactures a new CRITICAL by nesting under a CRITICAL parent, exactly as designed and tested. 552 units carry `contextuallyElevated: true`.

46. **A genuine, disclosed scoring-methodology fix was required and applied — not a production-code change.** The original Phase 3F scorer's exact-match-preferred logic stops looking the moment any unit exists at a ground-truth address; once Workstream A began correctly recovering previously-missing chapeaus (e.g. `SECTION 2.01. Commitments.`, one of F1's own named example gaps), the scorer would stop at the chapeau's own deliberately-thin `INFORMATIONAL` unit and never see its real, high-materiality lettered children (`2.01(a)` `CRITICAL`, `2.01(c)` `CRITICAL`) — paradoxically *inflating* the measured violation count as a direct consequence of the fix working. Diagnosed via an explicit "newly introduced violations" check (gtUnitIds that were safe in the first-blind run but became violations in the naively-scored regression: 98, 44 of them CRITICAL) before being accepted as a real result. The regression-only scorer (`scripts/phase-3f1-score-dsgr-regression.ts`) was corrected to union descendant units into an exact match rather than discarding them; after the fix, newly-introduced violations = 0. The permanent, original `scripts/phase-3f-score-first-run.ts` and its sealed `phase-3f-scoring-report.json` output were never modified — both this report's baseline comparison numbers (item 51) and the regression numbers were computed with the identical corrected methodology, for a fair comparison, and are reported alongside the permanent original 119/34 figures rather than replacing them.

47. **False-positive/review-burden gates — all three PASS, against the thresholds frozen before this rerun.** Total unit growth 1.21x (≤1.5x threshold); `MATERIAL`+`CRITICAL` inflation 1.25x (≤2.5x); review-burden (`MATERIAL`+`CRITICAL`+`REVIEW_UNCERTAIN`) growth 1.17x (≤2.0x). None of the remediation's real gains came at the cost of an unreasonable false-positive/review-burden increase.

## 48–52: The DSGR remediation regression rerun itself

48. **Pre-DSGR freeze manifest** (`tests/fixtures/unseen-packages/phase-3f1-freeze/phase-3f1-freeze-manifest.json`), written and committed (`e78206c`) *before* the rerun (task §48's own ordering requirement): code SHA, algorithm versions, the full 148-test synthetic result set, the pre-DSGR benchmark grep result, and the frozen false-positive/review-burden thresholds derived from the sealed first-blind baseline numbers — all four thresholds in item 47 above were committed to in writing before this rerun's actual numbers existed.

49. **$0 cost, by construction.** Phase 2A/2B/2C/3B/3C output is loaded byte-for-byte from the sealed `phase-3f-first-blind-run/` artifacts, never recomputed or re-spent (`scripts/phase-3f1-dsgr-remediation-regression.ts`); only Phase 3E (routing/inventory/materiality/reconciliation/coverage) and Phase 2G's operative-state computation are recomputed, using the current post-Workstream-A–D code. Actual measured cost: `$0`; wall-clock: ~2 seconds.

50. **Output isolation.** All regression output lives under `tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression/`, run identifier `PHASE_3F_1_DSGR_REMEDIATION_REGRESSION` — never `PHASE_3F_FIRST_BLIND_RUN`, never written into the frozen `phase-3f-first-blind-run/` directory.

51. **Controlling safety gate, before/after, identical corrected methodology (item 46):**

    | | strict CRITICAL | broad CRITICAL |
    |---|---|---|
    | First-blind baseline (this corrected methodology) | 93 | 29 |
    | First-blind baseline (permanent, original methodology, unchanged) | **119** | **34** |
    | DSGR remediation regression | **89** | **27** |
    | Gate requirement | 0 | — |
    | Gate met? | **NO** | — |

    Both the corrected-methodology comparison (93→89, 29→27) and reasoning against the permanent original figures (119/34, which used the pre-fix scorer and pre-remediation code) point the same direction: real, measured, modest improvement; gate not met.

52. **Exhaustive violation disposition — every one of the 263 original (corrected-methodology) violations individually tracked, no aggregate-only reporting:** 23 resolved (`RESOLVED_BY_CONTEXTUAL_MATERIALITY`), 240 still violations (180 `STILL_DOWNGRADED`, 60 `STILL_MISSING`), 0 newly introduced. Full table: `tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression/phase-3f1-dsgr-regression-scoring-report.json`'s `exhaustiveViolationDispositionTable`. A targeted disposition of the specific F1/F2 sampled cases named in the frozen error taxonomy (`f1SampledCaseDisposition`/`f2SampledCaseDisposition` in the same report) is included alongside the exhaustive table.

## 53–57: Honest diagnosis of the remaining gap

53. **60 `STILL_MISSING` cases** — ground-truth CRITICAL/MATERIAL units with no audit match at any level (exact/parent/descendant), even after closure. These are concentrated where the section itself was never independently a "seed" (no local prohibition/permission/exception signal) *and* is not structurally reachable from one within the closure's bounded depth/relationship set — i.e., genuine coverage gaps closure's specific, bounded relationship vocabulary (child/sibling/chapeau/proviso/ancestor) does not reach. This is not a defect in the closure mechanism's own correctness (its false-positive control and boundedness are both proven, items 38–39); it is evidence the vocabulary of structural relationships covered is not yet exhaustive for every real drafting pattern this package contains.

54. **180 `STILL_DOWNGRADED` cases** — an audit unit exists at the address, but its materiality is still below ground truth. Some fraction of these are units the contextual floor's own selectivity rule correctly declines to elevate (a materially-significant but non-operative parent, or a unit whose own text genuinely reads as informational) — exactly the selective-not-universal behavior Workstream B was designed to have, applied faithfully. Distinguishing "correctly non-elevated" from "should have been elevated but the floor's evidence rule didn't reach it" for all 180 cases individually was not performed within this phase's own scope; a future phase should sample and classify this population before deciding whether Workstream B's floor rule needs a second, still-bounded relationship (e.g., a sibling-of-an-operative-item's own floor, not just a child-of-operative-parent's).

55. **Re-run benchmark-contamination grep, post-DSGR-rerun (task §183's own re-check).** Identical result to the pre-DSGR grep (item 5): 4 raw comment-only hits in `lib/`, 0 executable hits; no dangerous-count literals, CIK numbers, or DSGR fixture-path references in production code; the two new regression/scoring scripts (`scripts/phase-3f1-*.ts`) are confirmed not imported by any `lib/` or `app/` production module.

56. **Historical artifact integrity re-verified.** The Phase 3F first-blind integrity manifest's SHA-256 hashes were re-checked immediately before writing this report: all files match, zero mismatches. `git log` confirms no commit in this phase touched any path under `tests/fixtures/unseen-packages/phase-3f-first-blind-run/`, `phase-3f-ground-truth/`, or `phase-3f-freeze/`, nor `docs/phase-3f-unseen-package-validation.md`.

57. **Ground truth immutability.** No ground-truth file was edited. No objectively-discovered annotation error was found during this phase's work (none of the disposition-table reasoning required disputing a ground-truth unit's own materiality or existence) — had one been found, this report would document it separately rather than silently editing the ground truth, per the task's own explicit instruction; none arose.

## 58–63: Full regression suite

58. **TypeScript.** `npx tsc --noEmit -p tsconfig.json` — clean, zero errors, at every commit in this phase.

59. **ESLint.** `npx next lint` — `✔ No ESLint warnings or errors`.

60. **Production build.** `npx next build` — compiles successfully, all routes generated, no errors.

61. **Vitest, full suite.** `npx vitest run`: 1,156 passing, 104 failing, 167 skipped, across 201 files. All 104 failures (48 files) are the pre-existing sandbox DB-connectivity limitation (`Can't reach database server at localhost:5432` — confirmed no Postgres running, no `DATABASE_URL` configured in this environment) — every failing file is a DB-integration-dependent suite (covenant-engine, onboarding, connectors, versioning, `tenant-isolation.test.ts` included, whose own failure is in its Prisma teardown, not tenant-isolation logic itself). Zero new failures attributable to this phase's changes; confirmed via git-stash isolation during Workstream C (item 20) and consistent scope of the failing-file list across the whole session.

62. **Golden tests.** `npx tsx scripts/golden-test.ts` — same DB-connectivity limitation (`prisma.goldenTest.findMany` cannot reach the database); not independently runnable in this sandbox, consistent with every prior phase's documented limitation.

63. **Phase 3F.1-specific suite, isolated.** `npx vitest run tests/contract-model/semantic-coverage-*.test.ts tests/contract-model/phase-3f1-*.test.ts` (no DB dependency): **148/148 passing**, 16 files, including the real FWRG/LSB zero-cost regressions unchanged.

## 64–66: Architecture, synthetic-safety, and DSGR remediation gates

64. **Architecture gate: PASS.** No macro architecture change was made or required; the four fixes are bounded, additive extensions to existing modules (router.ts, unit-hypothesis.ts, operative-state.ts, cross-reference-audit.ts, compile.ts), consistent with Architecture Invariants #31.

65. **Synthetic-safety gate: PASS.** 46 dedicated adversarial tests (item 43) plus the full pre-existing `tests/contract-model/semantic-coverage-*.test.ts` suite (102 tests) all green (148/148 combined, item 63); false-positive control and boundedness both directly proven by dedicated tests, not merely by aggregate metrics.

66. **DSGR remediation gate: NOT MET.** The controlling safety gate (item 51) is the primary pass/fail criterion and is not met; the false-positive/review-burden gates (item 47) all pass but are secondary guards that apply only when the primary gate is met, per the frozen manifest's own stated precedence.

## 67–70: Final verdict, format, and required disclosures

67. **`PHASE_3F_1_SAFETY_REMEDIATION_NEEDS_ITERATION`** — chosen per the task's own two-option verdict format. The alternative, `PHASE_3F_1_SAFETY_REMEDIATION_GATE_PASSED`, does not apply: the controlling gate (strict CRITICAL dangerous-unflagged-omission count = 0) is not reached (89 remain).

68. **The Phase 3F first-blind result remains fully present and unmodified in this report and in the repository** (item 51's table quotes it verbatim; the sealed artifacts and doc are untouched, item 3/56).

69. **Error-class attribution, honestly split.** Of the original F1/F2-attributable violation population, roughly 9% (23/263) resolved cleanly under the intended mechanism; the remainder splits into a genuine coverage-vocabulary gap (F1's closure relationships, still bounded, do not yet reach every real drafting pattern — item 53) and a genuine floor-selectivity population not yet individually triaged (item 54) — not a single dominant remaining cause, two separate, disclosed ones.

70. **No compilation-coverage requirement was newly imposed or newly violated.** This phase, like Phase 3F, does not require `FULLY_REPRESENTED_VERIFIED` coverage on uncompiled content — the frozen `compilationVerificationScopeRule` from Phase 3F continues to govern, unchanged.

## 71–78: Phase 3F.2 readiness recommendation

71. **Phase 3F.2 (a future, separate task) is NOT authorized to begin by this report**, per the task's own explicit instruction that this phase must state readiness but never execute it.

72. **Recommended precondition before Phase 3F.2:** triage the 180 `STILL_DOWNGRADED` cases (item 54) into "correctly non-elevated by design" vs. "a real, bounded closure/floor gap" — this single piece of analysis, not yet performed, would materially sharpen whether the next remediation increment should extend the floor's relationship vocabulary (e.g., sibling-of-operative-item, not just child-of-operative-parent) or leave it as-is.

73. **Recommended precondition:** extend the 60 `STILL_MISSING` cases (item 53) with a structural-pattern audit — for each, record which of the five closure relationships (child/sibling/chapeau/proviso/ancestor) came closest to reaching it and why it fell short (depth cap? no operative seed within reach? a drafting pattern the current relationship vocabulary doesn't model at all?). This phase's own scope did not include this per-case root-causing.

74. **Phase 3F.2's design, when it happens, must use a genuinely new unseen package** — DSGR is permanently a known regression package after this phase (and was already one after Phase 3F's own first-blind run); a second DSGR pass, however framed, could never be reported as "unseen" or as evidence of generalization, only as further regression evidence on the same fixture.

75. **Phase 3F.2 should re-use this phase's freeze-manifest and regression-rerun pattern** (a pre-package freeze committing thresholds in writing before results exist; a genuinely zero-manual-selection blind run; a scorer whose matching methodology is fixed and audited *before* trusting its numbers, per the lesson of item 46) rather than inventing a new process.

76. **A recommended, not required, next increment**: consider whether the closure mechanism's boundedness constants (`MAX_CLOSURE_DEPTH = 3`, `MAX_CLOSURE_NODES_PER_SEED = 40`) are appropriately calibrated against a second real package's own structural depth/breadth before assuming they generalize — this phase measured them only against DSGR.

77. **This report and its underlying artifacts are the complete, permanent record of Phase 3F.1** — no further remediation, tuning, or DSGR re-scoring should be performed under this phase's own name; any continuation is Phase 3F.2's work, subject to its own separate authorization.

78. **Full artifact index:** `lib/contract-model/compiler/semantic-coverage/{router,unit-hypothesis,types}.ts`, `lib/contract-model/compiler/amendment/{operative-state,types}.ts`, `lib/contract-model/compiler/semantic-coverage/cross-reference-audit.ts`, `lib/contract-model/compiler/semantic/{compile,package-compile,types}.ts` (production changes); `tests/contract-model/phase-3f1-{failure-observability,operative-state-honesty,contextual-materiality,routing-closure}.test.ts` (46 new tests); `tests/fixtures/unseen-packages/phase-3f1-freeze/phase-3f1-freeze-manifest.json` (pre-DSGR freeze); `scripts/phase-3f1-dsgr-remediation-regression.ts` + `scripts/phase-3f1-score-dsgr-regression.ts` and their output under `tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression/` (the rerun and its scoring); this document.
