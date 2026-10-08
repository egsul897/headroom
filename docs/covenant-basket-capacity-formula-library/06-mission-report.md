# HEADROOM — Covenant Basket and Capacity Formula Library

## Verdict

Delivered a source-backed corpus of **55** basket/formula candidates and **12** adversarial examples across **7** public financing-agreement fixtures, covering all **20** required basket families. Every candidate span is grounded in fixture text. **0** candidates are marked capacity-computable because required financial inputs/conditions are not supplied in-corpus. The production capacity engine was not modified.

## Actual source-backed counts

| Metric | Count |
|---|---|
| Basket candidates | **55** |
| Span-grounded candidates | **55** |
| Affirmative capacity semantics | **54** |
| Incomplete semantics (cross-ref only) | **1** |
| Capacity computable | **0** |
| Affirmative but blocked (missing inputs/conditions) | **54** |
| Adversarial examples | **12** |
| Required families covered | **20 / 20** |
| Formula kinds used in candidates | **17** |
| Taxonomy formula kinds defined | **21** |
| Source instruments | **7** |

### Family coverage (primary + secondary tags)

| Family | Mentions |
|---|---|
| FIXED_DOLLAR | 2 |
| GREATER_OF_FIXED_AND_PERCENTAGE | 16 |
| GROWER | 19 |
| RATIO_BASED | 5 |
| AVAILABLE_AMOUNT_BUILDER | 15 |
| CUMULATIVE_CREDIT | 5 |
| EQUITY_CONTRIBUTION | 3 |
| INCREMENTAL_DEBT | 6 |
| REFINANCING | 6 |
| PURCHASE_MONEY | 5 |
| GENERAL_DEBT | 9 |
| GENERAL_LIEN | 5 |
| RESTRICTED_PAYMENT | 7 |
| INVESTMENT | 10 |
| ASSET_SALE_REINVESTMENT | 3 |
| SHARED | 10 |
| RECLASSIFICATION | 8 |
| BASKET_REPLENISHMENT | 7 |
| ANTI_DOUBLE_COUNTING | 8 |
| CROSS_COVENANT_CAPACITY_RESTRICTION | 3 |

### Source instruments

1. Chewy 2026 Credit Agreement (`chwy-2026-credit-agreement`)
2. DSGR 2025 Second A&R Credit Agreement
3. Gibraltar 2026 Credit Agreement
4. CONMED base credit agreement Article VII (curated)
5. LSB 2023 ABL Article VI
6. Superior Industries 2024 A&R Term Loan
7. First Watch 2021 Credit Agreement Article 6

## What was built

- Reusable formula taxonomy (`01-formula-taxonomy.json` + `lib/basket-formula-corpus/taxonomy.ts`)
- Record schema + Zod validators (`02-record-schema.json`, `lib/basket-formula-corpus/schema.ts`)
- Deterministic builder that embeds exact source spans and refuses ungrounded rows (`scripts/basket-formula-corpus/build-corpus.py`)
- Dataset export: `export/basket-candidates.jsonl`, `export/adversarial-examples.jsonl`, `export/formula-taxonomy.json`, `export/dataset-manifest.json`
- Vitest suite grounding every span and enforcing no invented computable capacity

## Adversarial split (examples)

| Role | Example id | Point |
|---|---|---|
| FINANCIAL_MAINTENANCE_TEST | `adv-conmed-maintenance-leverage` | 3.75x CSSLR is a maintenance default test, not incremental room |
| DEFAULT_OR_EVENT_THRESHOLD | `adv-chwy-threshold-amount` | Threshold Amount greater-of is a comparator, not a basket |
| DEFINITION_DE_MINIMIS_EXCLUSION | `adv-chwy-asset-sale-de-minimis` | Asset Sale exclusion threshold ≠ affirmative capacity |
| INTEREST_RATE_FORMULA | `adv-chwy-abr-greater-of-rate` | ABR “greater of” is pricing, not a covenant basket |
| APPROVAL_OR_CONSENT_TRIGGER | `adv-gib-affiliate-transaction-threshold` | Affiliate-transaction process trigger ≠ permission ceiling |
| AFFIRMATIVE_CAPACITY_CONTROL | `adv-control-chwy-general-lien-is-capacity` | True Permitted Liens (21) grower kept on the capacity side |

## Constraints check

| Constraint | Status |
|---|---|
| No production capacity engine changes | Pass — no files under `lib/contract-model/runtime/capacity` or `lib/covenant-engine.ts` touched |
| No paid calls | Pass |
| No merges | Pass |
| No certification changes | Pass |
| No bare-number → permission | Pass — semantics field + adversarial suite |
| No capacity calc without inputs | Pass — `capacityComputable = 0` for all rows |

## Tests

```text
npx vitest run tests/basket-formula-corpus/corpus-validation.test.ts
# 5 passed
```
