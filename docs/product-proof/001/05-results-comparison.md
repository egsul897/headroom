# Product Proof 001 — Results Comparison

**Compared after:** independent legal reference freeze (`04-independent-legal-reference.md`)  
**Headroom evidence:** `artifacts/*`, `03-pipeline-execution.md`  
**Rule:** truth set was not modified to match the engine.

---

## Question-by-question

| Q | Independent reference | Headroom product output | Match? |
|---|---|---|---|
| A Debt permissions | §10.4 → Permitted Debt (a)–(p) with cited caps | KF/Pass A located §10 / some INDEBTEDNESS signals; **did not compile basket inventory** | **PARTIAL** — section found, substance not extracted to rules |
| B Lien permissions | §10.5 → Permitted Liens; (d) ties to Debt (l) | KF tagged SECTION 10 with LIENS; **no lien-basket IR** | **PARTIAL** |
| C Shared / anti-stacking | (l)↔Facility Amount; §11.3; (p) subcaps | Not modeled | **MISS** |
| D Ratios / defs | §11.1–11.3 + key defs | Definition anchors found (9/9 probed); §11 tagged financial; **no executable ratio gates** | **PARTIAL** |
| E Usage / outstanding | 10-K public balances; ledger missing → NOT DETERMINED | Utilization authority: UNKNOWN; empty ≠ zero | **AGREE on integrity posture**; Headroom did not bind 10-K into attributed usage (correct refusal) |
| F Gross / remaining | Illustrative (l) gross possible; remaining NOT DETERMINED | Capacity REFUSED / NOT DETERMINED | **AGREE on remaining**; Headroom produced **no verified gross** either |
| G $50M secured | REVIEW_REQUIRED / NOT DETERMINED | `simulateVerifiedTransaction` → **REFUSED** (`VERIFICATION_ARTIFACT_INCOMPLETE`) | **AGREE fail-closed**; not an affirmative product answer |
| H $100M secured | Same | Same REFUSED | **AGREE fail-closed** |
| I Subsequent capacity | Would reduce (l) if incurred; unverified | Not simulatable | **AGREE blocked** |

---

## Provision identification scorecard (vs reference operative set)

Reference operative provisions for this challenge (core set = 12):

1. §10.4 Debt  
2. §10.5 Liens  
3. Permitted Debt definition (as exception catalog)  
4. Permitted Debt (l) Secured Debt basket  
5. Permitted Liens (d)  
6. §11.1 Maximum Leverage  
7. §11.2 Interest Coverage  
8. §11.3 Senior Secured Leverage  
9. Maximum Facility Amount  
10. Facility Amount  
11. Secured Debt definition  
12. Adjusted EBITDA / Net Funded Debt (ratio inputs)

| Metric | Count | Notes |
|---|---:|---|
| Correctly identified at discovery/structure/definition-anchor level | **8** | §10, §11, Permitted Debt/Liens anchors, MFA/Facility Amount/Secured Debt/Adj. EBITDA/Net Funded Debt anchors; §10.4/10.5 present in text structure |
| Material omissions (not compiled to executable permissions) | **12** | Entire executable set omitted — no IR/permissions |
| Incorrect inclusions (false covenant families treated as operative baskets) | **2** | KF noise: “Section 10.9 Indebtedness” definitional cluster; TOC-level INCREMENTAL family on §2 |
| False affirmative permissions | **0** | |
| False executable classifications | **0** | Empty VEP refused |

---

## Amendment / cross-document

| Topic | Reference | Headroom | Verdict |
|---|---|---|---|
| Tenth A&R operative | Restatement governs | Classified CREDIT_AGREEMENT; 0 amendment effects | Acceptable for this package |
| Indentures | Separate instruments | Classified INDENTURE ×2; no false merge into CA | Good |
| 10-K | Financial evidence only | Classified UNKNOWN | Acceptable / incomplete typing |
| Security Docs / intercreditor | Missing | Not invented | Good honesty |

---

## Formula / threshold extraction

| Item | Reference threshold | Headroom extraction | Verdict |
|---|---|---|---|
| Permitted Debt (l) formula | MFA − Facility Amount | Not extracted | MISS |
| MFA floor | $2,750,000,000 | Anchor found; value not bound into rule | PARTIAL |
| MFA EBITDA prong | 3.50× | Not extracted as formula IR | MISS |
| (n)/(o)/(k)/(p) caps | $100M / $50M / 5% TA / $600M+$50M | Not extracted | MISS |
| §11 ratios | 6.25x / 2.00x / 4.00x | Section tagged; thresholds not compiled | MISS |

---

## Safety comparison

Headroom’s refusals on capacity/simulation align with the reference’s NOT DETERMINED / REVIEW_REQUIRED posture.  
**No false favorable conclusions** were emitted by the product path under test.
