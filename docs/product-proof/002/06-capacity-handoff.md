# Capacity handoff

## Outcomes (post vertical slice)

| Package | Handoff outcome | Detail |
|---|---|---|
| MTN | `VERTICAL_SLICE_PASSED_PRODUCTION_CAPACITY_REFUSED` | 3 fixed-dollar units verified under CALLER_STIPULATED_HYPOTHETICAL; production refused for all 3 |
| MHK | `VERTICAL_SLICE_PASSED_PRODUCTION_CAPACITY_REFUSED` | 2 fixed-dollar units verified under CALLER_STIPULATED_HYPOTHETICAL; production refused for all 2 |

## Authority boundary

| Mode | Behavior |
|---|---|
| `CALLER_STIPULATED_HYPOTHETICAL` | Qualitative residuals stipulated; evaluator may EXECUTE; available amount = cap when gates true, else $0 |
| `PRODUCTION` | Immediate refuse — no AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE / trusted utilization completeness certificate |

## Preserved gates

- No fabricated authenticated financial evidence
- UNKNOWN utilization is not coerced to zero
- Completeness certificate authenticity and trusted issuer requirements unchanged
- Shared-capacity conservation unchanged
- Exact selected-path identity unchanged
- Prior `REFUSED_NO_VEP` path remains for packages with zero verified IR units

## Explicit non-claim

Hypothetical / offline-pinned available amounts are **not** verified production capacity and must not be labeled as customer-facing capacity answers.
