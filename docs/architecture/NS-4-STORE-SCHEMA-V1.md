# NS-4 store schema v1 (intended durable tables)

**Note:** Slice 1 ships the TypeScript in-memory store + this draft. Models are **not** yet merged into `prisma/schema.prisma` to avoid a fragile migration in parallel with Phase 3 work. Names are deliberately distinct from legacy `FinancialSnapshot` / `financial_snapshots`.

See also: `lib/contract-model/runtime/input/store/prisma-schema-draft.prisma`.

## Tables

| Model | Table | Role |
| --- | --- | --- |
| `ContractInputSnapshot` | `contract_input_snapshots` | Current materialization row (or latest projection) keyed by `snapshotId` |
| `ContractInputFact` | `contract_input_facts` | One row per `FinancialInput` in a snapshot (JSON identity/value OK for v1) |
| `ContractInputFactLocator` | `contract_input_fact_locators` | Optional source-location join (slice 2+) |
| `ContractInputSnapshotEvent` | `contract_input_snapshot_events` | Append-only event log (`SNAPSHOT_APPENDED` / `APPROVED` / `SUPERSEDED`) |

## Required columns (snapshot)

- `snapshotId` (unique), `companyId`, `status`, `supersedesSnapshotId`, `version`, `approvalRef` (nullable until approved)
- Complex identity / scope / period / as-of / inputs may be JSON in v1 for speed

## Invariants

- Event log is append-only; never update/delete event rows.
- Materialization is derived from events (or rewritten only as a projection of the log).
- Legacy `FinancialSnapshot` (bare Decimal fields) remains untouched.
