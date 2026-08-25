# Headroom — Financial Core Vertical Slice: Implementation Report

**Status: IMPLEMENTED.** This document reports code actually written, migrated, tested, and executed against a real Postgres database — not a design or plan. Controlling architecture: `docs/generalized-financial-analytics-architecture.md` (commit `2a175b3`). This report covers Phases 1–9 of that document's §Z phase list. Phase 10 (UI wiring, `app/**`) is explicitly out of scope and was not touched.

---

## A. Baseline

Captured before any implementation code was written (Postgres started fresh via `service postgresql start`):

| Check | Result |
|---|---|
| git HEAD | `2a175b3` ("Add generalized financial-analytics architecture design doc") |
| git status | clean |
| `prisma migrate status` | 8 migrations, "Database schema is up to date!" |
| Full vitest suite | **171/171 passing** (14 test files) |
| Golden-test harness | **29 passed, 0 failed, 1 flagged out-of-scope** (30 total) |
| `tsc --noEmit` | clean |
| ESLint | clean |
| Production build (`next build`) | succeeds, 7 routes |
| Coherent DB counts | companies=1, financial_snapshots=1, permissions=22, permission_relationships=19, shared_capacity_constraints=2, solver_coverage_declarations=6, legal_review_records=13, golden_tests: UNVERIFIED=22 / FOUNDER_AND_PEER_REVIEWED=8 |

No pre-existing failures were found (the repository was fully green once Postgres was started — the initial vitest run without Postgres running showed 23 failures, all Prisma connection errors, resolved by `service postgresql start`).

---

## B. Schema changes

One additive migration: `prisma/migrations/20260825033851_add_financial_core_vertical_slice/migration.sql`, generated via `prisma migrate diff` against a shadow database and applied with `prisma migrate deploy`.

New enums: `period_type`, `facility_type`, `coupon_type`, `debt_event_type` (the last extends architecture §E.1's own enum with `LC_ISSUANCE`/`LC_EXPIRATION`, needed by the ABL/LC fixture).

New tables (architecture §T's minimum slice, per its own scope note):
- **`financial_states`** — the canonical `FinancialState` (architecture §C). Fact groups (`balanceSheetFacts`, `incomeStatementFacts`, `covenantMetricFacts`, and an additive `liquidityFacts` extension for revolver/ABL-specific facts) are stored as JSONB, each individual fact shaped as a `ProvencancedFact<T>` — never a bare number.
- **`facilities`** — the durable, termed capital-structure instrument (architecture §D), with an additive `commitmentAmount`/`borrowingBaseAtOrigination`/`rateFloorPct` beyond the design doc's own sketch.
- **`debt_events`** — the facility-scoped event log (architecture §E), the source of truth for a facility's outstanding balance (never a stored "current balance" column).
- **`external_input_records`** extended (additive, nullable columns: `financialStateId`, `facilityId`, `fieldKey`) per architecture §M.2's explicit recommendation to reuse this table rather than build a parallel one.

**Deliberately not built in this slice** (per architecture §W/§X and the task's "minimum slice" instruction): `ForecastSet`, a persisted `Scenario` table, `FactConflict`, `AmortizationSchedule` as a separate table. See §W below.

`prisma validate` and `prisma migrate status` both pass; zero rows were populated by the migration itself. Coherent's existing tables/rows are untouched — see §U.

---

## C. Financial state

`lib/financial-core/types.ts`'s `FinancialState` implements architecture §C.1 exactly: `balanceSheetFacts`/`incomeStatementFacts`/`covenantMetricFacts` (plus the additive `liquidityFacts`), every fact a `ProvencancedFact<T>` (`ProvenanceWrapper<T>` from `lib/solver/types.ts`, extended with `asOfDate`/`staleness`). `periodType: "ACTUAL" | "FORECAST" | "PRO_FORMA"` is the single discriminator (architecture §J.1) — `FORECAST` itself is not built this slice (deferred, §W), but the type accommodates it. No hardcoded covenant conclusions, basket capacities, or persisted "headroom" numbers appear anywhere in the type.

---

## D. Capital structure

`lib/financial-core/capital-structure.ts`. `computeOutstandingPrincipal`/`computeLcUsage` replay `DebtEvent` rows (never a stored balance — architecture §D.1's explicit requirement). `buildCapitalStructureSummary` computes gross/net/secured/unsecured/fixed-rate/floating-rate debt from `Facility[]`/`DebtEvent[]`, deterministically sorted by maturity date then id.

---

## E. Liquidity

`lib/financial-core/liquidity.ts`. Keeps CASH / RESTRICTED CASH / AVAILABLE CASH / UNDRAWN COMMITMENT / BORROWING-BASE AVAILABILITY / TOTAL LIQUIDITY strictly distinct (task §7). For an `ABL` facility with no certified `borrowingBaseValue` on record, availability fails closed (`UNAVAILABLE_REVIEW_REQUIRED`, `null`) **without** suppressing independent cash/debt/leverage analytics. A component trace explains every figure. See §P for Company B's numeric proof.

---

## F. Generic financial metrics

`lib/financial-core/metrics.ts`. Generic gross/net/secured leverage and interest coverage — explicitly named and typed distinct from `computeLeverageMetrics` (`lib/covenant-engine.ts`, untouched). Missing or zero denominators return an explicit `UNAVAILABLE_MISSING_INPUT`/`UNAVAILABLE_INVALID_DENOMINATOR` status with `value: null` — never a silent zero, never a manufactured `Infinity` (verified by adversarial tests).

---

## G. Interest / debt service

`lib/financial-core/interest.ts`. `FIXED = principal × coupon`; `FLOATING = principal × (benchmark + spread)`, floored where modeled. A `FLOATING` instrument whose `referenceRate` has no matching caller-supplied assumption is surfaced (`MISSING_BENCHMARK_ASSUMPTION`), never defaulted. No live SOFR feed. Company-wide weighted-average coupon (`computeWeightedAverageRatePct`) fails closed (`null`) if **any** outstanding instrument's rate is unresolved, rather than silently excluding it from the denominator.

---

## H. Maturity analytics

`lib/financial-core/maturity.ts`. Next maturity, 12/24/36-month buckets, an annual maturity wall, and a bullet-maturity-model WAL — all driven by the supplied `asOfDate`, never `Date.now()`. Verified exact-inclusive at a 12-month boundary and excluded one millisecond past it (adversarial test).

---

## I. Scenario engine

`lib/financial-core/scenario.ts`. `ScenarioAction` kinds: `DEBT_ISSUANCE`, `DRAW_REVOLVER`, `DEBT_REPAYMENT`, `REFINANCING`, `DIVIDEND`, `SHARE_REPURCHASE`, `ASSET_SALE`, `ACQUISITION`, `CHANGE_EBITDA`, `RATE_ASSUMPTION_CHANGE`, `WORKING_CAPITAL_CHANGE` — architecture §K.1's own names used verbatim everywhere they overlap; `DRAW_REVOLVER`/`CHANGE_EBITDA` added (documented in `types.ts`) because the architecture's own §K.1 list didn't enumerate them but task §11/§19–23 require them as distinct, directly-testable actions.

---

## J. Ordered state transformation

`runScenario` applies `actions` strictly in array order, each threading its output `FinancialState`/`Facility[]`/`DebtEvent[]` into the next action's input (architecture §K.2). Pure: deep-clones every input, never mutates, never touches Postgres, never calls the solver. Fails closed (throws) on an action that would produce an impossible state — verified for revolver draws beyond availability, repayments beyond outstanding principal, cash-negative transactions, and acquisition sources/uses imbalance. The **duplicate-action-ordering** adversarial test proves each action is validated against the state the *prior* action produced, not re-checked against the original base state.

---

## K. Financial state deltas

Every action returns a `FinancialStateDelta` (cash/debt/liquidity/EBITDA/interest deltas, new/modified facility ids, maturity-change notes). `ScenarioRunResult.perActionDeltas` preserves the full per-action audit trail.

---

## L. Covenant-solver adapter

`lib/financial-core/solver-adapter.ts` — the only file in `lib/financial-core/**` that imports `SolverNativeCompanyContext`/`FinancialSnapshotInput` from `lib/covenant-engine.ts` or calls `simulateDebtIncurrence`/`runSolver` (enforced by code review; the §25 grep found zero company-name/document-id branching in this or any other production financial-core file).

- `projectToLegacySnapshot(state)` — the exact projection architecture §C.2/§L.1 specifies. Prefers `covenantEbitda` over `gaapEbitda`; returns `NOT_COMPUTABLE` (never a silent zero) when both are absent.
- `toSolverNativeCompanyContext(params)` — populates every `SolverNativeCompanyContext` field per §L.1's table; static Permission-graph rows come from the caller's own DB read, never originated here.
- `toHistoricalState(events, permissions)` — replays `DebtEvent` rows into `BasketUsageRecord[]`/`priorIncurrences`/`prepayments`, ready for the still-narrower live `RunSolverParams` boundary (§L.2's named, not-yet-closed gap) without working around it.
- `evaluateContractualCapacity(...)` — the sole wrapper around `simulateDebtIncurrence`.

---

## M. Position service contract

`lib/financial-core/position-service.ts`. `getFinancialPosition(state, facilities, events, asOfDate, rateAssumptions)` — pure aggregation over Phases 3–4's engines, plus a `provenanceIndex` (per-figure source/staleness) and `warnings` (missing assumptions, stale facts, disputed facts). DB-free; `lib/financial-core-db/adapter.ts` is the only Prisma import point.

## N. Scenario service contract

`lib/financial-core/scenario-service.ts`. `runScenarioAgainstCovenants(params)` — runs the scenario engine, computes BEFORE/AFTER `FinancialPosition` with the identical engines (task §14: `analytics(currentState)`/`analytics(proFormaState)` are literally the same function calls), and — only when a `contractualTest` is supplied — projects the pro forma state through the adapter into the real solver. The contractual leg is optional; financial analytics are never suppressed when it is absent or unresolved.

---

## O. Synthetic Company A results (task §19)

Fixture Forge Industries: $500M revolver (partial draw), term loan, secured + unsecured fixed/floating notes, staggered maturities. Hand-computed and verified against a real Postgres load:

| Figure | Value |
|---|---|
| Gross debt | $1,070M |
| Net debt | $900M |
| Secured / unsecured debt | $820M / $250M |
| Fixed / floating split | 51.40% / 48.60% |
| Weighted-average rate | 7.3481% |
| Annualized cash interest | $78.625M |
| Generic gross / net / secured leverage | 2.14x / 1.80x / 1.64x |
| Generic interest coverage | 6.36x |
| Total liquidity | $530M ($150M available cash + $380M revolver availability) |
| Next maturity / 24-month bucket | Term loan, 2028-03-01, $400M |

## P. ABL/LC results (task §20)

Borderline ABL Logistics: $500M ABL commitment / $420M certified borrowing base / $50M drawn / $40M LC usage:

| Figure | Value |
|---|---|
| Commitment | $500M |
| Borrowing base | $420M |
| Undrawn commitment (commitment-based) | $410M |
| **Actual availability** (min(commitment, base) − drawn − LC) | **$330M** |
| Cash | $60M |
| **Total liquidity** | **$390M** |

All six numbers are proven distinct in a single assertion (`Set` size = 6). With the borrowing-base certificate absent: availability and total liquidity both fail closed (`null`/`UNAVAILABLE_REVIEW_REQUIRED`), while cash ($60M), gross debt ($230M), and generic gross leverage (1.917x) remain fully computed. With the base collapsed to $70M (below utilization): availability is reported as **−$20M**, surfaced explicitly rather than clamped.

## Q. Acquisition scenario results (task §21, §32)

Both the Company C test and the §32 acceptance script executed the identical $800M acquisition (Vantage Crest Holdings / Acceptance-Run Summit Holdings). Real printed output from the §32 acceptance script (`npx tsx scripts/financial-core-acceptance-run.ts`):

```
--- BEFORE ---
Cash:                        $300.00M
Available cash:              $300.00M
Gross debt:                  $200.00M
Net debt:                    $-100.00M
Secured debt:                $200.00M
Revolver availability:       $400.00M
Total liquidity:             $700.00M
Annualized cash interest:    $16.00M
Generic gross leverage:      0.67x (OK)
Generic net leverage:        -0.33x (OK)
Generic interest coverage:   18.75x (OK)
Next maturity:               Term Loan B on 2029-01-01 ($200M)

--- AFTER (pro forma) ---
Cash:                        $85.00M
Gross debt:                  $800.00M
Net debt:                    $715.00M
Secured debt:                $800.00M
Revolver availability:       $150.00M
Total liquidity:             $235.00M
Annualized cash interest:    $59.25M
Generic gross leverage:      1.90x
Generic net leverage:        1.70x
Generic interest coverage:   7.09x

--- FINANCIAL IMPACT (deltas) ---
Cash delta:                  $-215.00M
Gross debt delta:            $600.00M
Net debt delta:              $815.00M
EBITDA delta:                $120.00M
Interest delta:              $43.25M
Liquidity delta:             $-465.00M
Gross leverage delta:        1.24x

--- CONTRACTUAL IMPACT (real live solver) ---
Overall status: clear
Document "Acceptance-Run Credit Agreement": status=clear, capacity=250
  solver overall.status=CLEAR, amountTested=250
  permissionPathUsed legs: [{"permissionId":"arsh-perm-acquisition-facility","amountAllocated":250}]
Warnings: (none)

--- DATABASE NON-MUTATION ---
Persisted cash unchanged ($300M):        PASS
Persisted totalDebt unchanged ($200M):   PASS
Persisted facility count unchanged (2):  PASS
Facility rows in DB: 2 (expected 2)
DebtEvent rows in DB: 1 (expected 1)
Permission rows in DB: 1 (expected 1)

DATABASE NON-MUTATION: VERIFIED

ACCEPTANCE RUN: PASS
```

Sources ($200M cash + $250M revolver + $350M new secured notes = $800M) exactly funded the purchase price; fees ($15M) were cash-funded separately. Every number above was independently hand-computed in `tests/financial-core/synthetic-company-c-acquisition.test.ts` before assertion.

## R. Contractual-integration results (task §22)

Northgate Synthetic Manufacturing, a deliberately simple three-document solver-native fixture: a single $80M debt-issuance scenario tested against
- Document A ($150M capacity): **CLEAR**
- Document B ($50M capacity): **BLOCKED**
- Document C ($500M capacity, gated on an unresolved activation predicate): **REVIEW_REQUIRED** — while `after.position.metrics.genericGrossLeverage` (0.900, `OK`) and every other financial figure remained fully valid and un-suppressed.

Proven mechanically (not just by code inspection): projecting the `ScenarioResult`'s own returned pro forma state and calling `evaluateContractualCapacity` directly with it reproduces the identical solver result `runScenarioAgainstCovenants` produced internally — the solver evaluated the *same* pro forma `FinancialState` the financial engines analyzed, never a re-derived one.

---

## S. Provenance / trust

Every fact in `FinancialState`/`Facility`/`DebtEvent` is a `ProvencancedFact<T>` (`{ value, sourceType, reviewStatus, asOfDate, staleness? }`). `lib/financial-core/provenance.ts` implements `isStale`, `worstReviewStatus` (mirrors `evalExpr`'s existing `worstStatus` aggregation discipline — never a second rule), and `blocksContractualDependent`. Two-context consequence split verified: a stale/disputed fact feeding the solver is intended to resolve the dependent requirement to `UNKNOWN` (architecture §O.2 — the live `RunSolverParams` boundary doesn't yet route through this fact set, per §L.2's named gap); the identical stale/disputed fact consumed only by `getFinancialPosition` surfaces as an explicit `STALE_INPUT`/`DISPUTED_FACT` warning with a staleness-days badge and never hard-blocks the position.

---

## T. Adversarial test results (task §23)

19/19 passing (`tests/financial-core/adversarial.test.ts`), covering: zero EBITDA, missing EBITDA, zero total interest, missing benchmark assumption, overdrawn revolver, LC usage exceeding availability, maturity-exactly-on-a-12-month-boundary (inclusive) vs. one millisecond past (excluded), maturity-wall-sums-to-total-principal, transaction-larger-than-cash, revolver-draw-larger-than-availability, repayment-larger-than-outstanding, acquisition sources/uses imbalance, duplicate action ordering, scenario-ordering-produces-different-results, non-mutation (including for a throwing scenario), and staleness/disputed-fact behavior. Missing-borrowing-base (Company B) and contractual-solver-unavailable (Company D) are covered in their own fixtures, not duplicated here.

---

## U. Coherent non-regression

- `git diff` of `prisma/seed-data.ts`, `scripts/golden-test.ts`, `lib/covenant-engine.ts`, and `lib/solver/**` against the pre-task commit (`23874d6`/`2a175b3`): **empty** — byte-identical.
- Golden-test harness: **29 passed, 0 failed, 1 flagged out-of-scope** (identical to baseline).
- Coherent DB counts after full implementation: companies=1, financial_snapshots=1, permissions=22, permission_relationships=19, shared_capacity_constraints=2, solver_coverage_declarations=6, legal_review_records=13, golden_tests: UNVERIFIED=22 / FOUNDER_AND_PEER_REVIEWED=8 — **identical to baseline**.
- New financial-core tables (`financial_states`, `facilities`, `debt_events`) contain **0 rows** post-verification — every test fixture and the acceptance script clean up after themselves.
- `lib/financial-core/**`/`lib/financial-core-db/**` grepped for "Coherent" and every synthetic fixture company name: zero hits in production code (only doc-comment mentions of "synthetic fixture" generically).

---

## V. Full test results

| Check | Result |
|---|---|
| `prisma validate` | valid |
| `prisma migrate status` | up to date (9 migrations) |
| `tsc --noEmit` | clean |
| ESLint | clean |
| Full vitest suite | **199/199 passing** (19 test files: 14 pre-existing + 5 new financial-core files) — 171 pre-existing + 28 new |
| Golden-test harness | 29/30 pass, 1 out-of-scope (unchanged from baseline) |
| Production build (`next build`) | succeeds, 7 routes (unchanged from baseline — `app/**` untouched) |
| §32 acceptance script | **PASS** (see §Q above for full output) |

---

## W. Known limitations

- `FinancialState` facts are stored as JSON-embedded `ProvencancedFact` wrappers rather than a separate per-fact provenance table (architecture §T's `FinancialStateFact`/extended-`ExternalInputRecord` option). Per-fact provenance is fully present at the read layer; it is simply not independently SQL-queryable across states without deserializing the JSON. A future phase can migrate to per-fact rows if that queryability is needed.
- Maturity/WAL modeling assumes bullet maturities (no `AmortizationSchedule` table this slice) — sufficient for every fixture and test case this task requires, but a facility with scheduled amortization is not yet representable.
- `toHistoricalState`'s `reclassifications`/`redesignations`/`elections`/`stepUpCooldownHistory` are returned empty — no fixture in this slice exercises a `RECLASSIFICATION`/`REDESIGNATION` `DebtEvent`, and the live `RunSolverParams` boundary doesn't yet accept `historicalState` at all (architecture §L.2's named gap), so this was built to the minimum safe extent, not exhaustively.
- `FactConflict` (two-source dispute tracking) is not implemented as its own persisted lifecycle — `blocksContractualDependent`/`DISPUTED` review status covers the single-fact case this slice's tests exercise; multi-candidate conflict resolution (architecture §P) is deferred.
- `ForecastSet`/`periodType: "FORECAST"` construction is not implemented (deferred per §W/§X of the architecture itself).

---

## X. Deferred capabilities

Per the architecture's own §X and task §28, explicitly not built: ERP integrations, live bank feeds, `ForecastSet` construction, a persisted `Scenario` table, `FactConflict` beyond simple two-source detection, `AmortizationSchedule` as its own table, full FX/hedge accounting, purchase accounting, Monte Carlo, treasury write-back, lender portals, LME/enforcement, and all UI work (`app/**`, Phase 10).

---

## Y. Next recommended product slice

**Phase 10 — product/API + UI wiring**, per the architecture's own §Z: extend `app/simulate/SimulateClient.tsx`'s existing client-side `simulateDebtIncurrence` recomputation pattern to also invoke `runScenario`/`runScenarioAgainstCovenants` (both pure, deterministic, safe to recompute per-keystroke, exactly like the existing pattern), and extend `app/position/page.tsx` to render `getFinancialPosition`'s liquidity/capital-structure/maturity sections alongside today's covenant-capacity headline. A `lib/financial-core-db` write path (recording a real `Facility`/`DebtEvent` when a transaction actually closes, not just simulating one) would be the natural second half of that phase, since this slice's DB adapter is currently read-only by design (§9's scope).

---

## Verdict

**FINANCIAL_CORE_VERTICAL_SLICE_COMPLETE.**

The §32 end-to-end acceptance path executed successfully and is reproducible: `npx tsx scripts/financial-core-acceptance-run.ts` → `ACCEPTANCE RUN: PASS`. 199/199 vitest tests pass (171 pre-existing + 28 new, zero regressions), golden-test/Coherent DB state is byte-identical to baseline, `tsc`/ESLint/`next build` are all clean, and `prisma/seed-data.ts`/`scripts/golden-test.ts`/`lib/covenant-engine.ts`/`lib/solver/**` are unmodified.
