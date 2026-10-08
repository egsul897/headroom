# Covenant Dependency Atlas — Methodology

## Scope

Offline, source-backed dataset of **directed, typed legal dependency edges** among
provisions and definitions for the DSGR 2022–2025 credit-facility package
(Phase-3F ground-truth docs A–D).

## Non-goals / hard constraints

- Do **not** alter the production dependency resolver or compiler
  (`lib/contract-model/runtime/dependency-graph.ts`,
  `lib/contract-model/compiler/semantic/required-dependencies.ts`,
  `lib/contract-model/compiler/stage-dependency-resolution.ts`,
  `lib/contract-model/covenant-map/package-dependencies.ts`).
- No paid inference, merges, or certification changes.
- Do **not** assert legal dependency solely from textual similarity.

## Evidence admission

An edge is admitted only with one of:

| Evidence class | Meaning |
|---|---|
| `EXPLICIT_GROUND_TRUTH_NOTE` | Ground-truth notes explicitly mark SHARED RESOURCE / ENTITY SCOPE / cross-document / reclassification |
| `GROUND_TRUTH_INVENTORY_DECLARATION` | `keyDefinedTerms` / unitType inventory pairing |
| `EXPLICIT_SOURCE_CONNECTIVE` | Legal connective in description/notes (`subject to`, `except as provided in`, compositional `means`/`plus`/`minus`) |
| `AUTHORED_SOURCE_SPAN` | Hand-authored critical overlay with cited excerpt |
| `STRUCTURAL_UNIT_RELATION` | EXCEPTION/CONDITION unit structurally related to a parent covenant/basket |

Bare co-occurrence of capitalized terms is **not** an evidence class.

## Resolution

- `RESOLVED` — target unit/term is inventory-local and uniquely identified
- `UNRESOLVED` — target is outside the document, missing from inventory, or external
- `AMBIGUOUS` — multiple inventory candidates match a citation

Unresolved and ambiguous edges are **preserved**, never dropped.

## Graph motifs

- `DIAMOND_SHARED_DEPENDENCY` — two parents share a child with no cycle (e.g. Available Amount)
- `GENUINE_CYCLE` — directed SCC / self-loop

Fixtures under `tests/fixtures/covenant-dependency-atlas/graph-fixtures/` prove the
distinction.

## Outputs

- `tests/fixtures/covenant-dependency-atlas/export/atlas-dataset.json`
- `tests/fixtures/covenant-dependency-atlas/export/knowledge-factory-dataset.json` (KF-compatible)
- `docs/covenant-dependency-atlas/export/README.md` (pointer to canonical exports)
- `docs/covenant-dependency-atlas/completeness-reports/doc-{a,b,c,d}.json`
- `docs/covenant-dependency-atlas/00-summary.json`

Rebuild:

```bash
npx tsx scripts/covenant-dependency-atlas/build-atlas.ts
```
