# Utilization authority contract (reconciled #232 + #234)

**Status:** binding for the utilization integration batch  
**Main base:** post-#229 `b99f934b`  
**Implementation:** `lib/capacity/utilization-authority.ts`  
**Consumers:** `lib/solver/shared-usage.ts`, `lib/capacity/verified-remaining.ts`, debt-intelligence remaining publication

## Canonical kinds

| Kind | Meaning | Remaining claim? |
|---|---|---|
| `KNOWN_ATTRIBUTED` | Approved attributed usage sum is well-defined | **Only** with `VERIFIED_COMPLETE` cert |
| `VERIFIED_ZERO` | Affirmative empty ledger | **Only** with `VERIFIED_EMPTY` cert |
| `UNKNOWN` | Missing history / empty table / no attribution | **No** |
| `PARTIALLY_KNOWN` | Partial attribution, mixed currency, cert mismatch | **No** |
| `EXTERNAL_UNKNOWN` | External instrument / entity-class balances | **No** |
| `SYNTHETIC_ONLY` | Labeled synthetic evidence | **No** (unless test `allowSyntheticRemaining`) |

## Completeness certificates

| Certificate | Required evidence | Remaining |
|---|---|---|
| `VERIFIED_EMPTY` | No attributed active usage | remaining = gross (usage 0) |
| `VERIFIED_COMPLETE` | Attributed set is the full usage set | remaining = gross − attributed |

Approved individual ledger rows **never** establish completeness by themselves.

## Solver status mapping

| Solver `currentUsageStatus` | Authority | `currentUsageAuthoritative` |
|---|---|---|
| `ZERO_NO_ATTRIBUTED_USAGE` | UNKNOWN | false |
| `PARTIAL_ATTRIBUTED_USAGE` | PARTIALLY_KNOWN | false |
| `ATTRIBUTED_INCOMPLETE` | KNOWN_ATTRIBUTED without cert | false |
| `VERIFIED_ZERO` | VERIFIED_ZERO + EMPTY cert | true |
| `COMPUTED` | KNOWN_ATTRIBUTED + COMPLETE cert | true |
| `EXTERNAL_INPUT_REQUIRED` / `ENTITY_CLASS_USAGE_UNAVAILABLE` | EXTERNAL_UNKNOWN | false |

## Product publication

- `computeVerifiedRemaining` → `mayPublishAvailable` only when gate satisfied **and** remaining supported.
- Debt intelligence must not publish `remaining` / `COMPUTED` basket status from empty or unattributed ledgers.
- Synthetic evidence cannot publish AUTHENTIC AVAILABLE.

## Non-goals

- Does not weaken A8-01 `CapacityStatus.NOT_SATISFIED` / `statusForAmount` (byte-identical to #229 on this branch).
- Does not auto-merge #232 or #234 as independent PRs.
