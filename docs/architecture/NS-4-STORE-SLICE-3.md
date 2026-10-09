# NS-4 store slice 3 — durable Prisma adapter + loader parity

**Status:** implementation slice 3 (Prisma schema + `PrismaApprovedSnapshotStore` + offline loader parity)  
**Charter:** `docs/architecture/NS-4-PARALLEL-CHARTER.md` / `docs/architecture/NS-4-AGENT-CHARTER.md`  
**Auth:** #67 COO PASS — loader parity + durable store authorized under soft gates (hard exclusions).  
**Gate:** `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json` → NS-4  
**Depends on:** slice 1 in-memory store + slice 2 certificate propose/approve  

## What this slice delivers

1. **Prisma models** (additive, distinct from legacy `FinancialSnapshot`):
   - `ContractInputSnapshot` / `ContractInputFact` / `ContractInputFactLocator` / `ContractInputSnapshotEvent`
   - Migration `prisma/migrations/20261009140000_ns4_contract_input_snapshots/`
2. **`PrismaApprovedSnapshotStore`** — hydrate from append-only events; validate via sealed in-memory write path; flush events + rematerialize tables in a transaction
3. **`loadApprovedSnapshotsFromPrisma`** — APPROVED-only feed for unchanged Phase 4B `resolveInput`
4. **Async certificate helpers** — `proposeFromCertificateAsync` / `approveCertificateProposalAsync` over the durable store
5. **Offline loader parity tests** — hand-built 4B fixtures append→approve→resolve identically to resolving the fixture directly
6. **Optional DB round-trip** — `prisma-roundtrip.test.ts` when `DATABASE_URL` is set (skips otherwise)

## Soft gates (FAIL if violated)

- Phase-3 trees untouched
- Frozen 4B resolve-only — no resolver / identity semantic edits
- No Ask Headroom UI / certificates customer pages
- No NS-6 selector resolution
- No 4C persisted ledger / capacity store
- No ERP / live customer certificate ingest / provider calls
- Legacy `FinancialSnapshot` table untouched
- Mixed Phase-3/NS-4 PRs = FAIL

## Explicitly NOT in this slice

- Certificates customer UI (`/{companyId}/certificates`)
- Ask cutoff / NS-6 contractual selector
- Persisted 4C contract ledger
- Product intelligence dashboards / legacy capacity theater
- Real customer certificate ingest (NS-5)

## Test commands

```bash
npx vitest run tests/contract-model/runtime/input/store
# optional durable path:
DATABASE_URL=… npx vitest run tests/contract-model/runtime/input/store/prisma-roundtrip.test.ts
```

## Rewrite note

This slice is the charter-bound salvage of engine work previously mixed into product PR #189.
Product UI / Ask / NS-6 / 4C ledger remain out of scope here; AI-first lawyer-review product track stays on PR #184.
