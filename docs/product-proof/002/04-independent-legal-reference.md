# Independent legal reference — MHK holdout

**Prepared after freeze** (`freeze-manifest.json` sha256 `6ee4abf3…`, frozenAt 2026-10-10T12:00:00Z).  
Source: frozen extracted text of Mohawk Industries, Inc. Credit Agreement (accession 0001104659-26-060295).

This reference is for scoring only. It is not injected into production logic.

## Operative negative-covenant architecture

Unlike MTN (prohibition → `Permitted Debt` / `Permitted Liens` definitions), MHK places lettered baskets **inside** the negative-covenant sections:

### §7.01 Liens

Chapeau: *Create, incur, assume or suffer to exist any Lien … other than the following:*

Top-level lettered exceptions **(a)–(w)** (23 clauses), including material baskets:

| Clause | Material content (abbrev.) |
|---|---|
| (a) | Liens under Loan Documents / Refinancing Indebtedness |
| (b) | Existing Liens on Schedule 7.01 |
| (i) | Capex / capital lease / purchase-money Liens; aggregate secured amount ≤ **$100,000,000** |
| (t) | Receivables Liens tied to Permitted Receivables Financing under **§7.03(f)** |
| (u) | Additional Liens; aggregate with **§7.03(g)** Indebtedness ≤ greater of **10% of Total Consolidated Assets** and **$1,500,000,000** |
| (w) | PPS Leases (operating leases/consignments) |

### §7.03 Indebtedness

Chapeau: *Create, incur, assume or suffer to exist any Indebtedness, except:*

Top-level lettered exceptions **(a)–(l)** (12 clauses), including:

| Clause | Material content (abbrev.) |
|---|---|
| (a) | Loan Document Indebtedness + Refinancing |
| (e) | Capex / capital lease debt permitted under **§7.01(i)** |
| (f) | Permitted Receivables Financings ≤ **$700,000,000** (no term-loan form) |
| (g) | Additional Indebtedness; combined with **§7.01(u)** ≤ greater of **10% TCA** and **$1,500,000,000** |
| (l) | Australian cross-guarantee Indebtedness |

### Financial covenant

§7.12 Consolidated Net Leverage Ratio financial covenant (referenced throughout; not a lettered debt/lien basket catalog).

## Expected autonomous discoveries (scoring targets)

1. Section exception catalogs for **7.01** and **7.03** (not `Permitted *` definitions).
2. Exact top-level markers a–w and a–l.
3. Cross-links **7.01(u)↔7.03(g)**, **7.01(i)↔7.03(e)**, **7.01(t)→7.03(f)**.
4. Caps/thresholds preserved as source excerpts (not silently rewritten).
5. No affirmative executable permission without VEP.

## Explicit non-targets for autonomous-success metrics

- Full executable IR for greater-of TCA formulas
- Numerical remaining capacity
- Structural-node Pass A coverage (MHK extract yields 0 structural nodes)
