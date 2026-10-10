# Product Proof 001 — Independent Legal Reference (Frozen)

**Reviewer role:** Lawyer-style reference analysis from operative SEC source text  
**Package:** Vail Holdings, Inc. Tenth A&R Credit Agreement (2026-02-09) + related notes indentures + FY2026 10-K  
**Freeze time:** 2026-10-10T10:24:00Z — **before** comparison to Headroom engine outputs  
**Method:** Direct reading of frozen extracted text; citations are section/definition anchors in Doc A unless noted  

> This truth set must not be edited to match Headroom. Engine disagreements belong in `05-results-comparison.md`.

---

## 1. Operative debt covenant

**Negative covenant:** §10.4 Debt  
> “No Restricted Company shall create, incur or suffer to exist any Debt, other than Permitted Debt.”

**Entity scope:** Restricted Companies (Borrower / Restricted Subsidiaries per definitions), not Unrestricted Subsidiaries generally.

**Exceptions:** The entire permission set is the definition of **Permitted Debt** (Section 1.1), not lettered carveouts under §10.4 itself.

### Permitted Debt (material baskets for this challenge)

| Clause | Permission (summary) | Key conditions / caps | Citation |
|---|---|---|---|
| (a) | The Obligation (facility debt) | — | Permitted Debt (a) |
| (b) | Debt listed on Schedule 2.3 Part B | Schedule-dependent | Permitted Debt (b) |
| (d) | Subordinated Debt (+ subordinated guaranties) | Pro forma §11 compliance; no Default | Permitted Debt (d) |
| (f) | Bonds (non-housing) | Pro forma §11; no Default | Permitted Debt (f) |
| (h) | Guaranties/contingent obligations | Caps via Investment Limits for Unrestricted Subs / JVs | Permitted Debt (h) |
| (j) | Intercompany Debt among Restricted Companies | — | Permitted Debt (j) |
| (k) | Cap leases / deferred purchase / surety | Cap: **5% of Total Assets** aggregate | Permitted Debt (k) |
| **(l)** | **Secured Debt** | Cap: **Maximum Facility Amount − Facility Amount** when incurred; **intercreditor** required; pari passu Collateral | Permitted Debt (l); Secured Debt def; Permitted Liens (d) |
| (m) | Specified / other Capital Leases | §9.10; pro forma §11; no Default; property not owned on Closing Date (with listed exceptions) | Permitted Debt (m) |
| (n) | Acquisition / assumed Debt | **$100,000,000** aggregate outstanding | Permitted Debt (n) |
| (o) | Non-US Restricted Company Debt | **$50,000,000** aggregate outstanding | Permitted Debt (o) |
| (p) | 2025 VRI Senior Notes + other senior unsecured (HY / converts) | (x) ≤ **$600,000,000** maturing before Revolver Termination Date (excluding 2025 notes); (y) Restricted Subsidiaries other than Borrower ≤ **$50,000,000** | Permitted Debt (p) |

**Primary path for hypothetical secured incremental debt:** clause **(l)**, supported by lien permission Permitted Liens **(d)**.

---

## 2. Operative lien covenant

**Negative covenant:** §10.5 Liens  
> “No Restricted Company shall create, incur, or suffer or permit to be created or incurred or to exist any Lien upon any of its assets, other than Permitted Liens.”

### Permitted Liens relevant to secured incremental debt

| Clause | Permission | Tie to debt | Citation |
|---|---|---|---|
| (a) | Liens under Security Documents / Obligation; ratable Financial Hedge liens | Secures Obligation | Permitted Liens (a); §6 |
| **(d)** | Liens on Collateral securing Debt permitted by Permitted Debt **(l)** | Direct dual-path for (l) Secured Debt | Permitted Liens (d) |
| (e) | Bond Document liens on financed assets | Bonds | Permitted Liens (e) |
| (f) | Purchase-money liens on acquired assets | Purchase-money Debt | Permitted Liens (f) |
| (q) | Liens on non-US Restricted Company assets securing Debt (o) | Foreign Debt basket | Permitted Liens (q) |

**Material limitation:** Security Documents themselves were **not filed** with the Tenth A&R 8-K; collateral package details are incomplete in this freeze.

---

## 3. Shared capacity / anti-stacking

1. **Facility headroom shared concept:** Permitted Debt (l) capacity = `Maximum Facility Amount − Facility Amount`. Facility Amount includes Total Commitment + Incremental Term Loan Facilities — so revolver/term upsizing consumes (l) headroom.  
2. **§11 financial covenants** apply as pro forma conditions to several baskets ((d), (f), (m)) — not a numeric shared pool, but a cross-cutting gate.  
3. **Senior Secured Leverage Ratio §11.3** constrains secured Net Funded Debt / Adjusted EBITDA ≤ **4.00x** — interacts with secured incurrence even when (l) numeric headroom appears available.  
4. **Permitted Debt (p)** internal sub-caps (maturity / non-Borrower) are anti-stacking within (p), not with (l).  
5. **No classic “shared builder basket”** analogous to Available Amount RP/Investment pooling was identified as the primary secured-debt constraint; Investments §10.8 has separate limits.

---

## 4. Ratios, conditions, definitions affecting permissions

| Item | Operative content | Citation |
|---|---|---|
| Maximum Leverage Ratio | Net Funded Debt / Adjusted EBITDA ≤ **6.25x** | §11.1 |
| Interest Coverage Ratio | Adjusted EBITDA / cash interest ≥ **2.00x** | §11.2 |
| Senior Secured Leverage Ratio | Secured Net Funded Debt / Adjusted EBITDA ≤ **4.00x** | §11.3 |
| Maximum Facility Amount | Greater of **$2,750,000,000** and **3.50 × Adjusted EBITDA** (LTM) | Definitions |
| Facility Amount | Total Commitment + Incremental Term Loan Facilities | Definitions |
| Secured Debt | Debt secured by Collateral on a **pari passu** basis | Definitions |
| Net Funded Debt | Funded Debt − Unrestricted Cash > $10,000,000 | Definitions |
| Adjusted EBITDA | EBITDA + specified addbacks (business interruption, non-cash losses, etc.) | Definitions |
| Restricted Company | Defined term controlling §10 entity scope | Definitions |

---

## 5. Entity / guarantor restrictions

- §6 Guaranty and Security: payment guaranty + Collateral requirements for Restricted Companies.  
- Unrestricted Subsidiaries are outside many §10 restrictions but investments/guaranties into them are capped (§10.8 / Permitted Debt (h)).  
- Permitted Debt (p)(y) limits non-Borrower Restricted Subsidiary senior unsecured debt to $50M.

---

## 6. Amendment precedence

- Tenth A&R dated **2026-02-09** is the operative credit agreement text (restatement of Ninth A&R as described in FY2026 10-K).  
- 2024 and 2025 senior notes indentures are **separate instruments**, not amendments of the CA.  
- Missing prior CA versions mean historical amendment-effect reconstruction is incomplete; **current operative CA text is present**.

---

## 7. Cross-document dependencies

| Dependency | Status in freeze |
|---|---|
| CA ↔ Security Documents | Referenced; Security Documents **missing** |
| CA ↔ Intercreditor for (l) | Required by text; **missing** |
| CA ↔ Schedule 2.3 Part B | Embedded in CA HTML; not structured |
| CA ↔ 2025 VRI Senior Notes / indentures | Indentures present; notes referenced in Permitted Debt (p) |
| CA ↔ financial inputs (Adjusted EBITDA, Facility Amount components) | Public 10-K partial; not NS-4 certified |

---

## 8. Public financial evidence (not utilization ledger)

From FY2026 10-K (period ended 2026-07-31), Note 6 / liquidity discussion (public, unaudited for covenant math):

- Vail Holdings Credit Agreement revolver commitment **$600.0M**; outstanding **$180.0M**; availability about **$337.4M** (commitment less outstanding & L/Cs as described).  
- Term loan outstanding about **$1,243.1M** as of July 31, 2026; Tenth A&R replaced facility with new **$1,275.0M** senior term loan (narrative).  
- 6.50% Notes carrying value ~**$595.0M**; 5.625% Notes ~**$495.1M**; other secured notes/loans disclosed.

**These are not attributed Permitted Debt basket utilization certificates.**

---

## 9. Challenge answers (independent reference)

### A — What debt can be incurred?
Restricted Companies may incur only **Permitted Debt** (§10.4). Material baskets listed in §1 above, especially (a),(b),(d),(f),(h),(j)–(p).

### B — Lien permissions for proposed secured debt?
For pari passu Collateral-secured Debt under Permitted Debt (l): **Permitted Liens (d)** (and general Obligation liens (a) for facility debt). Purchase-money and other lien baskets do not authorize generic $50–100M incremental secured borrowing.

### C — Shared / anti-stacking?
(l) headroom shared with Facility Amount; §11.3 secured leverage gate; (p) internal caps. See §3.

### D — Ratios / defs?
§11.1–11.3; Maximum Facility Amount; Facility Amount; Secured Debt; Adjusted EBITDA; Net Funded Debt; Restricted Company.

### E — Historical usage?
Must consider: outstanding Secured Debt counting against (l); Facility Amount; Schedule 2.3; §11 ratio inputs; intercreditor status. **Authenticated basket ledger: MISSING.**

### F — Gross / remaining capacity?
**Independent estimate for (l) gross (illustrative, not certified):**  
If Maximum Facility Amount floors at $2.75B and Facility Amount ≈ $600M revolver + $1.275B term = **$1.875B**, then illustrative gross (l) ≈ **$875M**.  
**Adjusted EBITDA prong** may raise Maximum Facility Amount above $2.75B — **not independently computed here without a certified EBITDA build.**  
**Verified remaining capacity: NOT DETERMINED** (no completeness certificate / attributed (l) usage / confirmed Facility Amount as-of 2026-10-10 / intercreditor).

### G — $50M secured on 2026-10-10?
**Debt authority:** Plausibly within illustrative (l) headroom **if** Facility Amount/Maximum Facility Amount and §11.3 are satisfied and intercreditor is obtained — **but not verified**.  
**Lien authority:** Requires Permitted Liens (d) + Collateral/Security Documents scope — **UNCERTAIN** (docs missing).  
**Reference conclusion:** **REVIEW_REQUIRED / NOT DETERMINED** — must not be treated as affirmative permission.

### H — $100M secured?
Same path; still within illustrative $875M gross **if** assumptions hold; same blockers (utilization, §11.3, intercreditor, Security Documents). **NOT DETERMINED.**

### I — Subsequent capacity?
If a (l) debt were validly incurred, subsequent (l) capacity would reduce dollar-for-dollar by the outstanding amount (and Facility Amount changes would also move the cap). **Not simulatable as verified remaining without ledger.**

---

## 10. Material limitations

1. No Security Documents / intercreditor in package.  
2. No authenticated utilization ledger.  
3. No certified Adjusted EBITDA / Facility Amount as-of challenge date.  
4. Schedule 2.3 not structured.  
5. Indenture covenants are separate — not substituted for CA §10 analysis.

**Frozen.** Do not edit to match engine output.
