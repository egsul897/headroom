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

## Adapters for unmerged backends

| Dependency | Status on main | Adapter |
|---|---|---|
| #273 financial evidence | open | `adapters/financial-evidence.ts` |
| #274 operative handoff | open | `adapters/operative-authority.ts` |
| #268 utilization authenticity | merged | `adapters/utilization.ts` → `lib/capacity` |

When #273/#274 merge, replace adapter bodies with thin wraps — do not keep parallel validators.
