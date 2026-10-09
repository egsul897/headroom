# Acceptance Handoff — Candidate Tests for Independent Validation

These are **candidate** findings and test ideas for Claude’s independent acceptance process.

**Do not treat this file as modifying Claude-owned acceptance expectations.**

## Candidate regression themes

1. Exhibit 10 without debt title must remain `UNKNOWN` (not auto-classified as credit agreement).
2. Taxonomy / pattern hits must not write `Permission` or capacity rules.
3. Representation level must never become `REVIEWER_VERIFIED` / `CERTIFIED` from automation.
4. Amendment relationships must not be inferred from filing chronology alone.
5. Near-duplicate similarity must not merge distinct instruments.
6. Precedent retrieval must set `replacesVerification: false`.
7. Cost ledger must keep `estimated` vs actual paid spend separated; actual paid AI = $0 unless authorized.
8. Identity tokens (company names, accession numbers, fixture IDs) must not drive classification.

## Source-backed fixture packs (existing repo fixtures)

- `tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/`
- `tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/`
- `tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/`
- `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/`
- `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/`

## Suggested independent checks

```bash
npx vitest run tests/knowledge-factory
npx tsx scripts/knowledge-factory/ingest-fixtures.ts
npx tsx scripts/knowledge-factory/query-examples.ts --named
npx tsx scripts/knowledge-factory/audit-corpus.ts
```

Inspect `docs/knowledge-factory/manifests/` for corpus stats and quality audit outputs after fixture ingest.
