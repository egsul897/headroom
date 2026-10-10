# Agent 1 — Cycle 2 Corpus & Mechanics Report

Generated: 2026-10-09T22:21:46.823Z

## Neon inventory (read-only)

| Metric | Value |
|---|---:|
| KnowledgeSources (total) | 730 |
| PUBLIC_SEC_EDGAR | 681 |
| DocumentByteObjects | 711 |
| Distinct issuers | 200 |
| Distinct byte hashes | 681 |
| Duplicate-hash groups | 0 |
| V2 summaries | 630 |
| Covenant summary items | 28831 |

### Representation levels
```
{
  "STRUCTURALLY_INDEXED": 60,
  "DISCOVERED_CANDIDATE": 670
}
```

### Document class (public)
```
{
  "INDENTURE": 58,
  "TERM_LOAN_AGREEMENT": 12,
  "ABL_AGREEMENT": 1,
  "RESTATEMENT": 93,
  "WAIVER": 1,
  "SUPPLEMENTAL_INDENTURE": 93,
  "UNKNOWN": 180,
  "OTHER_DEBT_RELATED": 35,
  "CREDIT_AGREEMENT": 110,
  "INTERCREDITOR_AGREEMENT": 3,
  "GUARANTEE_AGREEMENT": 3,
  "AMENDMENT": 57,
  "REVOLVING_CREDIT_AGREEMENT": 9,
  "SECURITY_AGREEMENT": 26
}
```

## Dedup / instrument identity

- Missing instrumentIdentity: **671**
- Distinct identities after dry-run backfill: **674**
- Duplicate byte-hash groups retained (version history not collapsed): **0**

## UNKNOWN reclassify (dry-run)

- Scanned UNKNOWN: **180**
- Reclassable without bytes: **13**
- Targets: `{"CREDIT_AGREEMENT":4,"INDENTURE":5,"RESTATEMENT":3,"TERM_LOAN_AGREEMENT":1}`

## Mechanic coverage (BYTEA sample n=80)

Newly represented discovery patterns: anti-stacking, grower-basket, lesser-of-basket, aggregate-ceiling

| Pattern | Docs (sample) |
|---|---:|
| fixed-dollar-basket | 58 |
| no-default-condition | 39 |
| shared-capacity | 34 |
| refinancing-debt | 30 |
| anti-stacking | 29 |
| greater-of-basket | 28 |
| ratio-basket | 24 |
| aggregate-ceiling | 23 |
| permitted-liens | 18 |
| reclassification | 12 |
| lesser-of-basket | 11 |
| grower-basket | 11 |
| conditional-amendment-effectiveness | 11 |
| general-debt-basket | 8 |
| purchase-money-debt | 8 |
| acquisition-debt | 7 |
| liability-management | 7 |
| builder-basket | 5 |
| asset-sale-reinvestment | 4 |
| incremental-equivalent-debt | 2 |
| pro-forma-compliance | 2 |
| subsidiary-designation | 2 |
| financial-covenant-cure | 1 |
| restricted-payment-builder | 1 |

Shared-capacity relationship hits: **34**  
Aggregate-ceiling-only (not shared): **23**

## Populations preserved

| Package | Population |
|---|---|
| fwrg-2021-credit-agreement | DEVELOPMENT |
| lsb-2023-abl-credit-agreement | DEVELOPMENT |
| conmed-2025-credit-facility | DEVELOPMENT |
| dsgr-2022-2025-credit-facility | REGRESSION |
| chwy-2026-credit-agreement | REGRESSION |
| riot-2025-2026-credit-facility | REGRESSION |
| final-lightweight-unseen-sup | REGRESSION |
| gibraltar-2026-credit-agreement | HOLDOUT_DEVELOPMENT |
| knife-river-blind | HOLDOUT_BLIND |

## Holdout evaluation (CKG)

| Metric | Before | After |
|---|---:|---:|
| shared_capacity_recognition | 33.3% (1/3) | **100% (3/3)** |
| false_permission_rate (incidence) | 50.0% | 50.0% (unchanged synthetic control) |
| Paid calls | 0 | 0 |

Gibraltar false-positive control and Superior multi-clause EBITDA add-back cap both pass after the generalizable shared-capacity detector fix.

## Costs

- Paid inference: **$0**
- Neon mutations: **0**

## Guardrails

- DISCOVERED ≠ VERIFIED ≠ CERTIFIED
- Precedent ≠ operative authority
- Bare aggregate amount ≠ shared capacity
