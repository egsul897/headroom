# Headroom — Product North Star

**Status: permanent.** This document defines what Headroom is trying to become. It is not a phase report and it does not expire when a phase completes. Read it alongside `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md` (the non-negotiable rules) and `docs/HEADROOM-ROADMAP.md` (the current phase, the stable phase sequence, and the repository-alignment audit).

This document was written after Phase 2G (`PHASE_2G_AMENDMENT_PRECEDENCE_GATE_PASSED`, commit `f722a79`) by auditing the actual repository — schema, compiler pipeline, covenant engine, financial models, ledger, product UI, and every phase report under `docs/`. Every architectural claim below is reconciled against that evidence, not copied from a prompt. Where the repository already embodies a principle, this document says so and cites the file. Where the repository has not yet reached the vision, this document says that too.

---

## 1. What Headroom is

Headroom is a continuously maintained financial, debt, covenant, transaction, and compliance intelligence system for companies. It exists to give CFOs, treasurers, controllers, finance teams, legal teams, and outside advisers a continuously updated understanding of a company's financial and contractual position — not a one-time analysis, a periodic report, or a document search tool.

The system should eventually be able to answer, for any company it covers, questions like: What is the company's financial position right now? How much cash and liquidity does it have? What debt does it have, at what rate, maturing when? What do its debt documents require, prohibit, and permit? What covenant capacity exists today, and what has already been consumed? What changed recently, and why? What transactions are available to it, and how would a proposed transaction affect cash, leverage, covenant compliance, and basket capacity? What assumptions and uncertainties affect each of those answers? And, for every material conclusion: exactly which source documents, financial inputs, historical transactions, calculations, and human approvals support it?

Headroom is **not**, at its core, a document uploader, a debt-document search tool, a covenant extractor, a legal chatbot, a static financial dashboard, an AI summarizer, or a spreadsheet replacement. Those may be — and in the current prototype, several already are — components or interfaces built on top of the real product. The product is the continuously maintained intelligence system underneath them: a trusted, source-backed model of a company's financial and contractual reality that every customer-facing surface reads from rather than recomputes.

The financial-command-center idea — financial position, debt position, contractual position, covenant position, capacity, transaction history, compliance, monitoring, and simulation, all connected through one trusted underlying company state — is the North Star. The current prototype's specific pages (`app/[companyId]/dashboard`, `/capacity`, `/simulate`, `/docs`, `/ledger`, `/feeds`) are a real, useful approximation of that idea, not the idea itself. Section 12 below reconciles the two in detail.

---

## 2. The three truth systems

Headroom's long-term architecture converges on three continuously maintained truth systems. Today, the repository has built real, substantial infrastructure toward each — unevenly, and largely disconnected from one another, as described below.

### A. Contractual Truth — what the documents actually say governs

**Question:** What are the contractual rules governing the company, right now, as of any date?

**Sources:** credit agreements, indentures, amendments, amended-and-restated agreements, joinders, supplemental indentures, intercreditor agreements, guarantees, security agreements, guarantee-and-security agreements, side letters, schedules, exhibits, compliance certificates, and related debt documents.

**Current repository state:** This is the most-developed truth system in the codebase, built across Phases 2A through 2G (the "Contract Evidence Substrate" — see `docs/HEADROOM-ROADMAP.md` §1 for the full audit). It understands documents → structural hierarchy (`lib/contract-model/compiler/stage-structure.ts`, `structural-index.ts`) → package relationships and instrument grouping (`package-graph/`) → covenant discovery (`discovery/`) → bounded context retrieval (`context-retrieval/`) → independent coverage auditing (`coverage-audit/`) → amendment precedence and operative contract state (`amendment/`). Every layer is deterministic-first, LLM-assisted only where genuinely semantic, and every layer represents uncertainty explicitly (see the enum inventory in the Roadmap doc) rather than guessing.

**What it does not yet do:** turn that operative contractual evidence into structured, machine-readable covenant *rules* with real arithmetic behind them at any scale. Phase B's `ContractRule` model and the legacy Phase C 11-stage compiler exist for exactly this, but Phase C's own validated dangerous-unflagged error rate (25.0%, later 15.625%) never cleared its own ≤5% safety gate, and the 2A–2G substrate that superseded it has never been reconnected to rule extraction. This is precisely the gap Phase 3 (Contract Intelligence) exists to close — see §7 below and the Roadmap.

### B. Financial Truth — what the company's actual financial facts are

**Question:** What are the company's actual financial facts, right now, as of any date, with what confidence?

**Sources (eventual):** ERP/accounting systems, treasury systems, bank/cash systems, debt-management systems, internal databases and APIs, financial statements, debt schedules, compliance workpapers, budgets, forecasts, and — for onboarding, legacy information, exceptions, and fallback only — spreadsheets and manual uploads.

**Important, standing principle:** the long-term product is not primarily a repeated manual-upload workflow. Headroom should eventually establish persistent connections to company systems and continuously synchronize relevant information. Uploads remain useful at the edges (onboarding, one-off evidence, review), never as the primary ongoing mechanism.

**Current repository state:** genuinely mixed, and this is one of the clearest gaps between prototype and product. Two parallel schemas exist: the legacy `FinancialSnapshot` (`prisma/schema.prisma:402`, bare `Decimal` fields, no per-field provenance) and the newer, provenance-first `FinancialState`/`Facility`/`DebtEvent` (`prisma/schema.prisma:1335-1468`, every fact wrapped in a `ProvencancedFact<T>` — `{value, sourceType, reviewStatus, asOfDate, staleness}`). Both are populated today **exclusively by engineers hand-typing numbers from real SEC filings into one-off TypeScript scripts** (`prisma/seed-data.ts`, `scripts/populate-matthews-solver-native.ts`, `scripts/populate-coherent-financial-core.ts`) — not by any live connector, despite a real, generalized, tested `SourceConnector` framework (`lib/connectors/`, EDGAR/CSV/upload implementations, dedup, staged durable ingestion) already existing and already wired into the onboarding flow. The Feeds tab, which should be where live financial synchronization surfaces to a user, currently renders a **hardcoded, static "Connected sources" card** (`app/[companyId]/feeds/page.tsx:70-89`) — its own copy candidly admits this is illustrative, not live.

**What this means for Phase 5 (Financial Data & Monitoring Platform):** the hard architectural pieces — a provenance-aware fact model, a generalized connector interface, a staged ingestion pipeline — already exist. What's missing is wiring: connecting the connector framework's live output to `FinancialState`, and reconciling the two competing financial schemas into one. This is real, valuable, mostly-integration work, not a from-scratch build. See Roadmap §Phase 5 and the ledger/financial alignment audit.

### C. Transaction / Capacity Truth — what the company has done, and what capacity remains

**Question:** What has the company done, what contractual capacity has each action consumed, and what capacity remains?

**Sources (eventual):** debt incurrences, repayments, acquisitions, dispositions, dividends, restricted payments, investments, liens, guarantees, asset sales, refinancings, and other covenant-relevant transactions — each tagged with the exact permission(s)/basket(s) relied upon, the covenant version in force at the time, capacity consumed, shared-cap implications, calculation basis, assumptions, supporting evidence, and reviewer decisions.

**Current repository state:** two overlapping, currently-unlinked event logs. `LedgerEntry` (`prisma/schema.prisma:465`) is real and load-bearing — it's written by real user actions (manual entry, Simulate-tab commits, Feed approvals) and read by the legacy engine's restricted-payment pool math (`lib/covenant-engine.ts:1300`) — but it is narrowly scoped to one purpose (RP basket usage) and its `basket: LedgerBasket` field is a flat 6-value enum, not a rich transaction record. `DebtEvent` (`prisma/schema.prisma:1438`) is the newer, richer, event-sourced capital-structure log (8 event types including issuance/repayment/refinancing/reclassification/redesignation), and it was explicitly designed with a `sourceLedgerEntryId` field meant to link back to the `LedgerEntry` that caused it — but that field is **never populated anywhere in the codebase**. The two "transaction truth" streams exist independently and do not reconcile. Neither yet tracks "exact permission/basket relied upon" as a durable, structured field.

### Headroom State — the convergence point

**Contractual Truth + Financial Truth + Transaction/Capacity Truth = Headroom State**: a continuously maintained model of the company's financial and contractual position that every customer-facing product surface reads from, never reimplements.

**Today, Headroom State does not exist as a real, unified thing.** The closest approximation is the read-model layer `lib/covenant-overview-builder.ts` / `lib/covenant-overview-service.ts` / `lib/dashboard-service.ts`, which does successfully compose financial-core position data with legacy-engine covenant math into one dashboard-shaped read model, with a genuinely clean I/O-vs-computation separation and zero per-company branching. But it composes two *disconnected* truth sources (legacy `covenant-engine.ts` + `FinancialState`) rather than one unified state, and it has no relationship at all to the Contract Evidence Substrate (`ContractRule`, `OperativeContractState`) built across Phase 2 — that substrate is not wired into any customer-facing surface (confirmed: `grep` for `ContractRule` under `app/` returns nothing). Building the real, unified Headroom State — and the dependency graph that lets one input change propagate correctly through it — is the central architectural achievement Phases 3 through 6 exist to reach.

A material Headroom State value should eventually carry, together: **value + status + provenance + effective date + freshness + assumptions + uncertainty + verification state + review/approval state.** No single boolean. See §10 (Trust dimensions) below — this is already a real, working pattern at the Contract Evidence Substrate layer (see the enum inventory in the Roadmap doc); it has simply never been extended to financial facts or unified into one customer-facing shape.

---

## 3. Continuous system, not snapshot analysis

Headroom should operate continuously, not as a one-time analysis run per document package. When a financial source updates — say, ERP synchronization changes LTM Consolidated EBITDA from $410m to $397m — Headroom should not reread the debt package. The contractual model already exists; only the financial input changed. The propagation should be: source value changes → normalized financial fact changes → contractual metric dependencies identified → dependent ratios/baskets/capacities identified → affected calculations recomputed → Headroom State updated → material change attributed → dashboard updated → a review item or alert created if appropriate. Symmetrically, when a new amendment arrives, only the affected instrument's operative contract state and its downstream calculations should invalidate and recompute — not the whole company.

This favors an architecture built around dependency graphs, incremental recomputation, effective dating, versioning, historical state, source freshness tracking, explicit change propagation, and reproducibility — and it means unnecessary full-package or full-company recomputation should be treated as an architecture smell, not a convenience.

**Current repository state:** the pieces exist in isolated, unconnected form. Effective dating is a genuinely consistent, reused pattern (`effectiveFrom`/`effectiveTo` appear identically on `Document`, `CovenantProvision`, `Permission`, `PermissionRelationship`, `FinancialState`, `Facility`, `DocumentNode`, `DefinedTermNode`, `ContractRule` — nine models, one pattern, confirmed by schema comments that explicitly cross-reference each other rather than reinventing it). Reproducibility/idempotency is extensively tested (15+ test files assert byte-identical reruns across nearly every Phase 2 pipeline stage). Content-hash-based caching exists and works for the legacy Phase C orchestrator (`orchestrator.ts`'s `getOrRunStage`, which skips a stage whose input hash still matches its persisted output) — but every one of the newer Phase 2A–2G pipelines computes a content-identity hash and then **does not actually cache against it**; each real run recomputes from scratch. There is no dependency graph anywhere in the repository connecting a financial-fact change to the contractual calculations that depend on it — because there is no unified Headroom State yet for such a graph to span. This is real, disclosed, unbuilt Phase 5/6 work, not a hidden gap.

---

## 4. The critical AI architecture principle: AI understands, deterministic software executes

Headroom must not depend on engineers manually encoding every possible covenant formulation or every customer's financial schema. Debt documents contain effectively unlimited combinations of drafting style, definitions, exceptions, conditions, baskets, grower/builder mechanics, shared caps, ratio tests, entity restrictions, reclassification rights, and bespoke negotiated terms. Customer financial systems likewise contain effectively unlimited charts of accounts, ERP field names, custom metrics, and reporting taxonomies. An architecture that requires new application code for every legal-language variation or every customer's data vocabulary will not scale to a real product.

The governing principle: **AI understands. Deterministic software executes.** AI's job is semantic variability — reading unfamiliar language and proposing what it means. Deterministic software's job is everything that must be reliable, auditable, and reproducible: arithmetic, state, provenance, versioning, dependency tracking, validation, persistence, audit history, and security/permissions.

**This is not a new idea for this codebase — it is a lesson the repository already learned once, expensively, and the North Star exists partly to make sure it is never relearned.** The legacy Phase C compiler's `understandingStatus`/`calculationCapability` split (`lib/contract-model/compiler/stage-promotion.ts`) is the concrete precedent: Phase 1A found the original invariant was *label-based* ("some `thresholdValue` is present, therefore EXECUTABLE") rather than *capability-based* ("a registered deterministic evaluator exists for this exact shape, with every operand it needs"), and that gap was a real, measured false-confidence bug — EXECUTABLE promotions dropped from 3–5 to zero once the check was corrected. Every future AI-vs-deterministic boundary in this product should assume the label-based version of that mistake is the default failure mode to guard against, not a hypothetical one.

### The structural / semantic / computational decision rule

Every future implementation phase should classify the problem in front of it before writing code:

- **Structural / mechanical** (document hierarchy, source offsets, amendment chronology, relationship identity, parser boundaries, caching, versioning) → deterministic code. This is what Phases 2A–2C built, and it works.
- **Semantic / linguistic** (unfamiliar covenant drafting, the meaning of a bespoke proviso, whether neighboring language materially limits a basket, mapping unusual customer terminology to known concepts) → bounded AI reasoning with evidence, deterministic validation, and human review where needed. This is what Phase 2B's Pass B and Phase 2G's semantic interpreter already do at small scale, and what Phase 3B (the semantic compiler) will do at real scale.
- **Computational** (arithmetic, expression evaluation, ratio calculations, basket consumption, dependency recomputation) → deterministic execution, always. `lib/covenant-engine.ts`'s `evaluateProvision()` and the solver's permission graph are the working precedent.

Do not build hundreds of deterministic heuristics to solve what is fundamentally semantic linguistic variation — that is manual covenant encoding wearing a different hat. Do not ask AI to repeatedly perform arithmetic or bookkeeping deterministic software can do reliably and cheaply.

---

## 5. AI as a contract semantic compiler

The long-term legal-understanding architecture operates conceptually like a compiler:

```
SOURCE LEGAL LANGUAGE
  → STRUCTURAL EVIDENCE (Phase 2A)
  → COVENANT DISCOVERY (Phase 2B)
  → PACKAGE GRAPH / OPERATIVE CONTRACT STATE (Phase 2C, 2G)
  → CONTEXT RETRIEVAL (Phase 2D)
  → AI SEMANTIC INTERPRETATION (Phase 3B)
  → GENERAL COVENANT REPRESENTATION (the IR, Phase 3A/3B)
  → INDEPENDENT VERIFICATION (Phase 3C)
  → REVIEW / APPROVAL WHERE REQUIRED
  → DETERMINISTIC EXECUTION (Phase 4)
```

Everything left of "AI SEMANTIC INTERPRETATION" is real, tested, and largely working today — that is the Contract Evidence Substrate the Roadmap document audits in detail. The semantic compiler itself (Phase 3B) should answer questions like: what does this provision restrict or permit; what independent baskets/rules exist within it; what conditions and exceptions apply; what definitions materially affect the economics; what variables determine capacity; what other rules does this provision depend on; which entities and transaction types are affected; and what ambiguity remains. **AI should not remain the authoritative runtime calculator** — it proposes a structured representation; deterministic code (Phase 4) executes it.

---

## 6. Do not enumerate every covenant

This is a non-negotiable invariant, and the repository already contains direct, contemporaneous evidence of exactly why.

Do not build the future around an ever-expanding flat enum of covenant formula shapes (`GREATER_OF_FLAT_OR_PCT_EBITDA`, `GREATER_OF_FLAT_OR_PCT_ASSETS`, `GREATER_OF_FLAT_OR_PCT_NET_INCOME`, …). That recreates manual covenant encoding one enum value at a time and will never keep pace with real drafting variety.

**The repository has already built one closed enum of exactly this shape, and it works — for the 7 shapes it covers.** `FormulaType` (`prisma/schema.prisma:340`, 7 values: `FLAT_AMOUNT`, `FLAT_NET_OF_DEBT`, `GREATER_OF_FLAT_OR_PCT_EBITDA`, `LEVERAGE_RATIO_ROOM`, `COVERAGE_RATIO_ROOM`, `BUILDER_BASKET`, `RATIO_GATE`) is evaluated by an exhaustive switch in `lib/covenant-engine.ts`'s `evaluateProvision()`. It is the production engine today, for two real companies, and it is genuinely reliable — but every new formula shape requires a code change to that switch. It is also composed one level up by a small, real, compositional algebra (`CapacityExpr`: `REF | SUM | MIN | MAX`) that *does* let new baskets combine existing formula shapes without a code change — proof, inside this very codebase, that composition scales in a way flat enumeration does not.

**The repository has also already built the opposite experiment, and it demonstrates the risk of the other extreme.** `CalculationRuleKind` (`lib/contract-model/types.ts`, 15 values, deliberately a Zod/TS union rather than a Postgres enum "so it can stay extensible without a migration") is taxonomically open — but as of Phase 2G, only **2 of its 15 shapes have any registered evaluator at all** (`lib/contract-model/compiler/evaluator-registry.ts`). Openness without execution capability is not, by itself, progress; it just relocates the manual-encoding problem from "add an enum value" to "add an evaluator," and nobody has been adding evaluators.

The future IR should learn from both: a small, genuinely compositional expression language — conceptually `MAX(MONEY(75_000_000), MULTIPLY(PERCENT(0.125), METRIC("Consolidated EBITDA")))`, with primitives like `MONEY`, `PERCENT`, `METRIC`, `SUM`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`, `MAX`, `MIN`, `COMPARE`, `AND`, `OR`, `NOT`, `IF`, `PERIOD`, `DATE`, `ENTITY_SCOPE`, `TRANSACTION_SCOPE`, `RULE_REFERENCE`, `LEDGER_USAGE`, `SHARED_CAP`, `CONDITION`, `EXCEPTION` — where a *new metric name* never requires new code, only a new value flowing through the same `METRIC(...)` primitive. The exact grammar is Phase 3A's job, not this document's. The exact rule this document does lock in:

**New legal drafting should ordinarily require new semantic interpretation, not new application code.** Only genuinely new semantic or computational *primitives* — not new instances of an existing primitive — should ever require extending the representation itself.

---

## 7. Semantic understanding is not the same thing as executability

Preserve this lesson exactly as the repository already learned it (see §4 above for the full story): a covenant can be correctly *understood* and *represented* even when the deterministic runtime does not yet support every operator needed to calculate it. The presence of a `thresholdValue` or `formulaRef` field does not, by itself, make a covenant executable — a registered evaluator must exist for its specific shape, with every operand that evaluator needs actually present. Keep these as separate, independently-computed trust dimensions, always — never collapse them into one boolean. `stage-promotion.ts`'s `UnderstandingStatus`/`CalculationCapabilityState`/`ExecutabilityState` split is the working precedent; the Phase 3/4 IR and runtime should preserve the same two-axis discipline even though the concrete field names and enum values will change.

### Representation sufficiency

The semantic compiler must be allowed to say "I cannot represent this safely." Concepts like `REPRESENTED`, `PARTIALLY_REPRESENTED`, `AMBIGUOUS`, `UNSUPPORTED_EXPRESSION`, `MISSING_CONTEXT`, `UNRESOLVED_DEPENDENCY`, `REVIEW_REQUIRED` must remain real, surfaced outcomes — never forced into the nearest-fitting enum value. A visible representation failure is safer than a plausible-but-wrong executable rule. This is not a hypothetical concern for this codebase: Phase C's own root-cause finding was that a verification check being *too strict* (byte-exact citation matching against real HTML-derived text with double-spaced headers) initially **masked** real danger by downgrading correct extractions to a falsely-safe `JUDGMENT_REQUIRED` en masse — the honest dangerous-unflagged rate for LSB rose from an apparent 0.0% to a real 42.9% once that false-safety artifact was fixed. The lesson generalizes beyond that one bug: **a verification or sufficiency check that is too strict does not fail safe — it fails *falsely* safe, hiding danger rather than surfacing it.** Any future sufficiency/verification logic should be tested against this failure mode explicitly, not just against being too lenient.

---

## 8. AI precedent / learning system (future)

Headroom should improve through reviewed precedent, not endless hardcoding. A reviewed semantic case should eventually preserve, together: the source language, the operative contract state it was interpreted against, the retrieved context, the AI's proposed interpretation, the verification result, any human correction, the approved representation, model/prompt/schema-version information, and source provenance. Future compilation should retrieve relevant approved precedent, provide it as bounded few-shot guidance to the semantic compiler, compile a proposed representation, independently verify it, approve or correct it, and preserve the reviewed outcome as future precedent. Precedent guides interpretation; source language always controls. Do not blindly copy precedent, and do not assume fine-tuning is the immediate answer — prefer reviewed precedent + retrieval + few-shot guidance + independent verification first; evaluate fine-tuning later only once enough reviewed data genuinely exists.

**Current repository state:** nothing like this exists yet for covenant semantics. The closest conceptual precedent is the `CandidateReviewEvent`/`ExtractionCandidateReviewStatus` (`PENDING|APPROVED|EDITED|REJECTED|REVIEW_REQUIRED`) pattern already used across the onboarding-extraction pipeline (`ExtractionCandidate`) — a real, working human-review lifecycle that a future precedent store should extend rather than reinvent, not a covenant-specific precedent system yet. This is squarely Phase 3D work.

## 9. AI tool-use

The future semantic compiler should not necessarily receive one giant static prompt. Where useful, it should operate as a bounded, tool-using reasoning system — conceptually `getOperativeProvision()`, `getDefinition()`, `getParentClause()`, `getSiblingClauses()`, `getReferencedProvision()`, `getRelatedAmendments()`, `getPriorVersion()`, `getInstrumentDocuments()`, `getContextBundleComponent()`, `getReviewedPrecedent()`. The model may request additional evidence through these tools; it may never invent evidence. If sufficient evidence cannot be obtained through the available tools, the correct outcome is a review/incomplete status, not a plausible guess. Never give a model unrestricted access to arbitrary application or database state where a narrower, purpose-built tool would satisfy the need.

**Current repository state:** Phase 2G's `semantic-interpreter.ts` already implements a deliberate, disclosed simplification of this idea — "pre-bound context, not live model-driven tool use": the calling code (not the model) decides exactly which bounded evidence to fetch (the amendment clause, the resolved target's current text) and includes it directly in the prompt, achieving the same "no arbitrary source invention" safety property as real tool-calling without the added complexity, because that phase never needed the interpreter to request additional evidence beyond one bounded fetch. This is the right V1 pattern to keep reusing until a real case demonstrably needs live tool-calling (e.g., the semantic compiler needing to pull a *prior* version of a definition it wasn't handed) — build live tool-use when evidence requires it, not preemptively.

---

## 10. Independent semantic verification, and coverage auditing as a separate concern

AI interpretation must never be trusted merely because it produced schema-valid JSON. Future architecture must include a separately-instructed verification pass: the compiler asks "what does this covenant mean?"; the verifier is instructed to actively try to disprove the proposed answer against the source — checking completeness, thresholds, formulas, conditions, entity scope, transaction scope, definitions, cross-references, AND/OR structure, exceptions, shared caps, and multi-basket fidelity. A useful verifier framing: *can I construct a hypothetical transaction where the source language and the proposed representation would produce different conclusions?* Preserve meaningful independence between compiler and verifier.

**Current repository state — this pattern is already real, twice, at two different layers, and both instances carry hard-won lessons worth preserving exactly:**

- **Phase C's `stage-verification.ts`** (legacy rule-extraction verification): a bounded, two-layer design — a free deterministic structural check, plus one bounded LLM adversarial pass instructed explicitly *not* to see the human ground truth and never to confirm "merely because the JSON is well-formed." Its most important preserved lesson: when a proposed correction is not reconfirmed on a second pass, the code falls back to the *original* rule (downgraded to `JUDGMENT_REQUIRED`), never keeps the unconfirmed correction — because a real, documented incident showed a "correction" that fixed one field while silently dropping a correct `$70M` threshold elsewhere. An unconfirmed correction can be strictly worse than the original, even when its safety label looks conservative.
- **Phase 2G's `independent-verification.ts`** (amendment-effect verification): a purely deterministic re-derivation that never trusts the pipeline's own `resolutionMethod`/`status` fields — it independently re-checks, from raw package inputs, whether a claimed target document exists, whether a claimed section/definition actually resolves, and whether any claimed replacement text is verbatim-present in the amendment's own source. Its own disclosed limitation is instructive: it never built the *semantic* (adversarial second-model-call) half, because every semantic-interpretation effect that phase produced was already downgraded to `REVIEW_REQUIRED` before reaching a state worth double-checking — a reasonable, evidence-based scope decision, not an oversight, and the report says so explicitly.

**Coverage auditing is a related but genuinely separate question, and must stay separate.** There are three distinct questions: did we *find* the covenant (discovery coverage); did we *retrieve* everything necessary to interpret it (context coverage); did we *represent* everything material in what we retrieved (semantic coverage). Phase 2E's independent coverage auditor is the working precedent — and it demonstrated real value by finding 5 real, previously-undisclosed material findings in a benchmark Phase 2D itself believed had zero misses, precisely because its own "Independence Contract" (`coverage-audit/types.ts`) is *mechanically enforced*, not merely a design intention: a dedicated test statically parses every coverage-audit source file's own imports to confirm it never reads the primary pipeline's conclusions during independent inventory generation. But Phase 2E also demonstrated the limit of independence-by-algorithm: because it shares Phase 2A's own structural-node substrate with the system it audits, a shared upstream structural defect defeated both simultaneously in Phase 2F's blind run — two real documents produced zero signal anywhere, discovery *and* audit alike, because the auditor's independence was algorithmic, not architectural. **This is the single most important safety lesson in the entire Phase 2 program: mechanically-enforced independence at the algorithm level does not protect against a shared dependency at the substrate level.** Phase 3's own semantic coverage auditor (3E) must be designed with this failure mode in mind from the start — not merely forbidden from reading the semantic compiler's conclusions, but architected, where feasible, with an independent fallback path that does not depend on the same upstream layer the primary pipeline depends on (Phase 2A's own `raw-source-fallback.ts`, built in response to exactly this finding, is the concrete precedent to extend).

---

## 11. Human review philosophy

Humans should not manually encode every covenant; AI should do the majority of semantic translation. Human attention should concentrate on: genuine ambiguity, genuinely novel drafting mechanics, conflicting interpretations, verification failures, unsupported representations, high-impact provisions, and approvals — not routine, confidently-resolved cases. The system should learn from reviewed results (§8). Success over time means more unfamiliar agreements can be compiled reliably with less manual effort per agreement, without weakening provenance, verification, auditability, or honest uncertainty handling. High autonomous coverage with reliable escalation of the genuinely ambiguous minority is the target — not zero human involvement, and not "when in doubt, always ask a human" as a substitute for real automation. `REVIEW_REQUIRED` is a safety valve, not a scalability strategy.

---

## 12. AI-assisted financial mapping (future)

The same philosophy applies to a customer's financial data as to legal language: engineers must not be required to manually encode every customer's chart of accounts, ERP schema, internal field names, or custom reports. Given an unfamiliar customer field — say, `"LTM Adj EBITDA - Covenant"` — AI may propose a normalized concept (an Adjusted EBITDA candidate), a period (LTM), and a potential contractual mapping (Consolidated EBITDA under Instrument X). But AI must never silently make that mapping operative. The lifecycle should be: `PROPOSED → VALIDATED/RECONCILED → REVIEWED WHERE NECESSARY → APPROVED → PERSISTED → REUSED DETERMINISTICALLY`. Once a mapping is trusted, deterministic code uses the actual value every time — AI should never reinterpret the same field on every dashboard refresh.

**Current repository state:** not built for financial fields specifically, but the exact lifecycle already exists, proven, for document-extraction candidates (`ExtractionCandidate`/`ExtractionCandidateReviewStatus`: `PENDING|APPROVED|EDITED|REJECTED|REVIEW_REQUIRED`, with a `CandidateReviewEvent` audit trail). Extending this same review-and-persist discipline to financial-field mapping (Phase 5E) is a genuine reuse opportunity, not a new pattern to invent.

## 13. Financial connectors — not just uploads

The final product must connect to company systems and support continuous updates: `SOURCE SYSTEM → AUTHENTICATION → SYNCHRONIZATION → RAW SOURCE DATA → NORMALIZATION → AI-ASSISTED MAPPING WHERE NEEDED → VALIDATION/RECONCILIATION → TRUSTED FINANCIAL FACT → HEADROOM STATE → DEPENDENCY-BASED RECOMPUTATION.** "Real-time" means appropriately current for the source, not necessarily sub-second — support event-driven updates, scheduled sync, period-close sync, and human-reviewed updates as appropriate combinations per source.

**Current repository state:** the generalized `SourceConnector` interface (`lib/connectors/types.ts`: `capabilities()`, `discover()`, `fetch()`, `syncSince()`, `healthCheck()`) already exists, with three real, tested implementations (EDGAR, CSV, generic upload) and a real durable staged-ingestion pipeline (`CompanySourceConnection → SourceArtifact (dedup) → IngestionJob/IngestionJobStage`, explicitly built to survive serverless request boundaries). This is a properly generalized design, not a one-off integration — the gap is that it currently powers only the one-time onboarding wizard, not ongoing synchronization, and its output (`ExtractionCandidate` rows tagged `kind: FINANCIAL_FACT`) has never actually been connected through to `FinancialState`. Wiring the existing framework into continuous operation is real Phase 5 work; designing the framework from scratch is not.

---

## 14. Financial value layers — never collapse them

Preserve the distinction between four layers, always: **source value** (what the original system reported), **normalized value** (how Headroom maps the source into its own financial ontology), **contractual value** (how the debt document itself defines or adjusts the metric), and **calculated value** (the number actually used in one specific covenant/capacity calculation). ERP EBITDA ≠ normalized EBITDA ≠ Consolidated EBITDA under a specific Credit Agreement ≠ pro forma Consolidated EBITDA for a specific proposed Transaction X. Collapsing these into one number is exactly the kind of plausible-but-wrong precision the product must never produce.

## 15. Contractual metrics are themselves contractual programs

A metric like Consolidated EBITDA is not a primitive database value — it is itself a defined-term calculation that can involve Net Income, interest, taxes, depreciation, amortization, restructuring addbacks, synergies, acquisition adjustments, dispositions, caps, time limits, anti-duplication provisions, and other defined terms. Future financial/covenant computation therefore requires a real contractual-metric dependency graph, not a flat table of named numbers. `lib/contract-model` already models `DefinedTermNode`/`DefinedTermDependencyEdge` with exactly this kind of dependency structure at the definition level (Phase B); the missing piece is connecting a *financial input* (Phase 5's territory) to a *contractual metric definition* (Phase B/3's territory) so that a change in the former can correctly propagate through the latter. This connection point is one of the more important unbuilt bridges in the whole architecture — see the Roadmap's Phase 6 discussion.

## 16. Provenance is product

Every important Headroom result should be traceable end to end. A contractual result like "Secured Debt Capacity = $143m" should trace through its calculation, the covenant representation and permission/basket it relied on, its conditions, the operative amendment state that produced the governing text, the source provision, the document version, and the source citation. A financial input like "Consolidated EBITDA = $397m" should trace through its contractual-metric calculation and adjustments, its normalized financial values, its raw source values, the ERP/internal source, the synchronization timestamp, the mapping/version used, and any approvals. **A number without provenance is not a trusted Headroom number.** Provenance is not debugging metadata for engineers — it is customer-facing product.

**Current repository state:** genuinely strong and, notably, *consistent* rather than reinvented per module — `sourceCitation: string` appears with the same name and the same semantics across Discovery, Context Retrieval, Amendment, and Coverage Audit (confirmed by direct field-level comparison across `discovery/types.ts`, `context-retrieval/types.ts`, `amendment/types.ts`, `coverage-audit/types.ts`). Phase 2D's `ContextItem` carries a full retrieval chain (`reason`/`retrievalMethod`/`retrievalDepth`/`retrievalPath`); Phase 2G's `AmendmentEffectCandidate` preserves raw model output verbatim for audit even when downgraded; `lib/contract-model/service.ts`'s `getRuleSourceTrace()` is a real, working "why does this govern" trace function. The gap: this provenance is real and consistent in the *type system*, but for the Phase 2A–2G pipeline it is not yet a durable, queryable database record — those pipelines are still standalone/in-memory, not persisted through `ContractCompilerRun`'s own resumable stage-output storage. Provenance-as-a-concept is solved; provenance-as-a-persisted-product-feature is not yet.

## 17. Trust dimensions — never collapse into one boolean

Future architecture must distinguish, and never conflate: semantic understanding, representation sufficiency, operative contract certainty, calculation capability, financial data availability, data freshness, verification state, and human approval state. A result may be strong on some of these and weak on others; customer-facing state must reflect that honestly rather than rounding up to one confident/not-confident flag.

**Current repository state:** this is, by evidence, the single most consistently-applied discipline in the codebase — every Phase 2 layer independently arrived at its own 3-to-6-value RESOLVED/REVIEW_REQUIRED/UNRESOLVED-shaped status enum rather than reusing a generic boolean (`ResolutionStatus`, `StructuralHealthState`, `DiscoveryHealthState`, `SufficiencyState`, `RegionAuditState`, `OperativeStateStatus`, `ExecutabilityState`, `UnderstandingStatus`, `CalculationCapabilityState`, and more — see the full inventory in the Roadmap doc). This is real evidence the *principle* is well internalized. The honest gap: each layer solved this independently, so there are now roughly ten different status vocabularies with no shared reconciliation layer above the package-safety rollup — a future consumer wanting one unified "how sure are we" answer across all dimensions has to hand-reconcile them today. `lib/contract-model/compiler/package-safety.ts` is the one place that does this reconciliation, and only at the whole-package level, not per-provision or per-financial-fact. Building that unified, cross-dimension trust surface — without destroying the layer-specific detail underneath it — is real Phase 6 (Living Headroom State) work.

---

## 18. Product surfaces

### The dashboard

The dashboard is the customer's continuously-maintained snapshot: financial position (cash, liquidity, revenue, EBITDA, gross/net debt, interest, leverage), debt position (instruments, drawings, availability, rates, maturities, amortization, collateral), covenant position (compliance, headroom, upcoming tests), capacity (debt, secured debt, liens, restricted payments, investments, acquisitions, asset sales), and monitoring (what changed, why, deterioration/improvement, stale or missing inputs, unresolved interpretation, upcoming obligations). The UI can and should evolve with customer feedback; the underlying information capability — that every one of those numbers is real, sourced, and current — is the actual requirement.

**Current repository state:** the strongest-aligned surface in the prototype. `lib/covenant-overview-builder.ts` (pure functions, DB-free, `buildCovenantOverview`/`buildAttentionItems`/`assignTiers`) plus `lib/covenant-overview-service.ts` (the I/O layer around it) is a genuinely clean read-model architecture, reused identically on server and client (`components/DashboardClient.tsx` re-invokes the same pure builder for zero-round-trip live reflow on editable LTM financials). The "Needs Attention" panel (`buildAttentionItems`) is built entirely from already-computed signals (financial-position warnings, review-required covenant families, upcoming maturities, zero-capacity baskets) — a real, if early, instance of the monitoring concept in §20 below, with an honestly-disclosed limitation (no per-basket usage tracking yet, so "near-limit" percentages are deliberately never fabricated). Fail-closed display discipline is verified: no figure ever silently renders `$0`/`Unlimited`/`Clear` for a genuinely unknown state, across both real companies and a synthetic "unseen company" fixture built specifically to prove the UI carries no hardcoded per-company assumptions.

### Explainability / drill-down

Every important dashboard value should be explorable: why did Secured Debt Capacity fall $42m — how much was a lower contractual EBITDA input versus a transaction consuming capacity, which covenant governs, which amendment controls, which formula was applied, which financial inputs were used, what assumptions exist, what alternative contractual pathways remain, and what is still unresolved. This is core product behavior, not a debugging feature. `components/ProvisionTrace.tsx` and `lib/contract-model/service.ts`'s `getRuleSourceTrace()` are real, working precedents for the underlying trace mechanism (RULE → DEPENDENCIES → DEFINED TERMS → CLAUSE → DOCUMENT) — the missing piece is extending an equivalent trace through the *financial* side (why is this input's value what it is) and unifying both into one drill-down experience.

### Simulation

Hypothetical transactions (acquisition, dividend, debt issuance/repayment, refinancing, investment, disposition, guarantee, lien) must be evaluated by creating a pro forma Headroom State and propagating cash/debt/EBITDA changes through the same ratio, basket, shared-cap, cross-document, liquidity, and reporting-obligation logic real transactions use — never a standalone calculation system. Output should never be a bare PERMITTED/NOT_PERMITTED; it should surface potential paths, constraints, remaining capacity, financial effects, assumptions, uncertainties, required review, and relevant source evidence.

**Current repository state:** already built correctly, architecturally — `app/[companyId]/simulate/SimulateClient.tsx` calls `lib/covenant-engine.ts`'s real `simulateDebtIncurrence`/`simulateRestrictedPayment`/`simulateAssetSale` directly, the exact same functions the Capacity page uses at `amount=0` — there is no separate simulation engine to keep in sync. Every `EvaluationStatus` (`modeled | not_tested | review_required`) and `TransactionStatus` (`clear | blocked`) is fail-closed by construction: the engine's own header states missing/incomplete configuration never silently becomes "unlimited" or "0." This pattern should carry forward unchanged into the Phase 3/4 semantic-compiler-and-runtime world — simulation must always be "the same engine, evaluated against a hypothetical state," never a parallel implementation.

### Ask Headroom (future)

A conversational interface over trusted Headroom State and trusted tools — "how much secured debt can we incur," "why did our capacity fall this month," "which covenant becomes tightest if EBITDA falls 10%." AI should understand the request, select trusted tools, query Headroom State, invoke deterministic calculation/simulation, retrieve source evidence, and explain the result — never improvise an answer from raw documents when trusted structured state already exists for that question. Ask Headroom is an interface over Headroom's intelligence, not a substitute for building that intelligence. Not built yet; depends on Headroom State existing first (Phase 6), and on the same tool-use discipline described in §9.

### Monitoring and alerting

Continuous Headroom State should support dependency-aware monitoring — covenant headroom falling materially, liquidity falling, a transaction consuming capacity, a maturity approaching, a new amendment changing covenant economics, a financial input going stale, a connector failing, a calculation becoming incomplete, a contractual interpretation becoming unresolved, a reporting obligation approaching. One input change should recompute and alert on *dependent* state, never unrelated state. The dashboard's "Needs Attention" panel (above) is a real, working precursor to this; building it out into true dependency-aware, continuously-running monitoring is Phase 6/7 work that depends on the dependency graph existing first.

---

## 19. How the current prototype relates to this North Star

The current prototype (`app/[companyId]/*`) is a real, working, disciplined approximation of parts of this vision — not scaffolding to be discarded, and not the final architecture either. Concretely:

- **Dashboard, Capacity, Capital Structure pages**: closely aligned. Clean read-model separation, zero hardcoded per-company logic (verified by a synthetic-company test fixture), reuse the same calculation functions the rest of the product uses.
- **Simulate page**: closely aligned architecturally (reuses the real engine directly), but the engine it reuses (`lib/covenant-engine.ts`, `FormulaType`) is the legacy Generation-1 calculation layer, not the future IR/runtime — this is expected and fine; Phase 4 should replace what Simulate calls underneath it, not what Simulate itself does.
- **Docs page**: a real, working provenance/citation surface for the legacy engine's own covenant provisions — a genuine precedent for what Contract Evidence Substrate provenance should eventually surface once it's wired into any UI at all.
- **Ledger page**: real, load-bearing for restricted-payment pool tracking, but narrow — it is not yet the rich transaction/capacity-truth ledger described in §2C, and its one calculation performed inline in the page (rather than delegated to `lib/`) is a minor, disclosed exception to an otherwise strict discipline.
- **Feeds page**: the weakest link relative to the North Star today — its "Connected sources" card is hardcoded static markup, not a live view into the real connector framework that already exists elsewhere in the codebase. This is the clearest, most concrete near-term opportunity to make an existing prototype page genuinely reflect real infrastructure rather than illustrate it.
- **Onboarding wizard**: the one place the real connector framework is actually wired up today — a real foundation to extend outward into continuous operation, not a one-time-only flow to leave stranded.

None of this should be "fixed" as a reaction to reading this document. The point of auditing the prototype here is to keep backend architecture decisions pointed at the product experience these pages are gesturing toward — most importantly: whatever Phase 3–6 build should be something these exact pages (or their evolved descendants) can eventually read from as trusted Headroom State, without any of them needing their own parallel business logic.

---

## 20. The central question this architecture must keep answering "yes" to

Can Headroom become a continuously updated financial and debt intelligence system that can understand unfamiliar contractual language and unfamiliar company data — without requiring engineers to manually encode every covenant formulation or every customer's financial schema — while still producing deterministic, source-backed, auditable calculations and continuously updated financial/covenant state that CFOs, treasurers, finance teams, and advisers can actually trust?

Every phase in `docs/HEADROOM-ROADMAP.md`, and every invariant in `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`, exists to keep the answer to that question "yes."
