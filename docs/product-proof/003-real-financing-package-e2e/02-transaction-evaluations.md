# Three transaction evaluations (canonical main)

All three run through:

1. `parseTransactionDraft` — intake  
2. `enumerateCertifiedPaths({ verifiedPackage: null })` — Phase 4E  
3. `attemptVerifiedSimulate({ verifiedPackage: null })` — verified path  
4. Recipe builders with **empty** capacity draws (no invented node ids)  
5. For acquisition only: modeled leaf probe via `demonstrateChangePropagation` (explicitly **not** verified permission)

As-of date for all asks: **2024-12-31** (fixture measurement date).

---

## TX1 — Debt-funded acquisition ($50M secured)

**Ask:** Can we finance a $50 million secured debt-funded acquisition on 2024-12-31?

| Field | Result |
|---|---|
| Draft parse | `ACQUISITION`, secured=true, amount=50, date=2024-12-31 |
| Path enumeration | `NOT_CERTIFIED_4E` — `NO_VERIFIED_EXECUTION_PACKAGE` |
| Verified simulate | `executable=false` — `NO_VERIFIED_EXECUTION_PACKAGE`, `NO_CANDIDATE_PATHS` |
| Selected path | **null** (none invented) |
| Capacity consumption | **null** (no verified consume) |
| Recipe | `SECURED_BORROWING+INVESTMENT` → `MISSING_CAPACITY_NODE` ×2 |

### Applicable covenants (every modeled leaf + missing domains)

| Family | Source provision | Calculation | Missing inputs | Post-txn modeled probe | Conclusion |
|---|---|---|---|---|---|
| INDEBTEDNESS | Indenture Permitted Debt (1)(a) | max(0, 1300 − secured debt) → modeled **521.118**; remaining **null** | completeness cert + trusted issuer; authentic VEP dual-path; investment basket | hypothetical bump 521.118 → **471.118** (Δ −50); ledger untouched | Modeled only — production permission REFUSED |
| INDEBTEDNESS | Indenture §4.09(a) FCCR | max(0,(EBITDA/2 − Interest)/rate) → modeled **110.336**; remaining **null** | same | modeled → **60.336** (Δ −50 via interest/debt bump) | Modeled only — not published remaining |
| INDEBTEDNESS | Permitted Debt (1)(b)(x) | max(0, 3.5×EBITDA − net secured) → **0** | same | stays **0** | No secured leverage room |
| INDEBTEDNESS | Permitted Debt (2) | flat 300 grandfather; NEW=0 | same | modeled 300 unchanged | Grandfather — not growth capacity |
| LIENS | CA §6.01(j) (Sixth Amendment) | flat **0** structural | dual-path companion VEP | stays **0** | Blocks NEW Loan-Party secured liens |
| INVESTMENTS | *(none)* | — | Investment exception IR | — | **NOT_IMPLEMENTED** |

**Overall conclusion:** **REFUSED / NOT DETERMINED**.  
**Truthful blocker:** no authentic VEP; utilization completeness absent; CA §6.01(j) structural zero blocks NEW secured Loan-Party liens; investment leg NOT_IMPLEMENTED. Modeled leaf debt rooms are **not** production permission.

---

## TX2 — Restricted payment ($25M)

**Ask:** Can we make a $25 million restricted payment dividend on 2024-12-31?

| Field | Result |
|---|---|
| Draft parse | `RESTRICTED_PAYMENT`, amount=25 |
| Path enumeration | `NOT_CERTIFIED_4E` — `NO_VERIFIED_EXECUTION_PACKAGE` |
| Verified simulate | `executable=false` |
| Selected path | **null** |
| Capacity consumption | **null** |
| Recipe | `DIVIDEND_PAYMENT` → `MISSING_CAPACITY_NODE` |

### Applicable covenants

| Family | Source provision | Calculation | Missing inputs | Selected path | Consumption | Post state | Conclusion |
|---|---|---|---|---|---|---|---|
| RESTRICTED_PAYMENTS | **null** | **null** | RP negative covenant + exceptions IR; builder / Available Amount; attributed RP ledger + completeness; VEP | null | null | null | **BLOCKED** — domain NOT_IMPLEMENTED on Matthews package |

**Overall conclusion:** **REFUSED / NOT DETERMINED**.  
**Truthful blocker:** Restricted Payments domain **NOT_IMPLEMENTED** for Matthews authentic package — no RP waterfall, builder, or VEP path. Refusing rather than selecting a favorable synthetic (Coherent) path.

---

## TX3 — Asset sale ($40M)

**Ask:** Can we complete a $40 million asset sale disposition on 2024-12-31?

| Field | Result |
|---|---|
| Draft parse | kind inference may be `UNKNOWN` for “asset sale” wording; evaluation still forced as ASSET_SALE domain probe |
| Path enumeration | `NOT_CERTIFIED_4E` — `NO_VERIFIED_EXECUTION_PACKAGE` |
| Verified simulate | `executable=false` |
| Selected path | **null** |
| Capacity consumption | **null** |
| Recipe | `ASSET_SALE` → `UNSUPPORTED_RECIPE_SHAPE` / empty metrics+draws |

### Applicable covenants

| Family | Source provision | Calculation | Missing inputs | Selected path | Consumption | Post state | Conclusion |
|---|---|---|---|---|---|---|---|
| ASSET_SALES | **null** | **null** | Asset Sale covenant + threshold; proceeds / reinvestment basket; fair-value inputs (not invented); VEP | null | null | null | **BLOCKED** — domain NOT_IMPLEMENTED on Matthews package |

**Overall conclusion:** **REFUSED / NOT DETERMINED**.  
**Truthful blocker:** Asset Sales domain **NOT_IMPLEMENTED** for Matthews authentic package — no `assetSale` config or VEP path. Refusing rather than inventing proceeds routing.

---

Machine-readable: `artifacts/02-transactions.json`.
