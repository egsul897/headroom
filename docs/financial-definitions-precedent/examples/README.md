# Source-backed vignettes

Short human-readable illustrations. Normative machine data lives in the parent JSON artifacts.

## 1. Same label, different EBITDA (CHWY vs CONMED)

- **CHWY** `Consolidated EBITDA` includes elected Expected Run Rate Benefit (synergies/cost savings/etc.) with a **36-month** action lookforward and anti-duplication under §1.08(d)(ii).
- **CONMED** `Consolidated EBITDA` allows Pro Forma Adjustments on Material Acquisitions **capped at 15%** of Consolidated EBITDA (net of benefits realized) and Transaction/Material Acquisition costs **capped at $30,000,000**.

Do not substitute one formula for the other.

## 2. Cash netting is not one mechanic

- **CHWY:** unrestricted cash/Cash Equivalents reduce **Consolidated Total Debt** inside the debt definition (no dollar cap in the captured definition span); first-lien/senior secured debt inherit that netting.
- **CONMED:** leverage ratios subtract **the lesser of $100,000,000 and unrestricted cash/Cash Equivalents** from the funded-debt numerator. The Second Amendment raised that cap from $75,000,000 to $100,000,000 — version binding is mandatory.

## 3. Available Amount builders diverge

- **CHWY §6.08(a)(3):** greater of (x) 50% cumulative CNI, (y) 100% Retained Excess Cash Flow, (z) cumulative Consolidated EBITDA − 140% cumulative Consolidated Interest Expense (with zero floors), plus equity and other prongs.
- **FWRG:** CNI Growth Amount (ratio-gated at 4.50x Total Rent Adjusted Net Leverage) plus Qualified Capital Stock contributions, excluding Cure Amount / AECA.

Capacity utilization semantics → Basket Formula Library.

## 4. Fixed Charge Coverage Ratio is not portable

- **FWRG:** `(Adjusted EBITDAR − maintenance capex − cash taxes added back − selected Cash RPs) / Consolidated Fixed Charges`.
- **LSB:** `(EBITDA − Capex) / (scheduled principal + Consolidated Net Interest Expense + capital lease payments)`.

## 5. Maintenance numbers are not baskets

CONMED §7.1 `3.75x` / `5.50x` / `2.75x` (and step-up ceilings) are maintenance conditions. See `05-negative-examples-conditions-not-capacity.json`.

## 6. Missing inputs

Evaluating CHWY Total Leverage without attested covenant EBITDA, Consolidated Total Debt components, and Excluded Revolving Loans must surface `MISSING_INPUT:*` keys from `06-missing-financial-inputs.json` — never a fabricated ratio.
