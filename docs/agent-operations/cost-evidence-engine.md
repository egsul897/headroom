# Cost forensics and evidence engine

Starting SHA: `e7ed886086030f743728c56495c89371616f16ff`

DEVELOPMENT ≠ CERTIFIED. No paid provider call was made for this work. Cache reuse does not certify anything. The proposed $5 experiment cap is not an authorization.

Haiku (`anthropic/claude-haiku-4.5`) is not on rate card `headroom-pricing.v1 (2026-09)`. `priceUsage` returns `UNKNOWN_MODEL`. Figures below that use $1 per million input tokens and $5 per million output tokens are the list arithmetic already stored by the development runner. They are not gateway invoices. Where a settled total and a token arithmetic differ, both are shown and the difference is explained from retained fields.

Missing cache-hit counts are missing. They are not zero hits.

## Ranked cost drivers

### 1. Shard conversations that produced no verified rule

Source: `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/verification.json`

`spend.exactSpendUsd` is `8.777854`. `costStatus` is `EXACT` on 16 attempts. `stop.reason` is `GATEWAY_CREDIT_EXHAUSTED` / `insufficient_funds`. The shown ceiling is `162.63`. That ceiling was not reached. It is a Haiku scaling of a Chewy review observation, not a rate-card price, and it was not the amount spent.

`committedUsd` on each attempt is a running total. Incremental cost is the delta. Summing the running totals would invent a much larger spend. The 16 positive deltas sum to `8.777854`.

The first two attempts are both `7.05(c)`, 4,626 characters, status `FAILED`, 0 rules, verification not called:

| attempt | incremental USD | input tokens | output tokens | shape note |
| --- | ---: | ---: | ---: | --- |
| 7.05(c) first | 1.053934 | 891,734 | 32,440 | conversations 11 > reserved 5 |
| 7.05(c) second | 1.590491 | 1,449,301 | 28,238 | conversations 10 > reserved 5 |

Together `2.644425` for no rules. Each reserved about `14.99484` before the call. The reservation is the worst-case shape, not the settled charge.

Across the 16 billed attempts the compile input tokens sum to `7,217,389` and output tokens to `210,075`. At the $1/$5 list rates that arithmetic is `8.267764`. The remaining `0.510090` is `verify.costUsd` on the attempts whose verification object carries a positive cost. `8.267764 + 0.510090 = 8.777854`.

Those verification results are `MATERIAL_DISCREPANCY` or `VERIFICATION_FAILED`. Zero attempts have `VERIFIED_NO_MATERIAL_GAP_FOUND`. Emitted rules on the 16 attempts: 74. Verified rules: 0. Cost per verified rule is not computable. Cost per emitted rule on this settled total is `8.777854 / 74 = 0.118620`. Those rules are not accepted evidence. Cost per newly resolved blocker is not in the record.

### 2. Contents-sized rows were compiled and partly verified

Five billed attempts are the 39-character `7.04` rows and the 40-character `7.05` row. Incremental spend `1.72644`. The development report identifies those character counts as table-of-contents lines. The 39-character rows emitted 21 rules and the verification status on the first three is `MATERIAL_DISCREPANCY`. The fourth 39-character row and the 40-character row failed with 0 rules. This is measured spend on sources the operative-authority gate now refuses before dispatch. The dollars were already spent; they are not a measured saving from a rerun.

### 3. Credit exhaustion was recorded as failed attempts, not as free sections

35 attempts after the billed prefix have 0 input tokens, 0 output tokens, and a zero incremental delta. `committedUsd` stays `8.777854`. Those rows are refusals after `insufficient_funds`. A zero delta there is not a priced section and not evidence that the section has no rules.

### 4. Pass B tokens are measured. Pass B dollars are not on the rate card.

Source: `development-pipeline/execution.json` `passB`.

| field | retained value |
| --- | --- |
| provider | `VERCEL_AI_GATEWAY` |
| model | `anthropic/claude-haiku-4.5` |
| modelCalls | 140 |
| sectionFailures | 1 |
| finalCandidateCount | 842 |
| inputTokens | 433,957 |
| outputTokens | 172,238 |
| cache hits | not recorded |
| invoice USD | not recorded |

List arithmetic at $1/$5 is `1.295147`. `priceUsage` on these tokens is `UNKNOWN_MODEL`. Do not book `1.295147` as a charge.

The discovery record does not store which section failed, and it does not store per-section tokens. Cost per section for Pass B is not reconstructable. Cost per accepted discovery row is not reconstructable: 842 rows were retained, and acceptance is not a field on the token totals.

### 5. Article VII compile is a separate measured list-price total

Source: `development-pipeline/article-vii-compile.json`

| field | retained value |
| --- | --- |
| attempts | 6 |
| spentUsd | 1.079528 |
| input tokens | 369,103 |
| output tokens | 142,085 |
| conversations | 6 |
| refinements | 5 |
| rules | 82 |
| status | `REVIEW_REQUIRED` on every attempt |
| certified | false |
| price basis | Haiku list, and the file says `priceUsage` has no Haiku card |

`1.079528 / 82 = 0.013165` list dollars per emitted rule. Verified rules: 0. Cost per verified rule is not computable. No cache-hit field.

### 6. The per-call reservation is much larger than the settled charge

Each billed verification attempt records `reservationUsd` of about `14.99` to `15.59`. Settled increments on those same attempts are `0.061116` to `1.590491`. A hard ceiling of the proposed $5 cannot start a call whose worst-case reservation is $15. That is a property of the historical output cap (128,000 tokens) priced as if it will be spent. It is not a new invoice.

### 7. Other retained totals, with their labels

| source | figure | label |
| --- | ---: | --- |
| `docs/phase3-final-closure/08-provider-health-and-cost.json` | 150.49 against a 150.00 gateway limit, dated 2026-09-02 | gateway account message, not a stage breakdown |
| same file, `cumulativeRealValidationSpendToDate.totalUsd` | 31.41 | sum of named holdout and partial whole-agreement components in that artifact |
| `docs/phase-3-final-601/24-clean-rerun-cost-ledger.json` | 5.291298 spent, cap 15.84, 14 calls, all Pass A | settled ledger; gateway balance 29.057528 before, 23.76623 after; sampled calls have `cacheRead` 0 |
| `docs/phase-3-remediation-f5-3/06-final-summary.json` `phase3ChewyPaidRun.totalUsd` | 13.9612 | recorded split: Pass A run 1 `4.2283`, run 2 `1.9005`, discovery `4.6551`, compile `2.8481` |
| `docs/phase-3-final-chewy/02-cost-preflight.json` estimates | 132.56 mean, 202.26 worst observed, 252.83 conservative | pre-run model, the artifact says 0 model calls |

Prompt-cache discounts and batch discounts are not implemented for the Vercel AI Gateway in `lib/contract-model/analyzer`. Direct-provider cached rates on the Sonnet, Opus, and DeepSeek cards are not applied to gateway traffic. No historical gateway cache-hit dollar saving is in these records.

## What the engine does

Module: `lib/contract-model/compiler/evidence-engine/`.

- A reuse key binds source hash, document, operative version, dependency hashes, prompt version, schema version, model, inference config, stage, compiler version, and artifact kind. Raw provider output, parsed candidates, semantic IR, verification findings, and certification evidence are separate records.
- A hit requires a complete record, a matching payload sha256, and no uncertain operative version or dependency. A hash mismatch is `CORRUPT`. A partial record is not complete. Every read sets `advancesCertification` false, including certification-evidence records.
- Invalidation walks ancestors of each stage output. A changed clause, definition, prompt, or parser invalidates only the outputs that depend on it. An uncertain ancestor blocks reuse of its dependents and leaves an unrelated output reusable.
- Preflight rejects a missing structural identity and any occurrence that is not `OPERATIVE_OCCURRENCE`, including a contents listing, before it reserves money. Incomplete source and an in-flight duplicate are deferred. Missing or over-budget required context is `NEEDS_CONTEXT` with the fragment omitted whole, not truncated.
- Routing is a configured model per task class. Deterministic work and unsupported constructs do not call a model. A class with no configured model is a refusal, not a step up to a dearer model. A high-risk route sets `legalCorrectnessProven` false and `reviewRequired` true.
- Verification order is false permission, missing material restriction, wrong operative source, amendment precedence, unsupported unlimited capacity, then high-impact cross-document dependency. `SAMPLE_DIAGNOSTIC` is not exhaustive and does not certify. `EXHAUSTIVE_CERTIFICATION` names every candidate and still does not itself grant certification.
- Default authorization is `NO_PAID_CALLS`. `DEVELOPMENT_EXPERIMENT` may set a ceiling up to the proposed $5. A higher ceiling requires `FOUNDER_AUTHORIZED` with a non-empty authorization id. Dispatch reserves the worst case through `HardDispatchBudget`. An unbilled retry keeps the reservation. Two outstanding reservations that together exceed the ceiling are refused. An unpriceable model, including Haiku, is not sent.

## Economics comparison

| approach | what can be said | status |
| --- | --- | --- |
| Historical full verification run | 16 billed attempts, `$8.777854` settled, 74 emitted rules, 0 verified rules. Pass B tokens measured, dollars unknown. Contents-sized attempts inside the settled total: `$1.72644`. | measured |
| Incremental cache-first | Identical contract returns the stored output and does not reserve a call. No historical hit rate is retained, so no dollar saving is booked. | mechanism proven offline; savings hypothetical |
| Preflight before a provider call | A contents listing reserves `$0`. The historical contents-sized `$1.72644` is a counterfactual on rows already paid, not a new measurement. | mechanism proven offline; the dollar figure is counterfactual |
| Tiered models | Haiku remains `UNKNOWN_MODEL`. Sonnet and DeepSeek have rate cards. No quality comparison was run. No saving is booked. | not proven |
| Gateway prompt cache or batch | Not implemented. Historical sampled Pass A calls record `cacheRead` 0. Assumed discount is `$0`. | not available |

Cost per useful new evidence item, historical verification: not computable, because verified rules are 0. Cost per emitted unverified rule on the settled `$8.777854` is `$0.118620`. Article VII list cost per emitted unverified rule is `$0.013165`. Neither number is a cost per certified or verified rule.

## Smallest future experiment

Do not rerun the 788-row verification.

One founder-authorized development experiment at or below the proposed $5, on a single operative section that already has a complete evidence record, plus one edited dependent clause and one unrelated clause:

1. Preflight must reuse the unrelated clause and must not reserve it.
2. Preflight must refuse a contents line and must not reserve it.
3. Preflight may reserve only the edited clause, at the worst case of the configured output cap, and only if that reservation fits the authorized ceiling.
4. If the reservation does not fit, the experiment stops with no call.
5. Compare settled tokens on that one call with the retained incremental cost of the same section ref. That comparison is the first measured saving. Until it exists, the saving is hypothetical.

## Offline tests

`npx vitest run tests/contract-model/compiler/evidence-engine.test.ts` — 11 passed.

`npx tsc --noEmit -p .` — exit 0.

The Gibraltar assertions in that file re-read the sealed verification and execution JSON. They check the settled `$8.777854`, 16 exact attempts, 35 zero-token refusals, 74 emitted rules, no verified status, contents-sized `$1.72644`, and Pass B token counts. They do not rewrite those files.
