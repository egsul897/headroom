# Canonical execution contract

**Entrypoint:** `executeUnifiedVerifiedTransaction`  
**Types:** `lib/product/verified-transaction-execution/types.ts`  
**Product projection:** `toProductExecutionHandoff(result, "POSITION" | "ASK" | "SIMULATE")`

## Request (Scope A)

| Field | Meaning |
|---|---|
| `companyId` / `instrumentKey` | Company and instrument identity |
| `transaction.type/amount/currency/date` | Contemplated transaction |
| `selectedLegalPath` | Explicit selected legal path (`selectionMode: EXPLICIT`) |
| `verifiedExecutableRule` | Verified executable rule identity + lifecycle |
| `operativeSourceAuthority` | Operative source authority classification |
| `financialEvidence` | Financial evidence bundle + required metrics |
| `utilization` | Utilization records + completeness certificate |
| `ledger` | Applicable ledger state (caller-supplied; no DB write) |
| `reviewerAuthorization` | Reviewer auth when required (host trusted-issuer context) |
| `verifiedPackage` | Caller-supplied `VerifiedExecutionPackage` |
| `inputs` | Phase-4B `InputResolver` |
| `mode` | `HYPOTHETICAL` (default) or `PRODUCTION_AUTHORITY` |

## Result (Scope C)

Execution status, legal path, source citations, financial inputs + provenance, binding constraints, capacity effects, missing inputs, conditions, utilization authority, post-state identity, full gate trace, and production-authority classification.

Underlying `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` outcomes are attached under `verified` without re-computation.

## Adapters (reconciled to merged main)

| Dependency | Status on main | Adapter |
|---|---|---|
| #273/#279 financial evidence | merged | `adapters/financial-evidence.ts` wraps `validateFinancialMetricEvidence` |
| #274 operative handoff | merged | `adapters/operative-authority.ts` reuses classification + `operativeAuthorityFromProvision` |
| #268 utilization authenticity | merged | `adapters/utilization.ts` → `lib/capacity` |
| #266 greater-of slice | merged | Consumes MAX capacity IR; no compiler duplication |

No parallel validators — capacity financial evidence is the single source of truth.
