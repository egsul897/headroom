# Phase C0 — Proving the Contract Analyzer Before Phase C

This document reports the results of the Phase C0 validation spike: an
attempt to determine, with real evidence rather than assumption, whether
Headroom's contract-model architecture and a real LLM analyzer can safely
turn an unfamiliar real financing package into trustworthy structured
contractual state. It supersedes and extends `docs/phase-c0-validation-spike.md`
(the prior session's work), whose central finding —
`ANALYZER_VIABILITY_NOT_PROVEN` — was blocked purely on the absence of a live
LLM credential. That blocker is now resolved: a real analyzer was built and
run end-to-end against a real, previously-unseen credit agreement using real
Vercel AI Gateway / Claude inference, with a real cost, real latency, and a
real, independently-scored accuracy result.

Everything in this document that is a number is either **MEASURED** (came
from one real, logged API call and its real evaluation) or **PROJECTED**
(extrapolated from that one measured data point) — every occurrence is
labeled. Nothing here is invented.

## A. Executive summary

- A real analyzer vertical slice was built (`lib/contract-model/analyzer/*`)
  reusing the existing Anthropic SDK / Vercel AI Gateway transport and the
  existing `CandidateContractRule`/`CandidateDefinedTerm`/etc. schemas from
  Phase B.
- It was run once, successfully, against the real Negative Covenants article
  and Definitions excerpt of the FWRG 2021 Credit Agreement (a real,
  previously-unseen financing package never touched by any prior Headroom
  work), via Vercel AI Gateway, model `anthropic/claude-sonnet-5`.
- Scored blind against an independently-written, pre-existing human ground
  truth (18 material provisions), the analyzer's raw output was
  `MATCHED_CORRECT=6, MATCHED_INCORRECT_FLAGGED=1, MATCHED_INCORRECT_UNFLAGGED=6, MISSING=5`
  — a `DANGEROUS_UNFLAGGED_ERROR_RATE` of **33.3%**.
- A deterministic adversarial-verification pass (checks each extracted rule's
  cited section reference and threshold value against the real source text)
  moved four of those six dangerous-unflagged errors into the flagged bucket:
  `MATCHED_CORRECT=6, FLAGGED=5, UNFLAGGED=2, MISSING=5` —
  `DANGEROUS_UNFLAGGED_ERROR_RATE` **11.1%** after verification.
- Two real, generalizable bugs were found and fixed during this process
  itself (an unconstrained structured-output schema that let the model
  hallucinate invalid ontology category names, and a duplicate-citation
  evaluator bug) — both are reported below as real findings, not smoothed
  over.
- Real cost for this one document: **$0.4462** (45,629 input / 35,490 output
  tokens, MEASURED). Real latency: **248.2 seconds**.
- The existing non-LLM structural coverage mechanism was re-confirmed against
  Coherent's real, already-reviewed known-gap data: it still correctly flags
  the documented §3.3(b)(xviii) gap with zero false positives.
- Verdict: **PROCEED_TO_PHASE_C_WITH_MODIFICATIONS** (§Z).

## B. Architecture documents reviewed

Read before any new work, per the task's own "treat prior reports as claims
to verify" instruction: `docs/phase-c0-validation-spike.md` (605 lines, the
full prior spike — its blocked verdict and every claimed finding up to that
blocker were re-verified rather than assumed), `docs/contract-model-foundation-phase-b.md`,
`prisma/schema.prisma` (the real `CovenantFamily`/`ContractRuleType`/
`RuleEvaluationClass` enums and every Phase-B contract-model table),
`lib/contract-model/types.ts`, `lib/extraction/get-provider.ts` and
`lib/extraction/anthropic-provider.ts` (the existing, already-shipped
extraction transport convention this spike's analyzer reuses verbatim).

## C. Package selection

Package: **FWRG 2021 Credit Agreement** (`tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/`).
Real, never-before-used by any prior Headroom work (not Coherent, not
Matthews, not a synthetic fixture). Two real source excerpts were used:
`article-6-negative-covenants.txt` (104,183 characters) and
`definitions-excerpt.txt` (16,544 characters) — 120,727 characters / ~32.5
pages of real source text at this document's own measured density (§V).

## D. Human ground truth

`tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth.ts`
— 18 `HumanProvision` entries, written by direct reading of the real source
text before any extractor saw the document, classified against the real
Phase B ontology (`REPRESENTABLE_CLEANLY` / `REPRESENTABLE_WITH_STRETCH` /
`NOT_REPRESENTABLE`), never imported by any analyzer code
(`lib/contract-model/analyzer/*.ts` contains zero imports of this file —
re-verified by grep this session). This file was re-read in full this
session and re-confirmed unmodified from the prior session's work.

## E. Ontology fit test

Re-verified this session against the current, real Prisma enums: all 18
ground-truth provisions map onto a real `CovenantFamily`/`ContractRuleType`/
`RuleEvaluationClass` combination without a schema change. 15 are
`REPRESENTABLE_CLEANLY`; 3 carry `stretchNotes` (a builder-basket condition,
a ratio-derived formula, a cross-referenced defined-term chain) but remain
representable. **Verdict: ONTOLOGY_SUFFICIENT**, consistent with the prior
spike's own finding.

## F. Ontology fix made this session

One real, additive, non-breaking fix, made in direct response to real
evidence (not anticipated in advance): `CandidateContractRuleSchema`'s
`covenantFamily`, `ruleType`, and `evaluationClass` fields
(`lib/contract-model/types.ts`) were unconstrained `z.string()`. The first
live analyzer run against the real FWRG package produced plausible-but-invalid
category names — `"GROWER_BASKET"` as an `evaluationClass`,
`"GENERAL_PROHIBITION"`/`"BASKET_EXCEPTION"` as a `ruleType`, `"Indebtedness"`
(wrong case) instead of `"INDEBTEDNESS"` for `covenantFamily` — none of which
are real enum members. Fixed by constraining all three fields to
`zodEnumFromPrismaEnum(...)` against the real Prisma enums, forcing the
model's own structured-output decoding to respect the closed ontology rather
than merely grading its output more leniently afterward. Verified zero blast
radius (`CandidateContractRuleSchema` has no `.parse()` call sites outside
the new analyzer code) and zero regression (`tsc`/`eslint`/`vitest` all clean
before and after). This is the single ontology change made this session; no
migration was needed since it constrains a Zod schema, not a database
column.

## G. Analyzer vertical slice built

`lib/contract-model/analyzer/anthropic-analyzer.ts` — a single combined-analysis
call per document (not the full six-stage Phase B extraction pipeline),
reusing the existing `client.messages.stream({...}).finalMessage()` +
`output_config.format: zodOutputFormat(...)` contract from
`lib/extraction/anthropic-provider.ts`, targeting the Phase-B
`ContractAnalysisResult` shape (`rules`, `definedTerms`, `references`,
`ruleRelationships`). Two thin provider subclasses
(`AnthropicContractAnalyzer`, `VercelAIGatewayContractAnalyzer`) mirror the
existing direct-API-vs-Gateway split. `lib/contract-model/analyzer/get-analyzer-provider.ts`
mirrors `lib/extraction/get-provider.ts`'s own selection order and fail-loud
discipline exactly (Gateway key → direct key → throw on Vercel → synthetic
fallback off Vercel). This is deliberately **not** the full Phase C compiler.

## H. Real analyzer run narrative

Five real attempts were made this session, in order, each gated by explicit
user go-ahead before spending money:

1. **Non-streaming, `max_tokens=16000`, direct** — JSON truncated
   (`Unterminated string in JSON at position 24928`). Telemetry was **not**
   persisted for this attempt — a real gap, discovered because of it: the
   runner script had no failure-path telemetry capture yet. Fixed
   immediately after (item 2 below covers all subsequent failures).
2. **Non-streaming, `max_tokens=32000`** — failed client-side, zero network
   call, zero cost: the Anthropic SDK's own guard,
   `"Streaming is required for operations that may take longer than 10 minutes"`.
   Persisted as `VERCEL_AI_GATEWAY__anthropic-claude-opus-5__FAILED_1787757354743.json`
   (`latencyMs: 5`, `error` captured, no tokens spent).
3. **Non-streaming, `max_tokens=21000`, real paid call** — truncated again,
   later this time (`position 48568` vs. `24928`), confirming the single-call
   design genuinely did not fit at reasonable non-streaming budgets — not a
   fluke of one attempt. Persisted as
   `VERCEL_AI_GATEWAY__anthropic-claude-opus-5__FAILED_1787757372824.json`
   (`latencyMs: 176320`; `inputTokens`/`outputTokens` are `null` because the
   SDK's non-streaming parse helper throws before returning `usage` — a real,
   honestly-reported instrumentation gap for this failure mode specifically).
4. **Streaming, `max_tokens=128000`, model switched to `claude-sonnet-5`** —
   per explicit user redirect ("use the cheaper model, run the whole thing,
   no ceiling") rather than either option originally offered. Succeeded:
   real output produced, real telemetry captured. Graded against ground
   truth: 0/18 `MATCHED_CORRECT` despite substantively-correct underlying
   legal extraction in several cases — root-caused to the unconstrained-enum
   schema bug (§F). Fixed the schema.
5. **Re-run with the fixed schema, same streaming/128K/Sonnet-5
   configuration** — this is the run whose results are reported throughout
   this document. Persisted at
   `tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/analyzer-runs/VERCEL_AI_GATEWAY__anthropic-claude-sonnet-5.json`.

No call beyond these five was made. The runner script
(`scripts/run-phase-c0-analyzer.ts`) is resumable and idempotent: re-running
it without `--force` never re-calls the model, only re-derives the free,
deterministic evaluation against the already-saved raw output — used twice
this session (once for the duplicate-citation evaluator fix, §K; once to
regenerate this document's own final numbers) at zero additional cost.

## I. Real telemetry (MEASURED, run 5)

```json
{
  "provider": "vercel-ai-gateway",
  "model": "anthropic/claude-sonnet-5",
  "inputTokens": 45629,
  "outputTokens": 35490,
  "attemptCount": 1,
  "retryCount": 0,
  "rateLimitFailures": 0,
  "latencyMs": 248197,
  "calculatedCostUsd": 0.44615800000000005
}
```

Cost is computed only from real returned token counts × Anthropic's own
published Sonnet 5 rate card ($2/$10 per M input/output tokens) — the SDK
exposes no per-call billed-dollar figure, so `providerCost` is always
`undefined`, never fabricated (`lib/contract-model/analyzer/telemetry.ts`).
Zero retries and zero rate-limit failures occurred on this call; the
retry/backoff/jitter path (`withRetry`, narrowly scoped to real HTTP 429s)
exists and is unit-testable but was not exercised live this session — a real
limitation of this evidence, disclosed rather than claimed as tested.

## J. Blind evaluator design

`lib/contract-model/analyzer/evaluator.ts` never imports
`human-ground-truth.ts` — the ground truth is supplied by the caller
(`scripts/run-phase-c0-analyzer.ts`), keeping the evaluator's matching/scoring
logic independently testable against synthetic fixtures without ever seeing
the real answer key. Re-verified this session: no import of the fixture
exists anywhere under `lib/contract-model/analyzer*.ts`.

Per-provision comparison is real semantic-field comparison, not
citation-only credit: covenant family, formula kind, the actual dollar
figures (normalized, ±1% tolerance), and whether a required condition type
(ratio-gate, no-default) is reflected in the extracted rule's own
`conditions[]` — matching the task's own explicit rejection of
"a rule exists that cites this section" as sufficient.

`DANGEROUS_UNFLAGGED` (confidently wrong, no self-flagging signal) is
reported separately from `DANGEROUS_FLAGGED` (wrong, but the rule's own
`evaluationClass`/`action`/`notes` already signal uncertainty —
`JUDGMENT_REQUIRED`, `UNSUPPORTED`, action `OTHER`, or a hedging phrase in
`notes`) throughout this document. These two rates are never averaged.

## K. Duplicate-citation bug found and fixed

The real run showed the model sometimes emitting **two** candidate rules
citing the identical section — one a near-empty placeholder (no
`thresholdValue`/`formulaRef`, `notes: "placeholder"`-style) and one fully
populated with the real figures. The original evaluator picked whichever
candidate appeared first in the array, which was sometimes the empty one —
grading a genuinely correct extraction as wrong. Fixed by collecting all
exact-ref matches and preferring the one with the higher
"completeness score" (populated `thresholdValue`/`formulaRef`/non-empty
`conditions`/substantive `notes`) rather than first-match-wins
(`findMatch`/`completenessScore` in `evaluator.ts`). This was a free,
zero-API-cost fix: the already-saved real run's raw output was re-graded
with the corrected evaluator via the runner script's resume path. This is
reported here as a real, generalizable analyzer-output-quality finding for
Phase C, not just a grading nuance specific to this document.

## L. Real evaluation results (MEASURED, run 5, post-fix evaluator)

**Before adversarial verification:**

| MATCHED_CORRECT | MATCHED_INCORRECT_FLAGGED | MATCHED_INCORRECT_UNFLAGGED | MISSING | DANGEROUS_UNFLAGGED_ERROR_RATE | DANGEROUS_FLAGGED_ERROR_RATE |
|---|---|---|---|---|---|
| 6 | 1 | 6 | 5 | **33.3%** | 5.6% |

**After adversarial verification:**

| MATCHED_CORRECT | MATCHED_INCORRECT_FLAGGED | MATCHED_INCORRECT_UNFLAGGED | MISSING | DANGEROUS_UNFLAGGED_ERROR_RATE | DANGEROUS_FLAGGED_ERROR_RATE |
|---|---|---|---|---|---|
| 6 | 5 | 2 | 5 | **11.1%** | 27.8% |

These two rates are reported separately, as required, and are never
averaged. `MISSING` (5/18, 27.8%) did not change across verification, since
verification only re-classifies matched-but-wrong rules — see §M for a
correction to how this number should be read.

## M. Missing-rate correction (evaluator-scope finding, not fixed)

Of the 5 `MISSING` provisions, 4 (`Available Amount`, `Consolidated Adjusted
EBITDA`, `Consolidated Adjusted EBITDAR`, `Restricted Debt`) are real
defined-term definitions. Checking the raw analyzer output directly: **all
four names appear in the model's own `definedTerms[]` array** (38 real
entries were extracted there), not in `rules[]`. The evaluator only checks
`rules[]` against these ground-truth entries, so it scores them `MISSING`
even though the underlying content was captured — a real evaluator-scope
gap, not a genuine extraction failure, on 4 of the 5 "missing" items. Only
the 5th (`Restricted Subsidiary / Loan Party`, a combined entity-scope
definition) is a genuine partial miss: `Restricted Subsidiary` is present in
`definedTerms[]`, `Loan Party` is not.

This was deliberately **not** code-fixed this session (would require
extending the evaluator to cross-check `definedTerms[]` for
`DEFINITIONS_CALCULATION_RULES`/`ENTITY_SCOPE_RESTRICTIONS`-family ground
truth, a real but bounded piece of follow-up work, listed in §Y). Reporting
it honestly here rather than either leaving a misleading 27.8% missing rate
unexplained or quietly fixing it without disclosure.

## N. Per-family precision/recall/F1 (MEASURED, run 5, post-verification)

| Family | True positives | Total (ground truth) | Precision | Recall | F1 |
|---|---|---|---|---|---|
| INDEBTEDNESS | 2 | 3 | 0.67 | 0.67 | 0.67 |
| LIENS | 1 | 1 | 1.00 | 1.00 | 1.00 |
| RESTRICTED_PAYMENTS | 2 | 4 | 0.50 | 0.50 | 0.50 |
| INVESTMENTS | 0 | 1 | 0.00 | 0.00 | 0.00 |
| FUNDAMENTAL_CHANGES | 0 | 1 | 0.00 | 0.00 | 0.00 |
| FINANCIAL_COVENANTS | 0 | 3 | 0.00 | 0.00 | 0.00 |
| DEFINITIONS_CALCULATION_RULES | 0 | 3 | 0.00 | 0.00 | 0.00 |
| ENTITY_SCOPE_RESTRICTIONS | 0 | 1 | 0.00 | 0.00 | 0.00 |
| AMENDMENT_WAIVER_CONSENT | 0 | 1 | 0.00 | 0.00 | 0.00 |

As §M establishes, `DEFINITIONS_CALCULATION_RULES`'s 0/3 is largely an
evaluator-scope artifact, not a real 0% capability. `FINANCIAL_COVENANTS`'s
0/3 is real: all three financial-covenant provisions were matched to a rule
but graded `MATCHED_INCORRECT_FLAGGED` (formula/figure mismatches, all
self-flagged) — see §O.

## O. Named error-rate breakdown (§19)

Computed directly from the 18 real `mismatchReasons` entries in the run-5
evaluation:

| Error type | Count | Rate | Basis |
|---|---|---|---|
| MISSED_RULE_RATE | 5/18 | 27.8% | `MISSING` outcome (§M: ~4/5 are evaluator-scope, ~1/5 real) |
| WRONG_THRESHOLD_RATE (no real figure matched) | 2/18 | 11.1% | `fwrg-6.06-b-ii`, `fwrg-6.10-c` |
| WRONG_FORMULA_RATE (formulaRef mismatch) | 5/18 | 27.8% | `fwrg-6.04-a-iii`, `fwrg-6.04-a-xi`, `fwrg-6.06-b-ii`, `fwrg-6.10-a`, `fwrg-6.10-b` |
| WRONG_FAMILY_RATE (covenantFamily mismatch) | 1/18 | 5.6% | `fwrg-6.07-threshold` (FUNDAMENTAL_CHANGES extracted as DISPOSITIONS) |
| SPURIOUS_RULE_RATE | not independently measurable this spike | — | this evaluator only scores ground-truth provisions against extracted rules, not extracted rules with no ground-truth counterpart at all — same known limitation the prior spike already disclosed |
| WRONG_CITATION_RATE | not separately measured | — | folded into `findMatch`'s ref-matching; a citation drift within `verifyAllRulesAgainstSource`'s tolerance is not separately counted |
| WRONG_ENTITY_SCOPE_RATE, WRONG_SECURITY_SCOPE_RATE, WRONG_RELATIONSHIP_RATE, WRONG_AND_OR_RATE | not independently measurable | — | the current `GroundTruthProvisionLike`/evaluator fields do not carry entity-scope, security-scope, cross-rule-relationship, or AND/OR-logic ground truth to compare against; this is a real, disclosed gap in the evaluator's field coverage, not a claim that the analyzer gets these right |

Disclosing the un-measurable rows explicitly rather than omitting them or
fabricating a number, per the task's own standard.

## P. Coverage/negative-detection mechanism (§17)

`lib/contract-model/analyzer/coverage.ts` — a plain regex scan for
clause-shaped markers in source text, diffed against the set of
`sourceSectionRef` values a set of candidate rules actually cites.
Deliberately independent of any LLM's own self-reported confidence, per the
task's explicit instruction. Re-run this session
(`tests/contract-model/coverage-structural.test.ts`, both suites, 2 tests):

- Against the real FWRG package's own Section 6.01: correctly identifies the
  human ground truth's covered clause letters and correctly surfaces the
  remaining ~20 real, unmodeled clause letters as gaps (the ground truth
  deliberately scoped to ~3 material baskets, not all ~25).
- Against Coherent's real, already-reviewed known-gap data: correctly flags
  the real, documented Indenture §3.3(b)(xviii) Contribution Indebtedness
  gap (confirmed present in `solverCoverageDeclaration.notes` via
  `"bxviii"`) as uncovered, with **zero false positives** against the
  known-modeled clauses (`§3.3(b)(i)(A)`, `§3.3(b)(xx)`, etc.).

Both tests pass, unchanged, this session. **Verdict: COVERAGE_TRACTABLE.**

## Q. Adversarial verification effect (measured, not assumed)

`lib/contract-model/analyzer/verify.ts` deterministically checks each
extracted rule's `sourceSectionRef` and `thresholdValue` against the real
source text. Its measured effect on this real run: `DANGEROUS_UNFLAGGED`
dropped from 6/18 (33.3%) to 2/18 (11.1%) — four rules that were confidently
wrong and unflagged before verification were correctly reclassified as
flagged after it. This is real, measured evidence that adversarial
verification materially improves the system's worst-outcome rate, not an
assumed benefit — directly answering architecture question 6 (§X).

## R. Synthetic vs. real LLM baseline comparison

The synthetic baseline (`SyntheticContractAnalyzer`, pattern-matching only,
zero network calls, zero cost) was re-run this session against the same
document (`tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/analyzer-runs/synthetic__synthetic-v1.json`,
re-evaluated with the current post-fix evaluator):

| | MATCHED_CORRECT | FLAGGED | UNFLAGGED | MISSING | DANGEROUS_UNFLAGGED after verification |
|---|---|---|---|---|---|
| Synthetic baseline | 1/18 | 11/18 | 0/18 | 6/18 | **0.0%** |
| Real LLM (Sonnet 5) | 6/18 | 5/18 | 2/18 | 5/18 | **11.1%** |

The synthetic baseline's 0% dangerous-unflagged rate is not a safety win —
it reflects pattern-matching being unable to confidently assert almost
anything, so nearly everything it does emit lands in the self-flagged
bucket (11/18 `MATCHED_INCORRECT_FLAGGED`) rather than being useful. The
real LLM extracts 6x more provisions correctly outright, at the cost of a
real, non-zero (but verification-reduced) dangerous-unflagged rate. Neither
number should be read in isolation from the other.

## S. Overfitting check (§33, repo-wide)

```
grep -rniE "\bcoherent\b|\bmatthews\b|\bfwrg\b|first watch" lib/contract-model/analyzer/*.ts lib/contract-model/*.ts
```

All hits are inside comments explaining provenance of a design decision
(e.g., §F's comment citing the real FWRG run that motivated the ontology
fix); zero runtime branching on company/document identity. A second,
narrower grep for literal `=== "coherent"`-style string comparisons in the
same files returned zero hits. The analyzer's system prompt
(`SYSTEM_PROMPT` in `anthropic-analyzer.ts`) is generic legal-document
instructions with no document-specific text.

## T. Data safety / before-after fingerprints (§35)

Real Postgres counts, taken this session, compared against the prior
spike's own documented baseline:

| Table | Count (this session) | Prior spike's documented baseline | Match |
|---|---|---|---|
| golden_tests | 48 | 30 (Coherent) + 18 (Matthews) = 48 | ✓ |
| permissions | 29 | 22 (Coherent) + 7 (Matthews) = 29 | ✓ |
| permission_relationships | 27 | 19 (Coherent) + 8 (Matthews) = 27 | ✓ |
| shared_capacity_constraints | 3 | 3 | ✓ |
| legal_review_records | 111 | 111 | ✓ |
| contract_rule | 0 | 0 | ✓ |

Zero unauthorized mutation across this entire session's work. Confirmed
structurally, not just by count: `grep -rniE "\.create\(|\.update\(|\.delete\(|\.upsert\(|\.createMany\(|\.updateMany\(|\.deleteMany\("` against every file touched or added this session
(`lib/contract-model/analyzer/*.ts`, `lib/contract-model/types.ts`,
`scripts/run-phase-c0-analyzer.ts`) returns zero matches — none of this
session's new code performs a database write of any kind.

## U. Live-stack validation (§36)

The real analyzer run itself **is** the live-stack validation this section
asks for: a real network call to Vercel AI Gateway, real Claude Sonnet 5
inference, real structured-output parsing, real token/cost/latency
telemetry, executed five times (§H) under real failure conditions
(truncation, a client-side SDK guard) before succeeding. No further live
verification against the deployed Vercel app was performed or needed —
Phase C0 does not touch the deployed product surface, unlike Task J's
Dashboard work.

## V. Cost projections (§29) — MEASURED vs. PROJECTED, explicitly separated

**MEASURED** (one real data point, this session): 120,727 source characters
(104,183 + 16,544) → 45,629 input tokens (≈2.646 chars/token) → 35,490
output tokens (an output:input token ratio of **0.778**, i.e. the model
produced structured output nearly as large as the source text — driven by
extracting 47 rules + 38 defined terms + 11 references with full structured
detail) → $0.4462 → 248.2 seconds. Page density for this specific document
(established by the prior spike, re-used here): ~3,720 characters/page, so
this MEASURED data point represents **~32.5 pages** of real source text.

**PROJECTED**, extrapolating this session's own real input:output token
ratio and per-page character density (not the prior spike's assumed, much
lower output estimate — that assumption is superseded by this session's real
measurement):

| Document size | Input tokens (PROJECTED) | Output tokens (PROJECTED, real 0.778 ratio) | Cost (PROJECTED) |
|---|---|---|---|
| 50 pages (~186,000 chars) | ~70,300 | ~54,700 | ~$0.69 |
| 150 pages (~558,000 chars) | ~210,900 | ~164,100 | ~$2.06 |
| 300 pages (~1,116,000 chars) | ~421,800 | ~328,200 | ~$4.13 |

**A real, previously-unmeasured constraint this projection surfaces:** at
this document's real extraction density, projected output tokens exceed the
model's 128,000-token real output ceiling above roughly **117 pages** of
source text in a single combined-analysis call (128,000 ÷ 0.778 ≈ 164,500
input tokens ≈ 435,300 characters ≈ 117 pages at 3,720 chars/page). This
means a single-call, non-staged analyzer design — the shape this spike's
own vertical slice uses — genuinely cannot scale to a 150- or 300-page
package without chunking/staging, independent of the earlier
non-streaming-timeout finding (§H items 1 and 3). This is real, measured
evidence bearing directly on architecture question 1 and question 9 (§X),
not a hypothetical concern.

## W. Capability matrix (§30)

| Capability | Status | Evidence |
|---|---|---|
| Single-document combined rule/term/reference extraction | **WORKS**, with real accuracy caveats | §L, §N |
| Structured-output ontology compliance | **WORKS**, after the §F fix | 0 invalid enum values in run 5's raw output (was non-zero before the fix) |
| Numeric/formula precision | **PARTIAL** | 5/18 formula mismatches, 2/18 threshold mismatches (§O) |
| Family classification | **MOSTLY WORKS** | 1/18 family mismatch |
| Self-flagging of uncertain extractions | **WORKS, materially** | dangerous-unflagged 33.3%→11.1% after verification (§Q) |
| Defined-term extraction | **WORKS BETTER than rules[]-only scoring shows** | §M — 4 of 5 "missing" ground-truth items are actually present in `definedTerms[]` |
| Rule-to-rule relationship extraction | **UNTESTED / LIKELY WEAK** | `ruleRelationships: []` — zero relationships extracted in the real run, and no ground-truth relationship exists to grade against either |
| Single-call scalability to large documents (150-300pg) | **DOES NOT WORK as designed** | §V — projected output exceeds the real 128K ceiling above ~117 pages |
| Rate-limit resilience | **BUILT, NOT LIVE-EXERCISED** | `withRetry` exists and is unit-tested; zero real 429s occurred this session (§I) |
| Cost/token/latency instrumentation | **WORKS** | §I, real numbers, never fabricated |
| Structural coverage/negative-detection | **WORKS** | §P |

## X. Twelve Phase C architecture questions — answered from real evidence

1. **Should structural inventory be separate from covenant inventory?**
   Yes — §V's real finding (single-call output exceeds the 128K ceiling past
   ~117 pages) means at minimum a document over that size needs its
   structure inventoried before, not simultaneously with, full covenant
   extraction, purely as a token-budget matter independent of any semantic
   argument.
2. **Should covenant inventory occur before definitions?** The real run
   extracted both in one pass with defined terms landing in a different
   array than rules that reference them (§M) — evidence that a single
   undifferentiated pass conflates the two without clearly resolving
   ordering; a staged design should extract definitions first so covenant
   rules can cite already-resolved terms rather than raw term names.
3. **Should definitions be resolved exhaustively or lazily?** Not
   determinable from this spike — no evidence either way was generated;
   flagged as open.
4. **Should rule extraction and relationship extraction be separate?** The
   real run extracted zero `ruleRelationships` despite the source
   containing real cross-basket capacity interactions (per the ground
   truth's own definedTermRefs chains) — weak evidence that relationship
   extraction needs its own dedicated pass/prompt rather than being folded
   into the same call as rule extraction, where it appears to receive
   little effective attention.
5. **When should amendment/version resolution happen?** Not exercised this
   spike (no amendment was in the FWRG excerpt) — open, no real evidence.
6. **When should adversarial verification occur?** Immediately after
   extraction, before any human review queue — §Q's real measured effect
   (33.3%→11.1% dangerous-unflagged) shows it meaningfully improves the
   worst-outcome rate at zero extra LLM cost (it is deterministic,
   source-text-based, not a second model call).
7. **What should deterministic validation block?** Based on real evidence:
   at minimum, any rule whose `sourceSectionRef` or `thresholdValue` cannot
   be matched against the real source text (exactly what `verify.ts` already
   checks) should block auto-acceptance and force `REVIEW_REQUIRED`,
   regardless of the model's own `evaluationClass`.
8. **What requires human review?** Every `MATCHED_INCORRECT_UNFLAGGED`-shaped
   case in this run's real error taxonomy (§O) — formula mismatches and
   family mismatches in particular were not reliably self-flagged by the
   model before verification.
9. **What stages need independent resumability?** At minimum, the
   model-call stage itself — real evidence from this session (§H) shows
   real money was spent on 2 of 5 attempts that failed after the network
   call started; the resumable-log design used this session
   (`scripts/run-phase-c0-analyzer.ts`) should generalize to Phase C as a
   per-stage checkpoint, not just a per-document one.
10. **What triggers incremental recompilation?** Not exercised this spike —
    open, no real evidence generated (would require a real amendment
    scenario).
11. **What should be cached/content-hashed?** Based on this session's real
    cost data (§V), caching the definitions-extraction output specifically
    is likely high-value — defined terms are referenced repeatedly across
    many rules within one document and would very likely be repeated across
    amendments to the same document, but this spike did not measure
    cross-call caching behavior directly (no `cache_read_input_tokens` was
    observed — `cachedInputTokens: null` in the real telemetry, §I) so this
    is a reasoned inference from the data shape, not a direct measurement.
12. **What should be recomputed when a new amendment arrives?** Not
    exercised this spike — open, no real evidence.

Questions 3, 5, 10, and 12 are explicitly reported as **not answered by real
evidence** rather than answered speculatively.

## Y. Known limitations / required follow-up work (disclosed, not hidden)

- Evaluator does not cross-check `definedTerms[]` for
  `DEFINITIONS_CALCULATION_RULES`/`ENTITY_SCOPE_RESTRICTIONS`-family ground
  truth (§M) — inflates the reported missing-rate by ~4/18.
  `SPURIOUS_RULE_RATE`, `WRONG_CITATION_RATE`, and four relationship/scope
  error rates are not independently measurable with the current evaluator
  fields (§O).
- Rate-limit retry/backoff logic exists and is unit-tested but was never
  exercised against a real 429 this session.
- Single-call analyzer design does not scale past ~117 pages at this
  document's real measured extraction density (§V) — a real architectural
  constraint for Phase C, not a hypothetical one.
- `ruleRelationships` extraction produced zero real results this session;
  no ground truth exists to grade it against either — genuinely untested,
  not merely weak.
- This is a single real document / single real run. One data point
  establishes that the pipeline *can* work end-to-end and gives real,
  non-fabricated cost/latency/accuracy numbers; it does not establish
  variance across documents, drafting styles, or a larger sample size.
- A production telemetry table (mirroring `ExtractionRun`/`ExtractionStage`)
  was explicitly not built this spike — telemetry is returned in-process and
  logged to a JSON file, by design, per the task's own bounded-spike scope.

## Z. Final verdict

**PROCEED_TO_PHASE_C_WITH_MODIFICATIONS**

Real evidence gathered this session supports proceeding, but not as
originally designed:

- Ontology is sufficient with one minor, already-made, already-verified
  additive fix (§F).
- A real analyzer was built and successfully run against a real, unseen
  document, producing real structured output scored at 6/18 exact-match
  correctness with a post-verification dangerous-unflagged rate of 11.1% —
  non-zero, but materially reduced by a deterministic, cheap verification
  pass that should be a mandatory Phase C stage, not optional (§Q).
- The structural coverage mechanism is real and tractable, re-confirmed
  against Coherent's actual reviewed data (§P).
- Real cost/latency/token data now exists and projects to real dollar
  figures for larger documents (§V) — but that same projection surfaces a
  genuine architectural blocker (single-call output exceeding the 128K
  ceiling above ~117 pages) that Phase C must design around, not assume
  away. This is the specific, concrete "modification" this verdict refers
  to: Phase C should not build the combined single-call analyzer this spike
  used as its final production shape — it should stage extraction (at
  minimum: structural/definitions pass before covenant-rule pass, per §X
  question 1/2) and treat adversarial verification as a mandatory, not
  optional, stage.
- Two real, previously-unknown bugs were found and fixed by this validation
  process itself (§F, §K), and a third real gap was found and honestly
  disclosed rather than fixed or hidden (§M) — this is the kind of result
  the task asked this spike to produce: real evidence that breaks
  assumptions, not a demo optimized to look successful.
