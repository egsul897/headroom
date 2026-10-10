# Utilization integrity audit

**Superseded in part by** `UTILIZATION-AUTHORITY-CONTRACT.md` (reconciled #232 + #234).

## Distinctions (solver)

| Status | Meaning | Authoritative remaining? |
|---|---|---|
| `VERIFIED_ZERO` | Completeness cert `VERIFIED_EMPTY` + no attributed usage | **Yes** |
| `COMPUTED` | Completeness cert `VERIFIED_COMPLETE` + attributed usage | **Yes** |
| `ATTRIBUTED_INCOMPLETE` | Attributed rows without completeness cert | **No** |
| `ZERO_NO_ATTRIBUTED_USAGE` | No attributed records | **No** |
| `PARTIAL_ATTRIBUTED_USAGE` | Some named members attributed | **No** |
| `EXTERNAL_INPUT_REQUIRED` | EXTERNAL_INSTRUMENT_BALANCE | **No** |
| `ENTITY_CLASS_USAGE_UNAVAILABLE` | ENTITY_CLASS_FILTER | **No** |

## Loader contract

`loadCompanySolverStaticData` attaches:

- `currentUsage`
- `currentUsageStatus`
- `currentUsageAuthoritative`

Optional `completenessCertificatesByConstraintId` is required for authoritative remaining.

Numeric `currentUsage === 0` with `ZERO_NO_ATTRIBUTED_USAGE` or `ATTRIBUTED_INCOMPLETE` is **not** proven empty for remaining claims.

## Solver consumer enforcement

`lib/solver/election.ts` `headroomAndConsume` requires `currentUsageAuthoritative === true` before computing `cap − currentUsage`.

## Product

Debt intelligence and `computeVerifiedRemaining` refuse AVAILABLE / remaining without completeness-certified utilization. See silent-zero audit.
