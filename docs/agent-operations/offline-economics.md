# Offline economics — broad population versus a question plan

No paid provider call was made. `measuredBillingUsd` on the question plan is null. `measuredProviderCalls` is 0. Local elapsed time is not a dollar figure. Estimated reservation arithmetic is not a measured saving.

## Measured historical charges (unchanged sealed records)

| source | measured fact |
| --- | --- |
| `verification.json` | `exactSpendUsd` 8.777854 on 16 exact attempts. 74 emitted rules. 0 verified. 788 rows marked dispatchable. 35 later attempts are zero-token refusals after gateway credit exhaustion, not priced sections. |
| Contents-sized attempts inside that settled total | 1.72644. Already spent. Not a measured saving from the refusal that now happens before dispatch. |
| `execution.json` Pass B | 140 calls, 433,957 input tokens, 172,238 output tokens. Dollars UNKNOWN. Haiku is not on rate card `headroom-pricing.v1 (2026-09)`. |
| Article VII compile record | `spentUsd` 1.079528 list arithmetic, 6 attempts, 82 rules, all review-required, certified false. |

Missing invoices stay UNKNOWN. They are not $0.

## Measured local execution (this change)

| command | result |
| --- | --- |
| `npx vitest run tests/contract-model/compiler/question-plan.test.ts --testTimeout 30000` | 10 passed. Vitest reported 12 ms of test time. |
| `npx vitest run` of operative-authority, evidence-engine, compilation-scope, and Article VII selection | 26 passed. |
| `npx tsc --noEmit -p .` | exit 0. |

The plan object records `localElapsedMs` from `performance.now` around the dry-run. That number is local CPU time. It is not tokens and not a bill.

## Simulated provider workload (not sent)

Synthetic package in `question-plan.test.ts`. Not Gibraltar. Not an issuer-specific production branch.

Question: "Can this issuer incur an additional $75 million of secured debt?"

| population | count | meaning |
| --- | ---: | --- |
| Operative sections in the fixture | 7 | Approach A on this fixture, if every operative section were compiled. |
| Sections in the dry-run plan | 4 | 7.01, 7.02, 7.03, 7.03(b). Cited closure plus lien and debt entries. |
| Contents rows refused | 1 | 7.01 contents line. Not planned. |
| Same-action section disclosed, not planned | 1 | 7.09, discovery label only, no cite. |
| Other operative sections disclosed, not planned | 2 | 7.04 restricted payment, 1.01 definitions. |

A Sonnet reservation of 1,000 input tokens and 100 output tokens prices at 0.003 per call on `headroom-pricing.v1` (`anthropic/claude-sonnet-5`, $2 / $10 per million). Four cold dispatches estimate a worst case of 0.012. The test locks `estimatedWorstCaseUsd` to that product. No call was reserved in a ledger and no call was sent.

Warm cache on the same four contracts: `simulatedDispatches` 0, `pricingStatus` `NO_DISPATCH`, `estimatedWorstCaseUsd` null.

Haiku reservation: `pricingStatus` `UNKNOWN_MODEL`, action `REFUSED_UNPRICEABLE`, estimated dollars null. No silent substitution.

One edited source hash: that section is `DISPATCH`, the other three stay `REUSE`. One edited dependency hash behaves the same. A prompt-version change misses. A `PARTIAL` record misses. `UNKNOWN` operative version or dependency is `REFUSED_UNCERTAIN` and does not dispatch.

## What is not a saving

- 7 operative versus 4 planned on a synthetic fixture is a population comparison. It is not `$8.777854` avoided.
- 788 dispatchable Gibraltar rows were not re-planned and were not multiplied by an average incremental cost.
- The difference between Pass B's 140 calls and the offline summary's 86 signal-bearing sections is not a saving. Those files are different runs.
- Gateway prompt-cache and batch discounts are not assumed.

Estimated savings from this change: not claimed. The first measured saving would be the single founder-authorized experiment in `cost-evidence-engine.md`, which is not authorized and was not run.
