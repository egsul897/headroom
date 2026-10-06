# 04 — Financial source-of-truth decision

## Decision

1. **Runtime financial-input truth = the Phase 4B contract** (`lib/contract-model/runtime/input/**`,
   `financial-input-contract.v1`): immutable `FinancialSnapshot` (DRAFT / REVIEW_REQUIRED / APPROVED / SUPERSEDED), explicit
   `supersedesSnapshotId`, full fact identity (company, scope, kind, key, period, as-of, value type, currency), default policy
   APPROVED + EXACT, `LATEST_ON_OR_BEFORE` only as a recorded caller choice, provenance and dependency manifest. Preserved
   unchanged. It becomes the only financial input any North-Star answer reads.
2. **It is not yet persisted.** The contract is a pure in-memory type system; no Prisma table backs it and no `app/` code
   reaches it. The migration target is a **new, append-only approved-snapshot store** implementing the 4B identity
   one-to-one (snapshot rows + fact rows + source-location rows), not an extension of either existing table.
3. **Legacy Prisma `FinancialSnapshot`** (eight fixed `Decimal` columns, no status, no supersession, no currency, no
   provenance) = **legacy compatibility only** for the prototype engine (`lib/covenant-engine.ts`,
   `lib/dashboard-service.ts`, Simulate / Capacity / Dashboard / Feeds / onboarding). Do not extend. Retire once product reads
   move to the 4B store.
4. **`FinancialState` / `Facility` / `DebtEvent` + `lib/financial-core/**`** = **dashboard analytics** (liquidity, maturity,
   interest, generic metrics). Provenance-wrapped but JSON fact groups with fixed categories, per-fact review only, no
   snapshot status lifecycle, no supersession, `periodType` that admits FORECAST. Not a contractual input source. Its
   debt-event stream is ledger-shaped and must be reconciled with the 4C ledger (invariant 35) rather than remain a second log.
5. **`ExternalInputRecord` + `certifyExternalInputRecord`** (compliance-certificate confirmation) is the right *principle*
   (extraction proposes; a human confirms; `PUBLIC_FILING_RECONSTRUCTION` can never be certified) in the wrong *shape*
   (mutable single values, `VERIFIED` set by update, no period identity, no currency, no source page/table). Its approval
   step migrates into approval of certificate facts in the 4B store.

### Why not evolve `FinancialState` into the store

Its fact groups are fixed JSON categories (`balanceSheetFacts`, `incomeStatementFacts`, `covenantMetricFacts`) — a closed
taxonomy against the anti-enumeration invariant (7) and against heterogeneous certificates; a fact has no independent
identity, period, currency or approval lifecycle; `periodType = FORECAST | PRO_FORMA` lets non-reported states share the
table with reported ones. Retrofitting all of that would rewrite the model and its consumers anyway.

## No silent dual truth

Today one manual entry writes **both** legacy tables (`lib/onboarding/financial.ts`, documented in its own header), and the
two halves of the dashboard read different tables. That may continue only while: (a) no North-Star answer reads either
table; (b) the migration below is on the roadmap with an owner step; (c) legacy surfaces are labelled prototype data when
they are next touched. Migration steps (later, each separately gated):

1. Build the 4B store and the certificate adapter (next gate, `07`).
2. Project legacy rows into the store as **DRAFT / REVIEW_REQUIRED** only — never APPROVED automatically; carried-forward
   values are not projected at all.
3. Move product reads (Capacity, Simulate, Dashboard covenant figures) to 4A/4B over approved snapshots.
4. Freeze writes to legacy `FinancialSnapshot`; remove the dual-write.
5. Retire legacy `FinancialSnapshot` and `DebtTranche`; keep `FinancialState` only if a validated analytics need remains.

## Selector resolution (new, required)

The certificate supplies facts; **the contract decides which fact identity is required**. The IR carries the selector
("most recently ended fiscal quarter", "four consecutive fiscal quarters most recently ended", "date of such transaction",
"most recently delivered financial statements"); the 4B dependency manifest states the period and as-of each reference
will ask for. Between them sits a deterministic **selector-resolution layer** that maps a contractual selector plus an
evaluation date to one snapshot identity using explicit evidence — the company's fiscal calendar, delivery records
(when statements and certificates were delivered) — and an explicit policy, and returns AMBIGUOUS / NEEDS_INPUT when the
evidence does not determine one. It is never "the latest quarter".

## Certificate ingestion principles

- Heterogeneous formats; no certificate template is hardcoded; certificate *forms* embedded in credit agreements (present
  in the CONMED and Chewy fixtures) may guide extraction but never define it.
- Extraction **proposes** facts, each with source document identity, version/hash, page / section / table / row where
  available, reporting period, as-of, scope, value type, currency/unit. Proposals are DRAFT or REVIEW_REQUIRED.
- A separate, attributable **approval** makes a snapshot APPROVED; approval is per snapshot with per-fact review state.
- A restated certificate creates a new snapshot that **supersedes** the old one explicitly; nothing is edited in place.
- Basket-usage schedules and elections a certificate reports become **ledger proposals** (4C), not snapshot facts.
- A certificate-reported covenant result (e.g. "Consolidated Total Leverage Ratio: 3.10x") is a reported fact that can be
  compared with Headroom's own computation; it never replaces the computation silently.
- No value is ever carried forward from a prior period to fill a gap.
