# Phase 4D remediation: composition safety

The Phase-4D verdict issued at `feab14fd7a0245586f92342b3833d5c224603e83` was
**`PHASE4D_TRANSACTION_SIMULATION_READY` (58/58)**. An independent code audit revoked it. This
directory holds the remediation; the failed closure package is preserved verbatim one level up in
[`docs/phase-4d/`](../) rather than overwritten.

Zero paid calls, zero model calls, zero network calls.

## What was actually wrong

Every `CONSUME_CAPACITY` effect was measured against the **same** pre-transaction Phase-4C state.
Two draws of 60 against a capacity of 100 each saw 100 available, each was `SATISFIED`, both
proposed rows were published, and the result read `SIMULATED` / `SATISFIED` /
`committable: true`. Phase 4C had already recorded the truth in the post-state, which showed usage
of 120 and an `OVER_CONSUMPTION` limitation, but nothing read it.

Five further composition holes shared the same shape: a conflict resolved by incidental ordering
rather than refused.

| defect | mechanism at the failed baseline |
|--------|----------------------------------|
| aggregate consumption | every draw measured against the same pre-transaction state |
| shared-pool aggregation | same, observed through the shared constraint |
| competing ledger successors | two effects could supersede one usage; the post-state rebuild resolved it with `Array.prototype.find` |
| conflicting event state | event effects sorted by effect id and written into a Map, so the last write won |
| dangling dependency | a dependency naming a non-existent effect was skipped behind `if (byId.has(d))` |
| post-state never validated | the post-state was computed and published without being read |

## The semantic contract, now stated and enforced

**Effects are sequential.** `transaction.effects` is an ordered list, and each effect applies to the
state the effects before it produced. That was always declared in the identity contract; it is now
also true of execution.

A second draw sees what the first left. A draw after a release sees the released headroom. A draw
after a metric adjustment sees the adjusted capacity. Reordering effects that change the transition
changes both the transaction hash and the post-state hash.

One exception, documented rather than improvised: reclassification elections execute as **one**
Phase-4C batch at the position of the first election, because Phase 4C enforces conservation across
a batch aggregated by source. Applying them singly would let two elections that individually fit
jointly exceed the source. Where a non-election effect sits between two elections and touches
capacity they move, the stated order and the atomic batch disagree, and the transaction is refused
rather than resolved.

`dependsOnEffectIds` declares that an effect's magnitude or state depends on another. It does not
re-order execution; the stated order does that. A forward-pointing dependency therefore contradicts
the stated order and is refused.

## Committable

`committable` now means four things, never fewer: the simulation ran, the selected path is
satisfied, a post-state was published, and **that post-state survived validation**. After the
transition is built, Phase 4C is asked what it produced, and every touched capacity and shared
constraint is read both for an `OVER_CONSUMPTION` limitation and for a negative remaining. Both,
because an over-draw that makes an entry non-authoritative withholds the remaining figure rather
than making it negative.

A post-state that contradicts the verdict is not published. A `REVIEW_REQUIRED` path may still
publish a clearly non-committable post-state where the arithmetic is informative but legal reliance
is unsafe; a transition that violates a quantified constraint publishes nothing.

## Phase 4C is still the only arithmetic

Nothing in `lib/contract-model/runtime/transaction/` re-derives a remaining-capacity formula. Every
measurement reads a capacity entry that `evaluateCapacityState` produced, so the two layers cannot
drift.

## Cost

| effects | state evaluations | pipeline steps |
|---|---|---|
| 1 | 2 | 15 |
| 8 | 9 | 15 |
| 32 | 33 | 15 |

State evaluations are `n + 1`, linear. A single draw with no adjustment still costs 2, unchanged, so
the common case pays nothing. Ledger scanning is **quadratic** in the number of ledger-affecting
effects, because each recomputation scans a ledger that grows by one row per draw. That is disclosed
in [`07-complexity.json`](07-complexity.json), not asserted away. The linearising optimisation would
re-derive Phase-4C arithmetic inside Phase 4D, so it is deliberately not taken.

## Evidence

125 Phase-4D tests pass, of which 46 are the new adversarial composition suite. A 104-composition
sweep found zero cases of `committable` with an unsafe post-state.

Honest limitation: `INSUFFICIENT_AGGREGATE_CAPACITY` is implemented and wired as a post-state
backstop, and it did **not** fire in any swept composition. The sequential model catches every
over-draw at the draw itself. The code is defence in depth, and is reported as such rather than
claimed as coverage.

Full suite 4,463 tests / 161 failed, against the pre-remediation baseline of 4,417 / 162. **Zero new
failing identities.** `tsc` adds no new error, lint and build pass.

Two pre-existing tests changed their expectations deliberately, both recorded in
[`08-regression.json`](08-regression.json): they asserted `stateEvaluations === 2` for any number of
effects, a number achievable only because every draw shared one evaluation. They now assert
`n + 1`, exactly.

## Gate

[`10-recertification-gate.json`](10-recertification-gate.json): **43 of 43 conditions PASS**, verdict
**`PHASE4D_TRANSACTION_SIMULATION_READY`**.

Every safety condition executes the engine. Structural scans survive only for boundary questions
they can answer, such as forbidden imports and absent solver entry points, and never as evidence of
runtime semantics.

| file | contents |
|------|----------|
| [`01-failed-baseline-reconciliation.json`](01-failed-baseline-reconciliation.json) | the revoked verdict, the frozen trees, the preserved Phase-4C handoff |
| [`02-defect-reproduction.json`](02-defect-reproduction.json) | each reported defect reproduced pre-fix, plus four additional findings |
| [`03-effect-conflict-matrix.json`](03-effect-conflict-matrix.json) | the effect read/write model and the invariant covering each conflict class |
| [`04-ordering-contract.json`](04-ordering-contract.json) | the corrected sequential contract and its one documented exception |
| [`05-post-state-and-committability.json`](05-post-state-and-committability.json) | post-state validation, the committability invariant, the sweep |
| [`06-identity-recertification.json`](06-identity-recertification.json) | canonical identity re-audited, metamorphic properties, replay control |
| [`07-complexity.json`](07-complexity.json) | the measured cost, including the disclosed quadratic |
| [`08-regression.json`](08-regression.json) | regression against the exact pre-remediation baseline |
| [`09-freeze-proof.json`](09-freeze-proof.json) | freeze and boundary proof |
| [`10-recertification-gate.json`](10-recertification-gate.json) | the strengthened 43-condition gate |
| [`11-real-fixture.json`](11-real-fixture.json) | the frozen real-package fixture re-run |

Regenerate with `scripts/phase-4d-recertification.ts`.

Phase 4E and Phase 5 remain unstarted.
