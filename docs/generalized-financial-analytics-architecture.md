# Headroom — Generalized Financial Analytics Architecture

**Status: design only.** No Prisma schema, migration, engine code (`lib/covenant-engine.ts`, `lib/solver/**`), UI (`app/**`), seed data, or golden test was modified to produce this document. This is the architecture blueprint for the next phase of Headroom's development: a company-agnostic financial core that sits *upstream of and around* the existing contractual-permission solver, per the controlling pipeline direction —

```
SOURCE DATA → NORMALIZED FINANCIAL FACTS → CANONICAL FINANCIAL STATE → CAPITAL STRUCTURE →
LIQUIDITY / INTEREST / MATURITIES / FINANCIAL ANALYTICS → GENERALIZED SCENARIO ENGINE →
PRO FORMA FINANCIAL STATE → CONTRACTUAL METRIC TRANSFORMATIONS → EXISTING PERMISSION / CONSTRAINT SOLVER →
COMBINED CFO DECISION SUPPORT → PROVENANCE / REVIEW / EXPLANATION
```

The covenant solver (`docs/solver-architecture-design.md`, implemented per `docs/solver-implementation-phases-0-7-report.md` and hardened per `docs/solver-hardening-live-integration-report.md`) is **one subsystem** of Headroom, not the organizing architecture for the whole product. This document does not redesign, extend, or modify that solver — it defines a clean adapter boundary into it. It is written to be genuinely company-agnostic: no Coherent-specific fields, thresholds, document names, or section numbers appear anywhere in the design below.

Scope discipline, stated once: this document **designs** the financial core; it does not implement it. Freeze conditions carried over unchanged from the solver work: no Prisma migration, no `lib/solver/**` or `lib/covenant-engine.ts` change, no Coherent configuration/permission/golden-test change, no UI change, no new real company onboarded, no ERP/bank-feed integration built.

---

## A. Executive architecture decision

Headroom today has exactly one notion of "financial state," expressed three separate but nearly-identical times: the Prisma `FinancialSnapshot` row (a periodic, company-wide scalar bundle), `lib/covenant-engine.ts`'s `FinancialSnapshotInput` (the same eight fields as a pure calculation input), and `lib/solver/types.ts`'s `FinancialState` (the same fields again, restated as the solver's own request vocabulary, plus an optional `liquidity`). All three exist purely to answer one question — *what can this company do under its covenants right now* — and none of them models the company's financial position as a thing in its own right: there is no capital-structure model with facility-level identity, no cash-flow/debt-service model, no forecast, no scenario composition independent of a single covenant test, and no notion of a financial fact's provenance distinct from whether a covenant interpretation has been reviewed.

**Decision:** introduce a new, additive subsystem — the **financial core** (`lib/financial-core/*`, mirroring the existing `lib/solver/*` package structure) — that owns the canonical `FinancialState`, capital structure, debt events, liquidity, ordinary financial metrics, debt service, maturity analytics, forecasts, and a generalized scenario engine, and that **projects down** into the exact input shapes the existing solver and legacy engine already consume (`FinancialSnapshotInput`, the solver's own `FinancialState`/`HistoricalState`/`ExternalInputs`, `Transaction`, `SolverNativeCompanyContext`) through a narrow, explicit adapter layer. The solver's own composition logic — permission graphs, election enumeration, requirement evaluation, `PathStatus`, `PermissionPath`, `StateDelta` — is not touched, not duplicated, and not reinterpreted. The financial core supplies **facts**; the solver supplies **contractual judgment**. Neither layer does the other's job.

This mirrors, deliberately, the same layering discipline `docs/solver-architecture-design.md` §Q used to migrate from the legacy `CapacityExpr` composition to the permission graph: **kept as-is and reused, not replaced** (there: `evaluateProvision`; here: the entire solver + legacy engine), and **new composition wired in through an explicit, auditable boundary** (there: the coverage gate; here: the solver-adapter functions in §L). It also mirrors `docs/legal-review-status-model.md` §5's dimension-separation principle, generalized from "legal review vs. financial-data provenance vs. engineering execution" to a fourth, now load-bearing dimension this document adds formally: **financial-analytics correctness** (was the EBITDA build-up, the maturity wall, the pro forma leverage figure computed correctly) — kept orthogonal to all three of the others, never collapsed into "the covenant cleared" or "counsel reviewed it."

Three things drive this decision:

1. **The existing solver already anticipates most of the boundary it needs.** `lib/solver/types.ts` already defines `FinancialState`, `HistoricalState`, `ExternalInputs`, `ActivationState`, `Transaction`, and `ProvenanceWrapper<T>` — a full request vocabulary the design doc's §B specified. The financial core's job is to become the thing that *populates* these types correctly from a genuine financial model, not to invent parallel ones. Where the solver's live entry point (`runSolver`/`RunSolverParams`, `lib/solver/service.ts`) is narrower than the full `SolverRequest` vocabulary in `types.ts` (see §L.4), this document treats that gap as a solver-side implementation detail to route around, not a license to build a second, competing "financial state" shape.
2. **The product's real center of gravity has moved.** A CFO doesn't open Headroom to ask "is $X permitted" in isolation; they ask it in the context of "what's my liquidity, my maturity wall, my forecast leverage trajectory, and — given all that — what does the covenant package actually allow." Today's `app/position`, `app/simulate`, `app/ledger` routes only answer the covenant half of that question, using a thin, purely-declarative capital structure (`DebtTranche`) with no independent identity, no schedule, and no forecast dimension.
3. **The provenance/review model just established for legal conclusions generalizes cleanly to financial data**, and Headroom already has one working instance of exactly this generalization: `ExternalInputRecord`/`ExternalInputKind` (§K of the solver design doc) is *already* a financial-data-provenance primitive, built for the solver's own external-input boundary (borrowing-base certificates, named reserves). This document extends that same shape to *all* financial facts, not just the solver-external ones — it does not invent an incompatible second provenance system.

---

## B. Repository audit

What exists today, concretely, that this architecture must build on and must not break.

### B.1 The covenant engine (legacy composition layer)

`lib/covenant-engine.ts` (1,633 lines). Pure calculation core + thin Prisma adapter, unchanged in shape since before the solver work:

- `FinancialSnapshotInput` — 8 scalar fields (`ebitda, cash, interestExpense, cumulativeNetIncome, equityProceedsSinceIssue, assumedNewDebtRatePct, totalDebt, securedDebt`), all plain `number`. This is the *sole* financial-state shape every leaf calculation (`evaluateProvision`) and every composition function (`computeCovenantPosition`, `buildDebtRatioTests`, `simulateDebtIncurrence`, `simulateRestrictedPayment`, `simulateAssetSale`) reads.
- `computeLeverageMetrics(fin: FinancialSnapshotInput): LeverageMetrics` — derives `netDebt`, `netSecured`, `totalNetLeverage`, `seniorSecuredNetLeverage`, `fixedChargeCoverage` from the 8 scalars. This is the *only* place Headroom computes a leverage/coverage ratio today, and it is covenant-metric-shaped (it exists to feed `LEVERAGE_RATIO_ROOM`/`COVERAGE_RATIO_ROOM`/`RATIO_GATE`), not a general financial-metrics engine.
- `CompanyCovenantData { companyId, documents, provisions, financials: FinancialSnapshotInput, ledger }` — the full input to `computeCovenantPosition`.
- `simulateDebtIncurrence(data, position, amount, secured, solverContext?)` — the function `app/simulate/SimulateClient.tsx`'s `DebtPanel` calls directly. Its optional fifth parameter, `solverContext: SolverNativeCompanyContext`, is **the existing, real, already-wired live boundary** into the solver (added by the hardening work) — see §L.
- `SolverNativeCompanyContext` (defined in `covenant-engine.ts`, not `solver/types.ts`) — the exact shape a caller must assemble to route a document/side to the solver: `permissions, relationships, sharedConstraints, collateralScopes, ruleActivationConditions, coverageDeclarations, activationState, asOfDate, entityClasses, incurringEntity, guarantorStatus, collateralPools, requestedLienPriority`.
- `resolveDocumentSideCoverage`, `runSolverForDocument`, `buildLiveTransaction` — the three functions that actually perform the coverage-gate check, call `runSolver`, and translate its `SolverResult` into a `PerDocumentDebtResult`. `buildLiveTransaction` is the **existing, working example** of exactly the kind of adapter function §L of this document generalizes: it builds a solver `Transaction` from `(amount, secured, ctx)` today; the financial core's scenario engine becomes the thing that supplies the richer inputs (`useOfProceeds`, `maturity`, `weightedAverageLife`, `interestRate`) this function currently hardcodes or omits.

### B.2 The solver (Phases 0–7 + hardening)

`lib/solver/*` (9 files: `types.ts`, `coverage.ts`, `graph.ts`, `status.ts`, `election.ts`, `statedelta.ts`, `result.ts`, `service.ts`, plus the DB adapter added during hardening). Fully built, tested (143 vitest tests, 30/30 golden tests unaffected), and — per the hardening report's verdict `READY_FOR_FINANCIAL_ARCHITECTURE` — safe to build on.

Key facts this document must not contradict:

- The solver's own `FinancialState` type (`lib/solver/types.ts`) is **not** the canonical financial state this document designs — it is a narrow, covenant-metric-shaped *projection target* (9 fields: `snapshotAsOf, ebitda, cash, interestExpense, totalDebt, securedDebt, cumulativeNetIncome, equityProceedsSinceIssue, liquidity?, assumedNewDebtRatePct`). Nothing about this document's canonical `FinancialState` (§C) is meant to replace it; §L defines the exact projection between them.
- `SolverRequest` (the full request shape in `types.ts`, with `historicalState`, `externalInputs`, `assumptions`) is **broader than what is actually wired today**. The live entry point, `runSolver(params: RunSolverParams): SolverResult` (`lib/solver/service.ts`), takes a leaner `RunSolverParams` — `eligiblePermissions, relationships, sharedConstraints, collateralScopes, ruleActivationConditions, financials: FinancialSnapshotInput, transaction: Transaction, entityClasses, activationState, asOfDate, maxPermissionsPerSide?` — which notably passes `financials` as the **legacy** `FinancialSnapshotInput` type (imported from `covenant-engine.ts`), not the solver's own `FinancialState`, and has no `historicalState`/`externalInputs`/`assumptions` parameters at all. This is a real, documented gap (`docs/solver-implementation-phases-0-7-report.md` §O items 1–2, 5; `docs/solver-hardening-live-integration-report.md` §M items 1–2) — the financial core's adapter design (§L) accounts for it explicitly rather than silently assuming the fuller `SolverRequest` is already consumed.
- `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`CollateralPool`/`RuleActivationCondition`/`SolverCoverageDeclaration`/`ExternalInputRecord` are real Prisma tables (migration `20260824213728_add_solver_native_contract_model`), populated with zero rows for every existing company (Coherent included). The financial core must never write to these tables and must never re-derive contractual conclusions from financial data — it only supplies the scalars/facts these tables' governing `Permission.formulaType`/`params` read.
- `ProvenanceWrapper<T>` and `SourceCitation` (`lib/solver/types.ts` §K) already exist as the solver's own generic provenance shapes — reused, not reinvented, by §M below.
- The coverage gate (`lib/solver/coverage.ts`) guarantees a document/side is never partially solver-native; this property is unaffected by anything in this document, because the financial core sits entirely upstream of the coverage-gate decision.

### B.3 The legal-review/provenance model just established

`docs/legal-review-status-model.md` + `docs/coherent-legal-model-baseline-v1.md`. Key structural facts this document extends:

- Two persisted layers: `GoldenTest.status` (`GoldenTestStatus`) for a specific golden question's legal conclusion, and `LegalReviewRecord` (generalized, reusable reviewer provenance, pointing at `GOLDEN_TEST | PERMISSION | RULE_ACTIVATION_CONDITION | LEGAL_CONCLUSION`).
- §5's dimension table already lists **five** orthogonal dimensions, one of which is exactly financial-data provenance (`ExternalInputRecord`) and one of which is engineering/execution status (`EvaluationStatus`/`PathStatus`). This document's §N formalizes and extends that same table rather than replacing it.
- The open, already-documented, non-blocking gap: Coherent's `$1,700M` `FinancialSnapshot.ebitda` had, as of this document's authorship, **no** `ExternalInputRecord` row — it was a plain, uncertified scalar. *(2026-08-25 note, append-only: it now carries a documented `ExternalInputRecord` of kind `PUBLIC_FILING_RECONSTRUCTION` — see `docs/coherent-phase8-population-reconciliation.md` §V — still not `CERTIFIED_EXTERNAL_INPUT`, and never intended to become it for this fixture. This does not change anything below; §M/§O's generalized staleness/certification pattern is unaffected, and `PUBLIC_FILING_RECONSTRUCTION` is itself now a concrete instance of exactly the "certified vs. uncertified but documented" distinction that pattern anticipates.)* This is named in the baseline doc as a **data-provenance** issue, not a legal-review issue, and explicitly does **not** block "generalized financial-core development" (its own words). This document treats that exact gap as the first, concrete instance of the staleness/certification problem the provenance architecture (§M/§O) is built to generalize — never as a Coherent-specific fix.

### B.4 The golden-test harness

`scripts/golden-test.ts` + `GoldenTest` (30 rows, Coherent). Checks `expectedAnswer`/`expectedStatus`/`bindingProvision`/`bindingDefinedTerms` against `queryType`s that all resolve to existing engine functions (`LEVERAGE_METRIC`, `PROVISION_CAPACITY`, `DOCUMENT_CAPACITY`, `CROSS_DOCUMENT_CAPACITY`, `DEBT_SIMULATION`, `RP_SIMULATION`, `ASSET_SALE_SIMULATION`, `OUT_OF_SCOPE`). Nothing in this document touches `GoldenTest`, `golden_tests` rows, or `scripts/golden-test.ts`. §Y proposes a **separate** acceptance-test shape for the financial core, deliberately not layered onto the golden-test harness (which is a legal-conclusion regression suite, a different concern).

### B.5 Current UI routes and what they actually consume

- **`app/position/page.tsx`** — Server Component. Reads `getPosition()` (→ `computeCovenantPosition`), `getDebtTranches()` (→ `DebtTranche[]`), `getCompany()`, `getDefinedTermsByProvision()`, `getFinancialSnapshot()`. Renders: cross-document secured/unsecured capacity headline, latest `FinancialSnapshot` fields verbatim, per-document provision traces, a flat "Capital structure" list summing `DebtTranche.amount`. There is no liquidity figure, no maturity data, no forecast, no facility-level detail beyond name/amount/secured/documentName.
- **`app/simulate/SimulateClient.tsx`** — Client Component. Computes `computeCovenantPosition(data)` client-side (pure, deterministic, safe to recompute per keystroke) and calls `simulateDebtIncurrence`/`simulateRestrictedPayment`/`simulateAssetSale` directly against the in-browser `CompanyCovenantData`. Renders per-document status, binding constraint, pro forma ratios, an "amendment unlock" hint. **Does not currently pass `solverContext`** — the client-side simulation always takes the legacy-only code path (this is consistent with Coherent having zero `Permission` rows; it also means the live solver boundary, though built and tested at the service-layer, is not yet exercised from this UI — a fact this document's MVP prioritization (§W) accounts for, without proposing to fix it, since UI changes are out of scope here).
- **`app/ledger/page.tsx`** — Server Component. Reads `getPosition()`, `getLedgerEntries()` (`LedgerEntry[]`). Renders a flat, chronological "public-record ledger" (equity/debt-incur/debt-repay/asset-sale/dividend/investment entries) and a from-scratch-computed illustrative compliance certificate. `LedgerEntry` has no link to a specific facility/instrument — only an optional nullable `documentId`.

### B.6 Background: why the ontology looks the way it does

`docs/cross-document-ontology-stress-test.md` and `docs/targeted-ontology-closure-test.md` (skimmed per task scope) established, across five real companies' actual debt documents, that the *contractual* ontology (permissions, relationships, shared constraints, collateral pools, dynamic activation) is a closed, stable, company-agnostic vocabulary reached only after two rounds of adversarial testing against real intercreditor agreements, incremental-facility definitions, and borrowing-base mechanics. The module-boundary lesson this document draws from that work (§S) is procedural, not substantive: **a company-agnostic core is only trustworthy once tested against structurally different companies, not just different dollar amounts of the same shape** — §Y's acceptance-test design applies that same discipline to the financial core.

---

## C. Canonical financial-state design

### C.1 What `FinancialState` must capture

A single point-in-time (or period) financial position, decomposed so that GAAP-reported facts, covenant-defined facts, and derived metrics are never silently collapsed into one number the way today's flat `FinancialSnapshot` does:

```
FinancialState {
  id
  companyId
  asOfDate: Date                     // the position this state represents
  periodType: "ACTUAL" | "FORECAST" | "PRO_FORMA"   // §J/§K — never inferred from context
  scope: EntityScopeRef              // consolidated (default) or a specific EntityClass/entity subset — reuses EntityClass (§C.1 of solver doc), never a new entity vocabulary

  // Effective-dating: identical semantics to Document.effectiveFrom/effectiveTo already
  // established in prisma/schema.prisma - supports restatements/amendments to a
  // previously-reported figure without deleting the superseded version.
  effectiveFrom: Date | null
  effectiveTo: Date | null

  balanceSheetFacts: {
    cash: ProvenancedFact<number>
    restrictedCash?: ProvenancedFact<number>
    totalAssets?: ProvenancedFact<number>
    totalDebtPrincipal: ProvenancedFact<number>       // gross, undiscounted, matches FinancialSnapshot.totalDebt today
    securedDebtPrincipal: ProvenancedFact<number>
    totalEquity?: ProvenancedFact<number>
  }

  incomeStatementFacts: {
    revenue?: ProvenancedFact<number>
    gaapEbitda?: ProvenancedFact<number>              // as reported, no addbacks
    gaapNetIncome?: ProvenancedFact<number>
    cumulativeNetIncomeSinceIssue: ProvenancedFact<number>  // matches today's field, kept
    equityProceedsSinceIssue: ProvenancedFact<number>
    interestExpense: ProvenancedFact<number>
    capex?: ProvenancedFact<number>
  }

  covenantMetricFacts: {
    // The financial core's OWN definition-aware EBITDA build-up: GAAP EBITDA
    // plus a list of named, individually-provenanced addbacks. This is
    // DISTINCT from a Permission's own eligibilityConditions/capacityRule -
    // the financial core computes "what the defined term evaluates to given
    // its addback list"; the SOLVER decides whether/how that number gates a
    // basket. Never the other's job (§G, §L).
    covenantEbitda?: { value: number; addbacks: { label: string; amount: number; provenance: ProvenancedFact<number> }[]; provenance: ProvenancedFact<number> }
    assumedNewDebtRatePct: ProvenancedFact<number>    // matches today's field, kept - an ASSUMPTION-sourced fact, never a "REPORTED" one
  }

  notes?: string
}

/** Generalizes lib/solver/types.ts's own ProvenanceWrapper<T> (§K there) - reused, not reinvented. See §M. */
type ProvenancedFact<T> = ProvenanceWrapper<T> & { asOfDate: Date; staleness?: { maxAgeDays: number } };
```

### C.2 Relationship to `FinancialSnapshot`/`FinancialSnapshotInput`

**`FinancialSnapshot` is not replaced, deprecated, or modified.** It remains exactly what it is today: the input the legacy engine and (for now) the wired solver both actually read, via `FinancialSnapshotInput`. The relationship is a **projection, one direction only**:

```
projectToLegacySnapshot(state: FinancialState): FinancialSnapshotInput
```

This pure function reads `state`'s facts (unwrapping each `ProvenancedFact<T>` to its bare `.value`) and produces exactly the 8-field `FinancialSnapshotInput` shape `computeCovenantPosition`/`simulateDebtIncurrence` already require — `ebitda` sourced from `covenantMetricFacts.covenantEbitda?.value ?? incomeStatementFacts.gaapEbitda?.value` (never silently defaulted if both are absent; produces a documented `NOT_COMPUTABLE` result the caller must handle, mirroring the engine's own fail-closed posture), `cash`/`totalDebt`/`securedDebt` from `balanceSheetFacts`, etc. No function in the other direction is proposed — the financial core does not "import" a `FinancialSnapshot` row and treat it as more authoritative than its own richer facts; instead, `FinancialSnapshot` rows become (in a later implementation phase, not designed further here) one of the **source records** a `FinancialState` is built from, exactly the same relationship `Permission` has to `CovenantProvision` today (§Q.1 of the solver design doc: "kept as-is and reused, not replaced").

### C.3 Versioning/effective-dating

`effectiveFrom`/`effectiveTo` on `FinancialState` mirror `Document.effectiveFrom`/`effectiveTo` exactly: both null means "always effective" for its `asOfDate`; a restatement supersedes a prior `FinancialState` by setting the prior row's `effectiveTo` to the restatement's `effectiveFrom`, loaded by the same "at most one row matches a given query date" convention `loadCompanyCovenantData` already uses for `CovenantProvision`. `periodType` is orthogonal to effective-dating: a `FORECAST`-type state for a future `asOfDate` can itself later be superseded by an `ACTUAL`-type state once the real period closes — the two are never the same row with a mutated `periodType`, preserving the forecast's own historical accuracy record (relevant to §J).

---

## D. Capital-structure design

### D.1 What's reused, what's new

Today's `DebtTranche` (`id, companyId, financialSnapshotId, name, amount, secured, documentName`) is explicitly, per its own schema comment, "kept as its own table purely for the Position tab's capital-structure display; the engine only ever reads the aggregates." It has no durable identity across snapshots (a new snapshot with the same facilities re-creates equivalent-but-distinct rows), no terms (coupon, maturity, amortization), and no link to the `Permission`/`Document` rows that authorized it.

**New: `Facility`** — a durable, company-scoped capital-structure instrument with its own identity across time:

```
Facility {
  id, companyId
  name                          // "Term Loan B", "2031 Senior Notes", "ABL Revolver"
  facilityType: "TERM_LOAN" | "REVOLVER" | "NOTES" | "OTHER"
  currency: { code: string }
  originalPrincipal: number
  secured: boolean
  couponType: "FIXED" | "FLOATING"
  couponPct?: number             // FIXED
  marginBps?: number             // FLOATING, over a referenceRate
  referenceRate?: string         // e.g. "SOFR" - free text, never branched on
  maturityDate?: Date
  issuedDate?: Date

  // Which document(s) govern this facility's OWN terms (distinct from which
  // Permission authorized its INCURRENCE - see §E) - reuses Document, never
  // duplicates it.
  governingDocumentId?: string

  // Entity/guarantor structure - reuses EntityClass/EntityClassMember
  // verbatim (solver doc §C.1/§R), never a second entity vocabulary.
  obligorEntityClasses: EntityClass[]
  guarantorEntityClasses: EntityClass[]

  // Collateral/priority - reuses CollateralPool/PermissionCollateralScope's
  // OWN priority vocabulary (PriorityTier) rather than inventing a facility-
  // level duplicate. A Facility that is secured references the pool(s) it
  // sits on; the SOLVER's PermissionCollateralScope remains the source of
  // truth for what priority a PERMISSION grants - this is a citation link,
  // not a second priority determination.
  collateralPoolIds: string[]

  effectiveFrom, effectiveTo      // amendment/refinancing precedence, same pattern as Document
}
```

### D.2 Non-duplication with `Document`/`Permission`

`Facility` and `Permission` answer different questions and must never be merged: a `Permission` is "what the covenant package *allows* to be incurred/secured"; a `Facility` is "what has actually *been* incurred and on what terms." A `Facility`'s issuance is one instance of a `DebtEvent` (§E) that, at the time it happened, drew on one or more `Permission`s (recorded as a citation, `Facility.originatingPermissionIds: string[]`, populated from the `PermissionPath.legs[].permissionId` the solver returned when the incurrence was tested — never re-derived independently by the financial core). This keeps the boundary from §A intact: the financial core records *that* a facility exists and *what it costs*; it never re-litigates *whether* it was permitted.

---

## E. Debt event/state model

### E.1 What's reused, what's new

The solver already has two pieces of debt-event-adjacent machinery that must not be duplicated:

- `StateDelta.debtOutstandingDelta`/`basketUsageDelta`/`sharedConstraintUsageDelta` — a **hypothetical**, per-transaction-test output, never persisted (§L of the solver doc, unchanged).
- `HistoricalState.priorIncurrences/prepayments/reclassifications/redesignations` (`lib/solver/types.ts`) — the shape the solver's `SolverRequest` expects to be handed, for basket-usage/measurement-basis purposes.

Today's actual persisted event log is `LedgerEntry` (`basket: EQUITY | DEBT_INCUR | DEBT_REPAY | ASSET_SALE | DIVIDEND | INVESTMENT`, `direction`, `amount`), explicitly documented as "public-record / compliance-certificate events" — a flat, company-wide feed with no link to a specific `Facility`.

**New: `DebtEvent`** — the financial core's own capital-structure event log, richer than `LedgerEntry` and facility-scoped:

```
DebtEvent {
  id, companyId, facilityId
  eventType: "ISSUANCE" | "REPAYMENT" | "REFINANCING" | "REDESIGNATION" | "RECLASSIFICATION" | "AMENDMENT"
  date: Date
  amount: number                  // principal effect; sign convention by eventType, never overloaded
  refinancesFacilityId?: string   // for REFINANCING: the facility this event retires/replaces
  // For REDESIGNATION/RECLASSIFICATION: which Permission this event moved
  // usage FROM/TO - a citation into the solver's own vocabulary, never a
  // second redesignation algorithm. The solver's own HistoricalState.
  // reclassifications/redesignations (§L of the solver doc) are POPULATED
  // FROM this event log by the adapter (§L.2 below), not computed twice.
  relatedPermissionIds?: string[]
  sourceLedgerEntryId?: string    // link back to the existing LedgerEntry row this event corresponds to, where one exists
  provenance: ProvenancedFact<number>  // the amount's own source/certification
}
```

### E.2 Relationship to `LedgerEntry`

**`LedgerEntry` is not modified or replaced.** `DebtEvent` is additive and facility-scoped; a `DebtEvent` may optionally cite the `LedgerEntry` row it corresponds to (`sourceLedgerEntryId`), but `LedgerEntry`'s own DEBT_INCUR/DEBT_REPAY rows continue to exist and continue to drive today's public-record ledger view unmodified. In a later implementation phase (not designed further here), the Ledger tab's "log an entry manually" flow could be extended to also create a `DebtEvent` when a facility is identified — named as a future integration point, not designed now, since it touches `app/ledger/**` and is explicitly frozen.

### E.3 Feeding the solver's `HistoricalState`

The adapter function `toHistoricalState(events: DebtEvent[], permissions: Permission[]): HistoricalState` (§L.2) derives `BasketUsageRecord[]` per permission by replaying `DebtEvent` rows against each permission's own `measurementBasis` (`CUMULATIVE_INCURRED`/`CURRENTLY_OUTSTANDING`/`NET_OF_REPAYMENT`/`PREPAYMENT_CREDIT` — the exact, unmodified enum from `lib/solver/types.ts`). This is the financial core's single most solver-facing responsibility: it turns a raw event stream into the basket-usage numbers the solver needs, without ever deciding what those numbers *mean* contractually.

---

## F. Liquidity engine

### F.1 Scope

Cash, revolver availability, and borrowing-base-style constraints, computed as **ordinary financial facts**, not covenant tests. The solver design doc already drew this exact boundary and named the reuse point: borrowing-base is anticipated as a leaf `FormulaType`-equivalent (§K there) and as `ExternalInputs.borrowingBaseCertificate`/`ExternalInputKind.CERTIFIED_EXTERNAL_INPUT`/the real `ExternalInputRecord` Prisma table. This document reuses that boundary exactly rather than inventing a parallel one.

```
LiquidityPosition {
  companyId, asOfDate
  cash: ProvencancedFact<number>                    // from FinancialState.balanceSheetFacts.cash
  revolverFacilityId?: string                        // -> Facility (facilityType: REVOLVER)
  revolverCommitment?: number
  revolverDrawn?: number
  revolverLcUsage?: number
  borrowingBaseValue?: ProvencancedFact<number>      // computed OR read as a certified external input - see below
  availability: number                                // min(commitment, borrowingBaseValue ?? commitment) - drawn - lcUsage
  totalLiquidity: number                              // cash + availability
}
```

**Note on `borrowingBaseValue`**: as of this document, `FormulaType` has no `BORROWING_BASE` variant — the solver design doc named this as a future leaf-calculation addition (§K there), not yet built. The liquidity engine's role is therefore twofold and cleanly split: (a) where a borrowing-base certificate exists, ingest its line items as `ExternalInputRecord`-shaped facts (the exact existing table/kind), never independently recomputing an eligible-collateral determination (per the solver doc's own product-boundary table: "certified external input... never independently recomputed"); (b) surface `totalLiquidity`/`availability` on the CFO dashboard (§Q) as an ordinary financial metric, independent of whether any covenant actually references it. If and when the solver's `FormulaType` gains a borrowing-base leaf calculation, the liquidity engine becomes that leaf's natural data source — named here as the intended integration point, not built now.

### F.2 Discretionary reserves

The solver's own `ExternalInputs.reserves.discretionaryCatchAll?: number | "UNKNOWN"` fail-closed shape is reused verbatim — the liquidity engine never resolves an open-ended discretionary reserve to a guessed number; it surfaces `"UNKNOWN"` exactly as the solver's own product-boundary table (§K there) requires.

---

## G. Financial metric engine

### G.1 Where the line is drawn

`computeLeverageMetrics` (`lib/covenant-engine.ts`) computes exactly five figures, and it computes them **because a covenant formula reads them** — `LEVERAGE_RATIO_ROOM`/`COVERAGE_RATIO_ROOM`/`RATIO_GATE` all consume `netDebt`/`netSecured`/`totalNetLeverage`/`seniorSecuredNetLeverage`/`fixedChargeCoverage` directly. That function is not moved, not renamed, not touched.

**The financial metric engine is everything else**: ordinary corporate-finance ratios a CFO cares about independent of whether any document happens to reference them — EBITDA margin, revenue growth, capex intensity, free cash flow, cash conversion, gross vs. net leverage on bases no covenant tests (e.g., gross debt/EBITDA when every covenant is net-debt-based), ROIC, current/quick ratio. None of these gate a `Permission`; all of them are legitimate CFO-dashboard content (§Q).

```
FinancialMetrics {
  companyId, asOfDate, periodType
  ebitdaMarginPct?: number
  revenueGrowthPct?: number
  capexToRevenuePct?: number
  freeCashFlow?: number              // EBITDA - capex - cash interest - cash taxes, where inputs exist
  grossLeverageMultiple?: number     // totalDebtPrincipal / ebitda, gross (no cash netting) - distinct from covenant netDebt/EBITDA
  cashConversionPct?: number
  // ...extensible; a closed, versioned list per company-agnostic principle -
  // never a company-configured formula DSL (that risk belongs to Permission/
  // CapacityExpr, not here).
}
```

### G.2 The one legitimate overlap, drawn precisely

A covenant-metric formula (e.g. `LEVERAGE_RATIO_ROOM`) and a financial-analytics metric (e.g. `grossLeverageMultiple`) may read the *same underlying facts* (debt, cash, EBITDA) but compute *different numbers* for different bases (net vs. gross, covenant-defined vs. GAAP EBITDA) and are consumed by different layers for different purposes (a gating threshold vs. a dashboard tile). The financial core never feeds its own `FinancialMetrics` output back into a `Permission.formulaType` evaluation — the only metrics the solver/legacy engine ever see are the ones produced by `computeLeverageMetrics` over the projected `FinancialSnapshotInput` (§C.2), keeping `evaluateProvision`'s existing leaf-calculation contract exactly as-is.

---

## H. Interest/debt-service engine

New. Reads `Facility` (coupon/margin, amortization terms — added below) and `DebtEvent` (actual draws/repayments) to project scheduled interest and principal amortization, independent of any covenant test.

```
AmortizationSchedule {
  facilityId
  scheduleType: "BULLET" | "STRAIGHT_LINE" | "SCHEDULED_STEPS" | "PIK"
  // For SCHEDULED_STEPS: explicit {date, principalDue}[] - the general case,
  // since real term loans amortize on individually-negotiated schedules, not
  // a single formula.
  steps?: { date: Date; principalDue: number }[]
  // For STRAIGHT_LINE: a single implied annual %, applied evenly.
  annualAmortizationPct?: number
}

DebtServiceProjection {
  facilityId, periodStart, periodEnd
  scheduledInterest: number         // from Facility.couponPct/marginBps + projected balance
  scheduledPrincipal: number        // from AmortizationSchedule
  totalDebtService: number          // scheduledInterest + scheduledPrincipal
}

// Company-wide, across every facility - a genuinely new metric Headroom
// does not compute today (FCCR = EBITDA / interestExpense only; DSCR adds
// scheduled principal amortization to the denominator).
DebtServiceCoverageRatio = ebitda / totalDebtServiceAcrossFacilities
```

This engine is purely additive: it does not change `fixedChargeCoverage`'s existing definition (interest-only) anywhere, and DSCR is surfaced as a **new**, separate financial metric (§G), never silently substituted for FCCR in any existing covenant-facing code path.

---

## I. Maturity analytics

New, built entirely from `Facility.maturityDate`/`originalPrincipal`/`AmortizationSchedule`:

```
MaturityWallEntry { periodLabel: string; year: number; principalMaturing: number; facilityIds: string[] }
MaturityWall = MaturityWallEntry[]   // one entry per forward period (typically annual), company-wide

WeightedAverageLife(facility) = Σ(periodPrincipalDue × yearsFromNow) / totalPrincipal   // per-facility, standard WAL definition
RefinancingRiskFlag = { withinRunwayMonths: number; maturingPrincipal: number; availableLiquidity: number }  // maturities falling inside a liquidity runway window
```

**Relationship to the solver's own WAL usage**: `Transaction.weightedAverageLife` (an optional field the caller supplies when testing a transaction) and `TermCondition.kind === "WAL_FLOOR"` (a term condition the solver *tests against*) already exist in the solver's vocabulary — but the solver never *computes* WAL; it only compares a caller-supplied value against a floor. The maturity-analytics engine is the thing that actually computes a facility's or a proposed transaction's WAL, and — when a scenario action proposes a new facility (§K) — supplies that computed value into the `Transaction.weightedAverageLife` field the solver already knows how to consume. No new solver concept is needed; this closes an existing input gap, not an existing capability gap.

---

## J. Forecast architecture

### J.1 `periodType` as the single discriminator

Per §C.1, every `FinancialState` carries `periodType: "ACTUAL" | "FORECAST" | "PRO_FORMA"`. This is the entire mechanism distinguishing projected from historical state — no separate "forecast" object type duplicates `FinancialState`'s shape:

- **`ACTUAL`** — a reported or reconstructed historical position. `asOfDate` is in the past (or the most recent close). Facts carry `sourceType: "REPORTED" | "RECONSTRUCTED"` (reusing `ProvenanceWrapper`'s existing enum).
- **`FORECAST`** — a projected future position, produced by applying named, individually-provenanced **drivers** (revenue growth rate, margin assumption, capex plan, financing plan) to a base `ACTUAL` state across one or more future periods. Facts carry `sourceType: "ASSUMED"`.
- **`PRO_FORMA`** — a single-point, transaction-adjusted position produced by the **scenario engine** (§K) applying one or more scenario actions to a base state (`ACTUAL` or `FORECAST`). This is the type that ultimately feeds the solver (§L).

### J.2 `ForecastSet`

```
ForecastSet {
  id, companyId
  baseFinancialStateId: string        // the ACTUAL state this forecast starts from
  drivers: { field: string; assumption: string; value: number; provenance: ProvenancedFact<number> }[]
  periods: FinancialState[]           // each periodType: FORECAST, sequential asOfDates
  createdAt: Date
}
```

A `ForecastSet`'s periods are ordinary `FinancialState` rows (not a separate schema) — every downstream consumer (financial metrics, liquidity, maturity analytics, dashboard) operates on `FinancialState` uniformly regardless of `periodType`, and only branches on `periodType` where the distinction actually matters (e.g., the dashboard must never let a `FORECAST` figure silently stand in for an `ACTUAL` one without a visible label — §O/§P).

---

## K. Generalized scenario engine

### K.1 Ordered composition, independent of and upstream from the solver

A **scenario** is an ordered sequence of **scenario actions**, each a pure transformation from one `FinancialState` to the next:

```
ScenarioAction =
  | { kind: "DEBT_ISSUANCE"; facilityDraft: Partial<Facility>; amount: number; useOfProceeds: string }
  | { kind: "DEBT_REPAYMENT"; facilityId: string; amount: number }
  | { kind: "REFINANCING"; retiresFacilityId: string; newFacilityDraft: Partial<Facility> }
  | { kind: "DIVIDEND" | "SHARE_REPURCHASE"; amount: number }
  | { kind: "ASSET_SALE"; netProceeds: number; reinvest: boolean }
  | { kind: "ACQUISITION"; considerationAmount: number; targetEbitda?: number; financingMix?: { debt: number; equity: number } }
  | { kind: "RATE_ASSUMPTION_CHANGE"; newAssumedRatePct: number }
  | { kind: "WORKING_CAPITAL_CHANGE"; cashDelta: number }

Scenario {
  id, companyId
  baseFinancialStateId: string
  actions: ScenarioAction[]          // ORDER MATTERS - see K.2
}

runScenario(scenario: Scenario, base: FinancialState): { proFormaState: FinancialState; perActionDeltas: FinancialStateDelta[] }
```

`runScenario` is a **pure function** — it never mutates `base`, never writes to the database, and never calls into the solver. Its sole output is a `PRO_FORMA`-type `FinancialState` plus a per-action audit trail (`perActionDeltas`), exactly mirroring the non-mutating, pure-function posture `docs/solver-architecture-design.md` §L already established for `StateDelta` ("Simulation and execution are structurally separated... mirroring the existing engine's own posture").

### K.2 Why order matters

Two scenario actions applied in different orders can produce a different pro forma state when a later action's own capacity depends on an earlier one's effect — e.g., a `DEBT_ISSUANCE` applied before a `DIVIDEND` changes the pro forma leverage a leverage-gated dividend basket would need to clear; the reverse order does not. `runScenario` applies `actions` strictly in array order, threading each action's output `FinancialState` as the next action's input — there is no reordering, no "optimal ordering" search, and no implicit parallelism. This mirrors the literal instruction embedded in the controlling pipeline diagram ("ordered scenario-state transformations") and deliberately avoids importing any of the solver's own combinatorial-search machinery (election enumeration, bisection) into a layer that has no covenant semantics of its own to search over.

### K.3 The solver is downstream, never upstream

**The covenant solver consumes a pro forma `FinancialState`; it does not produce one.** This is the single most important boundary statement in this document, restated because the pipeline diagram itself states it as the controlling design: `runScenario`'s output (`proFormaState`) becomes, via the adapter in §L, the `financialState`/`financials` input to a solver evaluation — never the reverse. The solver's own `StateDelta` (§L of the solver design doc) is a **contractual** hypothetical (basket usage, shared-constraint consumption) computed *from* a specific transaction test; it is not a general financial pro forma and this document does not ask it to become one. A scenario that tests "can I do this AND is it permitted" runs the scenario engine first (financial impact), then feeds the result into the solver (legal capacity) — never the other way, and never merged into one combined search.

---

## L. Covenant-solver interface

This is the load-bearing section: the exact adapter boundary between the financial core and the existing solver, stated against real function signatures and real types, not invented ones.

### L.1 What the financial core must supply, in what shape

For a legacy-only evaluation (the path every existing call site and Coherent itself uses today):

```
projectToLegacySnapshot(state: FinancialState): FinancialSnapshotInput
```
— feeds `computeCovenantPosition(data: CompanyCovenantData)` and `simulateDebtIncurrence(data, position, amount, secured)` exactly as today, with `data.financials` populated by this projection instead of a direct DB read. **No other change to either function's call sites is required** — this is a pure input-substitution, not a signature change.

For a solver-native evaluation, the financial core populates the *actual, currently-wired* live boundary — `simulateDebtIncurrence`'s optional fifth parameter — by constructing a `SolverNativeCompanyContext`:

```
toSolverNativeCompanyContext(state: FinancialState, capitalStructure: {facilities, debtEvents}, entities: EntityClassMember[], transaction: ScenarioAction): SolverNativeCompanyContext
```

populating each field from real financial-core data, never from placeholders:

| `SolverNativeCompanyContext` field | Financial-core source |
|---|---|
| `permissions, relationships, sharedConstraints, collateralScopes, ruleActivationConditions, coverageDeclarations` | **Not** financial-core data — read straight from the `Permission`/etc. tables exactly as `lib/coherent.ts`'s existing `getSolverStaticData` already does. The financial core never originates or modifies these rows. |
| `activationState` | Built from `DebtEvent`s (event history → `ActivationState.events`), `FinancialState` time series (→ `ActivationState.series`, e.g. a liquidity or rating history), and any usage counters the financial core tracks (→ `ActivationState.usageCounts`) — populated, never fabricated; an unresolved series/event/usage key is added to `ActivationState.unknownKeys`, reusing the solver's own fail-closed shape verbatim. |
| `asOfDate` | The `FinancialState.asOfDate`/`Scenario`'s effective date. |
| `entityClasses` | Read from `EntityClassMember`, scoped to the transaction's `incurringEntity`. |
| `incurringEntity, guarantorStatus, collateralPools, requestedLienPriority` | Supplied by the scenario action under test (`ScenarioAction` kind `DEBT_ISSUANCE`/`REFINANCING`'s `facilityDraft`) — the financial core's scenario engine is the natural origin of these fields, since they describe the proposed facility being tested, which is exactly what `ScenarioAction.facilityDraft` already models (§K.1). |

And, inside `runSolverForDocument`'s call to `runSolver(params: RunSolverParams)`, the two financial-core-owned fields are:

| `RunSolverParams` field | Financial-core source |
|---|---|
| `financials: FinancialSnapshotInput` | `projectToLegacySnapshot(proFormaState)` — **the same projection function as the legacy path**, applied to the scenario engine's pro forma output rather than a raw actual snapshot. This is the literal mechanism by which "the solver consumes a pro forma state" (§K.3) is realized in the code that exists today. |
| `transaction: Transaction` | A generalization of `buildLiveTransaction` (today hardcoded to `useOfProceeds: "GENERAL_CORPORATE"`, `acquisitionRelated: false`, no `maturity`/`weightedAverageLife`/`interestRate`) — the financial core's `ScenarioAction` (`DEBT_ISSUANCE`, specifically) supplies every one of `Transaction`'s real fields, including the ones the current hardcoded builder omits: `maturity` (from `facilityDraft.maturityDate`), `weightedAverageLife` (computed by §I's engine over `facilityDraft`'s amortization schedule), `interestRate` (from `facilityDraft.couponPct`/`marginBps`), and a genuine `useOfProceeds` (from the scenario action's own field). |

### L.2 The `HistoricalState`/`ExternalInputs` gap, named precisely

Per §B.2, the live `runSolver`/`RunSolverParams` boundary does **not** currently accept `historicalState`/`externalInputs`/`assumptions` at all — those fields exist in the full `SolverRequest` vocabulary (`lib/solver/types.ts`) but are not threaded through the wired service call. This document's adapter design anticipates the fuller boundary (`toHistoricalState`, §E.3; the liquidity engine's `ExternalInputRecord` population, §F) so that **when** the solver side closes that gap (a solver-side follow-up, not this document's to design or implement), the financial core already has the correct-shaped data ready to hand across. Until then, the financial core's adapter simply produces `RunSolverParams`' actual, narrower parameter list — it does not block on, or attempt to work around, a gap that belongs to the solver's own implementation, per this document's hard constraint not to modify `lib/solver/**`.

### L.3 What remains solely the solver's concern

Everything downstream of the inputs in §L.1: permission-relationship-graph construction (`buildPermissionGraph`), election enumeration and per-election feasibility (`enumerateElections`/`evaluateElection`), requirement-class evaluation (`RequirementResult`, all 11 classes), path-status/overall-status aggregation (`pathStatus`/`aggregateOverallStatus`), the winning `PermissionPath`, and the resulting `StateDelta`/`SolverResult`. The financial core never computes a `PathStatus`, never decides which `Permission`s an election may combine, and never evaluates a `RuleActivationCondition`'s applicability itself (it only supplies the raw series/event data such a predicate reads, via `ActivationState`). Symmetrically, the solver never computes EBITDA, cash flow, WAL, a maturity wall, or a DSCR figure — it only consumes the scalars the financial core hands it through §L.1's adapter functions. This is the "financial-data provenance vs. legal-review provenance never collapsed" principle from `docs/legal-review-status-model.md` §5, restated as a computation-boundary rule rather than a provenance rule: **facts vs. judgment, never merged.**

### L.4 What flows back

`PerDocumentDebtResult.solverResult` (the full `SolverResult`, preserved unmodified) and `.solverCoverage` (the `CoverageResult` that routed it) already exist as the live return shape from `simulateDebtIncurrence`. The financial core's scenario output contract (§R) wraps this object **unmodified** — exactly the same "the UI never reconstructs allocation logic... it renders this object" discipline `docs/solver-architecture-design.md` §N establishes for `SolverResult` itself, generalized to the financial core's own combined output.

---

## M. Provenance architecture

### M.1 One wrapper type, reused everywhere

`lib/solver/types.ts`'s `ProvenanceWrapper<T>` — `{ value: T; sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE"; reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED"; notes?: string }` — is not a solver-only concept; it is the correct general shape for *any* fact Headroom carries with a source. Every `ProvencancedFact<T>` in this document's `FinancialState`/`Facility`/`DebtEvent` types (§C, §D, §E) is this exact wrapper, extended with `asOfDate`/`staleness` (§O). No second, financial-core-specific provenance wrapper is proposed.

### M.2 Extending `ExternalInputRecord` to financial data generally

The real `ExternalInputRecord` table (`kind: COMPUTABLE_FORMULA | CERTIFIED_EXTERNAL_INPUT | DISCRETIONARY_CATCH_ALL | HUMAN_CLASSIFICATION`, `reviewStatus: DefinedTermStatus`, `maxAgeDays`) was built for the solver's own external-input boundary. This document's provenance architecture treats it as the **general-purpose financial-fact-provenance table**, not a solver-exclusive one — a `FinancialState` fact sourced from a compliance certificate, a 10-Q, or a borrowing-base certificate is the *same kind of thing* `ExternalInputRecord` already models, whether or not a `Permission` happens to read it. Concretely (proposed, §T): every `ProvencancedFact<T>` that has a durable, citable source is backed by an `ExternalInputRecord`-shaped row (reusing the table, or an additive sibling with the identical shape scoped to `FinancialState`/`Facility`/`DebtEvent` facts rather than solver `ExternalInputs` specifically — §T.2 states the exact recommendation). Facts sourced from a company-agnostic computation (e.g. `netDebt` computed by `computeLeverageMetrics`) carry `sourceType: "REPORTED"` derivation-of only where every input is itself REPORTED — a derived fact is never "more certain" than its least-certain input, so a derived fact's `reviewStatus` is the `worstStatus`-equivalent (least-verified) across its inputs, mirroring the exact aggregation discipline `evalExpr`'s `worstStatus` already applies to covenant capacity composition (never inventing a second aggregation rule for financial facts).

### M.3 Company-agnostic, not a Coherent EBITDA fix

This generalizes, rather than resolves, the specific open issue named in `docs/coherent-legal-model-baseline-v1.md` §6 (Coherent's uncertified $1,700M EBITDA). This document does not propose certifying that figure, does not touch Coherent's data, and does not treat that gap as blocking (per the baseline document's own explicit statement that it does not block financial-core development). It is cited here purely as the existing, real instance of the general pattern §M/§O formalize.

---

## N. Trust/review architecture

### N.1 Four orthogonal dimensions, never collapsed

Extending `docs/legal-review-status-model.md` §5's table with the financial-analytics-correctness dimension this document adds:

| Dimension | Model | Example |
|---|---|---|
| Substantive contractual result | `Permission`/`CovenantProvision`/solver output | "$X secured capacity" |
| Legal review status | `GoldenTest.status`/`LegalReviewRecord` | `FOUNDER_AND_PEER_REVIEWED` |
| Financial-data provenance | `ExternalInputRecord`/`ProvenanceWrapper` (this document, §M) | Covenant EBITDA sourced from a certificate, `VERIFIED`, 12 days old |
| Financial-analytics correctness | *(new, this document)* — was the EBITDA build-up/DSCR/WAL/maturity-wall computation itself correct, given correct inputs | A `covenantEbitda` addback list that sums correctly against its own defined-term list |
| Engineering/execution status | `EvaluationStatus`/`TransactionStatus`/`PathStatus` | `clear`/`review_required`/`REVIEW_REQUIRED` |
| Assumptions/unresolved facts | `TransactionAssumptions`, `RequirementResult.class === "TRANSACTION_ASSUMPTION"` | An unsupplied assumed rate |

A `FOUNDER_AND_PEER_REVIEWED` legal conclusion **never** certifies a financial input, and a `VERIFIED`/certified financial input **never** substitutes for legal review — this is `legal-review-status-model.md` §5's rule, restated, and it now composes with a genuinely orthogonal financial-analytics dimension the same way: a correctly-computed DSCR figure says nothing about whether the covenant package's own definitions were interpreted correctly, and vice versa. A CFO-facing example composing all four: *"Leverage covenant: legal interpretation `FOUNDER_AND_PEER_REVIEWED` / EBITDA input `CERTIFIED_EXTERNAL_INPUT`, 12 days old / EBITDA build-up recomputed and matches its own addback citations / engine execution `CLEAR`."* No single figure or badge is ever allowed to stand in for all four.

### N.2 Why this matters for the financial core specifically

Because the financial core is new, its own analytics-correctness dimension starts at the *lowest* trust level for every company it's ever applied to, independent of how well-reviewed that company's *legal* model already is — Coherent's `FOUNDER_AND_PEER_REVIEWED` legal conclusions (§B.3) say nothing about whether a future `covenantEbitda` addback computation for Coherent is correct, and this document's acceptance-test design (§Y) is built precisely to establish that dimension's trust independently, company-agnostically, before any real company's financial-core data is populated — mirroring exactly how the solver's own synthetic Cases A–J established solver-core trust before Coherent's `Permission` rows existed.

---

## O. Staleness

### O.1 Generalizing `ExternalInputRecord.maxAgeDays`

Every `ProvencancedFact<T>` carries an optional `staleness: { maxAgeDays: number }`, derived from the fact's own natural reporting cadence — a quarterly compliance certificate's EBITDA figure has a materially different staleness window than a daily cash-position feed, and the window is a property of *how the fact is normally refreshed*, not a single global constant. `isStale(fact, evaluationDate) = fact.asOfDate + fact.staleness.maxAgeDays < evaluationDate` — the exact same shape `ExternalInputRecord.maxAgeDays` already establishes for borrowing-base certificates (§K of the solver doc: "periodic certificates are stale, not silently reused, past this window"), generalized to every financial-core fact rather than left solver-external-input-only.

### O.2 Two different consequences, by context

A stale fact behaves differently depending on which layer consumes it, and this split is deliberate, not an inconsistency:

- **Consumed by the solver (via §L's adapter)**: a stale fact that a `RequirementResult` depends on resolves that requirement to `UNKNOWN` — identical treatment to a missing external input (§K of the solver doc's fail-closed table), never silently reused past its window, never defaulted to zero or to the prior period's value.
- **Consumed by financial-core-only analytics (the CFO dashboard, §Q)**: a stale fact is not a solver-style hard block — it is surfaced with an explicit "as of N days ago" / staleness badge, because a CFO legitimately wants to see a 40-day-old liquidity figure clearly labeled as such rather than have it disappear. The dashboard contract (§Q) makes this a first-class field on every rendered figure (`stalenessDays`, `isStale`), never a silent omission.

The dividing line is exactly §L.3's fact-vs-judgment boundary: staleness that would affect a *contractual conclusion* fails closed; staleness that only affects a *reporting display* is surfaced, not blocked.

---

## P. Conflict resolution

### P.1 The problem, stated concretely

Two sources can disagree about the same underlying fact — a 10-Q's reported EBITDA vs. a compliance certificate's Covenant EBITDA (which legitimately differ, since one is GAAP and the other reflects defined-term addbacks — that is not a conflict, §C.1's `covenantEbitda`/`gaapEbitda` split already keeps them as separate facts); or, genuinely conflicting, two compliance certificates for the same period reporting different cash balances due to a restatement, or a preliminary earnings release later revised.

### P.2 Policy (conceptual, not implemented)

```
FactConflict {
  factKey: string                    // which FinancialState field
  companyId, asOfDate
  candidates: ProvencancedFact<number>[]   // ≥2 sources for the "same" fact, never silently merged into one
  conflictStatus: "SINGLE_SOURCE" | "CONCORDANT" | "DISPUTED"
  resolution?: { winningFactIndex: number; resolvedBy: string; resolvedAt: Date; rationale: string }
}
```

Resolution rules, stated as policy rather than an automatic heuristic:

1. **Never silently pick one.** Both candidate facts are retained (append-only, mirroring `LegalReviewRecord`'s/`DefinedTerm`'s own never-delete philosophy); a `DISPUTED` conflict is a first-class, visible state, not resolved by taking the newer, the higher, or the more-certified value automatically.
2. **Context determines which candidate is authoritative for which purpose, never globally.** For a fact feeding a *covenant* requirement (via §L's adapter), the covenant-defined/certificate figure is authoritative **for that requirement's evaluation only** — it never overwrites the GAAP figure used elsewhere on the dashboard. For ordinary financial analytics (§G), GAAP-as-reported is the default unless a certificate figure is `VERIFIED` and more current, in which case it is surfaced *alongside*, not instead of, the GAAP figure.
3. **A `DISPUTED` conflict that a solver requirement depends on resolves that requirement to `UNKNOWN`**, exactly like a stale or missing fact (§O.2) — a conflict is never auto-resolved by a source-precedence heuristic when the result would flow into a contractual conclusion. Resolution requires an explicit human act, recorded as `FactConflict.resolution`, which creates a new `VERIFIED`, superseding fact — never a silent overwrite of either original candidate.

---

## Q. CFO dashboard data contract

Building on exactly what `app/position`, `app/simulate`, `app/ledger` already render (§B.5), generalized into one read-side contract the financial core supplies (design only — no UI is built or changed):

```
CfoDashboardData {
  companyId, asOfDate

  financialPosition: {
    state: FinancialState                       // periodType: ACTUAL, the latest
    metrics: LeverageMetrics & FinancialMetrics  // both the existing covenant metrics AND the new financial-analytics metrics, clearly labeled as distinct
  }

  capitalStructure: {
    facilities: (Facility & { outstandingPrincipal: number; nextMaturity?: Date })[]
    totalDebt: number
    weightedAverageCouponPct: number
  }

  liquidity: LiquidityPosition

  maturityWall: MaturityWall

  debtService: DebtServiceProjection[]

  covenantCapacity: {
    // Exactly today's Position-page headline shape, unchanged - the
    // financial core does not redefine what this means, only supplies its
    // own facts as the input that produced it.
    crossDocumentSecured: CrossDocumentCapacity
    crossDocumentUnsecured: CrossDocumentCapacity
    perDocument: DocumentCapacityResult[]
  }

  forecast?: ForecastSet

  // Per-figure provenance/staleness, so every number on the dashboard can be
  // hovered/expanded to its source and age (§M/§O) - never a bare number.
  provenanceIndex: Record<string, { fact: ProvencancedFact<unknown>; isStale: boolean; stalenessDays?: number }>
}
```

---

## R. Scenario output contract

Per the pipeline diagram's own terminal description ("COMBINED CFO DECISION SUPPORT... PROVENANCE / REVIEW / EXPLANATION"):

```
ScenarioResult {
  scenarioId
  companyId
  actionsApplied: ScenarioAction[]

  financialImpact: {
    baseState: FinancialState
    proFormaState: FinancialState              // periodType: PRO_FORMA
    perActionDeltas: FinancialStateDelta[]
    metricsBeforeAfter: { metric: string; before: number; after: number }[]
  }

  legalCapacity: {
    // Exactly the solver's own, UNMODIFIED result objects (§L.4) - never
    // reconstructed or summarized into a lossy scalar.
    perDocument: PerDocumentDebtResult[]
    overallStatus: TransactionStatus
  }

  remainingHeadroom: {
    covenantHeadroom?: number                   // from legalCapacity, unmodified
    liquidityHeadroom: number                   // from financialImpact's pro forma LiquidityPosition
  }

  warnings: {
    category: "STALE_INPUT" | "DISPUTED_FACT" | "UNMODELED_COVENANT" | "MISSING_ASSUMPTION" | "FORECAST_DRIVER_UNCERTAIN"
    description: string
    affectedFacts?: string[]
  }[]

  sourceTrace: SourceCitation[]                 // deduplicated across BOTH the financial-core computation and the solver's own `sources` (§N of the solver doc) - one combined citation list, never two the reader has to reconcile
}
```

---

## S. Integration boundaries

### S.1 Financial core vs. covenant solver

One-directional dependency, enforced by module layout (§U): `lib/financial-core/*` may import from `lib/solver/types.ts` (to produce values of the solver's own request types) and, at its single adapter/service boundary, call `lib/solver/service.ts`'s `runSolver`/`lib/covenant-engine.ts`'s `simulateDebtIncurrence`. **Nothing in `lib/solver/**` or `lib/covenant-engine.ts`'s existing exports may import from `lib/financial-core/*`** — this preserves the exact "zero Permission rows → zero behavior change" and "legacy engine untouched" guarantees the solver work already established, now extended to "financial core added → zero solver behavior change until a caller opts into the new adapter," the same opt-in posture `docs/solver-architecture-design.md` §Q used for the coverage gate itself.

### S.2 Financial core vs. future ERP/bank-feed integrations

**Not built here.** The financial core's `FinancialState`/`Facility`/`DebtEvent`/`ExternalInputRecord`-shaped facts are designed to be populated by a future source-adapter layer (an ERP export, a bank-feed API, a trustee report parser) that this document deliberately does not design beyond naming the seam: any such integration would be a new, additive "source" that produces `ProvencancedFact<T>` values with `sourceType`/provenance filled in correctly — it would not require a different `FinancialState` shape, because the canonical state is designed source-agnostically from the start (§C.1's `ProvencancedFact<T>` wrapper is exactly the abstraction that makes "where a fact came from" swappable without changing what the fact *is*). Named as the deferred integration point (§X), not designed further.

### S.3 Financial core vs. UI

Not built or changed here (`app/**` is frozen for this task). §Q/§R's contracts are designed so that when UI work begins, it consumes these shapes exactly the way `app/position/page.tsx` already consumes `CovenantPosition` today — read-only, server-rendered where possible, with the client-side `simulateDebtIncurrence` recomputation pattern (`app/simulate/SimulateClient.tsx`) extended, not replaced, to also recompute `runScenario` client-side (both are pure, deterministic functions, safe to run per-keystroke).

---

## T. Proposed data model

**Design-only — no Prisma migration, no schema.prisma change.** Each entity justified against the table-vs-JSON question the way `docs/solver-architecture-design.md` §R already does for the solver's own schema.

| Entity | Table or JSON? | Why |
|---|---|---|
| `FinancialState` | **Table** | Needs independent effective-dating, versioning, and query-by-`(companyId, asOfDate, periodType)` — exactly the reasoning that already justifies `FinancialSnapshot`/`Document` being tables. |
| `FinancialStateFact` (or: extend `ExternalInputRecord` with a nullable `financialStateId`/`fieldKey`) | **Table** (join-like; §M.2 states the two viable shapes and recommends extending `ExternalInputRecord` over a parallel table, since the shape — kind/value/asOfDate/sourceRef/reviewStatus/maxAgeDays — is already identical) | Per-fact provenance needs independent staleness/conflict lifecycle (§O/§P), not embeddable as JSON without losing per-fact queryability the same way `ExternalInputRecord` itself needed a table. |
| `Facility` | **Table** | Durable cross-time identity, referenced by `DebtEvent`, `AmortizationSchedule`, `CollateralPool` scopes, and dashboard queries — the same justification `CovenantProvision`/`Permission` already have for being tables rather than JSON on `Document`. |
| `DebtEvent` | **Table** | An event log needs to be queried chronologically and per-facility independent of any single `FinancialState` row; append-only history, same shape-justification as `LedgerEntry` already being a table. |
| `AmortizationSchedule` | **Table**, `steps` as **JSON** on the row | The schedule's own identity (per-facility, one active schedule at a time) is relational; its step list is a small, facility-specific, non-cross-referenced array — same reasoning `docs/solver-architecture-design.md` §R already applies to `EligibilityCondition`/`TermCondition` being JSON on `Permission`. |
| `ForecastSet` | **Table**, `drivers` as **JSON** | Needs independent identity/lifecycle (a forecast can be superseded by a later one without deleting history); `periods` are ordinary `FinancialState` rows referencing it by FK, not embedded. |
| `Scenario` | **Table**, `actions` as **JSON** (ordered array) | Mirrors `docs/solver-architecture-design.md` §R's treatment of `PermissionPath`/`SolverResult`: **not** persisted as "the true record" by default (an ephemeral computation), but — unlike those — a *named, saved* scenario is a real, previously-flagged-as-open product question (`legal-model-remediation-design.md` §12, still open) this document does not resolve; if scenarios need to be saved/shared, `Scenario` as a lightweight table with `actions` as an ordered JSON array is the natural shape, decided at that later time, not assumed here. |
| `ScenarioResult` | **NOT a table** — computed, request-scoped output only | Same reasoning as `PermissionPath`/`SolverResult` not being persisted (§R of the solver design doc) — conflating an ephemeral computation with durable facts risks the same staleness problem this document spends §O naming. |
| `FactConflict` | **Table** | Needs its own lifecycle (`DISPUTED` → `resolution`) independent of either candidate fact, and needs to be queryable ("every unresolved conflict for company X") — same justification `RuleActivationCondition` already has for being a table rather than JSON on one permission. |

New/extended enums (additive, mirroring the existing pattern): `PeriodType`, `FacilityType`, `CouponType`, `DebtEventType`, `AmortizationScheduleType`, `ScenarioActionKind`, `ConflictStatus`.

**Deliberately not over-normalized**: `ScenarioAction`'s per-kind payload fields, `FinancialState.covenantMetricFacts.covenantEbitda.addbacks`, and `MaturityWallEntry`/`DebtServiceProjection` (computed, not stored — derived on read from `Facility`/`AmortizationSchedule`/`DebtEvent`, the same "computed output, not a table" treatment §R of the solver doc gives `PermissionPath`) are all JSON/in-memory, not tables, for the identical reason the solver design doc gives for `EligibilityCondition`/`TermCondition`: heterogeneous, narrowly-scoped, no cross-referencing need from other entities.

---

## U. Module boundaries

Directory-level organization, mirroring the existing `lib/solver/*` pattern exactly:

```
lib/financial-core/
  types.ts            // FinancialState, Facility, DebtEvent, ProvencancedFact<T>, ScenarioAction, etc. -
                       // pure domain vocabulary, imports FROM lib/solver/types.ts where a shape is reused
                       // (EntityClass, MeasurementBasis, ProvenanceWrapper, SourceCitation), never redefines them
  capital-structure.ts  // Facility/DebtEvent pure logic - outstanding balance, refinancing lineage
  liquidity.ts         // LiquidityPosition computation (§F)
  metrics.ts           // FinancialMetrics (§G) - explicitly NOT computeLeverageMetrics, which stays in covenant-engine.ts
  debt-service.ts      // AmortizationSchedule/DebtServiceProjection/DSCR (§H)
  maturity.ts          // MaturityWall/WAL/RefinancingRiskFlag (§I)
  forecast.ts          // ForecastSet construction (§J)
  scenario.ts          // runScenario, ScenarioAction application (§K)
  provenance.ts        // ProvencancedFact helpers, staleness (§O), conflict detection (§P)
  solver-adapter.ts     // projectToLegacySnapshot, toSolverNativeCompanyContext, toHistoricalState (§L) -
                       // the ONLY file in this package permitted to import from lib/covenant-engine.ts's
                       // SolverNativeCompanyContext or call simulateDebtIncurrence/runSolver
  dashboard.ts         // CfoDashboardData/ScenarioResult assembly (§Q/§R) - pure aggregation over the above
  service.ts           // the package's own single entry point, mirroring lib/solver/service.ts's runSolver -
                       // e.g. runScenarioAgainstCovenants(scenario, companyContext): ScenarioResult

lib/financial-core-db/  // (or a `db.ts` per module, mirroring covenant-engine.ts's own pure-core/adapter split)
  adapter.ts            // Prisma reads/writes for the §T tables - thin, structurally typed, same
                       // CovenantEnginePrismaClient-style minimal-interface pattern lib/covenant-engine.ts uses
```

This mirrors `lib/solver/*`'s own successful split (pure domain types → pure evaluation logic → a single service entry point → a separate DB adapter added later, only once the pure core is proven) and keeps the one-directional dependency from §S.1 enforceable by simple import-graph inspection, not just by convention.

---

## V. Gap matrix

| Capability area | Exists today | This architecture requires |
|---|---|---|
| Canonical financial state | Three near-duplicate 8-field scalar shapes (`FinancialSnapshot`/`FinancialSnapshotInput`/solver `FinancialState`) | One canonical `FinancialState` (§C) with balance-sheet/income-statement/covenant-metric fact separation, provenance, versioning; legacy shapes become projection targets |
| Capital structure | `DebtTranche` — flat, no durable identity, no terms | `Facility` — durable, termed, entity/collateral-linked (§D) |
| Debt events | `LedgerEntry` — flat, company-wide, no facility link | `DebtEvent` — facility-scoped, richer event taxonomy, feeds solver `HistoricalState` (§E) |
| Liquidity | Not modeled at all | `LiquidityPosition` engine (§F), reusing the solver's existing borrowing-base/external-input boundary |
| Ordinary financial metrics | `computeLeverageMetrics` only (covenant-scoped) | `FinancialMetrics` engine, clearly separated from covenant metrics (§G) |
| Interest/debt service | Not modeled (FCCR = interest-only) | `AmortizationSchedule`/`DebtServiceProjection`/DSCR (§H) |
| Maturity analytics | Not modeled | `MaturityWall`/WAL/refinancing-risk (§I), feeds solver's existing but unpopulated `weightedAverageLife` input |
| Forecasts | Not modeled | `ForecastSet`, `periodType`-discriminated (§J) |
| Scenario composition | Single-transaction simulation only (`simulateDebtIncurrence`/`simulateRestrictedPayment`/`simulateAssetSale`), no multi-action ordering | `Scenario`/`runScenario`, ordered composition (§K) |
| Covenant-solver adapter | `SolverNativeCompanyContext`/`buildLiveTransaction` exist but are hand-populated per call site with hardcoded/omitted fields | Full adapter functions (§L) populating every field from real financial-core data |
| Financial-data provenance | `ExternalInputRecord` exists, solver-external-input-scoped only, zero rows for any company | Generalized to every financial-core fact (§M) |
| Staleness | `ExternalInputRecord.maxAgeDays` exists, unused by any live code path | Generalized `isStale` check, two-context consequence split (§O) |
| Conflict resolution | Not modeled | `FactConflict` policy (§P) |
| CFO dashboard contract | Ad hoc, per-page (`app/position`/`simulate`/`ledger`), no unified shape | `CfoDashboardData` (§Q) |
| Scenario output contract | `DebtIncurrenceSimulation`/`PerDocumentDebtResult` (single-transaction only) | `ScenarioResult` (§R), wrapping solver output unmodified |

---

## W. MVP prioritization

**In scope for a first useful version** (ordered by dependency, not by section number):

1. Canonical `FinancialState` + `projectToLegacySnapshot` (§C) — everything else depends on this existing and correctly reproducing today's legacy behavior byte-for-byte when projected.
2. `Facility`/`DebtEvent` (§D/§E) — minimal fields only (no amortization schedule yet); enough to replace `DebtTranche`'s display role with something that has durable identity.
3. Financial metric engine (§G) — the highest-value, lowest-risk addition (pure functions over already-modeled facts, no new schema dependency beyond `FinancialState`).
4. Liquidity engine (§F), reusing the solver's existing `ExternalInputRecord`/`ExternalInputs` boundary without waiting on a `BORROWING_BASE` `FormulaType` to exist.
5. Solver adapter (§L) — `projectToLegacySnapshot` and `toSolverNativeCompanyContext`, proven against the existing synthetic solver fixtures (Cases A–J) reused as-is, never re-derived, plus new financial-core-specific adversarial cases (§Y).
6. Provenance/staleness (§M/§O) — generalizing `ExternalInputRecord`, since every other MVP piece benefits from it immediately and it is a small, additive extension of something already built.
7. `CfoDashboardData` contract (§Q) as a data shape (no UI) — proves the read-side design is complete before any UI work is proposed.

**Deferred past MVP** (§X gives the full, explicit list): amortization schedules/debt-service engine (§H), maturity analytics (§I), forecast architecture (§J), the full generalized scenario engine beyond single-action scenarios (§K), conflict resolution (§P) beyond simple two-source detection, and any UI work at all.

---

## X. Deferred capabilities

Named explicitly, not silently dropped:

- **ERP integrations** (§S.2) — no connector to any ERP system is designed or built; the source-adapter seam is named only.
- **Real-time bank feeds** — no live cash-position ingestion; `FinancialState.balanceSheetFacts.cash` remains a periodically-updated fact like every other, with staleness surfaced (§O), not eliminated by real-time data.
- **Multi-entity consolidation beyond `EntityClass` scoping** — cross-currency consolidation, minority-interest treatment, and equity-method-investee handling are not designed; `FinancialState.scope: EntityScopeRef` supports a single company's own `EntityClass`-scoped views (consolidated vs. a Restricted-Subsidiary subset), not a multi-company portfolio roll-up.
- **Full amortization/derivative/hedge accounting** — `AmortizationSchedule` (§H) models scheduled principal/interest only; interest-rate swaps, caps, and hedge-accounting treatment are out of scope.
- **Tax modeling** — no cash-tax or deferred-tax projection; `freeCashFlow` (§G) is left with cash taxes as an optional, not-computed input where unavailable.
- **Detailed working-capital modeling** — `WORKING_CAPITAL_CHANGE` (§K.1) is a single scalar scenario action, not a full AR/AP/inventory-driven model.
- **Credit-rating-agency-style forecasting** (scenario-weighted probabilistic forecasts, Monte Carlo) — `ForecastSet` (§J) is single-path, driver-based; no probabilistic/distributional forecasting is designed.
- **Portfolio-level (multi-company) analytics** — every shape in this document is single-company-scoped, matching the existing solver's own company-scoped posture; a lender/portfolio-level rollup across companies is not designed.
- **Named/saved scenario persistence, resolved** — `Scenario` as a table is proposed (§T) but the product decision of whether/how scenarios are saved and shared remains the already-flagged open question from `legal-model-remediation-design.md` §12, not resolved here.

---

## Y. Company-agnostic acceptance tests

Test shapes, not test code, in the same spirit as the solver's synthetic Cases A–J — every case below must be constructible for at least two structurally different synthetic companies (differing in facility count/shape, not just dollar amounts), proving genuine generalization rather than incidental compatibility, exactly the discipline `tests/synthetic-company.test.ts` already established for the solver.

| Case | What it proves |
|---|---|
| Actual-state round-trip | `projectToLegacySnapshot(state)` applied to a hand-built `FinancialState` reproduces the exact `FinancialSnapshotInput` `computeCovenantPosition` would need — byte-identical, no silent field substitution |
| Pro forma feeds the solver correctly | `runScenario` producing a `PRO_FORMA` state, projected and passed to `simulateDebtIncurrence`, yields the identical `PerDocumentDebtResult` as calling `simulateDebtIncurrence` directly with the hand-computed equivalent pro forma numbers — proving the adapter introduces no distortion |
| Scenario ordering matters | The same two-action scenario, run in both orders, produces two different pro forma states where a downstream leverage-gated requirement's result differs — proving `runScenario`'s strict ordering is load-bearing, not cosmetic |
| Stale input blocks a dependent requirement | A `FinancialState` fact past its `staleness.maxAgeDays` window, feeding a solver `RequirementResult` (via §L's adapter), resolves that requirement to `UNKNOWN` — never silently reused |
| Stale input surfaces, doesn't block, on the dashboard-only path | The identical stale fact, consumed only by `CfoDashboardData` (not by any solver requirement), renders with an explicit staleness badge and no hard failure |
| Conflicting facts detected, never silently merged | Two sources for the same fact with different values produce a `FactConflict` with `conflictStatus: DISPUTED`, both candidates retained, no automatic winner |
| Disputed fact blocks a dependent requirement | A `DISPUTED` fact feeding a solver requirement (via the adapter) resolves that requirement to `UNKNOWN`, identically to the stale-input case |
| GAAP vs. covenant EBITDA never conflated | A company whose `gaapEbitda` and `covenantEbitda` genuinely differ (addbacks present) produces two distinct, separately-provenanced facts on the same `FinancialState`, and `projectToLegacySnapshot` uses only the covenant-scoped figure, never the GAAP one, for the legacy `ebitda` field |
| Maturity wall / WAL correctness | A synthetic multi-facility capital structure with staggered maturities and at least one amortizing facility produces a `MaturityWall` whose per-period totals sum to total outstanding principal, and a WAL calculation matching the standard definition by hand-computation |
| Forecast never conflates with actual | A `ForecastSet`'s periods, all `periodType: FORECAST`, are never returned by any query that explicitly asks for the latest `ACTUAL` state, even when a forecast period's `asOfDate` is closer to "now" than the last real actual |
| Structural generalization (two differently-shaped synthetic companies) | Every case above, re-run against a second synthetic company whose facility count, amortization shapes, and covenant structure differ in kind (not just amount) from the first, with zero company-specific branching anywhere in `lib/financial-core/*` |
| Non-mutation / purity | `runScenario` and every financial-core pure function leave their input objects unchanged (mirroring the existing `tests/solver/service.test.ts` assertion that `runSolver`'s inputs are unmutated) |
| Legacy zero-behavior-change | With the financial core fully implemented but not wired into any existing call site, the full existing vitest suite and golden-test suite (30/30 Coherent rows) pass byte-for-byte identically — the same guarantee `docs/solver-implementation-phases-0-7-report.md` §M proved for the solver's own Phase 0–7 landing |

---

## Z. Implementation phases

Each phase independently auditable and mergeable without depending on a later phase's code existing — the same discipline `docs/solver-architecture-design.md` §V used, which the solver's own implementation report (`docs/solver-implementation-phases-0-7-report.md`) confirms was followed successfully in practice.

| Phase | Scope | Auditable because |
|---|---|---|
| **0** | Land this document; no code | Design review only, against real types/functions already cited throughout |
| **1** | Add the full new schema surface (§T) — every table, all additive/nullable, zero rows populated, zero code reads them | Pure schema diff, reviewable against §T's own justification table; provably zero behavior change |
| **2** | Build `lib/financial-core/types.ts` + `provenance.ts` (§M/§O) as pure, additive types/functions — no DB, no solver import | Pure-function core, unit-testable in isolation against synthetic fixtures, exactly like `lib/solver/types.ts`'s own Phase 2 landing |
| **3** | Build `capital-structure.ts`/`metrics.ts`/`liquidity.ts` (§D/§F/§G) as pure functions over in-memory `FinancialState`/`Facility`/`DebtEvent` objects | Independently testable — no forecast, no scenario engine, no solver adapter needed yet |
| **4** | Build `debt-service.ts`/`maturity.ts` (§H/§I) | Pure extensions of Phase 3's capital-structure objects; independently testable against hand-computed schedules |
| **5** | Build `forecast.ts` (§J) | Depends only on Phase 2's `FinancialState` shape; testable against synthetic driver assumptions |
| **6** | Build `scenario.ts` — `runScenario` (§K) — as a pure function composing Phases 3–5's outputs | Testable in complete isolation from the solver: assert pro forma `FinancialState` correctness without ever calling `runSolver` |
| **7** | Build `solver-adapter.ts` (§L) — `projectToLegacySnapshot`, `toSolverNativeCompanyContext`, `toHistoricalState` — as pure functions, still with no live DB wiring into any existing call site | Testable against the solver's own already-existing synthetic fixtures (Cases A–J), asserting the adapter reproduces the exact same `SolverResult` those fixtures already assert, when fed equivalent financial-core-shaped input |
| **8** | Run the full existing vitest + golden-test suite with the financial-core package fully present but not wired into any real call site | Pass/fail is binary and mechanical — proves zero behavior change, mirroring `docs/solver-implementation-phases-0-7-report.md` §M's own Phase-7-equivalent regression gate |
| **9** | Build `lib/financial-core-db/adapter.ts` (Prisma reads/writes for §T's tables) and `dashboard.ts`/`service.ts` (§Q/§R assembly) | Reviewable against the existing `loadCompanyCovenantData`/`getSolverStaticData` adapters it mirrors; still wires into nothing existing |
| **10** | Wire one real call site (a new, additive route or an extension of an existing one — explicitly **not** designed or committed to in this document) to actually invoke `runScenarioAgainstCovenants` | The first phase that touches `app/**` at all — deliberately last, deliberately out of this document's own scope, named only so the phase list is honest about where UI work begins |

Phases 1–9 require no UI change, no new real company, and no ERP/bank-feed integration — they are the bulk of the engineering work and can proceed under the same freeze conditions this document itself operated under. Phase 10 is the first phase this document does not authorize starting.

---

## AA. Recommendation

**READY_TO_IMPLEMENT_FINANCIAL_CORE.**

Grounds, stated against the same evidentiary bar the solver's own hardening report used for its `READY_FOR_FINANCIAL_ARCHITECTURE` verdict:

1. **The boundary this document depends on is proven, not assumed.** The covenant solver is independently verified (`docs/solver-hardening-live-integration-report.md`, verdict `READY_FOR_FINANCIAL_ARCHITECTURE`) to be deterministic, fail-closed, and safe to build on — every readiness criterion that verdict lists is a precondition this document's §L relies on, and none of them is weakened by anything proposed here, because nothing here modifies `lib/solver/**`.
2. **Every new concept traces to a real, cited gap, not an invented one.** §V's gap matrix is built entirely from concrete artifacts already in the repository (real type names, real function signatures, real schema tables) — this document does not speculate about what the solver or engine "probably" look like; it reads them directly (§B).
3. **The financial-data provenance pattern this document generalizes is not new — it already exists and already works.** `ExternalInputRecord`/`ProvenanceWrapper<T>` are real, tested, and were specifically designed (per the solver design doc's own §K) to generalize beyond a single use case. §M extends an already-proven pattern rather than inventing a competing one.
4. **The fact-vs-judgment boundary (§L.3) is the same boundary the legal-review-status model already established and the solver hardening work already exercised in practice** (financial-data provenance vs. legal-review provenance vs. engineering-execution status, never collapsed) — this document's fourth dimension (financial-analytics correctness) is a natural, low-risk extension of a pattern proven to hold under real, adversarial review (`docs/legal-review-status-model.md` §5).
5. **The remaining gaps are genuinely engineering-scoped, not open design questions.** The `RunSolverParams`/`SolverRequest` narrowing (§B.2/§L.2), the missing `BORROWING_BASE` `FormulaType` (§F.1), and the not-yet-built amortization/forecast/scenario engines (§H–§K) are all named, bounded, and independently phaseable (§Z) — none of them requires resolving an open architectural question before Phase 1 can begin.

No genuine blocker was found. A company-specific covenant uncertainty (e.g., Coherent's Phase 8 data-population dependency) is not a blocker for this document, exactly as it was not a blocker for the solver hardening work — this document builds a subsystem that operates identically regardless of whether any real company's `Permission` rows are ever populated. A missing Coherent input (uncertified EBITDA, §B.3) is not a blocker — it is the first concrete instance of the exact staleness/provenance problem this document's §M/§O are designed to generalize. A deferred-to-post-MVP capability (§X) is not a blocker by the standard this document was given. Phases 1–9 (§Z) may proceed on the strength of this design alone; Phase 10 (the first UI/live-wiring phase) remains correctly gated on a separate, later authorization, exactly as this document's own scope freeze requires.

---

*End of design document. No application code, Prisma schema, engine code, solver code, seed data, golden tests, or UI were modified in producing this file.*
