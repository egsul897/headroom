# Canonical execution architecture — mission report

**Branch:** `cursor/canonical-execution-spine-cc62`  
**Base:** `origin/main` (post-#334)  
**Self-merge / production activation:** none  

## Verdict

**CANONICAL_SPINE_PRESERVED — CROSS_DOMAIN_DEMOTED_TO_SUPPORTING_LAYER**

## Authoritative path (unchanged)

Authentic documents → discovery/graph/amendments → `compileOperativeCovenantPackage` / `compileFrozenDebtPackage` → `evaluateVerifiedCapacity` + `simulateVerifiedTransaction` [REQUIRE] → `executeUnifiedVerifiedTransaction` → Position / Ask / Simulate.

## Cross-domain (#334)

Supporting package-wide modeling only. Emits `claimClass` (`MODELED_GROSS` when clear) and `transactionPermissibility: false` always. Incomplete investment/RP/asset-sale coverage now worsens overall status (debt-alone clear fixed).

## Surface distinction

| Class | Surface signal |
|---|---|
| MODELED_GROSS | Intelligence chips; cross-domain `claimClass` |
| VERIFIED_REMAINING | Capacity / completeness on verified spine |
| VERIFIED_TRANSACTION_PERMITTED | Simulate/Ask `authorityClass` + handoff annotation when REQUIRE SATISFIED |
| NEEDS_INPUT / UNSUPPORTED / REVIEW_REQUIRED | Fail-closed |

## Key modules

| Keep canonical | Adapter / supporting |
|---|---|
| `verified-execution.ts`, `verified-transaction-execution/execute.ts`, `certified-simulate-bridge.ts` | `cross-domain-transaction.ts`, `cross-domain-scenarios.ts` |
| `status-contract.ts`, `lib/capacity/*` | **New** `canonical-execution-authority.ts`, `cross-domain-spine-adapter.ts` |

## Tests

`npx vitest run tests/product/canonical-execution-authority.test.ts tests/product/cross-domain-transaction.test.ts`

Covers: no PERMITTED promotion from gross clear; debt clear + investment fail ⇒ not permitted; shared capacity; amendment; unknown util; incomplete package; Simulate authorityClass.

## Human next

Land #340 as utilization binding under supporting layer + adapter — not a second certification engine. No self-merge.
