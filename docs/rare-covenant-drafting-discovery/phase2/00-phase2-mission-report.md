# Rare Drafting Discovery Phase 2 — Validated Novelty

Starting SHA: `6c9e8a65c9cbac50c922c0d4ec4a91611957fdbb`
Exact HEAD: `1b6b291daadae7dd074626f2e09d1a3c192db7e2`
Version: rare-covenant-drafting-discovery.phase2.v1
Paid calls: 0
Production legal rules modified: false
Claude-owned fixtures modified: false

## 1. New authentic agreements and issuers

Acquired via existing `EdgarConnector` (not a new downloader): **100** agreements across **38** issuers (target 100; subject to SEC availability / fair-access). Acquisition errors: 0.

- `LUV` SOUTHWEST AIRLINES CO — 10-Q (filed 2026-07-23) — EX-10.2 INCREASE JOINDER AGREEMENT NO. 1 AND FIRST AMENDMENT TO CREDIT AGR (2026-07-23)
- `LYV` Live Nation Entertainment, Inc. — 10-Q (filed 2026-07-30) — EX-10.2 MASTER TRUST INDENTURE (2026-07-30)
- `AAL` AAL — 8-K 8-K - 11.8.19 - 2019 AMENDMENTS TO REVOLVING CREDIT AGREEMENTS (2019-11-08)
- `MATW` MATW — 8-K EX-10.1 FIFTH AMENDMENT TO THE THIRD AMENDED AND RESTATED LOAN AGREEMENT (2024-02-05)
- `ADX` ADX — 8-K/A AMENDED AND RESTATED BYLAWS OF ADAMS DIVERSIFIED EQUITY FUND, INC., EFFECTIVE JU (2024-06-07)
- `BKTI` BKTI — 8-K CREDIT AGREEMENT (2020-01-30)
- `LUV` LUV — 8-K FORM 8K 364-DAY CREDIT AGREEMENT (2020-03-16)
- `LUV` LUV — 8-K EXHIBIT 10.1 364-DAY CREDIT AGREEMENT (2020-03-16)
- `MATW` MATW — 8-K EXHIBIT 10.1 THIRD AMENDED AND RESTATED LOAN AGREEMENT (2020-03-30)
- `MATW` MATW — 8-K EXHIBIT 10.1 FIRST AMENDMENT TO SECOND AMENDED AND RESTATED LOAN AGREEMENT (2017-11-22)
- `RCL` RCL — 8-K SENIOR GUARANTEED NOTES INDENTURE (2022-10-06)
- `CNMD` CNMD — 8-K FIRST OMNIBUS AMENDMENT AND INCREASED FACILITY ACTIVATION NOTICE, DATED AS OF MA (2026-06-01)
- `MATW` MATW — 8-K EXHIBIT 10.1 SECOND AMENDED AND RESTATED LOAN AGREEMENT (2016-04-28)
- `RCL` RCL — 8-K SENIOR SECURED NOTES INDENTURE (2022-10-06)
- `HLT` HLT — 8-K EX-4.1 (2021-02-04)
- `DAL` DAL — 8-K EX-10.1 AMENDED AND RESTATED SECURED SUPER-PRIORTY DEBTOR IN POSSESSION CREDIT A (2006-03-31)
- `MATW` MATW — 8-K EXHIBIT 10.1 RESTATED LOAN AGREEMENT DATED JULY 18, 2013 (2013-07-22)
- `UHAL` UHAL — 8-K SERIES UIC-02A SECOND SUPPLEMENTAL INDENTURE, DATED FEBRUARY 17, 2011, BY AND BE (2011-02-22)
- `UHAL` UHAL — 8-K SERIES UIC-01A FIRST SUPPLEMENTAL INDENTURE, DATED FEBRUARY 17, 2011, BY AND BET (2011-02-22)
- `ALCO` ALCO — 8-K CREDIT AGREEMENT (2010-09-09)
- `MATW` MATW — 8-K EXHIBIT 10.1 LOAN AGREEMENT DATED DECEMBER 21, 2010 (2010-12-28)
- `WYNN` WYNN — 8-K EXHIBIT 4.2 -- THIRD SUPPLEMENTAL INDENTURE (2010-08-05)
- `UAL` UAL — 8-K AMENDED AND RESTATED REVOLVING CREDIT, TERM LOAN AND GUARANTY AGREEMENT (2007-02-05)
- `HWM` HWM — 8-K TERM CREDIT AGREEMENT, DATED AS OF JULY 10, 2007 (2007-07-10)
- `AMD` AMD — 8-K CREDIT AGREEMENT (2006-10-30)
- … +75 more (see `06-acquired-agreements.json`)

Fixture registry also expanded (paths only, no fixture byte edits): loaded docs=122, missing=0, units corpus/probe=286/8708.

## 2. Balanced novelty metrics

Probe-only signature rates from imbalanced pools are not evidence of market rarity. Prefer equal-sized split metrics and leave-one-out rates below.

| Metric | Value |
| --- | ---: |
| Equal-sized splits | 8 |
| Probe-only rate mean ± std | 0.7712 ± 0.0227 |
| Mean top novelty score mean ± std | 0.9406 ± 0.0127 |
| Leave-one-issuer-out rows | 43 |
| Leave-one-instrument-out rows | 43 |

Sample-size sensitivity:
- n=40: probeOnlyRateMean=0.8449, meanTopScoreMean=0.8944
- n=80: probeOnlyRateMean=0.7694, meanTopScoreMean=0.9166
- n=120: probeOnlyRateMean=0.8179, meanTopScoreMean=0.9356
- n=160: probeOnlyRateMean=0.7621, meanTopScoreMean=0.9295
- n=200: probeOnlyRateMean=0.7482, meanTopScoreMean=0.9424

## 3. Reviewed findings

Stratified sample of 20 / 40 queue items.

- GENUINELY_UNFAMILIAR_SHAPE: 1
- FAMILIAR_SHAPE_DIFFERENT_WORDING: 0
- DUPLICATE_OR_EXTRACTION_ARTIFACT: 3
- POTENTIALLY_MATERIAL_LEGAL_VARIATION: 10
- UNRESOLVED_MISSING_CONTEXT: 6
- Confirmed legal defects: **0** (heuristic labels are not treated as confirmed defects)

7. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=AMENDMENT_BYPASS confirmed=null ctx=COMPLETE — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:686260-687659`
17. UNRESOLVED_MISSING_CONTEXT — heuristic=AMENDMENT_BYPASS confirmed=null ctx=CONTEXT_INCOMPLETE — `data/rare-covenant-drafting-discovery/extracted-text/jblu-000094787122001095-ss1446904_ex1001.htm.txt:413091-414382`
8. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=CAPACITY_UNDERSTATEMENT confirmed=null ctx=COMPLETE — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt:542411-543809`
18. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=CAPACITY_UNDERSTATEMENT confirmed=null ctx=COMPLETE — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:629864-631035`
9. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=FALSE_PERMISSION confirmed=null ctx=COMPLETE — `data/rare-covenant-drafting-discovery/extracted-text/amd-000119312512357533-d397602dex41.htm.txt:166057-167455`
19. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=CAPACITY_OVERSTATEMENT confirmed=null ctx=COMPLETE — `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt:525229-526342`
4. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=CROSS_INSTRUMENT_SILENCE confirmed=null ctx=COMPLETE — `data/rare-covenant-drafting-discovery/extracted-text/lyv-000133525826000035-lyv-20260630xex102xmastert.htm.txt:463601-464999`
14. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=CROSS_INSTRUMENT_SILENCE confirmed=null ctx=COMPLETE — `data/rare-covenant-drafting-discovery/extracted-text/amd-000119312504183871-dex41.htm.txt:132335-133733`
10. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=FALSE_PERMISSION confirmed=null ctx=COMPLETE — `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt:63227-64625`
20. POTENTIALLY_MATERIAL_LEGAL_VARIATION — heuristic=FALSE_PERMISSION confirmed=null ctx=COMPLETE — `data/rare-covenant-drafting-discovery/extracted-text/wynn-000134100410001346-ex4_1.htm.txt:19126-20524`
6. UNRESOLVED_MISSING_CONTEXT — heuristic=SCOPE_MISBIND confirmed=null ctx=CONTEXT_INCOMPLETE — `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt:228253-229652`
16. DUPLICATE_OR_EXTRACTION_ARTIFACT — heuristic=SCOPE_MISBIND confirmed=false ctx=COMPLETE — `data/rare-covenant-drafting-discovery/extracted-text/rcl-000110465922106834-tm2227571d1_ex4-1.htm.txt:158535-159934`

## 4. Confirmed extraction artifacts

- `novelty:c8a36a8ab08ed3ac0ff37181`
- `novelty:01ae8eafa800d2fb25f50927`
- `novelty:58f3a268bc892375aa0901ef`

## 5. Context-incomplete findings

Count: 26
- `novelty:04634969e2db8223d0a1fe82`
- `novelty:054700f3759cce662e28b1b4`
- `novelty:0920352660536d7555e9c7e5`
- `novelty:0aeca535057f66cbbbc4efcf`
- `novelty:0e752612424d0a44b32f22ab`
- `novelty:10a4586f76aedd622b71271e`
- `novelty:153df828dc8c90ca345aee84`
- `novelty:16b464be29795ef8a444bf50`
- `novelty:2488b7f20fd6b506555832eb`
- `novelty:466cff7dad941899eba7aba2`
- `novelty:8164072432127402501caa80`
- `novelty:b8ad21cdd9ea07a725713018`
- `novelty:ec03258c560657f248d65901`
- `novelty:f73daed2d607ce9547def6cc`
- `novelty:73c56b8602d13b90744d045d`
- `novelty:4f41c907788b6b25e9c04da5`
- `novelty:8ff5ab05136677c85efb64e8`
- `novelty:b7d38ec1b1ed4ea4e2735b16`
- `novelty:50900762ad7774b4ee2a730b`
- `novelty:3c6b16cb49c198e99400b0cd`

## 6. High-risk drafting examples

### AUTOMATIC_RECLASSIFICATION
- Finding `novelty:58f3a268bc892375aa0901ef` @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:392532-393651`
- Context: COMPLETE
- Hypothesis: Automatic or Fixed/Incurrence reclassification can expand usable capacity if the engine treats baskets as static silos.
- Uncertainty: Not a certified legal defect; extraction_window_quality
- Counterexamples: 2

### SHARED_BASKET_CAPACITY
- Finding `novelty:04634969e2db8223d0a1fe82` @ `data/rare-covenant-drafting-discovery/extracted-text/matw-000006329610000089-exhibit10-1loanagrmt12212010.htm.txt:176367-177420`
- Context: CONTEXT_INCOMPLETE
- Hypothesis: Shared-capacity drafting can be missed when each named clause is compiled as an independent basket.
- Uncertainty: Not a certified legal defect; missing:window_offset_unverified,parent_prohibition,chapeau,defined_term_bodies; controlling_context_incomplete
- Counterexamples: 2

### ENTITY_SPECIFIC_SUBLIMIT
- Finding `novelty:8164072432127402501caa80` @ `tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt:228253-229652`
- Context: CONTEXT_INCOMPLETE
- Hypothesis: Entity-scope narrowing (non-loan party / foreign / unrestricted) can disappear into borrower-group defaults.
- Uncertainty: Not a certified legal defect; missing:window_offset_unverified,defined_term_bodies; controlling_context_incomplete
- Counterexamples: 2

### HANGING_PROVISO
- Finding `novelty:01ae8eafa800d2fb25f50927` @ `data/rare-covenant-drafting-discovery/extracted-text/uhal-000000445705000017-creditagreement1.htm.txt:69191-70308`
- Context: COMPLETE
- Hypothesis: Permission lead-in with trailing proviso/step-up limits is a classic false-permission pattern if the proviso is dropped.
- Uncertainty: Not a certified legal defect; missing:chapeau; extraction_window_quality
- Counterexamples: 2

### CROSS_DOCUMENT_RESTRICTION
- Finding `novelty:43a35ed7388b2245661af583` @ `data/rare-covenant-drafting-discovery/extracted-text/lyv-000133525826000035-lyv-20260630xex102xmastert.htm.txt:463601-464999`
- Context: COMPLETE
- Hypothesis: Cross-document cap or refinancing-lineage limits are invisible to single-agreement compilers.
- Uncertainty: Not a certified legal defect; missing:defined_term_bodies; shape_rare_in_balanced_corpus_but_legal_effect_unverified
- Counterexamples: 2

### AMENDMENT_CONSENT
- Finding `novelty:09499d876dd74df1df2480f8` @ `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt:686260-687659`
- Context: COMPLETE
- Hypothesis: Sacred-right / affected-lender / yank-a-bank mechanics can be missed by Required-Lender-only amendment models.
- Uncertainty: Not a certified legal defect; shape_rare_in_balanced_corpus_but_legal_effect_unverified
- Counterexamples: 2

### INTERCREDITOR_PAYMENT
- Finding `novelty:33cd3d6b92c696a776265329` @ `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt:847553-848951`
- Context: PARTIAL
- Hypothesis: Intercreditor limitations restrict enforcement/priority even when the credit agreement appears to permit the lien.
- Uncertainty: Not a certified legal defect; missing:parent_prohibition,chapeau; unfamiliar_shape_partial_context
- Counterexamples: 2

### COMPARATOR_THRESHOLD
- Finding `novelty:17b733533d3240765f3e694c` @ `tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt:542411-543809`
- Context: COMPLETE
- Hypothesis: Unusual basket formulas risk under-counting available capacity or ignoring builder components.
- Uncertainty: Not a certified legal defect; missing:chapeau; shape_rare_in_balanced_corpus_but_legal_effect_unverified
- Counterexamples: 2

### FINANCIAL_DEFINITION_CHANGE
- Finding `novelty:00d45f5d6245e3dc1b4ed722` @ `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt:63227-64625`
- Context: COMPLETE
- Hypothesis: Definitional notwithstanding/proviso can silently expand a defined set (e.g. Cash Equivalents) beyond the enumerated limbs.
- Uncertainty: Not a certified legal defect; missing:defined_term_bodies; shape_rare_in_balanced_corpus_but_legal_effect_unverified
- Counterexamples: 2

### NONOBVIOUS_EXCEPTION_NESTING
- Finding `novelty:161f57fc2d7ddcf19fc6eb26` @ `data/rare-covenant-drafting-discovery/extracted-text/amd-000119312512357533-d397602dex41.htm.txt:166057-167455`
- Context: COMPLETE
- Hypothesis: Covenant structure with permission override + proviso risks compiling the override without the limiting limbs.
- Uncertainty: Not a certified legal defect; shape_rare_in_balanced_corpus_but_legal_effect_unverified
- Counterexamples: 2

## 7. Knowledge-factory import results

Exported **40** records to `05-knowledge-factory-import.json` using schema `knowledge-factory.novelty-import.v1` (source identity + novelty signature + controlling context + dependencies + risk hypothesis + reviewer status + precedent neighbors + unresolved issues). Representation levels stop at REVIEW_REQUIRED; never invents REVIEWER_VERIFIED/CERTIFIED.

## 8. Exact SHA, tests, and PR status

- Starting SHA: `6c9e8a65c9cbac50c922c0d4ec4a91611957fdbb`
- Exact HEAD at report: `1b6b291daadae7dd074626f2e09d1a3c192db7e2`
- PR: https://github.com/egsul897/headroom/pull/147 (draft; do not merge)
- Tests: `npx vitest run tests/drafting-novelty`

