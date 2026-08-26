# Phase C0 — Prove the Contract Analyzer Before Moving On

This is a validation spike, not a feature build. Its only job is to answer one
question honestly: **can an unfamiliar real financing package actually be
represented, extracted, validated, and safely evaluated by this
architecture?** Every number below is either directly measured (a test run,
a query against real data, a character count) or explicitly labeled
PROJECTED. Nothing is rounded up to make the answer look better than the
evidence supports.

## A. Executive summary

- The Phase B ontology (`lib/contract-model/types.ts`, `prisma/schema.prisma`)
  maps every one of 18 real material provisions in an unfamiliar, real,
  public credit agreement (First Watch Restaurant Group's 2021 Credit
  Agreement) onto existing enum values and structures with **zero schema
  changes required**. Verdict: `ONTOLOGY_SUFFICIENT` (§C).
- A minimal analyzer vertical slice was built end-to-end
  (`lib/contract-model/analyzer/**`) reusing the exact Phase B `Candidate*`
  schemas and the same Anthropic/Vercel-AI-Gateway transport convention
  already proven live in production for document extraction. It type-checks
  and is architecturally ready (§E).
- **The central open question — can a real LLM actually extract this
  unfamiliar package correctly, with dangerous-unflagged errors near zero —
  was NOT answered in this session.** This sandbox has no
  `AI_GATEWAY_API_KEY`/`ANTHROPIC_API_KEY`, and invoking the deployed
  production stack live would require the retained Vercel Protection Bypass
  secret, which this task did not explicitly authorize using (§F, §L, §S).
  Only a deterministic, admittedly crude regex baseline was actually run
  against the unseen package.
- That deterministic baseline's real, measured results against the 18-item
  human ground truth: 1 correct, 9 incorrect-but-flagged, 2
  incorrect-and-unflagged (dangerous), 6 missed (§F, §J). A small adversarial
  verification pass reduced the dangerous-unflagged count from 2 to 0 by
  downgrading confidence rather than by fixing the underlying wrong answer
  (§M) — real evidence that cheap, independent structural checks catch a
  real class of danger, but do not substitute for getting the extraction
  right in the first place.
- The generalized negative-detection/coverage mechanism (§G) is real and
  reasonably reliable on real data: it found the single known documented gap
  in Coherent's reviewed data (`§3.3(b)(xviii)`, Contribution Indebtedness)
  with zero false positives against Coherent's other reviewed clauses (§H).
- **Final verdict: `ANALYZER_VIABILITY_NOT_PROVEN`** (§S). Not because
  anything examined failed — the ontology, architecture, and coverage
  mechanism all held up under real scrutiny — but because the one experiment
  that would actually prove or disprove the product's central bet (a real
  model, on a real unfamiliar document, producing few-to-no confidently wrong
  answers) was not run. Recommending Phase C on the strength of everything
  BUT that experiment would be exactly the kind of "looks successful without
  the evidence" outcome this task explicitly forbids.

## B. Package selection (Task 1)

**Selected:** First Watch Restaurant Group, Inc.'s Credit Agreement dated
October 6, 2021 (Exhibit 10.1 to an 8-K, CIK 0001789940, SEC EDGAR accession
`0001193125-21-293207`, document `d212487dex101.htm`), found via live SEC
EDGAR full-text search. Full rationale, verified complexity list, and the
two-excerpt scoping decision are recorded in
`tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/README.md`. In
summary: never used anywhere in this codebase; a materially different
covenant structure from both Coherent and Matthews (EBITDAR rent-adjusted
leverage metric, Term Loan A + Revolver, real maintenance covenants, not
cov-lite); and, confirmed by direct reading of the real text, contains grower
baskets, a deeply-nested builder basket (Available Amount), a ratio-gated
unlimited basket, a stepped/date-varying covenant with an acquisition
step-up, and a capped equity cure right.

Two bounded excerpts were used (Article 6 Negative Covenants, ~104,183
characters; a targeted Definitions excerpt, ~16,544 characters) rather than
the full agreement, to keep a single structured-output call's context and
this spike's cost/time bounded — the task's own instruction is that C0 does
not require production-scale document handling.

## C. Human ground truth mapping and ontology verdict (Task 2)

`tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth.ts`
records 18 real material provisions read directly from the source text,
classified against the actual Phase B ontology (not an idealized one), with
real dollar/percentage/ratio figures quoted for later exact-match grading.

| Classification | Count | % |
|---|---:|---:|
| REPRESENTABLE_CLEANLY | 12 | 66.7% |
| REPRESENTABLE_WITH_STRETCH | 6 | 33.3% |
| NOT_REPRESENTABLE | 0 | 0% |

**Ontology verdict: `ONTOLOGY_SUFFICIENT`.** Every provision maps onto an
existing `CovenantFamily`/`ContractRuleType`/`RuleEvaluationClass`/
`ContractRulePosture`/`ContractAction`/`CalculationRuleKind` value. The six
"stretch" cases are real but are decomposition-discipline and
free-text-fallback risks for an EXTRACTOR to get right, not missing schema
primitives:

- **The Available Amount definition** (`fwrg-def-available-amount`) is the
  hardest single provision in the package: a cumulative, multi-clause
  builder basket where one sub-clause is gated by a ratio test AND a
  narrow, named-Event-of-Default carve-out that does NOT apply to the
  basket's other sub-clauses. The ontology's primitives (`CALCULATION_RULE`,
  `CUMULATIVE_AMOUNT`/`BUILDER_BASKET`, `ContractRuleRelationshipType.
  BASKET_FEEDING`, per-rule `conditions[]`) can represent this correctly
  ONLY if an extractor actively decomposes the definition into several
  linked atomic rows rather than transcribing it as one rule with all
  conditions flattened together — flattening would either over- or
  under-apply the ratio gate, and the under-apply direction is the
  dangerous one. This is the primary predicted source of a dangerous,
  plausibly-unflagged error, and was used as the design basis for the
  adversarial-verification spike (§M).
- **The stepped leverage covenant** (`fwrg-6.10-a`) mixes a
  calendar-scheduled threshold change with an event-triggered one
  (Material-Acquisition step-up) using the same mechanical fields
  (effectiveFrom/effectiveTo, PARAMETER_ADJUSTMENT_TRIGGER) an
  amendment-driven change would use — nothing at the type level
  distinguishes "changes because the calendar moved" from "changes because
  the parties amended the document," which matters for provenance/audit.
- Two minor, non-blocking nomenclature/family-fit notes are recorded
  (`fwrg-6.02-a`, `fwrg-def-restricted-debt`) — a human modeler had to
  actively choose an approximate label in each case, worth revisiting in a
  future ontology iteration but not a blocker now.

## D. Ontology corrections (Task 3)

**None made.** Per §C's verdict, no schema change is required to proceed to
building the vertical slice. `prisma/schema.prisma` and
`lib/contract-model/types.ts` are unmodified in this task (confirmed: `git
status` shows zero changes to any pre-existing file — see §Q of
`docs/contract-model-foundation-phase-b.md`'s own file list for what
"pre-existing" means here).

## E. Analyzer vertical slice (Task 4)

New, additive code under `lib/contract-model/analyzer/`:

- `schema.ts` — the single structured-output schema the real-LLM call
  targets, composed directly from Phase B's own `CandidateContractRuleSchema`
  / `CandidateDefinedTermSchema` / `CandidateContractReferenceSchema` /
  `CandidateRuleRelationshipSchema` (`lib/contract-model/types.ts`) — no
  parallel schema was invented.
- `provider.ts` — a one-method `ContractAnalyzerProvider` interface.
- `anthropic-analyzer.ts` — `AnthropicMessagesAnalyzer` (shared base,
  real `client.messages.parse()` + `output_config.format` structured-output
  call, mirroring `lib/extraction/anthropic-provider.ts`'s own proven
  pattern) with two thin subclasses, `AnthropicContractAnalyzer` (direct API)
  and `VercelAIGatewayContractAnalyzer` (Gateway transport, same base URL and
  auth convention as the production extraction pipeline).
- `synthetic-analyzer.ts` — `SyntheticContractAnalyzer`, a deterministic,
  zero-network regex baseline (one grower-basket pattern, one bare-ratio-test
  pattern, a generic section-to-family lookup) used because this sandbox has
  no live LLM credential.
- `get-analyzer-provider.ts` — a factory mirroring
  `lib/extraction/get-provider.ts`'s exact selection order (Gateway → direct
  Anthropic → fail loudly on Vercel → synthetic locally).
- `coverage.ts` — the structural negative-detection mechanism (§G).
- `evaluator.ts` — the blind evaluator (§I).
- `verify.ts` — the deterministic adversarial-verification pass (§M).

This is a deliberately separate class hierarchy from the existing
`ContractExtractionProvider`/`AnthropicMessagesProvider` in
`lib/extraction/**`, which targets the OLD `Permission`/`PermissionRelationship`
shape and is unmodified. What is reused verbatim is the transport
convention — same SDK, same structured-output call shape, same
direct-vs-Gateway split, same env vars.

## F. Blind run against the unseen package (Task 5)

**What was actually run:** `SyntheticContractAnalyzer` against the real
FWRG Article 6 + Definitions excerpts, evaluated per-provision against
`human-ground-truth.ts` via `evaluateAll()`
(`tests/contract-model/analyzer-unseen-package.test.ts`).

**What was NOT run:** `AnthropicContractAnalyzer` /
`VercelAIGatewayContractAnalyzer` against this package. See §L for why.

Real, measured results (18 provisions):

| Outcome | Count |
|---|---:|
| MATCHED_CORRECT | 1 |
| MATCHED_INCORRECT_FLAGGED | 9 |
| MATCHED_INCORRECT_UNFLAGGED (dangerous) | 2 |
| MISSING | 6 |

The two dangerous-unflagged cases (`fwrg-6.10-a`, the stepped leverage
covenant; `fwrg-6.10-c`, the equity cure right) both trace to the same root
cause: the baseline's naive "nearest preceding section marker" heuristic
mis-attributes a numeric match to the wrong clause when the source text
contains internal cross-references — a real, generalizable risk for any
extractor working over densely cross-referenced legal text, not unique to
this toy regex. A real bug in the baseline itself was found and fixed while
building this test: every match was originally mistagged with the same
hardcoded `covenantFamily` regardless of which section it came from; this
was corrected with a generic section-number-to-family lookup table (not
tuned to any specific provision) before the numbers above were recorded.

## G. Structural negative-detection / coverage mechanism (Task 6)

`lib/contract-model/analyzer/coverage.ts`'s `detectStructuralCoverageGaps()`
is a plain regex scan for clause markers in source text, diffed against the
set of `sourceSectionRef` values a set of candidate rules actually cites —
deliberately independent of any LLM's own self-reported confidence, per the
task's explicit instruction.

Tested against Section 6.01 of the real FWRG text
(`tests/contract-model/coverage-structural.test.ts`): a section-scoped
top-level-clause-letter pattern (`(?<=[;.] )\([a-z]\)(?!\()`) recovers ~21 of
the ~26 real lettered sub-clauses (a-z), with a known, honestly-recorded
ambiguity — a nested sub-clause letter that happens to reuse a top-level
letter (e.g. clause (g)'s own internal "(i)") is indistinguishable from a
true top-level "(i)" by this pattern alone. Given a citation set matching the
bounded human ground truth's own 6.01 coverage, the mechanism correctly
credits every human-covered clause and correctly flags the remaining ~22
clauses (deliberately out of scope for the bounded ground truth) as gaps —
demonstrating the mechanism finds real gaps, though a raw gap count still
needs materiality triage by a human, not blind treatment as an error count.

## H. Coverage mechanism tested against Coherent's real reviewed data (Task 7)

Coherent has zero ingested `DocumentChunk` rows (confirmed by direct query),
so there is no raw contract text to regex-scan for this company. Instead,
the mechanism was tested against Coherent's real, already-documented known
gap: `SolverCoverageDeclaration.notes` for the Indenture explicitly and
permanently excludes Contribution Indebtedness, `§3.3(b)(xviii)`, as "a
REAL, material Indenture debt basket" not modeled as a `Permission` row (see
`docs/coherent-phase8-population-reconciliation.md` §M item 3).

Given the real, actual set of Coherent's modeled `Permission.sectionRef`
values (22 rows) and a reconstructed real clause-label universe from
Coherent's own documentation, the mechanism:

- Correctly flagged `§3.3(b)(xviii)` as the one gap.
- Produced zero false positives against the other real, modeled clauses
  (`§3.3(b)(i)(A)`, `§3.3(b)(xx)`, etc.).

**Verdict: `COVERAGE_TRACTABLE`**, with the explicit caveat that N=1 known
gap is a very small sample — this demonstrates the mechanism CAN work on
real reviewed data, not that its false-negative rate is well characterized.

## I. Blind evaluator (Task 8)

`lib/contract-model/analyzer/evaluator.ts` never imports
`human-ground-truth.ts` — the caller (the test file) supplies ground truth,
keeping the evaluator's own matching logic testable independent of any real
answer key (see its own header comment and the synthetic-fixture unit test
in `analyzer-unseen-package.test.ts`'s second `it()` block).

Per-provision, it compares: covenant family, formula kind, the actual
extracted numbers against the real dollar/percentage/ratio figures quoted in
ground truth (within 1% tolerance), and whether a required condition (ratio
gate, no-default) is reflected in the extracted rule's own `conditions[]` —
not just whether a rule exists citing the right section, which the task
explicitly calls insufficient credit.

Per-CovenantFamily precision/recall/F1 is computed
(`evaluateAll().precisionRecallF1ByFamily`); given only one analyzer run
(§F) with a single, small ground-truth set, these per-family numbers are
too sparse to report as meaningful rates on their own and are not repeated
here beyond the file-level totals in §F/§J — reported honestly as a scale
limitation, not a claim the mechanism is unready.

## J. Dangerous-error metrics (Task 9)

Defined in `evaluator.ts`, computed separately and never averaged:

- `DANGEROUS_UNFLAGGED_ERROR_RATE` = 2/18 = **11.1%** (SyntheticContractAnalyzer, unseen package, before verification pass)
- `DANGEROUS_FLAGGED_ERROR_RATE` = 9/18 = **50.0%** (same run)
- `MISSING_RATE` = 6/18 = **33.3%** (same run)

After the adversarial-verification pass (§M): `DANGEROUS_UNFLAGGED_ERROR_RATE`
= 0/18 = **0%**; `DANGEROUS_FLAGGED_ERROR_RATE` rises to 11/18 = **61.1%**
(the two reclassified cases moved from unflagged to flagged, not fixed).

These numbers describe ONLY the deterministic regex baseline. They are not,
and must not be read as, an estimate of the real LLM path's error rates —
see §L.

## K. Synthetic baseline recompute against Coherent (Task 10)

Re-ran, rather than assumed, the two existing baselines documented in
`docs/company-onboarding-v1-implementation.md` §I and the Coherent/Matthews
golden-test harnesses:

- `scripts/onboarding-precedent-acceptance.ts` (SyntheticExtractionProvider
  vs. Coherent's real precedent language, 4 ground-truth items): **Recall
  75% (3/4), Precision 100% (3/3), threshold value correct 0/3, formulaType
  correct 0/3, grantType correct 2/3, citation (top-level section) correct
  3/3.** Identical to the previously documented figures — confirmed
  unchanged, not assumed.
- `npm run golden-test` (Coherent covenant engine): **26 passed, 3 failed, 1
  flagged out-of-scope, 0 errored (30 total).** Identical to the documented
  baseline.
- `npx tsx scripts/golden-test.ts matthews`: **2 passed, 4 failed, 10
  flagged out-of-scope, 2 errored (18 total).** Identical to the documented
  baseline.

No regression, no improvement — Phase C0's new code does not touch any of
these paths (confirmed in §Q/data-safety).

## L. Real LLM vertical slice status (Task 11) — NOT EXECUTED

This sandbox has neither `AI_GATEWAY_API_KEY` nor `ANTHROPIC_API_KEY` set.
Executing the real analyzer against the unseen package would therefore
require invoking the deployed production Vercel stack, which sits behind
Vercel's own deployment-protection layer. Reaching it requires the Vercel
Protection Bypass secret already in this session's possession from an
earlier task.

**That secret is used only on the user's direct, explicit order for that
specific action — never on this session's own initiative** (a standing
constraint from an earlier turn in this conversation, restated here because
it directly and materially limits this report). The current Phase C0 task
text does not contain such an explicit order to use it. Per that constraint,
the live real-LLM run was NOT attempted.

Consequence: **the single most important empirical question this whole
spike exists to answer — does a real model, given this unfamiliar document,
produce few-to-no confidently-wrong contractual rules — remains
unanswered.** This directly drives the final verdict in §S. The code path
(`AnthropicContractAnalyzer`/`VercelAIGatewayContractAnalyzer`) is written
and type-checks cleanly, using the exact transport already proven live in
production for the (differently-shaped) extraction pipeline, but "compiles
and reuses a proven transport" is not evidence of extraction quality on this
document, and is not represented as such anywhere in this report.

## M. Adversarial-verification spike (Task 12)

`lib/contract-model/analyzer/verify.ts`'s `verifyRuleAgainstSource()` is a
generalized, deterministic check: does a rule's own cited `sourceSectionRef`
actually appear in the source text, and does its `thresholdValue` (or a
formatted variant) appear within 400 characters of that citation? A rule
that fails either check is downgraded to `evaluationClass: JUDGMENT_REQUIRED`
with an explicit note — it cannot be corrected (this pass has no way to know
the right answer), only flagged.

Measured effect on the one real analyzer run available (§F), in
`tests/contract-model/adversarial-verification.test.ts`:

| Metric | Before | After |
|---|---:|---:|
| MATCHED_CORRECT | 1 | 1 (unchanged) |
| MATCHED_INCORRECT_FLAGGED | 9 | 11 |
| MATCHED_INCORRECT_UNFLAGGED | 2 | 0 |
| MISSING | 6 | 6 (unchanged) |

This is real, measured evidence that a cheap, independent, deterministic
structural check meaningfully reduces the most dangerous outcome class — but
on a sample of one run against 18 provisions, and it was never tested
against a real LLM's own (unknown, per §L) error profile. It should be
carried into Phase C as a required post-extraction gate, not treated as
having "solved" dangerous-unflagged errors in general.

## N. Deterministic validation additions (Task 13)

`verify.ts` (§M) is this task's deterministic, content-aware, no-LLM check
("cited section exists in source," "threshold appears near its citation") —
applied to pre-persistence `CandidateContractRule[]` output, which is the
correct point in the pipeline for it (Phase B's own existing
`lib/contract-model/validators.ts` operates on already-persisted rows for a
company and was left unmodified, since none of its seven structural checks
needed a content-aware addition to satisfy this task — a pre-persistence
content check belongs with the candidate-shaped code, not the persisted-graph
validators).

## O. Cost instrumentation and projection (Task 14/15)

**Measured:** $0.00. Zero live LLM calls were made against the unseen
package in this session (§L) — there is no real cost to report, and none is
invented.

**Projected** (explicitly labeled, derived from real inputs where possible):
Anthropic's published Claude Opus 5 API pricing is $5/million input tokens
and $25/million output tokens ([Anthropic API pricing 2026 rate card, eesel AI summary of Anthropic's own published rates](https://www.eesel.ai/blog/anthropic-api-pricing)).

- The two real fixture files used in this spike total 120,727 characters.
  Using a standard ~4 characters/token approximation for English legal
  prose: **~30,200 input tokens** for one analyzer call covering this
  package's Negative Covenants article + definitions excerpt.
- Real page markers embedded in the source text place Article 6 across
  pages 142–169 (28 pages) for 104,183 characters — a real, source-derived
  density of **~3,720 characters/page** for this specific document (not a
  generic assumption).
- Output size was never measured (no live call); a rough range of
  4,000–8,000 output tokens is assumed for an 18-40 rule extraction,
  consistent with the volume the deterministic baseline itself produced
  (26 candidate rules) plus defined terms/references/relationships a real
  model would add.

| Document size (using this document's own ~3,720 chars/page) | Input tokens (PROJECTED) | Output tokens (PROJECTED) | Cost (PROJECTED, midpoint) |
|---|---:|---:|---:|
| 50 pages (~186,000 chars) | ~46,500 | ~5,000–10,000 | ~$0.23 input + ~$0.19 output ≈ **$0.42** |
| 150 pages (~558,000 chars) | ~139,500 | ~15,000–30,000 | ~$0.70 input + ~$0.56 output ≈ **$1.26** |
| 300 pages (~1,116,000 chars) | ~279,000 | ~30,000–60,000 | ~$1.40 input + ~$1.13 output ≈ **$2.53** |

These are order-of-magnitude planning numbers only — no multi-call staged
pipeline cost (chunking/overlap overhead, retries, the coverage/relationship
stages the OLD six-stage pipeline uses) is modeled, since Task 4 deliberately
built a single-call vertical slice, not a production pipeline.

## P. Error taxonomy (Task 16)

Twenty named categories, drawn from real observations in this spike plus the
already-documented `SyntheticExtractionProvider` precedent findings (§K):

1. `MISSING_CLAUSE` — no candidate at all for a real provision (§F, 6 cases).
2. `WRONG_FAMILY` — covenant family misclassified (found and fixed as a
   baseline bug in this spike; zero after the fix).
3. `WRONG_RULE_TYPE` — e.g. a permission classified as a restriction.
4. `WRONG_EVALUATION_CLASS` — EXECUTABLE claimed for a judgment-required rule.
5. `WRONG_ACTION` — action verb mismatch.
6. `WRONG_THRESHOLD_NUMBER` — a number extracted but incorrect (§F, §K:
   0/3 correct in the real-precedent test's true positives).
7. `WRONG_THRESHOLD_UNIT` — e.g. absolute dollars vs. dollars-in-millions
   (real, observed: the 10^6 scale bug in §K).
8. `WRONG_FORMULA_KIND` — e.g. reporting a fixed amount where the real
   provision is `GREATER_OF_FLAT_OR_PCT_EBITDA` (§F, §K: 0/3 correct).
9. `MISSING_CONDITION` — a real gating condition (ratio test, no-default)
   omitted (§F: `fwrg-6.04-a-xi`, `fwrg-6.04-a-x`).
10. `SPURIOUS_CONDITION` — a condition invented that the source does not state.
11. `WRONG_SOURCE_CITATION` — citing the wrong clause (real, observed root
    cause of both dangerous-unflagged cases in §F).
12. `LOST_SUB_CLAUSE_PRECISION` — citing only the top-level section, losing
    lettered/numbered sub-clause precision (real, documented in §K).
13. `MISSING_ENTITY_SCOPE` — omitting a real entity-type restriction
    (e.g. "Restricted Subsidiary that is not a Loan Party").
14. `WRONG_ENTITY_SCOPE` — an entity-scope value present but incorrect.
15. `FLATTENED_NESTED_DEFINITION` — a multi-component builder-basket
    definition (Available Amount, §C) represented as one rule instead of
    correctly decomposed linked rules, silently over- or under-applying an
    inner condition.
16. `MISSED_RELATIONSHIP` — a real cross-basket relationship
    (e.g. `SHARES_CAPACITY_WITH` between 6.04(a)(x) and 6.04(b)) never emitted.
17. `SPURIOUS_RELATIONSHIP` — a relationship invented between unrelated rules.
18. `UNRESOLVED_REFERENCE_MISHANDLED` — a genuinely unresolvable
    cross-reference either dropped silently or fabricated a target instead of
    being recorded as `UNRESOLVED`.
19. `CONFIDENT_WRONG_UNFLAGGED` — the umbrella, most-dangerous category any
    of #2–#18 falls into when the rule's own evaluationClass/action/notes
    give no hedge (§F, §J: 2 real cases before verification, §M: 0 after).
20. `HONEST_UNCERTAIN_FLAGGED` — the same underlying error, but self-flagged
    (JUDGMENT_REQUIRED, action OTHER, or an explicit hedge in notes) — the
    acceptable failure mode this task explicitly says is fine.

## Q. Capability matrix (Task 17)

Legend: R = Representable in the ontology, E = Extractable (attempted by the
analyzer), V = Validatable (checked deterministically), X = Executable
(would resolve against real financials), P = Proven on the real unseen
document in THIS session.

| Capability | R | E | V | X | P |
|---|:-:|:-:|:-:|:-:|:-:|
| Fixed-dollar debt/lien/investment basket | ✓ | ✓ | ✓ | ✓ | partial (baseline found some, wrong numbers) |
| Grower basket (greater of $X / Y% EBITDA) | ✓ | ✓ | ✓ | ✓ | partial (formula never correctly tagged by baseline) |
| Ratio-gated unlimited basket | ✓ | ✓ | ✓ | ✓ | ✗ (baseline missed the ratio gate entirely) |
| Multi-component cumulative/builder basket (Available Amount) | ✓ (with stretch, §C) | attempted, not correctly | partial | ✗ | ✗ |
| Stepped/date-varying covenant threshold | ✓ (with stretch, §C) | ✗ (baseline: dangerous-unflagged) | ✗ | ✗ | ✗ |
| Acquisition-triggered step-up | ✓ | ✗ | ✗ | ✗ | ✗ |
| Equity cure right (capped, rolling-window limited) | ✓ (with stretch, §C) | ✗ (baseline: dangerous-unflagged) | ✗ | ✗ | ✗ |
| Entity-scope distinctions (Restricted Subsidiary / Loan Party) | ✓ | not attempted by baseline | ✓ (schema-level) | ✓ | ✗ |
| Subordination/priority concept (Restricted Debt) | ✓ (minor family-fit note, §C) | not attempted | ✓ | ✓ | ✗ |
| Cross-basket capacity sharing (SHARES_CAPACITY_WITH) | ✓ | ✗ | ✓ (schema-level) | ✓ | ✗ |
| Structural coverage/gap detection | ✓ | ✓ | ✓ | n/a | ✓ (real, §G/§H) |
| Adversarial source-proximity verification | ✓ | ✓ | ✓ | n/a | ✓ (real, §M) |
| Real LLM extraction quality on an unseen document | n/a | not run | n/a | n/a | **✗ — not executed (§L)** |

The bottom row is the load-bearing gap in this matrix, and in this spike.

## R. Phase C architecture decision (Task 18)

Ten questions, answered from actual observed evidence in this spike:

1. **Is the ontology sufficient to proceed?** Yes (§C) — no schema changes needed.
2. **Is a single-call-per-document analyzer shape viable, or does Phase C need
   staged extraction like the old six-stage pipeline?** Unproven either way —
   this spike never ran a real model, so nothing is known yet about whether a
   ~30K-input-token single call degrades quality vs. staging. This should be
   the FIRST thing a real Phase C0 follow-up measures, not assumed.
3. **Does decomposition of nested definitions (Available Amount, §C) need to
   be a distinct compiler pass rather than left to a single extraction call?**
   The evidence here (a naive flatten either over- or under-applies an inner
   condition) suggests yes, but this is inferred from the ontology mapping
   exercise, not from an observed real-model failure.
4. **Is deterministic post-extraction verification (§M) worth making a
   mandatory gate?** Yes — real, measured evidence it eliminates a dangerous
   category, cheaply, though only tested against one non-LLM baseline run.
5. **Is the structural coverage mechanism (§G/§H) ready to gate promotion
   (block until a human resolves a flagged gap), or advisory-only?**
   Advisory-only for now — real but small-sample evidence (N=1 known-gap
   test against Coherent); gating on it before broader validation risks
   blocking real workflows on false positives not yet characterized.
6. **Should the dangerous-unflagged rate be a hard release gate for Phase C?**
   Yes in principle, but no real threshold can be set responsibly without at
   least one real-LLM run establishing what that rate actually looks like.
7. **Is cost tractable at production document sizes?** Provisionally yes per
   the PROJECTED figures in §O (low single-digit dollars even at 300 pages
   for one analyzer call), but these are unverified projections, not measurements.
8. **Does Coherent/Matthews' existing legacy-Permission data need a real
   migration into the new ContractRule shape before Phase C, or does the
   read-time `compatibility.ts` projection remain sufficient?** Nothing in
   this spike required migrating them; the projection continued to serve
   every real query needed here (§H).
9. **Should Phase C require a second, independent unseen-package validation
   run (a different document, different reviewer) before shipping?** Yes —
   one document and one human reviewer (this session) is a spike-scale
   sample, not a validation sample.
10. **What is the single highest-priority next step?** Run the real
    `AnthropicContractAnalyzer`/`VercelAIGatewayContractAnalyzer` against
    this exact unseen package with real production credentials, under
    explicit authorization, and re-evaluate with the exact same
    `evaluator.ts`/`human-ground-truth.ts` already built and committed here —
    the harness for that experiment is done; only the experiment itself is
    outstanding.

## Data safety (Task 21)

Zero writes anywhere in this task's new code (confirmed by grep: no
`.create(`/`.update(`/`.delete(`/`.upsert(` call exists in
`lib/contract-model/analyzer/**` or any new test file). No Prisma schema
change, no migration. Real counts, queried against the local database both
before and after this task's work (identical by construction, since nothing
in this task writes to them): `golden_tests` coherent=30/matthews=18,
`permissions` coherent=22/matthews=7, `permission_relationships`
coherent=19/matthews=8, `shared_capacity_constraints`=3,
`legal_review_records`=111, `solver_coverage_declarations`=10,
`contract_rule` (Phase B table, company-wide)=0.

## Full verification suite (Task 22)

- `npx tsc --noEmit`: clean, zero errors.
- `npx eslint` (new files): clean, zero warnings/errors.
- `npx vitest run`: **68 test files, 517 tests, all passing** (includes 6 new
  test cases added by this task: 2 coverage-structural, 2
  analyzer-unseen-package, 1 adversarial-verification, plus the pre-existing
  511 unchanged and still green).
- Coherent golden harness: 26 passed / 3 failed / 1 flagged / 0 errored (30
  total) — matches documented baseline exactly, pre-existing known failures,
  not a regression.
- Matthews golden harness: 2 passed / 4 failed / 10 flagged / 2 errored (18
  total) — matches documented baseline exactly, pre-existing known
  failures/errors, not a regression.
- `scripts/onboarding-precedent-acceptance.ts`: recall 75%, precision 100%,
  matches documented baseline exactly.

No production code was changed by this task (§Q), so a production build was
not re-verified beyond the existing `tsc`/`eslint`/`vitest` gates above —
nothing in the build graph changed.

## Live validation (Task 23)

**Not performed.** See §L for the full reasoning: it would require using the
retained Vercel Protection Bypass secret without an explicit order to do so
in this task, which this session's standing constraint on that secret
forbids. No schema/migration change was made in this task, so there was also
no hosted-Neon migration to verify.

## Success criteria and failure conditions (Tasks 24/25)

Of the task's own 10 success criteria, this spike can honestly claim: real
unseen package selected and documented (✓); blind human ground truth
produced before any extraction (✓); ontology proven sufficient with real
evidence (✓); a real (not hypothetical) analyzer built reusing Phase B
models (✓); a real coverage/negative-detection mechanism built and tested
against real reviewed data (✓); dangerous-error metrics defined and measured
separately (✓, for the baseline that was actually run); existing system
fully preserved with zero unauthorized data mutation (✓). It cannot claim:
the real LLM path proven on the unseen package (✗ — §L); a second
independent unseen-document validation (✗ — out of this spike's bounded
scope); a production-scale cost measurement (projected only, §O).

Of the 8 failure conditions, none of "the ontology is structurally wrong,"
"the analyzer cannot be built," "the coverage mechanism is intractable," or
"the existing system was damaged" are true. The condition that IS true,
honestly: **the core question of real-model safety on an unseen document was
left empirically untested**, which this report treats as decisive for the
final verdict rather than as a minor gap to note in passing.

## S. Final verdict (Task 27)

**`ANALYZER_VIABILITY_NOT_PROVEN`**

Everything this spike COULD test without live production model access held
up: the ontology needs no changes, a real analyzer architecture was built
and type-checks cleanly on the exact proven transport, a real coverage
mechanism correctly found a real documented gap in Coherent's own reviewed
data with no false positives, and a real adversarial-verification pass
measurably eliminated the one class of dangerous error this spike could
observe. None of that is nothing.

But the one experiment this entire spike exists to run — does a real model,
given a real unfamiliar financing package, produce confidently wrong
contractual rules at a materially non-zero rate — was not run, because doing
so would have required using a credential this session is not authorized to
use on its own initiative for this task. Every dangerous-error number in
this report (§F, §J, §M) describes a deterministic regex baseline, not the
production LLM path Phase C would actually ship. Recommending
`PROCEED_TO_PHASE_C_AS_DESIGNED` or even `_WITH_MODIFICATIONS` on the
strength of the architecture alone, while the safety-critical question
remains unmeasured, would be exactly the "make it look successful without
the evidence" outcome this task explicitly instructs against.

**Recommended next step (not authorized or performed here):** with explicit
authorization to use production credentials, run
`VercelAIGatewayContractAnalyzer`/`AnthropicContractAnalyzer` against this
exact committed unseen-package fixture and re-run the exact
`evaluateAll()`/`verifyAllRulesAgainstSource()` harness already built in this
task. That single run — not new code — is what stands between this verdict
and a real answer.
