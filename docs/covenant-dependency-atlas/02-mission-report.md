# Covenant Dependency Atlas — Mission Report

## Verdict

Source-backed dependency atlas built for DSGR docs A–D as an offline dataset
workstream. Knowledge-factory export emitted. Production dependency resolver
and compiler untouched. Zero paid inference. Draft PR separate from certification.

## Counts (package totals)

| Metric | Count |
|---|---|
| Documents | 4 |
| Nodes | 2,490 |
| Edges | 2,310 |
| Resolved | 1,513 |
| Unresolved | 715 |
| Ambiguous | 82 |
| Material diamonds | 175 |
| Genuine cycles | 7 |

### Edges by kind

| Kind | Count |
|---|---|
| COVENANT_TO_DEFINITION | 1,334 |
| DEFINITION_TO_DEFINITION | 362 |
| COVENANT_TO_AMENDMENT | 256 |
| COVENANT_TO_EXCEPTION | 189 |
| COVENANT_TO_CONDITION | 73 |
| RATIO_CALCULATION | 54 |
| FINANCIAL_INPUT | 28 |
| COVENANT_TO_SHARED_BASKET | 8 |
| ENTITY_SCOPE | 4 |
| COVENANT_TO_CROSS_DOCUMENT | 2 |
| RECLASSIFICATION | 0 (explicit gap — no DSGR ground-truth unit records a reclassification right) |

## Completeness (per document)

| Document | Edges | Resolved | Unresolved | Ambiguous | Material diamonds | Cycles | Score | Gaps |
|---|---|---|---|---|---|---|---|---|
| doc-a | 696 | 522 | 160 | 14 | 66 | 4 | 1.0 | 1 (RECLASSIFICATION absent) |
| doc-b | 709 | 475 | 186 | 48 | 18 | 1 | 1.0 | 1 |
| doc-c | 101 | 24 | 77 | 0 | 0 | 0 | 1.0 | 1 |
| doc-d | 804 | 492 | 292 | 20 | 91 | 2 | 1.0 | 1 |

Full machine-readable reports: `docs/covenant-dependency-atlas/completeness-reports/`.

## Graph fixtures

- `diamond-shared-basket.json` — Available Amount shared by 6.04(q) and 6.08(a)(iv); **diamond, not cycle**
- `circular-definitions.json` — Adjusted EBITDA ↔ Consolidated EBITDA; **genuine cycle, not diamond**

## Unresolved relationships

797 unresolved+ambiguous edges preserved in the KF export
(`unresolvedRelationships[]`), including:

- Cross-document Excluded Property → Security Agreements
- Amendment section targets not local to amendment inventories
- Inventory-cited terms without a DEFINITION unit in-document
- Ambiguous multi-unit section citations

## Safety flags (KF export)

```
paidInference: false
merges: false
certificationChanges: false
productionResolverTouched: false
```

## Tests

```
npx vitest run tests/covenant-dependency-atlas
# 3 files, 14 tests — all pass
```

## Rebuild

```
npx tsx scripts/covenant-dependency-atlas/build-atlas.ts
```
