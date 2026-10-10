# Financial capacity positions — milestone report

Generated: 2026-10-09T22:53:47.575Z
SHA: 3f1e6c5feb377cab68b8277be128037e44aa3b4b
paidInferenceCalls: 0
promotedToLegalTruth: 0

## Metrics

1. Authentic companies processed: **2**
2. Agreements processed: **4**
3. Financial statements processed: **2**
4. Certificates processed: **0**
5. Independently correct executable calculations: **5**
6. Correct refusals: **1**
7. Incorrect outcomes: **0**
8. Transactions with validated state changes: **5**
9. New reusable covenant knowledge stored in Neon: **0**

## Companies

### Coherent Corp. (`coherent`)

- As of: 2026-06-30T00:00:00.000Z
- Executable capacity: true
- EBITDA $1700M · Net leverage 1.233x · FCCR 8.95x
- Remaining secured capacity: 4041 (binding: 2029 Senior Notes Indenture)
- Remaining unsecured capacity: 5129 (binding: Credit Agreement (2022, as amended))
- Eligibility gaps: No NS-4 APPROVED ContractInputSnapshot (legacy FinancialSnapshot/State path used when present)
- Baskets modeled: 15
- Known ledger entries: 5

### Matthews International Corporation (`matthews`)

- As of: 2024-12-31T00:00:00.000Z
- Executable capacity: false
- EBITDA $128.313M · Net leverage 6.045x · FCCR 2.35x
- Remaining secured capacity: n/a (binding: n/a)
- Remaining unsecured capacity: n/a (binding: n/a)
- Eligibility gaps: No CovenantProvision rows — basket formulas not executable; No document capacityFormulas for secured/unsecured sides; No ACTIVE ledger utilization — historical basket drawdowns unknown; No NS-4 APPROVED ContractInputSnapshot (legacy FinancialSnapshot/State path used when present)
- Baskets modeled: 0
- Known ledger entries: 0

## Transaction state changes

### COH-S1-debt-incur-secured-50 — Incur $50M secured debt

- Assessment: **CORRECT_EXECUTABLE**
- Status: clear
- Pathway: simulateDebtIncurrence + computeRemainingCapacityAfterDebtIncurrence (solver-native)
- Consumed: Financial Covenants — Total Net Leverage (-50); MILA — secured prong (-50); MILA — unsecured prong (-50); Credit Facilities basket — flat (-50); Lien capacity — ratio prong (-50)
- Unaffected baskets: 8
- Independent rationale: Package secured = mila_secured 4041; unsecured TNL room 5129. Post cash-unchanged → secured 3991, TNL 5079.

### COH-S2-debt-repay-50 — Repay $50M Term Loan A

- Assessment: **CORRECT_EXECUTABLE**
- Status: clear
- Pathway: runCompanyScenario(DEBT_REPAYMENT) + computeCovenantPosition overlay
- Restored/increased: Credit Facilities basket — flat (50)
- Unaffected baskets: 12
- Independent rationale: Equal cash/debt reduction leaves net leverage room unchanged.

### COH-S3-dividend-25 — Pay $25M dividend from Available Amount

- Assessment: **CORRECT_EXECUTABLE**
- Status: clear
- Pathway: simulateRestrictedPayment(kind=dividend)
- Consumed: Builder Basket (Available Amount) (-25)
- Unaffected baskets: 1
- Independent rationale: Builder 2835 − ledger RP 150 = 2685; allocate 25.

### COH-S4-equity-contribution-100 — Receive $100M equity contribution

- Assessment: **CORRECT_EXECUTABLE**
- Status: clear
- Pathway: financial overlay + computeCovenantPosition (no ScenarioAction EQUITY kind)
- Restored/increased: Financial Covenants — Total Net Leverage (100); MILA — secured prong (100); MILA — unsecured prong (100); Lien capacity — ratio prong (100); Builder Basket (Available Amount) (100)
- Unaffected baskets: 8
- Independent rationale: +$100M cash raises TNL room by $100M; builder includes equity proceeds dollar-for-dollar.

### COH-S5-restricted-investment-25 — Make $25M restricted investment

- Assessment: **CORRECT_EXECUTABLE**
- Status: clear
- Pathway: simulateRestrictedPayment(kind=investment)
- Consumed: Builder Basket (Available Amount) (-25)
- Unaffected baskets: 1
- Independent rationale: Investments and dividends share the Notes RP waterfall / Available Amount.

### MATW-R1-capacity-refusal — Matthews — refuse executable capacity without provisions

- Assessment: **CORRECT_REFUSAL**
- Status: NOT_EXECUTABLE
- Pathway: eligibility gate — no simulateDebtIncurrence without formulas
- Independent rationale: Authentic Matthews package lacks modeled CovenantProvision rows; capacity must refuse.

## Blockers

- **B1-matthews-missing-provisions** (CLASS_GENERAL): Companies may have FinancialSnapshot/State and Permission rows without CovenantProvision/capacityFormulas — capacity must refuse, not invent.
- **B2-no-ns4-on-evaluation-seeds** (CLASS_GENERAL): Coherent/Matthews evaluation seeds use legacy FinancialSnapshot/State, not NS-4 APPROVED ContractInputSnapshot — Phase-4 REQUIRE path remains unavailable for these packages.
- **B3-no-officer-certificates-in-neon** (PLATFORM): No officer/compliance certificate Document rows found for eligible packages — certificate-backed ratio certification not yet demonstrable from Neon.
- **B4-no-equity-scenario-action** (PLATFORM): ScenarioAction lacks EQUITY_CONTRIBUTION; equity effects shown via financial overlay only.
- **B5-unknown-debt-basket-utilization** (CLASS_GENERAL): Even with a ledger, DEBT_INCUR utilization may be unrecorded — remaining debt-basket capacity can overstate unused room if historical draws are unknown.

## CONMED refusal regressions

PR #206 CONMED six CORRECT_REFUSAL scenarios remain the regression suite for unsupported packages; this milestone does not re-run or weaken them.
PR: https://github.com/egsul897/headroom/pull/206
Scenarios: S1-unsecured-debt, S2-secured-debt, S3-restricted-payment, S4-ratio-gated, S5-amendment, S6-insufficient-evidence

## Neon intelligence

- `financial-capacity-coherent-ab21c68c0fd15e57` (financial_capacity_calculation_case) — DISCOVERED_NOT_LEGAL_TRUTH; created=false; promotedToLegalTruth=0
