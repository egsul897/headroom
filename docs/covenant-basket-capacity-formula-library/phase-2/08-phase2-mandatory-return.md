# Phase 2 mandatory return — Basket Formula Library legal validation

Starting PR: **#148**  
Starting SHA: `26e21e46391cf00948bd4de0972662feb1598b5d`

## 1. New distinct documents and issuers

| Metric | Count |
|---|---|
| EDGAR documents newly acquired (bodies stored under `phase-2/edgar-acquisitions/`) | **13** |
| Distinct EDGAR issuers | **13** |
| Expansion documents considered (fixtures read-only + EDGAR) | **31** (18 fixture extracts + 13 EDGAR) |
| New distinct instruments in Phase-2 candidate set (vs Phase-1’s 7) | **24** |
| New distinct issuers represented in expansion candidates | **19** |
| Target additional agreements | 100 |
| Acquisition vs target | **13 / 100** — limited by EDGAR exhibit availability in the convenience issuer set and keyword/index match yield; mid-cap sweep added 0 further hits after curated URLs |

**Do not claim market prevalence** from this convenience sample.

Claude-owned fixtures: **not modified** (read-only mining + separate EDGAR store).

## 2. Formula candidates by family

Total Phase-2 candidates (Phase-1 retained + expansion): **390**

| Family | Count |
|---|---|
| GREATER_OF_FIXED_AND_PERCENTAGE | 103 |
| ANTI_DOUBLE_COUNTING | 49 |
| INVESTMENT | 40 |
| RATIO_BASED | 37 |
| FIXED_DOLLAR | 37 |
| RESTRICTED_PAYMENT | 34 |
| RECLASSIFICATION | 31 |
| PURCHASE_MONEY | 28 |
| AVAILABLE_AMOUNT_BUILDER | 7 |
| REFINANCING | 4 |
| GENERAL_DEBT | 4 |
| INCREMENTAL_DEBT | 3 |
| BASKET_REPLENISHMENT | 3 |
| EQUITY_CONTRIBUTION | 2 |
| GENERAL_LIEN | 2 |
| ASSET_SALE_REINVESTMENT | 2 |
| GROWER | 1 |
| CROSS_COVENANT_CAPACITY_RESTRICTION | 1 |
| SHARED | 1 |
| CUMULATIVE_CREDIT | 1 |
| **Total** | **390** |

Authoritative machine counts: `docs/covenant-basket-capacity-formula-library/phase-2/08-phase2-counts.json` → `formulaCandidatesByFamily`.

## 3. Independently reviewed classifications

| Metric | Count |
|---|---|
| Stratified independent reviews | **30** |
| Phase-1 affirmative labels inside sample | **29** |
| Probe classes covered | comparator thresholds, conditions precedent, exception framing, ratio tests, shared-capacity sublimits, provisos, forwarding definitions, entity-specific limits, cross-covenant restrictions |

Reviews: `01-affirmative-capacity-audit.json`.

## 4. False affirmative-capacity classifications

| Metric | Value |
|---|---|
| False affirmative count (in sample) | **14** |
| False affirmative rate among sampled Phase-1 affirmatives | **48.3%** |
| Corrected in Phase-2 retained set | yes (`auditCorrection` on affected records) |

False-affirmative IDs include: builder components mislabeled as standalone permissions; anti-double-counting / cross-covenant reduction rules; pure reclassification elections; truncated ratio/definition spans; unlimited RP span missing its leverage gate.

**Source grounding ≠ legal-semantic correctness** — explicit audit finding.

## 5. Source-provenance results

| Metric | Value |
|---|---|
| Normalization version | `whitespace-collapse.v1` |
| Phase-1 spans BYTE_EXACT | **55 / 55** |
| Phase-1 whitespace-normalized | **0** |
| Phase-1 not found | **0** |
| Byte-exact label used for whitespace-only matches | **never** |

Each enriched record carries: `sourceHashSha256`, `extractedSpanHashSha256`, byte/char offsets when byte-exact, `normalizedSpan`, `normalizationVersion`, `matchKind`, `byteExact`.

## 6. Typed formula coverage

| Status | Phase-1 (55) | All (390) |
|---|---|---|
| REPRESENTED | 25 | 205 |
| REVIEW_REQUIRED | 22 | 70 |
| UNSUPPORTED | 8 | 115 |
| Executable | **0** | **0** |

Unsupported/review paths used when assumptions would be required. Currency/units/measurement dates preserved when source-stated.

## 7. Unresolved dependencies

Systems coordinated as **INTERFACE_ONLY** (not present in-repo):

1. Definition Encyclopedia  
2. Dependency Atlas  
3. Negative Covenant Exception Database  
4. Covenant Knowledge Factory  

| Metric | Value |
|---|---|
| Unresolved dependency entries recorded | **795** |
| Formulas marked executable | **0** |

## 8. Adversarial scenario results

| Metric | Value |
|---|---|
| Scenarios | **12** |
| All `PASS_LEGAL_MODEL` | **true** |
| Arithmetic vs legal permission separated | **yes** |

IDs: `sc-fixed-vs-incurrence`, `sc-auto-vs-elected-reclass`, `sc-shared-double-spend`, `sc-available-amount-depletion`, `sc-builder-replenishment`, `sc-ratio-test-failure`, `sc-missing-ebitda`, `sc-currency-mismatch`, `sc-measurement-date-mismatch`, `sc-negative-capacity`, `sc-conditional-permission`, `sc-amendment-changes-formula`.

## 9. Exact SHA, tests, and PR status

| Item | Value |
|---|---|
| Starting SHA | `26e21e46391cf00948bd4de0972662feb1598b5d` |
| Ending SHA (Phase 2 content) | `1f1474c0313718b2346293aff3c1956afa630990` |
| Tests | `npx vitest run tests/basket-formula-corpus/` → **14 passed** |
| PR | https://github.com/egsul897/headroom/pull/148 (draft, updated; **not merged**) |
| Paid inference | none |
| Merges | none |
| Certification changes | none |
| Production capacity-engine edits | none |
| Claude-owned fixture modifications | none |

## Integration

Canonical import contract: `knowledge-factory-import.basket-formula.v1`  
Export: `phase-2/export/phase2-import-records.jsonl`  
Lane: `SOURCE_SUPPORTED_HYPOTHESIS` (separate from reviewer-verified).  
No competing production schema; capacity engine untouched.
