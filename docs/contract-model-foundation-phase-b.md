# Headroom — Comprehensive Contract Model Foundation (Phase B)

**Status: COMPLETE.** This phase built the generalized contractual
representation (the compiler's language/IR) that a future Phase C
multi-pass LLM compiler, evaluation harness, Ask Headroom, Simulate,
Obligations, and Dashboard will consume. It does **not** build the
compiler pipeline itself, does not call the LLM, and does not touch
Coherent/Matthews' reviewed configuration.

## A. Goals

Represent, for any financing package, without company-specific production
logic: what a rule is, where it comes from, what it depends on, when it
applies, what it modifies, what other rules it interacts with, whether it
is executable, what inputs it needs, and what remains uncertain (task §2).
Extension of the existing solver-native ontology, never a rewrite (task
§3) — every existing table, enum, and engine is untouched.

## B. Covenant family ontology

`CovenantFamily` (Postgres enum, `prisma/schema.prisma`) — 28 members
exactly matching task §4: `INDEBTEDNESS`, `LIENS`, `RESTRICTED_PAYMENTS`,
`INVESTMENTS`, `ACQUISITIONS`, `ASSET_SALES`, `DISPOSITIONS`,
`SALE_LEASEBACKS`, `FINANCIAL_COVENANTS`, `MANDATORY_PREPAYMENTS`,
`REPORTING_INFORMATION`, `FUNDAMENTAL_CHANGES`, `AFFILIATE_TRANSACTIONS`,
`GUARANTEES`, `GUARANTOR_REQUIREMENTS`, `COLLATERAL_SECURITY`,
`CHANGE_OF_CONTROL`, `EVENTS_OF_DEFAULT`, `RATING_TRIGGERS`,
`SPRINGING_COVENANTS`, `MFN_PRICING_PROTECTION`,
`SUBSIDIARY_DESIGNATIONS`, `ENTITY_SCOPE_RESTRICTIONS`,
`AMENDMENT_WAIVER_CONSENT`, `NOTICE_REQUIREMENTS`,
`QUALITATIVE_AFFIRMATIVE_COVENANTS`, `QUALITATIVE_NEGATIVE_COVENANTS`,
`DEFINITIONS_CALCULATION_RULES`. No family is assumed mechanically
solvable — `tests/contract-model/broad-covenant-fixture.test.ts` proves an
`AFFILIATE_TRANSACTIONS` rule stays `JUDGMENT_REQUIRED`, never a fabricated
`EXECUTABLE`.

## C. Rule behavior taxonomy

`ContractRuleType` (17 members, task §5) and `RuleEvaluationClass`
(`EXECUTABLE | EVENT_DRIVEN | MONITORABLE | JUDGMENT_REQUIRED |
UNSUPPORTED`) are separate Postgres enums on `ContractRule`, orthogonal to
each other and to `CovenantFamily` — a `RATIO_TEST` can be the permission
gate for one covenant family and a standalone obligation for another. A
new `ContractRulePosture` enum (`PERMISSION | PROHIBITION | OBLIGATION |
N_A`) captures the rule's basic posture, since `ContractRuleType` alone
does not (task §6's own field list implies this distinction).

## D. Action ontology

`lib/contract-model/types.ts`'s `CONTRACT_ACTIONS` — a TS union + zod
schema, not a Postgres enum, deliberately: task §7 says "make this
extensible," and the codebase's own established pattern for
must-stay-extensible taxonomies (e.g. `lib/connectors/units.ts`'s
`FinancialUnit`) is a validated string, not a migration-gated enum. Every
action verb from task §7 is present, plus `OTHER` as a safe fallback so a
future extractor never hard-fails against this schema pending a code
change. `ContractRule.action` is a plain validated `String` column for the
same reason.

## E. Entity/subject scope

Reuses the existing `EntityClassTag` enum and `EntityClassMember` table
exactly as `Permission.entityScope` already does — no new entity-scope-only
model. `EntityClassTag` gained four additive values (`PARENT`,
`LOAN_PARTY`, `MATERIAL_SUBSIDIARY`, `ANY_SUBSIDIARY`) for covenant
families the solver never needed to scope by; the solver's own
`lib/solver/types.ts` `EntityClass` TS union was widened to match (a pure
type change — no Permission row is ever written with one of the four new
values, so solver behavior is unchanged; see that file's own comment).
`ContractRule.entityScope`/`entityScopeExcluded` (`EntityClassTag[]` each)
represent included/excluded scopes on the same rule. Customer tenancy
(`Company.tenantKind`) and legal-entity scope (`EntityClassTag`) are
deliberately two separate, uncorrelated concepts — task §8's own explicit
warning against conflating them.

## F. Document structure graph

New `DocumentNode` model: a real self-referencing tree (`parentId`) with
`nodeType` (`ARTICLE | SECTION | SUBSECTION | CLAUSE | SUBCLAUSE | PROVISO
| EXCEPTION | SCHEDULE | EXHIBIT`), `heading`, `sectionRef`, sibling
`ordinal`, `charStart`/`charEnd`/`page`, and its own `effectiveFrom`/
`effectiveTo`. Deliberately separate from `DocumentChunk` (untouched) —
`DocumentChunk` remains the extraction pipeline's own LLM-processing-window
unit; `DocumentNode` is the logical, citable hierarchy a `ContractRule`
points back to. `lib/contract-model/service.ts`'s `getDocumentGraph`
assembles the full tree from one flat query (no N+1 per-level fetch, task
§50), proven in `tests/contract-model/service-api.test.ts`.

## G. Stable source identity

Every Phase B model's `stableKey` is a plain, caller-supplied `String`,
`@@unique([companyId, stableKey])`, never server-generated from the row's
own `id` — the exact same convention `Permission.code`/
`CovenantProvision.code` already established in this schema (task §33
compatibility). `lib/contract-model/stable-keys.ts`'s `computeStableKey`
is the one deterministic helper for deriving one from content (sha256 of a
tag plus parts, joined with a separator no realistic input can contain),
mirroring `lib/connectors/dedup.ts`'s `computeContentHash` pattern exactly
rather than inventing a second hashing convention.

## H. Document relationships

New `DocumentRelationshipEdge` model — 15 relationship types (task §11:
`AMENDS`, `RESTATES`, `SUPPLEMENTS`, `SUPERSEDES`,
`INCORPORATES_BY_REFERENCE`, `GOVERNS`, `SECURES`, `GUARANTEES`,
`SUBORDINATES`, `INTERCREDITOR_WITH`, `MODIFIES_COLLATERAL`,
`MODIFIES_GUARANTOR_STRUCTURE`, `REPLACES_SECTION`, `ADDS_SECTION`,
`DELETES_SECTION`), each with `effectiveDate`, `sourceCitation`,
`scopeNote`, `confidence`, `reviewStatus`. Deliberately separate from
`Document.supersedesDocumentId`/`effectiveFrom`/`effectiveTo`, which remain
the ONE mechanism the legacy engine's `loadCompanyCovenantData` reads for
amendment precedence — this table is the general-purpose graph for every
other document relationship the legacy engine never needed (`GUARANTEES`,
`SECURES`, `INTERCREDITOR_WITH`, etc). Proven in
`tests/contract-model/cross-document-graph.test.ts` and
`amendment-and-versioning.test.ts`.

## I. Operative version model

`lib/contract-model/service.ts`'s `getOperativeContractualState(companyId,
asOfDate)` resolves "what governs as of this date" purely from each
`ContractRule`/`DefinedTermNode`'s own `effectiveFrom`/`effectiveTo` window
— the exact same mechanism `Document.effectiveFrom`/`effectiveTo` already
uses for the legacy engine. Superseding a rule means setting the OLD rule's
`effectiveTo` to the NEW rule's `effectiveFrom`; `ContractRule.supersededByRuleId`
is informational provenance only, never consulted by the operative filter —
this was deliberately verified with a real historical-query test
(`amendment-and-versioning.test.ts`'s "operative-as-of-date BEFORE Amendment
1" case) after an earlier draft of this filter incorrectly also excluded
any rule with a successor regardless of date, which would have broken
historical queries entirely.

## J. Amendment effects

New `AmendmentEffect` model — 12 effect types (task §13), each pointing at
a target rule/term/document-node, with `oldValueSnapshot`/
`newValueSnapshot` JSON and a source citation. Representation only, no
autonomous amendment parsing this phase (task §13's own scope limit).
`tests/contract-model/amendment-and-versioning.test.ts`'s fixture applies
all four of `MODIFY_THRESHOLD`, `MODIFY_DEFINITION`, `ADD_EXCEPTION`, and
`REMOVE_COVENANT` across a real Base → Amendment 1 → Amendment 2 chain, and
proves the resulting operative state is correct at three different as-of
dates.

## K. Defined-term dependency graph

New `DefinedTermNode` (first-class term node, never a plain string) and
`DefinedTermDependencyEdge` (9 dependency types, task §16). A CHECK
constraint (`defined_term_dependency_edges_exactly_one_target`) enforces
that exactly one of `toTermId`/`toSectionRef`/`toFinancialInputKey` is set
per edge — a dependency edge is never ambiguous about what it points at.
`getDefinedTermDependencies` performs a bounded (max depth 25),
cycle-detecting BFS; `tests/contract-model/defined-term-graph.test.ts`
proves the full nested Ratio → EBITDA → Adjusted EBITDA → Net Income →
Addbacks → Cap → Pro Forma Adjustment chain traverses correctly, that a
deliberate two-term cycle is detected rather than looping forever, and that
an unresolved (dangling) `USES_SECTION` dependency is representable without
breaking traversal.

## L. Cross-reference model

New `ContractReferenceEdge` — 15 reference types (task §18), a
`ContractReferenceTargetType` discriminant (`RULE | SECTION | DEFINED_TERM |
DOCUMENT | UNRESOLVED`), and a second CHECK constraint
(`contract_reference_edges_target_matches_type`) enforcing the discriminant
agrees with which polymorphic target column is actually set. An
unresolved reference is a first-class row (`targetType: UNRESOLVED,
resolved: false`) carrying `unresolvedReason`/`impact`/`reviewStatus` — task
§19's own "not just a string" requirement — surfaced by
`getUnresolvedReferences`, never silently dropped.

## M. Rule relationships (and dependencies — see design decision below)

New `ContractRuleRelationship` and a new `ContractRuleRelationshipType`
enum (18 members, task §21) that unifies and extends the existing
`StackingRelationshipType` (untouched) — see §U below for the exact
value-by-value mapping. **Design decision:** task §20 ("general rule
dependency graph") and task §21 ("relationship taxonomy") describe
overlapping concepts — "debt permission requires a leverage test" is a
dependency in §20's framing and a `REQUIRES`-typed relationship in §21's.
Rather than introduce a second, near-duplicate edge table for the same
semantic (which would immediately raise "which table is authoritative"),
Phase B uses ONE edge table (`ContractRuleRelationship`) for both — every
§20 dependency example is representable as a relationship of the
appropriate §21 type (`REQUIRES`, `LIMITED_BY`, `SHARES_CAPACITY_WITH`,
etc). `getRuleDependencies` performs the same bounded, cycle-safe BFS as
the defined-term graph, proven separately for rules in
`tests/contract-model/service-api.test.ts`.

## N. Conditions / exceptions

`ContractRule.conditions`/`exceptions` are validated JSON arrays (task §6's
own "structured fields + validated JSON where appropriate" — a rule's
condition list is read as a whole, never queried across rules by an
individual condition's own fields, so relational storage adds nothing).
`lib/contract-model/types.ts`'s `ContractConditionSchema` validates against
the 15-member `ContractConditionType` (task §22), including an explicit
`UNSUPPORTED` member so an unrecognized condition type fails closed rather
than being silently dropped — task §22's own "preserve current fail-closed
behavior."

## O. Calculation representation

`lib/contract-model/types.ts`'s `CALCULATION_RULE_KINDS` — 14 members
covering every concept in task §23 (fixed amount, greater-of, builder
basket, cash sweep, borrowing base, etc), stored as a validated string on
`ContractRule.formulaRef`. Representability only — no evaluator for any of
these is implemented this phase, matching task §23's own "representability
first" instruction.

## P. Event/obligation foundation

New `ContractEventObligation` model: `eventType`, `conditionDescription`,
`deadlineKind` (`DAYS_AFTER_EVENT | FIXED_DATE | PERIODIC`, a validated
string, not an enum, since this is scaffolding for a future obligations
engine this phase deliberately does not build — task §25's own scope
limit), `deadlineDays`/`deadlineDate`, `requiredAction`, and
`satisfactionState` (`PENDING | SATISFIED | OVERDUE | WAIVED |
NOT_APPLICABLE`). `tests/contract-model/event-obligation.test.ts` proves
both fixture examples from task §42 (90-day post-fiscal-year-end financial
statements; a 365-day asset-sale reinvestment period triggering a
mandatory prepayment) and that satisfaction state is representable across
its lifecycle with no scheduling engine driving it.

## Q. ContractualState

`lib/contract-model/service.ts`'s `getOperativeContractualState` is a
computed, read-time aggregation — exactly like
`lib/company-state/canonical-state.ts`'s existing `getCanonicalCompanyState`
pattern, deliberately **not** a new persisted table (task §27's own "this
will later plug into CanonicalCompanyState — do not duplicate financial
state"). Composes operative rules, operative defined terms, the document
ids they source from, unresolved references, and per-covenant-family
coverage — nothing else, no covenant-capacity arithmetic of any kind.

## R. Provenance

Every Phase B model carries `reviewStatus` (reusing the existing
`ExtractionCandidateReviewStatus` enum — `PENDING | APPROVED | EDITED |
REJECTED | REVIEW_REQUIRED` — rather than a parallel one).
`ContractRule.extractionOrigin` (validated JSON via
`lib/contract-model/types.ts`'s `ExtractionOriginSchema`) carries
`provider`/`model`/`promptVersion`/`schemaVersion`/`candidateId` — the same
shape `ExtractionRun` already records (`lib/extraction/get-provider.ts`) —
and, per task §28, never chain-of-thought.

## S. Tenant isolation

Every new model carries `companyId`, cascade-deleted with its `Company` row
exactly like every existing model. `lib/contract-model/validators.ts`'s
`validateTenantIsolation(companyIdA, companyIdB)` proves no
`ContractReferenceEdge`/`ContractRuleRelationship` in company A's graph
targets company B's rules, and asserts every row a company-scoped query
returns actually carries that company's id (a sanity check on Prisma's own
filter, not just an assumption it works).
`tests/contract-model/tenant-isolation.test.ts` proves both the passing
case AND that the validator actually catches a deliberately-introduced
cross-tenant reference — not a vacuous "returns ok" test.

## T. Stable-key / replay safety

`tests/contract-model/stable-keys-and-replay.test.ts` proves, with a real
delete-and-recreate cycle against the local database: (1) the same content
inputs always produce the same `stableKey` across a fresh replay even
though Prisma generates a brand-new `id` every time: (2) mutating
`reviewStatus`/`coverageStatus` never changes `stableKey` or `id`; (3) a
different section reference (a genuinely different provision) DOES produce
a different `stableKey`; (4) the database's own `@@unique` constraint
rejects a duplicate `stableKey` rather than silently overwriting; (5) two
different companies' keys never collide. This is the exact discipline
`docs/golden-harness-solver-native-grading-fix.md` already established for
golden-test truth identifiers, applied to Phase B's own graph.

## U. Compatibility with the existing Permission model

`lib/contract-model/compatibility.ts` is a **read-time adapter**, not a
data migration — zero Permission/PermissionRelationship rows for Coherent
or Matthews were read, written, or altered by any Phase B migration
(`tests/contract-model/compatibility.test.ts` asserts a `ContractRule` row
count of exactly 0 for `companyId: "coherent"`, and that Coherent's
Permission rows are byte-for-byte identical before and after being
projected). The mapping:

| Existing (untouched) | Projects to (Phase B) |
| --- | --- |
| `Permission` | `ContractRule`, `ruleType: QUANTITATIVE_PERMISSION`, `evaluationClass: EXECUTABLE`, `posture: PERMISSION` |
| `Permission.grantType: DEBT_INCURRENCE` | `covenantFamily: INDEBTEDNESS` |
| `Permission.grantType: LIEN` | `covenantFamily: LIENS` |
| `Permission.modelingStatus: MODELED` | `coverageStatus: FULLY_MODELED` |
| `Permission.modelingStatus: KNOWN_NOT_MODELED` | `coverageStatus: REVIEW_REQUIRED` |
| `PermissionRelationship` | `ContractRuleRelationship` |
| `StackingRelationshipType.CONCURRENT_DISREGARDED` | `ContractRuleRelationshipType.CONCURRENT_DISREGARDED` |
| `StackingRelationshipType.CONCURRENT_COUNTED` | `CONCURRENT_COUNTED` |
| `StackingRelationshipType.ALTERNATIVE` | `ALTERNATIVE_TO` |
| `StackingRelationshipType.MUTUALLY_EXCLUSIVE` | `EXCLUDED_FROM` |
| `StackingRelationshipType.AUTOMATIC_LINKED_PERMISSION` | `AUTOMATIC_LINKED_PERMISSION` |
| `StackingRelationshipType.EQUAL_AND_RATABLE_PULLUP` | `ACTIVATES` |
| `StackingRelationshipType.PARAMETER_ADJUSTMENT_TRIGGER` | `PARAMETER_ADJUSTMENT_TRIGGER` |
| `StackingRelationshipType.SHARED_CONSTRAINT_PARTICIPATION` | `SHARES_CAPACITY_WITH` |
| `StackingRelationshipType.UNKNOWN` | `REQUIRES` (no more-specific projection exists — stays exactly as ambiguous as the original) |
| `RuleActivationCondition.predicateKind` | `ContractConditionType` via `statePredicateKindToConditionType` |
| `CollateralPool`/`IntercreditorAgreement` | Not projected this phase — left as-is; a future phase can add a `ContractRule`-side collateral/priority representation without altering either table |
| `SolverCoverageDeclaration` | Untouched — narrower and solver-specific; `ContractCoverageRecord` is the new, general-purpose coverage table |

## V. Fixture results

All six required fixtures (task §36–§42) pass:

- **Fixture A (broad covenant package)** — `broad-covenant-fixture.test.ts`, 4 tests, 10 covenant families represented with zero company-specific code.
- **Nested definitions** — `defined-term-graph.test.ts`, 4 tests.
- **Cross-reference** — `cross-reference-graph.test.ts`, 6 tests.
- **Amendment** — `amendment-and-versioning.test.ts`, 6 tests.
- **Cross-document** — `cross-document-graph.test.ts`, 4 tests.
- **Entity scope** — `entity-scope.test.ts`, 5 tests.
- **Event/obligation** — `event-obligation.test.ts`, 4 tests.

Plus stable-key/replay (6 tests), tenant isolation (4 tests), validators (6
tests), service API (6 tests), and compatibility (6 tests) — 61 new tests
total, all real assertions against real database rows, none vacuous.

## W. Validation results

`lib/contract-model/validators.ts` implements 7 deterministic structural
validators (task §47): rule sources exist, defined-term targets exist,
reference targets exist (only for resolved references — an unresolved one
is the correct, expected state, not a failure), relationship targets agree
on company, effective periods are not internally inverted, stable keys are
unique, and no dependency traversal silently hits its bound. Each is
proven both to pass on a well-formed graph and to actually catch the
specific defect it claims to catch.

## X. Migration / deployment

One additive migration,
`prisma/migrations/20260826050000_add_contract_model_foundation`: 19 new
enums, one enum extended (`EntityClassTag` +4 values), 11 new tables, 2
CHECK constraints. Zero `DROP`/`ALTER COLUMN TYPE`/data-destructive
statements. Applied locally via `prisma migrate deploy`; hosted-Neon
application and the deployed Vercel SHA are reported in the final report
delivered alongside this document.

## Y. Known gaps for Phase C

1. **No LLM extraction into any Phase B table yet** — every row in every
   test fixture above was created directly via Prisma, by design (task §53
   — Phase B must not depend on Gateway billing). Phase C's job is teaching
   a real compiler to emit `CandidateContractRule`/`CandidateDefinedTerm`/
   `CandidateContractReference`/`CandidateRuleRelationship`/
   `CandidateAmendmentEffect` (`lib/contract-model/types.ts`) and map them
   into these tables.
2. **No adversarial/semantic verification** — `lib/contract-model/validators.ts`
   is purely structural (graph well-formedness), never "is this
   interpretation correct." That is explicitly Phase C's job (task §56).
3. **Coverage is manually populated only** — `ContractCoverageRecord` has
   no automatic population logic yet; Phase C's coverage-analysis stage is
   what would write these rows for real.
4. **No obligations engine** — `ContractEventObligation` is representation
   only; nothing computes deadlines, sends notices, or transitions
   `satisfactionState` automatically.
5. **`CollateralPool`/`IntercreditorAgreement` are not yet projected** into
   the compatibility mapping (§U) — deferred, not forgotten.
6. **`/admin`'s token gate (task §31) is a stopgap**, not real
   authentication — see the final report's own admin-safety section.
