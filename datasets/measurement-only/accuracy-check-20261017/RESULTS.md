# Headroom accuracy check — independent verification (Grok), 2026-10-17

**Scope.** Release line `cursor/clf-release-1` @ `f0b1b0f4` (pipeline + customer upload path), and PR #398 `cursor/clf-ebitda-optimizer` @ `796af948` (EBITDA optimizer / XBRL capacity). Measured read-only from fresh worktrees under `/workspace/acc-rl` and `/workspace/acc-398`. No Muse worktree was used. No engine code was changed, no paid AI was used, and nothing was deployed.

**Sample (MEASUREMENT-ONLY, do not tune).** 15 fresh EDGAR credit agreements (EX-10.1 from 8-Ks filed 2025-07 to 2026-10): ACCV, AVO, CHH, CVNA, EB, IIIV, LMB, RGP, RXO, UTI, VRRM, LINC, GOLF, RYI, CDNL. Five more (ALOT, CTRI, PHR, RVLV, TH) are held as an unscored reserve and were used only to count text-extraction artefacts. The manifest, with accessions and SEC URLs, is at `datasets/measurement-only/accuracy-check-20261017/manifest.json`.

**Exclusion proof.**
- Every candidate CIK and accession was checked against a set of 12,451 CIKs and about 1.34M accessions. That set was harvested from:
  - the repo (release-1, #398, main);
  - the local EDGAR-expand corpora (hr356/hr358/hr-dg/hr-rd/hr-ebitda);
  - the xbrl-cache, base-docs, sb, fresh and cfo-testing directories;
  - the 507-issuer edgar-expand run log.
- No sample CIK appears in the scoreboard snapshot (which carries the HELDOUT/BLIND/dev ids), and no issuer name appears in either branch.
- No HELDOUT/BLIND body, sealed baseline, FROZEN ground truth or certification artefact was opened.

**Method.**
- Downloads used an EDGAR User-Agent carrying the owner's Gmail.
- Each agreement went through two runs:
  - `scripts/accuracy-check/run-sample.ts` on release-1: `extractTextAsync`, then `runAgreementPipeline`, then the customer upload summary (`processAcquiredDocument` + `buildDocumentCovenantSummary`, offline with a temporary CorpusStore).
  - `run-ebitda.ts` on #398: the pipeline with SEC companyfacts `extractFinancials` as of 2026-10-17.
- I then hand-read the clause text and scored five checks per agreement:
  1. Financial covenant type and level.
  2. EBITDA add-back categories and caps.
  3. One ratio basket.
  4. The general debt basket.
  5. One fail-closed scenario.

**Scoring classes.**
- CORRECT.
- FAIL-CLOSED-OK: the engine held a figure that genuinely cannot be determined from the text.
- FAIL-CLOSED-OVERCAUTIOUS: the figure is stated plainly but the engine withheld it.
- WRONG: a wrong figure or classification, but not presented as a determined contractual figure, or wrong in the conservative direction.
- FALSE-CONFIDENT (critical): a wrong figure or status presented as determined. Examples: a wrong cap, "uncapped" when the line is capped, ABSENT_VERIFIED when the provision is present, or a threshold list that omits the governing level.
- The financial-covenant check is scored on what a CFO would see from the two layers together: release-1's customer summary plus #398's ratio/capacity layer.
## Headline (70 scored checks, 5 N/A, 15 agreements)

| class | n | % |
|---|---:|---:|
| CORRECT | 15 | 21% |
| FAIL-CLOSED-OK | 12 | 17% |
| FAIL-CLOSED-OVERCAUTIOUS | 20 | 29% |
| WRONG | 12 | 17% |
| FALSE-CONFIDENT | 11 | 16% |

## By check

| check | CORRECT | FAIL-CLOSED-OK | FAIL-CLOSED-OVERCAUTIOUS | WRONG | FALSE-CONFIDENT | N/A |
|---|---:|---:|---:|---:|---:|---:|
| FIN_COVENANT | 3 | 0 | 5 | 4 | 3 | 0 |
| EBITDA_ADDBACKS | 2 | 1 | 2 | 5 | 5 | 0 |
| RATIO_BASKET | 6 | 1 | 5 | 0 | 0 | 3 |
| GENERAL_BASKET | 4 | 0 | 6 | 2 | 1 | 2 |
| FAIL_CLOSED | 0 | 10 | 2 | 1 | 2 | 0 |

## Census by root-cause mechanism (non-correct checks)

| mechanism | FALSE-CONFIDENT | WRONG | OVERCAUTIOUS | total | agreements |
|---|---:|---:|---:|---:|---|
| M1_CAP_SCOPE_ATTRIBUTION | 6 | 1 | 0 | 7 | ACCV, CDNL, EB, GOLF, LMB, RGP, RXO |
| M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | 2 | 4 | 9 | 15 | ACCV, AVO, CDNL, CHH, CVNA, EB, GOLF, IIIV, LMB, RGP, UTI, VRRM |
| M4_ABSENCE_VERIFICATION | 2 | 0 | 0 | 2 | LINC |
| M3_TEXT_EXTRACTION_FIDELITY | 1 | 1 | 4 | 6 | CDNL, CVNA, RYI, VRRM |
| M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | 0 | 0 | 5 | 5 | ACCV, CDNL, CVNA, EB, LMB |
| M6_EBITDA_MEASURE_LAYER | 0 | 3 | 0 | 3 | AVO, RYI, UTI |
| M7_EVENT_OR_TIME_CONDITIONAL_CAP | 0 | 3 | 0 | 3 | AVO, IIIV, RGP |
| M8_AMENDMENT_MISCLASSIFICATION | 0 | 0 | 2 | 2 | RXO |

## Per-check table

| doc | check | class | mechanism | engine output | governing clause | note |
|---|---|---|---|---|---|---|
| UTI | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | #398 leverageCapacity maxLeverage=3, ratioCapacity ICR limit=3 (levels right); release-1 customer summary files §6.1 under DEBT_INCURRENCE, omits §6.2, and tags §1.5 Limited Condition Transactions as the only FINANCIAL_MAINTENANCE item | §6.1 'shall not permit the Consolidated Total Net Leverage Ratio to be greater than 3.00 to 1.00'; §6.2 'Consolidated Interest Coverage Ratio to be less than 3.00 to 1.00' |  |
| UTI | EBITDA_ADDBACKS | **WRONG** | M6_EBITDA_MEASURE_LAYER | Tracker built on 'Consolidated EBITDA' (3 lines: interest, taxes, D&A+non-cash labelled STOCK_COMP); NEEDS_INPUT | Covenant ratios use 'Consolidated Adjusted EBITDA' = Consolidated EBITDA plus (a) acquisition/new-program/campus start-up costs and (b) restructuring/integration, 'aggregate amount added back pursuant to clauses (a) and (b) shall not exceed 20% of Consolidated Adjusted EBITDA' | Two capped add-backs and the 20% shared cap never reach the CFO; money left on the table. leverageCapacity also keyed to the wrong layer (latent). |
| UTI | RATIO_BASKET | **N/A** |  | no ratio basket reported | §5.3 (a)-(j): no ratio-based debt basket |  |
| UTI | GENERAL_BASKET | **CORRECT** |  | §5.3(j) FIXED_DOLLAR COMPUTED 20,000,000 | §5.3(j) 'other unsecured Indebtedness in an aggregate principal amount not to exceed $20,000,000' |  |
| UTI | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | EBITDA NEEDS_INPUT: CNI exclusion (b) (pre-acquisition income) not in filings; borrower input CNI:(b) requested | CNI def excludes '(b) the net income (or net loss) of any Person accrued prior to the date it becomes a Subsidiary' |  |
| AVO | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | release-1 customer: §7.11(a)/(b) FINANCIAL_MAINTENANCE with no thresholds; #398: TOTAL_NET_LEVERAGE thresholds only from §7.03(l)/§7.06(c) (3.00 incurrence tests), FCCR none; leverageCapacity refused | §7.11(a) 'Consolidated Total Net Leverage Ratio ... to be greater than 3.50 to 1.0'; §7.11(b) FCCR 'less than 1.25 to 1.0' | 'to 1.0' (single-zero) form not matched by the threshold reader. |
| AVO | EBITDA_ADDBACKS | **WRONG** | M6_EBITDA_MEASURE_LAYER | 10 add-back lines (i)-(x); (x) labelled RUN_RATE_SYNERGIES with cap $23,000,000 | Definition runs to (b)(xiii): (x)(B) restructuring 'when taken together with ... (b)(xi)(B) ... shall not exceed ... 20% of Consolidated EBITDA ... minus ...'; (xi)(A) run-rate synergies; (xii), (xiii) — all absent; (x)(A) $23M cap is 'during the term of this Agreement' (lifetime) | Items after a nested (A)/(B) block and numeric parentheticals ('fifteen (15) months', page numbers) are lost. |
| AVO | RATIO_BASKET | **CORRECT** |  | TOTAL_NET_LEVERAGE threshold 3.00 MAX cited §7.06(c) | §7.06(c) RP permitted if pro forma TNLR 'shall not exceed 3.00 to 1.00' |  |
| AVO | GENERAL_BASKET | **WRONG** | M7_EVENT_OR_TIME_CONDITIONAL_CAP | §7.02(m)(ii) FIXED_DOLLAR COMPUTED 15,000,000 plus separate (m)(x) GROWER NEEDS_INPUT row | §7.02(m) '$15,000,000 ... (or on or after the date of consummation of the Cantaloupe Acquisition, the greater of (x) 15.0% of Consolidated EBITDA ... and (y) $24,000,000)' | Event-conditional step-up split into two independent rows; same pattern shows (c) as both $50M and $60M COMPUTED. |
| AVO | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (viii) 15%-of-EBITDA cap: amount null, needs determinable EBITDA | (viii) 'shall not exceed ... fifteen percent (15%) of Consolidated EBITDA' |  |
| CHH | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer: §6.11 DEBT_INCURRENCE, §6.12 OTHER, no thresholds; #398: LEVERAGE/FCCR NEEDS_INPUT, no thresholds | §6.11 'permit the Consolidated Leverage Ratio to exceed 4.50:1.00' (5.50 after Material Acquisition); §6.12 FCCR 2.50:1.00 suspended while Investment Grade | Colon ratio form '4.50:1.00' not matched. |
| CHH | EBITDA_ADDBACKS | **CORRECT** |  | 9 add-backs (i)-(ix) categorised, uncapped; (b) deductions block the floor -> NEEDS_INPUT | Consolidated EBITDA (a)(i)-(ix), minus (b)(i)-(ii); no caps in text |  |
| CHH | RATIO_BASKET | **N/A** |  | — | no ratio basket |  |
| CHH | GENERAL_BASKET | **CORRECT** |  | §6.01 CONDITIONS_LIMITED, no cap, NEEDS_INPUT (not unlimited) | §6.01 'Incur ... any Indebtedness if a Default or an Event of Default would exist after giving effect' |  |
| CHH | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | FCCR reported NEEDS_INPUT, never computed | §6.12 proviso: 'until such time that the Borrower no longer maintains an Investment Grade Rating, the requirements of this Section 6.12 shall not apply' |  |
| EB | FIN_COVENANT | **FALSE-CONFIDENT** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §11.03(a) 'Ratio threshold: 3.25 / 3.00 / 2.75 to 1.00' (first three steps only, no dates); §11.03(b) 1.10 OK; §11.03(c) $270,000,000 OK | §11.03(a) step-down: 3.25 (to 12/31/25), 3.00, 2.75, 2.50, 2.25 (Oct 1-Dec 31 2026), 'thereafter 2.00 to 1.00' | Today (2026-10-17) the governing level is 2.25x; every level shown is looser. Step-down schedule truncated and not bound to the test date. |
| EB | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | (10)(x)(A) restructuring, (B) business initiatives, (C) start-up, (D) public-co compliance, (E) litigation shown uncapped; $3,000,000 cap attached to (F) only | (10) '(x) (A) restructuring ... (F) casualty events ...; provided that the aggregate amount added back pursuant to this clause (x) for any period of four fiscal quarters shall not exceed $3,000,000' | A CFO confirmation of e.g. $10M restructuring would be counted against a $3M shared cap (confirm bound for uncapped lines is 50% of revenue). |
| EB | RATIO_BASKET | **FAIL-CLOSED-OK** |  | §9.01(h) RATIO_BASED NEEDS_INPUT (ratio operand: Consolidated Net Total Debt) | (h)(y) 'Consolidated Net Total Leverage Ratio on a Pro Forma Basis shall be no greater than the Financial Covenant TNLR Threshold' |  |
| EB | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | (h) treated wholly as RATIO_BASED NEEDS_INPUT; $15,000,000 fixed limb not surfaced | (h)(i) 'would not exceed (x) $15,000,000 plus (y) any other indebtedness ... [ratio-conditioned]' |  |
| EB | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | §11.03(c) LTM Revenue minimum NEEDS_INPUT | 'will not permit the LTM Revenue ... to be less than $270,000,000' |  |
| LMB | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer: §9.12 under DEBT_INCURRENCE with 3.00 / 3.50 / $25,000,000; §9.13 FCCR absent; §7.1(a)/§7.2(a) tagged FINANCIAL_MAINTENANCE; #398 FINANCIAL_RATIOS family empty | §9.12 'Consolidated Net Leverage Ratio ... to exceed 3.00 to 1.00' (3.50 in Adjustment Period after >$25M acquisition); §9.13 FCCR 'less than 1.15 to 1.00' |  |
| LMB | EBITDA_ADDBACKS | **WRONG** | M1_CAP_SCOPE_ATTRIBUTION | (iv) non-cash (incl. stock comp) CAPPED, claimed 500,000 of evidenced 7,700,000 | (iv)(F) '... losses on the early extinguishment of debt; provided that losses on extinguishment of Indebtedness under the Existing Credit Agreement shall not exceed $500,000)' — sub-clause cap, not a cap on (iv) | Under-counts $7.2M of evidenced stock comp. Shared 15% group (vii)/(viii)/(x) correctly detected. |
| LMB | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | no threshold surfaced | §5.13 Permitted Acquisition: 'Consolidated Net Leverage Ratio does not exceed 2.75 to 1.00' |  |
| LMB | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | §9.1(r) split into (r)(A) FIXED_DOLLAR NEEDS_INPUT / (r)(B) PCT NEEDS_INPUT; same engine computes the (c) greater-of floor $50M | §9.1(r) 'other unsecured Indebtedness ... not to exceed ... the greater of (A) $5,000,000 and (B) 6.0% of Consolidated EBITDA' |  |
| LMB | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (xi)/(xii) flagged LENDER_APPROVAL, not counted | (xi) 'such other add-backs approved by the Required Lenders in their sole discretion' |  |
| IIIV | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §7.11(b) 3.00 OK; §7.11(a) TNL level absent; #398 TNL thresholds only from RP (j) | §7.11(a) TNLR 'greater than 4.00 to 1.00' (+0.25 Leverage Increase Period); §7.11(b) ICR 'less than 3.00 to 1.00' |  |
| IIIV | EBITDA_ADDBACKS | **WRONG** | M7_EVENT_OR_TIME_CONDITIONAL_CAP | per-line caps (iv) 20%, (v) $1,000,000, (ix) 10% detected; (v) treated as a per-period cap | (v) 'aggregate amount added back pursuant to this clause (v) during the term of this Agreement shall not exceed $1,000,000' | Lifetime cap needs cumulative-usage input; otherwise re-allowed every period. |
| IIIV | RATIO_BASKET | **CORRECT** |  | TOTAL_NET_LEVERAGE 2.75 MAX cited §7.06(j) | §7.06(j)(ii) 'Consolidated Total Net Leverage Ratio shall be less than or equal to 2.75 to 1.00' |  |
| IIIV | GENERAL_BASKET | **N/A** |  | (l) $20M correctly typed as acquired debt; no general basket invented | §7.03 has no general basket |  |
| IIIV | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | Senior Secured Leverage Ratio refused: 'not one numerator over one denominator' | definition of Consolidated Senior Secured Leverage Ratio |  |
| ACCV | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §10.9(b) 1.25 OK; §10.9(a) level absent (release-1 reads the $100M Material Acquisition as 'single cap-role dollar') | §10.9(a) Total Debt/EBITDA 'greater than 4.00 to 1.00' (4.50 Leverage Increase Period), from Q1 2027 |  |
| ACCV | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | 27.5% cap attached to (b) Interest, (t), (u) and '(x)' of (ff)(x); run-rate (i), one-time integration (x) and new-hire (y) shown uncapped | 'aggregate amount included ... pursuant to clauses (i)(B), (t), (u), (x) and (y) ... shall not exceed 27.5% of Consolidated EBITDA' | Cross-referenced shared-cap labels resolved to the wrong lines when labels repeat ((ff)(x)/(y)). |
| ACCV | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | (labelled (y)) RATIO_BASED NEEDS_INPUT 'ratio not in catalog: Consolidated EBITDA Ratio' | §10.1 ratio debt 'in an unlimited amount so long as ... Consolidated First Lien Secured Debt to Consolidated EBITDA Ratio ... less than or equal to 3.00 to 1.00' |  |
| ACCV | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | §10.1(k) GROWER_GREATER_OF NEEDS_INPUT (while (q) and (gg) floors are computed) | §10.1(k) 'not to exceed ... the greater of (x) $47,600,000 and (y) 35% of Consolidated EBITDA' | #398 also emits the (gg) JV basket twice ('(z)(i)' and '(gg)', both $34,000,000). |
| ACCV | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (o) 'items included in the Financial Model' NEEDS_INPUT | (o) 'charges, expenses and other items included in the Financial Model' |  |
| RGP | FIN_COVENANT | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §7.11(a)/(b) no thresholds; #398 none | §7.11(a) TNLR 'greater than 2.50 to 1.0'; (b) FCCR 'less than 1.25 to 1.0' |  |
| RGP | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | (vii), (viii), (xii) shown uncapped | trailing sentence: 'aggregate amount added back pursuant to clauses (b)(vii), (b)(viii) and (b)(xii) for any period shall not exceed ... ten percent (10%) of Consolidated EBITDA' | Shared cap stated after the enumerated list is never attached. Also (xiii) $3M 'during the term' treated per period. |
| RGP | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | no threshold surfaced | Permitted Acquisition: 'Consolidated Total Net Leverage Ratio is less than ... 2.25' |  |
| RGP | GENERAL_BASKET | **CORRECT** |  | §7.02(q) FIXED_DOLLAR COMPUTED 4,000,000 | §7.02(q) 'other Indebtedness in an aggregate principal amount not to exceed $4,000,000' |  |
| RGP | FAIL_CLOSED | **WRONG** | M7_EVENT_OR_TIME_CONDITIONAL_CAP | (x) restructuring cap amount 1,000,000 at periodEnd 2026-08-29 | (x)(D) 'for any Measurement Period ending on or after August 29, 2026 shall not exceed $4,000,000' | Wrong tier of a dated cap schedule (conservative). |
| CDNL | FIN_COVENANT | **FALSE-CONFIDENT** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §6.1 (DEBT_INCURRENCE) 'Ratio threshold: 3.00 to 1.00' only; §6.2 FCCR no threshold | §6.1 'to be greater than 2.50 to 1.0' (3.00 only during an elected Leverage Holiday); §6.2 FCCR 'less than 1.25 to 1.0' | Only the holiday level is shown; the base 2.50 ('to 1.0') is dropped. |
| CDNL | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | (ix) and (x) each carry their own 15% cap; capGroup null | (ix) 'aggregate amount added ... in reliance on this clause (b)(ix) and clause (b)(x) below, taken together, shall not exceed fifteen percent (15.0%)' | Shared cap read as two independent caps: up to 2x the permitted allowance once confirmed. |
| CDNL | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M3_TEXT_EXTRACTION_FIDELITY | TNL 'ratio is named, but no means-the-ratio definition is in the bound texts'; no thresholds | incurrence test at TNLR 2.25; definitions present but quoted with undecoded &#x201c;/&#x201d; |  |
| CDNL | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | §7.1(o) GROWER_GREATER_OF NEEDS_INPUT | §7.1(o) 'greater of (x) $12,000,000 and (y) 15% of Consolidated EBITDA' |  |
| CDNL | FAIL_CLOSED | **FAIL-CLOSED-OVERCAUTIOUS** | M3_TEXT_EXTRACTION_FIDELITY | definitions unbound -> every ratio NEEDS_INPUT | 1,972 undecoded hex entities (&#x201c; etc.) in extracted text |  |
| GOLF | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | customer §7.10(a) shows only 'Amount/threshold: $75,000,000' (x2); 3.75 absent; 10 debt clauses tagged FINANCIAL_MAINTENANCE | §7.10(a) Net Average Total Leverage 'greater than 3.75:1.00' (4.25 after >$75M acquisition); (b) ICR 'less than 3.00:1.00' |  |
| GOLF | EBITDA_ADDBACKS | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | (v) integration/restructuring and (x) run-rate synergies shown uncapped | trailing sentence: 'aggregate amount of add backs made pursuant to clauses (b)(v) and (b)(x) ... shall not exceed fifteen percent (15%) of Consolidated EBITDA' |  |
| GOLF | RATIO_BASKET | **CORRECT** |  | Net Average Secured Leverage 3.00 cited §7.06(h); ratioCapacity refused as ambiguous (3\|3.25) | §7.06(h) RP 'Net Average Secured Leverage Ratio does not exceed 3.00' |  |
| GOLF | GENERAL_BASKET | **CORRECT** |  | §7.03(n) FIXED_DOLLAR COMPUTED 125,000,000 | §7.03(n) '... shall not exceed $125,000,000' |  |
| GOLF | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | ratioCapacity NEEDS_INPUT 'ratio limit ambiguous (not exactly one)' | two different secured-leverage limits (3.00 / 3.25) |  |
| VRRM | FIN_COVENANT | **CORRECT** |  | #398 FIXED_CHARGE_COVERAGE threshold 1.0 (cited as 10.11(b)); customer shows availability trigger $15,000,000 | §10.11(a) springing FCCR 'at least 1.0 to 1.0' when Availability < greater of 10% of Aggregate Commitments and $15,000,000 |  |
| VRRM | EBITDA_ADDBACKS | **CORRECT** |  | 14 add-back lines incl. nested interest items; no caps (none in text); NEEDS_INPUT | Consolidated EBITDA (i)-(xi) add, (xii)-(xiv) deduct | (v) FX losses labelled TRANSACTION_COSTS (cosmetic). |
| VRRM | RATIO_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | (B)(B)(A) RATIO_BASED NEEDS_INPUT, no threshold | §10.04(xxix) Permitted Junior Debt 'shall not cause the Consolidated Total Net Leverage Ratio ... to exceed 5.20 to 1.00' | #398 attributes the (xxix) non-credit-party sub-limit ($132M) to '(B) Permitted Refinancing' as a COMPUTED cap. |
| VRRM | GENERAL_BASKET | **WRONG** | M3_TEXT_EXTRACTION_FIDELITY | release-1: general basket filed under '(B)(xiv) [reserved]' GROWER NEEDS_INPUT; #398: (xv) absent | §10.04(xv) 'additional Indebtedness ... not to exceed the greater of $110,500,000 and 6.50% of Consolidated Total Assets' | Enumerator paths ('(B)(B)(B)') degraded; 1,874 undecoded hex entities. |
| VRRM | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | springing trigger read as a greater-of item, NEEDS_INPUT; FCCR never computed | §10.11(a) availability trigger |  |
| RYI | FIN_COVENANT | **CORRECT** |  | #398 FIXED_CHARGE_COVERAGE threshold 1.0 | §10.11(a) springing FCCR 'at least 1.0 to 1.0' (trigger $60,000,000 struck -> $80,000,000) |  |
| RYI | EBITDA_ADDBACKS | **WRONG** | M6_EBITDA_MEASURE_LAYER | '(i) Consolidated Adjusted Net Earnings' listed as an add-back line; shared (x)/(xi) cap read '15 25 %' -> 25% (adjacency) | Consolidated EBITDA = '(i) Consolidated Adjusted Net Earnings, plus (ii) ...'; cap struck 15% -> inserted 25% | Base mistaken for an add-back; blackline cap resolved only by token adjacency. |
| RYI | RATIO_BASKET | **CORRECT** |  | LEVERAGE threshold 5.00 cited §10.04(3); ratioCapacity limit 5 | 'Leverage Ratio ... would be [greater] no more than 5.00 to 1.00' (blackline) |  |
| RYI | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M3_TEXT_EXTRACTION_FIDELITY | §10.04(xv) GROWER NEEDS_INPUT | §10.04(xv) 'greater of (x) $[200,000,000 struck] 340,000,000 and (y) 10.0% of Consolidated Total Assets' | Latent: a floor would read the struck $200M. |
| RYI | FAIL_CLOSED | **FALSE-CONFIDENT** | M3_TEXT_EXTRACTION_FIDELITY | §10.04(3)(viii) China Facility FIXED_DOLLAR COMPUTED 75,000,000 | HTML: '<STRIKE>75,000,000</STRIKE><U>127,500,000</U>' — operative cap $127,500,000 | Struck (deleted) text kept in extracted text; 859 <STRIKE> runs in RYI. |
| RXO | FIN_COVENANT | **CORRECT** |  | customer §7.12 FINANCIAL_MAINTENANCE 'Ratio threshold: 1.00 to 1.00' | §7.12 'If a Covenant Trigger Period exists ... shall not permit the Fixed Charge Coverage Ratio ... to be less than 1.00 to 1.00' | #398 ratio layer has no threshold. |
| RXO | EBITDA_ADDBACKS | **FAIL-CLOSED-OVERCAUTIOUS** | M8_AMENDMENT_MISCLASSIFICATION | no measure term; ebitdaBaseHold AMENDMENT_NEEDS_BASE_TEXT ('that certain Credit Agreement, dated as of October 18, 2022') | standalone ABL credit agreement; 'Consolidated EBITDA means ... the EBITDA of the U.S. Borrower' and 'EBITDA means ...' both in-document | Layered definition + preamble mention of the refinanced facility -> wrongly held for a base text. |
| RXO | RATIO_BASKET | **CORRECT** |  | TOTAL_NET_LEVERAGE 2.50 MAX | §7.1(b)(xxviii)(a) / (xvi)(A) 'Consolidated Total Net Leverage Ratio ... does not exceed 2.50 to 1.00' |  |
| RXO | GENERAL_BASKET | **FALSE-CONFIDENT** | M1_CAP_SCOPE_ATTRIBUTION | '§7.1 Indebtedness (b)(D)(xxv)' unsecured Indebtedness FIXED_DOLLAR COMPUTED 50,000,000 | '(xxv) unsecured Indebtedness; (xxvi) [Reserved]; (xxvii) Capitalized Lease Obligations and purchase money Indebtedness in an amount not to exceed $50,000,000' | Uncapped clause (xxv) given (xxvii)'s cap. |
| RXO | FAIL_CLOSED | **FAIL-CLOSED-OVERCAUTIOUS** | M8_AMENDMENT_MISCLASSIFICATION | EBITDA held as amendment needing base text | document is a new standalone agreement |  |
| CVNA | FIN_COVENANT | **WRONG** | M2_FIN_COVENANT_CLASSIFICATION_AND_LEVEL | #398 FINANCIAL_RATIOS ABSENT_VERIFIED (right); customer files three §1.1 definition fragments as FINANCIAL_MAINTENANCE ('Amount/threshold: $20,000,000') | covenant-lite term loan: no financial maintenance covenant |  |
| CVNA | EBITDA_ADDBACKS | **FAIL-CLOSED-OVERCAUTIOUS** | M3_TEXT_EXTRACTION_FIDELITY | no EBITDA measure term found; no tracker | '“Consolidated EBITDA”: with respect to any Person for any period, ...' (colon-style definition, no 'means') |  |
| CVNA | RATIO_BASKET | **CORRECT** |  | FIRST_LIEN_NET_LEVERAGE 2.75 cited §8.7(20) | §8.7 RP 'Consolidated First Lien Net Leverage Ratio is less than or equal to 2.75 to 1.00' |  |
| CVNA | GENERAL_BASKET | **FAIL-CLOSED-OVERCAUTIOUS** | M5_GREATER_OF_AND_FIXED_LIMB_FLOORS | §8.2(z) BUILDER_AVAILABLE_AMOUNT NEEDS_INPUT | §8.2(z) 'greater of (x) $2,900,000,000 and (y) 20.0% of Total Assets (... the “General Debt Basket Amount”)' |  |
| CVNA | FAIL_CLOSED | **FAIL-CLOSED-OK** |  | (y) 20% of Market Capitalization NEEDS_INPUT | §8.2(y) |  |
| LINC | FIN_COVENANT | **FALSE-CONFIDENT** | M4_ABSENCE_VERIFICATION | #398 FINANCIAL_RATIOS ABSENT_VERIFIED ('no operative lead-in or heading'); release-1 NEEDS_INPUT; customer: none | §3(g) 'comply at all times with the following financial covenants: (i) Total Leverage Ratio ... not greater than 2.00 to 1.00 (ii) Consolidated Interest Coverage Ratio ... not less than 3.00 to 1.00 (iii) Total Liquidity ... exceed $25,000,000' | Release-1 and #398 disagree; #398 asserts verified absence. |
| LINC | EBITDA_ADDBACKS | **FAIL-CLOSED-OK** |  | no EBITDA definition in document; nothing computed | terms defined by reference to the Fifth Third Credit Agreement |  |
| LINC | RATIO_BASKET | **N/A** |  | — | none |  |
| LINC | GENERAL_BASKET | **N/A** |  | — | no basket schedule |  |
| LINC | FAIL_CLOSED | **FALSE-CONFIDENT** | M4_ABSENCE_VERIFICATION | DEBT ABSENT_VERIFIED (release-1 and #398) | §3(c) Additional Financing: 'the Borrower shall not incur any additional indebtedness (except trade payables and equipment financing) ... without obtaining the ... consent' + Indebtedness permitted under the Fifth Third Credit Agreement (incorporated) | Absence verified from heading vocabulary on a non-standard bank loan agreement that incorporates another agreement by reference. |

## Top 3 root causes (by FALSE-CONFIDENT impact)

### 1. Cap scope attribution in EBITDA definitions and basket lists (M1): 6 FALSE-CONFIDENT, 1 WRONG
The cap parser attaches a cap to the clause token nearest to it. That is the wrong span in three situations:
- (a) A shared cap closes a lettered sub-list:
  - EB (10)(x)(A)–(F) share a $3M cap, but it lands on (F) only.
- (b) A shared cap sits in a trailing "Notwithstanding…" or "aggregate amount… pursuant to clauses (b)(v) and (b)(x)" sentence, or uses "taken together" cross-references:
  - RGP: 10% on (vii)/(viii)/(xii) is not attached.
  - GOLF: 15% on (v)/(x) is not attached.
  - CDNL: the shared 15% on (ix)+(x) is read as two separate 15% caps.
- (c) Cross-referenced labels repeat at a deeper level:
  - ACCV: the 27.5% cap meant for (i)(B), (t), (u), (x), (y) goes to (b) Interest and (ff)(x). Run-rate, integration and new-hire lines show as uncapped.

The same mechanism hits basket lists:
- RXO: "(xxv) unsecured Indebtedness" (no cap) is reported as COMPUTED $50M, a figure taken from (xxvii) capital leases.
- VRRM: the $132M sub-limit is filed under "Permitted Refinancing".
- LMB (conservative): the $500K sub-clause cap inside (iv)(F) is applied to the whole non-cash line.

Why it matters: the #398 confirm path bounds an uncapped line at 50% of revenue, so a mis-scoped cap turns directly into invented EBITDA and debt capacity.

**Generalized fix:** resolve every "provided that the aggregate amount … pursuant to clause(s) X[, Y and Z] … shall not exceed" sentence by its explicit clause references, wherever the sentence appears. Bind it to those exact enumerators, using the full path (e.g. (b)(x)), not the nearest token. A cap stated inside a sub-item applies only to that sub-item. If any referenced label can't be resolved uniquely, hold the whole group as NEEDS_INPUT instead of leaving lines uncapped.

### 2. Financial-covenant classification and level extraction (M2): 15 non-correct checks, 2 FALSE-CONFIDENT, across 12 of 15 agreements
**Level formats.** The ratio-threshold reader misses two common forms:
- "X.XX to 1.0" with a single zero: AVO, RGP, CDNL base level.
- "X.XX:1.00" with a colon: CHH, GOLF.

In those cases the engine either surfaces nothing or surfaces a dollar trigger (GOLF shows "$75,000,000" on §7.10(a)).

**Schedules and holidays.**
- Step-down schedules are cut short and never tied to the test date. EB shows 3.25/3.00/2.75, but 2.25 governs on 2026-10-17.
- Holiday levels are shown without the base level. CDNL shows 3.00, but the base is 2.50.

**Section classification.**
- Maintenance sections are filed as DEBT_INCURRENCE or OTHER: UTI §6.1, LMB §9.12, CHH §6.11/§6.12, CDNL §6.1.
- Definitions, LCT and debt clauses are filed as FINANCIAL_MAINTENANCE: UTI §1.5, LMB §7.1/7.2, GOLF, and three on covenant-lite CVNA.
- Some maintenance covenants are missing entirely: UTI §6.2, LMB §9.13.
- #398 also mixes incurrence-test thresholds into maintenance ratio thresholds (AVO, IIIV).

**Generalized fix:**
- Treat a section as a maintenance covenant when its heading or lead-in reads "Financial Covenant(s)" / "shall not permit the [Ratio] … to be greater/less than".
- Accept the separators `to 1(\.0+)?` and `:\s*1(\.0+)?`.
- Parse schedules into (period, level) pairs and select the level for the current test date. If the date can't be bound, report the whole schedule as NEEDS_INPUT.
- Keep incurrence thresholds out of maintenance thresholds.

### 3. Text-extraction fidelity (M3): 1 FALSE-CONFIDENT, 1 WRONG, 4 OVERCAUTIOUS; it also feeds M4
**Hex entities.** `decodeHtmlEntities` in `lib/extraction/parse.ts` decodes decimal `&#NNN;` and named entities only. Hex entities such as `&#x201c;`, `&#x201d;` and `&#xa0;` survive into the text:

| Doc | Undecoded hex entities |
|---|---:|
| CDNL | 1,972 |
| VRRM | 1,874 |
| RVLV (reserve) | 1,525 |
| LINC | 393 |

As a result, quoted defined terms never match. CDNL's ratio definitions are reported as absent ("ratio named, but no means-the-ratio definition"), and VRRM's general basket is mis-pathed.

**Blackline amendments.** Struck text is kept. Ryerson Amendment No. 7 reads "$ 75,000,000 127,500,000", and the China Facility basket is COMPUTED at the deleted $75M (operative: $127.5M). RYI has 859 `<STRIKE>` runs; ALOT and TH in the reserve have them too.

**Definition style.** Colon-style definitions ("“Consolidated EBITDA”: with respect to…") are not recognised, so CVNA gets no EBITDA tracker.

**Generalized fix:**
- Decode `&#x[0-9a-fA-F]+;`.
- Drop `<strike>`, `<s>` and `<del>` content (or keep it only in a separate "deleted" channel) before text extraction.
- Accept `“Term”:` as a definition lead-in alongside "means".

### Other mechanisms (smaller counts)
- **M4 absence verification:** LINC is a non-standard bank loan agreement that incorporates the Fifth Third Credit Agreement by reference. #398 marks FINANCIAL_RATIOS as ABSENT_VERIFIED even though §3(g) sets Total Leverage ≤2.00, ICR ≥3.00 and Liquidity >$25M. Both branches mark DEBT as ABSENT_VERIFIED even though §3(c) restricts additional indebtedness. Fix: a heading-vocabulary miss should not produce ABSENT_VERIFIED when the operative text contains "shall not incur" / "financial covenants" or incorporates another agreement by reference.
- **M5 greater-of floors:** floors are computed for some greater-of baskets but not others, even within one document:
  - LMB (r) vs (c);
  - ACCV (k) vs (q)/(gg);
  - CDNL (o);
  - CVNA (z), which is also misclassified as BUILDER;
  - EB (h), where the $15M fixed limb is lost inside the ratio basket.

  The stated dollar floor is a determined minimum and should be surfaced as a floor.
- **M6 EBITDA measure layer:**
  - UTI's covenants use "Consolidated Adjusted EBITDA", but the tracker is built on the plain "Consolidated EBITDA". Two capped add-backs and their 20% shared cap are lost.
  - RYI's base line ("Consolidated Adjusted Net Earnings") is listed as an add-back.
  - AVO drops (x)(B) and (xi)–(xiii) after a nested (A)/(B) block.
- **M7 event- and time-conditional caps:**
  - Lifetime caps ("during the term of this Agreement") are treated as per-period caps: IIIV (v), RGP (xiii), AVO (x)(A).
  - RGP's dated cap schedule picks the $1M tier, but the $4M tier applies for periods ending on or after 2026-08-29.
  - AVO's acquisition-conditional step-up is split into independent COMPUTED rows.
- **M8 amendment misclassification:** RXO is a standalone new ABL agreement. Because its preamble mentions the refinanced 2022 agreement, EBITDA is held as AMENDMENT_NEEDS_BASE_TEXT.

## What works
- Fixed-dollar general baskets are right when they are plain: UTI $20M, RGP $4M, GOLF $125M.
- Ratio baskets are right in 6 of the 12 scored (AVO, IIIV, GOLF, RYI, RXO, CVNA). None of the 12 is FALSE-CONFIDENT; the other 6 are fail-closed holds, 5 of them overcautious.
- Clean, uncapped EBITDA definitions are right: CHH, VRRM.
- The deliberate fail-closed holds are sound in 10 of 15 scenarios: lender-approval add-backs, Financial Model references, market-cap baskets, ambiguous ratio limits, investment-grade suspension.
- CVNA's covenant-lite ABSENT_VERIFIED on #398 is correct.

## Limitations
- One hand reviewer; clause readings are cited so they can be re-checked.
- 15 agreements, so the class rates carry wide error bars: ±10–12 points at this n.
- #398 is not rebased on release-1, so the two layers were measured separately and combined only for the financial-covenant check. Release-1 and #398 disagree on LINC FINANCIAL_RATIOS (NEEDS_INPUT vs ABSENT_VERIFIED).
- The customer upload path ran offline (temporary CorpusStore, no Prisma or database). Production rendering may filter or merge items differently.
- XBRL facts are from SEC companyfacts as of 2026-10-17; EBITDA amounts were not hand-reconciled to filings, only add-back categories and caps were.
- No sample document was used to change any code. The sample stays MEASUREMENT-ONLY; fixes should be justified on other documents and then re-measured here.
