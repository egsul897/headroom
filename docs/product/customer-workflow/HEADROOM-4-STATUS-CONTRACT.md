# HEADROOM-4 — Customer workflow status contract

## Scope

Unified presentation for Position, Ask, Simulate, Documents, and Evidence.

## Canonical statuses

| Code | mayPublishAvailable | Notes |
|---|---|---|
| VERIFIED_EXECUTABLE | yes | Only when canonical gates affirm |
| PARTIAL | no | Incomplete claim |
| UNSUPPORTED | no | Engine cannot establish |
| AMBIGUOUS | no | Competing readings / identities |
| REVIEW_REQUIRED | no | Reviewer decision required |
| NEEDS_INPUT | no | Missing financials / utilization |
| NOT_PRODUCTION_AUTHORITATIVE | no | MODELED / NOT VERIFIED |
| VERIFIED_UTILIZATION_COMPLETE | yes* | Completeness only; gate still required |
| UNKNOWN | no | Never zero / never unlimited |
| GROSS_CONTRACTUAL | no | Ceiling ≠ available |
| HYPOTHETICAL | no | Simulate / legacy clear |

\* Utilization completeness does not alone publish AVAILABLE remaining.

## PR #268

`#268` (authenticity + trusted-issuer) is **OPEN / unmerged** on main.
Legacy `remainingCapacity` must be labeled `NOT_PRODUCTION_AUTHORITATIVE` /
`MODELED / NOT VERIFIED` until that PR merges and production identity is active.

## Non-claims

- No parallel capacity engine in React
- No paid inference
- No production Neon writes
- No certification promotion
- No auto-merge
