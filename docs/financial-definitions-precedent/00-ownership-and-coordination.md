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

## Must not touch

- Definition Encyclopedia production trees once published (expected under that agent’s exclusive docs/lib paths — currently forming; do not preempt).
- Basket Formula Library production trees once published.
- `docs/covenant-knowledge-factory/**`, `lib/covenant-knowledge/**` (WS-CKF).
- `docs/architecture/parallel-agents/**` (WS-PAR).
- Sealed evidence, certification boards, Claude-owned acceptance fixtures.
- Production capacity engine (`lib/covenant-engine.ts`, `lib/solver/**`) — consume contracts only.
- Phase-4B financial input identity contracts — consume only (`docs/phase-4b/**`, `lib/contract-model/runtime/input/**`).

## Coordination contracts

### Definition Encyclopedia (`bc-01a11d88-c6c6-7e7e-bccf-657370092a50`)

| Concern | Owner |
| --- | --- |
| General defined-term corpus, term identity, amendment-changed headwords across all covenant families | Encyclopedia |
| Calculation mechanics, add-back taxonomy, leverage/coverage tests, missing-input fail-closed rules, condition-vs-capacity negatives for **financial metrics** | **WS-FDP** |

**Join key (non-authoritative):** `termLabel` + `sourceId` / future encyclopedia `definitionExampleId`.  
WS-FDP does **not** assert that encyclopedia term equality implies calculation equality — see `09-mechanic-divergences.json`.

### Basket Formula Library (`bc-01a11d88-e563-798e-a07e-2cdcd60dae51`)

| Concern | Owner |
| --- | --- |
| Basket/capacity formula taxonomy, permission semantics, reclassification, shared caps | Basket library |
| Available Amount / Excess Cash Flow / Retained ECF as **calculation objects** and builder arithmetic inputs | **WS-FDP** |
| Whether an AA/ECF number is affirmative capacity in a given operative rule | Basket library |

**Handoff interface:** `10-dataset-export.json` records with `kind` ∈ `{BUILDER_OR_POOL}` plus `formulaSketch` / `dependencies`. Basket library should not re-derive EBITDA component graphs from scratch when an FDP entry exists; FDP should not classify builder usage as permission without basket-library semantics.

### Covenant Knowledge Factory (`bc-01a11d83-6b3f-71e1-9438-3e157bb27327`)

This draft consumes **in-repo unseen-package fixtures only**. Future factory `documentId` / content-hash identifiers can be linked via `sourceId` without forking `fdp.v1`.

## Published interfaces (consumable now)

1. `01-schema.json` — entry shape + `MISSING_INPUT:<key>` rule  
2. `10-dataset-export.json` — compact records for joins  
3. `03-calculation-dependency-graph.json` — dependency + non-equivalence edges  
4. `06-missing-financial-inputs.json` — required attested inputs for executability  

## Anti-patterns (normative for consumers)

1. Treating identical `termLabel` strings as interchangeable formulas.  
2. Emitting a numeric leverage/coverage/ECF/AA result when any required input is missing.  
3. Promoting maintenance-test thresholds or Payment Conditions ratio gates into baskets.  
4. Silently certifying AI-generated interpretations of open `07-unresolved-interpretation-queue.json` items.
