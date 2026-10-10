# REVIEW_REQUIRED sequential advance — correctness fix

## Counterexample (pre-fix)

Under verified REQUIRE, a `PARTIAL` rule yields `selectedPathResult === "REVIEW_REQUIRED"` with non-null `postState` and `commitPlan.committable === false`.

Prior `pathOk` treated `REVIEW_REQUIRED` like `SATISFIED`:
- `advanceWorld` ran → subsequent step `preState` saw proposed usage from the REVIEW_REQUIRED draw
- COMPLETED mode did **not** post (Phase 4D `committable` already false) — ledger path was already safe

## Fix

`mayAdvanceSequentialWorld` requires **all** of:
- `postState !== null`
- `simulationStatus === "SIMULATED"`
- `selectedPathResult === "SATISFIED"`

`REVIEW_REQUIRED` with postState → `provisionalPostState` only; `worldAdvanced === false`; sequence aborts; COMPLETED refuses ledger post.

## Tests

`tests/product/sequential-review-required-advance.test.ts` — counterexample + SATISFIED / NOT_SATISFIED / NEEDS_INPUT / REVIEW_REQUIRED / COMPLETED regressions.
