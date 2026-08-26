# Headroom — Comprehensive Contract Compiler V1 (Design Specification)

**Status: NOT STARTED. This document is an architecture specification for a
future phase, not a report of implemented work.** No code in this repository
implements the ontology, graphs, compilation stages, validators, coverage
engine, or evaluation harness described below. The existing extraction
pipeline (`lib/extraction/**`, `docs/document-onboarding-pipeline-foundation.md`)
remains the current, real, working system — a single-pass-per-stage
LLM extraction into a fixed candidate ontology (`DEFINED_TERM`,
`PERMISSION`, `RELATIONSHIP`, `SHARED_CONSTRAINT`, `COLLATERAL_SCOPE`,
`ACTIVATION_CONDITION`, `DOCUMENT_RELATIONSHIP`,
`EXTERNAL_INPUT_REQUIREMENT`, `FINANCIAL_FACT`), reviewed and promoted into
Coherent/Matthews' hand-modeled `Permission`/`CovenantProvision` tables or
the generalized solver-native model. This document describes what a
"compiler" evolution of that system would look like; it does not replace it.

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
`JUDGMENT_REQUIRED` / `UNSUPPORTED`. None of these are modeled types in the
current Prisma schema; `ExtractionCandidateKind` would need to grow (or be
replaced by) a generalized rule-record type carrying this taxonomy.

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

## Coverage engine (design only, §60)

Per-covenant-family coverage states (`FULLY_MODELED`, `PARTIALLY_MODELED`,
`REVIEW_REQUIRED`, `UNSUPPORTED`, `NOT_APPLICABLE`, `NOT_TESTED`) plus
numeric coverage percentages, dependency-aware. `SolverCoverageDeclaration`
exists in the schema today as a much narrower, per-provision coverage
record for the solver-native model; it is not this general engine.

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

## Recommended starting slice

Per the master task's own phasing instruction, the compiler should not be
attempted as one pass. A safe first slice: extend `DocumentChunk`/a new
structural table to represent the real Article→Section→Subsection
hierarchy (deterministic parsing, no LLM), build the defined-term
dependency graph as a genuinely new `ExtractionCandidateKind` (or a
parallel `DefinedTermNode` table) with explicit dependency edges, and
evaluate ONLY defined-term-graph recall/accuracy against a small blind set
before extending further. This keeps each increment testable against the
false-affirmative metric from day one, rather than building the full
ontology before any of it is measured.
