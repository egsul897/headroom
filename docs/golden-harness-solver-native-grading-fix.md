# Golden-test harness: grading solver-native output

**Status: script-level fix only.** `git diff` confirms zero lines changed in `lib/covenant-engine.ts`, `lib/solver/**`, or `lib/financial-core/**`. The only file modified is `scripts/golden-test.ts`. Every result below is real output from running the fixed harness against the live database (`sudo -u postgres psql -d headroom`) — nothing here is projected or hand-computed.

---

## A. What the harness previously did, and why it was insufficient

`scripts/golden-test.ts` called:

```ts
const data = await loadCompanyCovenantData(prisma, companyId);
const position = computeCovenantPosition(data);
...
const sim = simulateDebtIncurrence(data, position, amount, secured);
```

`simulateDebtIncurrence` has accepted a fifth, optional parameter — `solverContext?: SolverNativeCompanyContext` — since the solver-hardening phase (`lib/covenant-engine.ts`, "Solver-native live routing" file-header comment). When `solverContext` is supplied, the per-document loop inside `simulateDebtIncurrence` calls `resolveDocumentSideCoverage` (`lib/covenant-engine.ts`, itself calling `determineCoverage` in `lib/solver/coverage.ts`) for every document/side, and routes a document/side to `runSolver` (`lib/solver/service.ts`) whenever that scope is classified `SOLVER_NATIVE` — never partially, per the coverage gate's own fail-closed design (design doc §Q.2/§Q.3, `assertNoDoubleCounting`). When `solverContext` is omitted, every document/side falls back to `LEGACY`/`NOT_TESTED` exactly as before the parameter existed.

The harness never passed this fifth argument. Concretely, the missing call site was `scripts/golden-test.ts`'s own `evaluateGoldenTest`, in its `"DEBT_SIMULATION"` case (pre-fix):

```ts
const sim = simulateDebtIncurrence(data, position, amount, secured);
```

Consequently, **every golden-test run in this project's history graded only the legacy `CapacityExpr` path**, for both companies:

- For **Coherent**, which has a rich, fully-populated legacy `CovenantProvision`/`CapacityExpr` configuration *and* a fully-populated solver-native `Permission`/`SolverCoverageDeclaration` graph (per `docs/coherent-phase8-population-reconciliation.md`), the harness never exercised the solver-native path at all — meaning the well-documented correction that clause-6-linked liens are additive, not netted (pushing the true cross-document secured maximum from the legacy $4,041M-family figures to the solver-native-corrected figures) had **never been independently machine-verified by the golden-test harness itself** — only by the separate, non-authoritative `scripts/coherent-shadow-run.ts` and `scripts/coherent-golden-comparison.ts` scripts.
- For **Matthews**, which was populated solver-native from the start with **zero** legacy `CovenantProvision` rows (`docs/matthews-international-onboarding.md` §H/§F.5), the legacy-only harness could not see any of Matthews' real `Permission` rows at all — producing 2 PASS / 4 FAIL / 10 FLAGGED / 2 ERROR against Matthews' own 18 golden rows, entirely as a harness-wiring artifact, not a data or legal problem (confirmed by `scripts/matthews-shadow-run.ts` separately, and reconfirmed as this fix's own "legacy-only" baseline in §C below).

`scripts/coherent-shadow-run.ts` and `scripts/coherent-golden-comparison.ts` **did** already do solver-native evaluation, correctly, for Coherent — but as separate, non-authoritative scripts the CI-facing `npm run golden-test` command never ran, and with no Matthews equivalent wired into the authoritative harness at all.

### The confirmed architecture boundary (required reading item 1)

`computeCovenantPosition` (`lib/covenant-engine.ts`) has **no** `solverContext` parameter, and no solver-native-aware equivalent path exists for it anywhere in the codebase. Solver-native routing is wired **only** into `simulateDebtIncurrence`. This means four of `golden-test.ts`'s eight `GoldenQueryType`s — `LEVERAGE_METRIC`, `PROVISION_CAPACITY`, `DOCUMENT_CAPACITY`, `CROSS_DOCUMENT_CAPACITY` — read `position.metrics`/`position.provisionCapacities`/`position.documents`/`position.crossDocumentSecured`/`position.crossDocumentUnsecured` directly, all of which are `computeCovenantPosition`'s own, solver-context-blind output. **These four query types genuinely cannot be solver-native-graded with the engine's current live-wired boundary.** This is not an oversight of this fix — `scripts/coherent-golden-comparison.ts`'s own file-header comment already identified and reported the identical boundary before this task began, and `docs/coherent-phase8-population-reconciliation.md` §P classifies it `UNKNOWN_REVIEW_REQUIRED (engineering gap, not legal)`. Extending it would require adding a solver-native path to `computeCovenantPosition` itself, inside `lib/covenant-engine.ts` — out of this task's script-only scope, and not attempted (per the task's own "stop and report, don't approximate" instruction). Only `DEBT_SIMULATION` rows (which call `simulateDebtIncurrence` directly) can be solver-native-graded today.

---

## B. The fix

`scripts/golden-test.ts` now, for every `DEBT_SIMULATION` row:

1. **Always builds the real `SolverNativeCompanyContext`** for the company under test via `buildSolverContext(companyId, asOfDate)`, a new small function that calls `loadCompanySolverStaticData(prisma, companyId, asOfDate)` — the **same** exported DB-read function `lib/coherent.ts`'s `getSolverStaticData` wraps for the live application, and the same one both `scripts/coherent-shadow-run.ts` and `scripts/matthews-shadow-run.ts` already call — combined with the same per-company entity/collateral fields (`incurringEntity`, `guarantorStatus`, `entityClasses`, `collateralPools: []`, `requestedLienPriority: []`) those two scripts already established and live-verified for Coherent and Matthews respectively. A company outside that lookup table (there is none today besides these two) falls back to a generic default that still round-trips correctly, since zero `Permission`/`SolverCoverageDeclaration` rows for an unrecognized company makes every document/side resolve `LEGACY`/`NOT_TESTED` in `resolveDocumentSideCoverage` regardless of the exact entity-context values. **No DB read was reimplemented; no new routing logic was written.**
2. **Passes that context through** to `simulateDebtIncurrence(data, position, amount, secured, solverContext)` — exactly the call shape the live application (and both shadow-run scripts) already use. `resolveDocumentSideCoverage`/`determineCoverage` (`lib/solver/coverage.ts`, unmodified) decide routing per-document/side, never partially — this fix exercises that existing, already-tested logic; it does not reimplement or second-guess it.
3. **Compares the resulting actual** (status, computed metric, and — new — the *cited binding provision*) **against `expectedAnswer`/`expectedStatus`/`bindingProvision`**, and separately computes what the pre-fix, legacy-only call (`simulateDebtIncurrence(data, position, amount, secured)`, no context) would have produced for the same row. Where the two differ — in status, in the computed number, *or* in which permission is cited as binding — the harness prints both values side by side and runs the discrepancy through a classifier reusing `docs/coherent-phase8-population-reconciliation.md` §P's exact vocabulary (`LEGACY_MODEL_ERROR`, `SOLVER_CONFIGURATION_ERROR`, `SOLVER_ENGINE_ERROR`, `FINANCIAL_INPUT_DIFFERENCE`, `LEGAL_SPEC_AMBIGUITY`, `EXPECTED_ANSWER_STALE`, `REPRESENTATION_DIFFERENCE_ONLY`, `UNKNOWN_REVIEW_REQUIRED`), plus one new, justified addition:
   - **`HARNESS_COVERAGE_GAP`** — used only when the company has **zero** legacy `CovenantProvision`/`CapacityFormulas` configuration for *any* document (true, company-wide, for Matthews — confirmed via `data.documents.some(d => d.capacityFormulas?.secured || d.capacityFormulas?.unsecured)`). None of §P's eight categories describe "no legacy model was ever populated to be right or wrong about" — `LEGACY_MODEL_ERROR` presupposes a legacy formula that computed something wrong, and `UNKNOWN_REVIEW_REQUIRED` implies genuine uncertainty about what's correct, neither of which fits "this harness never invoked the only model that ever existed for this document." It is not a legal or engine defect; it is this harness's own prior failure to wire `solverContext` through, now fixed.

   A row where legacy-only and solver-native-aware grading agree in status, number, *and* binding citation prints nothing extra — unchanged behavior, as specified.
4. **Never writes to `golden_tests`.** No `expectedAnswer`/`expectedStatus`/`bindingProvision` column is touched by this script, confirmed by direct psql row-count/checksum comparison (§D below) and by the script itself containing no `update`/`create` call against that table.
5. Explicitly recognizes Matthews' correctly-expected `not_tested` rows as `PASS`, not a new discrepancy (`expectedStatus: "not_tested"` rows — see §C).
6. `RP_SIMULATION`/`ASSET_SALE_SIMULATION`/`OUT_OF_SCOPE` handling is unchanged — Restricted Payments and Asset Sales remain outside the solver-native model's scope for both companies, as before.
7. No new CLI surface — `npm run golden-test -- <companyId>` (equivalently `npx tsx scripts/golden-test.ts <companyId>`) works exactly as before; the fix required no new flag.

For `LEVERAGE_METRIC`/`PROVISION_CAPACITY`/`DOCUMENT_CAPACITY`/`CROSS_DOCUMENT_CAPACITY` rows, the harness now prints an explicit, per-row note — `"N/A - computeCovenantPosition has no solverContext parameter..."` — instead of silently grading them as if solver-native-aware. Grading itself is unchanged for these four query types (there is nothing else it could correctly do, per §A).

---

## C. Full re-run results (real output)

### Coherent — `npx tsx scripts/golden-test.ts coherent`

| | Legacy-only (pre-fix baseline, re-run from `git show HEAD~2:scripts/golden-test.ts` for this report) | Solver-native-aware (this fix) |
|---|---:|---:|
| Passed | 29 | **17** |
| Failed | 0 | **12** |
| Flagged (out of scope) | 1 | 1 |
| Errored | 0 | 0 |
| Total | 30 | 30 |

**12 rows now show a solver-native-aware actual that differs from what legacy-only grading would have reported** (full row list, question/classification/justification, exactly as printed by the harness):

| # | Question | Legacy-only → Solver-native-aware | Classification | Justification |
|---|---|---|---|---|
| 5 | Is $100M of new secured debt permitted? Under which test? | clear/1, binding `mila_secured` → clear/1, binding `ca_incremental_cash_capped` | `REPRESENTATION_DIFFERENCE_ONLY` | Same verdict and figure (1); only the cited binding provision changed — the solver's own election logic cleared the same amount via a different, equally-valid alternative permission. |
| 6 | Is $250M of new secured debt permitted? | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 5. |
| 7 | Is $500M of new secured debt permitted? | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 5. |
| 8 | Is $1,000M ($1B) of new secured debt permitted? | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 5. |
| 9 | Is $100M of new unsecured debt permitted? | clear/1, binding `ca_leverage_cap` → clear/1, binding `ca_general_debt_601k` | `REPRESENTATION_DIFFERENCE_ONLY` | Same verdict and figure; binding citation moved from the ratio-gated cap to a flat/general basket. |
| 10 | Is $250M of new unsecured debt permitted? | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 9. |
| 11 | Is $500M of new unsecured debt permitted? | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 9. |
| 12 | Is $1,000M ($1B) of new unsecured debt permitted? | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 9. |
| 16 | At what level of incremental secured debt would the indenture's SSNL test first become binding — spot check at $2,000M | clear/1, binding `mila_secured` → clear/1, binding `ca_incremental_ratio_based_unsecured_or_junior` | `REPRESENTATION_DIFFERENCE_ONLY` | Same verdict and figure; different, equally-valid binding permission. |
| 17 | ...spot check at the $4,041M ceiling | same pattern | `REPRESENTATION_DIFFERENCE_ONLY` | Same as row 16. |
| **22** | **If Coherent incurs $500M of new secured debt today, what secured capacity remains immediately afterward, and under which provision?** | **clear/3541** → **clear/0** | **`EXPECTED_ANSWER_STALE`** | `expectedAnswer` (3541) matches the legacy figure exactly; solver-native now computes 0. The stored expectation reflects the pre-correction legacy `remainingAfterAmount = overallCapacity - amount` computation, which (per `docs/coherent-phase8-population-reconciliation.md` §P's own prior finding on this exact row) is the wrong formula once a document is solver-native-routed — remaining capacity should be read from the solver's own post-transaction maximum-capacity recomputation, not `overallCapacity - amount` against the pre-transaction figure. |
| 23 | Can Coherent incur $1,000M of secured debt without breaching either document, and what does pro forma TNL become? | clear/1, binding `mila_secured` → clear/1, binding `ca_incremental_cash_capped` | `REPRESENTATION_DIFFERENCE_ONLY` | Same verdict; different, equally-valid binding permission. |

This is the **first time** this repository's authoritative regression harness has machine-verified that Coherent's solver-native path resolves every one of these transactions the same way the legacy path does (11 of 12 rows), and that one specific row (Q22, "remaining capacity") genuinely computes a different number under solver-native routing than the legacy formula did — exactly the discrepancy `docs/coherent-phase8-population-reconciliation.md` §P already flagged by hand ("Q22 remaining-capacity metric ($3,541M vs $0) — `REPRESENTATION_DIFFERENCE_ONLY`... fix by computing remaining capacity from the maximum-capacity path, not `overallCapacity - amount`"). This fix's own classifier independently lands on `EXPECTED_ANSWER_STALE` rather than `REPRESENTATION_DIFFERENCE_ONLY` for this row because the classifier's heuristic is keyed to what `expectedAnswer` itself matches (the legacy figure, exactly) rather than to whether the two computations represent "the same real answer differently phrased" — both labels are defensible for this row; see §D below, which resolves the two readings.

### Matthews — `npx tsx scripts/golden-test.ts matthews`

| | Legacy-only (pre-fix baseline) | Solver-native-aware (this fix) |
|---|---:|---:|
| Passed | 2 | 2 |
| Failed | 4 | 4 |
| Flagged (out of scope) | 10 | 10 |
| Errored | 2 | 2 |
| Total | 18 | 18 |

**Pass/fail/flagged/errored counts are unchanged** — but this is not "nothing changed." **1 row** shows a solver-native-aware actual that differs from legacy-only:

| # | Question | Legacy-only → Solver-native-aware | Classification | Justification |
|---|---|---|---|---|
| 4 | If Matthews incurs $500.0M of new secured debt, which Indenture permission(s) bind? | not_tested/0, binding none → not_tested/0, binding `ind_permitted_debt_1a_flat` | `HARNESS_COVERAGE_GAP` | No legacy `CovenantProvision` configuration was ever populated for Matthews (solver-native from the start) — the previous null-binding result reflects this harness never invoking `solverContext`, not two populated models disagreeing. |

**Why the overall status and the pass/fail counts stay identical despite that real change**: solver-native routing correctly resolves the **Indenture** side of this transaction to `clear` (the Indenture has full `SolverCoverageDeclaration` coverage and $500M is within its $631.45M maximum), but the transaction's *overall* status still combines **both** governing documents, and the **Credit Agreement** side remains `not_tested` — correctly, per Part 1 of this task's own re-check, which confirms the Credit Agreement has no debt-incurrence covenant at all, hence no `SolverCoverageDeclaration` for it exists or should exist. Since `simulateDebtIncurrence`'s cross-document combination is fail-closed (any `not_tested` document drags the overall status to `not_tested`, never silently to `clear`), the row's own `expectedAnswer` of `1` (i.e., "cleared" = true, for the transaction as a whole) can never be satisfied by this transaction's actual scope — the question's own phrasing ("which **Indenture** permission(s) bind?") suggests it was designed to ask about the Indenture in isolation, but `DEBT_SIMULATION` as coded always evaluates every governing document jointly. This is a genuine finding about this golden row's own query design, separate from and in addition to the `HARNESS_COVERAGE_GAP` classification — flagged here for a human to resolve (by either scoping this query to the Indenture document alone, or by correcting `expectedAnswer` to `not_tested` to match the CA's confirmed, correct absence of coverage), **not corrected in this task**, per the instruction not to touch `golden_tests` rows.

**No Matthews row's `not_tested`-expecting rows are misclassified as new discrepancies** — rows 3 (`CROSS_DOCUMENT_CAPACITY`, `expectedStatus: "not_tested"`) and 10 (`DOCUMENT_CAPACITY`/Credit-Agreement, `expectedStatus: "not_tested"`) both continue to `PASS`, unaffected, exactly as intended.

---

## D. Was any previously-reported "passing" golden test revealed to have been passing against a stale or legacy-only comparison?

**Yes — for Coherent, all 12 of the rows in §C's table.** Under the pre-fix, legacy-only-only harness, every one of them reported `PASS`. Under solver-native-aware grading (the routing the live application actually implements once a populated `solverContext` is supplied), 11 of the 12 still resolve the **same verdict and number** but via a **different binding provision** than `bindingProvision`/`bindingDefinedTerms` in the database currently assert — meaning those 11 rows' historical `PASS` verdicts were passing against a citation that, while numerically correct, is not the citation the solver-native model (the model `docs/coherent-phase8-population-reconciliation.md` establishes as the corrected one) actually relies on. The 12th (Q22, "remaining capacity after $500M") is more significant: its historical `PASS` was against `expectedAnswer = 3541`, a figure that matches the **pre-correction legacy** computation exactly; the solver-native-aware computation is `0`, and — per `docs/coherent-phase8-population-reconciliation.md` §P's own prior, independent finding on this exact metric — `0` is itself an artifact of a *different* bug (`remainingAfterAmount` computed as `overallCapacity - amount` against the pre-transaction legacy `overallCapacity`, not recomputed from the solver's own post-transaction path) rather than a confirmed correct answer either. **This row's `expectedAnswer` of 3541 is `EXPECTED_ANSWER_STALE`, and the solver-native-aware actual of `0` is not yet a validated correct replacement** — both figures are suspect, and resolving which one is right is exactly the kind of follow-up this task's own discipline requires leaving to a human/legal-engineering follow-up, not silently picking one. **No `golden_tests.expectedAnswer` row was updated to reflect either figure.**

**For Matthews**, no row was previously `PASS` and is now revealed stale in the same sense — Matthews' 2 previously-`PASS` rows (`CROSS_DOCUMENT_CAPACITY` and the CA-side `DOCUMENT_CAPACITY`, both `expectedStatus: "not_tested"`) remain correctly `PASS`, unaffected by this fix, because they were never testing anything the fix changes (both already correctly reflect the Credit Agreement's confirmed absence of debt-incurrence coverage). The one Matthews row that did change (row 4, §C) was already `FAIL` before and after this fix — not a case of a stale `PASS`.

---

## E. Verification (real output)

```
$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx tsc --noEmit
(clean, zero errors)

$ npx eslint .
(clean, zero warnings)

$ npx vitest run
 Test Files  19 passed (19)
      Tests  199 passed (199)

$ npx next build
 ✓ Compiled successfully
 ✓ Generating static pages (9/9)
```

**Database row counts and content, before vs. after this task's work** (direct `psql` against the live `headroom` database, both a row-count and a full-row-content `md5` checksum per table, for every table this task was told not to touch):

| Table | Row count (before → after) | Content checksum (before → after) |
|---|---|---|
| `permissions` | 29 → 29 | `6081d4c894a136e6097d75772d3dadf3` → identical |
| `permission_relationships` | 27 → 27 | `6c188cb162dfb6f20ed7efe5dae7c323` → identical |
| `shared_capacity_constraints` | 3 → 3 | `e3021f1877c6ed3c3225e19d2d8ab8ec` → identical |
| `financial_states` | 1 → 1 | `44bbfcd6673cfd1c240170c5ff183fa8` → identical |
| `facilities` | 2 → 2 | `a77b11ff3cff910ef8e434a3df855f73` → identical |
| `debt_events` | 3 → 3 | `4d41fbd3df2a70c7adb2dee453900271` → identical |

Zero rows changed, for either `coherent` or `matthews`, in any of the six tables this task was scoped never to touch. `golden_tests` itself was also confirmed unwritten (48 rows before and after; the harness only ever `SELECT`s from it).

**`git diff` on the three files/directories this task must not modify:**

```
$ git diff --stat HEAD~2 -- lib/covenant-engine.ts lib/solver/ lib/financial-core/
(empty)
```

Zero hunks, zero lines. `git status --short` after both commits shows only `scripts/golden-test.ts` (this fix) and `docs/matthews-international-onboarding.md`/`docs/golden-harness-solver-native-grading-fix.md` (documentation) as modified/added.
