# Phase 2F — Frozen Unseen Multi-Document Package Validation V1

**Central question:** when Headroom encounters a genuinely unfamiliar real multi-document debt package with no supplied covenant targets and no opportunity to tune beforehand, can the frozen architecture autonomously find the material covenant universe, understand the package topology, retrieve the contractual context required for analysis, and independently surface anything material it missed?

**Answer, from the preserved first-blind evidence below: partially.** On content shaped like its training distribution (a decimal-numbered negative-covenants article) the frozen pipeline performs strongly — 93.75% section recall, 100% sampled-basket recall, 100% candidate precision. On content outside that distribution (a guarantee/security document, and two amendment documents using flat section numbering) it produces **zero signal**, and for two of those three documents, **zero alarm anywhere in the system**. This is a real, evidenced, dangerous generalization gap, not a hypothetical one.

---

## 1-4. SHAs, freeze manifest, package selection method, evidence of unseen status

1. **Starting SHA:** `0d7a0a3c945b1adc31f22aa1a582749224a6b03b` (Phase 2E.1 complete)
2. **Ending SHA:** `806f9bd7cb4f8b4234d704e9e4bd0a91aa031f59`
3. **Code changed during the scored run:** none of the frozen Phase 2A–2E algorithm code (`lib/contract-model/compiler/**`) was modified at any point in this phase — confirmed by the freeze manifest's sha256 aggregate (`e3bc64c3...b467b583a` over all 59 compiler source files) and by `git diff` showing zero changes to that directory across every commit in this phase. The only non-frozen-code changes were: (a) new orchestration scripts (`scripts/phase-2f-*.ts`) that call the frozen pipeline functions unmodified, with one disclosed harness-level addition (per-document error isolation in `phase-2f-stage2-discovery.ts`, added after a real crash — see §17/§57); (b) the new package fixture and ground truth; (c) documentation.
4. **Freeze manifest:** `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-freeze-manifest.json`, written before any package acquisition. Records: Phase 2B `DISCOVERY_PIPELINE_VERSION=phase-2b-discovery-pipeline.v1`, `DISCOVERY_PROMPT_VERSION=phase-2b-discovery.v1`; Phase 2C `PACKAGE_GRAPH_PIPELINE_VERSION=phase-2c-package-graph-pipeline.v1`; Phase 2D `RETRIEVAL_ALGORITHM_VERSION=phase-2d-context-retrieval.v2`; Phase 2E `COVERAGE_AUDIT_ALGORITHM_VERSION=phase-2e-coverage-audit.v1` and its full finding taxonomy/root-cause-subsystem/materiality enums.
5. **Package-selection method:** objective, pre-registered, content-blind procedure — full log in `docs/phase-2f-package-selection-log.md`. Query: SEC EDGAR full-text search for `"Guarantee and Collateral Agreement"` in Form 8-Ks, 2021–2025; candidates taken in the search API's own returned order; excluded companies already used anywhere in this repository (FWRG, LSB/LXU, Coherent/COHR, Matthews/MATW, and — found via a repo-wide grep before selection — Petco/WOOF, TransDigm/TDG, Community Health Systems/CYH, CommScope-Vistance/VISN, all referenced in `docs/cross-document-ontology-stress-test.md`); first candidate (Graphic Packaging) was ambiguous on inspection of its own exhibit titles and skipped rather than forced; second candidate (Terex) had no multi-document bundle and was skipped; third candidate, **CONMED Corporation**, cleanly satisfied all criteria from exhibit titles alone and was selected without opening any covenant text.
6. **Evidence the package was unseen:** `grep -ril conmed` across every tracked file in the repository, run immediately before selection was finalized, returned zero hits outside the new fixture directory this phase created.

## 5-11. Package identity, documents, hashes, size, instrument count, first-run ID

7. **Package identity:** CONMED Corporation (NASDAQ: CNMD), CIK 0000816956 — a real, public medical-technology company. Not a sponsor-backed LBO credit (unlike FWRG); not an ABL/intercreditor structure (unlike LSB); a conventional syndicated cash-flow term-loan-and-revolver facility with a real, multi-year (2021–2026) amendment/restatement history.
8. **Documents acquired (4, real, public SEC EDGAR filings):**
   - **A** — Eighth Amended and Restated Credit Agreement, dated June 10, 2025 (8-K, accession 0001174947-25-000941, Ex. 10.1) — base credit agreement.
   - **B** — Amended and Restated Guarantee and Collateral Agreement, dated June 10, 2025 (same filing, Ex. 10.2) — related guarantee/security document.
   - **C** — Second Amendment, dated August 1, 2022, to the (out-of-package) Seventh A&R Credit Agreement dated July 16, 2021 (8-K, accession 0001193125-22-209154, Ex. 10.2).
   - **D** — First Omnibus Amendment and Increased Facility Activation Notice, dated May 27, 2026 (8-K, accession 0002077096-26-000190, Ex. 10.1).
9. **Source hashes:** sha256 of every raw source `.htm` file and every curated derivative is recorded in the package's own commit (`710472e`) and in `tests/fixtures/unseen-packages/conmed-2025-credit-facility/{raw-source,curated}/`. Example: Document A raw source `20496bb3c5effc5c85e5d5d3dd2efa5d48cf003b5024964ae613fab140b559ac`.
10. **Total size:** 4 documents, 230,891 curated characters, ~92 page-equivalents (2,500 chars/page), 415 real structural nodes (Phase 2A), 281 independent audit regions (Phase 2E). Raw source HTML totaled 2,323,236 bytes before curation; curation (disclosed in the package README) excluded a duplicated blackline re-print inside Document D and split Document A into a Negative-Covenants-article-plus-cited-definitions excerpt, the same discipline FWRG/LSB already established.
11. **Instrument count:** Phase 2C's own `groupPackageIntoInstruments` produced 2 single-document instruments (Document A alone; Document C alone) and left Documents B and D unassigned to any instrument — see §30–35 for why this is a real classification defect, not a clean result.
12. **First-run ID:** `PHASE_2F_FIRST_BLIND_RUN`, sealed at commit `a459bef` — manifest at `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-first-blind-run-manifest.json`, containing sha256 of every Stage 1–5 output artifact.
13. **First-run artifact hashes:** see the manifest in item 12; every hash is reproducible by re-hashing the still-committed JSON files at that commit.

## 14-15. Model/provider, prompts/algorithm versions

14. **Model/provider:** `VERCEL_AI_GATEWAY` / `anthropic/claude-sonnet-5` — the only real LLM calls in the entire frozen pipeline occur in Phase 2B (discovery); Phases 2A, 2C, 2D, and 2E are 100% deterministic, zero LLM calls (confirmed by source inspection before any run: no `StageCaller` import anywhere under `context-retrieval/` or `coverage-audit/`, and `package-graph/pipeline.ts`'s own header states "ZERO real LLM calls").
15. **Prompt/algorithm versions:** `DISCOVERY_RUN_VERSION = phase-2b-discovery-pipeline.v1+phase-2b-discovery.v1`; `PACKAGE_GRAPH_PIPELINE_VERSION = phase-2c-package-graph-pipeline.v1`; `RETRIEVAL_ALGORITHM_VERSION = phase-2d-context-retrieval.v2`; `COVERAGE_AUDIT_ALGORITHM_VERSION = phase-2e-coverage-audit.v1`. All identical to their values immediately after Phase 2E.1 — zero version bumps occurred in this phase, because zero frozen-code changes occurred.

## 16-17. Structural results and failures

16. **Structural results (Phase 2A, `phase-2f-stage1-structural-summary.json`):** 415 total structural nodes across 4 documents; 195 in-document references detected (114 resolved, 81 unresolved — a normal, healthy resolution rate); definitions: **0 of a real 353 detected** in Document A, 0 detected in Document B (both real documents use a colon-style defined-term convention, `"Term": text`, that Phase 2A's `DEFINITION_DECLARATION` regex — calibrated on FWRG/LSB's `"Term" means` convention — does not recognize at all; confirmed directly: 353 colon-style vs. 6 means-style occurrences in Document A's own Article I).
17. **Known structural failures, both real and reproducible:**
    - **Definition-detection gap** (above) — root cause `STRUCTURAL_SUBSTRATE`.
    - **Zero `SECTION`-type nodes in Documents C and D** — both use flat `SECTION 1.`/`SECTION 2.` numbering (a real, common amendment-drafting convention), not the decimal `SECTION 1.01` style `SECTION_PATTERNS` require. `ARTICLE_PATTERNS` also never match (neither document has an ARTICLE structure at all — normal for a short amendment). Root cause `STRUCTURAL_SUBSTRATE`.
    - **106 `SECTION`-type nodes detected in Document B** against a real ~10-section document — the `SECTION_PATTERNS` regex over-matches numbered cross-references within prose as new section headings for this document's drafting style. Not independently investigated further in this phase (out of scope per §20's "do not broaden into structural-parser cleanup," extended here to a newly-discovered analog of the same class of issue) but disclosed as a real, measured anomaly.

## 18-19. Independent ground-truth methodology and inventory size

18. **Ground-truth methodology:** authored after the `PHASE_2F_FIRST_BLIND_RUN` manifest was sealed (commit `a459bef`), by direct re-reading of the curated source text files — `tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/*.txt` — never by reading `phase-2f-stage2-discovery-candidates.json`, `phase-2f-stage4-context-bundles.json`, or `phase-2f-stage5-audit-findings.json` during authoring. **Disclosed limitation:** true two-party isolation (a separate reviewer/session that never saw any primary-pipeline output) was not available in this single-agent session — the same disclosed limitation the FWRG/LSB ground truth already carried. One self-correction is recorded in the ground truth itself (`pkg-6`): an initial README description of Document D as introducing a "joinder" was corrected after re-reading Document C in full during ground-truth authoring, which shows Linvatec Nederland B.V. was already a Foreign Subsidiary Borrower in 2022.
19. **Ground-truth inventory size:** 75 items — 8 package/document-layer facts, 67 covenant/operative-unit entries (`tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth.ts`).

## 20-22. Section, operative-rule, and basket/exception counts

20. **Covenant-bearing section count (Document A, the only document Phase 1 gave SECTION nodes to work with):** 16 real, material sections (Article VII, §§7.1–7.17 excluding the genuinely `[Reserved]` §7.7).
21. **Operative-rule count:** 16 section-level operative units + 32 sampled basket-level operative units (the four densest sections: 7.2 Indebtedness ×18, 7.3 Liens ×3 representative, 7.6 Restricted Payments ×6, 7.8 Investments ×5) = 48 Document-A operative units scored; 9 Document B units, 4 Document C units, 5 Document D units (23 more, not basket-decomposed — these documents' real structure is few, large, dense provisions rather than enumerated baskets).
22. **Basket/exception count:** 32 sampled (of a real 19+16+7+13 = 55 total baskets across 7.2/7.3/7.6/7.8 — the 32 scored are a representative sample, not the full 55, per this phase's own time-bounded scope; see §73 limitations).

## 23. Family inventory

Represented in Document A alone: FINANCIAL_COVENANTS (incl. a real maintenance leverage/coverage/liquidity covenant set), INDEBTEDNESS, LIENS, MERGERS_FUNDAMENTAL_CHANGES, ASSET_DISPOSITIONS, RESTRICTED_PAYMENTS, INVESTMENTS, SUBORDINATED_DEBT_PREPAYMENT, AFFILIATE_TRANSACTIONS, SALE_LEASEBACK, SUBSIDIARY_RESTRICTIONS, OTHER (fiscal-period/lines-of-business/use-of-proceeds/**Outbound Investment Rules** — a real, current CFIUS-outbound-investment-regime covenant that plausibly did not exist in FWRG (2021) or LSB (2023) fixtures at all, since the U.S. outbound investment rules program postdates both). Document B adds GUARANTEES_SECURITY. Documents C/D touch FINANCIAL_COVENANTS, INDEBTEDNESS, and GUARANTEES_SECURITY again, at the amendment layer.

## 24-29. Phase 2B discovery scoring

24. **Section recall (Document A only — the only document Phase 2B could attempt):** **15/16 = 93.75%.** Single miss: §7.12 (Limitation on Changes in Fiscal Periods), a genuinely trivial, single-sentence, non-material administrative covenant.
25. **Operative-rule recall:** 15/16 section-level (93.75%, same miss) + 32/32 sampled baskets (**100%**).
26. **Basket/exception recall:** **32/32 = 100%** on the sampled set (7.2, 7.3, 7.6, 7.8).
27. **Precision (proxy):** **163/163 = 100%** — every real Phase 2B candidate's `normalizedSourceRef` maps to a real Article VII section that genuinely exists in the source; zero hallucinated section references detected.
28. **Family recall:** 100% for every family except OTHER (3/4, driven by the same §7.12 miss).
29. **Every dangerous discovery miss:**
    - §7.12 (Document A) — **not material** (single-sentence, no dollar/ratio content, no basket structure).
    - **The entirety of Document B** (Amended and Restated Guarantee and Collateral Agreement) — Phase 2B crashed on its first Pass-B call (see §57) and produced **zero** candidates for a document whose own real content includes an unconditional joint-and-several guarantee, a fraudulent-transfer savings clause, a no-subrogation clause, and a broad security-interest grant. **Dangerous.**
    - **The entirety of Document C** (2022 Second Amendment) — zero `SECTION` nodes meant zero candidates, for a document that amends two real financial-covenant-ratio defined terms ($75M→$100M) and fully restates the Consolidated Total Leverage Ratio covenant with a 6-period step schedule. **Dangerous.**
    - **The entirety of Document D** (2026 Omnibus Amendment) — zero `SECTION` nodes meant zero candidates, for a document that activates a real $450,000,000 incremental term facility and reaffirms all guarantees/security. **Dangerous.**

## 30-35. Phase 2C package-graph scoring

30. **Document-classification accuracy:** 2/4 correct (Document A: `AMENDED_AND_RESTATED_AGREEMENT`, correct; Document B: `SECURITY_AGREEMENT`, a plausible partial match for a combined guarantee-and-security document). 2/4 wrong: **Document C** (a Second Amendment) was classified `AMENDED_AND_RESTATED_AGREEMENT` — evidence field literally quotes the phrase *"Amended and Restated Credit Agreement"* matched from Document C's own recital describing the OTHER agreement it amends, not from Document C's own title. **Document D** (an Omnibus Amendment) was classified `SECURITY_AGREEMENT` for the identical reason (matched *"Collateral Agreement"* from its own recital naming Document B). Confirmed root cause: `classifyPackageDocuments`'s deterministic title-pattern matcher scans a document's own early text broadly, not specifically its self-declared title/heading.
31. **Instrument-grouping accuracy:** wrong, as a direct consequence of §30 — Document C was grouped into its own standalone `AMENDED_AND_RESTATED_AGREEMENT`-type instrument (confidence 0.5) alongside Document A's instrument, rather than being excluded from instrument membership (as an `AMENDMENT` type should be, joining Document A's instrument as a modification, not forming its own).
32. **Relationship-edge precision:** N/A (denominator zero) — **zero** relationship candidates were RESOLVED (0/4), so no false-positive resolved edge exists to measure precision against. This is a *safe* failure mode (the resolver correctly refused to guess), not a dangerous one.
33. **Relationship-edge recall:** **0/1 clean, achievable resolution** — Document D's own text contains an explicit, dated, unambiguous reference to BOTH Document A and Document B ("the Eighth Amended and Restated Credit Agreement, dated as of June 10, 2025" / "the Amended and Restated Guarantee and Collateral Agreement, dated as of the June 10, 2025"), and Document B's own recitals independently name Document A the same way. Both relationships should have resolved cleanly. Neither did — all 84 detected cross-document reference leads report `UNRESOLVED`, 67 with reason *"2 candidate documents of type CREDIT_AGREEMENT/AMENDED_AND_RESTATED_AGREEMENT exist — never resolved from a bare named mention alone."* This is the **direct, traced consequence of the §30 misclassification**: Document C's false typing as a second `AMENDED_AND_RESTATED_AGREEMENT` creates a false ambiguity between it and the real Document A.
34. **Amendment/supplement association accuracy:** 0% — no amendment was associated with its real target, for the same root cause.
35. **Modification-target recall:** 0/1 — Document C's real modification candidate (a defined-term amendment inside Section 1.1) reports `UNRESOLVED` with reason *"the source document itself has no resolvable reference to another agreement"* — this specific instance is **correctly** unresolved (Document C's real target, the Seventh A&R, is deliberately not in this package), but it means the metric cannot distinguish "correctly unresolved because the target is absent" from "incorrectly unresolved because of a classification bug" without the ground truth's own disclosure — recorded honestly here.
    **Unresolved relationship accuracy:** high — every one of the 84 leads and both the modification candidates and relationship candidates that *should* stay unresolved (Document C→Seventh A&R) correctly did.
    **False resolved relationships:** **zero** (nothing was ever wrongly resolved — the failure mode throughout is under-resolution, not mis-resolution).
    **Cross-instrument contamination:** none detected.
    A wrong *confidently resolved* amendment edge, which the task explicitly flags as the most important package-graph risk, **did not occur** — every wrong outcome in this phase was a refusal to resolve, never a wrong resolution.

## 36-46. Phase 2D context-retrieval scoring

36. **Sample size:** all 163 real Document-A bundles (100% of what Phase 2B produced) — no bundle was cherry-picked or excluded.
37. **Required-context recall:** not separately measured against a per-item required-context ground truth (out of this phase's time budget — see §73) — measured instead via the sufficiency-state proxy below, which is the same metric Phase 2D's own architecture uses to self-report.
38. **Definition recall:** **effectively 0%** for any bundle whose operative text cites a real defined term — direct, traced consequence of the Phase 2A definition-detection gap (§17): with 0 real definitions indexed, every defined-term dependency Phase 2D's deterministic definition-following logic looks for is, by construction, unresolvable.
39. **Recursive-definition recall:** not separately measurable — the base case (direct definition recall) already fails.
40. **Cross-reference recall:** not separately scored in this phase (§73).
41. **Proviso/condition recall:** not separately scored in this phase (§73).
42. **Amendment-lead recall:** 0% — no bundle could carry a real amendment lead, because Phase 2C never resolved the Document D→Document A relationship (§33) that such a lead would depend on.
43. **Cross-document dependency recall:** 0%, same cause.
44. **Context precision:** not degraded by indiscriminate expansion — `avgItemsPerBundle = 7.91`, `maxItemsPerBundle = 30`, both in the same order of magnitude as FWRG/LSB's own established baselines (Phase 2E.1's own report: avg 12.6–12.8, max 54–56) — the *shape* of retrieval remained bounded even while its *content* was starved by the upstream definition gap.
45. **Unresolved-dependency recall:** effectively complete — **2,052 unresolved dependencies** were explicitly recorded (not silently dropped) across 163 bundles, averaging 12.6/bundle.
46. **Sufficiency-state accuracy:** **honest** — only **1/163 (0.6%)** bundles report `SUFFICIENT`; 138 `REVIEW_REQUIRED`, 24 `INCOMPLETE`. Given the real definition-index emptiness, near-universal non-SUFFICIENT is the *correct* self-report, not a bug — this is the architecture's sufficiency-downgrade logic (built in Phase 2D/2E.1) working exactly as designed under real, severe upstream starvation. This is a genuine positive finding embedded inside a genuine negative one.

## 47. Every material context miss

Every one of the 2,052 unresolved dependencies traces to the same single root cause (§17's colon-style-definition gap) rather than 2,052 independent misses. The single most consequential material context miss, chosen for its concrete illustration: candidate `7.6(e)` (the unlimited, ratio-gated Restricted Payments basket) cites `Consolidated Senior Secured Leverage Ratio` as its entire gating mechanism — with the definition index empty, no bundle for this candidate can ever carry that definition's real text, even though the definition physically exists, in full, in Document A's own Article I.

## 48-54. Phase 2E auditor scoring

48. **Auditor discovery-miss recall:** the auditor's own independent region inventory (`buildSourceCoverageInventory`) **shares Phase 2A's own `SECTION`-node dependency** — it produced **zero** regions for Documents C and D, exactly mirroring Phase 2B's own blindness there, so the auditor could not and did not flag those two documents' discovery misses (0/2 real whole-document misses caught). For Document B, the auditor's inventory reached the document independently (it does not require Phase 2B's candidates to exist first) and produced **116 real findings** there — catching the crash's consequence even though it could not know a crash occurred. **Real discovery-miss detection recall: 1/3 documents (33%) at the whole-document level; 0/1 at the true zero-denominator level for C/D specifically.**
49. **Auditor context-miss recall:** for Document A, the auditor's 129 findings (`MATERIAL_DISCOVERY_MISS` ×103 within that count, `MISSING_CONDITION`/`MISSING_PROVISO`/`MISSING_SHARED_CAP` accounting for the rest) directly reflect the same real definition-index gap driving Phase 2D's own sufficiency downgrades — the auditor and the primary system's own self-report agree, which is itself evidence the auditor's independence held (it derived the same conclusion via a structurally separate code path, not by reading Phase 2D's sufficiency flags).
50. **Structural-gap detection:** the auditor's own coverage map records `STRUCTURAL_COVERAGE_GAP` 41 times — but only ever for Documents A/B, never for C/D, because its own region inventory never reaches C/D to notice a gap exists there at all. This is the single most important auditor limitation this phase found: **an auditor built to independently detect omissions is only as independent as the structural substrate both it and the system it audits share** — a shared root cause can defeat the independence property entirely for the affected regions.
51. **Auditor material-finding precision:** not independently re-verified item-by-item in this phase (out of time budget, §73) — Phase 2E.1's own frozen fault-injection suite (15/15, 12/12) stands as this auditor's own established precision baseline and was not re-run here since no auditor code changed.
52. **Auditor false-alarm rate:** not separately re-measured in this phase; no evidence of new false alarms was observed in the 55 MATERIAL findings sampled during root-cause tracing.
53. **Auditor uncertain rate:** 190/245 = 77.6% of all findings were UNCERTAIN rather than MATERIAL — consistent with the same-root-cause pattern (many defined-term dependencies are plausibly, not certainly, material without deeper reading).
54. **Every auditor miss:** the two whole-document misses named in §48 (Documents C and D) are the complete list — no other auditor miss was found.

## 55-56. Dangerous-unflagged omissions

55. **Dangerous-unflagged omissions, exact list:**
   1. **Document C's entire real content** (3 defined-term amendments + 1 full financial-covenant-ratio restatement, all MATERIAL) — zero Phase 2B candidates, zero Phase 2E findings. **Neither layer surfaced anything.**
   2. **Document D's entire real content** (a $450,000,000 incremental facility, a guarantee/security reaffirmation, a no-novation clause) — zero Phase 2B candidates, zero Phase 2E findings. **Neither layer surfaced anything.**

   (Document B is explicitly **not** counted as a third dangerous-unflagged omission: the auditor's own 116 real findings there mean *something* did surface the problem, even though the primary system's own discovery layer stayed silent — this matches the exact Phase 2F §19 definition, which requires that *neither* layer catch it.)
56. **Exact denominator/calculation:** 2 whole-document dangerous-unflagged omissions / 4 total documents in the package = **50% of real source documents in this package carried material content invisible to the entire frozen system.** At the ground-truth-unit level: 7 real MATERIAL units (4 in Document C + 3 of Document D's 5, per the ground truth's own materiality tags) went completely unflagged.

## 57-58. Error taxonomy

57. **Complete error taxonomy (Phase 2F's own required categories):**
    - `STRUCTURAL_PARSING`: definition-declaration pattern misses CONMED's colon-style convention (0/353 real definitions found); `SECTION_PATTERNS` misses flat "SECTION 1."-style amendment numbering (0 SECTION nodes in Documents C/D); `SECTION_PATTERNS` over-matches in Document B (106 nodes for a ~10-real-section document).
    - `PACKAGE_CLASSIFICATION`: Documents C and D misclassified as base-agreement types because the title-pattern classifier scans a document's own early body text broadly rather than restricting to its self-declared title (§30).
    - `PACKAGE_RELATIONSHIP`: 84/84 cross-document reference leads unresolved, direct consequence of the classification error above (§33).
    - `CONTEXT_RETRIEVAL` / `CONTEXT_SUFFICIENCY`: 2,052 unresolved dependencies, 162/163 non-SUFFICIENT bundles, direct consequence of the structural-parsing definition-detection gap (§38, §46) — the sufficiency-honesty behavior itself is correct, not an error.
    - `AUDITOR_DETECTION`: the independent auditor shares Phase 2A's own SECTION-node dependency and is therefore blind to the exact same two documents Phase 2B is blind to (§50) — the single most important architectural finding of this phase.
    - `DISCOVERY`: one real, reproducible crash (Document B, `AnthropicError: Failed to parse structured output` — the model returned a `role` value outside `CandidateContractRuleSchema`'s fixed enum, and the SDK's strict structured-output parser threw with no repair/retry path) — this is a `DISCOVERY_PHASE_2B` architectural fragility, not a one-off flake (reproduced identically across two independent attempts, §57's own investigation below).
    - `SOURCE_UNAVAILABLE`: none — every document in this package was fully acquired and readable.
    - `GROUND_TRUTH_AMBIGUITY`: 2 ground-truth items (`b-8.14`, `b-8.15`) marked `REVIEW_REQUIRED`/`UNCERTAIN` because their full clause text was not read during ground-truth authoring (table-of-contents titles only) — disclosed, not silently treated as CLEAR.
    - `OTHER`: none identified beyond the above.
58. **Errors by responsible layer:** `STRUCTURAL_SUBSTRATE` is the dominant root cause, cascading into `DISCOVERY_PHASE_2B` (zero candidates for 2 of 4 documents via the SECTION-node gap), `CONTEXT_RETRIEVAL_PHASE_2D` (2,052 unresolved dependencies via the definition gap), and `AUDITOR_ITSELF` (blind to the same 2 documents via the shared SECTION-node dependency). `PACKAGE_RELATIONSHIP_PHASE_2C` is a second, independent root cause (the title-pattern classifier), not charged to the structural substrate. Per Phase 2F §20's own instruction, no single root cause is charged to more than one *root-cause* category — but its downstream *consequences* are traced honestly across every stage it actually broke.

## 59-70. Cost, latency, cache/resume evidence

59. **Model calls:** 15 (all in Document A; Documents B/C/D made 0 real calls each — B crashed on its first call before completing, C/D never attempted a call at all).
60. **Input tokens:** 47,878.
61. **Output tokens:** 41,996.
62. **Cost:** **$0.7736** (computed at $3/MTok in, $15/MTok out — the smoke-test's own observed effective rate).
63. **Predicted vs. actual cost:** predicted "a few dollars, likely under $10" before the run (based on ~123 estimated Pass-B calls across all 4 documents); actual was **lower** than predicted ($0.77, 15 calls) because Documents B/C/D's real call counts turned out to be 0 (a crash and two zero-SECTION documents) rather than the ~108 originally estimated for them — the variance itself is diagnostic evidence, not just a cost note.
64. **Indexing latency (Phase 2A, Stage 1):** sub-second (all 4 documents, deterministic).
65. **Discovery latency (Phase 2B, Stage 2):** ~342.6s (Document A's real 15-call run); Documents B/C/D added negligible additional latency (B's crash occurred on an early call; C/D made zero calls).
66. **Package-graph latency (Phase 2C, Stage 3):** 11ms (fully deterministic).
67. **Retrieval latency (Phase 2D, Stage 4):** well under 1s for all 163 bundles combined (fully deterministic).
68. **Audit latency (Phase 2E, Stage 5):** 29ms deterministic + 19ms comparison = 48ms total (fully deterministic, 0 semantic calls).
69. **Total wall-clock:** ~9 minutes (dominated entirely by Document A's real LLM round-trips).
70. **Cache/resume behavior:** a real infrastructure interruption occurred mid-phase — the first Stage 2 attempt crashed uncaught on Document B (§57), losing nothing already computed for Document A because Document A had already returned before the crash; the harness script was then given per-document result caching (disclosed, non-frozen-code change, `617c0ef`) so the re-run reused Document A's already-paid-for real result verbatim rather than re-purchasing it, and made fresh, real attempts at B (crashed again, identically) and C/D (zero SECTION nodes, as before). This is a real, evidenced resume-without-waste event, not a hypothetical one.

## 71-72. First-run integrity and evidence of no pre-score tuning

71. **First-run integrity result:** intact — the `PHASE_2F_FIRST_BLIND_RUN` manifest (commit `a459bef`) hashes every Stage 1–5 artifact; ground truth was authored and this report was written entirely from those same, unmodified, hash-identified files. No stage was silently re-run after ground truth was authored.
72. **Evidence no tuning occurred before scoring:** zero commits touch `lib/contract-model/compiler/**` anywhere in this phase (verifiable via `git log --stat` between `0d7a0a3` and `806f9bd`); the one harness change (per-document error isolation, `617c0ef`) was made and committed **before** Stage 2 was re-run and **before** any ground truth existed, explicitly to obtain a complete, honest run rather than to improve any score; every subsequent stage (3, 4, 5) and the scoring pass itself made zero further code changes of any kind.

## 73. Known limitations

- Single-agent ground-truth authoring (no true second-reviewer isolation) — disclosed in §18, same limitation FWRG/LSB already carried.
- Ground truth basket-level sampling covers 32 of a real ~55 baskets in Documents A's densest sections (representative, not exhaustive) and does not decompose Document B/C/D's provisions to basket granularity (none of the three have real enumerated-basket structure at that granularity).
- Context-retrieval scoring (§37–41) relied on the sufficiency-state proxy and the unresolved-dependency count rather than a fully independent per-item required-context ground truth, for time reasons.
- Auditor material-finding precision/false-alarm rate were not independently re-verified item-by-item (Phase 2E's own frozen fault-injection suite was trusted instead, since no auditor code changed).
- This session's sandbox has no live database (`DATABASE_URL` unset, `localhost:5432` unreachable) — the repository's DB-backed test suite (104 of 821 total tests) could not be executed for that reason; every DB-independent test, including the full `tests/contract-model/` suite's 246 non-DB tests, ran clean with zero failures. This is a pre-existing environment condition, unrelated to and not caused by any Phase 2F work (confirmed: `DATABASE_URL` was never set in this session at any point).
- Document B's 106-SECTION-node over-match (§17) was measured and disclosed but not root-caused to the same depth as the other structural findings, for time reasons.

## 74. Exact gate calculations (Phase 2F §28)

| Gate | Target | Actual | Pass? |
|---|---|---|---|
| No silent loss of an entire substantive document | required | Documents C and D produced zero signal anywhere in the system | **FAIL** |
| Zero cross-document source contamination | required | none detected | PASS |
| Covenant-bearing section recall | ≥98% | 93.75% (Document A only; 0% for C/D) | **FAIL** |
| Operative-rule recall | ≥95% | 100% basket-level (Doc A only); 0% package-wide for C/D | **FAIL** (package-wide) |
| Basket/exception recall | ≥95% | 100% (Doc A sample) | PASS (Doc A only) |
| Zero dangerous unflagged whole-covenant-family omissions | required | 2 (Documents C, D) | **FAIL** |
| No confidently false instrument assignment | required | none (Document C's mis-instrument was 0.5 confidence, not high) | borderline PASS |
| No confidently false amendment/supplement relationship | required | none — 0 relationships were ever resolved, correctly or incorrectly | PASS |
| All material unresolved ambiguities surfaced | required | yes — all 84 leads + both modification/relationship candidates report UNRESOLVED with a reason, never silently dropped | PASS |
| Required material-context recall | ≥95% | ~0% effective (definition-index gap) | **FAIL** |
| Required definition recall | ≥95% | ~0% | **FAIL** |
| Required cross-reference recall | ≥95% | not separately measured; amendment-lead recall (a cross-reference-dependent case) was 0% | **FAIL** |
| Zero silently dropped known material unresolved dependencies | required | none silently dropped — all 2,052 explicitly disclosed | PASS |
| Auditor detects 100% of naturally occurring dangerous omissions (non-zero denominator) | required | 1/3 documents (Document B only) | **FAIL** |
| Zero dangerous omissions missed by both primary and auditor | required | 2 (Documents C, D) | **FAIL** |
| **Dangerous Unflagged Omissions** | **0** | **2** | **FAIL — this is the controlling gate** |

## 75. Final verdict

Per Phase 2F §29: *"If any dangerous unflagged omission occurs, or major recall gates fail: state PHASE_2F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION."*

# `PHASE_2F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION`

This verdict was not adjusted after seeing results, and no gate definition was changed after the score was computed.

## 76. Is the retrieval architecture ready to move beyond validation?

**Not yet, and the evidence is specific rather than vague.** The architecture is genuinely strong on content shaped like its own training distribution — Document A's 93.75% section recall, 100% sampled-basket recall, and 100% candidate precision, achieved with zero LLM-side hallucination, is real, good evidence the core discovery/retrieval/audit mechanism works. But this validation's central, dominant finding is that **three real, ordinary drafting variations** — a colon-style defined-term convention, flat integer amendment-section numbering, and a guarantee/security document's vocabulary not fitting the discovery schema's covenant-shaped enum — each independently, and in combination, produced **total silence with zero alarm** across half of a real, unremarkable package. None of these are exotic drafting; all three are common in real credit facilities. A production system cannot be trusted on unseen packages until at least the two structural gaps (definition-convention and section-numbering breadth) are closed and the auditor's own independence is decoupled from sharing Phase 2A's structural substrate with the system it audits.

## 77. Recommended next task

**Phase 2F.1 — Structural Substrate Generalization + Auditor Independence Repair**, scoped narrowly to the two STRUCTURAL_SUBSTRATE root causes this validation found (definition-declaration pattern generalization to a colon convention; SECTION_PATTERNS generalization to flat integer amendment numbering), plus making the Phase 2E auditor's own region inventory independent of Phase 2A's SECTION-node granularity so a shared structural gap cannot defeat both layers identically. Explicitly **not** in scope for that follow-on task: the Phase 2B schema/prompt crash on non-covenant document types (a separate, `DISCOVERY_PHASE_2B`-rooted defect class, deliberately left for a distinct follow-on per this task's own "remediate only the dominant class, leave others for a follow-up" discipline) and the Phase 2C classification defect (a separate, `PACKAGE_RELATIONSHIP_PHASE_2C`-rooted defect class). Re-run this exact CONMED package's frozen auditor after that remediation, exactly as Phase 2E.1 re-validated against Phase 2E's own frozen findings, before considering a second unseen package.

---

*Stop condition honored: this phase acquired one unseen package, ran the frozen pipeline once, preserved every first-run artifact, authored independent ground truth, scored, and diagnosed root causes — without ingesting a second package, applying amendment precedence, building a formula/capacity layer, or touching customer-facing product surfaces.*
