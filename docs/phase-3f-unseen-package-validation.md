# Phase 3F — Genuinely Unseen Whole-Package Semantic Validation V1: Final Report

**Verdict: `PHASE_3F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION`**

The controlling safety gate (`DANGEROUS_UNFLAGGED_OMISSION = 0`) is **not met**: 119 CRITICAL ground-truth units are dangerously unflagged omissions under the strict reading (Phase 3E's own coverage audit as the sole safety net), or 34 under a broader reading that also credits discovery-layer uncertainty flags. Both readings are non-zero, so the verdict is unambiguous regardless of which is used.

This report covers the full sequence: hard freeze → blind package selection → source preservation → cost authorization → frozen first-blind pipeline run → integrity seal → independent ground-truth authoring → scoring → error taxonomy. No remediation was implemented or planned, per the task's own explicit stop condition.

---

## 1–5: Setup, freeze, and selection

1. **Hard freeze recorded before any package inspection.** `tests/fixtures/unseen-packages/phase-3f-freeze/phase-3f-freeze-manifest.json` sealed the starting git SHA (`159a22f`), every algorithm version across Phases 2A–3E, model/provider absence, and SHA-256 hashes of all 140 `lib/contract-model/**/*.ts` files (aggregate hash recorded) — before any candidate package was searched for.

2. **Blind package selection followed an objective, pre-registered procedure.** `docs/phase-3f-package-selection-log.md` documents an EDGAR full-text-search query for `"Amended and Restated Credit Agreement"` in 8-Ks, taken in EDGAR's own relevance order, checked against an exclusion list of every company/package previously used anywhere in this repository's history. The first non-excluded candidate that cleanly satisfied the criteria — reading only exhibit title blocks, never covenant content — was selected: **Distribution Solutions Group, Inc.** (NASDAQ: DSGR; formerly Lawson Products, Inc.), CIK 0000703604.

3. **Package composition.** 4 real, unmodified SEC filings spanning April 2022 – December 2025: (A) 2022 Amended and Restated Credit Agreement, (B) 2024 Third Amendment, (C) 2025 Fourth Amendment, (D) 2025 Second Amended and Restated Credit Agreement. Multi-entity (Delaware/Illinois/Canada/Alberta), multi-borrower capital structure — genuine package topology, not a single-borrower facility.

4. **Source preserved with full provenance before any semantic content was read.** `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/README.md` records raw and extracted-text SHA-256 hashes for all 4 documents (~4.16 MB raw, ~2.34M extracted characters, ~783 estimated pages), plus a repository-wide grep confirming zero prior appearance of this company/CIK anywhere in this codebase's history.

5. **Cost estimate and user authorization obtained before any paid model call touched the package.** `tests/fixtures/unseen-packages/phase-3f-freeze/phase-3f-cost-estimate-and-authorization.json` recorded a discovery cost estimate ($12.84–$19.24) extrapolated from CONMED's own real Phase 2B run, and the user selected a $30 total budget ceiling with compilation/verification capped to the first 30 discovered candidates in a single, pre-committed, content-blind order (document order A→B→C→D, then Phase 2B's own discovery-emission order within each document) — recorded *before* the first-blind run began, so it could not be adjusted after seeing which candidates it happened to include.

## 6–10: Frozen first-blind pipeline run

6. **The full frozen pipeline ran with zero manual candidate selection**, wired end-to-end for the first time ever at whole-package scale in this codebase: Phase 2A (structural indexing) → 2B (discovery) → 2C (package graph) → 2D (context retrieval) → 2G (amendment pipeline / operative state) → 3B (compilation, capped) → 3C (verification) → 3E (whole-package semantic coverage audit, Layers A/B only — no Layer C AI inventory, per budget discipline).

7. **Real scale processed.** 4,149 total structural nodes; 2,847 discovered candidates across all 4 documents (919 doc-a, 946 doc-b, 20 doc-c, 962 doc-d), zero section-level discovery failures (`DISCOVERY_HEALTHY` on every document); 2,687 candidates eligible for compilation.

8. **Actual cost: $9.34 of the $30 ceiling.** Discovery cost $0.2241 total across all 4 documents (well under the $12.84–$19.24 estimate); compilation of the capped 30 candidates cost $9.12. Total wall-clock time: ~7.06 hours, driven almost entirely by 284–291 sequential real discovery calls per large document (doc-a and doc-b/doc-d each ~107 minutes).

9. **Compilation/verification results on the 30 capped candidates:** 28 compiled with a status (2 `FAILED`, fault-isolated and skipped without aborting the run); of the 28 verified, 0 reached `FULLY_REPRESENTED_VERIFIED` — several landed `MATERIAL_DISCREPANCY` (up to 40 findings on a single candidate), several `VERIFICATION_INCOMPLETE`, most compiled candidates `REVIEW_REQUIRED`. This is the expected, disclosed consequence of the 30-candidate budget cap against 2,687 eligible candidates — not itself a defect.

10. **Package coverage status: `PACKAGE_SEMANTICALLY_INCOMPLETE`**, all 4 documents `DOCUMENT_GATE_FAILED` — an honest result given the compilation cap, consistent with the frozen `compilationVerificationScopeRule` ("do not fail solely because large regions remain uncompiled IF Phase 3E correctly marks them unrepresented/incomplete"). Whether Phase 3E's own marking was in fact reliable is exactly what the scoring below tests.

## 11–15: Sealing and independent ground truth

11. **All 19 first-run artifacts sealed with a content-hash integrity manifest** (`tests/fixtures/unseen-packages/phase-3f-first-blind-run/phase-3f-first-run-integrity-manifest.json`) immediately after the run finished and before any ground truth was authored — SHA-256 per file plus an aggregate hash, re-verified automatically at the start of every scoring run.

12. **Ground truth authored entirely from source text, by 4 isolated agents with zero access to the pipeline's own output.** Each agent was explicitly barred from reading anything under `phase-3f-first-blind-run/` beyond the purely mechanical (deterministic, source-derived) Stage 1 structural index, used only for navigation.

13. **Scope: full-package, all 12 Articles, all 4 documents** (the user's own explicit choice over two narrower, cheaper alternatives offered). Total: **1,016 ground-truth units** (doc-a 346, doc-b 301, doc-c 33, doc-d 336), using the same 4-tier materiality taxonomy Phase 3E's own code already defines (`CRITICAL`/`MATERIAL`/`REVIEW_UNCERTAIN`/`INFORMATIONAL`).

14. **Ground truth surfaced real, independently-discovered substance**, none of it seeded by the pipeline: the document's one-way US/Canadian ring-fence (restated in 4–5 places across docs A/D), the financial covenant mechanics and a scope-inconsistent 0.50x Total Net Leverage Ratio Adjustment, 9 real drafting defects in doc-d (mis-citations, a TOC/body mismatch, a nonexistent cross-reference), and — in doc-c — a genuinely open legal risk: two amendment changes deemed effective retroactively to January 1, 2025 despite the amendment being dated March 31, 2025, with no express waiver of the interim no-Default condition precedent.

15. **A critical extraction artifact was independently caught in doc-b's ground truth**: the HTML-to-text conversion strips strikethrough/underline markup, leaving deleted text sitting inline next to its replacement (e.g. `"$200,000,000 300,000,000"`) — an artifact the pipeline's own Phase 2B discovery stage would have encountered identically, since it reads the same extracted text.

## 16–25: Scoring against the frozen gate definitions

16. **Scoring methodology**: every ground-truth unit was cross-referenced against Phase 2B discovery candidates and Phase 3E's own semantic-coverage audit (inventory, coverage state, dangerous-unaccounted list) using exact, parent-section, and lettered-descendant sectionRef matching — the third tier was added after an initial pass conflated "Phase 3E never hypothesized this section at all" with "Phase 3E captured the section's lettered sub-items but missed its own chapeau," which are structurally different findings (see taxonomy F1).

17. **Controlling safety gate — `DANGEROUS_UNFLAGGED_OMISSION`, required = 0:**
    - Strict reading (Phase 3E's own coverage audit as the sole safety net, per the frozen `compilationVerificationScopeRule`'s own emphasis): **119 CRITICAL violations.**
    - Broad reading (also crediting a discovery-layer `NEEDS_REVIEW` flag as "surfacing the problem"): **34 CRITICAL violations.**
    - **Gate FAILS under either reading.**

18. **Basket/exception recall ≥ 95% gate: 98.80% — PASS.** The pipeline's Phase 2B discovery layer is genuinely strong at finding negative-covenant basket/exception provisions specifically — the highest-value content class for Headroom's own product domain.

19. **Covenant-bearing section recall ≥ 98% gate: 87.21% — FAIL.**

20. **Operative-rule recall ≥ 95% gate: 94.42% — FAIL** (narrowly).

21. **Audit-inventory recall (CRITICAL/MATERIAL), not itself a named gate but directly load-bearing for the controlling gate: 88.79%** after descendant-matching correction (up from an initially-measured 74.84% before that correction) — meaning roughly 1 in 9 CRITICAL/MATERIAL ground-truth units has no representation anywhere in Phase 3E's own semantic inventory, at any granularity.

22. **That 11.21% gap splits into two structurally distinct causes**: 90 true blind spots (no audit unit at any level — taxonomy F1) and 112 chapeau-only gaps (lettered sub-items captured, the section's own parent/chapeau address missed — also F1).

23. **209→213 cases where Phase 3E's audit found a matching unit but assigned it a materiality lower than ground truth**, silently excluding it from dangerous-unaccounted flagging even though a unit technically exists at that address (taxonomy F2) — concentrated in Article VI negative-covenant baskets, the package's highest-value content.

24. **Package-graph gates: no confidently false instrument or amendment-relationship assignment observed.** Stage 3 correctly classified all 4 documents (doc-a/doc-d as `AMENDED_AND_RESTATED_AGREEMENT`, doc-b/doc-c as `AMENDMENT`), correctly identified 4 instruments and 4 relationship candidates — these gates pass cleanly.

25. **0 of 803 CRITICAL/MATERIAL ground-truth units reached `FULLY_REPRESENTED_VERIFIED` coverage state** — the expected, fully disclosed consequence of the pre-committed 30-candidate compilation cap against 2,687 eligible candidates, explicitly permitted by the frozen scope rule and not counted as a violation in its own right.

## 26–31: Root-cause diagnosis (no remediation implemented)

Full detail: `tests/fixtures/unseen-packages/phase-3f-ground-truth/phase-3f-error-taxonomy.json`.

26. **F1 (HIGH, dominant driver of the controlling gate failure):** `router.ts`'s per-node admission gate (`lib/contract-model/compiler/semantic-coverage/router.ts:80`) only routes a structural node into Phase 3E's semantic inventory if that node's *own* text (excluding descendants) independently trips one of exactly four narrow detectors. A section whose real substance lives in its own short chapeau sentence or in separately-indexed child nodes can fail all four and vanish from the audit entirely, with zero downstream trace.

27. **F2 (HIGH, second dominant driver):** `unit-hypothesis.ts:161-169`'s `classifyMateriality()` is computed purely from a unit's own text signals and never receives the `isExceptionItem` context that `classifyPostureSignal()` (same file) does receive — so a basket-list item whose own clause references an amount defined elsewhere, or is a qualitative carve-out with no inline numeric token, defaults to `INFORMATIONAL` regardless of its real structural role as a permitted exception.

28. **F3 (MEDIUM):** The amendment/operative-state resolver correctly refuses to guess which of 2 candidate base agreements (doc-a, doc-d) an ambiguous amendment reference targets — a safety-conscious design choice — but the consequence is `OperativeContractState.provisions = []` under a status literally named `OPERATIVE_STATE_RESOLVED`, which risks being misread by a downstream consumer as "nothing to disclose" rather than "nothing could be confidently resolved." Ground truth independently resolved the same ambiguity from the same text using explicit execution dates and "Existing Credit Agreement" cross-references, suggesting the resolver's refusal, while safe, may not be the only available deterministic answer.

29. **F4 (LOW):** Structural-parser noise observed (spurious ARTICLE-type matches on mid-sentence fragments in doc-b; unbounded nested-lettering artifacts under doc-a's 6.01) but not shown to have caused a dangerous omission in this specific run.

30. **F5 (MEDIUM):** Discovery-layer recall gaps (findings 19–20 above) are concentrated outside basket/exception content specifically, in conditions/events-of-default/mechanics-type provisions; a per-family root cause within the discovery pipeline itself was not traced within this diagnosis's scope.

31. **F6 (LOW):** The 2 compile-stage `FAILED` candidates carry no preserved error message in the sealed artifact, limiting this diagnosis's own completeness on those 2 cases without re-running outside the frozen-run discipline.

## 32: Final verdict and stop condition

**`PHASE_3F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION`.**

The frozen architecture, run genuinely blind against a real, previously-unseen, multi-document, multi-entity credit facility with zero manual candidate selection and zero prior tuning against this package, correctly identified the package's topology, correctly bounded its own spend, and its Phase 2B discovery layer performed strongly on the highest-value content class (baskets/exceptions, 98.80% recall). But its designated safety net — Phase 3E's own whole-package semantic-coverage audit — has two precisely-located architectural gaps (F1, F2) that leave a materially non-zero number of CRITICAL ground-truth provisions genuinely unflagged: 119 under the strict reading of the controlling gate, or 34 even under the most generous reading available. Per the task's own explicit stop condition, no fix, prompt change, or algorithm-version bump was implemented or even scoped in detail here — this report is diagnosis and verdict only. Any remediation is out of scope for Phase 3F and belongs to a later phase, should the user choose to pursue one.
