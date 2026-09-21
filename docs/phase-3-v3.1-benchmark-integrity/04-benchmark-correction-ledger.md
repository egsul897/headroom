# Benchmark Correction Ledger — Phase-3 V3.1 47-case benchmark

**Proposed corrections only. The frozen benchmark was not modified.**

Generated 2026-09-21T03:45:36.037Z · 4 material defects across 47 cases.

## CASE-e3520246bd — `fwrg-6.04-a-xi`

**Document** fwrg · **Section** 6.04(a)(xi) · **Defect** INVENTED_NEGATIVE_CONDITION (the claim affirmatively asserts the ABSENCE of a condition the source imposes) · **Materiality** MATERIAL

### What the benchmark says

> Unlimited (uncapped-dollar) Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio, calculated Pro Forma, would not exceed a fixed ratio - a ratio-gated unlimited basket with no default condition attached. 3.50:1.00 Total Rent Adjusted Net Leverage Ratio, Pro Forma Basis The single most dangerous plausible extraction error in this whole package: an extractor that reports a dollar threshold (or omits the ratio gate) for this clause instead of 'uncapped subject to a leverage-ratio test' would be confidently wrong and, unless conditions[] is checked, unflagged. This is a design

### What the source actually says

- *fwrg Article 6, Section 6.04(a), clause (xi)* (SOURCE_CONTRADICTED): "(xi) so long as no Event of Default exists, the Borrower may make Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio, calculated on a Pro Forma Basis, would not exceed 3.50:1.00 as of the last day of the most recently ended Test Period;"

### Why it matters

A Headroom representation that CORRECTLY emits a NO_DEFAULT condition on this basket would be scored as adding a condition the benchmark says does not exist — a correct representation marked wrong. Conversely a representation that omits the gate would be marked right. Both directions are wrong, and the second is the dangerous one: it would certify as accurate a model that lets the borrower pay dividends during an Event of Default.

### Proposed corrected claim

> Unlimited (uncapped-dollar) Restricted Payments, permitted SO LONG AS NO EVENT OF DEFAULT EXISTS and so long as the Total Rent Adjusted Net Leverage Ratio, calculated on a Pro Forma Basis, would not exceed 3.50:1.00 as of the last day of the most recently ended Test Period. 3.50:1.00 Total Rent Adjusted Net Leverage Ratio, Pro Forma Basis; NO_DEFAULT condition.

**Source path** `tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt` · **Provenance** AI_ADJUDICATED_FROM_SOURCE_ONLY, externallyHumanReviewed=false

---

## CASE-9001417020 — `fwrg-6.04-b`

**Document** fwrg · **Section** 6.04(b)(iv) · **Defect** MISSING_CONDITION (no-Event-of-Default gate omitted) · **Materiality** MATERIAL

### What the benchmark says

> Restricted Debt Payments (early/voluntary paydown of subordinated/junior/unsecured debt above a size threshold) permitted up to the greater of a fixed dollar amount and a % of EBITDA, with an explicit cross-basket offset against the 6.04(a)(x) Restricted Payments basket. $21,000,000; 35% of Consolidated Adjusted EBITDA The cross-basket offset ('any amount utilized ... shall result in a reduction in the amount available under Section 6.04(a)(x)') is exactly what ContractRuleRelationshipType.SHARES_CAPACITY_WITH exists for - representable, but only if the extractor actually emits that relationsh

### What the source actually says

- *fwrg Article 6, Section 6.04(b), clause (iv)* (SOURCE_CONTRADICTED): "(iv) so long as no Event of Default exists, Restricted Debt Payments in an aggregate amount not to exceed (A) ..."

### Why it matters

Same mechanism: a correct NO_DEFAULT condition on 6.04(b)(iv) would read as an invented condition; an omission would read as correct.

### Proposed corrected claim

> Restricted Debt Payments permitted SO LONG AS NO EVENT OF DEFAULT EXISTS, in an aggregate amount not to exceed (A) the greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA as of the last day of the most recently ended Test Period, plus (B) at the Borrower's election, the amount of Restricted Payments then permitted under Section 6.04(a)(x), with any amount so used reducing the amount available under Section 6.04(a)(x). $21,000,000; 35% of Consolidated Adjusted EBITDA; NO_DEFAULT condition; SHARES_CAPACITY_WITH 6.04(a)(x).

**Source path** `tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt` · **Provenance** AI_ADJUDICATED_FROM_SOURCE_ONLY, externallyHumanReviewed=false

---

## CASE-a898053843 — `lsb-6.04-a-abl-collateral-disposal`

**Document** lsb · **Section** 6.04(a) · **Defect** MIS-SCOPED_RULE (a general disposal basket recast as collateral-type-specific; a conditional sub-requirement converted into basket eligibility) · **Materiality** MATERIAL

### What the benchmark says

> Disposal of ABL Priority Collateral permitted only if (i) a new Borrowing Base Certificate is delivered demonstrating continued compliance, (ii) sold at Fair Market Value, and (iii) aggregate annual dispositions under this clause do not exceed the greater of $10,000,000 and 1.0% of total consolidated assets. $10,000,000; 1.0% of total consolidated assets Same TOTAL_ASSETS-percentage gap as lsb-6.01-i. Additionally, this basket's own eligibility is scoped by SECURITY_SCOPE (only ABL Priority Collateral) - a real, correctly-representable use of the ContractConditionType SECURITY_SCOPE, but the s

### What the source actually says

- *lsb §6.04(a)* (SOURCE_CONTRADICTED): "(a) a Loan Party and any Subsidiary of a Loan Party may sell or otherwise dispose of any of its other assets, provided that (i) TO THE EXTENT SUCH DISPOSITION INVOLVES ABL PRIORITY COLLATERAL, the Borrowers shall have ... delivered a new Borrowing Base Certificate ..."
- *lsb §6.04(a)(i)* (SOURCE_PARTIALLY_CONFIRMED): "delivered a new Borrowing Base Certificate (giving effect to such disposition ...) demonstrating compliance with Section 2.01(a)"

### Why it matters

A representation that models 6.04(a) as a general disposal basket — which is what the source says — would be scored as wrong on transaction/collateral scope. A representation that wrongly restricts the basket to ABL Priority Collateral would be scored as right, and would understate the borrower's actual disposal capacity for every non-ABL asset.

### Proposed corrected claim

> General permission for a Loan Party or its Subsidiary to sell or otherwise dispose of any of its other assets, provided that (i) TO THE EXTENT the disposition involves ABL Priority Collateral, a new Borrowing Base Certificate is delivered concurrently or earlier demonstrating compliance with Section 2.01(a), (ii) the assets are sold for Fair Market Value, and (iii) the aggregate Fair Market Value of all assets sold in any fiscal year under Section 6.04(a) does not exceed the greater of $10,000,000 and 1.0% of the total consolidated assets of the Loan Parties and their Subsidiaries per the GAAP balance sheet. $10,000,000; 1.0% of total consolidated assets. SECURITY_SCOPE (ABL Priority Collateral) conditions the Borrowing Base Certificate requirement only; it does NOT scope the basket's eligibility.

**Source path** `tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt` · **Provenance** AI_ADJUDICATED_FROM_SOURCE_ONLY, externallyHumanReviewed=false

---

## CASE-1284ab8e71 — `lsb-6.08-subordinated-debt-payments`

**Document** lsb · **Section** 6.08 · **Defect** MISSING_CONDITION + INCOMPLETE_ENUMERATION (anti-stacking proviso on the $500,000 residual basket omitted; carve-out (i) omitted) · **Materiality** MATERIAL

### What the benchmark says

> Prohibition on payments of Indebtedness generally (other than the Secured Notes/Secured Obligations), with carve-outs for scheduled payments of permitted debt, refinancing payments, payments of Subordinated Indebtedness only as its own subordination terms allow, Payment-Conditions-gated payments, and a $500,000/year fixed basket; separately, no amendment of Subordinated Indebtedness terms materially adverse to the Lenders. $500,000 PRIORITY_RULE is the correct ContractRuleType (this gates payment priority among debt tiers, mirroring FWRG's own fwrg-def-restricted-debt finding), but this sectio

### What the source actually says

- *lsb §6.08(a)* (SOURCE_PARTIALLY_CONFIRMED): clauses (ii),(iii),(iv),(v),(vi)
- *lsb §6.08(a)(vi)* (SOURCE_CONTRADICTED): "(vi) payments of Indebtedness not to exceed $500,000 in the aggregate in any fiscal year of the Loan Parties (IT BEING UNDERSTOOD AND AGREED THAT ANY PAYMENT OF INDEBTEDNESS MADE PURSUANT THIS CLAUSE (VI) SHALL ONLY BE PERMITTED IF SUCH PAYMENT WOULD NOT, AT THE TIME THEREOF, BE PERMITTED (OR BE ABLE TO BE MADE) UNDER ANY OTHER CLAUSE OF THIS SECTION 6.08(A))"

### Why it matters

The $500,000 basket's residual character is the whole of its economic meaning. A representation that correctly models it as available only where no other clause permits the payment would be scored against a benchmark that describes it as a free-standing parallel basket.

### Proposed corrected claim

> Prohibition on payments in respect of Indebtedness (other than Indebtedness in respect of the Secured Notes), with SIX enumerated carve-outs: (i) payments in respect of the Secured Obligations; (ii) scheduled principal/interest and other required amounts on Indebtedness permitted under Section 6.01, other than Subordinated Indebtedness; (iii) payments resulting from a refinancing permitted by Section 6.01(d); (iv) payments of Subordinated Indebtedness to the extent its own subordination terms permit; (v) payments to the extent the Payment Conditions are satisfied; and (vi) a RESIDUAL basket of payments not exceeding $500,000 in the aggregate in any fiscal year, AVAILABLE ONLY FOR PAYMENTS THAT NO OTHER CLAUSE OF SECTION 6.08(a) WOULD PERMIT AT THE TIME. Separately, Section 6.08(b) prohibits amendments to Subordinated Indebtedness terms materially adverse to the Administrative Agent or the Lenders (as determined by the Administrative Agent in its Permitted Discretion). $500,000.

**Source path** `tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt` · **Provenance** AI_ADJUDICATED_FROM_SOURCE_ONLY, externallyHumanReviewed=false

---

