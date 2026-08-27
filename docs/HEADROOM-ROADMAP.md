# Headroom — Roadmap and Repository Alignment

**Status: permanent, with a living "current phase" marker.** This document records the stable phase sequence, audits what has actually been built against `docs/HEADROOM-NORTH-STAR.md`, and recommends the next implementation phase. Update the "Current phase" line as work completes; do not otherwise restructure this document without an `ARCHITECTURE_CHANGE_PROPOSAL` (see `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`).

**Current phase: Phase 2 complete (2A–2G, verdict `PHASE_2G_AMENDMENT_PRECEDENCE_GATE_PASSED`, commit `f722a79`). Recommended next phase: Phase 3A — General Covenant Intermediate Representation V1.** See §5 for the full recommendation and reasoning.

---

## 1. Phase 2 audit — the Contract Evidence Substrate

Phase 2 built a deterministic-first, LLM-assisted-where-genuinely-semantic pipeline that turns raw multi-document debt packages into structurally-navigable, source-cited, uncertainty-honest evidence — without yet extracting executable covenant rules from it. This is a real, substantial, well-evidenced body of work. The table below is drawn directly from every phase's own final report.

| Phase | Verdict | Problem solved | Output / data model | Downstream consumer | Systemic vs. bounded |
|---|---|---|---|---|---|
| **2A** (+2F.1) | `PHASE_2F_1_STRUCTURAL_SAFETY_GATE_PASSED` | Deterministic, LLM-free structural navigation (ARTICLE→SECTION→SUBSECTION→CLAUSE→SUBCLAUSE) with exact identity, definitions, and references, over real text with zero prior structural parsing. | `StructuralNode`/`DocumentNode` tree, `DetectedDefinition`, `DetectedReference`, `StructuralIndex` navigation API. | Every downstream Phase 2 stage (shared substrate). | 2F.1 fixed a real **systemic** gap: line-anchored/decimal-only section regex produced **zero structural nodes** for a whole class of real documents (flat-integer amendment numbering) — silently, with no alarm. Fixed, re-verified on the original failing documents. |
| **2B** (+2F.2) | `PHASE_2F_2_DISCOVERY_SCHEMA_ROBUSTNESS_GATE_PASSED` | Autonomously find substantially all covenant provisions/baskets/exceptions/tests with no supplied target list (4-pass hybrid: deterministic signal detection → semantic classification → neighborhood resolution → reconciliation). | `DiscoveredCandidate[]` (role, families, confidence, sourceCitation, provenance). | Package Graph's covenant association; Context Retrieval; Coverage Audit comparison. | 2F.2 fixed a **systemic** gap: an out-of-vocabulary model value on a closed `role` enum threw an uncaught SDK error, silently killing **the entire remaining document's** discovery, not just one item. Fixed via a tolerant-boundary/normalization pattern; per-section fault isolation added so one bad section can never again take down a whole document. |
| **2C** (+2F.3) | `PHASE_2F_3_PACKAGE_GRAPH_REMEDIATION_GATE_PASSED` | Classify documents, group into `DebtInstrument`s, resolve relationships (AMENDS/RESTATES/SUPPLEMENTS/…) and modification-candidate targets, deterministic-only V1. | `DocumentRelationshipEdge`, `DebtInstrument`, modification candidates, package query API (`service.ts`). | Context Retrieval; Coverage Audit; the Amendment pipeline's sole structural input. | 2F.3 fixed a **systemic** gap: the classifier scanned a document's whole preamble broadly rather than its own self-referential title, misclassifying two real documents as base agreements — this cascaded into 67 of 84 real cross-document reference leads going falsely `UNRESOLVED` package-wide. Fixed via self-referential-title-first classification; re-verified at 0/84 unresolved on the same real package. |
| **2D** | `PHASE_2D_CONTEXT_RETRIEVAL_REGRESSION_GATE_PASSED` | Given a discovered candidate, assemble the bounded, source-backed contractual context (parent/child/sibling/proviso/exception/definition/cross-reference/cross-document) a future analyzer needs, without rereading the whole package. | `CovenantContextBundle` (items, edges, unresolvedDependencies, sufficiencyState). | Future rule-extraction/semantic-compiler stage (not yet built); Coverage Audit's context-comparison stage. | Bounded — zero `MATERIAL_CONTEXT_MISS` across measured cases. Two narrow pre-existing bugs found and fixed during construction (cross-instrument definition leakage, hardcoded cross-doc target types). |
| **2E / 2E.1** | `PHASE_2E_INDEPENDENT_COVERAGE_AUDITOR_REGRESSION_GATE_PASSED` / `PHASE_2E_1_CROSS_REFERENCE_REMEDIATION_GATE_PASSED` | An independent, mechanically-enforced auditor (never reads primary-pipeline conclusions during inventory generation) that catches material omissions the primary pipeline doesn't know it made. Found 5 real, previously-undisclosed material findings in a benchmark Phase 2D itself believed had zero misses. | `AuditFinding[]`, `CoverageRegion[]`, coverage map. | A standing safety check alongside, not inside, the primary pipeline. | The root cause 2E found (one composer function only checking the immediate parent, never ancestor chains) was narrow and generalizable — bounded once diagnosed, closed in 2E.1 (4/5 fully resolved, 1 disclosed as genuinely unstructured source with no citable node). Fault-injection catch rate 100% (12/12) throughout. |
| **2F** | `PHASE_2F_UNSEEN_PACKAGE_VALIDATION_NEEDS_ITERATION` | The one genuinely-unseen, pre-registered, content-blind validation run — real SEC filings (CONMED Corp), objectively selected, frozen pipeline. | Frozen run artifacts + independently-authored 75-item ground truth. | N/A — this is the validation event that drove 2F.1/2F.2/2F.3. | **This phase is where the one real systemic finding in the whole Phase 2 program surfaced.** Two of four real documents produced zero signal anywhere in the system — not a lower-quality result, total silence — and the independent auditor was *also* blind to the same two documents, because it shares Phase 2A's own structural-node dependency with the system it audits. Verdict permanently stands `NEEDS_ITERATION`; never overwritten even after remediation (invariant 28). |
| **2G** | `PHASE_2G_AMENDMENT_PRECEDENCE_GATE_PASSED` | Amendment-effect parsing, date-aware chain sequencing, as-of-date operative-state resolution over the (now-remediated) package graph — deterministic parser + standalone markup-exhibit/schedule detectors + a narrowly-scoped, validated AI interpreter for genuinely ambiguous clauses only. Explicitly not a semantic covenant compiler. | `AmendmentEffectCandidate`, `OperativeProvisionView`/`OperativeContractState`. | Nothing yet (this is the current frontier — see §5). | All 10 gate conditions pass. Real CONMED run: 8/8 real effects correctly land `REVIEW_REQUIRED`/`UNRESOLVED` (0 falsely resolved), independently re-verified deterministically. One disclosed, reasoned scope gap: no adversarial semantic verification pass built (no confidently-resolved semantic effect existed yet to justify one). |

### The pre-Phase-2 "Phase C" compiler — a related, separate, unresolved lineage

Before Phase 2's deterministic-first substrate existed, an earlier program ("Phase C", "Phase C.1", "Phase C0") built an 11-stage, LLM-driven, resumable rule-extraction compiler (`ContractCompilerRun`/`ContractCompilerStage`, `lib/contract-model/compiler/orchestrator.ts`). It is still present in the codebase and its own state machine is what every Phase 2B–2G report means when it discloses "not yet wired into `ContractCompilerRun`'s own resumable cache."

Phase C's real, validated result on two unseen packages (FWRG, LSB): `DANGEROUS_UNFLAGGED_ERROR_RATE = 25.0%` (8/32 ground-truth provisions), against a required ≤5% gate — verdict `PHASE_C_COMPILER_V1_NEEDS_ITERATION`. The root-cause investigation (Phase C.1, `docs/phase-c-1-multi-basket-verification.md`) found that 6 of the 8 cases were actually **evaluator/scoring bugs**, not real extraction losses — the correct per-basket rules had in fact been extracted correctly, but the grading logic compared ground truth against the wrong persisted rule. Fixing the evaluator brought the rate to 15.625% (5/32) — still above the ≤5% gate. Verdict: `MULTI_BASKET_REGRESSION_GATE_FAILED`. Work stopped there, per that phase's own explicit "no third unseen package on a FAILED verdict" rule, and the project instead built the deterministic Phase 2A–2G substrate underneath and around this compiler rather than continuing to iterate on it directly.

**This is a real, disclosed, never-closed safety gap sitting in a still-present code path.** It is not currently reachable from any live system (see §4 below — nothing under `app/` references `ContractRule`), so it is not an active production risk today. But it means the 11-stage orchestrator's own `RULE_EXTRACTION`/`VERIFICATION` stages should not be assumed safe or reused as-is by Phase 3 — see §3's migration table.

### Is Phase 2 sufficiently complete for Phase 3 to begin?

**Yes, on the specific, evidenced claim the repository actually supports — which is narrower than an unconditional "no systemic issues remain."**

The repository's own most rigorous test (Phase 2F's genuinely blind, pre-registered validation) found a real, dangerous, systemic result: two of four ordinary real documents produced total silence across the whole pipeline, including the independent auditor built specifically to catch exactly that. The three concrete drafting variations that caused it (colon-style definitions, flat-integer section numbering, an out-of-vocabulary discovery-role value) are fixed and re-verified against the exact original failing documents. Phase 2F.3's own closing claim — "no systemic blocker remains in the retrieval substrate" — is well-evidenced *for those three defect classes*.

What it does not cover, and what this document classifies explicitly:

**Systemic blockers remaining: none identified against the failure classes actually tested.** No new systemic blocker was found in any subsequent phase's own regression testing.

**Known bounded limitations (fail safely or are adequately surfaced/reviewed — proceed, but keep tracked):**
- No second genuinely-unseen package has validated the fully-remediated 2A–2G stack end-to-end. Phase 2F's own central lesson was that the failure modes that mattered were *ordinary*, not exotic — which means a different unseen package surfacing a fourth or fifth variation of the same underlying pattern-generalization risk is a real, not merely theoretical, possibility. This is exactly why §6 below schedules a second unseen-package validation at the next major architecture boundary (Phase 3F), not immediately.
- The shared-structural-substrate independence weakness (invariant 18 in the Architecture Invariants doc) was mitigated (Phase 2A's own parser generalized; `raw-source-fallback.ts` added as an independent-of-structure fallback) but not architecturally eliminated. A *new* Phase 2A gap neither prior fix covers could in principle still defeat both discovery and audit simultaneously, exactly as Phase 2F found.
- Provenance and caching for the 2A–2G pipeline are real in the type system but not yet persisted — every pipeline is "standalone," recomputing from scratch on every run rather than resuming from `ContractCompilerRun`'s own stage cache.
- Package classification's `likelyAmendment` heuristic has a known, disclosed false-positive shape (fires on any "[Nth] Amended and Restated ... Agreement"-titled *base* document) — never yet observed to flip a real verdict, tracked, not fixed.
- 12 real `UNCERTAIN`-severity findings remain undiscovered on the real CONMED guarantee/security document even after remediation — disclosed as acceptable (zero `MATERIAL` findings remain missing).

**Future product-scope gaps (belong to later phases, not blockers to Phase 3 starting):**
- Phase C's own 25%→15.625% dangerous-unflagged rule-extraction defect (multi-basket-per-section threshold loss) was never itself closed — it is superseded architecture, not active production code, and Phase 3 is precisely the program that replaces it with a better-verified extraction approach. It should inform Phase 3's own verification design (see §2's Phase 3C scope), not block Phase 3 from starting.
- Only 2 of 15 `CalculationRuleKind` shapes have any registered evaluator — this is squarely Phase 4's problem (execution), not Phase 3's (representation).
- Zero customer-facing surface consumes any of the Contract Evidence Substrate today — this is expected; nothing in Phase 2's own scope required it to, and wiring it into product surfaces is Phase 6/7 work.

**Conclusion: proceed to Phase 3A.** The evidence supports starting Phase 3 with the bounded limitations above explicitly tracked (not silently dropped), and with a second unseen-package validation scheduled at the Phase 3F boundary rather than skipped.

---

## 2. The stable phase sequence

This sequence is locked. See `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`'s anti-drift mechanism for what it takes to change it.

### Phase 3 — Contract Intelligence

**Goal:** turn unfamiliar operative contractual language into generalized, source-backed, machine-readable meaning, without requiring engineers to manually encode every covenant formulation.

- **3A — General Covenant Intermediate Representation V1.** Define the compositional language. See §4 for detailed design questions and the current-schema migration assessment.
- **3B — AI Semantic Covenant Compiler V1.** Translate operative covenant evidence/context (Phase 2D's `CovenantContextBundle`, fed by Phase 2G's `OperativeProvisionView`) into the IR. Bounded, tool-shaped where evidence genuinely requires it (North Star §9); never a single giant static prompt by default.
- **3C — Independent Semantic Verification V1.** A separately-instructed adversarial pass attacking the proposed representation against source (North Star §10). Must be designed against the "shared substrate defeats independence" failure mode from the start, not discovered the hard way a second time.
- **3D — Reviewed Precedent / Learning System V1.** Reviewed interpretations become controlled precedent for future compilation (North Star §8).
- **3E — Semantic Coverage / Representation Auditor V1.** Independently determines whether all material source economics are represented — the semantic-coverage analogue of Phase 2E, built with the same mechanically-enforced independence discipline.
- **3F — Unseen Semantic Validation.** Freeze and run the full Phase 3 stack on a genuinely unseen real package. This is also the recommended point for the second unseen-package validation of the underlying Phase 2A–2G substrate flagged as a bounded limitation in §1 — validate both layers together, since by this point they are used together for the first time in earnest.

### Phase 4 — Contract Computation

**Goal:** execute approved, structured contractual rules deterministically. Begins only after Phase 3 demonstrates sufficiently reliable semantic understanding (per Phase 3F's own gate, not a fixed calendar point).

- **4A — Expression Runtime.** Deterministically evaluate IR operators.
- **4B — Contractual Metric Graph.** Represent and calculate defined contractual metrics (North Star §15) as their own dependency graph, not primitive values.
- **4C — Financial Fact Interface.** Supply typed, dated, provenance-backed financial facts (from Phase 5) to contractual calculations, preserving the four value layers (North Star §14).
- **4D — Capacity Solver.** Calculate covenant capacity across fixed baskets, growers, builders, ratio baskets, shared caps, reclassification, historical usage, and interacting rules — the compositional-algebra successor to `CapacityExpr` and the solver-native `Permission` graph (see §3's migration table).
- **4E — Calculation Verification / Validation.** Validate calculation correctness against reviewed examples and unseen cases, reusing the golden-test discipline already proven in this codebase (`scripts/golden-test.ts`'s multi-dimension grading — value, status, binding provision, dependency terms — is the concrete precedent to extend, not replace).

### Phase 5 — Financial Data & Monitoring Platform

**Goal:** continuously maintain trusted financial truth.

- **5A — Canonical Financial Ontology.** Reconcile the current `FinancialSnapshot`/`FinancialState` fork (§3.3) into one schema.
- **5B — Connector Framework.** Already substantially built (`lib/connectors/`) — this subphase is primarily about extending it from onboarding-only to continuous operation, not building it from scratch.
- **5C — ERP / Accounting Connections.**
- **5D — Treasury / Bank / Debt Data Connections.**
- **5E — AI-Assisted Mapping.** Reuse the existing `ExtractionCandidate` review lifecycle (North Star §12) rather than inventing a parallel one.
- **5F — Reconciliation / Approval.**
- **5G — Sync / Historical Snapshots / Freshness.**
- **5H — Change Detection / Financial Dependency Graph.**

**Parallelization note:** 5A (schema reconciliation) and 5B (extending the connector framework's reach) can safely begin once Phase 3B/3C are stable, in parallel with late Phase 3/early Phase 4 work — neither depends on the IR or the runtime. 5E (AI-assisted mapping) should wait until 5A is settled, so mapping targets a single canonical schema rather than two. This parallel start is explicitly sanctioned by this roadmap; it does not require an `ARCHITECTURE_CHANGE_PROPOSAL` to begin early, only evidence (at the time) that Phase 3's core semantic-compiler work is stable enough not to be disrupted by shared engineering attention.

### Phase 6 — Living Headroom State

**Goal:** combine Contractual Truth + Financial Truth + Transaction/Capacity Truth into the real, unified Headroom State described in North Star §2 — a real dependency graph, current + historical positions, a living basket ledger, incremental recomputation, monitoring, change attribution, provenance, uncertainty, and approval/review state, all in one place. This is also where the current `LedgerEntry`/`DebtEvent` fork (§3.3) gets resolved into the real transaction/capacity-truth model.

### Phase 7 — Product Intelligence

**Goal:** expose trusted Headroom State through customer workflows — the dashboard, covenant/debt views, simulation, compliance, Ask Headroom, monitoring/alerts, and review/approval workflows. UI can and should evolve based on real customer feedback; the underlying truth/calculation systems it reads from must remain shared, never reimplemented per surface (invariant 25).

---

## 3. Phase 3A design questions and current-architecture migration assessment

### What Phase 3A must solve

Phase 3A must decide, with real evidence rather than by assumption: representation shape (typed AST vs. graph vs. hybrid — a hybrid is likely, since permissions/prohibitions/relationships look graph-shaped while individual formula expressions look tree-shaped, exactly mirroring the split this codebase already has between the solver's `Permission` graph and `covenant-engine.ts`'s `CapacityExpr` tree); stable node identity (the Phase 2A/2D `nodeKey`/`stableKey` pattern is a strong, proven precedent to extend, not reinvent); the expression primitive set (North Star §6's illustrative list — MONEY/PERCENT/METRIC/SUM/MAX/MIN/COMPARE/AND/OR/IF/etc. — start minimal, extend only on real evidence per invariant 8); how permissions, prohibitions, conditions, and exceptions compose; entity scope and transaction scope representation (reuse `EntityClassTag`, already an 11-value extensible taxonomy in the schema); defined-term and rule dependency representation (reuse `DefinedTermDependencyEdge`/`ContractRuleRelationship`'s existing typed-edge pattern); dates, periods, shared caps, builders, growers, ratios, stepped thresholds, acquisition step-ups, reclassification, redesignation, and replenishment as real compositional concepts, not one-off special cases; transaction-state dependencies; source lineage and subexpression-level provenance; explicit unresolved/unsupported-expression representation (reuse the `REPRESENTED|PARTIALLY_REPRESENTED|AMBIGUOUS|UNSUPPORTED_EXPRESSION|MISSING_CONTEXT|UNRESOLVED_DEPENDENCY|REVIEW_REQUIRED` vocabulary from North Star §7); deterministic validation of the IR itself (structurally, before any evaluator touches it); eventual execution compatibility (the IR's shape must anticipate Phase 4's runtime without trying to *be* the runtime); versioning; and a concrete migration path off `FormulaType`/`CalculationRuleKind` (§3.3 below).

Prefer the smallest compositional representation that can grow safely over theoretical completeness bought with unusable complexity — this is itself a repeated, hard-won lesson in this codebase (Phase B's own `CalculationRuleKind` header: "representability first"; the evaluator registry's own header: "adding a new shape means adding one more `EvaluatorDefinition`, never touching calling code").

### What Phase 3A should deliberately not build

Phase 3A defines the *representation*. It should not build: the semantic compiler itself (3B), the verification pass (3C), the precedent/learning system (3D), the coverage auditor (3E), or any evaluator/runtime for the IR (Phase 4). It should not attempt to migrate or delete `FormulaType`/`CalculationRuleKind`/`CovenantProvision`/`ContractRule` — see the migration table below, which recommends coexistence with a clear compatibility boundary, not a rewrite.

### Current schema support for the IR

**What can support it:** `ContractRule.formulaRef: String` (already free-text, already validated against `CalculationRuleKind` only "where set," already documented as deliberately extensible without a migration) is the right *slot* for a future IR reference — it does not need to become a new column, it needs its own validated value space to grow into. `ContractRule.conditions`/`exceptions: Json` are already schema-agnostic containers appropriate for holding serialized IR fragments. `DefinedTermDependencyEdge`/`ContractRuleRelationship`/`ContractReferenceEdge` are real, working, typed-edge dependency-graph infrastructure the IR's own dependency representation should reuse rather than duplicate. `effectiveFrom`/`effectiveTo`/`supersededByRuleId` on `ContractRule` already give the IR real, working operative-versioning infrastructure for free.

**What should not constrain the IR's design:** `FormulaType`'s own 7-value closed-enum shape must not become the IR's own top-level shape — it is a proven, valuable, but fundamentally non-compositional pattern (§3.3 below explains why it should be retained *as-is* for its current, narrow, working purpose rather than extended). `CovenantProvision.params: Json` is untyped and formula-shape-specific by convention only (each `FormulaType` value reads different keys out of the same JSON blob) — the IR needs real typed structure, not another loosely-conventioned JSON bag.

### Formula-enum / calculation-architecture migration table

| Concept | Disposition | Reasoning |
|---|---|---|
| `FormulaType` (7 values, `lib/covenant-engine.ts`) | **RETAIN, as a compatibility/production layer — do not migrate or extend.** | This is the real, working, currently-serving-two-real-companies calculation engine. It is fail-closed, well-tested, and has a real golden-test regression suite behind it. Phase 4's runtime should aim to *subsume* what it does, not modify it in place — the legacy engine keeps running Coherent/Matthews unchanged until Phase 4's runtime demonstrably matches or exceeds it on the same golden tests. |
| `CapacityExpr` (`REF\|SUM\|MIN\|MAX`, `lib/covenant-engine.ts`) | **RETAIN as a working precedent; the IR's own composition layer should be a generalization of this idea, not a replacement calling it.** | Real, proven evidence that a small compositional algebra scales better than enum expansion within this exact codebase. |
| Solver-native `Permission`/`PermissionRelationship`/`SharedConstraint` graph (`lib/solver/`) | **RETAIN; the strongest existing precedent for the IR's relational composition layer.** | Reuses `FormulaType` at the leaf (proving leaf/composition separation already works in production) while generalizing composition into a real graph — closer in shape to what Phase 3A's IR needs than either `FormulaType` or `CalculationRuleKind` alone. Study this design closely before finalizing 3A's own graph shape. |
| `CalculationRuleKind` (15 values, `lib/contract-model/types.ts`) | **MIGRATE — this is Phase B's own first draft of "the IR," not a separate thing to reconcile with the IR later.** | Deliberately extensible (Zod union, not a Postgres enum), representability-first, already the vocabulary `ContractRule.formulaRef` validates against. Phase 3A should treat this as its own starting point and evolve it into the real compositional IR, not build a parallel taxonomy and leave this one stranded. |
| Evaluator registry pattern (`lib/contract-model/compiler/evaluator-registry.ts`) | **RETAIN the pattern; MIGRATE the registrations.** | The predicate-based `EvaluatorDefinition` (`appliesTo`/`operandsComplete`/`requiresLiveFinancialInput`) shape is exactly right for Phase 4's runtime — open by design, no switch statement, no schema migration to add a shape. Only 2 of 15 shapes are registered today; Phase 4 should register real evaluators against the IR's own primitives, using this same pattern. |
| `understandingStatus`/`calculationCapability`/`executabilityState` (`stage-promotion.ts`) | **RETAIN the concept and the two-axis discipline; MIGRATE the concrete field/enum names as needed for the new IR's own shape.** | This is the single most important safety concept to carry forward unchanged in spirit (North Star §7, Invariant 14). The exact `ExecutabilityState`/`UnderstandingStatus` enum values may need to evolve for the IR, but never the underlying two-axis separation. |
| `CovenantProvision`/`GoldenTest`/golden-test harness (`lib/covenant-engine.ts`, `scripts/golden-test.ts`) | **RETAIN as the production/regression layer; do not touch until Phase 4's runtime is ready to be graded against it.** | The multi-dimension grading discipline (value + status + binding provision + dependency terms, plus the "solver-native-aware" dual-path discrepancy classification) is exactly the acceptance-testing rigor Phase 4E should extend to the new runtime — build a parallel golden-test path for IR-based calculations, prove it matches, then and only then consider consolidation. |
| `ContractRule`/Phase B schema (2023–2831 in `prisma/schema.prisma`) | **RETAIN and extend.** | This is the real target for the IR to live in — `formulaRef`, `conditions`, `exceptions`, and the dependency-edge models are all real, working, and already shaped to receive a compositional representation. |
| Legacy Phase C 11-stage `RULE_EXTRACTION`/`VERIFICATION` stages (`lib/contract-model/compiler/stage-rule-extraction.ts` etc., if present, and `stage-verification.ts`) | **COMPATIBILITY LAYER — do not build Phase 3B on top of this code as-is.** | This is the code path with the real, unresolved 15.625% dangerous-unflagged rate. Its *lessons* (the two-layer deterministic + bounded-adversarial verification design, the "unconfirmed correction reverts to original" safety rule) should carry forward into Phase 3B/3C's own design. The code itself should be treated as a reference implementation to learn from, not a foundation to extend — Phase 3B should be built fresh, informed by Phase 2's now-more-mature structural/discovery/context substrate, which did not exist when Phase C was originally built. |
| `DebtTranche` (`prisma/schema.prisma`) | **DEPRECATE eventually.** | Schema's own comment says it exists "purely for the Position tab's capital-structure display"; the actual Capital Structure page already reads `Facility` (the newer financial-core model) instead. Superseded, not actively harmful — no urgency, but do not build anything new against it. |

---

## 4. Phase 1 architecture lessons to preserve

These predate Phase 2 and must survive into Phase 3/4 regardless of how the concrete code changes:

- **Provenance is a first-class concept, not debugging metadata** — carry the discipline, not necessarily every current field name.
- **Understanding vs. executability must stay two separate, independently-computed axes** — the single most important lesson from this codebase's own history (§3 above; the concrete, measured cost of getting this wrong was real: EXECUTABLE promotions dropping from a false 3–5 to a true 0 once corrected).
- **Promotion/verification invariants**: a rule only reaches its most-trusted state through an explicit, auditable promotion decision with reasons attached — never an implicit default.
- **Evaluator registration as an open, predicate-based pattern**, not a switch statement — proven to scale better for adding new shapes without touching calling code.
- **Benchmark/golden-test discipline**: multi-dimension grading (not just "did the number match"), permanent regression status once a package has been inspected, and honest reporting of a discovered failure even when it makes prior work look worse (Phase C's own citation-matching-bug story — the honest 42.9% was reported as "the accurate number," not softened).
- **Independent verification, kept genuinely separate from compilation** — and, per the newer Phase 2E/2F lesson, evaluated against shared-substrate risk, not just algorithmic independence.
- **Safe failure as the default** — every one of these systems, at every layer, prefers an explicit `REVIEW_REQUIRED`/`UNRESOLVED`/`MISSING_EVALUATOR` outcome over a plausible-looking wrong answer.

---

## 5. Current financial-model and ledger assessment

### Financial model

Two parallel schemas exist and are both real: the legacy `FinancialSnapshot` (bare, unprovenanced `Decimal` fields) and the newer `FinancialState`/`Facility`/`DebtEvent` (genuine per-fact provenance via `ProvencancedFact<T>`, event-sourced capital structure). Both are populated today exclusively by engineers hand-typing numbers from real SEC filings into one-off scripts — neither is fed by the real, working connector framework that already exists. **What can be reused:** the `FinancialState` schema and `ProvencancedFact<T>` pattern are the right foundation for Phase 5's canonical ontology — they should absorb `FinancialSnapshot`'s role, not the other way around. **What is prototype-only:** the hand-typed population scripts themselves; they proved the schema works with real data, but are not a durable population mechanism. **What's insufficient today:** neither schema is fed continuously; there is no live path from the EDGAR/CSV/upload connectors already built to either schema. **Evolves into:** Phase 5A's canonical financial ontology, built by reconciling these two schemas into one — `FinancialState`'s shape, `FinancialSnapshot`'s current consumers migrated over.

### Ledger

`LedgerEntry` is real and load-bearing (restricted-payment pool tracking for the legacy engine) but narrow — a flat 6-value basket enum, not a rich transaction record, and it does not track "exact permission/basket relied upon" as a structured field. `DebtEvent` is the richer, newer, event-sourced model, explicitly designed with a `sourceLedgerEntryId` link back to `LedgerEntry` that has never actually been populated. **Migration path:** Phase 6 is where these should be reconciled into the real transaction/capacity-truth ledger described in North Star §2C — `DebtEvent`'s richer event-sourcing shape as the target, `LedgerEntry`'s real, currently-load-bearing RP-pool-usage behavior migrated onto it rather than discarded (the legacy engine's `restrictedPaymentPoolUsed()` calculation must keep working throughout any migration — see invariant 33's "never blend two evaluation paths" applied to a schema migration, not just a calculation routing decision).

---

## 6. Prototype / product-code assessment

The prototype's page-level architecture is, with one narrow exception, disciplined: business logic lives in `lib/` (`covenant-overview-builder.ts`, `dashboard-service.ts`, `covenant-engine.ts`), pages load and format only, and the same pure functions run identically server- and client-side. This discipline should be preserved and extended, not redesigned, as Headroom State (Phase 6) comes online — future product surfaces should read from Headroom State exactly the way current pages read from `lib/dashboard-service.ts` today: one clean service call, zero page-level business logic.

Per-page assessment: Dashboard/Capacity/Capital-Structure closely track the North Star already. Simulate is architecturally correct (reuses the real engine directly) but currently reuses the *legacy* engine — expected, and fine, until Phase 4 gives it a better engine to reuse instead. Docs is a real, working provenance-surface precedent. Ledger is real but narrow, with one disclosed exception to the "no logic in pages" discipline (an inline RP-pool aggregation). Feeds is the one page that actively misrepresents the underlying architecture — its "Connected sources" card is hardcoded, static markup, not a live view of the real connector framework that exists elsewhere in this same codebase. None of this needs fixing as a reaction to this document; it needs to inform how Phase 5/6/7 wire things up so that fixing it, when it happens, is "point Feeds at the real `CompanySourceConnection` table" rather than a rewrite.

---

## 7. Horizontal / enterprise-concern assessment

| Concern | Status | Evidence |
|---|---|---|
| Tenant isolation | **BUILT** | `tests/contract-model/tenant-isolation.test.ts` — proven, including adversarial cross-tenant edge injection. |
| Instrument isolation | **BUILT** | `tests/contract-model/package-graph-pipeline.test.ts` (identical section numbering across two instruments never merges); `coverage-audit-map-and-isolation.test.ts`. |
| Authentication / authorization | **MISSING** | No session/auth dependency in `package.json`, no middleware, no route-level auth checks. `app/admin/page.tsx` is explicit, disclosed self-documentation of this: "not a login system, only a stopgap." Company selection is a URL param today. **This is a real future blocker for any multi-user, credentialed product, but not a blocker for continuing Phase 3/4 architecture work**, which does not depend on auth existing. |
| Audit logging (who-did-what-when) | **MISSING** | No `AuditLog` model, no logging framework, no `console.log`/logger calls outside tests. Distinct from `AuditFinding` (a coverage-audit finding type, not a user-action log) — do not conflate. **Future blocker for a real multi-user product; not a current architectural-correctness blocker.** |
| Provenance tracking | **BUILT**, consistent across modules, **not yet persisted for the Phase 2A–2G pipeline** | Same `sourceCitation` field name/semantics reused across Discovery/Retrieval/Amendment/Audit. Real in the type system; not yet a durable DB row for these specific pipelines (they remain standalone/in-memory). |
| Effective dating / versioning | **BUILT**, consistent across ≥9 models | `effectiveFrom`/`effectiveTo` on `Document`, `CovenantProvision`, `Permission`, `PermissionRelationship`, `FinancialState`, `Facility`, `DocumentNode`, `DefinedTermNode`, `ContractRule` — same pattern, explicitly cross-referenced in schema comments, never reinvented per model. |
| Model/provider identity + token/cost logging | **BUILT** | `AnalyzerCallTelemetry` — provider, model, prompt/schema version, token counts, retry/rate-limit counts, latency, projected cost (never a fabricated real dollar figure). |
| Retry / resilience for AI calls | **BUILT, narrowly scoped** | Exponential backoff + jitter for HTTP 429 specifically; other errors propagate immediately by design. Disclosed as never having been exercised against a real live 429 in any session — proven in unit tests, unproven live. |
| Caching (compiler pipeline) | **PARTIAL** | Real, working, content-hash-gated resumable caching exists for the legacy Phase C orchestrator (`getOrRunStage`). The newer Phase 2A–2G pipelines compute a real content-identity hash but do not persist or cache against it — every run recomputes from scratch. |
| Reproducibility / idempotency | **BUILT, extensively tested** | 15+ test files across nearly every Phase 2 stage assert byte-identical reruns; proven on real packages, not just synthetic fixtures. |
| Regression tests / golden tests | **BUILT** | 48-row `GoldenTest` model, multi-dimension grading, solver-native-aware dual-path discrepancy classification, wired as an explicit before/after regression gate on every architectural change. |
| Independent auditing | **BUILT**, with the shared-substrate caveat in §1 | Phase 2E's mechanically-enforced independence contract; the real, evidenced limit of algorithm-level independence against substrate-level shared risk. |

None of the MISSING items (auth, audit logging) currently threaten Phase 3/4's architectural correctness — they are real future blockers for a credentialed, multi-user, auditable production product (Phase 7 territory, and arguably earlier), not blockers to continuing the Contract Intelligence / Contract Computation work. They should not be silently forgotten, and should not be casually deferred past the point where real customer data with real access-control requirements enters the system.

---

## 8. Repository alignment audit

| System | Alignment | Recommendation |
|---|---|---|
| Prisma schema overall | **PARTIALLY_ALIGNED** | Four architectural generations coexist (legacy engine, solver-native, Phase B/C, financial-core) without a single reconciling layer. Individually well-designed; collectively fragmented. See per-system rows below. |
| `Company` | **ALIGNED** | Generalized, zero per-company branching found anywhere; `tenantKind` already anticipates a multi-tenant future. |
| `Document` | **ALIGNED** | Real amendment-precedence mechanism (`effectiveFrom`/`effectiveTo`/`supersedesDocumentId`) genuinely used by the legacy production engine today. |
| `DocumentNode` | **ALIGNED** | Real self-referencing structural tree, Phase 2A-populated, stable-keyed. |
| `DocumentRelationshipEdge` | **ALIGNED** | Real, resolved-vs-review-required-vs-unresolved discipline, remediated and re-verified in 2F.3. |
| `AmendmentEffect` (Phase B schema model) | **PARTIALLY_ALIGNED** | Representation-only per its own design (never populated from real text by the schema's original owner, Phase B/C); Phase 2G's own `AmendmentEffectCandidate` is the real, working equivalent operating in-memory, one layer below. These two should eventually converge — Phase 2G's in-memory output is the right shape to persist *into* this table, once persistence is built. |
| `CovenantProvision` | **LEGACY_BUT_SAFE** | Real, working, production-serving. Retain per the migration table in §3 — not architectural debt, a currently-necessary production dependency. |
| `DefinedTerm` (legacy) | **LEGACY_BUT_SAFE** | Superseded in concept by `DefinedTermNode` (Phase B) but still real production input for the legacy engine's display layer. |
| `FormulaType` | **LEGACY_BUT_SAFE** | See §3 — retain as-is, do not extend, subsume via Phase 4's runtime rather than modify in place. |
| `CalculationRuleKind` | **PARTIALLY_ALIGNED** | The right *direction* (extensible, representability-first) but not yet the real IR — treat as Phase 3A's starting draft, per §3. |
| Compiler stages 2A–2G | **ALIGNED** | This is the best-aligned major system in the repository relative to the North Star's principles (deterministic-first, uncertainty always representable, provenance-consistent, independently verified). |
| Structure (2A) | **ALIGNED** | |
| Discovery (2B) | **ALIGNED** | |
| Package graph (2C) | **ALIGNED** | |
| Context retrieval (2D) | **ALIGNED** | |
| Coverage auditor (2E) | **ALIGNED**, with the shared-substrate caveat tracked as a known limitation, not a misalignment. | |
| Amendment / operative state (2G) | **ALIGNED** | The most mature single module in the repository; its own header comments already explicitly reconcile with the legacy engine's precedence mechanism rather than duplicating it. |
| Evaluator registry | **ALIGNED** | The pattern itself is exactly right; only its current near-empty registration state (2/15 shapes) is a gap, and that gap is explicitly Phase 4's job to close, not a misdesign. |
| `lib/covenant-engine.ts` | **LEGACY_BUT_SAFE** | Real, fail-closed, well-tested production system. Not architectural debt — a working system Phase 4 must not casually disrupt. |
| Solver-native graph (`lib/solver/`) | **ALIGNED** | The closest existing precedent for Phase 3A/4D's own compositional relationship representation; study before designing, don't discard. |
| `FinancialSnapshot` | **ARCHITECTURAL_DEBT** | Superseded in design by `FinancialState`, but still the only financial input several real pages/scripts read. Reconcile in Phase 5A; do not extend further in the meantime. |
| `FinancialState`/`Facility`/`DebtEvent` | **ALIGNED** | The right target shape for Phase 5's canonical ontology. |
| `LedgerEntry` | **PARTIALLY_ALIGNED** | Real and load-bearing, but narrow and unlinked from `DebtEvent`. Migrate per §5, don't discard — it's genuinely in use. |
| Connector framework (`lib/connectors/`) | **ALIGNED**, badly underused | The design is exactly right for Phase 5B; the gap is integration reach (onboarding-only today), not architecture. |
| Position/Dashboard/Capacity pages | **ALIGNED** | |
| Simulate page | **ALIGNED** architecturally, reuses **LEGACY_BUT_SAFE** engine underneath — expected, not a conflict. | |
| Docs page | **ALIGNED** | |
| Feeds page | **CONFLICTS_WITH_NORTH_STAR** | Its "Connected sources" card actively misrepresents real system state (hardcoded "connected," reading nothing real) — this is the one place in the current UI that could mislead a real user about what's actually live. Flagged for correction whenever Feeds is next touched; not urgent while the product remains a prototype with no live connector traffic to misrepresent, but should not ship to a real customer unchanged. |
| Golden-test harness | **ALIGNED** | Multi-dimension grading, permanent regression discipline, dual-path solver-native-aware classification — a real acceptance-testing asset to extend into Phase 4, not replace. |
| Tenancy assumptions | **ALIGNED** | Proven isolation, no auth yet (tracked separately in §7, not a schema/architecture misalignment). |
| Persistence/caching | **PARTIALLY_ALIGNED** | Works for the legacy orchestrator; not yet wired for the pipeline that matters most going forward (2A–2G). Real, scoped Phase 3/4-adjacent integration work, not a redesign. |

---

## 9. Unseen validation strategy

Regression packages prove regression; they do not prove generalization. Once a package has been inspected or tuned against, it is permanent regression evidence (invariant 28) and can never again support a generalization claim.

**Scheduled major unseen-validation gates**, in order:
1. **Phase 3F**, after the semantic compiler and its independent verification pass are built — validating both the new Phase 3 semantic layer *and*, per §1's disclosed bounded limitation, the underlying Phase 2A–2G substrate end-to-end for the first time against something genuinely new since Phase 2F.
2. **Phase 4**, after deterministic execution/capacity calculation is built — validating that the new runtime's real numbers match reality on a package it has never seen, not merely on golden tests it was built against.
3. **A major financial-mapping/connector generalization point**, if and when Phase 5's AI-assisted mapping (5E) has enough real customer diversity to make a blind validation meaningful — timing depends on real customer acquisition, not a fixed phase boundary.
4. **End-to-end Headroom State validation**, before any major production rollout — the first point where contractual, financial, and transaction truth are all validated together against something unseen.

Do not require a new unseen package after every minor phase or subphase — that defeats the purpose (an unseen package tuned-against-repeatedly stops being unseen) and is expensive. Use unseen validation only at genuine architecture boundaries, per invariant 28: preserve first-run artifacts unmodified, and never tune before scoring.

---

## 10. Roadmap validation — direct answers

1. **Is Phase 2 sufficiently complete for Phase 3?** Yes, per §1's evidenced, narrower claim — free of systemic blockers against every failure class actually tested; the untested-generalization risk is explicitly tracked, not ignored, and scheduled for validation at Phase 3F rather than blocking Phase 3A from starting.
2. **Does any systemic evidence-substrate blocker remain?** None identified against tested failure classes. See §1's bounded-limitations list for what remains genuinely open.
3. **What bounded Phase 2 limitations remain?** Listed in full in §1 — no second unseen-package validation yet; shared-substrate independence risk mitigated, not eliminated; provenance/caching not yet persisted; two minor disclosed heuristic imprecisions.
4. **What exactly should Phase 3A build?** A compositional covenant IR — see §3's full design-question list and current-schema assessment.
5. **What should Phase 3A deliberately not build?** The compiler, verifier, precedent system, coverage auditor, or any runtime/evaluator — those are 3B through 4E.
6. **What current schema can support the IR?** `ContractRule.formulaRef`/`conditions`/`exceptions`, the dependency-edge models, and the effective-dating fields already on `ContractRule` — see §3.
7. **What current schema should not constrain IR design?** `FormulaType`'s closed-enum shape and `CovenantProvision.params`'s loosely-conventioned JSON — see §3.
8. **How should `FormulaType`/`CalculationRuleKind` migrate?** `FormulaType` stays as a retained compatibility layer serving the legacy engine unchanged; `CalculationRuleKind` is treated as Phase 3A's own starting draft to evolve, not a separate thing to reconcile later. Full table in §3.
9. **What safety concepts from Phase 1 should survive?** Understanding-vs-executability as two separate axes, promotion/verification invariants, open evaluator registration, golden-test discipline, genuinely independent verification (evaluated against shared-substrate risk), and safe failure as the universal default. Full list in §4.
10. **Where should reviewed precedent live conceptually?** Extending the existing `ExtractionCandidate`/`CandidateReviewEvent` review lifecycle, not a new parallel system — North Star §8/§12.
11. **Where should semantic-compiler tool use connect to Phase 2 outputs?** Directly to Phase 2D's `CovenantContextBundle` (the bounded context a covenant needs) and Phase 2G's `OperativeProvisionView` (what text currently governs, as of what date) — these are exactly the inputs Phase 2G's own architecture diagram names as feeding "the future AI Covenant Semantic Compiler."
12. **Which Phase 5 financial foundations could begin in parallel later?** Schema reconciliation (5A) and extending the connector framework's reach (5B) can begin once Phase 3B/3C are stable, in parallel with late Phase 3/early Phase 4 — see §2's parallelization note.
13. **What current prototype data requirements should guide backend design?** The dashboard's actual read-model shape (`lib/covenant-overview-builder.ts`'s output) is real evidence of what a customer-facing surface needs from Headroom State — Phase 6 should be able to serve that exact shape from real, unified state rather than the current two-source composition.
14. **Which enterprise concerns should remain horizontal?** All of §7's list — none of it is phase-specific, all of it eventually touches every phase, and none of it should be built as a one-off inside a single phase's own scope.
15. **When should the next unseen validation happen?** Phase 3F — see §9.

---

## 11. Disagreement with, or refinement of, the original task framing

One point of honest refinement, based on repository evidence: the original framing (in the task that produced this document) asked whether Phase 2 has "no systemic blockers, full stop." The repository's own evidence supports a narrower, more defensible claim — no systemic blocker remains *against the failure classes Phase 2F's blind run actually found* — and this document deliberately preserves that narrower framing rather than rounding it up, because the repository's own reports (especially Phase 2F.3's own closing language) are themselves careful to scope the claim this way. This is not a disagreement with the task's intent, which explicitly asked not to assume "yes" simply because the roadmap expects it — it is exactly the kind of evidence-grounded caution that instruction asked for, applied faithfully.

No other material disagreement was found. The prompt's architectural principles (AI-vs-deterministic boundary, anti-enumeration, trust-dimension separation, provenance-as-product, never-blend-two-evaluation-paths) all have real, positive, pre-existing evidence in this repository — this document did not need to argue the repository into alignment with the vision; in most cases it needed to *document* an alignment that already existed, sometimes in more than one place independently, and flag the handful of real gaps (the Feeds page, the two financial schemas, the unlinked ledger models, Phase C's own unresolved rule-extraction accuracy) honestly rather than paper over them.

---

## 12. Recommended next implementation phase

**Phase 3A — General Covenant Intermediate Representation V1.**

**Why this, exactly, moves Headroom toward the final product:** every piece of Phase 2's real, substantial, well-verified work — structural navigation, autonomous discovery, package/instrument graphing, bounded context retrieval, independent coverage auditing, and now amendment precedence with a genuinely trustworthy operative-contract-state — currently terminates at "here is exactly what governs, with what confidence, as of what date, cited to source." None of it yet produces a single structured, machine-readable covenant rule a computer could calculate against. Phase 3A is the specific, bounded, non-implementation-of-everything-at-once step that turns that evidence into a real representation target — the necessary precondition for Phase 3B (the semantic compiler) to have somewhere real to write its output, for Phase 3C (verification) to have something concrete to check, and, eventually, for Phase 4 (computation) to have something typed and compositional to execute. It is also the step best supported by real, already-proven precedent inside this exact codebase (`CalculationRuleKind`'s extensible-taxonomy shape, the solver's compositional permission graph, the evaluator registry's open-registration pattern) — meaning it can be designed with unusually high confidence for a "first draft of a new IR," rather than from a blank page.

Do not begin Phase 3A's implementation as part of this task. This document, `docs/HEADROOM-NORTH-STAR.md`, and `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md` are the complete, permanent brief a future session needs to start it correctly.
