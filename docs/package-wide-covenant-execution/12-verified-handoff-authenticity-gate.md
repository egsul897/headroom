# Verified-handoff authenticity gate — final review

**Candidate reviewed:** `592b4345` (pre-gate — forgeable handoff)  
**Fix tip:** this commit on #348  
**Exact main at review:** `7131fc81` (advanced from prior merge-base `d924f5b6`)

## Trace

| Stage | Location | Behavior |
|---|---|---|
| Construction | `sealVerifiedExecutionPermissionHandoff(REQUIRE result)` | WeakSet brand; demotes `PRODUCTION_AUTHORITY_ACTIVE` when host/`TRUSTED_ISSUER_ACTIVATION` BLOCKED |
| Request field | `PackageTransactionRequest.verifiedExecution` | Accepts handoff object only |
| Acceptance | `executePackageTransaction` | `isSealedVerifiedExecutionPermissionHandoff` — unsealed/forged → refuse |
| Permission | `packagePermitted` | sealed ∧ `EXECUTED_SATISFIED` ∧ `PRODUCTION_AUTHORITY_ACTIVE` ∧ host ACTIVE |
| Callers | tests only (`package-transaction-execution.test.ts`) | No product route manufactures handoff JSON today |

## Forgeability (before → after)

| Attack | Before (592b4345) | After |
|---|---|---|
| Caller JSON `{EXECUTED_SATISFIED, PRODUCTION_AUTHORITY_ACTIVE}` | **would permit** | **packagePermitted=false** (forged/unsealed) |
| Structural clone of sealed handoff | n/a | refused (WeakSet) |
| Sealed ACTIVE while host BLOCKED | n/a | demoted to BLOCKED on seal → not permitted |

## EBITDA identity

`resolveContractualEbitdaEvidenceForPackage` refuses wrong-company, wrong-packageKey (no asOf fallback), wrong-period, foreign snapshot labels, and equal-EBITDA cross-company coincidence.

## Evidence tests

- `forged successful handoff JSON → packagePermitted false`
- `structural clone of a sealed handoff is refused`
- EBITDA suite §11–12 (wrong company/package/period/snapshot + equal amounts)
