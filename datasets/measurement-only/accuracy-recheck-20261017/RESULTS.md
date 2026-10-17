# Results: accuracy re-check at a113351a

## Headline: did FALSE-CONFIDENT go down?
Yes.
- Original 15 (informed): FALSE-CONFIDENT went from 11/70 (15.7%) to 6/70 (8.6%).
- Fresh sample #3 (independent, never seen): 5/66 (7.6%).
- The #422 headline was release-1 + #398 on the original 15, so sample #3 has no same-sample "before". Its 7.6% is the independent estimate at a113351a.

## Part 1: original 15, INFORMED (contaminated; before/after per category only)

| class | before (#422) | after (a113351a, informed) |
|---|---:|---:|
| CORRECT | 15 | 21 |
| FAIL-CLOSED-OK | 12 | 13 |
| FAIL-CLOSED-OVERCAUTIOUS | 20 | 20 |
| WRONG | 12 | 10 |
| FALSE-CONFIDENT | 11 | 6 |
| N/A | 5 | 5 |

70 scored checks in both columns.

## Part 2: fresh sample #3 (MEASUREMENT-ONLY)

Agreements: TEL, H, DXPE, PAYC, AAMI, HUBS, ASIX, WLK, DELL, BVS, EXPE, BYRN, ZETA, CDW, BR. Reserve (unscored): CRAI.

## Headline (66 scored checks, 9 N/A, 15 agreements)

| class | n | % |
|---|---:|---:|
| CORRECT | 19 | 29% |
| FAIL-CLOSED-OK | 16 | 24% |
| FAIL-CLOSED-OVERCAUTIOUS | 12 | 18% |
| WRONG | 14 | 21% |
| FALSE-CONFIDENT | 5 | 8% |

## By check

| check | CORRECT | FAIL-CLOSED-OK | FAIL-CLOSED-OVERCAUTIOUS | WRONG | FALSE-CONFIDENT | N/A |
|---|---:|---:|---:|---:|---:|---:|
| FIN_COVENANT | 2 | 0 | 5 | 7 | 1 | 0 |
| EBITDA_ADDBACKS | 8 | 0 | 0 | 3 | 4 | 0 |
| RATIO_BASKET | 1 | 1 | 3 | 2 | 0 | 8 |
| GENERAL_BASKET | 8 | 0 | 4 | 2 | 0 | 1 |
| FAIL_CLOSED | 0 | 15 | 0 | 0 | 0 | 0 |

## Census by root-cause mechanism (non-correct checks)

| mechanism | FALSE-CONFIDENT | WRONG | OVERCAUTIOUS | total | agreements |
|---|---:|---:|---:|---:|---|
| M12_PROVISO_SUBLIST_AS_ADDBACKS | 2 | 2 | 0 | 4 | ASIX, BVS, CDW, DELL |
| M1_CAP_SCOPE_ATTRIBUTION | 2 | 1 | 0 | 3 | HUBS, PAYC, ZETA |
| M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | 1 | 7 | 6 | 14 | AAMI, ASIX, BR, BVS, BYRN, CDW, DELL, DXPE, EXPE, H, HUBS, TEL, ZETA |
| M10_ENUMERATION_COVERAGE | 0 | 0 | 4 | 4 | BR, BYRN, PAYC |
| M9_SECTION_RECOGNITION | 0 | 1 | 1 | 2 | H, TEL |
| M5_COMPOSITE_CAP_LIMBS | 0 | 1 | 1 | 2 | DXPE, EXPE |
| M11_CLAUSE_TYPING | 0 | 1 | 0 | 1 | HUBS |
| M6_EBITDA_MEASURE_LAYER | 0 | 1 | 0 | 1 | BYRN |

## Per-check table

| doc | check | class | mechanism | engine output | governing clause | note |
|---|---|---|---|---|---|---|
| AAMI | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer: 7.10/(a)/(b) FINANCIAL_MAINTENANCE, no thresholds; FINANCIAL_RATIOS (a)/(b) RATIO_BASED NEEDS_INPUT, no threshold; computedRatios thresholds empty | §7.10(a) Consolidated Net Leverage Ratio 'to be greater than 2.50:1.00'; (b) ICR 'to be less than 4.00:1.00' | Colon ratio form 'X.XX:1.00' still not read (level format). |
| AAMI | EBITDA_ADDBACKS | **CORRECT** |  | 9 add-back lines (i)-(ix); (viii) and (ix) each carry their own 10%-of-EBITDA cap (amount held: needs determinable EBITDA); others uncapped | (viii) restructuring/business optimization 'not to exceed 10% of Consolidated EBITDA ... this clause (viii)'; (ix) non-recurring 'not to exceed 10% ... this clause (ix)' | Two separate per-clause caps, correctly not merged. |
| AAMI | RATIO_BASKET | **N/A** |  | none reported | no ratio-conditioned debt or RP basket |  |
| AAMI | GENERAL_BASKET | **CORRECT** |  | §7.02(i) GROWER_GREATER_OF COMPUTED floor 30,000,000 (limitBound AT_LEAST) | §7.02(i) 'other Indebtedness of Covered Subsidiaries ... not to exceed the greater of (i) $30,000,000 and (ii) 15% of TTM Consolidated EBITDA' | (k) uncapped unsecured Borrower debt held CONDITIONS_LIMITED/NEEDS_INPUT (conservative, not scored). |
| AAMI | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (viii)/(ix) 10% caps: amount null, 'needs a determinable EBITDA' | percentage-of-EBITDA caps |  |
| TEL | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §5.09 category OTHER (not FINANCIAL_MAINTENANCE) 'Ratio threshold: 3.75 to 1.00'; FINANCIAL_RATIOS §5.09 RATIO_BASED NEEDS_INPUT 'contract ratio definition'; ratio layer TOTAL_GROSS_LEVERAGE no threshold | §5.09 Financial Covenant: Consolidated Total Debt to Consolidated EBITDA 'to exceed 3.75 to 1.00' (steps up .50 to 4.25 for four quarters after a Qualified Acquisition) | Level right in the customer layer but the maintenance covenant is filed as OTHER and the inline (un-named) ratio is not bound. |
| TEL | EBITDA_ADDBACKS | **CORRECT** |  | 8 add-backs (a)-(h), no caps; supported figure from filings, 6 lines NEEDS_INPUT | Consolidated EBITDA (a)-(h) add, (i)-(iv) deduct; no caps |  |
| TEL | RATIO_BASKET | **N/A** |  | none | investment-grade: no ratio basket |  |
| TEL | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M9_SECTION_RECOGNITION | DEBT family: only 'definition: Permitted Acquired Debt' CONDITIONS_LIMITED; §5.13 not a debt basket (customer shows §5.13 as OTHER with 'Amount/threshold: $750,000,000') | §5.13 Subsidiary Debt: Debt of Consolidated Subsidiaries not to exceed $750,000,000 (carve-outs (i)-(vi)) | Plain cap reaches the customer card as an untyped amount but not the debt-capacity layer. |
| TEL | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | EBITDA NEEDS_INPUT: (d),(e),(f),(g),(h) not evidenced in filings; supported figure only | (h) 'any other nonrecurring or non-cash charges' |  |
| H | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §5.9 'Leverage Ratio' filed DEBT_INCURRENCE, no threshold; FINANCIAL_RATIOS family empty; LEVERAGE ratio no threshold | §5.9 'maintain a Leverage Ratio ... of not more than 4.50 to 1.0' (5.50 to 1.0 for four Measurement Dates after a Qualified Acquisition) | 'maintain ... not more than X to 1.0' (affirmative phrasing + single-zero) not read as a maintenance level. |
| H | EBITDA_ADDBACKS | **CORRECT** |  | 6 add-backs (i)-(vi), uncapped; base held NEEDS_INPUT (CNI exclusion not in filings) | Consolidated EBITDA (b)(i)-(vi), no caps |  |
| H | RATIO_BASKET | **N/A** |  | (pricing-grid fragment '(B)' shown as RATIO_BASED under DEBT) | no ratio basket (investment-grade revolver; no debt covenant) |  |
| H | GENERAL_BASKET | **WRONG** | M9_SECTION_RECOGNITION | DEBT checklist ABSENT_VERIFIED (right) but DEBT family CAP_COMPUTED with 70 rows under '§3.1 Indebtedness Schedule 3' (a table-of-contents schedule line), incl. '(aa)' FIXED_DOLLAR COMPUTED $1,000,000,000 and '(m)(e)' $15,000,000 | No debt covenant (negative covenants are 6.1 Liens .. 6.6 RP). 'Permitted Liens' (aa) 'other Liens ... securing Indebtedness ... not to exceed $1,000,000,000' | Lien baskets from the Permitted Liens definition are attributed to a phantom 'Indebtedness' section; LIENS family left MISSING. Figures are lien caps, not debt caps. |
| H | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | EBITDA NEEDS_INPUT: CNI exclusion of extraordinary items not in filings | CNI '(x) shall exclude extraordinary ... gains and losses' |  |
| DXPE | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | FIXED_CHARGE_COVERAGE NEEDS_INPUT, no threshold; FINANCIAL_RATIOS family empty; no customer FINANCIAL_MAINTENANCE item | §10.3.1 'Have a Fixed Charge Coverage Ratio ... of at least 1.00 to 1.00 while a Covenant Trigger Period is in effect' | Affirmative 'Have a ... Ratio of at least X' springing form not recognised. |
| DXPE | EBITDA_ADDBACKS | **CORRECT** |  | colon-style 'EBITDA': definition found; 7 add-backs; (vii) capped 'lesser of (A) 10% of EBITDA and (B) $5,000,000' (amount held pending EBITDA) | “EBITDA”: (b)(i)-(vii); (vii) integration/severance 'not to exceed the lesser of (A) 10% of EBITDA ... and (B) $5,000,000', FCCR only | Colon definition now recognised (fix #428). Borderline: a $5M upper bound is determinable but the cap is not shown as uncapped. |
| DXPE | RATIO_BASKET | **WRONG** | M5_COMPOSITE_CAP_LIMBS | §10.2.1(g) FIXED_DOLLAR COMPUTED 860,000,000; ratio limbs not surfaced; SECURED/TOTAL leverage NEEDS_INPUT | (g) Term Loans '$860,000,000 ... plus (2) additional Incremental Term Loans ... not exceed the Incremental Debt Cap' = $100,000,000 + ratio debt at Secured Leverage <= 3.75x / Total Leverage <= 4.00x (as defined in the Term Loan Credit Agreement) | Composite 'plus' cap reported as the first limb only (conservative direction). |
| DXPE | GENERAL_BASKET | **CORRECT** |  | §10.2.1(q) FIXED_DOLLAR COMPUTED 35,000,000 | (q) 'Debt ... not otherwise permitted ... not to exceed $35,000,000' |  |
| DXPE | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | TOTAL/SECURED leverage NEEDS_INPUT 'no means-the-ratio definition in the bound texts' | ratios 'as defined by the Term Loan Credit Agreement' (another document) |  |
| PAYC | FIN_COVENANT | **CORRECT** |  | customer §6.11(a) FINANCIAL_MAINTENANCE 'Ratio threshold: 3.50 to 1.00'; §6.11(b) 'Ratio threshold: 3.00 to 1.00' | §6.11(a) Consolidated Leverage Ratio 'to exceed 3.50 to 1.00'; (b) ICR 'to be less than 3.00 to 1.00' | Ratio layer still has no thresholds (customer layer right). |
| PAYC | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | 10 add-backs; (vi), (vii), (viii) run-rate synergies, (x) all cap=null, tracker potential basis UNCAPPED_NEEDS_INPUT; no capGroup | 'Notwithstanding the foregoing, (i) in no event shall the aggregate amount of the addbacks in clauses (b)(vi) , (b)(vii) , (b)(viii ) and (b)(x) , above for any such period exceed 10% of Consolidated EBITDA' | Trailing shared cap in 'in no event shall ... exceed' form (with spaced labels '(b)(viii )') never attached; run-rate synergies shown uncapped. (vii) restructuring labelled STOCK_COMP. |
| PAYC | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M10_ENUMERATION_COVERAGE | §6.02(m) ratio debt absent from DEBT family (only (c), (k), (l)); RP §6.06(c) RATIO_BASED NEEDS_INPUT without threshold | §6.02(m)(I) debt 'provided that ... the Consolidated Leverage Ratio ... shall not exceed (A) 3.00 to 1.00 if ... secured and (B) 3.50 to 1.00 if ... unsecured' | Last list item with a mixed '(m) (I)' enumerator dropped. |
| PAYC | GENERAL_BASKET | **CORRECT** |  | §6.2(l) FIXED_DOLLAR COMPUTED 20,000,000 | (l) 'other Indebtedness ... not to exceed $20,000,000' |  |
| PAYC | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | §6.11(c) Additional Financial Covenants: FINANCIAL_MAINTENANCE item, no threshold | §6.11(c) MFN: more restrictive covenants in Ratio Debt deemed incorporated |  |
| HUBS | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §8.11/(a) FINANCIAL_MAINTENANCE with no threshold, plus §1.03(a)-(e) accounting-terms items tagged FINANCIAL_MAINTENANCE; ratio layer no thresholds | §8.11(a) during any Non-Investment Grade Period, Consolidated Leverage Ratio 'to be greater than 3.75:1.0' (+0.50:1.0 Leverage Increase Period) | Colon form 'X.XX:1.0' not read; definitional §1.03 items mis-tagged as maintenance covenants. |
| HUBS | EBITDA_ADDBACKS | **CORRECT** |  | 11 add-backs; (vi) and (vii) share one 20%-of-EBITDA cap ('shared with (vii)'/'shared with (vi)') | (vi) run-rate synergies 'combined with ... clause (vii) below, shall not exceed 20% of Consolidated EBITDA'; (vii) mirror proviso | Category labels cosmetic: (vii) non-recurring labelled RUN_RATE_SYNERGIES, (v) non-cash labelled TAXES. |
| HUBS | RATIO_BASKET | **WRONG** | M1_CAP_SCOPE_ATTRIBUTION | §8.03(g) GROWER_GREATER_OF NEEDS_INPUT 'Consolidated Total Assets' | §8.03(g)(i) Non-IG Period debt of Borrower/Domestic Subs if pro forma in compliance with §8.11 (3.75:1.0); the greater-of $300M/7.5% CTA belongs to (p), which merely references 8.03(g) | Cross-reference in a later clause pulls its cap type onto the referenced ratio basket (held, not computed). |
| HUBS | GENERAL_BASKET | **WRONG** | M11_CLAUSE_TYPING | §8.03(q) RECLASS NEEDS_INPUT 'source basket unused'; (p) GROWER_GREATER_OF NEEDS_INPUT (no $300M floor); a Liens (gg) $235M/30% clause shown as '§8.03 Indebtedness (i)' | §8.03(q) IG Period 'other Indebtedness ... not to exceed 15% of Consolidated Net Tangible Assets' followed by the section's reclassification sentence | Trailing reclassification paragraph re-types the general basket; lien clause leaks into the debt list. |
| HUBS | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | leverage covenant and baskets held NEEDS_INPUT; nothing computed across the IG / Non-IG regime switch | covenants and several baskets apply only 'During any Non-Investment Grade Period' |  |
| ASIX | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §7.10(b) FINANCIAL_MAINTENANCE 'Amount/threshold: $50,000,000' (acquisition trigger) as the only figure; §7.10(a) no threshold; §7.10(b) typed BUILDER_AVAILABLE_AMOUNT; ratio layer no thresholds | §7.10(a) ICR 'to be less than 3.00:1.00'; (b) Consolidated Leverage Ratio 'to be greater than 3.75:1.00' (+0.50 to 4.25 for four quarters after an Acquisition > $50,000,000) | Colon form not read; the acquisition-size trigger surfaces instead of the level (same pattern as GOLF in #422). |
| ASIX | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M12_PROVISO_SUBLIST_AS_ADDBACKS | (x) run-rate synergies cap=null; its proviso items (i), (ii), (iii) emitted as three extra add-back lines (the (iii) cap sentence itself is an 'OTHER' add-back) | (x) run-rate synergies; 'provided that ... (iii) the aggregate amount added pursuant to this clause (b)(x) ... shall in no event exceed 20.0% of Consolidated EBITDA' | Cap inside a proviso sub-list ('shall in no event exceed') not bound; proviso enumerators parsed as add-back lines. |
| ASIX | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | §7.02(d) RATIO_BASED NEEDS_INPUT, no threshold | §7.02(d) unsecured debt if pro forma Consolidated Leverage Ratio is '0.25:1.00 less than the maximum then applicable ratio set forth in Section 7.10(b)' (= 3.50:1.00) | Relative level (covenant minus a cushion) plus colon form. |
| ASIX | GENERAL_BASKET | **CORRECT** |  | §7.02(j) GROWER_GREATER_OF floor 50,000,000 (AT_LEAST) | (j) 'not to exceed the greater of (x) $50,000,000 and (y) 40.0% of Consolidated EBITDA' | Greater-of floors now surfaced. |
| ASIX | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | Consolidated Senior Secured Leverage Ratio refused: 'not one numerator over one denominator' | definition with multi-part numerator |  |
| WLK | FIN_COVENANT | **CORRECT** |  | customer §6.09 FINANCIAL_MAINTENANCE 'Ratio threshold: 3.50 to 1.00'; leverageCapacity maxLeverage 3.5 (NEEDS_INPUT) | §6.09 Total Leverage Ratio 'to exceed 3.50 to 1.00' (4.00:1.00 for four quarters after an elected Material Acquisition) | Step-up not shown (event-conditional; base level governs). §6.03 fragment also tagged FINANCIAL_MAINTENANCE (noise). |
| WLK | EBITDA_ADDBACKS | **CORRECT** |  | 11 add-backs; (vi) cap $125,000,000; (x) cap 5.0% of EBITDA (held); (vii) run-rate uncapped | (vi) 'addbacks ... pursuant to this clause (a)(vi) shall not exceed $125,000,000'; (x) LACC EBITDA 'shall not exceed 5.0% of Consolidated EBITDA'; (vii) no cap |  |
| WLK | RATIO_BASKET | **N/A** |  | none | no ratio basket |  |
| WLK | GENERAL_BASKET | **CORRECT** |  | §6.01(j) PCT_OF_METRIC NEEDS_INPUT 'Consolidated Net Tangible Assets' | §6.01(j) Restricted Subsidiary debt (plus 6.02(f) secured) 'does not exceed ... 25.0% of Consolidated Net Tangible Assets' |  |
| WLK | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | leverageCapacity maxLeverage 3.5, NEEDS_INPUT 'EBITDA operand not derivable' | Consolidated EBITDA requires non-filed adjustments (pro forma, LACC EBITDA) |  |
| DELL | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | INTEREST_COVERAGE threshold 3 cited to §2.17(a) (Commitment Increase condition '3.00:1.00'); §7.03 covenant absent from customer items and FINANCIAL_RATIOS family | §7.03 'Permit the Consolidated Interest Coverage Ratio ... to be less than 3.00 to 1.00' | Level matches only because the incremental condition uses the same number; the maintenance covenant itself is not recognised. |
| DELL | EBITDA_ADDBACKS | **WRONG** | M12_PROVISO_SUBLIST_AS_ADDBACKS | 16 lines: run-rate (b) plus its proviso conditions (A), (B), (C) each emitted as RUN_RATE_SYNERGIES add-back lines; (viii) fees labelled D&A, (x) stock comp labelled TAXES | (b) run-rate savings 'provided that (A) ... quantifiable ..., (B) no ... duplicative ..., and (C) the share ... with respect to a joint venture ... shall not exceed ...'; no dollar or % cap | Proviso enumerators parsed as add-back lines (no cap invented; held NEEDS_INPUT). |
| DELL | RATIO_BASKET | **N/A** |  | none | no debt covenant; only a commitment-increase ICR condition |  |
| DELL | GENERAL_BASKET | **N/A** |  | DEBT ABSENT_VERIFIED | negative covenants are 7.01 Liens, 7.02 Fundamental Changes, 7.03 ICR only | Absence correct. |
| DELL | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | EBITDA NEEDS_INPUT: CNI exclusions not in filings | 'there shall be excluded from Consolidated Net Income ...' |  |
| BVS | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §9.13 FINANCIAL_MAINTENANCE (and §1.10(d)) with no threshold; FINANCIAL_RATIOS rows RATIO_BASED NEEDS_INPUT; ratio layer thresholds only from RP/Investments incurrence tests | §9.13(a) TNLR maximum by table: 4.00 to 1.00 through Q4 2025, 3.50 to 1.00 from Q1 2026 (governing on 2026-10-17); +0.50 Leverage Ratio Increase after > $25M acquisition; (b) ICR | Period/level table (step-down schedule) not parsed. |
| BVS | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M12_PROVISO_SUBLIST_AS_ADDBACKS | (vii) unusual/non-recurring + run-rate cap=null; proviso items (i), (ii), (iii) emitted as extra add-back lines | (vii) '(A) other unusual and non-recurring cash expenses ... and (B) ... "run rate" synergies ...; provided that ... (iii) the aggregate amount added pursuant to this clause (b)(vii) ... shall in no event exceed 25% of Consolidated EBITDA' | Same pattern as ASIX: cap in a proviso sub-list, 'shall in no event exceed'. |
| BVS | RATIO_BASKET | **CORRECT** |  | TOTAL_NET_LEVERAGE threshold 2.0 MAX cited §9.6 Restricted Payments (h) | §9.6(h) RP if pro forma TNLR 'is less than or equal to 2.00 to 1:00' |  |
| BVS | GENERAL_BASKET | **CORRECT** |  | §9.1(o) GROWER_GREATER_OF floor 20,000,000 (AT_LEAST) | §9.1(o) 'not to exceed the greater of (i) $20,000,000 and (ii) ... 20% of Consolidated EBITDA' |  |
| BVS | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | EBITDA base NEEDS_INPUT (equity-method exclusion not in filings); (s)(x) Non-Guarantor aggregate greater-of held NEEDS_INPUT | CNI excludes equity-method income; §9.1 proviso (x) $26M / 26% cap across clauses |  |
| EXPE | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §6.06 'Leverage Ratio' filed DEBT_INCURRENCE with 'Ratio threshold: 4.00 / 4.50 / 4.00 to 1.00'; FINANCIAL_RATIOS family empty; leverageCapacity maxLeverage 4 cited to '§6.04 Fundamental Changes (c)(b)' | §6.06 Leverage Ratio 'will not permit ... the Leverage Ratio to exceed 4.00 to 1.00' (4.50 for four Test Periods after an elected Qualified Material Acquisition) | Levels right, but the maintenance covenant is classified as debt incurrence and its citation is mis-sectioned. |
| EXPE | EBITDA_ADDBACKS | **CORRECT** |  | 10 add-backs; (vi) restructuring/non-recurring capped at 15% of EBITDA (held pending EBITDA) | (vi) 'together with the aggregate amount of all other Capped Adjustments ... shall not exceed 15% of Consolidated EBITDA'; Capped Adjustments = (a)(vi) + §1.04(b)(ii) pro forma synergies | The cap's other member sits in §1.04(b)(ii) (pro forma synergies, not an add-back line), so it is not shown as shared. |
| EXPE | RATIO_BASKET | **N/A** |  | none | no ratio basket |  |
| EXPE | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M5_COMPOSITE_CAP_LIMBS | §6.01(m) GROWER_GREATER_OF NEEDS_INPUT 'greater-of fixed limb' (no floor) | §6.01(m) other Indebtedness (with 6.02(g) secured and 6.03(h) Attributable Debt) 'shall not exceed the greater of (i) US$1,400,000,000 and (ii) 10.0% of Consolidated Adjusted Total Assets' | Fixed limb written 'US$1,400,000,000' not read, so the floor is withheld (other greater-of floors are computed). |
| EXPE | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | leverageCapacity NEEDS_INPUT 'EBITDA operand not derivable' | CNI exclusions not in filings |  |
| BYRN | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §9.1 'Leverage Ratio' filed DEBT_INCURRENCE ('Ratio threshold: 1.50 / 1.75 to 1.00', 'Amount/threshold: $5,000,000'); §9.2 FCCR FINANCIAL_MAINTENANCE 1.25 (right); ratio layer no maintenance thresholds | Art. 9 FINANCIAL COVENANTS: §9.1 Leverage Ratio (inline-defined) 'to be greater than 1.50 to 1.00' (1.75 in an elected Acquisition Holiday Period); §9.2 FCCR 'less than 1.25 to 1.00' | Levels right; leverage covenant classified as debt incurrence (inline-defined ratio). |
| BYRN | EBITDA_ADDBACKS | **WRONG** | M6_EBITDA_MEASURE_LAYER | CNI exclusions (x)/(y) and deduction (c)(iii) 'non-recurring, non-cash items increasing net income' emitted as add-back lines (tracker basis UNCAPPED_NEEDS_INPUT); (vi) $375,000 shown as per-period CAP_HEADROOM; (viii) 10% cap bound, CONDITIONAL | EBITDA = net income (excluding (x),(y)) + (b)(i)-(viii) - (c)(i)-(iii); (vi) closing-date transaction costs 'incurred on or prior to the Closing Date not to exceed $375,000 in the aggregate'; (viii) lender-approved, 10% cap | Exclusions/deductions offered as add-back potential (wrong sign); one-time closing cap treated as recurring headroom. |
| BYRN | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M10_ENUMERATION_COVERAGE | DEBT family: §8.1 found, 0 baskets; LEVERAGE thresholds only from RP §8.4(c) (1.00) | §8.1(d) Subordinated Debt if pro forma Leverage Ratio 'is not greater than 2.00 to 1.00' | Run-in list inside one sentence '(a) ..., (b) ..., (c) ... $5,000,000, (d) ...; (e) ...' yields no baskets. |
| BYRN | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M10_ENUMERATION_COVERAGE | no basket (DEBT NEEDS_INPUT, n=0) | §8.1(e) 'other Debt not to exceed $500,000 in the aggregate' | Same run-in list. |
| BYRN | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (viii) lender-approved add-backs CONDITIONAL, CAP_UNKNOWN, not counted | (viii) 'approved by Lender in its reasonable discretion' |  |
| ZETA | FIN_COVENANT | **FALSE-CONFIDENT** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §7.11(a) FINANCIAL_MAINTENANCE 'Ratio threshold: 0.50 to 1.00'; §7.11(b) 1.25 (right); ratio layer no thresholds | §7.11(a) Consolidated Net Leverage Ratio 'to be greater than 3.25:1.00' (+0.50 to 1.00 for an elected Elevated Covenant Period); (b) FCCR 'less than 1.25 to 1.00' | Colon base level unread; the '0.50 to 1.00' step-up increment is presented as the leverage covenant level. |
| ZETA | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | (b)(i) restructuring cap=null, tracker basis UNCAPPED_NEEDS_INPUT; (b)(ii) run-rate 'cap scope unresolved ((b) not bound to exactly one clause): capped by an undetermined amount' | clause (b) = (i) restructuring + (ii) run-rate; 'the aggregate amount permitted to be added back pursuant to this clause (b) ... when combined with ... Section 1.03(c) shall not exceed 20.0% of pro forma Consolidated EBITDA' | Cap on a parent clause (b) is half-bound: the run-rate child is held capped-unknown (fix #432 behaviour) but the restructuring sibling stays uncapped. |
| ZETA | RATIO_BASKET | **FAIL-CLOSED-OK** |  | §7.02(r) UNLIMITED, formulaKind UNLIMITED_SUBJECT_TO_GATE, dollar room NEEDS_INPUT ('Unlimited is not a certified capacity grant') | §7.02(r) 'other unsecured Indebtedness in an unlimited amount, provided that after giving pro forma effect ... in compliance with ... Section 7.11(a)' | Gate kept; no adjacent figure taken. Gate level (3.25x via 7.11(a)) not surfaced. |
| ZETA | GENERAL_BASKET | **CORRECT** |  | §7.02(l) FIXED_DOLLAR COMPUTED 18,000,000 | (l) 'other Indebtedness ... not to exceed $18,000,000' |  |
| ZETA | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (b)(ii) run-rate CAP_UNKNOWN (scope unresolved -> capped by an undetermined amount), never uncapped | shared cap with Section 1.03(c) pro forma amounts |  |
| CDW | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §6.06 'Leverage Ratio' filed DEBT_INCURRENCE with 'Ratio threshold: 4.00 to 1.00'; FINANCIAL_RATIOS family has no §6.06 row; LEVERAGE threshold 4 cited to '§6.04 Fundamental Changes (b)(2)' | §6.06 'will not permit the Leverage Ratio ... to exceed, 4.00 to 1.00' (4.50 for four quarters after a Qualified Acquisition Election) | Level right; covenant classified as debt incurrence and threshold cited to the wrong section (proviso text). |
| CDW | EBITDA_ADDBACKS | **WRONG** | M12_PROVISO_SUBLIST_AS_ADDBACKS | (viii) QoE adjustments and (ix) run-rate synergies share a greater-of cap, amount 260,000,000 (fixed limb, 'cap may be higher') - right; but insurance proviso conditions '(A) not denied by the applicable carrier ...' and '(B) in fact reimbursed ...' emitted as add-back lines; a CNI hedging item emitted as '(i) OTHER' add-back | (viii)+(ix) 'shall not exceed ... the greater of (x) $260,000,000 and (y) 15% of Consolidated EBITDA'; (xi) insurance-reimbursable expenses 'so long as ... (A) not denied ... and (B) in fact reimbursed ...' | Shared greater-of cap bound correctly (fix #432); proviso conditions become phantom add-back lines (same as DELL). |
| CDW | RATIO_BASKET | **N/A** |  | none | no ratio basket (non-guarantor debt limitation only) |  |
| CDW | GENERAL_BASKET | **CORRECT** |  | §6.01(b)(xxi) GROWER_GREATER_OF floor 1,500,000,000 (AT_LEAST) | (xxi) other Non-Guarantor Indebtedness (with 6.02(k) liens and sale/leasebacks) 'does not exceed the greater of $1,500,000,000 and 10% of Total Assets' |  |
| CDW | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (viii)/(ix) cap held at the $260M fixed limb with 'cap may be higher'; EBITDA base NEEDS_INPUT | greater-of cap whose % limb needs EBITDA |  |
| BR | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §6.07 'Leverage Ratio' filed DEBT_INCURRENCE with 'Ratio threshold: 3.50 / 4.00 / 3.50'; FINANCIAL_RATIOS family empty; leverageCapacity maxLeverage 3.5 (NEEDS_INPUT) | §6.07 'will not permit the Leverage Ratio ... to exceed 3.50 to 1.00' (4.00 after an elected Material Specified Acquisition) | Levels right; maintenance covenant classified as debt incurrence. |
| BR | EBITDA_ADDBACKS | **CORRECT** |  | 6 add-backs, uncapped | Consolidated EBITDA (i)-(vi), no caps |  |
| BR | RATIO_BASKET | **N/A** |  | none | no ratio basket |  |
| BR | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M10_ENUMERATION_COVERAGE | DEBT family §6.2 found but 0 baskets | §6.02(n) other Subsidiary Indebtedness/preferred (with 6.01(n) liens and 6.03(b) Attributable Debt) 'shall not at any time exceed the greater of (y) US$200,000,000 and (z) 18% of Consolidated EBITDA' | Whole §6.02 list (a)-(n) yields no rows; fixed limb also written 'US$'. |
| BR | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | leverageCapacity NEEDS_INPUT 'EBITDA operand not derivable' | CNI exclusions not in filings |  |


## Top remaining failure mechanisms (sample #3, with examples)

1. **M2 financial-covenant level and classification (14 of the 31 WRONG/FALSE-CONFIDENT/OVERCAUTIOUS checks; 1 FALSE-CONFIDENT).** These are level formats the reader does not parse:
   - colon `2.50:1.00` (AAMI, HUBS, ASIX);
   - single-zero `4.50 to 1.0` (H);
   - affirmative `maintain … not more than` / `Have a … of at least` (H, DXPE);
   - period/level tables (BVS);
   - relative levels `0.25:1.00 less than the maximum … in 7.10(b)` (ASIX);
   - a step-up increment shown as the level: ZETA shows `0.50 to 1.00` while the base is 3.25:1.00 (FALSE-CONFIDENT).

   Maintenance covenants are also filed as DEBT_INCURRENCE/OTHER (TEL, EXPE, CDW, BR, BYRN) or cited to incurrence provisos (DELL).
2. **M12 proviso sub-list parsed as add-backs, so the cap stated in the proviso is lost (2 FALSE-CONFIDENT, 2 WRONG).**
   - ASIX: the 20% cap in a proviso is unbound.
   - BVS: the 25% cap in proviso (iii) is unbound.
   - DELL and CDW: proviso (A)/(B)/(C) conditions are listed as add-back lines.
   - Informed sample: RGP, where proviso item `(x) are reasonably anticipated…` becomes an uncapped run-rate line.
3. **M1 cap scope (2 FALSE-CONFIDENT, 1 WRONG).**
   - PAYC: a trailing `in no event shall the aggregate … (b)(vi), (b)(vii), (b)(viii ), (b)(x) … exceed 10%` is not attached, so run-rate synergies show as uncapped.
   - ZETA: the parent-clause cap binds (b)(ii) but leaves (b)(i) uncapped.
   - HUBS: (g) is given (p)'s greater-of.
   - Informed sample: EB (A)–(E) and ACCV (y) are still uncapped.
4. **M10 enumeration coverage / M9 section recognition (overcautious, plus one WRONG).**
   - Run-in lists yield 0 baskets (BYRN, BR).
   - (m)(I) ratio debt is dropped (PAYC).
   - H: lien baskets are filed under a phantom `§3.1 Indebtedness Schedule 3` (WRONG).
5. **M5 composite caps.**
   - DXPE: the (g) `$860M plus Incremental Debt Cap` keeps only the first limb.
   - EXPE: the `US$1,400,000,000` floor is withheld.

The fail-closed check is FAIL-CLOSED-OK on 15/15.

## Informed sample: census at a113351a (for reference, contaminated)

## Census by root-cause mechanism (non-correct checks)

| mechanism | FALSE-CONFIDENT | WRONG | OVERCAUTIOUS | total | agreements |
|---|---:|---:|---:|---:|---|
| M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | 2 | 4 | 9 | 15 | ACCV, AVO, CDNL, CHH, CVNA, EB, GOLF, IIIV, LMB, RGP, UTI, VRRM |
| M1_CAP_SCOPE_ATTRIBUTION | 2 | 1 | 0 | 3 | ACCV, EB, LMB |
| M4_ABSENCE_VERIFICATION | 1 | 0 | 1 | 2 | LINC |
| M12_PROVISO_SUBLIST_AS_ADDBACKS | 1 | 0 | 0 | 1 | RGP |
| M6_EBITDA_MEASURE_LAYER | 0 | 4 | 0 | 4 | AVO, CVNA, RYI, UTI |
| M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | 0 | 0 | 4 | 4 | ACCV, CDNL, EB, LMB |
| M7_EVENT_OR_TIME_CONDITIONAL_CAP | 0 | 1 | 1 | 2 | AVO, RGP |
| M13_DEFINITION_LEADIN | 0 | 0 | 2 | 2 | CDNL |
| M8_AMENDMENT_MISCLASSIFICATION | 0 | 0 | 2 | 2 | RXO |
| M10_ENUMERATION_COVERAGE | 0 | 0 | 1 | 1 | VRRM |

## Process notes
- The amendment-check implementation had two bugs, fixed before any engine run and re-walked in the same order:
  - v1 matched "Incremental" in the TOC;
  - v2 matched "Consent to Service" / "Waiver of Jury Trial".
- A HUBS transient 503 produced a 0-byte file. It was re-downloaded (1.85 MB) and re-evaluated in place. This displaced CRAI to reserve.
- No engine change was made in this run. Scores were assigned by hand from clause text read with an independent stdlib HTML stripper, not the engine's extractor.
