# WS-FDP — Ownership and coordination

**Workstream ID:** `WS-FDP`  
**Name:** Financial definitions precedent / EBITDA & leverage intelligence  
**bcId:** `bc-01a11d8b-e431-7a57-b700-f0b5e1d143af`  
**Branch:** `cursor/financial-definitions-precedent-43af`  
**Base:** `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`

## Exclusive ownership (claimed)

These globs were unassigned in the WS-PAR `01-workstream-map.json` draft at authorship. WS-FDP claims them for this concurrent fleet:

- `docs/financial-definitions-precedent/**`
- `tests/financial-definitions-precedent/**`

WS-PAR may formalize this claim by amending the workstream map; until then peers must treat these paths as owned by WS-FDP.

**Collision check (2026-10-08, after peer branch fetch):** no overlap with peer exclusive trees listed below.

## Must not touch (peer exclusive trees — observed on remote)

### Definition Encyclopedia — [Debt definitions encyclopedia](bc-01a11d88-c6c6-7e7e-bccf-657370092a50)

Branch: `cursor/definition-encyclopedia-2a50`

- `docs/definition-encyclopedia/**`
- `lib/definition-encyclopedia/**`
- `scripts/definition-encyclopedia/**`
- `tests/definition-encyclopedia/**`

### Basket Formula Library — [Covenant basket formula library](bc-01a11d88-e563-798e-a07e-2cdcd60dae51)

Branch: `cursor/covenant-basket-capacity-formula-library-ae51`

- `docs/covenant-basket-capacity-formula-library/**`
- `lib/basket-formula-corpus/**`
- `scripts/basket-formula-corpus/**`
- `tests/basket-formula-corpus/**`
- (planned) `datasets/basket-capacity-formulas/**` if present

### Covenant Knowledge Factory — [Covenant knowledge factory](bc-01a11d83-6b3f-71e1-9438-3e157bb27327)

Branch: `cursor/covenant-knowledge-factory-7327`

- `docs/knowledge-factory/**`
- `lib/knowledge-factory/**`
- `scripts/knowledge-factory/**`
- `tests/knowledge-factory/**`
- KF Prisma migration / additive `prisma/schema.prisma` changes owned by CKF

### Other hard exclusions

- `docs/architecture/parallel-agents/**` (WS-PAR)
- Sealed evidence, certification boards, Claude-owned acceptance fixtures
- Production capacity engine (`lib/covenant-engine.ts`, `lib/solver/**`, `lib/contract-model/runtime/capacity/**`) — consume only
- Phase-4B financial input identity contracts — consume only (`docs/phase-4b/**`, `lib/contract-model/runtime/input/**`)

## Coordination contracts

### Definition Encyclopedia

| Concern | Owner |
| --- | --- |
| General defined-term corpus, term identity, amendment-changed headwords, KF export of definitions | Encyclopedia |
| Calculation mechanics, add-back taxonomy, leverage/coverage tests, missing-input fail-closed rules, condition-vs-capacity negatives for **financial metrics** | **WS-FDP** |

**Observed peer publish (remote tip at coordination refresh):** `docs/definition-encyclopedia/stats.json` reports 120 definition examples / 186 dependency edges; KF export at `docs/definition-encyclopedia/knowledge-factory-export.json` (`schemaVersion` + `definitions[]`).

**Join key (non-authoritative):** `termLabel` + shared fixture `packageId` / encyclopedia source id.  
WS-FDP does **not** assert that encyclopedia term equality implies calculation equality — see `09-mechanic-divergences.json`. Prefer encyclopedia for term identity; prefer FDP for formula / add-back / missing-input executability constraints.

### Basket Formula Library

| Concern | Owner |
| --- | --- |
| Basket/capacity formula taxonomy, permission semantics, reclassification, shared caps, adversarial not-capacity set | Basket library |
| Available Amount / Excess Cash Flow / Retained ECF as **calculation objects** and builder arithmetic inputs | **WS-FDP** |
| Whether an AA/ECF number is affirmative capacity in a given operative rule | Basket library |

**Observed peer publish:** `docs/covenant-basket-capacity-formula-library/export/dataset-manifest.json` (`basket-capacity-formula-corpus.v1`; 55 basket candidates; `productionEngineUntouched: true`). Overlapping fixtures with FDP (CHWY/CONMED/FWRG/GIB/LSB/DSGR) are intentional — different record kinds.

**Handoff interface:** FDP `10-dataset-export.json` records with `kind` ∈ `{BUILDER_OR_POOL}` plus `formulaSketch` / `dependencies`. Basket library owns capacity-computability gates (`capacityBlockedMissingInputs` in their manifest aligns with FDP `MISSING_INPUT:<key>` philosophy).

### Covenant Knowledge Factory

This draft consumes **in-repo unseen-package fixtures only**. Future factory `documentId` / content-hash identifiers can be linked via `sourceId` without forking `fdp.v1`. Do not edit CKF Prisma schema from WS-FDP.

## Published interfaces (consumable now)

1. `01-schema.json` — entry shape + `MISSING_INPUT:<key>` rule  
2. `10-dataset-export.json` — compact records for joins  
3. `03-calculation-dependency-graph.json` — dependency + non-equivalence edges  
4. `06-missing-financial-inputs.json` — required attested inputs for executability  
5. `13-data-production-checkpoint.json` — measured vs out-of-scope production metrics  

## Anti-patterns (normative for consumers)

1. Treating identical `termLabel` strings as interchangeable formulas.  
2. Emitting a numeric leverage/coverage/ECF/AA result when any required input is missing.  
3. Promoting maintenance-test thresholds or Payment Conditions ratio gates into baskets.  
4. Silently certifying AI-generated interpretations of open `07-unresolved-interpretation-queue.json` items.  
5. Treating BTC/margin **Cure Amount** labels as equity cures for EBITDA covenants (see Riot negative example).
