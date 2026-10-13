# Seal-input authenticity — canonical REQUIRE brand

**Tip:** this commit on #348  
**Main absorbed:** `7131fc81` (#337)

## Caller trace — `sealVerifiedExecutionPermissionHandoff`

| Caller | Role |
|---|---|
| `tests/product/verified-handoff-seal-input-authenticity.test.ts` | Adversarial + canonical seal proofs |
| `tests/product/package-transaction-execution.test.ts` | Fabricated Pick → null |
| Product routes / scripts | **none** call seal today |

`brandCanonicalUnifiedTransactionExecutionResult` is **not** exported from the VTE public surface — only `executeUnifiedVerifiedTransaction` brands.

## Before → after

| Attack | Before (Pick trust) | After |
|---|---|---|
| `seal({ EXECUTED_SATISFIED, PRODUCTION_AUTHORITY_ACTIVE, … })` | sealed + could claim success statuses | **null** (no WeakMap brand) |
| Forged full `UnifiedTransactionExecutionResult` shape | would seal | **null** |
| Mutate branded result fields post-execute | live fields trusted | mint-time **snapshot** used |
| Wrong `contractVersion` fabrication | accepted if strings match Pick | **null** |
| Structural clone of sealed handoff | refused (WeakSet) | refused (preserved) |
| Host BLOCKED + ACTIVE claim | demoted | demoted (preserved) |

## Mechanism

1. `executeUnifiedVerifiedTransaction` → private `brandCanonical…` WeakMap snapshot  
2. `sealVerifiedExecutionPermissionHandoff(result)` → `readCanonicalExecutionPermissionSnapshot` only  
3. Permission WeakSet handoff + host demotion unchanged  
4. `packagePermitted` still requires sealed ∧ EXECUTED_SATISFIED ∧ PRODUCTION_AUTHORITY_ACTIVE ∧ host ACTIVE  
