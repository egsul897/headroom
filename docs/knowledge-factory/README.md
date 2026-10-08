# Covenant Knowledge Factory

Additive, Cursor-owned workstream to build the cheapest legally defensible, continuously expandable covenant knowledge database.

## Principles

- Ingest and preserve source documents independently of semantic compiler certification.
- Deterministic-first: no LLM for tasks that can be completed reliably without one.
- Paid AI providers remain disabled.
- Discovery labels, taxonomy, and pattern similarity are **not** operative legal authority.
- Deterministic validation ≠ legal certification; reviewer/certification states are never invented.
- Bulk document bytes stay out of Git (`.local-knowledge-corpus/`).
- Do not modify sealed evidence or Claude-owned acceptance gates.
- Do not replace the production covenant compiler.

## Layout

| Path | Role |
|---|---|
| `lib/knowledge-factory/` | EDGAR client, classifier, ranking, taxonomy, patterns, pipeline, search, cost, safety |
| `prisma/migrations/20261008220000_knowledge_factory_foundation/` | Additive registry tables |
| `scripts/knowledge-factory/` | Discover / download / parse / index / refresh / audit / query / estimate |
| `tests/knowledge-factory/` | Unit + fixture pipeline tests |
| `.local-knowledge-corpus/` | Local bytes, cache, checkpoints, manifests (gitignored) |
| `docs/knowledge-factory/manifests/` | Git-safe stats / audit / economics manifests |

## Reproducible commands

```bash
# Deterministic fixture corpus (no network)
npx tsx scripts/knowledge-factory/ingest-fixtures.ts

# Rebuild indexes / queues / audits
npx tsx scripts/knowledge-factory/build-index.ts
npx tsx scripts/knowledge-factory/audit-corpus.ts
npx tsx scripts/knowledge-factory/estimate-costs.ts

# Query source-backed examples
npx tsx scripts/knowledge-factory/query-examples.ts --named
npx tsx scripts/knowledge-factory/query-examples.ts --family INDEBTEDNESS

# Live SEC EDGAR (rate-limited; identifying User-Agent required)
npx tsx scripts/knowledge-factory/discover-documents.ts --ticker AAL --limit 30
npx tsx scripts/knowledge-factory/download-documents.ts --ticker AAL --max 3
npx tsx scripts/knowledge-factory/download-documents.ts --pilot --issuers 20 --max-per-issuer 2
npx tsx scripts/knowledge-factory/refresh-corpus.ts --tickers AAL,F --max 2

# Focused tests
npx vitest run tests/knowledge-factory
npx tsc --noEmit
```

## Representation levels

`SOURCE_ONLY` → `STRUCTURALLY_INDEXED` → `DISCOVERED_CANDIDATE` → `SEMANTIC_HYPOTHESIS` → `DETERMINISTICALLY_VALIDATED` → `REVIEW_REQUIRED` → `REVIEWER_VERIFIED` → `CERTIFIED`

Automated pipelines stop at or before `DETERMINISTICALLY_VALIDATED` / `REVIEW_REQUIRED`. They never invent `REVIEWER_VERIFIED` or `CERTIFIED`.

## Relation to existing Headroom

- Reuses `parseDocumentStructureWithTriage` / `buildStructuralIndex` for structure.
- Reuses `parseDocument` for HTML/PDF/TXT extraction.
- Extends (does not replace) `lib/connectors/edgar-connector.ts` company onboarding.
- Optional FK links to `Company` / document / source-artifact ids when converging with onboarding.
- Never writes `Permission`, `SharedCapacityConstraint`, or other capacity-rule tables.
