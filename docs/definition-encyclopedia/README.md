# Definition Encyclopedia

Source-backed corpus of defined terms from credit agreements and related debt instruments.

- **Schema:** `headroom-definition-encyclopedia.v1`
- **Export kind:** `definition-encyclopedia-corpus` (knowledge-factory compatible)
- **Examples:** 120 (target ≥ 100: **MET**)
- **Sources:** 15
- **Paid inference:** none
- **Foreign schema / certification merges:** none

## Artifacts

| File | Role |
| --- | --- |
| `knowledge-factory-export.json` | Full structured export |
| `definitions.json` | Definition examples only |
| `search-index.jsonl` | Searchable one-record-per-line index |
| `dependency-graph.json` | Cross-definition dependency edges |
| `alternative-formulations.json` | Grouped near-formulations (**not** legal equivalents) |
| `unusual-drafting.json` | Unusual drafting flags |
| `semantic-traps.json` | Semantic trap signals |
| `amendment-changes.json` | Same-term text changes across versions |
| `stats.json` | Counts and coverage |
| `sources.json` | Source identities + content SHA-256 |

## Priority coverage

| Canonical term | Example count |
| --- | ---: |
| Consolidated EBITDA | 8 |
| Consolidated Net Income | 4 |
| Consolidated Total Debt | 3 |
| Consolidated Secured Debt | 5 |
| First Lien Net Leverage Ratio | 5 |
| Total Net Leverage Ratio | 7 |
| Fixed Charge Coverage Ratio | 2 |
| Available Amount | 5 |
| Available Equity Amount | 0 |
| Excess Cash Flow | 4 |
| Permitted Refinancing Indebtedness | 5 |
| Incremental Amount | 4 |
| Restricted Subsidiary | 5 |
| Unrestricted Subsidiary | 5 |
| Loan Party | 11 |
| Material Subsidiary | 9 |
| Permitted Investments | 7 |
| Permitted Liens | 11 |
| Default | 11 |
| Event of Default | 9 |

Missing canonical terms (no independently sourced definition found in catalogued fixtures): Available Equity Amount

## Invariants

1. Every `exactText` is a byte-equal slice of its source at `charStart`.
2. Alternative formulation groups never claim legal equivalence (`equivalenceClaim: false`).
3. No paid model calls in generation.
4. Does not mutate Prisma / DefinedTermNode / certification schemas.
