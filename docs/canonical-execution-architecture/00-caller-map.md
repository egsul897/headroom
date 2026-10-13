# Production callers — verified spine vs cross-domain supporting layer

**Main tip at branch cut:** post-#334 (`8374fa2a` lineage)  
**Directive:** verified spine is sole authority for remaining + transaction permissibility.

## PATH A — Authoritative verified package execution spine

```
Authentic documents
→ structural discovery / package graph / amendments
→ compileOperativeCovenantPackage / compileFrozenDebtPackage
→ evaluateVerifiedCapacity + simulateVerifiedTransaction [REQUIRE]
→ executeUnifiedVerifiedTransaction
→ Position / Ask / Simulate
```

| Symbol | File | Production callers |
|---|---|---|
| `compileOperativeCovenantPackage` | `lib/contract-model/analysis/operative-covenant-package.ts` | VE position feed, autonomous compilation, product bridges |
| `compileFrozenDebtPackage` | `lib/contract-model/analysis/offline-package-compile.ts` | PP002 offline compile scripts |
| `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` | `lib/contract-model/verified-execution.ts` | `certified-transaction.ts`, `execute.ts`, Stage-D gates, demos |
| `executeUnifiedVerifiedTransaction` | `lib/product/verified-transaction-execution/execute.ts` | product handoff, UTE tests, north-star re-export |
| `attemptVerifiedSimulate` | `lib/product/unified-position/certified-simulate-bridge.ts` | Ask `analyzeContemplatedTransaction`, Simulate views |
| `toProductExecutionHandoff` | `lib/product/verified-transaction-execution/product-handoff.ts` | Position / Ask / Simulate projections |
| `buildPositionView` | `lib/customer-workflow/position-view.ts` | `app/[companyId]/position/page.tsx` |
| `buildSimulateView` | `lib/customer-workflow/simulate-view.ts` | customer-workflow assemble / Simulate |
| Ask transaction analysis | `lib/product/north-star-workflow/transaction-analysis.ts` | `app/api/ask/**` |

**Authority outputs:** REQUIRE refuse/execute; handoff `executable`; now annotated with `ExecutionAuthorityClass` via `canonical-execution-authority.ts`.

## PATH B — Supporting cross-domain package modeling (#334)

| Symbol | File | Callers |
|---|---|---|
| `evaluateCrossDomainTransaction` | `lib/product/cross-domain-transaction.ts` | scenarios helpers, debt-intelligence, NS-4 e2e, tests |
| `evaluateCoherentScenario` / `evaluateMatthewsScenario` | `lib/product/cross-domain-scenarios.ts` | intelligence dashboard, tests, PP003 secondary track |
| `evaluateDefaultCrossDomainScenarios` | same | company-agnostic templates |
| UI | `app/[companyId]/intelligence/page.tsx` | chips now show `claimClass` (MODELED_GROSS), not green PERMITTED |

**Authority outputs (after this PR):**

- `overallStatus` — legacy engine composition only (`clear`/`blocked`/…)
- `claimClass` — `MODELED_GROSS` \| `NEEDS_INPUT` \| `UNSUPPORTED` \| `REVIEW_REQUIRED`
- `transactionPermissibility` — **always `false`**
- `verifiedRemainingMillions` — **always `null`** on every domain slice

## Adapter (new)

| Symbol | File | Role |
|---|---|---|
| `presentCrossDomainWithVerifiedSpine` | `lib/product/cross-domain-spine-adapter.ts` | Compose modeled slices + verified spine; permitted bit from spine only |
| `classifyCrossDomainEvaluation` / `composeAuthoritativePermissibility` | `lib/product/canonical-execution-authority.ts` | Authority vocabulary + promotion guard |

Open PR **#340** (cross-domain v2 remaining authority) should land **as an upgrade inside PATH B's utilization binding**, not as a second certification engine — still routed through this adapter + spine for PERMITTED.
