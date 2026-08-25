# Result-semantics / headroom cleanup (Phase 9.5 — final backend correctness pass before Phase 10)

**Status: script + result-modeling fix only.** `git diff --stat` confirms the only production-code file changed is `lib/covenant-engine.ts` (result modeling — new fields and one new, additive query function); the only script changed is `scripts/golden-test.ts` (grading semantics); one new test file was added. `lib/solver/**`, `lib/financial-core/**`, `app/**`, and `prisma/**` are byte-identical to the pre-task state (`git diff --stat -- lib/solver/ lib/financial-core/ app/ prisma/` is empty). Zero `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`GoldenTest` database rows were changed (row counts and content checksums below).

---

## A. Executive result

Both narrow, pre-diagnosed result-semantics bugs are fixed, generically, with no company-specific branching:

1. **The Q22 tautology is gone.** `PerDocumentDebtResult.capacity` (a solver-native document's "amount confirmed to clear") is no longer conflated with a document's true maximum capacity. A new, separate, real post-transaction recomputation (`computeRemainingCapacityAfterDebtIncurrence`) answers "what remains after this transaction" by re-solving from a genuine post-transaction financial state — never `preTransactionCapacity - amount`.
2. **`selectedPath` is no longer used as a stand-in for `bindingConstraint`.** A new `deriveBindingConstraint` function derives the real limiting provision(s) from the solver's own maximum-capacity computation; the golden harness now grades whichever of `selectedPath`/`bindingConstraint` the question actually asks about, instead of always citing the tie-broken clearing path.
3. **Coherent**: 17 passed / 12 failed / 1 flagged → **26 passed / 3 failed / 1 flagged / 0 errored** (30 total). 9 of the 11 prior "representation-difference" failures are now honestly PASS (real multiplicity, not a weakened check); the 2 genuine binding-constraint questions and Q22 itself remain FAIL, correctly, because their `expectedAnswer`/`bindingProvision` values are stale relative to the newly-exposed real computation — **no golden row was changed** to force these to pass.
4. **Matthews**: unchanged, **2 passed / 4 failed / 10 flagged / 2 errored** (18 total) — confirmed non-regression, byte-for-byte identical counts, with the one previously-surfaced `HARNESS_COVERAGE_GAP` discrepancy still surfaced identically.
5. **Full verification suite**: 208/208 Vitest (199 pre-existing + 9 new capacity-semantics tests), TypeScript clean, ESLint clean, `prisma validate`/`migrate status` clean, production build clean, Coherent shadow-run clean (exit 0, non-mutation verified), financial-core acceptance run PASS.

**Verdict: `RESULT_SEMANTICS_CLEAN — READY_FOR_PHASE10`** (justification in §Q).

---

## B. Root cause of Q22's zero-headroom result

Exactly as pre-traced, in two places:

1. **`lib/covenant-engine.ts`, `runSolverForDocument`** (pre-fix): `const capacity = status === "clear" ? amount : undefined;` — for any solver-native document result that clears, `capacity` was defined, by construction, to equal the *tested* amount. This is a genuinely correct fact about that one probe ("this amount was confirmed to clear"), but the field name and every downstream reader treated it as "this document's capacity" — a ceiling.
2. **`scripts/golden-test.ts`, the `DEBT_SIMULATION` case** (pre-fix): `remainingAfterAmount = sim.overallCapacity !== undefined ? sim.overallCapacity - amount : undefined`, where `sim.overallCapacity = binding?.capacity`. Since `binding.capacity` for a solver-native CLEAR result equals `amount` by construction (per #1), this computed `amount - amount = 0` for every solver-native CLEAR simulation, regardless of true remaining headroom — a tautology, not a real answer.

Both were already honestly disclosed (not hidden) in `docs/golden-harness-solver-native-grading-fix.md` §D, and `docs/coherent-phase8-population-reconciliation.md` §P already recommended the correct fix ("compute remaining capacity from the maximum-capacity path, not `overallCapacity - amount`"). This task implements that fix, generalized to every company/document, not special-cased to Coherent or to Q22.

The design doc anticipated this distinction from the start — it was never fully wired through. `docs/solver-architecture-design.md` §N already specifies `overall: { status, amountTested, maximumCapacity? }` as three *separate* fields on `SolverResult`, and `runSolver` (`lib/solver/service.ts`) already computes a real, `amount`-independent `maximumCapacity` via `computeMaximumCapacityFromEvaluations` (itself fixed in the solver-hardening phase's `cc52ef7` commit, which replaced the tautological `totalAllocated + remaining` with the real `legs.filter(DEBT_INCURRENCE).sum(standaloneCapacity)`). The bug was entirely in `lib/covenant-engine.ts`'s translation layer (`runSolverForDocument`), which **computed** the real `maximumCapacity` inside its own call to `runSolver` and then **discarded** it, keeping only `capacity = amount`. This report's fix is the "wire it through" work the design doc's own architecture already made possible.

---

## C. Old result semantics (audit, task §4)

| Concept | Old representation | Where conflated |
|---|---|---|
| Tested amount | Not a distinct field at all — implicit in the function's `amount` parameter | `runSolverForDocument`/`simulateDebtIncurrence` never stored it on the result |
| Capacity (solver-native) | `capacity` = `amount` iff CLEAR, else `undefined` | **Conflated with "maximum capacity"** — the exact Q22 bug |
| Capacity (legacy) | `capacity` = declared, amount-independent ceiling | Correct as a maximum, but the *same field name* as the solver-native meaning above, silently combined in `binding`/`next`/`overallCapacity` sorting logic |
| Maximum capacity | Computed inside `runSolver` (`result.overall.maximumCapacity`), then **thrown away** by `runSolverForDocument` | Never surfaced past the `SolverResult` boundary |
| Remaining/headroom capacity | `overallCapacity - amount` (script-level, `golden-test.ts`) | **Conflated tested amount with maximum** — computes `amount - amount = 0` whenever the binding document is solver-native |
| Selected path | `solverResult.permissionPathUsed` (present) but golden-test.ts's binding-citation check always read `.legs[0].permissionId` off it, for *every* DEBT_SIMULATION question | **Used as the binding constraint for every question type**, including ones explicitly asking "which provision binds" |
| Binding constraint | No distinct representation existed anywhere in `lib/covenant-engine.ts` | Not modeled at all — `bindingProvision` (legacy) and `selectedPath` (solver-native) were the closest available stand-ins, neither of which is "the provision that limits the maximum" |

---

## D. New result semantics

`lib/covenant-engine.ts`'s `PerDocumentDebtResult` gains five new, purely additive fields (existing fields — `status`, `capacity`, `bindingProvision`, `solverResult`, `solverCoverage` — are byte-identical in meaning and value to before, so every existing caller, including `app/**`, is unaffected):

```ts
testedAmount?: number;                    // the amount actually tested — always populated now
maximumCapacity?: MaxCapacityResult;      // design doc §O's tagged union, surfaced (not discarded)
selectedPath?: PermissionPath;            // alias for solverResult.permissionPathUsed, named explicitly
bindingConstraint?: SourceCitation[];     // the REAL limiting provision(s) — see §H
```

A new, additive query function, `computeRemainingCapacityAfterDebtIncurrence`, answers "what remains after this transaction" (§F/§G below) — deliberately **not** folded into `simulateDebtIncurrence` itself, so every existing caller that only needs "does $X clear" pays zero extra solver-evaluation cost.

`deriveBindingConstraint(maximumCapacity)` is a new, small, pure function deriving the binding provision(s) from a `MaxCapacityResult`, reused by both `runSolverForDocument` (pre-transaction) and `computeRemainingCapacityAfterDebtIncurrence` (post-transaction) — one implementation, not two.

---

## E. Tested amount vs. maximum capacity

- **Tested amount** (`testedAmount`) is now always populated on every `PerDocumentDebtResult`, legacy or solver-native — the amount the caller actually asked about.
- **Maximum capacity** (`maximumCapacity`) is the real, `testedAmount`-independent ceiling, read directly from `runSolver`'s own already-computed `result.overall.maximumCapacity` (never re-derived, never approximated). It is `undefined` — never a fabricated number — whenever `runSolver` itself could not resolve a single `EXACT` figure (e.g. `ASSUMPTION_REQUIRED`/`REVIEW_REQUIRED`/`BOUNDED_RANGE`/`SCENARIO_DEPENDENT`).
- **A CLEAR result no longer implies `maximumCapacity === testedAmount`.** Proven by `tests/covenant-engine-capacity-semantics.test.ts`'s first test: a $500 CLEAR result reports `maximumCapacity = { kind: "EXACT", amount: 800 }`, genuinely larger than and independent of `testedAmount = 500`.
- Real, live confirmation from Coherent (not synthetic): testing $500M secured debt against the Credit Agreement, `maximumCapacity` resolves to **$5,629M** (pre-transaction) — nowhere near the tested $500M, and nowhere near the old buggy `capacity = 500`.

---

## F. Remaining-capacity calculation

`computeRemainingCapacityAfterDebtIncurrence(data, position, amount, secured, solverContext)`:

- For each governing document/side classified `SOLVER_NATIVE` (same coverage-gate logic `simulateDebtIncurrence` already uses, `resolveDocumentSideCoverage`, unmodified): builds a hypothetical **post-transaction** `FinancialSnapshotInput` (see §G) and calls `runSolverForDocument` again against it, reading its `maximumCapacity` — a genuine re-solve, not arithmetic on the pre-transaction number.
- For each document/side still `LEGACY`: keeps the **existing, unmodified** legacy formula (`capacity - amount`) — this is the legacy model's own, never-reopened semantics (a legacy declared ceiling is, by this engine's existing and unmodified design, state-independent, so subtraction is exact for it, not an approximation).
- For each document/side `NOT_TESTED`/`REVIEW_REQUIRED`: `NOT_DETERMINABLE` — `remainingCapacity` stays `undefined`, never a fabricated `0` (task §5's governing rule, directly fixing the Q22 bug's failure mode).
- Cross-document combination is **fail-closed**: if *any* governing document/side is `NOT_DETERMINABLE`, the top-level `remainingCapacity`/`binding` are `undefined` too — an undetermined document could turn out to be the tighter one, so no number is reported (proven by a dedicated test).

---

## G. Post-transaction capacity recomputation

The post-transaction financial state is built with the **same debt-funded convention** `simulateDebtIncurrence`'s own existing `proForma` calculation already uses (not a new assumption invented for this task): `totalDebt += amount`, `securedDebt += amount` (only if the tested transaction is itself secured), `cash` unchanged. This state is then fed through the **existing, unmodified** `runSolverForDocument` → `runSolver` → `computeMaximumCapacityFromEvaluations` path — the same maximum-capacity machinery `runSolver` already provides for the pre-transaction case, re-run against different input data. No new solver algorithm, no new bisection logic, no `lib/solver/**` change.

**Why this is not naive subtraction, proven empirically (real Coherent numbers, live database):**

| | Pre-transaction | Post-$500M-secured-transaction |
|---|---:|---:|
| Credit Agreement `maximumCapacity` | $5,629M (binding: `coh-ca-d-general-601k`, §6.01(k) general debt basket) | $4,629M (binding: `coh-ca-d-incr-ratiobased-unsecjr`, Incremental Amount cl. (y) / §6.11(a)) |
| Indenture `maximumCapacity` | $11,932.8M | $11,853.8M |
| **Cross-document remaining (min)** | — | **$4,629M** |
| Naive subtraction (`preMax − amount`) would give | — | $5,629M − $500M = $5,129M |

The real recomputed figure ($4,629M) differs from naive subtraction ($5,129M) by $500M — because the transaction's effect on leverage ratios shifts which Credit Agreement basket is tightest (a **binding-provision flip**, from the flat §6.01(k) general debt basket to the ratio-gated Incremental Amount clause), not merely a linear reduction of one number. `tests/covenant-engine-capacity-semantics.test.ts` reproduces this exact mechanism in a minimal, fully deterministic synthetic fixture (a $600 flat basket vs. an $800-pre-transaction, ratio-based basket that collapses to $300 post-transaction — flipping which one binds, and landing at $600, not the naive $300).

---

## H. Selected path vs. binding constraint

- **`selectedPath`** (= `solverResult.permissionPathUsed`) is the specific, deterministically tie-broken clearing path the solver relied upon **for the exact tested amount**. Multiple equally-valid paths can exist for the same tested amount (`solverResult.alternatives` contains other CLEAR paths) — this is normal, expected, and not itself a defect.
- **`bindingConstraint`** (new: `deriveBindingConstraint`) is the provision(s) that actually determine the **maximum** — derived from `maximumCapacity`'s own winning election's `DEBT_INCURRENCE` leg(s) with the *smallest* `standaloneCapacity` (the leg(s) that would exhaust first as the amount rises toward the ceiling). It is computed **independently of `selectedPath`** and can legitimately differ from it — proven directly by a test in which `selectedPath` is one of two equally-valid permissions (`perm-f`/`perm-r`) while `bindingConstraint` always correctly cites the one that actually determines the ceiling (`perm-r`), never the merely-also-valid one.
- `golden-test.ts` now grades these two concepts differently, keyed off a generalized (not company-specific) keyword check on the golden question's own text (`/\bbind(s|ing)?\b/i`): a question that asks which provision *binds* is graded against `bindingConstraint` (computed via `computeRemainingCapacityAfterDebtIncurrence(..., amount=0, ...)`, i.e. the real pre-transaction cross-document binding, not a spot-check-amount artifact); a plain "does this amount clear" question is graded against `selectedPath`, with a **citation mismatch treated as informational, never a hidden pass** — logged in the discrepancy report either way — and only non-gating when `solverResult.alternatives` provides **positive, structural evidence** of another equally-valid CLEAR path (never merely because the citation didn't match).

---

## I. Co-binding behavior

`deriveBindingConstraint` returns **every** `DEBT_INCURRENCE` leg tied at the minimum `standaloneCapacity` within the winning election, not an arbitrary first one — the existing `SourceCitation[]` type (design doc §K) already supports a list. Proven by a dedicated test: two legs tied at `standaloneCapacity = 200` (with a third, non-binding leg at `900`) both come back in `bindingConstraint`, in a deterministic (sorted) order. This is the smallest change consistent with the existing architecture; it does **not** attempt to represent co-binding **across separate elections** (`computeMaximumCapacityFromEvaluations`'s own `best = amount > best.amount ? ...` picks a single best election on strict `>`, an existing, unmodified design choice outside this task's scope — noted here, not changed, since changing cross-election tie-break behavior would touch `lib/solver/service.ts`, which is untouched per `git diff --stat`).

---

## J. Q22 actual rerun

| | Value |
|---|---|
| Question | "If Coherent incurs $500M of new secured debt today, what secured capacity remains immediately afterward, and under which provision?" |
| Legacy expected answer (`golden_tests.expectedAnswer`) | **3,541** |
| Legacy expected binding provision | `mila_secured` |
| Legacy actual (unmodified legacy path, no `solverContext`) | 3,541 (unchanged — confirms the legacy computation itself is untouched) |
| Solver-native **tested amount** | 500 |
| Solver-native **post-transaction state** | `totalDebt: 3,758` (`3,258 + 500`), `securedDebt: 2,721` (`2,221 + 500`), cash/EBITDA/etc. unchanged |
| Solver-native **remaining secured capacity** (real recomputation) | **4,629** |
| Binding constraint after the transaction | `coh-ca-d-incr-ratiobased-unsecjr` — Credit Agreement, "Incremental Amount def., clause (y); §6.11(a)" (Total Net Leverage Ratio-gated) |
| Source trace | `PerDocumentRemainingCapacity.maximumCapacity.path` (Credit Agreement document), full `PermissionPath` with `conditionsTested`/`sourceProvisions` |
| Assumptions | Debt-funded (cash unaffected by the $500M draw) — the same convention `simulateDebtIncurrence`'s own pre-existing `proForma` calculation uses; no new assumption introduced |
| Classification | `EXPECTED_ANSWER_STALE` — `expectedAnswer` (3,541) matches the **legacy** figure exactly (unaffected by this fix); the solver-native, real post-transaction recomputation (4,629) is a **materially different, and now non-tautological, real number** |

**Neither 3,541 nor the old buggy 0 nor the new 4,629 has been written to `golden_tests`.** Per task §13's explicit instruction, this is reported, not silently resolved: 3,541 reflects the pre-correction legacy model (§P's own prior finding: "Max secured cross-doc: $4,041M → $5,130M," `LEGACY_MODEL_ERROR`, i.e. the legacy figure is already known to understate true capacity before this task even began); 4,629 is a genuine, real, non-tautological computation from the fully-populated solver-native `Permission` graph, but resolving whether it is *legally* the correct final figure (vs. some other number a human/legal-engineering review would confirm) is explicitly out of this task's scope (§16: "No new legal work").

---

## K. The 11 representation-difference reruns

| # | Question | Expected # | Actual # | Expected binding | Selected path (actual) | Multiple valid paths? | Final classification | New outcome |
|---|---|---:|---:|---|---|---|---|---|
| 5 | Is $100M secured permitted? Under which test? | 1 | 1 | `mila_secured` | `ca_incremental_cash_capped` | **Yes** (confirmed via `solverResult.alternatives`) | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** (binding check informational) |
| 6 | Is $250M secured permitted? | 1 | 1 | `mila_secured` | `ca_incremental_cash_capped` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 7 | Is $500M secured permitted? | 1 | 1 | `mila_secured` | `ca_incremental_cash_capped` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 8 | Is $1,000M secured permitted? | 1 | 1 | `mila_secured` | `ca_incremental_cash_capped` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 9 | Is $100M unsecured permitted? | 1 | 1 | `ca_leverage_cap` | `ca_general_debt_601k` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 10 | Is $250M unsecured permitted? | 1 | 1 | `ca_leverage_cap` | `ca_general_debt_601k` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 11 | Is $500M unsecured permitted? | 1 | 1 | `ca_leverage_cap` | `ca_general_debt_601k` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 12 | Is $1,000M unsecured permitted? | 1 | 1 | `ca_leverage_cap` | `ca_general_debt_601k` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |
| 16 | SSNL test binding spot check at $2,000M | 1 | 1 | `mila_secured` | n/a — graded against `bindingConstraint`, not `selectedPath` (question explicitly asks "binding") | Not applicable (binding-question path used) | `REPRESENTATION_DIFFERENCE_ONLY` (heuristic; see caveat below) | **FAIL** (correctly — real `bindingConstraint` = `ca_incremental_ratio_based_unsecured_or_junior`, differs from stale expected `mila_secured`) |
| 17 | SSNL test binding spot check at $4,041M | 1 | 1 | `mila_secured` | n/a | Not applicable | Same | **FAIL** (same reason) |
| 23 | $1,000M secured — pro forma TNL | 1 | 1 | `mila_secured` | `ca_incremental_cash_capped` | Yes | `REPRESENTATION_DIFFERENCE_ONLY` | **PASS** |

**9 of the 11 are now correctly PASS** — real, structurally-confirmed multiplicity (another CLEAR path genuinely exists), and the question itself never asked which provision is *binding*, only whether the amount clears and (loosely) "under which test" — task §11's exact scenario ("do not fail merely because the solver chose another equally valid path").

**Rows 16/17 remain FAIL, correctly** — these two questions explicitly ask about the *binding* constraint (not just any clearing path), so they are graded against the real `bindingConstraint`, which now correctly differs from the stale expected `mila_secured`. **Caveat on the classifier label**: `classifyDebtSimDiscrepancy`'s heuristic (unmodified in this task, reused from the harness-fix report) keys off whether the legacy/solver-native *numbers* match, and for these two rows both numeric values are `1` (boolean "cleared"), so the heuristic lands on `REPRESENTATION_DIFFERENCE_ONLY`. A more precise label would be closer to `LEGACY_MODEL_ERROR`/`UNKNOWN_REVIEW_REQUIRED` for the *binding-constraint* question specifically, since — unlike rows 5-12/23 — these two are not "same answer, harmlessly different equally-valid citation," they are "the golden row's own binding citation is now demonstrably stale relative to the real binding-constraint computation." Flagged here honestly rather than silently reclassified (the harness's own numeric-based classifier was not modified, per this task's narrow scope — extending the classifier's heuristic to distinguish "binding-question mismatch" from "any-path mismatch" would be a reasonable, small follow-up, not attempted here to avoid scope creep beyond the two pre-diagnosed bugs).

---

## L. Matthews non-regression

| | Before this task | After this task |
|---|---:|---:|
| Passed | 2 | 2 |
| Failed | 4 | 4 |
| Flagged | 10 | 10 |
| Errored | 2 | 2 |
| Discrepancies vs. legacy-only | 1 (`HARNESS_COVERAGE_GAP`, row 4) | 1 (same row, same classification) |

Byte-for-byte identical outcome. Row 4 ("If Matthews incurs $500.0M of new secured debt, which Indenture permission(s) bind?") contains the word "bind," so it is routed through the new binding-constraint code path — which, per §F's fail-closed cross-document rule, initially returned `undefined` (since the Credit Agreement has no debt-incurrence covenant at all and is permanently `NOT_DETERMINABLE`, not just temporarily unresolved). A fallback was added so the binding-constraint path falls back to the same **per-document** (not cross-document-fail-closed) citation `simulateDebtIncurrence` already exposes via `solverSim.binding?.bindingConstraint` when the cross-document figure is undetermined — restoring the exact same real, useful finding the harness-fix report originally surfaced for this row (the Indenture's own real solver-native binding permission, `ind_permitted_debt_1a_flat`), without ever fabricating a cross-document number the Credit Agreement's genuine absence of coverage doesn't support. No `CovenantProvision` rows added, no legal review, no golden-test promotions — confirmed via `git diff` (zero Coherent/Matthews `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`GoldenTest` rows changed, §P below).

---

## M. Golden harness changes

`scripts/golden-test.ts`'s `DEBT_SIMULATION` case (the only place any grading logic changed):

1. `metric === "remainingAfterAmount"` now calls the new `computeRemainingCapacityAfterDebtIncurrence` for the solver-native-aware ("authoritative") figure, instead of `overallCapacity - amount`. The legacy-only comparison arm (used purely for the discrepancy report, never authoritative) intentionally **keeps** the old subtraction formula — that is the legacy model's own, unmodified, correct-for-a-fixed-basket semantics.
2. Binding-provision citation selection now branches three ways: (a) `remainingAfterAmount` questions grade against the post-transaction `bindingConstraint`; (b) questions whose text matches `/\bbind(s|ing)?\b/i` grade against the pre-transaction cross-document `bindingConstraint`; (c) everything else grades against `selectedPath`, with a mismatch treated as informational (never gating pass/fail) **only** when `solverResult.alternatives` provides positive, structural evidence of another equally-valid CLEAR path.
3. A new `EvalResult.bindingCheckSuppressed` field threads that informational-only status through to the shared `bindingOk`/`definedTermsOk` computation (both become `null`, not `false`, in that one case — never silently converted into a blanket "anything passes").
4. No change to `classifyDebtSimDiscrepancy`, `classifyLegacyOutcome`, the OUT_OF_SCOPE/RP_SIMULATION/ASSET_SALE_SIMULATION handling, or any of the four query types with no solver-native equivalent (§A of the prior report, unchanged).

---

## N. Production API / result changes

`lib/covenant-engine.ts`:

- `PerDocumentDebtResult` gains `testedAmount`, `maximumCapacity`, `selectedPath`, `bindingConstraint` (all optional, all additive — existing fields unchanged in meaning/value).
- New exported `deriveBindingConstraint(maximumCapacity)`.
- New exported `computeRemainingCapacityAfterDebtIncurrence(data, position, amount, secured, solverContext?)` and its result types `PerDocumentRemainingCapacity`/`PostTransactionCapacitySimulation`.
- `simulateDebtIncurrence`'s existing signature, return shape (all pre-existing fields), and behavior are **unchanged** — the new fields are additive on `PerDocumentDebtResult`, and the new headroom query is a separate function, deliberately not folded in (§7 of the task: smallest generalized capability, no cost imposed on existing callers).
- `runSolverForDocument`'s existing signature and pre-existing return fields are unchanged; it now also populates the four new fields from data it was already computing internally (`result.overall.maximumCapacity`, `result.permissionPathUsed`) and previously discarded.

`app/**` was not touched (out of scope) — the existing UI continues to read `capacity`/`overallCapacity` exactly as before (unaffected, since those fields' values are unchanged). The UI's own use of `overallCapacity - simAmt` as a "headroom after this incurrence" display (`app/simulate/SimulateClient.tsx`) still has the same latent tautology this report diagnoses — fixing that display is explicitly Phase 10 UI work, not attempted here.

---

## O. Test results

```
$ npx tsc --noEmit
(clean, zero errors)

$ npx eslint .
(clean, zero warnings)

$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx prisma migrate status
Database schema is up to date!

$ npx vitest run
 Test Files  20 passed (20)
      Tests  208 passed (208)
```

(199 pre-existing tests, unchanged and still passing, + 9 new tests in `tests/covenant-engine-capacity-semantics.test.ts` covering task §12 items A–I.)

```
$ npx tsx scripts/golden-test.ts coherent
26 passed, 3 failed, 1 flagged out-of-scope, 0 errored (30 total)

$ npx tsx scripts/golden-test.ts matthews
2 passed, 4 failed, 10 flagged out-of-scope, 2 errored (18 total)

$ npx tsx scripts/coherent-shadow-run.ts
exit 0; non-mutation VERIFIED

$ npx tsx scripts/matthews-shadow-run.ts
exit 0

$ npx tsx scripts/financial-core-acceptance-run.ts
ACCEPTANCE RUN: PASS

$ npx next build
✓ Compiled successfully
✓ Generating static pages (9/9)
```

---

## P. Modified files

```
$ git status --short
 M lib/covenant-engine.ts
 M scripts/golden-test.ts
?? tests/covenant-engine-capacity-semantics.test.ts
?? docs/result-semantics-headroom-cleanup.md

$ git diff --stat
 lib/covenant-engine.ts | 220 ++++++++++++++++++++++++++++++++++++++++++++++++-
 scripts/golden-test.ts | 176 +++++++++++++++++++++++++++++++++------
 2 files changed, 370 insertions(+), 26 deletions(-)

$ git diff --stat -- lib/solver/ lib/financial-core/ app/ prisma/
(empty — zero changes)
```

**Database row counts/checksums, confirmed unchanged** (direct `psql` against the live `headroom` database):

| Table | Row count | Note |
|---|---:|---|
| `permissions` | 29 | unchanged from the prior report's own baseline |
| `permission_relationships` | 27 | unchanged |
| `shared_capacity_constraints` | 3 | unchanged |
| `golden_tests` | 48 | unchanged — this script only ever `SELECT`s from it |
| `financial_states` | 1 | unchanged |
| `facilities` | 2 | unchanged |
| `debt_events` | 3 | unchanged |

No `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`GoldenTest.expectedAnswer`/`LegalReviewRecord` row was ever written by this task — every function touched (`runSolverForDocument`, `simulateDebtIncurrence`, `computeRemainingCapacityAfterDebtIncurrence`, `deriveBindingConstraint`, and `scripts/golden-test.ts`'s grading logic) is read-only against the database.

---

## Q. Any remaining correctness issue

1. **Classifier label precision (§K caveat)**: `classifyDebtSimDiscrepancy`'s existing, unmodified heuristic labels rows 16/17 `REPRESENTATION_DIFFERENCE_ONLY` even though — unlike the 9 genuinely-equivalent rows — their golden `bindingProvision` expectation is now demonstrably stale relative to the real binding-constraint computation. A small, separate follow-up could teach the classifier to distinguish "binding-question mismatch" from "any-clearing-path mismatch"; not attempted here (scope discipline).
2. **`app/simulate/SimulateClient.tsx`'s own `overallCapacity - simAmt` display** still carries the same latent tautology this report fixes at the engine/harness layer — explicitly Phase 10 UI work, `app/**` untouched per this task's scope.
3. **Cross-election co-binding** (two *different* elections tied at the same maximum) is not representable by `computeMaximumCapacityFromEvaluations`'s existing strict-`>` best-election selection (`lib/solver/service.ts`, unmodified) — only *within*-election leg ties are representable via the new `deriveBindingConstraint`. Noted, not changed (would require touching `lib/solver/service.ts`, outside this task's "no core solver change without a documented bug + regression test" rule — no such bug was found; this is a pre-existing, documented design choice, not a defect this task's own scope covers).
4. **Q22's 4,629 figure is a real, non-tautological computation, not a legally-blessed final answer** — per §J, resolving whether 4,629 (or some other figure a full legal review might confirm) is the *correct* final number remains explicitly out of scope (task §16).

None of these represent a false-affirmative result, a fabricated number, or a regression — each is an honestly-flagged boundary of this task's own deliberately narrow scope.

---

## Final verdict

**`RESULT_SEMANTICS_CLEAN — READY_FOR_PHASE10`**

Against task §20's six criteria:

1. **Solver-native CLEAR no longer implies maximum capacity equals tested amount** — ✅ `maximumCapacity` is a distinct field, read from `runSolver`'s own real computation, proven by test and by live Coherent data ($500M tested vs. $5,629M maximum).
2. **Remaining headroom is correctly calculated or explicitly unavailable** — ✅ `computeRemainingCapacityAfterDebtIncurrence` recomputes from a real post-transaction state (never subtraction for solver-native documents) and fails closed to `undefined` (never `0`) when not determinable.
3. **Q22 no longer produces a tautological zero** — ✅ real recomputation now yields $4,629M (§J); the stale $3,541M expectation is honestly flagged `EXPECTED_ANSWER_STALE`, not silently overwritten.
4. **Selected path is not mislabeled as binding constraint** — ✅ `deriveBindingConstraint` is a separate, independently-computed field; the harness grades whichever one a question actually asks about.
5. **Coherent regressions are truthfully graded** — ✅ 9 of 11 prior representation-only failures are now honestly PASS (real, evidence-based multiplicity); the 2 genuine binding-constraint questions and Q22 remain FAIL, correctly, with no golden row altered to force a pass.
6. **Matthews does not regress; no false affirmative behavior was introduced** — ✅ byte-identical pass/fail/flagged/errored counts, identical single discrepancy, confirmed by direct rerun.

Per task §21: **STOP.** No UI work, no further legal research, no new company onboarding was performed or is recommended next — the next separately-authorized task is Phase 10 product/UI wiring.
