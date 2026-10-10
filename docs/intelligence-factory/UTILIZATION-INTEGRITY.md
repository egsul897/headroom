# Utilization integrity audit

## Distinctions (#234 completeness alignment)

| Status / flag | Meaning | Supports remaining claim? |
|---|---|---|
| Attributed `COMPUTED` without certificate | Known attributed sum only | **No** |
| `VERIFIED_ZERO` + `VERIFIED_EMPTY` cert | Completeness-certified empty path | **Yes** |
| `COMPUTED` + `VERIFIED_COMPLETE` cert | Completeness-certified attributed set | **Yes** |
| `ZERO_NO_ATTRIBUTED_USAGE` | No attributed records | **No** |
| `PARTIAL_ATTRIBUTED_USAGE` | Some members attributed | **No** |
| `EXTERNAL_INPUT_REQUIRED` / `ENTITY_CLASS_USAGE_UNAVAILABLE` | External/class unknown | **No** |
| `COMPLETENESS_CERTIFICATE_INVALID` | Stale / mismatched / contradictory cert | **No** |

**Approved attributed records do not establish historical completeness.**

## Loader contract

`loadCompanySolverStaticData` attaches:

- `currentUsage` / `currentUsageStatus`
- `currentUsageAttributedKnown`
- `currentUsageSupportsRemainingClaim` (and deprecated alias `currentUsageAuthoritative` = same)
- `currentUsageCompletenessCertified`

Optional `completenessCertificates[constraintId]` required for remaining support.

## Solver consumer enforcement

`headroomAndConsume` requires `currentUsageSupportsRemainingClaim` (completeness-certified). Otherwise SHARED_CAP → `UNKNOWN`, alloc 0.

Legacy Position/Simulate gross paths must not be labeled utilization-adjusted remaining without the #234 verified-remaining / product-view path.
