# Domain executability — PP003 capability execution

**Baseline PR #346 SHA:** `046161e78dc206c50ee951d71a18dfa4befd3206`  
**Branch tip:** see `artifacts/00-evaluation.json` → `canonicalMainSha`  
**Matthews package:** debt / liens (AUTHENTIC_SOURCE_BACKED)  
**CONMED Article VII fixture:** investments / restricted payments / asset sales (AUTHENTIC_FIXTURE_SOURCE)

Statuses used (exactly one per domain):

- `IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE`
- `PARTIALLY_EXECUTABLE`
- `BLOCKED_BY_MISSING_REAL_EVIDENCE`
- `NOT_IMPLEMENTED`

| Domain | Status | Source package | What executes | Hard blocker |
|---|---|---|---|---|
| Debt incurrence | **PARTIALLY_EXECUTABLE** | Matthews | Leaf `evaluateProvision` Permitted Debt + FCCR room | No production remaining; no authentic VEP multi-path simulate |
| Liens | **PARTIALLY_EXECUTABLE** | Matthews | CA §6.01(j) structural zero (Sixth Amendment) | No dual-path Indenture+CA secured companion for NEW liens |
| Investments | **IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE** | CONMED §7.8(l) | Greater-of $75M / 3.5% CTA fidelity compile → 4E enum + REQUIRE capacity/sim | Verified remaining null; CTA for gross probe is HYPOTHETICAL only; not package CERTIFIED |
| Restricted payments | **IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE** | CONMED §7.6(d) | Fixed-dollar $40M/fiscal-year fidelity compile → 4E enum + REQUIRE capacity/sim | Verified remaining null; ratio/builder RP not claimed |
| Asset sales | **IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE** | CONMED §7.5(j) | Greater-of $25M / 1.5% CTA de minimis → ASSET_SALE kind + recipe + REQUIRE | Verified remaining null; §7.5(f) annual baskets not claimed |
| Applicable financial covenants | **PARTIALLY_EXECUTABLE** | Matthews + main (#345/#332) | Modeled FCCR / leverage rooms; contractual-metrics modules on main | EBITDA reconstruction unverified; corrected #341 tip not fully absorbed |
| Amendments | **PARTIALLY_EXECUTABLE** | Matthews + CONMED fixtures | Sixth Amendment caveat; CONMED Omnibus/Second Amendment texts present | Amendment effects not attached to multi-family unit compile |
| Shared capacity | **PARTIALLY_EXECUTABLE** | main IR | 4C shared capacity in-memory | No authentic dual-path shared-cap; #340 not landed (no duplicate engine) |
| Historical utilization | **BLOCKED_BY_MISSING_REAL_EVIDENCE** | Matthews | Attributed events; UNKNOWN≠zero; remaining refused | No completeness certificate — did **not** stop RP/Inv/AS family work |

## CONMED unit bindings (source-backed)

| Family | Section | Formulation | Gross (hypothetical) | Remaining | Document |
|---|---|---|---:|---|---|
| RESTRICTED_PAYMENTS | §7.6(d) | FIXED_DOLLAR | $40,000,000 | **null** | `conmed-doc-a-eighth-ar-credit-agreement` |
| INVESTMENTS | §7.8(l) | GREATER_OF_ASSETS | $75,000,000 (at stipulated $2B CTA) | **null** | same |
| ASSET_SALES | §7.5(j) | GREATER_OF_ASSETS | $30,000,000 (at stipulated $2B CTA) | **null** | same |

Machine-readable: `artifacts/01-domain-status.json`, `artifacts/04-conmed-multi-family.json`.
