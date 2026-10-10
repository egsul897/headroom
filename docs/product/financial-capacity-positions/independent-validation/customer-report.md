# Independent validation — Coherent financial capacity

Generated: 2026-10-10T00:14:00.835Z
SHA: b73f0828f1ddca89214beb3491a1cae9b43a3d1d
paidInferenceCalls: 0
promotedToLegalTruth: 0

## 1. Independent $5.129B calculation

$5,129M is the Credit Agreement §6.11 Total Net Leverage borrowing room (and the package-wide UNSECURED binding capacity). It is NOT the package-wide secured capacity.

```
room = 4.25 × Consolidated EBITDA − (Consolidated Total Debt − unrestricted cash)
= 4.25 × 1700 − (3258 − 1162)
= 5129
```

Provision: Credit Agreement (2022, as amended) §6.11 — TNL ≤ 4.25x (`ca_leverage_cap`)
As of: 2026-06-30T00:00:00.000Z
Is universal secured+unsecured capacity: **false**

## 2. Secured versus unsecured

| Side | Package-wide | Binding | Independent |
|---|---|---|---|
| Secured | $4041M | 2029 Senior Notes Indenture §3.3(b)(i)(C) — SSNL ≤ 3.00x | $4041M |
| Unsecured | $5129M | Credit Agreement (2022, as amended) §6.11 — TNL ≤ 4.25x | $5129M |

### Solver divergence / authority

- Package authoritative secured: $4041M (MODELED / EVALUATION_SEED_NOT_NS4_APPROVED)
- Solver-native secured (diagnostic): $1700M — NON_AUTHORITATIVE_DIAGNOSTIC
- False favorable: **false**
- PRE-FIX: Indenture secured election ratio-fccr+scf-flat under CONCURRENT_DISREGARDED inherited SCF Permitted Liens cl.(6) auto-lien onto Ratio Debt → indenture max ≈ $11,933M (FCCR room + SCF flat).
- PRE-FIX: CA secured cleared via coh-ca-d-permitted-601p (§6.01(p) TNL ≤ 4.25x) without a Permitted Lien path → $5,129M.
- PRE-FIX: Package min(CA $5,129, Indenture $11,933) = $5,129M — Indenture mila_secured / SSNL ≤ 3.00x ($4,041M) never became binding.
- FIX: evaluateElection requires each secured DEBT_INCURRENCE leg to have its own auto-lien or independent LIEN member; CONCURRENT_COUNTED maxCapacity is not the sum of standalones.
- FIX: computeRemainingCapacityAfterDebtIncurrence clamps solver>legacy per document and quarantines false-favorable package figures; packageAuthoritative = MODELED_CROSS_DOCUMENT.
- POST-FIX: Customer/package secured = Indenture mila_secured $4,041M (MODELED). Solver-native package min is NON_AUTHORITATIVE_DIAGNOSTIC and must not exceed $4,041M.

Solver-native remaining is NON_AUTHORITATIVE_DIAGNOSTIC. Customer headlines and package binding use MODELED_CROSS_DOCUMENT (Indenture mila_secured $4,041M secured / CA §6.11 $5,129M unsecured). Do not present solver figures as verified remaining capacity.

### Borrowing proceeds treatment

Engine convention: IMMEDIATELY_SPENT_CASH_UNCHANGED
- Cash retained: Debt +$50M secured and cash +$50M (proceeds retained). Net debt unchanged → TNL/SSNL rooms unchanged at day-0 levels.
  → TNL room $5129M · SSNL room $4041M
- Immediately spent: Debt +$50M secured, cash unchanged (engine simulateDebtIncurrence / leverage convention). Net debt +$50M → TNL room $5,079M, SSNL/mila room $3,991M.
  → TNL room $5079M · SSNL room $3991M
- Label: MODELED / EVALUATION_SEED_NOT_NS4_APPROVED

## 3–5. Sequential transaction economics

### SEQ-S1-debt-incur-secured-50 — Incur $50M secured debt

- Outcome: **CORRECT_EXECUTABLE**
- Uses prior post-state: false
- Pre BS: cash $1162M · totalDebt $3258M · secured $2221M · netDebt $2096M · TNL 1.233x · SSNL 0.623x
- Post BS: cash $1162M · totalDebt $3308M · secured $2271M · netDebt $2146M · TNL 1.262x · SSNL 0.652x
- Cash treatment: Debt-incurrence leverage convention leaves cash unchanged (proceeds not added to cash for TNL/SSNL tests). Limitation: not a full sources-and-uses balance sheet.
- Debt treatment: totalDebt +$50M; securedDebt +$50M
- SSNL room (mila_secured) consumed by $50M → expected $3991M
- TNL room (ca_leverage_cap) consumed by $50M → expected $5079M
- Lien ratio prong moves with SSNL; facility_flat (FLAT_NET_OF_DEBT net of secured) also declines $50M
- Basket: mila_secured CONSUMED -50
- Basket: ca_leverage_cap CONSUMED -50
- Basket: facility_flat CONSUMED -50
- Basket: rp_builder UNAFFECTED (debt incur does not touch Available Amount)
- Limitation: Cash proceeds of the draw are NOT added — explicit engine convention
- Limitation: Does not elect a specific basket permission for the draw
- Note: Independent secured pre must be $4,041M (mila), not dashboard $5,129M

### SEQ-S2-debt-repay-50 — Repay $50M Term Loan A (on S1 post-state)

- Outcome: **CORRECT_EXECUTABLE**
- Uses prior post-state: true
- Pre BS: cash $1162M · totalDebt $3308M · secured $2271M · netDebt $2146M · TNL 1.262x · SSNL 0.652x
- Post BS: cash $1112M · totalDebt $3258M · secured $2221M · netDebt $2146M · TNL 1.262x · SSNL 0.652x
- Cash treatment: Cash −$50M (repayment funded from cash). Because S1 did not add debt proceeds to cash, this paydown leaves cash $50M below the original baseline.
- Debt treatment: totalDebt −$50M; securedDebt −$50M (returns to baseline outstanding)
- Net debt rises vs original baseline (cash lower, debt same) → TNL room $5079M not $5129M
- SSNL room $3991M not $4041M — incomplete restoration vs day-0
- facility_flat RESTORED +50 vs S1 post (FLAT_NET_OF_DEBT nets secured outstanding)
- Vs pre-repay (S1 post): ratio rooms RESTORED +50; vs day-0: still −50 from cash drain
- Basket: mila_secured RESTORED +50 vs S1 post (not full day-0 restore)
- Basket: ca_leverage_cap RESTORED +50 vs S1 post (not full day-0 restore)
- Basket: facility_flat RESTORED +50 vs S1 post (full restore to day-0 flat capacity)
- Basket: rp_builder UNAFFECTED
- Limitation: Sequential overlay is hypothetical — actual Neon ledger unchanged
- Limitation: runCompanyScenario repayment is measured from baseline DB state (not S1 post); covenant overlays above are the sequential authority
- Limitation: S1 debt-funded convention (no cash proceeds) + cash repayment is an asymmetric pair — must remain explicit
- Note: Scenario-runner cash/debt deltas (baseline): cashΔ=-50, debtΔ=-50, netDebtΔ=0
- Note: Pre-repay package secured was $3991M (S1 post); post sequential secured $3991M

### SEQ-S3-dividend-25 — Pay $25M dividend (on S2 post-state)

- Outcome: **CORRECT_EXECUTABLE**
- Uses prior post-state: true
- Pre BS: cash $1112M · totalDebt $3258M · secured $2221M · netDebt $2146M · TNL 1.262x · SSNL 0.652x
- Post BS: cash $1087M · totalDebt $3258M · secured $2221M · netDebt $2171M · TNL 1.277x · SSNL 0.667x
- Cash treatment: Cash −$25M. Net debt rises by $25M → TNL/SSNL rooms shrink.
- Debt treatment: Debt unchanged
- TNL room falls by $25M (cash reduction) → expected unsecured $5054M
- SSNL room falls by $25M → expected secured $3966M
- Dividend is not lien-creating but cash reduction affects leverage-based capacity
- Basket: rp_builder step CONSUMED −$25M (pre step 2685 → 2660)
- Basket: rp_general UNAFFECTED (builder absorbed full amount)
- Basket: Shared Available Amount pool with investments
- Limitation: simulateRestrictedPayment does not itself reduce cash — cash overlay applied for leverage integrity
- Limitation: Hypothetical ledger debit appended for sequential pool; Neon ledger not written
- Note: RP sim allocated from Builder Basket (Available Amount)

### SEQ-S4-equity-contribution-100 — Receive $100M equity contribution (on S3 post-state)

- Outcome: **CORRECT_EXECUTABLE**
- Uses prior post-state: true
- Pre BS: cash $1087M · totalDebt $3258M · secured $2221M · netDebt $2171M · TNL 1.277x · SSNL 0.667x
- Post BS: cash $1187M · totalDebt $3258M · secured $2221M · netDebt $2071M · TNL 1.218x · SSNL 0.608x
- Cash treatment: Cash +$100M
- Debt treatment: Debt unchanged
- TNL/SSNL rooms expand by $100M from cash
- No new liens
- Basket: rp_builder INCREASED +$100M via §3.4(a)(C)(3)-(4) equity proceeds / equity contribution prongs (includeEquityProceeds=true)
- Basket: facility_flat / general_debt / facility_grower UNAFFECTED (no debt term / no equity term)
- Limitation: No ScenarioAction EQUITY_CONTRIBUTION — financial overlay only
- Limitation: Seed equityProceedsSinceIssue already includes historical contributions; this adds a further hypothetical $100M
- Note: Legal authority: Notes Available Amount definition — 100% net cash proceeds of Capital Stock issuance and equity contributions since Issue Date, Not Otherwise Applied (§3.4(a)(C)(3)-(4))

### SEQ-S5-restricted-investment-25 — Make $25M restricted investment (on S4 post-state)

- Outcome: **CORRECT_EXECUTABLE**
- Uses prior post-state: true
- Pre BS: cash $1187M · totalDebt $3258M · secured $2221M · netDebt $2071M · TNL 1.218x · SSNL 0.608x
- Post BS: cash $1162M · totalDebt $3258M · secured $2221M · netDebt $2096M · TNL 1.233x · SSNL 0.623x
- Cash treatment: Cash −$25M (investment funded in cash). Classification: Restricted Investment under Notes §3.4 waterfall (kind=investment), sharing Available Amount with dividends.
- Debt treatment: Debt unchanged
- Cash reduction shrinks TNL/SSNL rooms
- Not a lien grant; debt baskets UNAFFECTED except via cash/leverage
- Basket: Shared RP pool CONSUMED −$25M from builder step (pre step 2760)
- Basket: Dividends and investments share the same waterfall — sequential S3 dividend already reduced pool
- Limitation: RP sim capacity-only; cash overlay applied for leverage integrity
- Limitation: Hypothetical INVESTMENT ledger debit; Neon not written

## 6. Known versus unknown utilization

Known:
- EQUITY CREDIT $1998M
- ASSET_SALE CREDIT $400M
- ASSET_SALE CREDIT $-96M
- DEBT_REPAY CREDIT $502M
- DIVIDEND DEBIT $150M
Unknown:
- DEBT_INCUR ledger empty — prior debt-basket elections/draws not recorded as utilization against facility_flat / general_debt / MILA
- Lien grant historical usage not separately ledgered
- Investment DEBIT rows absent — only DIVIDEND $150M debit known against shared Available Amount pool

## 7. Sequential integrity

S2–S5 each start from the prior step's post financial/ledger overlay. Neon ACTIVE ledger is never written. runCompanyScenario repayment is an independent baseline check; sequential covenant authority is the overlay chain.

## 8. Authentic financial approval status

- Classification: **EVALUATION_SEED_NOT_NS4_APPROVED**
- NS-4 APPROVED: 0
- Phase-4 REQUIRE executable: false
- Coherent financials are evaluation-seed FinancialSnapshot/FinancialState rows with lawyer-reviewed permissions/golden tests, but zero NS-4 APPROVED ContractInputSnapshot. Do not claim Phase-4 REQUIRE execution from these inputs.

## 9. Outcomes

{
  "correctExecutable": 5,
  "correctRefusals": 1,
  "falseFavorable": 0,
  "incorrect": 0,
  "limitations": [
    "Debt-incurrence engine convention = immediately-spent (cash unchanged); cash-retained proceeds documented separately as MODELED dual treatment",
    "No NS-4 APPROVED financials — not Phase-4 REQUIRE; figures labeled MODELED / EVALUATION_SEED_NOT_NS4_APPROVED",
    "Unknown DEBT_INCUR historical utilization (#234)",
    "Solver-native package min is NON_AUTHORITATIVE_DIAGNOSTIC; customer binding is MODELED_CROSS_DOCUMENT mila_secured $4,041M (#218)",
    "Financial approval still open (#220)",
    "No officer/compliance certificate Document rows for Coherent in Neon"
  ]
}

## Equity builder legal authority

Indenture Available Amount §3.4(a)(C)(3)-(4): 100% of net cash proceeds from Capital Stock (other than Disqualified Stock) and equity contributions since Issue Date, to the extent Not Otherwise Applied. Exclusions: Disqualified Stock; amounts otherwise applied. Seed equityProceedsSinceIssue=$2,150M is historical attribution since Issue Date under evaluation-seed financials (includeEquityProceeds=true). Issue-date eligibility: only post-Issue-Date contributions credit the builder — pre-issue equity is out of scope. MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining capacity.
Formula: max($330M, 25% EBITDA) + 50% CNI + 100% equity proceeds/contributions since issue
Starter $425M + CNI $260M + equity $2150M = $2835M

## Matthews

CORRECT_REFUSAL: Matthews has financials and permissions but zero CovenantProvision rows and no capacityFormulas — capacity remains NOT_EXECUTABLE. Do not invent formulas.
Next: Reuse document onboarding + legal-review pipeline to extract/review CovenantProvision and capacityFormulas from Matthews credit agreement / second-lien notes before any capacity claim.

## Product convergence

- Position: getCompanyDashboard / computeCovenantPosition — packageAuthoritative MODELED_CROSS_DOCUMENT for customer headlines; solver-native is NON_AUTHORITATIVE_DIAGNOSTIC
- Simulate: runCompanyScenario + simulateDebtIncurrence / simulateRestrictedPayment — same CompanyCovenantData financials + ledger; sequential overlays for multi-step drafts
- Ask: Covenant Ask / research summaries are DISCOVERED ≠ capacity; must not answer dollar capacity without the same position engine + authority label
- Shared state: Single as-of FinancialState/Snapshot + ACTIVE ledger + capacityFormulas/provisions; transaction draft is a pure overlay (StateDelta / scenario actions) never mutating Neon until an authorized commit path exists
- MODELED / EVALUATION_SEED_NOT_NS4_APPROVED capacity ≠ verified remaining capacity / Phase-4 REQUIRE. Coherent today: modeled + evaluation seed; Phase-4 REQUIRE: unavailable (no NS-4 APPROVED).

## Coordination

- #220 — Financial figures remain EVALUATION_SEED_NOT_NS4_APPROVED (zero NS-4 APPROVED ContractInputSnapshot). No certification bypass; financial approval still required before any verified-capacity claim.
- #234 — DEBT_INCUR / lien grant / investment debit utilization incomplete in Neon ledger (only DIVIDEND $150M known against shared Available Amount). Capacity figures are modeled gross of unknown historical draws.
- #218 — Cross-document binding is MODELED_CROSS_DOCUMENT min across capacityFormulas. Solver-native elections are NON_AUTHORITATIVE_DIAGNOSTIC after lien-coverage + CONCURRENT_COUNTED fixes; package secured binding remains Indenture mila_secured, not CA TNL.
