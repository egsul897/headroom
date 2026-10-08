# Covenant Precedent Research Interface

CLI-first research surface over Headroom’s source-backed covenant knowledge
corpus. Hybrid **lexical + structural** retrieval only — no paid vector
infrastructure.

## What it returns

Each hit includes:

- Exact source excerpt (never a paraphrase layer)
- Filing URL / accession / filed date when known
- Issuer and instrument identity
- Covenant family and rule type
- Operative-version status
- Relevant definitions
- Related conditions
- Amendment relationships
- Verification status

Every response carries an explicit disclaimer: results are **not** legal
opinions and **not** approved capacity.

## Reuse

| Existing piece | How reused |
|---|---|
| `SemanticTruthRecord` (+ Company) | Optional `--from-db` projection into the same entry schema |
| Phase 3D signature/feature scoring pattern | Structural feature overlap (no embeddings) |
| Package fixture source text / EDGAR URLs | Curated research corpus excerpts pinned under `tests/fixtures/covenant-research/` |
| CovenantFamily / condition-type vocabulary | Shared enums / string unions from the contract model |

## CLI

```bash
npx tsx scripts/covenant-precedent-research.ts \
  "Find credit agreements with a $25 million general debt basket"

npx tsx scripts/covenant-precedent-research.ts \
  --issuer DSGR --family INDEBTEDNESS --amount 25000000 --json

npx tsx scripts/covenant-precedent-research.ts \
  --operative-only --date-from 2021-01-01 --date-to 2025-12-31 \
  "springing leverage covenants"
```

npm alias: `npm run research:covenant -- "<query>"`.

## Tests

- `tests/covenant-research/source-correctness.test.ts`
- `tests/covenant-research/search-relevance.test.ts`
- `tests/covenant-research/unsupported-refusal.test.ts`

## Phase 2

- `--phase2-corpus` builds curated + DSGR/CHWY/CONMED/FWRG/LSB/RIOT discovery + compiled-IR ingest with identity dedupe
- `--as-of` / `--operative-only` amendment-aware retrieval
- `--report-corpus` / `--eval-held-out` for measured corpus + held-out metrics
- Knowledge-factory probe reports blockers when canonical exports are absent
- See `docs/covenant-precedent-research-phase2-report.md`

## Out of scope

- Paid embedding / vector DB
- UI integration (secondary; CLI is the primary surface)
- Certification / merge changes / production legal-rule edits
- Capacity computation or Ask-Headroom transaction answers
