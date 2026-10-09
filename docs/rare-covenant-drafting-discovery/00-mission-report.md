# Rare Covenant Drafting Discovery — Mission Report

Generated: 2026-10-08T22:11:53.213Z
Version: rare-covenant-drafting-discovery.v1
Paid calls: 0
Production legal rules modified: false

## Corpus coverage

| Metric | Value |
| --- | ---: |
| Corpus documents | 8 |
| Probe documents | 7 |
| Corpus units | 244 |
| Probe units | 2412 |
| Signature keys (total) | 937 |
| Probe-only signatures | 797 |
| Corpus-only signatures | 73 |
| Shared signatures | 67 |

### Packages

- `chwy-2026-credit-agreement` (PROBE): 1 docs, 566 units
- `conmed-2025-credit-facility` (CORPUS): 3 docs, 66 units
- `dsgr-2022-2025-credit-facility` (PROBE): 2 docs, 859 units
- `final-lightweight-unseen-sup` (PROBE): 1 docs, 501 units
- `fwrg-2021-credit-agreement` (CORPUS): 2 docs, 69 units
- `gibraltar-2026-credit-agreement` (PROBE): 1 docs, 429 units
- `lsb-2023-abl-credit-agreement` (CORPUS): 3 docs, 109 units
- `riot-2025-2026-credit-facility` (PROBE): 2 docs, 57 units

### Units by category

| Category | Corpus | Probe |
| --- | ---: | ---: |
| COVENANT_STRUCTURE | 41 | 475 |
| DEFINITION_FORMULATION | 7 | 267 |
| BASKET_FORMULA | 5 | 42 |
| PROVISO_PLACEMENT | 42 | 427 |
| ENTITY_SCOPE | 71 | 815 |
| AMENDMENT_MECHANISM | 3 | 69 |
| SHARED_CAPACITY | 11 | 195 |
| RECLASSIFICATION | 5 | 25 |
| CROSS_DOCUMENT_RESTRICTION | 26 | 67 |
| INTERCREDITOR_LIMITATION | 33 | 30 |

## Method (deterministic)

1. Normalize EDGAR/HTML artifacts and whitespace.
2. Slice documents into drafting windows (section/definition/proviso/hotspot).
3. Multi-label category detect + structural signature tokens (shape, not values).
4. Cluster by signature key; score novelty from corpus support, signature distance, and high-risk tokens.
5. Attach lexical neighbors as comparison examples only — **never** as semantic equivalence.
6. Emit reviewer queue + diversified acquisition recommendations for the knowledge factory.

## Diversified reviewer queue (first 12)

1. **RECLASSIFICATION** / CAPACITY_OVERSTATEMENT (score 0.99) — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:392532-393651`
   "curred or otherwise effected in reliance on Fixed Amounts shall be automatically and immediately reclassified at any time, unless the Initial Borrower otherwise elects from time to time, as incurred under the applicable "
   Signature: `RECLASSIFICATION|DEFINITION_FOR_PURPOSES+FIXED_VS_INCURRENCE+RATIO_GATE+RECLASSIFY_AUTOMATIC`

2. **SHARED_CAPACITY** / CAPACITY_OVERSTATEMENT (score 0.99) — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:225602-226722`
   "s compensation, performance and similar deposits entered into as a result of the operations of the business in the ordinary course of business or consistent with industry practice; (22) [reserved]; (23) Investments in no"
   Signature: `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+IN_THE_AGGREGATE_WITH`

3. **PROVISO_PLACEMENT** / FALSE_PERMISSION (score 0.99) — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:544224-545622`
   "provided that with respect to Indebtedness incurred or assumed pursuant to clause (14)(a), (A) Subsidiaries of the Borrower that are not Guarantors may not incur or assume Indebtedness or issue Disqualified Stock or Pref"
   Signature: `PROVISO_PLACEMENT|CROSS_DOC_REFINANCING_LINEAGE+ENTITY_GUARANTOR_ONLY+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`

4. **CROSS_DOCUMENT_RESTRICTION** / CROSS_INSTRUMENT_SILENCE (score 0.9471) — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:532015-533412`
   "(b) The provisions of Section 7.02(a) will not apply to: (1) Indebtedness under the Loan Documents (including any Incremental Loans, Other Loans, Extended Term Loans and Replacement Loans); (2) the incurrence by the Borr"
   Signature: `CROSS_DOCUMENT_RESTRICTION|CROSS_DOC_REFINANCING_LINEAGE+ENTITY_GUARANTOR_ONLY+EXCEPTION_LIST_ITEM+GENERAL_PROHIBITION+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`

5. **INTERCREDITOR_LIMITATION** / PRIORITY_MISORDER (score 0.9187) — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:847553-848951`
   "(b) Notwithstanding anything to the contrary set forth herein, to the extent the Administrative Agent and/or Collateral Agent enter into any other Intercreditor Agreement in accordance with the terms hereof, this Agreeme"
   Signature: `INTERCREDITOR_LIMITATION|CROSS_DOC_SUBJECT_TO+EXCEPTION_LIST_ITEM+INTERCREDITOR_JOINDER+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION`

6. **ENTITY_SCOPE** / SCOPE_MISBIND (score 0.99) — `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt:192271-193669`
   "Section 7701(a)(30) of the Code. \" U.S. Secured Obligations \" means all Obligations of the U.S. Loan Parties, together with all (i) Banking Services Obligations of the U.S. Loan Parties and the U.S. Subsidiaries and (ii)"
   Signature: `ENTITY_SCOPE|DEFINITION_FOR_PURPOSES+DEFINITION_MEANS+ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`

7. **AMENDMENT_MECHANISM** / AMENDMENT_BYPASS (score 0.99) — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:686260-687659`
   "Section 4.01 or 4.02, in each case, without the written consent of each Lender; or (vi) [reserved]; provided that: (I) [reserved]; (II) [reserved] (III) no amendment, waiver or consent shall, unless in writing and signed"
   Signature: `AMENDMENT_MECHANISM|AMENDMENT_AFFECTED_LENDER+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION`

8. **BASKET_FORMULA** / CAPACITY_UNDERSTATEMENT (score 0.9627) — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:629864-631035`
   "Section 6.01(b)(18) and (ii) Indebtedness of Restricted Parties that are not Guarantors in respect of any working capital facilities to the extent non-recourse to the Loan Parties; (19) Indebtedness, Disqualified Stock o"
   Signature: `BASKET_FORMULA|ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+SHARED_AGGREGATE+TOGETHER_WITH_SECTIONS`

9. **COVENANT_STRUCTURE** / FALSE_PERMISSION (score 0.99) — `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt:465222-466117`
   "Section 6.05(k) shall be made for fair value and for at least 75% cash consideration. Notwithstanding the foregoing, no Loan Party or any Restricted Subsidiary shall consummate any transaction that results in the Disposi"
   Signature: `COVENANT_STRUCTURE|ENTITY_LOAN_PARTY+ENTITY_RESTRICTED_SUB+ENTITY_UNRESTRICTED_SUB+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION`

10. **DEFINITION_FORMULATION** / FALSE_PERMISSION (score 0.99) — `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt:63227-64625`
   "Notwithstanding the foregoing, Cash Equivalents shall include amounts denominated in currencies other than those set forth in clause (1) above; provided that such amounts are converted into any currency listed in clause "
   Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION`

11. **RECLASSIFICATION** / CAPACITY_OVERSTATEMENT (score 0.99) — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:392409-393528`
   "mergers, consolidations, Restricted Payments or any prepayments of Indebtedness (or, in each case, any portion thereof) incurred or otherwise effected in reliance on Fixed Amounts shall be automatically and immediately r"
   Signature: `RECLASSIFICATION|DEFINITION_FOR_PURPOSES+FIXED_VS_INCURRENCE+RATIO_GATE+RECLASSIFY_AUTOMATIC`

12. **SHARED_CAPACITY** / CAPACITY_OVERSTATEMENT (score 0.99) — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:629452-630572`
   "utstanding not to exceed, in the aggregate (together with any outstanding Indebtedness under Section 6.01(b)(13) hereof incurred to Refinance Indebtedness initially incurred in reliance on this Section 6.01(b)(18)), the "
   Signature: `SHARED_CAPACITY|ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+SHARED_AGGREGATE+TOGETHER_WITH_SECTIONS`

## Real novelty findings (score-ordered sample)

### 1. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:00d45f5d6245e3dc1b4ed722`
- Failure mode: **FALSE_PERMISSION** — Definitional notwithstanding/proviso can silently expand a defined set (e.g. Cash Equivalents) beyond the enumerated limbs.
- Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION`
- Corpus support: 0; probe support: 3; cluster size: 3
- Source: `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt` chars `[63227, 64625)`
- Excerpt: "Notwithstanding the foregoing, Cash Equivalents shall include amounts denominated in currencies other than those set forth in clause (1) above; provided that such amounts are converted into any currency listed in clause (1) as promptly as practicable and in any event within ten (10) Business Days following the receipt "
- Comparison (lexical only, Jaccard 0.2578, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `DEFINITION_FORMULATION|DEFINITION_MEANS+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION` — "Notwithstanding the foregoing, Cash Equivalents shall include amounts denominated in currencies other than those set forth in clauses (1) and (2) above; provided that such amounts "

### 2. AMENDMENT_MECHANISM — score 0.99

- Finding: `novelty:09499d876dd74df1df2480f8`
- Failure mode: **AMENDMENT_BYPASS** — Sacred-right / affected-lender / yank-a-bank mechanics can be missed by Required-Lender-only amendment models.
- Signature: `AMENDMENT_MECHANISM|AMENDMENT_AFFECTED_LENDER+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt` chars `[686260, 687659)`
- Excerpt: "Section 4.01 or 4.02, in each case, without the written consent of each Lender; or (vi) [reserved]; provided that: (I) [reserved]; (II) [reserved] (III) no amendment, waiver or consent shall, unless in writing and signed by the Administrative Agent in addition to the Lenders required above, affect the rights or duties "
- Comparison (lexical only, Jaccard 0.1477, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `AMENDMENT_MECHANISM|AMENDMENT_AFFECTED_LENDER+AMENDMENT_REQUIRED_LENDERS+EXCEPTION_LIST_ITEM+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION` — "(d) Notwithstanding anything in this Agreement or the other Loan Documents to the contrary, the Loans of any Lender that is at the time (i) a Defaulting Lender or (ii) a Disqualifi"

### 3. SHARED_CAPACITY — score 0.99

- Finding: `novelty:0aeca535057f66cbbbc4efcf`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+IN_THE_AGGREGATE_WITH`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt` chars `[225602, 226722)`
- Excerpt: "s compensation, performance and similar deposits entered into as a result of the operations of the business in the ordinary course of business or consistent with industry practice; (22) [reserved]; (23) Investments in non-Loan Parties, taken together with all other Investments made pursuant to this clause (23) that are"
- Comparison (lexical only, Jaccard 0.76, equivalenceClaim=NONE_LEXICAL_ONLY): `final-lightweight-unseen-sup` / `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+IN_THE_AGGREGATE_WITH` — "ry practice; (22) [reserved]; (23) Investments in non-Loan Parties, taken together with all other Investments made pursuant to this clause (23) that are at that time outstanding, w"

### 4. SHARED_CAPACITY — score 0.99

- Finding: `novelty:0ccfa7a7e4057254b021c70a`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+SHARED_AGGREGATE+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[629452, 630572)`
- Excerpt: "utstanding not to exceed, in the aggregate (together with any outstanding Indebtedness under Section 6.01(b)(13) hereof incurred to Refinance Indebtedness initially incurred in reliance on this Section 6.01(b)(18)), the greater of (x) $720.0 million and (y) 100% of Consolidated EBITDA for the most recently ended Test P"
- Comparison (lexical only, Jaccard 0.6538, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `SHARED_CAPACITY|ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+SHARED_AGGREGATE+TOGETHER_WITH_SECTIONS` — "Section 6.01(b)(18) and (ii) Indebtedness of Restricted Parties that are not Guarantors in respect of any working capital facilities to the extent non-recourse to the Loan Parties;"

### 5. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:153df828dc8c90ca345aee84`
- Failure mode: **MISSING_RESTRICTION** — Rare definition formulation may omit builder reductions, exclusions, or measurement-date constraints.
- Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+FIXED_VS_INCURRENCE+IN_THE_AGGREGATE_WITH+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[198429, 199549)`
- Excerpt: "d related Incremental Term Loans created pursuant to an Incremental Facility Amendment, together with any refinancing thereof. \" Incremental Term Loan \" has the meaning assigned to such term in Section 2.18(a). -42- \" Incurrence-Based Amounts \" has the meaning assigned to such term in Section 1.08(f). \" Indebtedness \" "
- Comparison (lexical only, Jaccard 0.7539, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `DEFINITION_FORMULATION|DEFINITION_MEANS+FIXED_VS_INCURRENCE+IN_THE_AGGREGATE_WITH+TOGETHER_WITH_SECTIONS` — "Section 2.18(a). \" Incremental Revolving Loans \" means Loans under any Incremental Revolving Facility or Incremental Revolving Increase. \" Incremental Term Commitment \" means a com"

### 6. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:16b464be29795ef8a444bf50`
- Failure mode: **MISSING_RESTRICTION** — Rare definition formulation may omit builder reductions, exclusions, or measurement-date constraints.
- Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+FIXED_VS_INCURRENCE+IN_THE_AGGREGATE_WITH+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[198099, 199497)`
- Excerpt: "Section 2.18(a). \" Incremental Revolving Loans \" means Loans under any Incremental Revolving Facility or Incremental Revolving Increase. \" Incremental Term Commitment \" means a commitment in respect of Incremental Term Loans. \" Incremental Term Facility \" means each and any facility comprised of Incremental Term Commit"
- Comparison (lexical only, Jaccard 0.7539, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `DEFINITION_FORMULATION|DEFINITION_MEANS+FIXED_VS_INCURRENCE+IN_THE_AGGREGATE_WITH+TOGETHER_WITH_SECTIONS` — "d related Incremental Term Loans created pursuant to an Incremental Facility Amendment, together with any refinancing thereof. \" Incremental Term Loan \" has the meaning assigned to"

### 7. SHARED_CAPACITY — score 0.99

- Finding: `novelty:16e1e7039991e11615a56212`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+SHARED_AGGREGATE+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[629864, 631035)`
- Excerpt: "Section 6.01(b)(18) and (ii) Indebtedness of Restricted Parties that are not Guarantors in respect of any working capital facilities to the extent non-recourse to the Loan Parties; (19) Indebtedness, Disqualified Stock or Preferred Stock of any Restricted Party incurred or issued to finance or assumed in connection wit"
- Comparison (lexical only, Jaccard 0.7714, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `SHARED_CAPACITY|IN_THE_AGGREGATE_WITH+SHARED_AGGREGATE+TOGETHER_WITH_SECTIONS` — "19) Indebtedness, Disqualified Stock or Preferred Stock of any Restricted Party incurred or issued to finance or assumed in connection with an acquisition or Investment in an aggre"

### 8. SHARED_CAPACITY — score 0.99

- Finding: `novelty:193b831b9d1ffd19347012c6`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_RESTRICTED_SUB+EXCEPTION_LIST_ITEM+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt` chars `[436299, 437257)`
- Excerpt: "(c) Guarantees by any Borrower of Indebtedness of any Restricted Subsidiary and by any Restricted Subsidiary of Indebtedness of any Borrower or any other Restricted Subsidiary, provided that (i) the Indebtedness so Guaranteed is permitted by this Section 6.01, (ii) Guarantees by any Borrower or other Loan Party of Inde"
- Comparison (lexical only, Jaccard 1, equivalenceClaim=NONE_LEXICAL_ONLY): `dsgr-2022-2025-credit-facility` / `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_RESTRICTED_SUB+EXCEPTION_LIST_ITEM+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS` — "(c) Guarantees by any Borrower of Indebtedness of any Restricted Subsidiary and by any Restricted Subsidiary of Indebtedness of any Borrower or any other Restricted Subsidiary, pro"

### 9. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:1ec9ccbd8e44679d83b36176`
- Failure mode: **FALSE_PERMISSION** — Definitional notwithstanding/proviso can silently expand a defined set (e.g. Cash Equivalents) beyond the enumerated limbs.
- Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+NOTWITHSTANDING_OVERRIDE+PROVISO_AFTER_PERMISSION`
- Corpus support: 0; probe support: 3; cluster size: 3
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[17597, 18996)`
- Excerpt: "Section 163(e)(5) of the Code to such Indebtedness. \" Alternate Base Rate \" means for any day a fluctuating rate per annum equal to the highest of (a) the NYFRB Rate plus 1/2 of 1.00%, (b) the Prime Rate for such day and (c) Term SOFR Rate for a one (1)-month Interest Period as published two (2) U.S. Government Securit"
- Comparison (lexical only, Jaccard 0.1634, equivalenceClaim=NONE_LEXICAL_ONLY): `final-lightweight-unseen-sup` / `DEFINITION_FORMULATION|DEFINITION_FOR_PURPOSES+DEFINITION_MEANS` — "is being used as an alternate rate of interest pursuant to Section 3.03 (for the avoidance of doubt, only until the Benchmark Replacement has been determined pursuant to Section 3."

### 10. PROVISO_PLACEMENT — score 0.99

- Finding: `novelty:210c0d5e9ac49d8bf1a8eeec`
- Failure mode: **FALSE_PERMISSION** — Permission lead-in with trailing proviso/step-up limits is a classic false-permission pattern if the proviso is dropped.
- Signature: `PROVISO_PLACEMENT|CROSS_DOC_REFINANCING_LINEAGE+ENTITY_GUARANTOR_ONLY+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt` chars `[544224, 545622)`
- Excerpt: "provided that with respect to Indebtedness incurred or assumed pursuant to clause (14)(a), (A) Subsidiaries of the Borrower that are not Guarantors may not incur or assume Indebtedness or issue Disqualified Stock or Preferred Stock under clause (14)(a) if, after giving pro forma effect to such incurrence, assumption or"
- Comparison (lexical only, Jaccard 0.2265, equivalenceClaim=NONE_LEXICAL_ONLY): `final-lightweight-unseen-sup` / `PROVISO_PLACEMENT|ENTITY_GUARANTOR_ONLY+GENERAL_PROHIBITION+PROVISO_AFTER_PROHIBITION` — "y of the foregoing (excluding any Incremental Amounts), in each case then outstanding, would exceed (as of the date such Indebtedness, Disqualified Stock or Preferred Stock is issu"

### 11. PROVISO_PLACEMENT — score 0.99

- Finding: `novelty:24132dba9db305f4b0acc264`
- Failure mode: **FALSE_PERMISSION** — Permission lead-in with trailing proviso/step-up limits is a classic false-permission pattern if the proviso is dropped.
- Signature: `PROVISO_PLACEMENT|IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[650984, 652104)`
- Excerpt: "Effective Date (on a cumulative basis), received by the applicable Restricted Party, as the case may be, is in the form of cash or Cash Equivalents, and (ii) with respect to any Asset Sales individually in excess of the greater of (x) $216.0 million and (y) 30% of Consolidated EBITDA for the most recently ended Test Pe"
- Comparison (lexical only, Jaccard 0.4101, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `PROVISO_PLACEMENT|PROVISO_AFTER_PERMISSION` — "fective Date (on a cumulative basis), received by the applicable Restricted Party (or held in escrow pending release), as the case may be, is in the form of cash or Cash Equivalent"

### 12. SHARED_CAPACITY — score 0.99

- Finding: `novelty:32cdc8e66e02b6cc36ba4bcb`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_RESTRICTED_SUB+EXCEPTION_LIST_ITEM+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt` chars `[448234, 449192)`
- Excerpt: "(c) Guarantees by any Borrower of Indebtedness of any Restricted Subsidiary and by any Restricted Subsidiary of Indebtedness of any Borrower or any other Restricted Subsidiary, provided that (i) the Indebtedness so Guaranteed is permitted by this Section 6.01, (ii) Guarantees by any Borrower or other Loan Party of Inde"
- Comparison (lexical only, Jaccard 1, equivalenceClaim=NONE_LEXICAL_ONLY): `dsgr-2022-2025-credit-facility` / `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_RESTRICTED_SUB+EXCEPTION_LIST_ITEM+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS` — "(c) Guarantees by any Borrower of Indebtedness of any Restricted Subsidiary and by any Restricted Subsidiary of Indebtedness of any Borrower or any other Restricted Subsidiary, pro"

### 13. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:34a19d49d63c0fedf4cd3b43`
- Failure mode: **MISSING_RESTRICTION** — Rare definition formulation may omit builder reductions, exclusions, or measurement-date constraints.
- Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+ENTITY_RESTRICTED_SUB+GENERAL_PROHIBITION+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PROHIBITION`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[260734, 262133)`
- Excerpt: "provided that this clause (ii) shall not be relied on for the purpose of incurring Indebtedness secured by a lien on all or a material portion of the Collateral on a pari passu basis with the Term Loans; (28) the Transactions; (29) any acquisition or Investment by any Non-Loan Party Subsidiary to the extent funded with"
- Comparison (lexical only, Jaccard 0.6516, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `DEFINITION_FORMULATION|DEFINITION_MEANS+ENTITY_RESTRICTED_SUB+IN_THE_AGGREGATE_WITH` — "0) any Investment in a Joint Venture having an aggregate Fair Market Value, taken together with all other Investments made pursuant to this clause (30) that are at that time outsta"

### 14. PROVISO_PLACEMENT — score 0.99

- Finding: `novelty:3a7caf91729c0036fc98c4bf`
- Failure mode: **MISSING_RESTRICTION** — Proviso placement can hide a restriction outside the clause the discovery pass anchors.
- Signature: `PROVISO_PLACEMENT|CROSS_DOC_REFINANCING_LINEAGE+ENTITY_GUARANTOR_ONLY+EXCEPTION_LIST_ITEM+GENERAL_PROHIBITION+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt` chars `[532015, 533412)`
- Excerpt: "(b) The provisions of Section 7.02(a) will not apply to: (1) Indebtedness under the Loan Documents (including any Incremental Loans, Other Loans, Extended Term Loans and Replacement Loans); (2) the incurrence by the Borrower of the Senior Notes and the Guarantee thereof by any Guarantor; (3) the incurrence of Indebtedn"
- Comparison (lexical only, Jaccard 0.3083, equivalenceClaim=NONE_LEXICAL_ONLY): `final-lightweight-unseen-sup` / `PROVISO_PLACEMENT|ENTITY_GUARANTOR_ONLY+GENERAL_PROHIBITION+PROVISO_AFTER_PROHIBITION` — "y of the foregoing (excluding any Incremental Amounts), in each case then outstanding, would exceed (as of the date such Indebtedness, Disqualified Stock or Preferred Stock is issu"

### 15. SHARED_CAPACITY — score 0.99

- Finding: `novelty:3dc757f1605c06e039f4fd57`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[253695, 255093)`
- Excerpt: "Section 6.08(a)(3) hereof; (10) guarantees of Indebtedness to the extent such guarantees are permitted under Section 6.01 hereof; the creation of Liens on the assets of any Restricted Party in compliance with Section 6.02; and Restricted Payments permitted under Section 6.08 (including any transactions incurred in reli"
- Comparison (lexical only, Jaccard 0.2562, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `SHARED_CAPACITY|ENTITY_RESTRICTED_SUB+IN_THE_AGGREGATE_WITH` — "th other Persons; -55- (13) additional Investments having an aggregate Fair Market Value, taken together with all other Investments made pursuant to this clause (13) that are at th"

### 16. SHARED_CAPACITY — score 0.99

- Finding: `novelty:459a88d1d3979c251e284646`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|DEFINITION_MEANS+FIXED_VS_INCURRENCE+IN_THE_AGGREGATE_WITH+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[198429, 199549)`
- Excerpt: "d related Incremental Term Loans created pursuant to an Incremental Facility Amendment, together with any refinancing thereof. \" Incremental Term Loan \" has the meaning assigned to such term in Section 2.18(a). -42- \" Incurrence-Based Amounts \" has the meaning assigned to such term in Section 1.08(f). \" Indebtedness \" "
- Comparison (lexical only, Jaccard 0.7539, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `SHARED_CAPACITY|DEFINITION_MEANS+FIXED_VS_INCURRENCE+IN_THE_AGGREGATE_WITH+TOGETHER_WITH_SECTIONS` — "Section 2.18(a). \" Incremental Revolving Loans \" means Loans under any Incremental Revolving Facility or Incremental Revolving Increase. \" Incremental Term Commitment \" means a com"

### 17. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:466cff7dad941899eba7aba2`
- Failure mode: **MISSING_RESTRICTION** — Rare definition formulation may omit builder reductions, exclusions, or measurement-date constraints.
- Signature: `DEFINITION_FORMULATION|BUILDER_BASKET+DEFINITION_MEANS+ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+ENTITY_RESTRICTED_SUB+EXCEPTION_LIST_ITEM+FIXED_VS_INCURRENCE+RATIO_GATE`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[234735, 236134)`
- Excerpt: "Section 9.02(c). \" Non-Loan Party Subsidiary \" means any Restricted Subsidiary of the Initial Borrower that is not a Loan Party. \" Not Otherwise Applied \" means, with reference to the Available Amount, that was not previously applied pursuant to Section 6.01(b)(32), clause (46)(ii) of the definition of \"Permitted Liens"
- Comparison (lexical only, Jaccard 0.5689, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `DEFINITION_FORMULATION|AMENDMENT_YANK_A_BANK+BUILDER_BASKET+DEFINITION_MEANS+ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+ENTITY_RESTRICTED_SUB+EXCEPTION_LIST_ITEM+FIXED_VS_INCURRENCE+RATIO_GATE` — "rs or consultants or business partners of the Borrowers and their respective Subsidiaries in replacement for forfeited equity awards. \" Non-Consenting Lender \" has the meaning assi"

### 18. PROVISO_PLACEMENT — score 0.99

- Finding: `novelty:4e4f1ba22ac6186e20a2caf1`
- Failure mode: **FALSE_PERMISSION** — Permission lead-in with trailing proviso/step-up limits is a classic false-permission pattern if the proviso is dropped.
- Signature: `PROVISO_PLACEMENT|DEFINITION_FOR_PURPOSES+DEFINITION_MEANS+ENTITY_GUARANTOR_ONLY+ENTITY_LOAN_PARTY+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt` chars `[192271, 193669)`
- Excerpt: "Section 7701(a)(30) of the Code. \" U.S. Secured Obligations \" means all Obligations of the U.S. Loan Parties, together with all (i) Banking Services Obligations of the U.S. Loan Parties and the U.S. Subsidiaries and (ii) Swap Agreement Obligations of the U.S. Loan Parties and the U.S. Subsidiaries, in each case, owing "
- Comparison (lexical only, Jaccard 0.1054, equivalenceClaim=NONE_LEXICAL_ONLY): `dsgr-2022-2025-credit-facility` / `PROVISO_PLACEMENT|DEFINITION_FOR_PURPOSES+ENTITY_GUARANTOR_ONLY+EXCEPTION_LIST_ITEM+GENERAL_PROHIBITION+PROVISO_AFTER_PROHIBITION+TOGETHER_WITH_SECTIONS` — "(b) Each Canadian Loan Guarantor (other than those that have delivered a separate Guaranty) hereby agrees that it is jointly and severally liable for, and, as a primary obligor and"

### 19. SHARED_CAPACITY — score 0.99

- Finding: `novelty:50e0dd431db9647b8c9bed6a`
- Failure mode: **CAPACITY_OVERSTATEMENT** — Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Signature: `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+ENTITY_RESTRICTED_SUB+IN_THE_AGGREGATE_WITH`
- Corpus support: 0; probe support: 2; cluster size: 2
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[260785, 261903)`
- Excerpt: "on for the purpose of incurring Indebtedness secured by a lien on all or a material portion of the Collateral on a pari passu basis with the Term Loans; (28) the Transactions; (29) any acquisition or Investment by any Non-Loan Party Subsidiary to the extent funded with the operating cash flow of Non-Loan Party Subsidia"
- Comparison (lexical only, Jaccard 0.8715, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `SHARED_CAPACITY|ENTITY_LOAN_PARTY+ENTITY_NON_LOAN_PARTY+ENTITY_RESTRICTED_SUB+IN_THE_AGGREGATE_WITH` — "erial portion of the Collateral on a pari passu basis with the Term Loans; (28) the Transactions; (29) any acquisition or Investment by any Non-Loan Party Subsidiary to the extent "

### 20. DEFINITION_FORMULATION — score 0.99

- Finding: `novelty:521ffa01a72e54d7e80bc964`
- Failure mode: **FALSE_PERMISSION** — Definitional notwithstanding/proviso can silently expand a defined set (e.g. Cash Equivalents) beyond the enumerated limbs.
- Signature: `DEFINITION_FORMULATION|DEFINITION_MEANS+EXCEPTION_LIST_ITEM+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+TOGETHER_WITH_SECTIONS`
- Corpus support: 0; probe support: 1; cluster size: 1
- Source: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` chars `[34933, 36053)`
- Excerpt: "nt to clause 13 of \"Permitted Investments,\" minus (b) the amount of the Available Investment Capacity Amount utilized by the Restricted Parties pursuant to Section 6.08(b)(26) (after giving effect to any reallocation or reclassification permitted hereunder). \" Available RP Capacity Amount \" means, at any time of determ"
- Comparison (lexical only, Jaccard 0.8418, equivalenceClaim=NONE_LEXICAL_ONLY): `chwy-2026-credit-agreement` / `DEFINITION_FORMULATION|DEFINITION_MEANS+IN_THE_AGGREGATE_WITH+PROVISO_AFTER_PERMISSION+TOGETHER_WITH_SECTIONS` — "Section 6.08(b)(26) (after giving effect to any reallocation or reclassification permitted hereunder). \" Available RP Capacity Amount \" means, at any time of determination (and aft"

## Reviewer queue (summary)

Queue size: 40. Full JSON: `03-reviewer-queue.json`.

1. [0.99] RECLASSIFICATION / CAPACITY_OVERSTATEMENT @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:392532-393651`
2. [0.99] SHARED_CAPACITY / CAPACITY_OVERSTATEMENT @ `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:225602-226722`
3. [0.99] PROVISO_PLACEMENT / FALSE_PERMISSION @ `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:544224-545622`
4. [0.9471] CROSS_DOCUMENT_RESTRICTION / CROSS_INSTRUMENT_SILENCE @ `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:532015-533412`
5. [0.9187] INTERCREDITOR_LIMITATION / PRIORITY_MISORDER @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:847553-848951`
6. [0.99] ENTITY_SCOPE / SCOPE_MISBIND @ `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt:192271-193669`
7. [0.99] AMENDMENT_MECHANISM / AMENDMENT_BYPASS @ `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:686260-687659`
8. [0.9627] BASKET_FORMULA / CAPACITY_UNDERSTATEMENT @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:629864-631035`
9. [0.99] COVENANT_STRUCTURE / FALSE_PERMISSION @ `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt:465222-466117`
10. [0.99] DEFINITION_FORMULATION / FALSE_PERMISSION @ `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt:63227-64625`
11. [0.99] RECLASSIFICATION / CAPACITY_OVERSTATEMENT @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:392409-393528`
12. [0.99] SHARED_CAPACITY / CAPACITY_OVERSTATEMENT @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:629452-630572`
13. [0.99] PROVISO_PLACEMENT / FALSE_PERMISSION @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:650984-652104`
14. [0.9187] CROSS_DOCUMENT_RESTRICTION / CROSS_INSTRUMENT_SILENCE @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:197135-198255`
15. [0.88] INTERCREDITOR_LIMITATION / PRIORITY_MISORDER @ `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt:799189-799674`

## Knowledge-factory acquisition recommendations

### 1. AMENDMENT_MECHANISM

- 3 high-scoring AMENDMENT_MECHANISM shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Affected-lender / sacred-right / yank-a-bank clusters
- Search hints: "\"yank-a-bank\" OR \"non-consenting Lender\" credit agreement"; "\"all Lenders\" \"pro rata sharing\" amendments"
- Diversifies away from: Required Lenders majority amendment only

### 2. COVENANT_STRUCTURE

- 3 high-scoring COVENANT_STRUCTURE shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Chapeau + lettered exception list with trailing compliance/reclass paragraph outside the last letter
- Search hints: "\"For purposes of determining compliance with this Section\" reclassify 8-K exhibit"; "credit agreement negative covenant chapeau EDGAR"
- Diversifies away from: standard leverage step-up with election notice; ordinary greater-of flat-or-EBITDA basket; vanilla Restricted Subsidiary / Loan Party scope

### 3. DEFINITION_FORMULATION

- 3 high-scoring DEFINITION_FORMULATION shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Builder / Available Amount definitions with cross-article reduction hooks
- Search hints: "\"Available Amount\" \"builder\" credit agreement exhibit 10"; "\"Cumulative Credit\" definition credit agreement"
- Diversifies away from: simple means-definitions without builder mechanics

### 4. ENTITY_SCOPE

- 3 high-scoring ENTITY_SCOPE shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Non-Loan Party / Foreign Restricted Subsidiary shared sub-caps
- Search hints: "\"Non-Loan Parties\" \"in the aggregate\" Incremental Equivalent"; "\"Foreign Restricted Subsidiary\" sublimit credit agreement"
- Diversifies away from: Borrower and Restricted Subsidiaries undifferentiated scope

### 5. PROVISO_PLACEMENT

- 3 high-scoring PROVISO_PLACEMENT shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Permission sentence with multi-limb proviso (x)/(y)/(z) after a Notwithstanding override
- Search hints: "\"Notwithstanding the foregoing\" \"provided that (x)\" leverage"; "Material Acquisition step-up provided that only twice"
- Diversifies away from: standalone prohibition without trailing proviso

### 6. RECLASSIFICATION

- 3 high-scoring RECLASSIFICATION shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Automatic Fixed Amount → Incurrence-Based reclass unless elect otherwise
- Search hints: "\"Fixed Amounts\" \"Incurrence-Based Amounts\" reclassified"; "\"automatically and immediately reclassified\" credit agreement"
- Diversifies away from: sole-discretion classify among enumerated baskets only

### 7. SHARED_CAPACITY

- 3 high-scoring SHARED_CAPACITY shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Multi-clause shared pools and external-instrument balance caps
- Search hints: "\"in the aggregate with\" Section permitted indebtedness"; "\"outstanding under\" Indenture cap credit agreement"
- Diversifies away from: single-clause hard caps

### 8. BASKET_FORMULA

- 3 high-scoring BASKET_FORMULA shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Lesser-of / multi-leg formulas and non-EBITDA denominators
- Search hints: "\"lesser of\" \"Consolidated Total Assets\" permitted indebtedness"; "\"sum of\" \"without duplication\" basket credit agreement"
- Diversifies away from: greater-of $X and Y% EBITDA only

### 9. CROSS_DOCUMENT_RESTRICTION

- 3 high-scoring CROSS_DOCUMENT_RESTRICTION shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: Credit agreement caps referencing notes indenture balances / refinancing lineage
- Search hints: "\"Incurred pursuant to any Credit Facility\" maximum aggregate principal indenture"; "refinancing indebtedness redesignated credit agreement"
- Diversifies away from: intra-agreement baskets only

### 10. INTERCREDITOR_LIMITATION

- 3 high-scoring INTERCREDITOR_LIMITATION shapes have zero corpus signature support; acquire diversified public exemplars before treating lexical lookalikes as covered.
- Target shape: ABL/Term split-priority, standstill, payments-over, DIP subordination
- Search hints: "ABL Intercreditor Agreement standstill exhibit"; "\"Payments Over\" intercreditor agreement 8-K"; "Junior Lien Intercreditor Agreement release of liens"
- Diversifies away from: credit-agreement-only lien permissions without ICA text

## Guardrails honored

- No production legal-rule edits
- No paid calls / merges / certification changes
- Embedding similarity never used as semantic equivalence

