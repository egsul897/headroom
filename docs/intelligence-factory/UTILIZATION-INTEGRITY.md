# Utilization integrity audit

## Distinctions

| Status | Meaning | Authoritative? |
|---|---|---|
| `VERIFIED_ZERO` | Attributed basketUsage records establish zero outstanding for all named members | **Yes** |
| `ZERO_NO_ATTRIBUTED_USAGE` | No attributed usage records for named members | **No** — must not become a zero-usage claim |
| `COMPUTED` | Known attributed usage summed | **Yes** |
| `EXTERNAL_INPUT_REQUIRED` | EXTERNAL_INSTRUMENT_BALANCE — balances not supplied | **No** |
| `ENTITY_CLASS_USAGE_UNAVAILABLE` | ENTITY_CLASS_FILTER — class outstanding unknown | **No** |
| `PARTIAL_ATTRIBUTED_USAGE` | Some named members attributed, others not | **No** |

Shared-pool utilization uses the same helper; pool remaining claims require authoritative member/pool usage.

## Loader contract

`loadCompanySolverStaticData` now attaches:

- `currentUsage`
- `currentUsageStatus`
- `currentUsageAuthoritative`

Numeric `currentUsage === 0` with `ZERO_NO_ATTRIBUTED_USAGE` is **not** proven empty.

## Product rule

Do not claim company-level **remaining** capacity unless utilization status is authoritative (`COMPUTED` or `VERIFIED_ZERO`). Gross contractual capacity may still be reported with that caveat.
