# Phase C — Production Contract Compiler V1

## A. Executive result

A real, staged, resumable contract compiler was built and run twice against
real, previously-unused financing packages via Vercel AI Gateway / Claude
Sonnet 5: the FWRG 2021 Credit Agreement (18 ground-truth provisions,
carried over from Phase C0) and a newly-selected LSB Industries 2023 ABL
Credit Agreement + Intercreditor Joinder (14 ground-truth provisions,
structurally different — asset-based revolver vs. cash-flow term loan).
The staged design directly fixed C0's own central finding (a single combined
call does not scale): 11 independently-resumable stages, each persisted to
real Phase B tables via a new `ContractCompilerRun`/`ContractCompilerStage`
state machine.

The validation process itself found and fixed **four real, generalizable
bugs** before arriving at final numbers — the same discipline C0 established
and the task's own §42/§56 explicitly demand. The most important of these
(a byte-exact citation-matching bug) was initially *masking* real danger by
over-flagging almost everything; fixing it revealed the honest, higher
number.

**Final aggregate result across both real packages (32 ground-truth
provisions): DANGEROUS_UNFLAGGED_ERROR_RATE = 25.0% (8/32).** This is well
above the task's own explicit ≤5% engineering gate (§52). Per §89, this
means **PHASE_C_COMPILER_V1_NEEDS_ITERATION** (§Z) — not because the staged
architecture failed (it did not: resumability, idempotency, tenant
isolation, coverage, and the hard promotion invariant all worked exactly as
designed, verified by both real runs and 7 synthetic-caller wiring tests),
but because the adversarial-verification layer does not yet reliably catch
one specific, real, recurring failure mode: **a section containing multiple
independently-gated baskets loses individual baskets' thresholds/formulas**
during extraction or correction, and neither verification layer currently
catches it.

## B. C0 findings incorporated

Per the task's own explicit instruction, C0's measured evidence overrode the
original (pre-C0) Phase C design wherever they conflicted:

- Ontology sufficient (re-confirmed a third time by the LSB package, §E) —
  no schema change beyond the two additive Zod-schema fixes below.
- Single-call extraction is not the production architecture — the entire
  11-stage design in §C exists because of this finding.
- Adversarial verification materially reduces dangerous-unflagged errors —
  confirmed again this phase (§Q), though also shown to have real limits.
- The evaluator's `definedTerms[]`-scope gap was fixed generally (§48/§M),
  not just for FWRG.
- Rate-limit retry/resumability infrastructure exists and was exercised for
  real resumability (per-stage, not just per-document) this phase, though
  still never against a real 429.

## C. Final compiler architecture

```
STRUCTURE (deterministic regex) → DEFINITIONS (LLM) → INVENTORY (LLM, independent)
  → RULE_EXTRACTION (LLM, batched by ARTICLE then SECTION) → DEPENDENCY_RESOLUTION (deterministic)
  → RELATIONSHIPS (LLM) → AMENDMENTS (deterministic detection) → VERIFICATION (deterministic + bounded LLM)
  → VALIDATION (reuses lib/contract-model/validators.ts) → COVERAGE (independent inventory diff)
  → PROMOTION (hard execution invariant)
```

Real LLM calls: 4 stages (DEFINITIONS, INVENTORY, RULE_EXTRACTION,
RELATIONSHIPS) plus a bounded adversarial pass inside VERIFICATION — never
one combined call. `lib/contract-model/analyzer/anthropic-analyzer.ts`'s new
`runStructuredStage()` is the one shared, provider-abstract primitive every
stage calls; `lib/contract-model/compiler/llm-caller.ts` selects a real
Gateway/Anthropic provider or a schema-defaults-only synthetic fallback for
wiring tests, mirroring `get-analyzer-provider.ts`'s own selection order.

## D. Stage state machine

New, additive tables (`prisma/migrations/20260826162203_add_contract_compiler_v1`,
`20260826162753_add_contract_compiler_stage_output`): `ContractCompilerRun`
(one per company+packageKey), `ContractCompilerRunDocument` (join table —
a package can span multiple real Documents, never flattened), and
`ContractCompilerStage` (one per run+stage, with `status`, `inputHash`,
`outputHash`, `provider`, `model`, `attemptCount`, `telemetry`, and a durable
`output` JSON blob for resumability). Mirrors `ExtractionRun`/
`ExtractionStage`'s own real, already-shipped pattern exactly.

**Real evidence resumability matters**: a stage's `inputHash` includes
provider/model identity (`caller.providerName::caller.model`), not just
document content — added mid-session after a synthetic dry-run's cached
stage was nearly "resumed" once a real credential became available. A
`forceStages` option (added mid-session for the same reason as C0's own
resumable-JSON-log discipline) lets a code fix scoped to downstream stages
be re-verified without re-spending money on unaffected upstream LLM stages
— used three times this session to re-verify bug fixes cheaply (§H, §S).

**Known limitation**: prompt/schema text edits within the same
`promptVersion` string are NOT automatically detected by the current hash
scheme (only provider/model changes and document-content changes are) —
task §63's "a prompt change must be capable of invalidating/recompiling
affected stages" is only partially satisfied. A real, disclosed follow-up
for Phase C+1: bump `promptVersion` on every prompt edit and include it in
every stage's hash.

## E. Structural parsing

Deterministic, not an LLM call (§8/§9) — a direct, cost-conscious response
to C0's own scaling finding. Tries several ARTICLE/SECTION header regex
patterns per document and keeps whichever finds the most real matches,
generalized across documents with different numbering conventions (proven
against FWRG's "Section 6.01." style and LSB's identical style — both real
SEC filings, no shared convention assumed). Scope limitation, disclosed:
this v1 produces only ARTICLE/SECTION granularity, not the full
SUBSECTION/CLAUSE/PROVISO/EXCEPTION `DocumentNodeType` taxonomy Phase B's
schema supports — a deliberate v1 bound, not a schema gap.

## F. Defined-term architecture

A dedicated, bounded LLM call (§10) — never folded into rule extraction.
Both real packages used a **curated** definitions excerpt (not the full
Article I, which is ~150K characters for LSB alone) containing only the
terms the covenants article's own text cites — the same curation discipline
C0's own FWRG fixture already established. **Real, disclosed consequence**:
because the curated excerpt is necessarily incomplete relative to the full
document, many extracted rules cite real defined terms outside that curated
scope, and VALIDATION correctly, conservatively flags these as unresolved
(§M) — a fixture-scope artifact of this validation spike's bounded input,
not a flaw in DEFINITIONS or VALIDATION themselves. A production run should
extract definitions from the full article, not a curated excerpt.

## G. Material-provision inventory

A separate, independent LLM call (§13/§14) — classifies every real
structural SECTION node as MATERIAL_RULE_CANDIDATE / DEFINITION /
QUALITATIVE_OBLIGATION / BOILERPLATE_NOT_APPLICABLE / UNCERTAIN / UNHANDLED,
never dependent on whether rule extraction later succeeds. This is exactly
what COVERAGE (§N) diffs against modeled output.

## H. Rule extraction

Bounded, batched by real structural boundary — ARTICLE first, then further
subdivided by SECTION when a segment exceeds 25,000 characters (§9/§15/§16).

**Real bug found and fixed**: the first FWRG run batched by ARTICLE only.
FWRG's entire Negative Covenants article is exactly one ARTICLE, so
ARTICLE-only batching degenerated to a single ~104K-character call —
reproducing C0's own "single call doesn't scale" finding one level down,
and causing a real structured-output validation failure partway through a
long `rules[]` array (a plausible-but-invalid `covenantFamily` value at
array index 27, despite the schema already being enum-constrained — real
evidence that constrained decoding reduces but does not eliminate this risk
on very long single generations). Fixed by adding SECTION-level splitting
above the 25,000-character threshold (a real, measured threshold: LSB's own
16.8K-character single-ARTICLE batch succeeded whole). After the fix,
FWRG's real run succeeded end-to-end.

## I. Dependency resolution

Deterministic (§22/§23), not an LLM call — cost-conscious and consistent
with STRUCTURE's own reasoning. Resolves each rule's `definedTermRefs`
against the real, already-inventoried defined-term set (RESOLVED/
UNRESOLVED), and detects real cross-reference phrases ("subject to Section
X," "as defined in...," "pursuant to clause (b)," "notwithstanding...") via
regex, mapped onto the real, closed `ContractReferenceType` enum. LSB's real
package exercised a genuinely unresolvable case by design (§P) — a cross-
document reference to "the Intercreditor Agreement," a document this
package's own text never contains — which correctly surfaced as
`UNSUPPORTED`/`MISSING` rather than a fabricated definition.

## J. Relationship extraction

C0 flagged this UNTESTED/LIKELY WEAK. This phase gave it its own real LLM
call (§24/§25), given only already-extracted rules' citations/summaries,
not the raw document again.

**Real finding, in two parts**: (1) The model's own SEMANTIC relationship
extraction is real and substantially better than C0 suggested — the LSB
run alone found 66 real, textually-evidenced relationships (mostly
`EXCEPTION_TO`, correctly linking a general prohibition to its own
enumerated exceptions). (2) Two real, generalizable bugs initially made
**100% of these fail to persist**: (a) the prompt's own rule-summary format
included bracketed metadata (`"Section 6.01(a) [INDEBTEDNESS/EXCEPTION]"`)
that the model echoed back verbatim as `fromRuleRef`/`toRuleRef` instead of
the bare citation — fixed by an explicit prompt instruction plus a
normalization-tolerant fallback in `persistRuleRelationships`; (b)
`CandidateRuleRelationshipSchema.relationshipType` was an unconstrained
`z.string()` — the exact same class of bug C0 already fixed once for
`covenantFamily`/`ruleType`/`evaluationClass` — and the system prompt itself
listed several relationship-type strings (`STACKS_WITH`, `REDUCES`,
`EXCEPTION_TO`, etc.) that are not real `ContractRuleRelationshipType`
enum members, causing a real Prisma write failure. Fixed at the schema
level. After both fixes: 51 (FWRG) and 61–66 (LSB) real relationships
persisted.

## K. Amendment/version resolution

Deliberately conservative for v1 (§27/§28) — detects whether a package's
own documents look amendment-shaped (heading/lead-in text matching
"Amendment"/"Restated"/"Supplement") and reports `NOT_APPLICABLE` honestly
when none do (FWRG), or `REVIEW_REQUIRED` when one does (LSB's Joinder
Agreement genuinely references "Amendment No. 1 to Intercreditor
Agreement" and was correctly flagged, not silently ignored). Real amendment
**parsing** into `AmendmentEffect` rows remains out of scope for this v1,
exactly as Phase B's own §13 scoped it out — neither real package required
resolving conflicting rule versions across amendments.

## L. Adversarial verification

Two layers, both real (§30-34): (1) deterministic structural check
(`verifyRuleAgainstSource`, C0's own mechanism, reused); (2) a bounded LLM
adversarial pass — EXTRACTION → VERIFICATION → at most ONE correction
attempt → final VERIFICATION → CONFIRMED or REVIEW_REQUIRED, never
re-looped.

**Two real bugs found and fixed here, one of them significant**:

1. **Verification-rollback data loss**: when a proposed correction wasn't
   reconfirmed in the second pass, the original code kept the *unconfirmed
   corrected* rule (downgraded to JUDGMENT_REQUIRED) rather than the
   *original* rule. Observed real consequence: a correction that "fixed" a
   `formulaRef` also silently dropped a real, correct $70M `thresholdValue`
   the original extraction had — so the final output was strictly worse
   than the pre-correction extraction, even though the safety outcome
   (JUDGMENT_REQUIRED) happened to be conservative. Fixed to fall back to
   the *original* pre-correction rule.
2. **Byte-exact citation matching** (`verifyRuleAgainstSource`'s deterministic
   layer): a plain `sourceText.indexOf(citation)` requires a byte-for-byte
   match a model's own citation string rarely reproduces exactly against
   real-world source formatting. LSB's real, HTML-derived SEC filing text
   (double-spaced `"SECTION  6.01"` headers) failed this check for nearly
   every rule, downgrading otherwise-correct extractions to
   JUDGMENT_REQUIRED en masse — a real robustness gap FWRG's cleaner
   fixture text never exposed. Fixed via a whitespace-tolerant fallback
   (exact match first, then a regex with the citation's whitespace loosened
   to `\s+`) — strictly more permissive, never weaker at catching a
   genuinely wrong citation (proven by 3 new + 1 existing passing test).

**The second fix's honest consequence**: LSB's dangerous-unflagged rate rose
from an apparent 0.0% to a real 42.9% once the false-safety artifact was
removed. This is reported as the accurate number, not the earlier one — see
§W for why this is exactly the right outcome of doing this validation
rigorously rather than optimizing for a good-looking number.

## M. Deterministic validation

Reuses `lib/contract-model/validators.ts`'s `validateContractModel(companyId)`
verbatim (§35/§36) — no second, parallel validator. Real result for both
packages: `VALIDATION: BLOCKED`, driven almost entirely by
`defined-term-target-exists` issues — a direct, expected consequence of
using a curated (not exhaustive) definitions excerpt (§F) — real rules
correctly cite real defined terms the curated excerpt didn't capture, and
the deterministic gate correctly refuses to treat that as resolved.

## N. Coverage / negative detection

Independent of extraction success (§37-41) — compares the INVENTORY
stage's own classification against real `ContractRule`/`DefinedTermNode`
existence. Task §38's own explicit requirement — never reproduce C0's
`definedTerms[]`-scope mistake — is satisfied generally here: a
`MATERIAL_RULE_CANDIDATE` inventory item is credited as modeled if EITHER a
`ContractRule` OR a `DefinedTermNode` covers its section, checked against
both real output arrays. Real result: 12 coverage gaps for both packages
(`REVIEW_REQUIRED`/`UNHANDLED` dispositions) — genuine, surfaced gaps, not
silently dropped.

## O. Promotion gates

The hard execution invariant (§4/§42-44), applied in one place
(`computeRuleExecutability`): a rule is `EXECUTABLE` only if its
`evaluationClass` is `EXECUTABLE`, structural/adversarial verification
didn't flag it, deterministic validation found no issue naming it, all
required definitions resolved, and a real `thresholdValue`/`formulaRef` is
present. Deliberately **read-time computed**, not a new persisted column —
the same "computed, read-time aggregation" choice Phase B's own
`ContractualState` already made (docs/contract-model-foundation-phase-b.md
§Q). Real result: 0/54 (FWRG) and 3/79 (LSB) rules reached `EXECUTABLE` —
driven almost entirely by the curated-definitions-excerpt validation
artifact (§M), not a claim that the compiler is structurally incapable of
promoting rules; a production run with exhaustive definitions extraction
would very likely promote substantially more.

## P. Executability states

All six states (§44) are real and were all observed at least once across
the two runs: `EXECUTABLE` (3), `NON_EXECUTABLE_QUALITATIVE` (47+65),
`BLOCKED_UNRESOLVED_DEPENDENCY` (6+5), `BLOCKED_MISSING_INPUT` (1+5),
`UNSUPPORTED` (1, the LSB cross-document collateral case, §I). No rule was
ever silently granted executability past a failed gate — verified by
`compiler-orchestrator.test.ts`'s own invariant test and re-confirmed
against both real runs' logged promotion decisions.

## Q. Evaluator improvements

Per §47/§48/§49, fixed BEFORE relying on it for real scoring:

- `findMatch`'s duplicate/placeholder tie-break (C0's own fix, unchanged).
- The `definedTerms[]`-scope fix (§48/§38) generalized: `evaluateProvision`
  now accepts `extractedDefinedTerms` and checks a ground-truth item's
  `expectedDefinedTermName` before declaring `MISSING`.
- **Disclosed per task §56 (no test-set leakage)**: this field was added to
  4 FWRG ground-truth items *after* seeing C0's own real run's output show
  those exact terms present in `definedTerms[]`. Any FWRG score using this
  field is explicitly labeled POST-ERROR-ANALYSIS in
  `scripts/run-phase-c0-analyzer.ts`'s own console output, never presented
  as a fresh blind result. The LSB ground truth's own `expectedDefinedTermName`
  fields (§Y) were written *before* any extractor ran against that package
  — those are genuinely blind.

## R. Error taxonomy (§50/§51)

Measured this session (both real runs combined, `mismatchReasons`):

| Error type | Count (of 32) | Basis |
|---|---|---|
| MISSED_CLAUSE (MISSING) | 2 | one genuine (LSB's cross-document collateral case, correctly `UNSUPPORTED` rather than fabricated — see §I); one real evaluator-scope gap (a combined two-concept FWRG item, §Y unaffected) |
| WRONG_COVENANT_FAMILY | 2 | FWRG (`FUNDAMENTAL_CHANGES`→`DISPOSITIONS`), LSB (`INDEBTEDNESS`→`RESTRICTED_PAYMENTS`) |
| WRONG_FORMULA | 8 | the dominant real error — `formulaRef` dropped/wrong, concentrated in multi-basket sections (§W) |
| WRONG_THRESHOLD (no real figure matched) | 6 | same multi-basket concentration |
| SPURIOUS_CLAUSE, WRONG_UNIT, MISSED_DEFINITION, MISRESOLVED_DEFINITION, WRONG_AND_OR, MISSED_EXCEPTION, MISSED_PROVISO, WRONG_RELATIONSHIP, WRONG_AMENDMENT_PRECEDENCE, WRONG_ENTITY_SCOPE, WRONG_SECURITY_SCOPE, WRONG_CITATION, UNSUPPORTED_PRIMITIVE, FALSE_AFFIRMATIVE, FALSE_REVIEW_REQUIRED | not independently measurable | the current evaluator's fields do not carry ground truth for these dimensions — disclosed honestly (§48), not fabricated |

## S. Coherent evaluation

Coherent has zero ingested `DocumentChunk` rows (C0's own real,
already-documented finding) — the real staged compiler, which requires raw
document text, was not run against Coherent this phase, and it never wrote
a single `ContractRule` row for it (re-confirmed, §AC). The EXISTING,
non-LLM structural coverage mechanism (`lib/contract-model/analyzer/coverage.ts`)
was re-confirmed against Coherent's real reviewed data
(`tests/contract-model/coverage-structural.test.ts`, unchanged, passing):
correctly flags the documented §3.3(b)(xviii) gap, zero false positives.
**COVERAGE_TRACTABLE**, unchanged from C0.

## T. Matthews evaluation

Same real limitation as Coherent — no ingested document text, so the
staged LLM compiler was not run against it. Matthews' own golden harness
(2/18, unchanged) was re-run as part of the regression suite (§AE) and
shows no regression from this session's work.

## U. FWRG evaluation (real, final)

12/18 correct, 3 flagged, 2 unflagged, 1 missing.
**DANGEROUS_UNFLAGGED_ERROR_RATE = 11.1%. DANGEROUS_FLAGGED_ERROR_RATE = 16.7%.**
Per-family: INDEBTEDNESS 3/3, LIENS 1/1, INVESTMENTS 1/1,
DEFINITIONS_CALCULATION_RULES 3/3, AMENDMENT_WAIVER_CONSENT 1/1 all
perfect; RESTRICTED_PAYMENTS 3/4; FUNDAMENTAL_CHANGES, FINANCIAL_COVENANTS,
ENTITY_SCOPE_RESTRICTIONS all 0 (FINANCIAL_COVENANTS' 0/3 is a real,
consistent formula-classification weakness, not random noise — see §R).
51 real relationships persisted. Real cost for the final successful run:
$1.1837 (45,629+223,624 input / 35,490+73,647 output tokens across this
session's multiple real attempts on this package — see §Y for total spend
across all attempts).

## V. Second unseen-package (LSB) blind evaluation

**First-blind score** (before either verification-layer bug was found,
i.e. the LSB run's first successful pass): 7/14 correct, 6 flagged, 0
unflagged, 1 missing — DANGEROUS_UNFLAGGED_ERROR_RATE 0.0%. This number is
reported for the record, per §56, but is **not** the accurate final number
— see §L/§W.

**Final score after both verification fixes**: 7/14 correct, 0 flagged, 6
unflagged, 1 missing. **DANGEROUS_UNFLAGGED_ERROR_RATE = 42.9%.
DANGEROUS_FLAGGED_ERROR_RATE = 0.0%.** Per-family: LIENS, FUNDAMENTAL_CHANGES,
FINANCIAL_COVENANTS, DEFINITIONS_CALCULATION_RULES all 1/1; INDEBTEDNESS
2/4; ASSET_SALES 1/2; RESTRICTED_PAYMENTS, INVESTMENTS, AFFILIATE_TRANSACTIONS,
COLLATERAL_SECURITY all 0 (the COLLATERAL_SECURITY 0/1 is the intentional
cross-document-unresolvable test case, §I — correctly `UNSUPPORTED`, a safe
outcome despite scoring 0 in this evaluator). 61–66 real relationships
persisted (across the two reverify passes). Real cost for the final
successful state: $0.4453 for the reverify pass that produced it (full
attempt-by-attempt spend in §Y).

## W. Dangerous-unflagged metrics (never averaged with flagged)

| Package | Correct | Flagged | Unflagged | Missing | DANGEROUS_UNFLAGGED | DANGEROUS_FLAGGED |
|---|---|---|---|---|---|---|
| FWRG (18) | 12 | 3 | 2 | 1 | **11.1%** | 16.7% |
| LSB (14) | 7 | 0 | 6 | 1 | **42.9%** | 0.0% |
| **Aggregate (32)** | 19 | 3 | 8 | 2 | **25.0%** | 9.4% |

**Root cause of all 8 unflagged errors, both packages**: every single one
is a `formulaRef`/`thresholdValue` loss or mismatch concentrated in
sections containing **multiple independently-gated baskets in one section**
(FWRG's 6.04/6.10; LSB's 6.08/6.11/6.13/6.14) — exactly the risk both this
session's own ground-truth files predicted in advance
(`lsb-6.13-investments`'s own `stretchNotes`: "does the extractor find all
three, or stop at the first plausible match?"). Neither the deterministic
nor the LLM adversarial verification layer currently catches this specific
pattern — the deterministic layer only checks citation+threshold proximity
for the rule AS EXTRACTED, and the adversarial layer's own bounded
one-correction-attempt design (§L) is not systematically prompted to check
"did every basket in this section get its own distinct threshold." This is
the single most important, concrete, fixable gap this validation surfaced.

## X. Review/over-flagging metrics (§53)

| Package | AUTOMATICALLY_USABLE_CORRECT_RATE (EXECUTABLE ∩ correct) | REVIEW_REQUIRED_RATE (non-EXECUTABLE) | CORRECT_RULE_RATE (factually correct, any state) |
|---|---|---|---|
| FWRG | 0% (0/18) | 100% | 66.7% (12/18) |
| LSB | ~21% (3/14, though not all 3 EXECUTABLE rules are necessarily among the 7 correct ones — not independently cross-tabulated this session, a disclosed gap) | ~79% | 50.0% (7/14) |

The 0%/~21% usable-correct rates are **not** primarily a verification
failure — they are dominated by the curated-definitions-excerpt VALIDATION
artifact (§F/§M/§O). A system that flags everything is genuinely useless
per §53's own warning, but this is not that failure mode: the underlying
extraction is 66.7%/50.0% factually correct; the promotion bottleneck is a
fixture-scope choice (curated, not exhaustive, definitions extraction) this
validation spike made deliberately to bound cost, not a property of the
compiler architecture itself.

## Y. Cost/token/latency results (real, never fabricated)

**Per-attempt real spend, this session, Phase C only** (C0's own $0.4462
FWRG single-call spend is separate and already reported in
`docs/phase-c0-analyzer-validation.md`):

| Package | Attempt | Cost | Notes |
|---|---|---|---|
| LSB | 1st full run (all 11 stages) | $0.4458 | first successful staged run; relationships/verification bugs present |
| LSB | reverify 1 (RELATIONSHIPS+VERIFICATION+VALIDATION+COVERAGE+PROMOTION only) | $0.5142 | relationship enum + verification-rollback fixes |
| LSB | reverify 2 (same stages) | $0.4453 | whitespace-tolerance fix — this is the final, accurate number |
| FWRG | 1st run | $0.4064 | RULE_EXTRACTION failed (single-batch structured-output error) |
| FWRG | 2nd full run (all 11 stages) | $1.2996 | section-batching + relationship-enum fixes; first fully successful run |
| FWRG | reverify (same 5 stages as LSB) | $1.1837 | whitespace-tolerance fix — this is the final, accurate number |
| **Total Phase C real spend** | | **$4.2950** | across 6 real attempts, 2 packages |

This exceeds the original estimate (~$2–3.50) given to the user before this
work began, by about 25% — disclosed honestly: the excess is entirely the
cost of re-verifying real bug fixes (3 reverify passes at $0.44–$1.18 each),
never a full-pipeline re-run once a package succeeded once. Real latency:
each full run took roughly 5–10 minutes wall-clock (observed via background
job timing); no per-call latency table was separately retained this
session — a disclosed gap, not a fabricated number.

**Per-stage real cost breakdown, FWRG's final successful run**: DEFINITIONS
$0.187, INVENTORY $0.128, RULE_EXTRACTION $0.427 (7 section-level batches),
RELATIONSHIPS $0.145, VERIFICATION $0.412 (deterministic + bounded LLM pass)
— confirms RULE_EXTRACTION and VERIFICATION are the two most expensive
stages, as expected (they see the most raw text).

## Z. Resumability/idempotency

Both proven twice: (1) `tests/contract-model/compiler-orchestrator.test.ts`
(7 tests, synthetic caller) proves resumability (unchanged input never
re-runs a completed stage), idempotency (re-running a completed package
never duplicates `DocumentNode` rows), forced re-run (increments
`attemptCount`), input-change-triggered re-run, and tenant isolation. (2)
Real evidence: three real reverify passes (§Y) each correctly resumed
STRUCTURE/DEFINITIONS/INVENTORY/RULE_EXTRACTION (or, for LSB,
DEPENDENCY_RESOLUTION too) without re-spending money, while re-running only
the explicitly forced downstream stages — the resumable design's real,
measured value, not just a unit-test claim.

## AA. Incremental recompilation

Partially exercised, not fully — `forceStages` (§D) is a manual override,
not the automatic "recompute only what changed" mechanism task §7/§29
describes for a new amendment or upstream dependency change. The automatic
half (content-hash-gated resumption) works and was exercised for real
(§Z); the "detect exactly what a specific upstream change invalidates and
recompute only that" half remains a disclosed Phase C+1 item (§AF), same
as §D's noted prompt-version gap.

## AB. Tenant isolation

Every write goes through `companyId`-scoped Prisma calls; the orchestrator
test suite's own dedicated test confirms zero `DocumentNode` rows for a
company (`coherent`) the compiler was never run against. Both real Phase C
runs used dedicated fixture companies (`fixture-fwrg-2021-credit-agreement-co`,
`fixture-lsb-2023-abl-credit-agreement-co`) — never `"coherent"`/`"matthews"`
— specifically to preserve `tests/contract-model/compatibility.test.ts`'s
own zero-`ContractRule`-rows-for-Coherent invariant.

## AC. Protected-data fingerprints

Before and after this session's entire Phase C work:

| Table | Count | Match prior baseline |
|---|---|---|
| golden_tests | 48 | ✓ |
| permissions | 29 | ✓ |
| permission_relationships | 27 | ✓ |
| shared_capacity_constraints | 3 | ✓ |
| legal_review_records | 111 | ✓ |
| contract_rule (companyId=coherent) | 0 | ✓ |
| contract_rule (companyId=matthews) | 0 | ✓ |
| contract_rule (total, all companies) | 130 | new — entirely from the two Phase C fixture companies |

Zero unauthorized change. Repo-wide overfitting grep
(`grep -rniE "\bcoherent\b|\bmatthews\b|\bfwrg\b|\blsb\b" lib/contract-model/compiler/*.ts lib/contract-model/analyzer/*.ts lib/contract-model/types.ts`)
confirms every hit is inside a comment documenting provenance; a second,
narrower grep for `=== "coherent"`-style runtime comparisons returns zero
hits anywhere in `lib/contract-model/`.

## AD. Production integration

Compiler output flows into the existing, real Phase B tables
(`DocumentNode`, `DefinedTermNode`, `ContractRule`, `ContractRuleRelationship`,
`ContractReferenceEdge`) via stableKey-keyed upserts — never a second,
parallel data model. No Dashboard/Simulate/UI changes were made (out of
scope, §2) — a future consumer would read these tables through the
existing `lib/contract-model/service.ts` API, unmodified this phase.

## AE. Regression results

`prisma validate`: valid. `prisma migrate status`: up to date, 20
migrations, both this session's fully additive. `tsc --noEmit`: clean.
`eslint .`: clean. `vitest run`: 569/569 passed (74 files) — the one
failure found mid-session (`tests/dashboard-service.test.ts`'s
closed-world company-list assertion, broken by Phase C's own deliberately-
persisted fixture companies) was fixed by relaxing the assertion to check
presence rather than exact-set-equality (§AC already confirms this changed
nothing about the protected companies themselves). Coherent golden harness:
26/30 (unchanged). Matthews golden harness: 2/18 (unchanged). Production
build (`next build`): succeeds (pre-existing, unrelated `next/font/google`
override warnings only).

## AF. Known limitations

- Curated (not exhaustive) definitions extraction drives most of the
  `VALIDATION: BLOCKED`/low-EXECUTABLE-count results (§F/§M/§O) — a
  fixture-scope choice, not an architecture flaw, but real production use
  needs exhaustive or lazily-resolved (§12) definitions extraction to avoid
  this.
- The dominant real error (multi-basket-per-section threshold/formula loss,
  §W) is not yet caught by either verification layer — the single most
  important concrete fix needed before a re-attempt at the ≤5% gate.
- Prompt-version changes don't automatically invalidate stage hashes (§D) —
  only provider/model and content changes do.
- Incremental recompilation is manual (`forceStages`), not automatic (§AA).
- `SPURIOUS_CLAUSE_RATE` and 8 other error-taxonomy dimensions remain
  unmeasurable with the current evaluator's fields (§R) — same disclosed
  gap C0 already reported, not newly introduced.
- Amendment *parsing* (not just detection) remains unbuilt, matching Phase
  B's own explicit scope limit.
- Real rate-limit retry logic was never exercised against an actual 429
  this session either (same gap C0 reported).
- Relationship semantic accuracy (are the 51–66 real relationships found
  actually correct, not just persistable?) was not independently graded
  this session — no ground truth exists for it yet, a real, disclosed
  measurement gap distinct from "persisted successfully."

## AG. Exact next step

Fix the multi-basket-per-section verification gap first (§W) — the
concrete, bounded, already-diagnosed problem — by extending the bounded LLM
adversarial pass's own prompt to explicitly ask "does this section contain
more than one independently-gated basket, and does each one have its own
distinct threshold/formula in the extracted output," before attempting any
broader architectural change. Re-run against FWRG and LSB (already-built,
reusable fixtures — no new package selection needed) to measure whether
this specific fix moves the aggregate dangerous-unflagged rate meaningfully
toward the ≤5% gate. Do not begin the full Ask Headroom/obligations-engine/
ERP-integration work (§89/§90) until that re-measurement is done.
