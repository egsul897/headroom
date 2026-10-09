# NS-4 store slice 1 — append-only approved snapshot store

**Status:** implementation slice 1 (schema + write API + supersession / unsafe-graph tests)  
**Charter:** `docs/architecture/NS-4-PARALLEL-CHARTER.md` (ACCEPTED; COO PASS 2026-10-06)  
**Gate:** `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json` → NS-4

## What this slice delivers

1. **In-memory append-only store** under `lib/contract-model/runtime/input/store/` with durable-shaped event log + materialization.
   - **Public façade seal:** `InMemoryApprovedSnapshotStore` exposes only validated APIs (`appendSnapshot`, `approveSnapshot`, getters). Unvalidated `commit` lives on a private composed backend and is not exported. Public `events` / materialization reads return deep-frozen copies (append-only + fail-closed).
2. **Write API**
   - `appendSnapshot` — accepts `DRAFT | REVIEW_REQUIRED` only; refuses `APPROVED` / `SUPERSEDED` on raw append; refuses `approvalRef` on append.
   - `approveSnapshot` — attributable `DRAFT | REVIEW_REQUIRED → APPROVED` with required `reviewedBy`, `reviewedAt`, `approvalRef`.
   - `getSnapshot` / `getSnapshots(companyId)` — read current materialization as Phase 4B `FinancialSnapshot[]`.
3. **Event model**
   - `SNAPSHOT_APPENDED` — immutable proposal row.
   - `SNAPSHOT_APPROVED` — approval transition (status + review fields in materialization).
   - `SNAPSHOT_SUPERSEDED` — emitted when a successor is appended with `supersedesSnapshotId` (predecessor bytes never mutated; status flip is derived).
4. **Unsafe-graph enforcement** — every commit rebuilds the company snapshot set and runs `buildSnapshotGraph` from Phase 4B. The store refuses **all nine** issue codes (stricter than 4B resolve `safe`, which treats some as non-fatal).
5. **Schema intent** — see `docs/architecture/NS-4-STORE-SCHEMA-V1.md` and `lib/contract-model/runtime/input/store/prisma-schema-draft.prisma`. New model names (`ContractInputSnapshot*`) avoid the legacy Prisma `FinancialSnapshot` / `financial_snapshots` surface.

## Soft gates (FAIL if violated)

- Do **not** edit Phase 3 IR / semantic-accountability / stratified-cert / related-series / Pass A/B/C trees.
- Do **not** touch sealed evidence packets.
- Frozen Phase 4B contract only — consume `lib/contract-model/runtime/input/**` types and `buildSnapshotGraph`; do **not** change 4B resolver semantics.
- No ERP / live data / provider calls.
- No Ask Headroom UI.
- Legacy Prisma `FinancialSnapshot` must not be mutated or reused.

## Not in this slice

- ~~Slice 2: synthetic certificate → proposal → APPROVED path.~~ **Landed** — see `NS-4-STORE-SLICE-2.md`.
- ~~Slice 3: loader parity + durable Prisma adapter.~~ **See** `NS-4-STORE-SLICE-3.md` (authorized under #67 soft gates; separate PR from slice 2).

## Test commands

```bash
npx vitest run tests/contract-model/runtime/input/store
npx vitest run tests/contract-model/runtime/input
```
