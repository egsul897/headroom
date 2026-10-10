# Shared end-to-end benchmark plan

**Status:** PLAN + BASELINE ON MAIN — executable success **not** fabricated for CONMED.  
**Main:** `bae24ced`

## Package selection

| Role | Package | Why |
|---|---|---|
| **Engine-complete consistency** | Coherent (EVALUATION) | Seeded capacityFormulas, financials, ledger — Position/Simulate already execute |
| **Authentic refusal / honesty** | CONMED `conmed-demo` + fixture package | Multi-doc authentic HTML; capacity NOT DETERMINABLE; VEP #205 labeled synthetic CTA |

Do **not** claim a successful CONMED numeric clearance without approved authentic financials + attributed utilization + CERTIFIED companions.

## Required artifacts (12)

| # | Artifact | Coherent (target) | CONMED (current) |
|---|---|---|---|
| 1 | Operative document set | Seeded docs | 4 Neon docs + fixture HTML |
| 2 | Verified governing rules | Permission/Golden VERIFIED rows | Offline CERTIFIED units for select clauses (#205 §7.2(d)); package CERTIFIED **PARTIAL** |
| 3 | Financial input snapshot | Present | Missing authentic approved snapshot |
| 4 | Known / unknown utilization | Partial ledger | Unknown — must not become 0 |
| 5 | Contractual ratios | Engine computes | Not determinable |
| 6 | Basket limits | Formulas present | Cited figures; remaining unknown |
| 7 | Supported remaining capacity | Engine path | **REFUSE** / NOT DETERMINABLE |
| 8 | Proposed transaction | Simulate debt/RP | #205 Finance Lease demo — SYNTHETIC CTA |
| 9 | Cross-document restrictions | Limited | #218 scenarios on acceptance pkgs; CONMED Omnibus unresolved |
| 10 | Pre/post state | Simulate result | Refuse without inventing post-state success |
| 11 | Source-backed result | Engine traces | Source citations + refusal reasons |
| 12 | Position/Simulate/Ask consistency | #213+#221 goal | Ask without VEP → NOT_CERTIFIED_4E |

## Scoring

Track separately:

- **Correct executable results** (Coherent / future certified packages with full inputs)  
- **Correct refusals** (CONMED missing inputs, cross-rule gates, unknown usage, incomplete package)

A green refusal is success. A fabricated AVAILABLE is failure.

## Immediate baseline commands (zero paid)

```bash
# Overview / position honesty (after #213)
npx vitest run tests/covenant-overview-service.test.ts

# Phase-4 capacity unknown usage
npx vitest run tests/contract-model/runtime/capacity

# Authentic CONMED path evidence (on #205 tip)
npx vitest run tests/product/authentic-72d-execution.test.ts

# Cross-doc (#218 tip)
npx vitest run tests/product/cross-document-covenant.test.ts

# Unified customer (#221 tip)
npx vitest run tests/product/unified-customer-product.test.ts tests/product/unified-customer-engine.test.ts
```

## Owner

WS-RCV + WS-UCP produce `docs/product/e2e-benchmark/` once #213+#221+#218 land on a common base; WS-AEC records scores in progress manifest. No Neon writes required for baseline.
