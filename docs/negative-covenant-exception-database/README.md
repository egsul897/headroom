# Negative Covenant Exception Database

Offline, source-backed research dataset of exceptions, provisos, carve-outs, and
limitations in negative covenants.

**Status:** `OFFLINE_RESEARCH_DATASET` (research milestone — not certified legal interpretation)  
**Phase 2:** see [`phase-2/`](./phase-2/) for classification upgrade, multi-issuer expansion, negative controls, source spans, held-out metrics, and KF import adapter.  
**Production boundary:** must not be imported by `lib/contract-model/**`,
`app/**`, or runtime capacity paths. No paid inference, merges, or certification
advancement.

## What this is

A searchable inventory prioritizing:

| Family | Catalog file |
| --- | --- |
| Debt incurrence | `catalogs/debt-incurrence.json` |
| Liens | `catalogs/liens.json` |
| Restricted payments | `catalogs/restricted-payments.json` |
| Investments | `catalogs/investments.json` |
| Asset sales | `catalogs/asset-sales.json` |
| Affiliate transactions | `catalogs/affiliate-transactions.json` |
| Fundamental changes | `catalogs/fundamental-changes.json` |
| Junior-debt prepayments | `catalogs/junior-debt-prepayments.json` |
| Subsidiary restrictions | `catalogs/subsidiary-restrictions.json` |

Full corpus: `catalogs/exceptions.json`  
Per-source views: `catalogs/source-*.json`

Every exception record preserves:

- Parent prohibition
- Exact exception text
- Structural hierarchy
- Defined terms
- Conditions (with **location**: in-clause vs remote)
- Amounts and ratios
- Entity scope
- Shared-capacity interactions
- Amendments
- Provisos (including hanging / section-wide / notwithstanding)
- Cross-references
- Verification status

**Invariant:** `unconditionalCapacity` is always `false`. A seemingly permissive
exception is never treated as free capacity.

## Sources (sha256-pinned)

| Package | Path |
| --- | --- |
| CONMED 2025 | `tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt` |
| LSB 2023 ABL | `tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt` |
| FWRG 2021 | `tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt` |

See `02-source-manifest.json`.

## Remote-condition focus

Conditions frequently live **outside** the exception’s immediate clause:

- Article-level chapeaux
- Parent-section chapeaux
- Hanging / trailing provisos after enumerated lists
- Section-wide valuation or classify/reclassify paragraphs
- Cross-references to financial covenants / affirmative covenants / sibling NC
- Defined-term gates (`Payment Conditions`, `Available Amount`, `Permitted X`)
- Notwithstanding clauses that import external instruments

Indexes in `catalogs/exceptions.json`:

- `indexes.remoteConditionExceptionIds`
- `indexes.hangingOrSectionWideProvisoIds`
- `indexes.seeminglyPermissiveButConstrainedIds`

Structural pattern map: `structural-patterns/patterns.json`  
Adversarial suite: `adversarial/cases.json`

## Search

Isolated TypeScript search (not wired into the legal engine):

```ts
import { loadExceptionCatalog } from "../../tests/fixtures/negative-covenant-exception-database/loaders";
import { searchExceptions } from "../../tests/fixtures/negative-covenant-exception-database/schema";

const catalog = loadExceptionCatalog();
searchExceptions(catalog, {
  covenantFamily: "RESTRICTED_PAYMENTS",
  hasRemoteConditions: true,
  text: "Payment Conditions",
});
```

Useful filters: `hangingProviso`, `sharedCapacity`, `remoteFlagKind`,
`definedTerm`, `sectionRef`, `capacityShape`, `seeminglyPermissiveButConstrained`.

## Regenerate

```bash
python3 scripts/ncedb-generate-catalog.py
```

## Tests

```bash
npx vitest run tests/negative-covenant-exception-database
```

## Artifacts

| File | Purpose |
| --- | --- |
| `00-scope-and-non-goals.json` | Mission scope / hard non-goals |
| `01-field-dictionary.json` | Record field list |
| `02-source-manifest.json` | Pinned sources + counts |
| `90-coverage-matrix.json` | Family / remote / adversarial coverage |
| `99-verdict.json` | Offline readiness verdict |
| `MISSION-REPORT.md` | Copy-ready mission report |
