# Canonical execution architecture — integration plan

## Verdict

Surgical integration complete on this branch: cross-domain remains a **supporting modeling layer**; authoritative remaining and transaction-permissibility route only through the verified package execution spine. No second engine. No production-authority activation. No self-merge.

## Authority vocabulary (Position / Ask / Simulate)

| Class | Meaning | Who may emit |
|---|---|---|
| `MODELED_GROSS` | Gross contractual / legacy composition clear or numeric ceiling | Cross-domain, leaf `evaluateProvision`, legacy simulate |
| `VERIFIED_REMAINING` | Remaining after attributed util + completeness on verified path | Verified spine / capacity only |
| `VERIFIED_TRANSACTION_PERMITTED` | REQUIRE simulate SATISFIED selected path | `executeUnifiedVerifiedTransaction` / `attemptVerifiedSimulate` only |
| `NEEDS_INPUT` / `UNSUPPORTED` / `REVIEW_REQUIRED` | Fail-closed | Either layer |

Promotion rule: **successful cross-domain gross `clear` ⇒ `MODELED_GROSS` only** (`transactionPermissibility: false` always).

## What stays canonical

| Module | Role |
|---|---|
| `lib/contract-model/verified-execution.ts` | REQUIRE capacity + simulate |
| `lib/product/verified-transaction-execution/execute.ts` | Product orchestrator spine |
| `lib/product/unified-position/certified-simulate-bridge.ts` | Ask/Simulate verified path |
| `lib/contract-model/analysis/operative-covenant-package.ts` | Operative compile |
| `lib/customer-workflow/status-contract.ts` | Customer presentation mapping |
| `lib/capacity/*` | Utilization / remaining publication gates |

## What becomes adapter / supporting

| Module | Disposition |
|---|---|
| `lib/product/cross-domain-transaction.ts` | **Keep** as supporting multi-family model; emits `claimClass` + forced `transactionPermissibility: false` |
| `lib/product/cross-domain-scenarios.ts` | **Keep** scenario catalog (Coherent/Matthews templates) |
| `lib/product/cross-domain-spine-adapter.ts` | **New adapter** — compose modeled slices with verified spine |
| `lib/product/canonical-execution-authority.ts` | **New** — shared authority classes + compose/guard |
| Open **#340** v2 remaining path | Land as upgrade to supporting layer’s utilization binding; still must call through adapter + spine for PERMITTED |
| Competing absorb forks (#336/#342 cross-domain cards) | **Retire / close** after human picks single absorb tip — do not leave a second UI conclusion path |

## Duplication inventory (accepted vs retired)

| Computation | Spine | Cross-domain | Policy |
|---|---|---|---|
| Debt / RP / asset-sale arithmetic | Via verified IR + 4D effects | Via `covenant-engine` sims | Cross-domain OK for modeling; PERMITTED only from spine |
| Contractual EBITDA / ratios | NS-4 / contractual-leverage (open absorb) | `computeContractualCovenantMetrics` | Share identities; do not dual-publish AVAILABLE |
| Utilization / remaining | `lib/capacity` + VE completeness | Always withhold (`null`) | Never promote cross-domain util flags |
| Shared capacity | IR `SHARED_CAPACITY` units | PARTIAL document-tightest note | Spine owns certified shared pools |
| Amendments / operative tip | OA / amendment pipeline on spine | PARTIAL date-scope note only | Spine owns operative authority |

## Bugfixes included

1. Acquisition investment leg missing `rpWaterfall` was mislabeled `RESTRICTED_PAYMENTS_BUILDER` — now `INVESTMENTS_ACQUISITIONS`.
2. Incomplete RP/asset-sale coverage did not enter `statusAcc` — overall could stay `clear` with debt alone — **fixed** so overall is not PERMITTED / not modeled-clear.

## Tests

`tests/product/canonical-execution-authority.test.ts`:

- Cross-domain clear ⇒ MODELED_GROSS, not permitted
- Debt clear + investment not_tested ⇒ overall not clear / not permitted
- Compose refuses PERMITTED when model blocks even if spine hypothetically green
- Unknown utilization / shared capacity / amendment / incomplete package
- Simulate view authorityClass

## Remaining human merge sequence (no self-merge)

1. Merge this architecture PR (docs + authority wiring + tests).
2. Choose one NS-4 absorb tip (#345 or #343).
3. Land #340 as v2 utilization binding under the supporting layer + adapter.
4. Rebase AFC (#341) without a second conclusion path.
5. Do **not** activate production trusted-issuer / IdP in these PRs.

## Explicit non-goals honored

- No rewrite of `evaluateVerifiedCapacity` / `simulateVerifiedTransaction`
- No new capacity arithmetic engine
- No production-authority activation
- No self-merge
