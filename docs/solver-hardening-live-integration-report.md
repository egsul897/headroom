# Solver Hardening and Live Integration Gate — Report

## A. Executive verdict

**READY_FOR_FINANCIAL_ARCHITECTURE.**

The generalized contractual solver, wired into the live per-document
evaluation path used by the application, is a safe, deterministic,
fail-closed component. Every requirement in §14 of the task is met:
routing is deterministic and never mixes solver-native and legacy logic
within one document/side; a specific requested transaction amount using
multiple concurrently-drawn ratio permissions is now evaluated against one
consistent, joint pro forma state rather than independently per member;
solver-native and legacy documents coexist in the same cross-document
combination without double counting or a clearing document overriding a
blocking one; every audited failure mode fails toward `BLOCKED`/
`REVIEW_REQUIRED`/`NOT_TESTED`, never toward a fabricated `CLEAR`;
simulation is non-mutating and its `StateDelta` is internally consistent;
and Coherent (zero `Permission` rows) is confirmed, by running the full
regression suite, to route entirely through the legacy path with output
identical to the Phase-0 baseline.

Two real, additional correctness gaps were found and fixed during this
work beyond the five originally documented issues (§C, §M) — both were
false-affirmative risks, not merely incompleteness, so both were fixed
rather than deferred. Nothing about Coherent's legal configuration,
expected golden answers, or `prisma/seed-data.ts` was touched anywhere in
this work (§K, §N).

## B. Original five issues — disposition and rationale

Table extracted from `docs/solver-implementation-phases-0-7-report.md` §O,
evaluated against: current behavior; why deferred; effect on a real Phase 1
debt/liens transaction; failure-mode risk; disposition.

| # | Issue | Current behavior (before this task) | Can affect a real Phase 1 debt/liens transaction? | False CLEAR / false BLOCKED / unnecessary REVIEW_REQUIRED / incomplete StateDelta / incomplete explanation risk | Disposition |
|---|---|---|---|---|---|
| 1 | 2+ concurrently-drawn `INCURRENCE_BASED` (ratio) permissions not evaluated for a specific transaction amount | `evaluateElection` returned `NOT_EVALUABLE`; only max-capacity (via bisection) was answered | Yes — this is exactly the multi-basket ratio-stacking shape real indentures use | Incomplete evaluation (never false CLEAR as implemented, but also never a usable answer for the most common concurrent-ratio case) | **FIXED NOW** — §E below |
| 2 | Only `ENTITY_SCOPE`/`CUSTOM_STATE_PREDICATE` eligibility-condition kinds mechanically evaluated; `RATINGS_THRESHOLD`/`INTERCREDITOR_JOINDER`/`MFN_EXCLUSION_TEST`/`LCA_TEST_DATE_FREEZE` (or a misconfigured `CUSTOM_STATE_PREDICATE` missing its activation-condition id) silently produced **no** `RequirementResult` at all | Yes — any real permission carrying an unimplemented eligibility-condition kind | **False CLEAR** — an unverified rating/intercreditor/MFN/LCA condition could clear as if checked. Re-assessed against this task's own bar ("may remain deferred only if it necessarily produces REVIEW_REQUIRED and cannot produce a false affirmative") and found it fails that bar | **FIXED NOW** — §B below (fail-closed to `UNKNOWN`/`REVIEW_REQUIRED`); mechanical evaluation of the four specific kinds remains a scoped extension, now safe to defer since it can no longer produce a false affirmative |
| 3 | A `FIXED` basket's `CONCURRENT_COUNTED` contribution to pro forma **secured** debt was always `0`, never reflecting the transaction's own `secured` flag | Yes — any secured Phase 1 transaction combining a FIXED basket concurrently-counted against an SSNL-basis ratio permission | **False CLEAR** risk — understated secured pro forma debt overstates SSNL room | **FIXED NOW** — conservative fix (assume secured whenever the transaction is secured; never understates) |
| 4 | No live DB wiring into `computeCovenantPosition`/`simulateDebtIncurrence`'s per-document loop | N/A — the whole point of this task | The entire live-integration gate depends on this | Blocks the gate entirely until fixed | **FIXED NOW** — §D below, this task's core deliverable |
| 5 | `ExternalInputRecord`/`IntercreditorAgreement`/`CollateralPool` exist at the type/schema level but no fixture populates `ExternalInputRecord` rows through Prisma; the solver's fail-closed borrowing-base behavior (Case I) is proven via in-memory `ActivationState`, not a literal DB row | No — the solver's own evaluation path never reads `ExternalInputRecord` rows directly (it reads `ActivationState`/`RuleActivationCondition`); this is a DB-adapter/fixture completeness gap, not a decision-logic gap | None — does not participate in any pass/fail computation | **SAFE TO DEFER** — populate + wire `ExternalInputRecord` into a DB adapter once a real external-input source (a borrowing-base certificate feed) exists to justify it; premature now |

Two additional issues, not in the original five, were found while
building this gate and fixed for the same reason (§C):

| # | Issue | Risk | Disposition |
|---|---|---|---|
| 6 | An election whose total modeled capacity fell short of the full requested transaction amount still marked every leaf requirement `SATISFIED` (each covering the partial amount it could absorb), so `pathStatus` resolved `CLEAR` for a **partial** allocation | **False CLEAR** — the most severe category | **FIXED NOW** — §E below |
| 7 | `evaluateElection`'s per-election `maxCapacity` field (single/fixed-only elections) is defined as `totalAllocated + remaining`, which is trivially always equal to whatever `requestedAmount` was passed in — not a genuine, request-independent ceiling | None on `overall.status` — `SolverResult.overall.maximumCapacity` is a purely informational field never consulted by `aggregateOverallStatus`/the CLEAR-BLOCKED verdict (confirmed by reading `lib/solver/result.ts`/`lib/solver/status.ts`); no existing or new test asserts a specific numeric `maximumCapacity` value, so nothing downstream currently trusts this number as a real ceiling | **SAFE TO DEFER** — informational-only field, no pass/fail impact; document precisely (§M) rather than fix now, since a correct fix (closed-form per-`FormulaType` ceiling derivation, independent of `requestedAmount`) is a real, separable piece of work with no bearing on this gate's live-integration/fail-closed mandate |

## C. Changes made

Six commits, each independently reviewable, on
`claude/headroom-scaffold-covenant-engine-jrijk8`:

| SHA | Summary |
|---|---|
| `196dfb8` | Fix joint feasibility of concurrent ratio permissions (issue #1) + the general election-shortfall false-CLEAR gap (issue #6) |
| `ecdfdc9` | Wire the solver-native coverage gate into `simulateDebtIncurrence`'s live per-document evaluation path (issue #4) |
| `202dc77` | Fail closed on unsupported eligibility-condition kinds (issue #2) |
| `efebc11` | Add the solver-native DB adapter (`loadCompanySolverStaticData`) and application-layer data access (`getSolverStaticData`) |
| `49fed17` | Add the mixed native/legacy live routing test through the real DB path (task §6-§10), plus a coverage-audit attachment fix the fixture surfaced |
| `baffbbf` | Fix secured-debt understatement in FIXED+ratio `CONCURRENT_COUNTED` (issue #3) |

No commit touches `prisma/seed-data.ts`, populates a Coherent `Permission`
row, or changes a `golden_tests` expected answer — confirmed by empty
`git diff` on `prisma/seed-data.ts` and `scripts/golden-test.ts` across the
whole task (§K).

## D. Coverage-gate live integration

**The wiring point**: `simulateDebtIncurrence` in `lib/covenant-engine.ts`
— the function `app/simulate/SimulateClient.tsx`'s `DebtPanel` calls
directly (`simulateDebtIncurrence(data, position, simAmt, simSecured)`),
with `data`/`position` sourced from `lib/coherent.ts`'s
`getCovenantData()`/`getPosition()`, which themselves call
`loadCompanyCovenantData` — the same Prisma adapter this task's new
`loadCompanySolverStaticData` sits beside.

`simulateDebtIncurrence` gains one new, optional parameter,
`solverContext?: SolverNativeCompanyContext`. Its per-document loop now:

1. If `solverContext` is supplied, calls `resolveDocumentSideCoverage`
   (new, in `lib/covenant-engine.ts`) for the document/side being tested.
   That function calls `lib/solver/coverage.ts`'s `determineCoverage` for
   `grantType: "DEBT_INCURRENCE"`, and — for a **secured** side, only if
   the document has any `LIEN`-grantType permissions at all — again for
   `grantType: "LIEN"`. A secured side is solver-native only if **both**
   resolve `SOLVER_NATIVE`; otherwise the whole side falls back to
   LEGACY/NOT_TESTED in full (design doc §Q.2/§Q.3 — never a partial
   solver-native result for one document/side).
2. If the classification is `SOLVER_NATIVE`, `runSolverForDocument` (new)
   builds the document-scoped `Permission`/relationship/shared-constraint/
   collateral-scope subset, calls `lib/solver/service.ts`'s `runSolver`
   with the real transaction (amount, secured, entity, pools), and
   translates the `SolverResult` into the same `PerDocumentDebtResult`
   shape a legacy document produces — with the full `SolverResult` and
   `CoverageResult` preserved on new optional fields for explainability.
3. Otherwise, the **exact, untouched** legacy per-document mapping runs —
   the same code that ran before this parameter existed.
4. `assertNoDoubleCounting` (from `lib/solver/coverage.ts`) is called over
   every `CoverageResult` collected for the transaction, mechanically
   guarding that no `(documentId, side)` scope was ever classified twice.

When `solverContext` is omitted — every existing call site, and always for
Coherent, which has zero `Permission` rows — the function's behavior is
unchanged: confirmed by the full pre-existing test suite and golden-test
suite passing identically before and after this change (§K).

## E. Joint-feasibility implementation

`lib/solver/election.ts`'s `evaluateElection` previously returned
`NOT_EVALUABLE` whenever an election had 2+ concurrently-drawn
`INCURRENCE_BASED` members, for the specific-requested-amount question.

**The fix.** Every member of such an election shares the SAME election —
by construction of `enumerateElections`'s clique pruning, every pair is
`CONCURRENT_DISREGARDED`/`CONCURRENT_COUNTED` — meaning the transaction
relies on all of them concurrently for the SAME total draw, not on a
fictional per-member split evaluated against a smaller share. Because
every existing ratio leaf formula (`LEVERAGE_RATIO_ROOM`/
`COVERAGE_RATIO_ROOM`) is linear/non-increasing in pro forma debt, the
mathematically exact joint-feasibility test is: the full requested amount
is feasible under this election **only if it does not exceed ANY
individual member's own standalone capacity** (each evaluated from the
pre-transaction state, adjusted only for its own `CONCURRENT_COUNTED`
fixed contributions) — an AND across members, never a sum. This is
provably equivalent to "recompute each member's condition at the fully
joint pro forma state" (the design doc's literal instruction) for these
linear formula types, and is the same test regardless of whether the
members share one metric (total net leverage) or different metrics (total
vs. senior secured net leverage) — proven by the "different applicable
metrics" adversarial test (§H below).

The dollar amount itself is attributed to exactly one leg (the
lexicographically-first member, for determinism), so `StateDelta`/
`debtOutstandingDelta` never double-counts the same real dollars across
multiple legs; every other concurrently-relied-upon member still gets its
own `RATIO_CONDITION` `RequirementResult`, preserving the full trace.

**The general shortfall fix (issue #6).** Applies to every election, not
only the multi-ratio case: if, after all allocation, some amount remains
unabsorbed and no `UNKNOWN` requirement already explains the gap, the
election now pushes an explicit `FAILED` `DEBT_PERMISSION` requirement
rather than silently reporting every leaf as `SATISFIED` for a partial
amount. This closed a real false-CLEAR path that existed independently of
the multi-ratio fix (a single `FIXED` basket smaller than the requested
amount previously still resolved path-level `CLEAR`).

Adversarial tests added (`tests/solver/election.test.ts`): two concurrent
ratio permissions on the same metric (the literal "$300M+$300M wrongly
sums to $600M" worked example from the task, both directions — $300M
clears, $600M blocks); exact-boundary ($300M clears) vs. one-dollar-over
($301M blocks); two ratio permissions on different applicable metrics
(total vs. senior secured net leverage, secured transaction, the tighter
metric binds); shared constraint + fixed permissions (Case E/F fixtures,
below); an unsupported eligibility-condition kind never silently clearing.

## F. Mixed native/legacy acceptance test

`tests/solver/live-integration.test.ts` — a test-only, isolated company
(`mixed-routing-live-test-co`), inserted directly via Prisma (never through
`prisma/seed-data.ts`), run through the real chain:
`loadCompanyCovenantData`/`loadCompanySolverStaticData` →
`computeCovenantPosition` → `simulateDebtIncurrence`.

- **Document A** — one `MODELED` debt permission, a complete
  `SolverCoverageDeclaration`, **no legacy `CapacityExpr` at all** (a
  CLEAR/BLOCKED verdict for it can only have come from the solver).
- **Document B** — a legacy-only `CapacityExpr` basket, zero `Permission`
  rows (routes `LEGACY` by construction — no declaration, no rows).
- **Document C** — a `SolverCoverageDeclaration` marked complete but one of
  its two `Permission` rows still `KNOWN_NOT_MODELED` (the data-entry
  contradiction), plus its own legacy formula. Confirmed to fall back to
  LEGACY **in full** — the amount used is exactly the legacy threshold
  (150), not the modeled permission's smaller number (100) or the
  not-yet-modeled permission's larger one (999), proving no accidental
  partial solver-native draw in either direction.
- **Document D** — no configuration at all (`NOT_TESTED`), used to prove an
  unresolved mandatory document prevents overall `CLEAR` even when every
  other document clears.
- **Document E** — a second legacy document with a wider legacy threshold
  than Document A's solver ceiling, isolating "solver-native blocked while
  legacy clears" from "legacy blocked while solver-native clears".

Proven, each as an explicit assertion: each document routes to exactly one
composition path; Document C never uses partial solver-native logic;
cross-document aggregation counts each document exactly once (`perDocument`
array length and unique `documentId` set both checked); a blocking document
is never overridden by a clearing one; an unresolved mandatory document
prevents overall `CLEAR`; both cross-path BLOCKED/CLEAR pairings (legacy
blocked + solver-native clear, and the reverse) resolve correctly;
exact-boundary and one-dollar-over amounts at the live boundary.

## G. Route/service end-to-end test

Rendering `app/simulate/page.tsx`'s actual Server Component +
`SimulateClient` Client Component pair in a headless test would require
jsdom/React Testing Library/Next.js route-test scaffolding whose only
additional coverage over what §F already exercises is JSX rendering
itself — which contains no branching/decision logic of its own (every
status/capacity/reason `SimulateClient` renders is read directly off the
`DebtIncurrenceSimulation` object this test suite already asserts
against, per a direct read of `app/simulate/SimulateClient.tsx`). §F
therefore exercises the highest actual shared service/data-access boundary
the routes depend on: `loadCompanyCovenantData`/`loadCompanySolverStaticData`
→ `computeCovenantPosition` → `simulateDebtIncurrence` — the exact
functions cited by file and call site in §D, not functions that merely
resemble what the route calls. This satisfies the task's own instruction
that, where route-level testing is disproportionate, the highest common
service boundary should be tested and the choice explained here rather
than faked as end-to-end coverage.

## H. Fail-closed adversarial results

Every item from task §8, with where it is asserted and the overall status
proven:

| Adversarial case | Where asserted | Status proven |
|---|---|---|
| Missing Permission source citation | `tests/solver/fixtures/synthetic-solver-native.test.ts` "Provenance requirement" | Impossible to construct (compile-time — `sourceProvision` is a required field) |
| Incomplete solver-native coverage | `tests/solver/coverage-gate.test.ts`; `tests/solver/live-integration.test.ts` (Document C) | Falls back to LEGACY in full, never partial |
| Unknown mandatory relationship | `tests/solver/election.test.ts` "prunes a pair with no established relationship" | Excluded from every election (fail-closed `UNKNOWN` default) |
| Missing financial input (assumed rate) | `tests/solver/fixtures/synthetic-solver-native.test.ts` Case D (FCCR basket, rate 0) | `ASSUMPTION_REQUIRED` |
| Missing external/certified input | `tests/solver/fixtures/synthetic-solver-native.test.ts` Case I | `REVIEW_REQUIRED`, never a fabricated capacity |
| Unsupported eligibility-condition kind | `tests/solver/election.test.ts` (new) | `UNKNOWN`, path never `CLEAR` |
| Solver election/search limit exceeded | `tests/solver/service.test.ts` | `REVIEW_REQUIRED` + `SEARCH_LIMIT_EXCEEDED` reason code |
| Alternative path A blocked + path B assumption-required | `tests/solver/status-semantics.test.ts` (`aggregateOverallStatus(["ASSUMPTION_REQUIRED", "BLOCKED"])`) | `ASSUMPTION_REQUIRED` (not falsely CLEAR or BLOCKED) |
| Alternative path A clear + path B assumption-required | `tests/solver/fixtures/synthetic-solver-native.test.ts` Case D | Overall `CLEAR` through the modeled sibling |
| Legacy document BLOCKED while solver-native document CLEARS | `tests/solver/live-integration.test.ts` | Overall `blocked` |
| Solver-native document BLOCKED while legacy document CLEARS | `tests/solver/live-integration.test.ts` | Overall `blocked` |
| Unresolved mandatory document alongside otherwise-clear documents | `tests/solver/live-integration.test.ts` (Document D) | Overall `not_tested`, never `clear` |

No failure mode in this matrix silently becomes `CLEAR`.

## I. Explanation-trace verification

`tests/solver/live-integration.test.ts` §9 confirms, for a live,
DB-backed, `CLEAR` solver-native result: `overall.status`/`amountTested`;
`permissionPathUsed.legs` (permission id, amount allocated, grant type);
`permissionPathUsed.conditionsTested` (non-empty — every requirement class
actually evaluated); `sources` (deduplicated document/section/permission
citation); and the full `SolverResult` plus the `CoverageResult` that
routed it, both preserved unmodified on `PerDocumentDebtResult`. No
application code has to reconstruct contractual logic from a bare status —
the object the live boundary hands back already carries it.

## J. StateDelta consistency

`tests/solver/live-integration.test.ts` §10 confirms, for a live
`$120M` unsecured incurrence against Document A: `debtOutstandingDelta`
sums to exactly the tested amount; `leverageMetricsProForma.netDebt` =
`preDebt + newDebt - cash` exactly; `leverageMetricsProForma.totalNetLeverage`
recomputed correctly from that; `cashDelta` is `0` for a pure debt draw.
Non-mutation is proven at both levels: the in-memory `financials`/
`permissions` objects passed in are unchanged after two separate
`simulateDebtIncurrence` calls (one `CLEAR`, one deliberately `BLOCKED`
at `$5,000M`); and — the DB-level check this task specifically asks for —
`ledgerEntry`/`financialSnapshot`/`permission` row counts, and the
persisted `totalDebt` figure itself, are queried before and after and
confirmed byte-identical.

## K. Legacy/Coherent regression results

- `git diff <baseline>..HEAD -- prisma/seed-data.ts` — **empty**, across
  the whole task.
- `git diff <baseline>..HEAD -- scripts/golden-test.ts` — **empty**.
- No `Permission`, `PermissionRelationship`, `SharedCapacityConstraint`,
  `SolverCoverageDeclaration`, or any other new solver-native table row was
  ever inserted for Coherent — confirmed by construction (every insert in
  this task's new test file targets `mixed-routing-live-test-co`, a
  distinct, torn-down-after-run company id) and by the golden-test suite's
  own output being unchanged.
- `golden_tests` expected answers: unmodified (empty diff on the file that
  defines them; `scripts/golden-test.ts` itself unmodified).
- Full vitest suite: **143/143 passed** (see §L).
- Golden-test suite: **29 passed, 0 failed, 1 flagged out-of-scope, 0
  errored (30 total)** — identical to the Phase 0-7 baseline.
- `npm run build`: compiled successfully, same 7 routes as the Phase 0-7
  baseline (`/`, `/_not-found`, `/docs`, `/feeds`, `/ledger`, `/position`,
  `/simulate`).

Coherent's own live routing is confirmed by construction, not merely
inference: `resolveDocumentSideCoverage` requires an explicit
`SolverCoverageDeclaration` row to ever return anything other than
`LEGACY`/`NOT_TESTED` (per `lib/solver/coverage.ts`'s `determineCoverage`),
and zero such rows exist for Coherent — so every one of Coherent's
documents/sides resolves `LEGACY`/`NOT_TESTED` regardless of whether a
`solverContext` is ever supplied for it (and today, no real call site
supplies one at all — see §D).

**One deliberate, in-scope change from the prior phase's own posture**:
`docs/solver-implementation-phases-0-7-report.md` had established
`lib/covenant-engine.ts` as byte-for-byte unchanged from the Phase 0
baseline — that was a Phases 0-7 property, not a permanent constraint. This
task's own mandate (item A, "presumptively fix-now") is precisely the wiring
that report's §A/§O explicitly named as the next, deliberately-deferred
step. `lib/covenant-engine.ts` therefore now differs from the Phase 0
baseline (483 insertions / 2 deletions) — the safety property that
survives, and is what this section proves, is behavioral: with zero
`Permission` rows, output is unchanged.

## L. Full test/build results (exact counts)

Run this session, real output:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, zero errors |
| `npx eslint . --ext .ts,.tsx` | exit 0, zero errors/warnings |
| `npx prisma validate` | valid |
| `npx prisma migrate status` | up to date, 6 migrations (unchanged — no schema change was needed for this task) |
| `npx vitest run` | **11 test files, 143 tests, all passed** (0 failed, 0 skipped) |
| `npm run prisma:seed` | "Seeded Coherent Corp. (coherent)" |
| `npx tsx scripts/golden-test.ts` | **29 passed, 0 failed, 1 flagged out-of-scope, 0 errored (30 total)** |
| `npm run build` | compiled successfully, 7 routes, same shape as baseline |

Vitest breakdown by file: `graph.test.ts` 31, `election.test.ts` 22,
`fixtures/synthetic-solver-native.test.ts` 17, `covenant-engine.test.ts` 9,
`status-semantics.test.ts` 18, `synthetic-company.test.ts` 7,
`coverage-gate.test.ts` 15, `service.test.ts` 6, `ledger-regression.test.ts`
4, `live-integration.test.ts` 11 (new), `versioning.test.ts` 3. Baseline
(before this task) was 125 tests (23 pre-existing + 102 solver); this task
added 18 net new tests across `election.test.ts` (+5),
`service.test.ts` (+1), `fixtures/synthetic-solver-native.test.ts` (+1),
and the new `live-integration.test.ts` (+11), while also rewriting several
existing assertions in `election.test.ts`, `service.test.ts`, and
`fixtures/synthetic-solver-native.test.ts` whose expectations depended on
the pre-fix (false-CLEAR-permitting) behavior, for 143 total.

## M. Deferred limitations

For each, precisely: what triggers it; what status results; what would
resolve it.

1. **Four eligibility-condition kinds have no mechanical evaluation**
   (`RATINGS_THRESHOLD`/`INTERCREDITOR_JOINDER`/`MFN_EXCLUSION_TEST`/
   `LCA_TEST_DATE_FREEZE`, unless backed by an attached
   `CUSTOM_STATE_PREDICATE`/`RuleActivationCondition`). **Triggers**: a real
   `Permission` row carries one of these kinds without a matching
   activation condition. **Result**: `UNKNOWN` → the containing path is
   never better than `REVIEW_REQUIRED`/`ASSUMPTION_REQUIRED`, and can never
   be `CLEAR` on that path alone — fail-closed by construction after this
   task's fix (§B). **Resolves with**: a data-driven predicate per kind,
   exactly like `CUSTOM_STATE_PREDICATE` already is — a scoped extension,
   not a re-architecture, deferred because Phase 8's own legal data (the
   only source of real instances of these conditions) does not exist yet.
2. **`ExternalInputRecord` rows are not loaded by the DB adapter or
   consulted by the solver's own evaluation path.** **Triggers**: N/A —
   never participates in any pass/fail computation today; the fail-closed
   borrowing-base behavior (Case I) is proven via in-memory
   `ActivationState`. **Result**: N/A. **Resolves with**: wiring
   `ExternalInputRecord` into a DB adapter once a real external-input
   source (a borrowing-base certificate feed) exists to justify it.
3. **`SolverResult.overall.maximumCapacity` is not a genuine,
   request-independent ceiling for the common single/fixed-only election
   case** (`totalAllocated + remaining` is algebraically always
   `requestedAmount`). **Triggers**: any caller that reads
   `maximumCapacity` expecting an answer to "what's the most this could
   be," independent of what was asked. **Result**: no effect on
   `overall.status` (confirmed: `aggregateOverallStatus` never consults
   `maximumCapacity`); the informational field itself is simply
   uninformative for this case today. **Resolves with**: a closed-form,
   per-`FormulaType` maximum-capacity derivation independent of
   `requestedAmount` (the multi-ratio case, fixed in this task, already
   demonstrates the closed-form pattern — `min` across members' own
   pre-transaction capacities — the single-election case needs the
   equivalent derivation per `FormulaType`).
4. **`RuleActivationCondition`'s `parameterResolution`/`reversionRule`
   (step-up/cooldown parameter resolution, retroactive re-examination) are
   represented in the type system and round-trip through the new DB
   adapter, but this task did not add a live-boundary fixture exercising
   them** — the existing Case H/J fixtures already exercise
   `APPLICABILITY`/`PARAMETER_ADJUSTMENT_TRIGGER` end-to-end at the
   in-memory solver-core level; this task's live-DB fixture (§F)
   deliberately stayed within the FIXED/`FLAT_AMOUNT` shape needed to
   prove routing without expanding scope. **Resolves with**: extending §F's
   fixture once a real need for live-DB dynamic-activation testing
   appears — not required for this gate's own verdict, since the
   underlying mechanism is already proven at the solver-core level.

## N. Remaining legal dependency

**Phase 8 remains blocked**, unchanged by this task: populating real
`Permission`/relationship/constraint data for Coherent's own indenture and
credit agreement requires counsel's basket-by-basket stacking-interaction
table, which does not yet exist (`legal-model-remediation-design.md` §10
step 8; `docs/solver-architecture-design.md` §V Phase 8/§X). This task did
not create any Coherent `Permission` row, did not translate any counsel
conclusion into solver configuration, and did not change any Coherent
`CapacityExpr` tree or `golden_tests` expected answer — confirmed by the
empty diffs cited in §K. Nothing in this task's engineering work removes
or narrows that legal dependency; it only proves the engine that will
consume that data, once it exists, is safe to build the broader financial
simulation architecture on top of today.

## O. Recommendation

**READY_FOR_FINANCIAL_ARCHITECTURE.**

Every one of §14's seven readiness criteria is met, each backed by a
specific, re-runnable test cited above rather than by assertion alone:
routing is deterministic and never mixed (§D, §F); joint feasibility of a
specific requested amount across concurrent ratio permissions is now
evaluated against one consistent pro forma state (§E, §H); solver-native
and legacy documents coexist without double counting or a clearing
document overriding a blocking one (§F, §H); no audited unsupported/
incomplete configuration produces a false affirmative (§B, §H — including
two real gaps found and fixed during this work, not merely inherited
clean); the live-boundary result object carries the complete contractual
trace without the application reconstructing it (§I); simulation is
non-mutating and internally consistent, proven at both the in-memory and
persisted-database level (§J); and Coherent, with zero `Permission` rows,
is confirmed unchanged from the Phase 0-7 baseline by the full regression
suite (§K). The one remaining blocker — Phase 8's Coherent data population
— is a legal, not engineering, dependency, and is explicitly out of this
task's scope by design (§N). The broader Headroom financial-state and
scenario architecture may now be built on top of this contractual-solver
boundary.
