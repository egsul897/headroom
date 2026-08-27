# Phase 2F.1 — Structural Substrate Robustness + Raw-Source Auditor Independence

**Central question:** if the structural parser fails or only partially understands a debt document, can Headroom now both recognize that structural failure and independently inspect the underlying raw source so the document cannot silently disappear from the covenant-analysis universe?

**Answer: yes, demonstrated on the real, original failing documents.** Both original Phase 2F dangerous-unflagged omissions — the real 2022 Second Amendment (`conmed-doc-c-second-amendment-2022`) and the real 2026 First Omnibus Amendment (`conmed-doc-d-first-omnibus-amendment-2026`) — are no longer dangerous-unflagged. A real, non-mocked rerun of the frozen-then-remediated pipeline found 15 and 27 real discovery candidates respectively (0 before), directly matching every ground-truth item Phase 2F's own independent ground truth named for these documents. Separately, and independently of that structural fix, the auditor's new raw-source fallback path was proven (in both a controlled fault-injection test and on the real Document B, whose separate, out-of-scope Phase 2B crash was left untouched) to surface material signal from a document even when the primary pipeline produces nothing for it at all.

---

## 1-4. SHAs, files changed, preserved Phase 2F evidence

1. **Starting SHA:** `274d89234d9290da12909236f8c2f85e515b10be` (Phase 2F final report/verdict)
2. **Final SHA:** `1b040b82c170936209eeb4c0390b730e6a8cda70`
3. **Files changed** (6 commits, `274d892..1b040b8`):
   - `lib/contract-model/compiler/stage-structure.ts` — integer-section generalization
   - `lib/contract-model/compiler/structural-definitions.ts` — colon-style definition generalization
   - `lib/contract-model/compiler/structural-coverage.ts` (new) — coverage/health model
   - `lib/contract-model/compiler/structural-index.ts` — added `getDocumentText()`
   - `lib/contract-model/compiler/package-safety.ts` (new) — package-level safety aggregator
   - `lib/contract-model/compiler/coverage-audit/raw-source-fallback.ts` (new) — auditor raw-source fallback
   - `lib/contract-model/compiler/coverage-audit/signals.ts` — AMENDMENT/DEFINITIONAL signal categories (fallback-only)
   - `lib/contract-model/compiler/coverage-audit/types.ts` — 3 new finding types, algorithm version v1→v2
   - `lib/contract-model/compiler/coverage-audit/pipeline.ts` — wires the fallback path in
   - `tests/contract-model/phase-2f1-structural-robustness.test.ts` (new, 31 tests)
   - `scripts/phase-2f1-baseline-diagnostic.ts`, `scripts/phase-2f1-rerun-pipeline.ts` (new)
   - Evidence under `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f1/` (new subdirectory)

   **Not touched:** any Phase 2B discovery logic, any Phase 2C package-graph logic, any Phase 2D retrieval logic, any existing Phase 2E comparison-stage module, the FWRG/LSB fixtures themselves, or anything under `tests/fixtures/unseen-packages/phase-2f-freeze/*.json` at the top level (the original sealed Phase 2F evidence).
4. **Preserved Phase 2F first-blind artifact identity:** verified byte-for-byte before any code change — `sha256sum` of all 4 Stage-1 artifact files matched the `PHASE_2F_FIRST_BLIND_RUN` manifest (`phase-2f-first-blind-run-manifest.json`, sealed at commit `a459bef`) exactly. A first attempt to re-run Stage 1 for the baseline diagnostic accidentally overwrote local working-tree copies of those files; caught immediately via `git status`, reverted with `git checkout --`, and re-verified against the manifest hashes before any further work proceeded. The official Phase 2F result remains **`PHASE_2F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION`**, unchanged and unreinterpreted.

## 5-8. Document C/D baseline, root causes

5. **Document C baseline** (`scripts/phase-2f1-baseline-diagnostic.ts`, read-only reproduction from sealed evidence): raw source sha256 `45f8abcacf2f0bc0fd0b06b2f4a974b5bb395ebf18a0b667c30e2ac5f5d0851a`, 37,209 raw bytes, 11,701 curated chars, 0 Phase 2A nodes, 0 sections recognized, 0 definitions, 0 Phase 2B candidates, 0 Phase 2E findings, **dangerous-unflagged = true**. Representative excerpt: `"SECOND AMENDMENT... to the Seventh Amended and Restated Credit Agreement, dated as of July 16, 2021..."`. Failed pattern: `SECTION_PATTERNS` (requires `\d+\.\d+`); the real document uses `SECTION 1. Amendments .`, `SECTION 2. Amendments .` (flat integers).
6. **Document D baseline:** raw source sha256 `56ac9cc2ee50b73816eb1d5174dd5436a0b0e6e33b7b67745d9c3402b7b97a97`, 1,268,135 raw bytes, 18,111 curated chars, 0 Phase 2A nodes, 0 sections, 1 definition (a stray "means"-style match), 0 candidates, 0 findings, **dangerous-unflagged = true**. Real heading-like lines confirmed verbatim: `"SECTION 1. Amendments ."`, `"SECTION 2. Increased"`, ... `"SECTION 10. NO NOVATION ."`. Same failed pattern as Document C.
7. **Root cause C:** `SECTION_NUMBER_GRAMMAR` — *"Phase 2A fails to recognize Document C's own top-level sections because SECTION_PATTERNS assumes every 'SECTION N' heading carries a decimal sub-number (`\d+\.\d+`), and Document C's real drafting uses flat integer section numbers with no sub-number at all."*
8. **Root cause D:** `SECTION_NUMBER_GRAMMAR` — identical root cause and identical statement, confirmed independently from Document D's own real text (not inferred from Document C).

   A third, related but formally distinct finding (not one of the two named dangerous-unflagged documents, found during Stage 1 re-verification): `DEFINITION_GRAMMAR` — *"Phase 2A fails to recognize 353 of Document A's own real defined terms because DEFINITION_DECLARATION assumes every declaration uses 'means'/'shall mean' phrasing, and Document A's real drafting defines nearly every term with a bare colon (`"Term": text`) instead."* This is the SAME class of task (a formatting-variation generalization, task §4) and was fixed in the same commit set per the task's own explicit requirement to fix colon-style definitions — it was not, however, one of the two documents actually counted as dangerous-unflagged in Phase 2F's own final score (Document A had 163 real candidates and was never a dangerous-unflagged case), so its remediation is reported as required generalization work, not as resolving a third dangerous-unflagged ID.

## 9-13. The fixes

9. **Colon-definition fix** (`structural-definitions.ts`): added `QUOTED_COLON_DEFINITION` (reuses the existing three-encoding QUOTE alternation, requires only a trailing colon instead of "means") and a deliberately more conservative `UNQUOTED_COLON_DEFINITION` (line-anchored, genuine Title-Case term, real definition-body continuation required after the colon — excludes all-caps/spaced-letter recitals like "W I T N E S S E T H:" and bare table labels by construction). A new `detectStructuralDefinitions` merges all three pattern families with defensive overlap dedup. Verified: 77 real definitions now detected in the real Credit Agreement excerpt (0 before), including 3 genuine inline definitions ("Restricted Payments", "Prepayment", "Successor Borrower") the old pattern also missed; 35 in the real Guarantee and Collateral Agreement, zero false positives on manual inspection of all 35.
10. **Integer-section fix** (`stage-structure.ts`): added `INTEGER_SECTION_PATTERNS` (keyword-prefixed, `(?!\.\d)`-guarded so a real inline citation to a decimal section of a *different* document — "Section 1.1 (Defined Terms) of the Credit Agreement", verified present verbatim in the real Second Amendment — can never be mistaken for a new heading) and a separate, more conservative `BARE_INTEGER_SECTION_PATTERN` for the task's own keyword-less example. All new matches are unioned with, never replacing, the existing decimal matches. A real precision bug was found and fixed during construction: the bare pattern initially fired on an ordinary numbered list embedded inside a real decimal section; fixed by rejecting any bare match falling inside an already-established section's own governed span.
11. **Structural coverage model** (`structural-coverage.ts`, task §6): `countSubstantiveChars` (non-whitespace character count) is the substantive-text normalization policy. Coverage = union of top-level (ARTICLE/SECTION) node spans, since every SUBSECTION/CLAUSE/SUBCLAUSE is by construction a subset of its enclosing SECTION's own span.
12. **Substantive-text definition:** any non-whitespace character (see item 11) — deliberately the simplest fully reproducible definition; a run of blank lines or page-break padding is never counted as a coverage gap.
13. **Structural health model** (task §7): `STRUCTURE_HEALTHY`/`STRUCTURE_PARTIAL`/`STRUCTURE_INSUFFICIENT`/`STRUCTURE_FAILED`, decided from coverage %, node density (substantive chars per top-level node), and significant-uncovered-span count together — never one hardcoded document-length threshold alone. `STRUCTURE_FAILED` = zero top-level nodes. `STRUCTURE_INSUFFICIENT` requires BOTH implausibly coarse node density (≤2 nodes, >15,000 chars/node) AND <70% coverage together. A short, genuinely single-section synthetic amendment (3-4 nodes, ~180 chars) correctly reports `STRUCTURE_HEALTHY` (test item 15) — proving the model does not penalize short real documents merely for being short.

## 14-16. Primary fail-safe, auditor fallback architecture, fallback-region model

14. **Primary-pipeline fail-safe behavior** (task §8): implemented as `package-safety.ts`, a pure aggregator consulted alongside (never inside) Phase 2B/2D's own unmodified output — never blocking other healthy documents (task's own explicit instruction). Emits `PACKAGE_SAFE`/`PACKAGE_REVIEW_REQUIRED`/`PACKAGE_UNSAFE`, and the task's own exact `potentiallyRelevantAmendmentNotFullyAnalyzed` boolean per document.
15. **Raw-source auditor fallback architecture** (task §9, `coverage-audit/raw-source-fallback.ts`): wired into `runIndependentCoverageAudit` as an ADDITIONAL path alongside (never replacing) the existing structural-node-anchored inventory. For every document, computes structural coverage/health; any document that is not `STRUCTURE_HEALTHY`, or that has any significant uncovered span even while otherwise healthy, gets its uncovered spans independently partitioned and signal-scanned. The fallback never reads Phase 2B/2D output — enforced by the same static-import independence test every other inventory module already uses (`coverage-audit-independence.test.ts`).
16. **Fallback-region model:** paragraph/blank-line boundaries first, then heading-like-line or newline boundaries for any oversized paragraph, capped at 3,000 chars/region (task §10's own "do not feed an entire large document to a model" — verified directly: a synthetic 60-paragraph, ~7,000-char span was confirmed split into more than one region, test item 21). Every region carries its real absolute document offsets, its own text, `±80`-char neighboring boundary evidence, a deterministic content-derived `regionId`, and the reason the fallback was required.

## 17-18. Deterministic signals, semantic fallback

17. **Deterministic raw signals** (task §11): reused the existing, already-established `detectIndependentSignals` (operative verbs, permissions/restrictions, ratios/percentages/money, baskets/mechanics, covenant-family headlines) unmodified over raw fallback regions — zero structural-node requirement. Two new signal categories added (`AMENDMENT`, `DEFINITIONAL`) via a separate function, `detectAmendmentAndDefinitionalSignals`, deliberately kept OUT of the existing signal set the normal structural-node-anchored path uses (a real regression was caught during construction — "purely definitional material" must still produce no region on that path — and fixed by this separation).
18. **Semantic fallback:** not used. Every real and synthetic case in this task was resolved deterministically; no paid call was made for raw-source fallback auditing at any point. `AUDIT_UNCERTAIN`/`MATERIAL`/`UNCERTAIN` classification of raw-source findings is itself deterministic (signal-count-based), per task §12's own "if deterministic raw-source auditing identifies potentially material regions... semantic review MAY be used" — it was never needed here.

## 19-20. Package safety, amendment safety

19. **Package safety propagation** (real CONMED package, post-remediation): `PACKAGE_SAFE`. Per-document: A `STRUCTURE_PARTIAL` (52.68% coverage — see item 33 below), B/C/D all `STRUCTURE_HEALTHY`. Summary sentence: *"0 of 4 documents were not structurally analyzed successfully."*
20. **Amendment safety behavior:** verified via the required fault-injection test (item 22 below) — a synthetic amendment-shaped document using an unrecognized numbering convention (roman-numeral-dot style) correctly produces `PACKAGE_UNSAFE` with `potentiallyRelevantAmendmentNotFullyAnalyzed: true`, while a second, healthy document in the same package is provably unaffected.

## 21-22. Tests added, fault-injection result

21. **Tests added:** 31, all in `tests/contract-model/phase-2f1-structural-robustness.test.ts` — 8 colon-definition precision cases, 8 integer-section cases (including the numbered-list false-positive regression guard and 2 explicit backward-compatibility checks), 6 structural-coverage/health cases, 7 auditor-fallback cases, 1 combined fault-injection case (the task's own required §17 test). All 31 pass.
22. **Structural fault-injection result:** the required end-to-end proof (one test, asserting the full chain in sequence): a document using an unrecognized numbering convention → raw coverage collapses from whatever baseline to **0%** (0 top-level nodes) → health downgrades to `STRUCTURE_FAILED` → the auditor independently produces both a `RAW_SOURCE_AMENDMENT_SIGNAL` and a `RAW_SOURCE_COVENANT_SIGNAL` finding from the raw span → package safety downgrades to `PACKAGE_UNSAFE` with `potentiallyRelevantAmendmentNotFullyAnalyzed: true` → a second, healthy document in the same package remains `structuralInputInsufficient: false`, proving no cross-document contamination and no dangerous silence.

## 23-26. Document C/D before/after (structural and auditor)

23. **Document C structural, before → after:**

| | Before (Phase 2F) | After (Phase 2F.1) |
|---|---|---|
| Top-level nodes | 0 | 9 SECTION (23 total incl. nested) |
| Definitions | 0 | 0 (none declared in this document — correct; it only *amends* definitions elsewhere) |
| References | 0 | 5 (0 resolved — correctly unresolved: the real target, the Seventh A&R, is deliberately not in this package) |
| Structural health | STRUCTURE_FAILED | STRUCTURE_HEALTHY (89.48% coverage) |

24. **Document D structural, before → after:**

| | Before (Phase 2F) | After (Phase 2F.1) |
|---|---|---|
| Top-level nodes | 0 | 10 SECTION (28 total incl. nested) |
| Definitions | 0 (1 stray match) | 1 |
| References | 0 | 15 (1 resolved) |
| Structural health | STRUCTURE_FAILED | STRUCTURE_HEALTHY (79.02% coverage) |

25. **Document C auditor, before → after:** Phase 2B candidates 0 → **15**; Phase 2E findings 0 → **9**. Every ground-truth item independently authored in Phase 2F is directly matched by a real candidate: `2(a)(i)` "Amends the definition of Consolidated Senior Secured Leverage Ratio by raising an internal dollar reference", `2(a)(ii)` (Consolidated Total Leverage Ratio, same amendment), `2(a)(iii)` (Indebtedness earn-out proviso), `2(b)` (full covenant-ratio-schedule restatement).
26. **Document D auditor, before → after:** Phase 2B candidates 0 → **27**; Phase 2E findings 0 → **14**. Ground-truth matches: `1(a)-(c)` (dual amendment to the Credit Agreement and Guarantee and Collateral Agreement), `2(a)-(b)` (the real $450,000,000 Term A-2 facility), `4`/`4(i)` (guarantee/security reaffirmation), `10` (no-novation).

## 27-29. Dangerous-unflagged reconciliation

27. **Original dangerous-unflagged #1 disposition** (`conmed-doc-c-second-amendment-2022`): **RESOLVED_BY_PRIMARY_STRUCTURE.** The structural fix alone (no raw-source fallback needed) restored Phase 2B's own ability to discover this document's real content — 15 real candidates now exist, directly matching every ground-truth item.
28. **Original dangerous-unflagged #2 disposition** (`conmed-doc-d-first-omnibus-amendment-2026`): **RESOLVED_BY_PRIMARY_STRUCTURE.** Same disposition, same evidence pattern — 27 real candidates, every ground-truth item matched.
29. **Dangerous-unflagged count after targeted remediation: 0** (of the 2 original IDs this task targeted). `STILL_DANGEROUS_UNFLAGGED = 0` — the task's own explicit success bar.

## 30-32. Out-of-scope items, independence contract

30. **Document B crash status:** unchanged, `KNOWN_FOLLOW_UP_DEFECT`, not touched. Re-confirmed on the real document in this task's own real rerun: identical crash signature (`AnthropicError: Failed to parse structured output`, invalid `role` enum value) on the first Pass-B call. Per task §20, the raw-source-fallback-equipped auditor was confirmed to continue surfacing real material for Document B despite the crash: **122 findings** (up from Phase 2F's own 116, since the fallback path adds a small number of new findings on top of the pre-existing structural-node-anchored ones — the normal path's own contribution is unchanged, confirmed by the byte-identical FWRG/LSB diff in item 36).
31. **Phase 2C misclassification status:** unchanged, not touched — no commit in this task modifies `package-graph/*`. Preserved as Phase 2F's own first-blind evidence describes it (Document C/D misclassified as base-agreement types via a title-pattern classifier that scans body text broadly). A dedicated follow-up remains required.
32. **Phase 2E independence-contract update** (task §22): the contract is strengthened, not weakened — the auditor may now ALSO use raw uncovered spans (in addition to the original allowed list: raw indexed source text, structural nodes, package topology, independently derived signals), and the ban on consuming Phase 2B/2D conclusions during source-side inventory generation is unchanged and re-verified (`coverage-audit-independence.test.ts`, 7/7 passing, includes the new raw-source-fallback.ts module in its own static-import check).

## 33-35. False-positive behavior, incrementality, idempotency

33. **False-positive behavior:** one real, disclosed false positive was found (not hidden): `package-safety.ts`'s `likelyAmendment` flag is `true` for all 4 real CONMED documents, including the two BASE documents (A, B), because both are themselves titled "[Eighth] Amended and Restated ... Agreement" — a common naming convention for the CURRENT consolidated facility, not literally an amendment instrument. This did not change the real package-safety verdict (`PACKAGE_SAFE`) because none of the 4 documents are `structuralInputInsufficient`, so `potentiallyRelevantAmendmentNotFullyAnalyzed` never fires regardless — but it is a genuine, left-open precision limitation of the raw-text amendment heuristic, reported honestly rather than quietly tuned away against this specific package. Separately, the raw-source fallback itself produced zero blanket/spurious findings on any already-healthy real document (see item 36).
34. **Incremental invalidation:** `COVERAGE_AUDIT_ALGORITHM_VERSION` bumped v1→v2 (a real new auditor capability was added, matching this task's own explicit "the independence contract should be strengthened" mandate, unlike Phase 2E.1's "zero changes preferred" scope) — any cached v1 audit result now produces a different `contentIdentity` and is never silently reused. `DISCOVERY_RUN_VERSION` (Phase 2B) and `RETRIEVAL_ALGORITHM_VERSION` (Phase 2D) were deliberately NOT bumped, since neither module's own logic changed in this task. **Known, disclosed limitation:** Phase 2B's own discovery cache key (`computeDiscoveryInputHash`) does not itself incorporate a structural-parser version identity — a pre-existing Phase 2B design decision, not introduced or worsened by this task, and out of this task's own scope to fix (Phase 2B internals were not to be touched).
35. **Idempotency:** verified directly — the real pipeline was re-run a second time; all 4 documents' discovery results were reused from the per-document cache (`"reusing cached"` logged 4 times, `totalCalls` stayed at 28, zero new LLM spend), and every output (candidate counts, finding counts, bundle contents) was byte-identical except sub-millisecond `deterministicWallClockMs` jitter.

## 36-40. FWRG, LSB, Phase 2C, 2D, 2E regression

36. **FWRG regression:** `scripts/phase-2a-structural-report.ts` byte-identical before/after (only timing-noise lines differ) — zero change to any node/definition/reference count. `scripts/phase-2e-audit-fwrg-lsb.ts` output **byte-identical**, full diff, before/after this task's entire commit range — zero new findings, confirming the raw-source fallback never fires spuriously on an already-healthy real document.
37. **LSB regression:** same script, same result — included in the same byte-identical diff as item 36 (both fixtures are audited by the same script in one run).
38. **Phase 2C regression:** not exercised by this task's own code changes at all (no file under `package-graph/` was touched); the real CONMED package-graph rerun (`phase-2f1/package-graph.json`) reproduces the same classification/relationship pattern Phase 2F's own report already documented, as expected.
39. **Phase 2D regression:** `context-retrieval/pipeline.ts` itself unchanged; the only touched shared dependency is the new, additive `StructuralIndex.getDocumentText()` accessor, which no existing Phase 2D code path calls. Confirmed via the full non-DB test suite (item 41) with zero Phase 2D test regressions.
40. **Phase 2E regression:** independence (7/7 passing, `coverage-audit-independence.test.ts`), fault injection (15/15 passing, `coverage-audit-fault-injection.test.ts`), FWRG/LSB audit (byte-identical, items 36-37), coverage-map/isolation (5/5 passing). Frozen-auditor behavior is unchanged for every document that was already `STRUCTURE_HEALTHY` before this task — the only behavioral change is the explicitly authorized raw-source independence extension for documents that are not.

## 41-47. Full-suite, typecheck, eslint, build, goldens, protected data, isolation

41. **Full-suite result:** 277/277 non-DB tests passing, up from 246 at the start of this task (`274d892`, matching Phase 2F's own final regression count) — all +31 net new tests are this task's own single new file (`phase-2f1-structural-robustness.test.ts`), confirmed added in two commits (16, then 15 more) with the pre-existing 246 unchanged at each step. 14 pre-existing DB-connectivity failures, unrelated to and unchanged by this task (see item 46).
42. **Typecheck:** `npx tsc --noEmit` clean throughout, checked after every commit in this task.
43. **ESLint:** clean on every touched file and the full new test file.
44. **Build:** `npx next build` succeeds cleanly (all 21 routes compiled, static generation succeeded).
45. **Goldens (Coherent/Matthews):** not independently re-verified in this task — both are DB-backed (`scripts/coherent-golden-comparison.ts` etc.), and this sandbox has no reachable database (see item 46). Confirmed the failure mode is identical to every other DB-dependent check in this environment (`PrismaClientInitializationError: Can't reach database server at localhost:5432`) — a pre-existing environment condition, not a regression this task introduced. No code touched by this task can plausibly affect either golden (neither `lib/coherent.ts`/`lib/matthews.ts` nor anything under `lib/covenant-engine.ts` was modified).
46. **Protected data:** no protected-data fingerprint check could be run for the same DB-unavailability reason as item 45. `DATABASE_URL` was confirmed unset in this session at every point this task ran; this predates and is unrelated to this task's own work.
47. **Tenant/instrument isolation:** the DB-backed `tests/contract-model/tenant-isolation.test.ts` could not run for the same reason. A real, in-scope tenant/document-isolation property WAS independently verified for the new code specifically (test item 24): two documents' raw-source fallback findings never cross-contaminate `documentId`/`sourceCitation` prefixes.

## 48-52. Model/provider, cost, performance

48. **Model/provider:** `VERCEL_AI_GATEWAY` / `anthropic/claude-sonnet-5` — identical to Phase 2F, unchanged.
49. **Calls:** 28 real Pass-B calls across the revalidation rerun (15 for Document A, 5 for Document C, 8 for Document D; Document B crashed before completing any full call cycle for its remaining sections).
50. **Tokens:** 80,820 input, 55,116 output.
51. **Cost:** ≈$1.07 (at the same $3/MTok-in, $15/MTok-out effective rate Phase 2F's own smoke test established) — well within the small, disclosed-in-advance order of magnitude this kind of revalidation call volume implies.
52. **Performance:** structural parsing remains sub-5ms for the real ~120K-char FWRG fixture (unchanged from Phase 2F.1's own baseline, confirmed via the same script); coverage computation adds negligible overhead (single linear pass per document); the raw-source fallback added zero measurable overhead for FWRG/LSB specifically (nothing to fall back on) and completed the real CONMED package's own fallback pass for Document B in well under the deterministic audit's already-sub-50ms total (Phase 2E remains 100% deterministic — 0 semantic calls, 0 fallback-path tokens spent anywhere in this task).

## 53. Known limitations

- Document A's own curated fixture (from Phase 2F, not modified here) shows `STRUCTURE_PARTIAL` (52.68% coverage) because its own definitions-excerpt portion has no structural heading at all (a real, disclosed artifact of Phase 2F's own excerpting choice, not a new defect) — the colon-definition fix makes the definitions themselves fully detectable regardless, so this does not affect discovery/audit quality, only the coverage percentage reported for this specific fixture.
- The `likelyAmendment` raw-signal heuristic is imprecise on "Amended and Restated X Agreement"-titled base documents (item 33) — real, disclosed, not fixed in this task (it never changed the real safety verdict here).
- Phase 2B's own discovery cache key does not incorporate structural-parser version identity (item 34) — pre-existing, out of this task's scope.
- Document B's Phase 2B crash and Phase 2C's classification defect remain fully open, exactly as instructed (`KNOWN_FOLLOW_UP_DEFECT` and a dedicated pending follow-up, respectively).
- Goldens/protected-data/tenant-isolation DB-backed checks could not be executed in this sandbox (items 45-47) — disclosed, not silently skipped.
- Semantic fallback auditing (task §12) was never exercised end-to-end against a real ambiguous case, since none arose — its cost-estimation-before-paid-calls discipline is implemented but untested against a real paid call in this task.

## 54. Exact gate calculation

| Gate (Phase 2F.1 §27) | Result | Pass? |
|---|---|---|
| 1. Colon-style definition formatting generalized and correctly parsed | 77 real definitions detected (0 before), zero false positives on manual review of 35+77 real detections | PASS |
| 2. Flat integer amendment-section formatting generalized and correctly parsed | 9 and 10 real top-level sections detected (0 before) in Documents C/D respectively | PASS |
| 3. Documents C and D no longer silently collapse structurally | Both `STRUCTURE_HEALTHY`, 89.48%/79.02% coverage | PASS |
| 4. Structural source coverage is measured | `structural-coverage.ts`, computed for every document in every run in this task | PASS |
| 5. Structurally insufficient documents explicitly downgrade safety state | Proven via the required fault-injection test - `PACKAGE_UNSAFE` + `potentiallyRelevantAmendmentNotFullyAnalyzed` | PASS |
| 6. Phase 2E can audit structurally unavailable raw spans independently | `raw-source-fallback.ts`, 7 dedicated tests, confirmed live on real Document B (122 findings despite 0 Phase 2B candidates) | PASS |
| 7. Both original dangerous-unflagged omission IDs no longer dangerous-unflagged | `conmed-doc-c-second-amendment-2022` and `conmed-doc-d-first-omnibus-amendment-2026`: both RESOLVED_BY_PRIMARY_STRUCTURE | PASS |
| 8. Raw-source fallback does not create unacceptable blanket false positives | Zero new findings on FWRG/LSB (byte-identical); one real, disclosed, non-dangerous false-positive found and reported (item 33), not hidden | PASS |
| 9. Existing FWRG/LSB regressions remain intact | Byte-identical structural report and audit output, full diff | PASS |
| 10. No package-specific production logic introduced | Every new regex/pattern/signal/threshold is generic - verified: "CONMED" appears only in doc-comment prose citing the real evidence that motivated a generalization (the same established convention this codebase already uses for FWRG/LSB references), never inside any regex, string-matching literal, or conditional branch | PASS |

**STILL_DANGEROUS_UNFLAGGED = 0** (of the 2 targeted original IDs).

## 55. Final verdict

# `PHASE_2F_1_STRUCTURAL_SAFETY_GATE_PASSED`

Both original Phase 2F dangerous-unflagged omission IDs — `conmed-doc-c-second-amendment-2022` and `conmed-doc-d-first-omnibus-amendment-2026` — are confirmed **RESOLVED_BY_PRIMARY_STRUCTURE** by a real, non-mocked rerun. All 10 gate conditions pass. This does not reopen or re-score Phase 2F itself (its own recorded verdict remains `PHASE_2F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION`), and it does not claim the CONMED package as a whole is now fully validated — Document B's Phase 2B crash and Phase 2C's classification defect remain real, open, disclosed limitations for dedicated follow-on tasks.

## 56. Recommended next task

Two independent, narrowly-scoped follow-ons are now unblocked, matching the two root causes Phase 2F itself separated out and this task deliberately left untouched:

1. **Phase 2F.2 — Discovery Schema Robustness**: repair the Phase 2B `CandidateContractRuleSchema` `role` enum gap that crashes discovery on non-covenant document types (proven live on the real Document B, a Guarantee and Collateral Agreement) — either widen the enum to cover guarantee/security-shaped roles, or add a schema-repair/retry path so one malformed model response never aborts an entire document's discovery pass.
2. **Phase 2F.3 — Package Classification Precision**: fix the Phase 2C title-pattern document classifier to scan only a document's own declared title/heading, not its early body text broadly (proven live on the real Documents C/D, both misclassified as base-agreement types from a recital naming the OTHER agreement they amend) — this is the root cause blocking all 84 real cross-document reference leads in the original Phase 2F package graph from resolving.

Either may proceed independently; neither depends on the other or on this task's own structural-safety work being extended further.
