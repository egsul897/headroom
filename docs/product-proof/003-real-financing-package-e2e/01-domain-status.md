# Domain executability — Matthews authentic package @ main `8374fa2a`

Statuses used (exactly one per domain):

- `IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE`
- `PARTIALLY_EXECUTABLE`
- `BLOCKED_BY_MISSING_REAL_EVIDENCE`
- `NOT_IMPLEMENTED`

| Domain | Status | What executes on main | Hard blocker |
|---|---|---|---|
| Debt incurrence | **PARTIALLY_EXECUTABLE** | Leaf `evaluateProvision` for Permitted Debt (1)(a)/(1)(b)(x)/(2) + §4.09(a) FCCR room; VE fixed-dollar gross $1300M for (1)(a) | No production remaining; no authentic VEP multi-path simulate |
| Liens | **PARTIALLY_EXECUTABLE** | CA §6.01(j) structural zero (Sixth Amendment) modeled | No dual-path Indenture+CA secured companion for NEW liens; composition is hypothetical |
| Investments | **NOT_IMPLEMENTED** | Family signal recognition + recipe shape only | No authentic Investment basket / IR / leaf for Matthews |
| Restricted payments | **NOT_IMPLEMENTED** | Recipe + legacy Coherent RP waterfall (other company) | No Matthews RP waterfall / builder / util |
| Asset sales | **NOT_IMPLEMENTED** | Recipe + `simulateAssetSale` engine API | No Matthews `assetSale` config / threshold |
| Applicable financial covenants | **PARTIALLY_EXECUTABLE** | Leverage metrics + modeled FCCR / secured leverage rooms from authentic 10-Q inputs | EBITDA reconstruction unverified; NS-4 APPROVED AFC path still absorbing on open PRs |
| Amendments | **PARTIALLY_EXECUTABLE** | Sixth Amendment caveat on §6.01(j); Phase-2G libraries | Full as-amended operative IR not product-bound for Matthews CA |
| Shared capacity | **PARTIALLY_EXECUTABLE** | 4C `IRSharedCapacity` + verified-execution shared units in-memory | Authentic package has no certified shared-cap dual-path; Stage D demo is synthetic |
| Historical utilization | **BLOCKED_BY_MISSING_REAL_EVIDENCE** | 2 attributed events ($778.882M); UNKNOWN≠zero; remaining refused | No reviewer completeness certificate; trusted-issuer BLOCKED |

## Numeric honesty (debt/lien leaf)

| Code | Section | Modeled ($M) | Remaining published | Authority |
|---|---|---:|---:|---|
| `ind_permitted_debt_1a_flat` | Permitted Debt (1)(a) | 521.118 | **null** | `GROSS_ONLY_UTILIZATION_INCOMPLETE` |
| `ind_ratio_debt_fccr` | §4.09(a) | 110.336 | **null** | `MODELED_AUTHENTIC_EVIDENCE` |
| `ind_permitted_debt_1b_ratio_secured` | (1)(b)(x) | 0 | **null** | `MODELED_AUTHENTIC_EVIDENCE` |
| `ind_permitted_debt_2_notes` | (2) grandfather | 300 gross / 0 NEW | **null** | `MODELED_AUTHENTIC_EVIDENCE` |
| `ca_lien_601j_2024notes` | CA §6.01(j) | 0 | **null** | `STRUCTURAL_ZERO` |
| VE (1)(a) fixed-dollar | source-backed compile | **1300 gross** | never AVAILABLE | `SOURCE_BACKED_COMPILED_GROSS` |
| Indenture secured composition | (1a room + FCCR) | 631.454 | — | `HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION` |

Machine-readable: `artifacts/01-domain-status.json`.
