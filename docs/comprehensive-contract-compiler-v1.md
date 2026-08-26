# Headroom — Comprehensive Contract Compiler V1 (Design Specification)

**Status: PHASE B (language/IR foundation) COMPLETE — see
`docs/contract-model-foundation-phase-b.md` for what was actually built.
PHASE C (the multi-pass LLM compilation pipeline this document specifies
below) IS NOT STARTED.** No code in this repository runs an LLM against
this ontology, executes a compilation stage, or performs adversarial/
semantic verification. The existing extraction pipeline
(`lib/extraction/**`, `docs/document-onboarding-pipeline-foundation.md`)
remains the current, real, working system — a single-pass-per-stage
LLM extraction into a fixed candidate ontology (`DEFINED_TERM`,
`PERMISSION`, `RELATIONSHIP`, `SHARED_CONSTRAINT`, `COLLATERAL_SCOPE`,
`ACTIVATION_CONDITION`, `DOCUMENT_RELATIONSHIP`,
`EXTERNAL_INPUT_REQUIREMENT`, `FINANCIAL_FACT`), reviewed and promoted into
Coherent/Matthews' hand-modeled `Permission`/`CovenantProvision` tables or
the generalized solver-native model. This document describes what a
"compiler" evolution of that system would look like; it does not replace it.

## Phase B implementation section (what changed since this doc was first written)

Phase B built the real Prisma models, TS taxonomies, query API, and
deterministic structural validators every section below assumed would
eventually exist — `lib/contract-model/**`
(`stable-keys.ts`, `types.ts`, `service.ts`, `validators.ts`,
`compatibility.ts`) plus 11 new tables and 19 new enums
(`prisma/migrations/20260826050000_add_contract_model_foundation`). Where
a section below says "not modeled today," that gap is now closed at the
REPRESENTATION level (a real column/table exists and is tested) but still
open at the EXTRACTION level (nothing populates it from a real document
yet). `docs/contract-model-foundation-phase-b.md` is the authoritative,
section-by-section record of exactly what exists now; this document's own
sections below are left as originally written (the target design) except
where explicitly annotated **[Phase B: ...]**.

## Why a compiler framing

"Financing documents are source code; Headroom is the compiler" reframes
extraction as staged compilation rather than one-shot LLM interpretation,
with the LLM restricted to semantic parsing and a deterministic layer doing
all calculation and validation — mirroring the existing, already-real
separation in this codebase between `lib/extraction/**` (LLM proposes
candidates) and `lib/onboarding/promotion.ts`/`lib/covenant-engine.ts`/
`lib/solver/**` (deterministic engines calculate and validate). The compiler
model extends this same separation to cover the full contractual ontology
below, not just the eight kinds the current `ExtractionCandidate` model
supports.

## Target ontology (design only)

The full category list from the originating task (§43): Indebtedness,
Liens, Restricted Payments, Investments, Acquisitions, Asset
Sales/Dispositions, Financial Covenants, Mandatory Prepayments,
Reporting/Information, Fundamental Changes, Affiliate Transactions,
Sale-Leasebacks, Subsidiary Designations, Guarantees/Guarantor
Requirements, Collateral/Security Obligations, Change of Control, Events of
Default, Rating/Springing Triggers, MFN/Pricing Protection,
Amendment/Waiver/Consent Mechanics, and qualitative affirmative/negative
covenants generally.

Rule behavior taxonomy (§44): `QUANTITATIVE_PERMISSION`,
`QUANTITATIVE_RESTRICTION`, `RATIO_TEST`, `PROHIBITION`, `EVENT_TRIGGER`,
`REPORTING_OBLIGATION`, `NOTICE_OBLIGATION`, `MANDATORY_ACTION`,
`CONDITIONAL_ACTIVATION`, `CONSENT_REQUIREMENT`, `QUALITATIVE_OBLIGATION`,
`DEFINITION`, `CALCULATION_RULE`, `EXCEPTION`, `RECLASSIFICATION_RULE` —
each tagged `EXECUTABLE` / `EVENT_DRIVEN` / `MONITORABLE` /
`JUDGMENT_REQUIRED` / `UNSUPPORTED`.

**[Phase B: DONE at the representation level.]** `CovenantFamily` (28
members), `ContractRuleType` (17 members), and `RuleEvaluationClass` (5
members) are real Postgres enums on a real `ContractRule` table — see
`docs/contract-model-foundation-phase-b.md` §B/§C. `ExtractionCandidateKind`
itself was NOT grown or replaced; `ContractRule` is a new, parallel model
Phase C will populate directly (via the `CandidateContractRule` schema in
`lib/contract-model/types.ts`), not a mutation of the existing candidate
pipeline.

## Target graphs (design only)

- **Document structure graph**: Document → Article → Section → Subsection →
  Clause → Proviso → Exception → Schedule/Exhibit, each with an exact
  source range. The current `DocumentChunk` model is flatter (chunk +
  page/article/section/heading fields) and would need a real hierarchical
  structure table.
- **Document relationship graph**: `AMENDS`, `RESTATES`, `SUPPLEMENTS`,
  `SUPERSEDES`, `GOVERNS`, `GUARANTEES`, `SECURES`, `SUBORDINATES`,
  `INTERCREDITOR_WITH`, `INCORPORATES_BY_REFERENCE`. The existing
  `DOCUMENT_RELATIONSHIP` candidate kind covers only a narrow subset
  (supersedes/amends via `Document.type`/`supersedesDocumentId`).
- **Defined-term graph**: first-class term nodes with explicit dependency
  edges to other definitions, sections, schedules, GAAP concepts, financial
  inputs, and other documents. The current `DEFINED_TERM` candidate kind
  stores a term + definition text with no dependency graph.
- **Cross-reference graph**: resolving "subject to Section 6.02," "except
  pursuant to clause (b)(iii)," etc. into real edges. Not modeled today.

**[Phase B: all four graphs above exist at the representation level.]**
`DocumentNode` (real self-referencing tree), `DocumentRelationshipEdge` (15
relationship types), `DefinedTermNode` + `DefinedTermDependencyEdge` (9
dependency types, cycle-safe traversal), and `ContractReferenceEdge` (15
reference types, unresolved-reference-aware) are real tables with real
tests against fixtures matching every example in this section — see
`docs/contract-model-foundation-phase-b.md` §F/§H/§K/§L. `DocumentChunk`
was NOT altered; `DocumentNode` is additive and separate.

## Target compilation pipeline (design only)

Raw document → structural parsing → document/clause graph → defined-term
inventory → covenant inventory → structured rule extraction → dependency
resolution → relationship extraction → amendment/version resolution →
adversarial verification → deterministic validation → coverage analysis →
proposed contractual model → exception review → active contractual state.

The current pipeline (`lib/extraction/run-stage.ts`'s six stages —
`STRUCTURE`, `DEFINITIONS`, `PERMISSIONS`, `RELATIONSHIPS`, `COVERAGE`,
`FINANCIAL_INPUTS`) is a real, working, much smaller instance of this same
staged-compilation philosophy — proof the approach works end-to-end
against real documents (see `tests/connectors/edgar-full-ingestion.test.ts`
against live SEC filings), not a reason to assume the fuller pipeline above
is a small extension of it. Several of the stages above (adversarial
verification, coverage analysis as a distinct pass, amendment/version
resolution as a general mechanism rather than the current
`Document.type: AMENDMENT` + `supersedesDocumentId` pointer) do not exist.

**[Phase B: the amendment/version model (one of the pipeline's later
stages) now exists at the representation level; the LLM-driven stages
before it (structural parsing, rule extraction, dependency/relationship
resolution) do not.]** `AmendmentEffect` (12 effect types) plus
`getOperativeContractualState`'s `effectiveFrom`/`effectiveTo`-based
resolution answer "what governs as of this date" for a REAL, hand-built
Base → Amendment 1 → Amendment 2 chain (`docs/contract-model-foundation-phase-b.md`
§I/§J) - representation only, still no autonomous amendment detection/
parsing. Adversarial verification and coverage-as-a-distinct-pass are
still entirely unbuilt; see the next two sections.

## Deterministic validation rules (design only, §58)

Citation existence, definition/section existence, formula operand
resolution, effective-date coherence, relationship targets being real
nodes, amendment precedence coherence, OR-not-represented-as-AND, no
double-counted shared capacity, lien authority not silently implying debt
authority, unsecured authority not silently implying secured authority,
missing dependencies blocking confident execution. Some of these
(double-counting via `SharedCapacityConstraint`, lien-vs-debt-authority
distinction) already have real analogues in `lib/solver/**`'s existing
election/coverage logic for the two hand-modeled companies; none are
general, LLM-output-validating rules yet.

**[Phase B: a first, purely structural layer of this now exists.]**
`lib/contract-model/validators.ts` checks rule/reference/relationship
target existence, effective-period well-formedness, stable-key uniqueness,
and unbounded-cycle detection — the graph-integrity half of this list.
None of the CONTENT-semantic checks (OR-not-represented-as-AND, lien
authority not implying debt authority, missing dependencies blocking
confident execution) are implemented — those require actually
understanding what a rule says, which is Phase C's adversarial-verification
stage, not Phase B's structural one.

## Coverage engine (design only, §60)

Per-covenant-family coverage states (`FULLY_MODELED`, `PARTIALLY_MODELED`,
`REVIEW_REQUIRED`, `UNSUPPORTED`, `NOT_APPLICABLE`, `NOT_TESTED`) plus
numeric coverage percentages, dependency-aware. `SolverCoverageDeclaration`
exists in the schema today as a much narrower, per-provision coverage
record for the solver-native model; it is not this general engine.

**[Phase B: the DATA STRUCTURE exists (`ContractCoverageRecord`,
`docs/contract-model-foundation-phase-b.md` §45/§Q), the ENGINE that would
populate it automatically does not.]** All six status values are
representable at document/covenant-family/rule granularity, proven with
manually-constructed fixture rows only — no coverage-analysis logic runs
yet.

## Evaluation harness (design only, §66–§70)

Per-covenant-family precision/recall/F1, citation/threshold/formula
accuracy, defined-term and cross-reference resolution accuracy,
relationship accuracy, amendment/version accuracy, executable-answer
accuracy, false-positive/false-negative rates, review-required rate, and —
explicitly the most safety-critical metric — the false-affirmative rate
(Headroom confidently says PERMITTED/CLEAR/$X AVAILABLE when the correct
state is NOT PERMITTED/UNKNOWN/REVIEW REQUIRED). `scripts/golden-test.ts`
is today's only evaluation harness, and it grades against Coherent/Matthews'
own hand-reviewed golden question sets — real, valuable, but neither
blind/unseen (§67) nor scoped to compiler-specific metrics like citation or
cross-reference accuracy. A real evaluation harness needs its own truth
format, keyed by stable, content-derived identifiers (§68 — the exact
"golden-test replay problem" `docs/golden-harness-solver-native-grading-fix.md`
already had to fix once for the existing harness must not recur here),
covering financing packages never used to build the compiler itself.

## Phase C entry point (handoff — Phase C itself is NOT started)

Per the master task's own instruction ("if COMPLETE, do NOT begin Phase C
— instead provide a precise handoff"), this section replaces the earlier
"recommended starting slice" now that Phase B has actually built that
slice's foundation. Phase C's multi-pass compiler should:

1. **Structural pass** — parse a real document into `DocumentNode` rows
   (deterministic where possible, LLM-assisted where article/section
   boundaries are ambiguous), using `computeStableKey` from
   `lib/contract-model/stable-keys.ts` for every node's `stableKey`.
2. **Defined-term pass** — emit `CandidateDefinedTerm` objects (schema in
   `lib/contract-model/types.ts`), map them into `DefinedTermNode` rows,
   then a **dependency pass** emitting `DefinedTermDependencyEdge` rows via
   `DefinitionDependencyType`.
3. **Rule extraction pass** — emit `CandidateContractRule` objects per the
   schema in `lib/contract-model/types.ts` (already validates
   `covenantFamily`/`ruleType`/`evaluationClass`/`action`/`conditions`/
   `exceptions` shapes), map into `ContractRule` rows.
4. **Relationship pass** — emit `CandidateRuleRelationship` objects, map
   into `ContractRuleRelationship` rows.
5. **Amendment pass** — emit `CandidateAmendmentEffect` objects, map into
   `AmendmentEffect` rows, using `getOperativeContractualState` to verify
   the resulting operative state resolves as expected at known dates.
6. **After every pass**, run `lib/contract-model/validators.ts`'s
   `validateContractModel(companyId)` before persisting — a structural
   failure (dangling reference, cycle, duplicate stable key) should block
   promotion exactly the way `lib/onboarding/review.ts`'s existing
   candidate-review gate already blocks a malformed `ExtractionCandidate`.
7. **Adversarial verification and coverage analysis** are new stages this
   phase must design from scratch — Phase B intentionally left them
   unbuilt (see the annotated sections above).
8. **Evaluation**: extend `scripts/golden-test.ts`'s pattern with a
   compiler-specific harness, using `computeStableKey`-derived truth
   identifiers (never a raw cuid) so the golden-test replay problem
   documented in `docs/golden-harness-solver-native-grading-fix.md` cannot
   recur for the new harness. Track the false-affirmative rate (task
   §70/§AB) from the very first blind-set evaluation, not after the fact.
