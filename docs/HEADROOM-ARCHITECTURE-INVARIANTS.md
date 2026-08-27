# Headroom — Architecture Invariants

**Status: permanent.** These are non-negotiable rules for every future implementation phase. They exist so that a local bug, a failing benchmark, an unfamiliar model output, or a new customer's ERP does not become an excuse to quietly redesign the product. Read alongside `docs/HEADROOM-NORTH-STAR.md` (what we're building and why) and `docs/HEADROOM-ROADMAP.md` (the current phase and the stable phase sequence).

A future phase may discover a bug, refine an internal interface, extend a general primitive, add a subphase, or remediate a validation failure. It may not casually change the macro roadmap, the AI-vs-deterministic boundary, or any invariant below. If a future agent genuinely believes one of these must change, it must produce an explicit `ARCHITECTURE_CHANGE_PROPOSAL` (format at the end of this document) rather than silently drifting.

---

## Permanent invariants

1. **Source evidence controls contractual truth.** No contractual conclusion is asserted without a real, checkable citation into the source document text.
2. **Source evidence controls financial truth.** No financial fact is asserted without a real, checkable citation into its source (a filing, a connector sync, an ERP export, a human-entered value with an attributed reviewer).
3. **Every material contractual conclusion preserves provenance** — which document, which version, which section/clause, which amendment, and the chain of reasoning that produced the conclusion.
4. **Every material financial value preserves provenance** — source system, source value, normalization applied, sync timestamp, and reviewer/approval state where applicable.
5. **AI may interpret semantic variability.** Unfamiliar drafting, unfamiliar terminology, and ambiguous language are AI's job.
6. **Deterministic software owns arithmetic and trusted state.** Calculation, persistence, versioning, dependency tracking, and validation are never delegated to an LLM call at runtime.
7. **Do not enumerate every covenant formulation.** New drafting variety should not routinely require a new enum value or a new code path. Prefer a small, genuinely compositional representation. (See `docs/HEADROOM-NORTH-STAR.md` §6 for the concrete evidence from this repository's own `FormulaType` vs. `CalculationRuleKind` history.)
8. **New drafting should ordinarily require new semantic interpretation, not new application code.** Only a genuinely new semantic or computational *primitive* — not a new instance of an existing one — justifies extending the representation itself.
9. **Unsupported semantics must be surfaced, not coerced.** A covenant the system cannot safely represent must say so explicitly, never be forced into the closest-fitting existing shape.
10. **Missing context must be surfaced**, never silently treated as "nothing more to find."
11. **Ambiguous document relationships remain unresolved** until real evidence resolves them — never picked by convenience, recency, or plausibility alone.
12. **Amendments preserve history and effective dating.** A prior version of a provision, definition, or document must remain queryable as of any historical date.
13. **Superseded language must never silently appear current.** This is the Phase 2G central invariant and it generalizes to the whole product: if precedence, effective dating, or operative state cannot be established with confidence, the result is `REVIEW_REQUIRED`/`UNRESOLVED`, never a confident-but-wrong "current" answer.
14. **Semantic understanding and calculation capability are separate trust dimensions.** A rule can be correctly understood without being executable, and the presence of data fields never implies executability on its own. (See North Star §7 for the concrete history behind this — Phase 1A's label-based-vs-capability-based finding.)
15. **No rule is executable merely because its fields are present.** A registered evaluator must exist for its exact shape, with every operand that evaluator requires.
16. **AI output is not trusted merely because it is schema-valid JSON.** Passing validation is necessary, never sufficient.
17. **Independent verification remains architecturally distinct from compilation.** The system that proposes an interpretation and the system that checks it must not be the same pass, and ideally not share every dependency (see invariant 18 below on why "distinct" alone is not always enough).
18. **Coverage auditing remains meaningfully independent** — but mechanical independence at the algorithm level (never reading the primary pipeline's conclusions) is necessary and not sufficient. A shared upstream *substrate* dependency can defeat independence even when the algorithms themselves never look at each other's output. Real, repository-evidenced example: Phase 2E's coverage auditor and Phase 2B's discovery both depend on Phase 2A's structural index; a Phase 2A gap defeated both simultaneously in Phase 2F's blind run. Any future independent-verification or independent-audit system must be evaluated against this failure mode explicitly, and should maintain at least one fallback path that does not depend on the same upstream layer as the system it is checking (Phase 2A's `raw-source-fallback.ts` is the concrete precedent).
19. **Tenant isolation is mandatory.** No company's data may ever be reachable through another company's query path, under any code path, including deliberately-injected adversarial test cases.
20. **Instrument isolation is mandatory.** No debt instrument's amendment/covenant/operative state may be reachable through another instrument's query path — including two instruments sharing identical section numbering.
21. **Every material state transition is reproducible and versioned.** Re-running the same inputs must produce byte-identical (or explicitly, narrowly, disclosed-as-non-deterministic) output.
22. **Headroom State supports incremental recomputation.** A change to one input should only invalidate and recompute the state that actually depends on it — never trigger unnecessary full-package or full-company recomputation.
23. **Source / normalized / contractual / calculated financial values remain four distinct layers**, never collapsed into one number. (North Star §14.)
24. **Customer-facing answers disclose assumptions and uncertainty.** A number without its status, provenance, and confidence is not a complete Headroom answer.
25. **Product surfaces consume trusted Headroom State rather than reimplementing business logic.** A dashboard page, a simulation page, and a conversational interface must never independently recompute the same fact three different ways.
26. **Ask Headroom uses trusted state and trusted tools**, never improvised reasoning over raw documents when structured, verified state already answers the question.
27. **Simulation reuses the same contractual and financial engines real transactions use.** There is no separate "simulation-only" calculation path. (Concretely proven today: `SimulateClient.tsx` calls the same `simulateDebtIncurrence` the Capacity page calls at `amount=0`.)
28. **Regression packages are never relabeled unseen.** Once a package has been inspected, diagnosed, or tuned against, it is permanent regression evidence — it can never again be used to claim generalization. (Phase 2F's CONMED package is the standing example: its `NEEDS_ITERATION` verdict is permanent and is never overwritten, even after every specific defect it exposed was fixed and re-verified.)
29. **No benchmark-specific production logic**, anywhere, ever. See the Anti-Benchmark-Gaming Contract below for the specific forbidden patterns.
30. **Reviewed human corrections should become reusable precedent where appropriate** — a correction made once should make the next similar case easier, not merely fix the one instance.
31. **Local bugs do not redefine the strategic roadmap.** A failing benchmark, an unfamiliar model output, a new legal drafting variation, or a new document type produces: diagnosis → generalized remediation → regression test → (where applicable) a new fault case for the independent auditor → continue the existing roadmap. It does not produce: abandon the roadmap, invent new product architecture.
32. **Any strategic architecture change requires an explicit `ARCHITECTURE_CHANGE_PROPOSAL`** (format below) — never silent drift.
33. **Never blend two evaluation paths for the same scope.** If a newer, richer calculation path (e.g. a solver-native permission graph) cannot fully cover a scope, discard it entirely for that scope and fall back to the older, well-understood path — never average, merge, or partially combine two different engines' answers for the same question. (Concrete precedent: the legacy/solver-native routing in `lib/covenant-engine.ts`, which requires *full* solver-native coverage of a document/side before routing to it at all, and falls back to the legacy path in full otherwise, with `assertNoDoubleCounting` mechanically enforcing this.)
34. **A verification or sufficiency check that is too strict fails *falsely* safe, not safe — and that failure mode is not automatically preferable to being too lenient.** Both directions hide real risk; both must be tested for explicitly. (Concrete precedent: Phase C's byte-exact citation-matching bug, which initially made LSB's real dangerous-unflagged rate look like 0.0% by downgrading correct extractions en masse, before the honest 42.9% was uncovered by fixing the check.)
35. **Competing event-sourcing or truth logs must be explicitly reconciled or linked, never left to silently diverge.** If two models exist to record the same category of event (e.g. a transaction ledger and a capital-structure event log), either unify them or maintain a real, populated link between them — never let a schema field exist for exactly this purpose (e.g. `sourceLedgerEntryId`) while remaining permanently unpopulated in practice.
36. **A degraded/tolerant parsing boundary must degrade to an honest "unknown" value, never crash or silently drop the surrounding unit of work.** When an AI response, an unfamiliar document shape, or unexpected input reaches a schema boundary, the correct failure mode is a safe default plus a downstream review flag — never an uncaught exception that aborts an entire document's or package's processing. (Concrete precedent: Phase 2F.2's fix for the Pass B `role` enum crash, and Phase 2G's proactive reuse of the same tolerant-boundary pattern for its own semantic interpreter.)

---

## Anti-benchmark-gaming contract

Never optimize Headroom merely to satisfy known benchmark outputs. The following are forbidden in production code, without exception:

- Company-specific conditions or branching.
- Package IDs, benchmark section references, or known thresholds embedded in matching/decision logic.
- Expected answers or fixture-specific aliases embedded in matching/decision logic.
- Changing a denominator, a scoring rule, or a grading method *after* seeing results, without independent justification recorded before the change.
- Suppressing an auditor finding to improve a reported number.
- Converting a real failure to `REVIEW_REQUIRED` solely to improve a pass rate, rather than because the case is genuinely uncertain.
- Changing expected ground truth without explicit, documented adjudication of why the original ground truth was wrong.

Every remediation, always, must be able to answer honestly: **would this generalized change help on a debt package we have never seen?** If the honest answer is "only because it matches this specific fixture," the change does not belong in production code — it belongs, at most, in a fixture-scoped test.

Doc-comment prose citing real motivating evidence (e.g., "this pattern was confirmed necessary against CONMED Document D's own text") is not itself benchmark-specific production logic — it is disclosure of *why* a generalized pattern exists. The test is whether the *matching/decision logic itself* — the regex, the enum branch, the threshold — depends on anything fixture-specific, not whether the surrounding comment mentions a real company or package by name.

---

## Anti-drift mechanism

Once accepted, this document and `docs/HEADROOM-NORTH-STAR.md`/`docs/HEADROOM-ROADMAP.md` are the standing architecture contract. A future coding session should not need to re-derive Headroom's purpose or roadmap from the most recent local task.

A future phase **may**: discover and fix a bug; refine an internal interface; extend a general primitive (e.g., add a new IR operator once a real drafting pattern demonstrates the need); add a disclosed subphase; remediate a validation failure; update the roadmap's *current phase* marker as work completes.

A future phase **may not**, without an explicit `ARCHITECTURE_CHANGE_PROPOSAL`: change the stable phase sequence (Phase 3 = Contract Intelligence, Phase 4 = Contract Computation, Phase 5 = Financial Data / Continuous Monitoring, Phase 6 = Living Headroom State, Phase 7 = Product Intelligence); change the AI-vs-deterministic boundary; remove or weaken any invariant above; replace the anti-enumeration principle with a return to per-formula enum expansion; or redefine what Headroom fundamentally is.

### `ARCHITECTURE_CHANGE_PROPOSAL` format

A future agent proposing a genuine strategic change must produce a document containing, in order:

1. **Current assumption** — the specific invariant, roadmap phase, or North Star claim believed to be wrong.
2. **Repository evidence** — concrete, checkable evidence (real test failures, real production incidents, real unseen-package findings) showing it is actually wrong, not merely inconvenient.
3. **Proposed change** — the specific, minimal change to the invariant/roadmap/North Star being proposed.
4. **Downstream consequences** — every phase, module, or invariant the change would affect.
5. **Alternatives considered** — why a bounded remediation within the existing architecture was insufficient.
6. **Why a bounded remediation is insufficient** — an explicit statement, not an assumption, since the default presumption is always that a bounded fix is possible (invariant 31).

This proposal should be written to the same evidentiary standard as a phase's own final report — cited file paths, real test results, no fabricated urgency. It should be presented to the user/maintainer for explicit acceptance before the underlying North Star or Roadmap documents are edited.
