# Mission report — Real covenant intelligence & dashboard vertical slice

**Branch:** `cursor/real-covenant-dashboard-vertical-slice-2ca3`  
**Base:** `origin/main` (after #293 merge)  
**CURRENT_CANONICAL_SHA:** `440dd65d42c2e9f6b92978fa4f04a92658de190c`  
**Package:** Matthews International Q1 FY2025 (AUTHENTIC_SOURCE_BACKED)  
**Paid inference:** $0 · **Production Neon writes:** none  
**Final verdict:** `REAL_DASHBOARD_VERTICAL_SLICE_PROVEN`

## Required return

### CURRENT_CANONICAL_SHA

`440dd65d42c2e9f6b92978fa4f04a92658de190c` (`cursor/canonical-product-integration-5a28` tip after docs merge-readiness pin; prior authority tip `2ab1ac78`; #298 absorbed; #293 pending human merge — this work is a separate branch)

### END_TO_END_DATA_FLOW

```
Authentic Matthews fixture (EDGAR 0000063296-25-000006 + Indenture formulas)
  → normalizeFinancialStatementEvidence / reconstructUtilizationEvidence (#290)
  → evaluateProvision (lib/covenant-engine) × 5 permissions
  → computeVerifiedRemaining / buildVerifiedCapacityInputHandoff (production REFUSED)
  → connectSliceToPosition → buildPositionView / presentCapacityClaim
  → Position page section "Source-backed covenant calculations"
  → change propagation via financial/pro forma overrides (ledger untouched)
```

| Stage | Classification |
|---|---|
| Debt-document package (Matthews EDGAR-backed) | VERIFIED |
| Covenant formulas (populate-matthews permissions) | VERIFIED (engineering) |
| Operative authority (production promotion) | BLOCKED (gates preserved) |
| Financial evidence (6 metrics) | CONNECTED · AUTHENTIC · UNVERIFIED_EXTRACTION |
| Utilization (2 attributed events) | CONNECTED · UNKNOWN history retained |
| Capacity evaluation (shared engine) | VERIFIED modeled · BLOCKED production remaining |
| Position dashboard bridge | CONNECTED |

### VERIFIED_COVENANTS_COUNT

**5** distinct covenant calculations (plus Indenture secured composition = 1+2).

### NUMERIC_CAPACITY_RESULTS

| Code | Section | Modeled ($M) | Remaining claim | Authority |
|---|---|---:|---:|---|
| `ind_permitted_debt_1a_flat` | Permitted Debt cl. (1)(a) | **521.118** | null (refused) | GROSS_ONLY_UTILIZATION_INCOMPLETE |
| `ind_ratio_debt_fccr` | §4.09(a) | **110.336** | 110.336 modeled | MODELED_AUTHENTIC_EVIDENCE |
| `ind_permitted_debt_1b_ratio_secured` | cl. (1)(b)(x) | **0** | 0 | MODELED_AUTHENTIC_EVIDENCE |
| `ind_permitted_debt_2_notes` | cl. (2) | 300 gross | **0 NEW** | MODELED_AUTHENTIC_EVIDENCE |
| `ca_lien_601j_2024notes` | CA §6.01(j) | **0** | 0 | STRUCTURAL_ZERO |
| Indenture secured composition | 1a + FCCR | **631.454** | — | MODELED (not PRODUCTION) |

Independent arithmetic matches engine within 0.05 (see e2e test).

### DASHBOARD_CONNECTED_METRICS

5 Position-connected metrics via `loadAuthenticDashboardSlice("matthews")` → `connectedMetrics` rendered on Position. Production remaining published: **false**. `remainingAuthoritative`: **false**.

### FINANCIAL_EVIDENCE_COVERAGE

6/6 required metrics present: TOTAL_ASSETS, CASH_BALANCES, INTEREST_EXPENSE, TOTAL_DEBT, SECURED_DEBT, CONSOLIDATED_EBITDA. TOTAL_CONSOLIDATED_ASSETS not silently substituted. Authenticity: AUTHENTIC. Verification: UNVERIFIED_EXTRACTION.

### UTILIZATION_COVERAGE

2 attributed events (revolver 484.083 + Notes 294.799 = 778.882). `supportsRemainingClaim=false`. `unknownHistoricalActivity=true`. Completeness certificate: absent. Trusted-issuer: BLOCKED.

### MISSING_EVIDENCE

- No reviewer-confirmed completeness certificate
- Point-in-time balances ≠ full historical ledger
- Unobserved pre-snapshot activity UNKNOWN (not zero)
- TOTAL_CONSOLIDATED_ASSETS intentionally unmapped
- Production HostIdentityProvider / trusted-issuer BLOCKED
- Phase-3 certified IR not bound to Position for this package (leaf evaluateProvision used)

### BLOCKED_HANDOFFS

1. Production remaining publication (completeness + IdP)
2. Verified IR / VEP → Position (bridge uses shared leaf evaluator, not IR VEP)
3. Offline compile → Neon product DB (no production writes)
4. AutoNation / WOR / CONMED 5-covenant numeric demos (missing financial/utilization corpus)

### INDEPENDENT_TEST_RESULTS

`npx vitest run tests/product/real-dashboard-vertical-slice.e2e.test.ts` → **7/7 passed**

- Authentic fixture gate
- ≥5 covenants with provenance
- Independent legal arithmetic vs cited formulas
- UNKNOWN ≠ zero + production handoff refused
- Position architecture connection (no second engine)
- Change propagation (EBITDA↑ + hypo $50M secured; ledger untouched)
- Full e2e verdict `REAL_DASHBOARD_VERTICAL_SLICE_PROVEN`

### NEXT_THREE_PRODUCT_BLOCKERS

1. **Production trusted-issuer / IdP activation** — required before any AVAILABLE remaining publication.
2. **Reviewer-confirmed utilization completeness certificate** for Matthews (or successor issuer) — without inventing UNKNOWN→zero.
3. **Bind Phase-3 / fixed-dollar verified IR path into Position** for authentic packages that already have VE units (MTN/MHK), once authenticated financial+utilization evidence exists — without a parallel capacity engine.

### Change propagation (demo)

| Lever | Effect |
|---|---|
| EBITDA 128.313 → 140 | FCCR room +67.75 ($110.34 → $178.09) |
| Hypo +$50M secured debt | 1a −50 ($521.12 → $471.12); FCCR −50; ledger unchanged |

## Final verdict

**REAL_DASHBOARD_VERTICAL_SLICE_PROVEN**

Not claimed: production-authoritative remaining, IdP activation, Neon durability, or AutoNation Round-2 affirmative execution.
