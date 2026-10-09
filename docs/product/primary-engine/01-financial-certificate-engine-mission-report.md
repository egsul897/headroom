# Agent 2 — Financial and Compliance Certificate Engine

**Mission:** Make Headroom reliably ingest, reconcile, and use company financial statements and officer/compliance certificates.  
**Branch:** `cursor/financial-certificate-engine-8d31`  
**PR:** https://github.com/egsul897/headroom/pull/220  
**SHA:** `0e1f17081d106b596598ae733fc9f6eef24bdc21`  
**Cost:** $0 paid inference (deterministic extraction; no provider calls).

---

## Existing capabilities reused

| Component | Role |
|---|---|
| `lib/onboarding/financial-facts-from-document.ts` | Propose path now delegates to FCE extract |
| `lib/onboarding/promotion.ts` + `FINANCIAL_METRIC_FIELD_MAP` | Attributable promotion into legacy snapshot/state |
| `lib/onboarding/ns4-financial-persist.ts` | Pattern for NS-4 propose→approve |
| `lib/contract-model/runtime/input/store/certificate/**` | NS-4 propose / attributable approve |
| `lib/connectors/units.ts` + `reconciliation.ts` | Unit normalize; multi-source fact reconcile (unchanged) |
| `lib/financial-core/solver-adapter.ts` | `projectToLegacySnapshot` prefers covenant EBITDA |
| `lib/product/customer-intelligence/capacity-readiness.ts` | Position/capacity readiness over FinancialState + NS-4 |
| Prisma `ContractInputSnapshot` / Neon | Persistence for proposed snapshots |

**Not rebuilt:** NS-4 store, promotion transaction, CSV connector, covenant engine, Phase 3 IR.

---

## Authentic source coverage

| Source | Period | Role | Notes |
|---|---|---|---|
| Matthews International (MATW) | 2024-12-31 (Q1 FY2025) | 10-Q style statement + compliance certificate | Figures from `scripts/populate-matthews-financial-provenance.ts` / EDGAR accession `0000063296-25-000006` |
| Coherent Corp. (seed) | 2026-06-30 (FY2026) | 10-K style statement + certificate | Aligns with `prisma/seed-data.ts` `COHERENT_DATA.financials`; GAAP EBITDA omitted (honest) |
| `SYNTHETIC_CALCULATION_TEST` | 2026-06-30 / stale 2024-01-31 | Calculation tests only | Explicitly labeled; debt mismatch + stale period |

---

## Extraction accuracy (demonstrated)

- Issuer, obligor group, reporting period, fiscal date, currency, document role identified (Matthews / Coherent).
- GAAP EBITDA **77.675** vs Consolidated EBITDA **128.313** (Matthews) — distinct families.
- Certificate addbacks, footnotes, and `"Consolidated EBITDA" means…` definition excerpts preserved with source locators.
- Ratios, assumed new-debt rate, debt/cash/interest extracted when labeled with units.
- Unit-less or conflicting amounts skipped (never invented).

---

## Reconciliation accuracy (demonstrated)

| Case | Result |
|---|---|
| Matching total debt / cash (Matthews, Coherent) | `MATCH` |
| GAAP vs contractual EBITDA | `GAAP_VS_CONTRACTUAL_EBITDA` (never substituted) |
| Synthetic debt mismatch 400 vs 480 | `MATERIAL_DIFFERENCE` → `REVIEW_REQUIRED` |
| Stale as-of (2024-01-31 vs now 2026-10-09) | `STALE_PERIOD` |
| Statement-only GAAP EBITDA | Capacity `NOT_COMPUTABLE`; missing `covenant_ebitda` |
| Any extraction | Always emits `UNAPPROVED_EXTRACTION` |

---

## Missing inputs (surfaced, not invented)

- `contractual_ebitda` when only GAAP present
- `assumed_new_debt_rate_pct` / builder fields when absent from sources
- `financial_statement` or `compliance_certificate` when one side missing
- `basket_usage_schedule` when baskets referenced without a schedule
- Currency / fiscal date when unparseable

---

## Demonstrated fixes

1. **Certificate ↔ statement reconciler** — new `lib/financial-certificate-engine/reconcile.ts` (audit gap #9).
2. **`FINANCIAL_STATEMENT` DocumentType** — Prisma enum + onboarding upload select.
3. **GAAP vs contractual separation** — `gaap_ebitda` normalizable but **not** in `FINANCIAL_METRIC_FIELD_MAP`.
4. **No auto-approve** — NS-4 propose stays `DRAFT` / `REVIEW_REQUIRED` (integration test).
5. **Capacity bridge** — `projectEngineRunToCapacitySnapshotStrict` + Position leverage from contractual metrics only.

---

## Working financial-to-capacity integration

```
statement + certificate text
  → runFinancialCertificateEngine
  → capacityMetrics (covenant_ebitda preferred)
  → projectEngineRunToCapacitySnapshotStrict → FinancialSnapshotInput
  → buildFinancialStateFromEngineRun → projectToLegacySnapshot (solver boundary)
  → positionLeverageInputsFromEngine → Position/dashboard leverage
  → proposeNs4SnapshotFromEngine → ContractInputSnapshot (REVIEW_REQUIRED/DRAFT)
```

Capacity ebitda for Matthews projection = **128.313** (contractual), not 77.675 (GAAP).  
Coherent projection = **1700** ebitda / TNL ≈ **1.23×** — seed-aligned.

---

## Tests

- `tests/financial-certificate-engine/engine.test.ts` (11)
- `tests/financial-certificate-engine/ns4-propose.test.ts` (1)
- Updated: `tests/connectors/units.test.ts` (gaap_ebitda tripwire)
- Regression: `tests/onboarding/certificate-financial-facts.test.ts`

---

## Module map

```
lib/financial-certificate-engine/
  identity.ts | extract.ts | reconcile.ts | snapshot.ts
  capacity-bridge.ts | pipeline.ts | types.ts | index.ts
  fixtures/   (authentic Matthews, Coherent, synthetic calc)
```
