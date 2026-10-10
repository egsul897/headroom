# Architecture boundary remediation — sequential → verified adapter

## Verdict

`sequential-execution.ts` previously bypassed the certified Phase-4 product boundary by importing and calling raw `simulateTransaction`, `evaluateCapacityState`, and `buildCapacityGraph`. The unauthorized allowlist expansion in `architecture.test.ts` was reverted. Sequential composition now executes exclusively through `simulateVerifiedTransaction` / `evaluateVerifiedCapacity`.

## Exact call graph (production)

```
Ask / Simulate / cross-document surfaces
  └─ lib/product/north-star-workflow/*
       ├─ certified-transaction.ts
       │    └─ simulateVerifiedTransaction / evaluateVerifiedCapacity  (verified-execution.ts)
       ├─ fixture-verified-package.ts
       │    └─ simulateVerifiedTransaction / evaluateVerifiedCapacity
       ├─ sequential-demo-scenario.ts
       │    └─ runSequentialTransactions  (sequential-execution.ts)
       │         └─ simulateVerifiedTransaction / evaluateVerifiedCapacity
       │              └─ buildCapacityGraph / evaluateCapacityState / simulateTransaction  (raw runtime; only here)
       ├─ sequential-transaction-runner.ts  (re-export)
       ├─ utilization-history.ts           (re-export)
       └─ transaction-effect-recipes.ts    (types + formatRestoreReason via verified / sequential)
```

No `app/` module imports sequential-execution or raw runtime capacity/simulation primitives.

## Direct runtime imports (lib/contract-model, non-runtime)

| Module | `capacity/graph` | `capacity/state` | `transaction/simulate` |
|--------|------------------|------------------|------------------------|
| `verified-execution.ts` | yes (sole allowlisted adapter) | yes | yes |
| `sequential-execution.ts` | **none** | **none** | **none** |
| product / app | **none** | **none** | **none** |

`chainFinancialViewWithScope` (TE-D3 overlay chaining) moved onto `verified-execution.ts` so sequential never imports `buildOverlay`.

## Comparison vs verified adapter

| Protection | verified-execution | sequential (before) | sequential (after) |
|------------|--------------------|---------------------|--------------------|
| REQUIRE policy constant | yes | no (ALLOW_MISSING via raw) | yes (via adapter) |
| Package bind / identity | yes | no | yes |
| Shared-cap clean verification | yes | no | yes |
| Cross-rule gate refuse | yes | no | yes |
| Restore authority | yes | local only | yes (adapter; refusal mapped) |
| Caller cannot hand graph/state | yes | world carried raw graph/state | world opened only via `evaluateVerifiedCapacity` |
| Financial chaining | n/a | local `buildOverlay` | adapter `chainFinancialViewWithScope` |

## Shared-capacity unit identity (runtime alignment)

`evaluateCapacityState` evaluated shared-pool expressions with `unitId: null`, so under REQUIRE every pool failed closed even with a clean `SHARED_CAPACITY` artifact. Pool evaluation now passes `sharedCapId` + identity (matching rule evaluation). This makes the runtime consistent with the certification closure that treats shared capacities as first-class verified units — it does not weaken REQUIRE.

## Files changed

- `lib/contract-model/verified-execution.ts` — type re-exports; `chainFinancialViewWithScope`
- `lib/contract-model/sequential-execution.ts` — verified-only composition; world builders emit SYNTHETIC clean packages
- `lib/contract-model/north-star-bridge.ts` — decimal / financial type re-exports for demos
- `lib/contract-model/runtime/capacity/state.ts` — shared-cap unit identity under REQUIRE
- `lib/contract-model/runtime/verification-gate.ts` — comment alignment
- `tests/contract-model/certified/architecture.test.ts` — allowlist restored to `["verified-execution.ts"]` only
- `tests/contract-model/verified-execution.test.ts` — removed sequential EXEMPT
- product sequential tests — worlds opened via verified package helpers

## Test results

- `architecture.test.ts` — pass (allowlist = verified-execution only)
- `npm run test:phase3-certification` — **481/481** pass
- sequential mission suites — **30/30** pass
- `adversarial-verification.test.ts` — pass
- `shared-capacity.test.ts` — pass

## Remaining unsafe paths

None on the product sequential / Ask / Simulate certified path: every Phase-4 capacity or transaction execution from product composition enters through `verified-execution.ts`. Raw Phase-4D primitives remain reachable from tests and scripts by design (ALLOW_MISSING migration surface).

No automatic merge.
