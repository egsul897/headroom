# Phase 4C: deterministic capacity graph

Starting SHA `b38fdcb5bc006b915ffe9b548fbb5ff18aade2fa`. Zero paid, model or provider calls.

**Status history.** The first closure at `779d4103300758390a8795194b5082d87a1625d6` (37/37) was
falsified by an independent forensic audit (verdict `PHASE_4C_NOT_COMPLETE`: batch reclassification
could create capacity, duplicate ledger ids were double-counted, duplicate pool ids resolved by
array order, evaluation scaled near-quadratically while artifact 11 claimed linear, and a Phase-3
`UNSUPPORTED` rule published AVAILABLE headroom). The remediation, its regression suites and the
32-condition recertification are under [`remediation/`](remediation/README.md). The package in this
directory was regenerated from the remediated code; the pre-remediation package is preserved
verbatim under `remediation/00-pre-remediation-closure-package/`.
Phase-3 semantic tree `f79bc12dd479e9b803bf9e37092d76b6aedb8c12` and compiler tree
`b4e6a9da496a23b9f98607355520a456e6c48e1f` are frozen and unchanged. Runtime version
`contract-runtime.v1`, input contract `financial-input-contract.v1`, capacity graph `capacity-graph.v1`.

## What this phase answers

What capacity exists now, what is shared, what has been used, what remains, how builder and grower
mechanics change the available amount, and how an explicit reclassification moves capacity state.

It does not choose which permission a transaction should use, does not solve for a maximum amount,
does not optimize an allocation and does not simulate a hypothetical transaction. Every result says
so on its face, in a `notComputed` block.

## What was built

New area `lib/contract-model/runtime/capacity/`. Nothing outside it changed.

| module | role |
|--------|------|
| `version.ts` | `capacity-graph.v1`, carried on every graph and state |
| `types.ts` | nodes, edges, statuses, capacity amounts, the ledger record, reclassification elections |
| `graph.ts` | graph construction from Phase-3 relationships, component labelling, cycle detection, manifest union |
| `ledger.ts` | the consumption ledger: explicit identity, explicit supersession, deterministic selection |
| `state.ts` | gross, usage, remaining, shared constraints, provenance, the structured explanation |
| `reclassification.ts` | explicit elections validated against explicit Phase-3 edges |

Public entry points: `buildCapacityGraph`, `evaluateCapacityState`, `applyCapacityStateTransition`.

## It owns no arithmetic

Gross capacity is the Phase-3 expression evaluated by the Phase-4A evaluator, resolved through the
Phase-4B strict resolver. Remaining is computed with the Phase-4A unit algebra. The module imports
`units.ts` and `evaluate-expression.ts` and computes nothing itself. A test asserts there is no raw
arithmetic on an amount and no float conversion anywhere in the module.

## Things that stay distinguishable

A missing fact, an unsupported expression, an ambiguous legal state, a legal state that needs review
and a runtime error are five different statuses, never one null.

Capacity is never a bare number. `UNLIMITED` and `GATE_NOT_SATISFIED` are their own kinds, so an
unlimited basket can never be confused with a large amount, and `NOT_DETERMINED` is its own kind, so
a missing fact never becomes zero. The scan proves `Infinity`, `Number.MAX_VALUE` and
`MAX_SAFE_INTEGER` appear nowhere.

No applicable usage record is a determined zero consumption. Usage that could not be counted leaves
remaining undetermined. Those are different facts and the code distinguishes them.

A bound stays a bound. A MAX with a missing operand carries `knownLowerBound` while the status stays
NEEDS_INPUT and gross stays undetermined.

Legal sufficiency dominates numeric executability, through one exhaustive table over every
Phase-3 sufficiency value: PARTIAL is REVIEW_REQUIRED; AMBIGUOUS, MISSING_CONTEXT and CONFLICTED
are AMBIGUOUS; UNSUPPORTED is UNSUPPORTED; an entity scope the guard marked not safe to rely on is
REVIEW_REQUIRED. Under any of them the published amounts are NOT_DETERMINED and the computed
arithmetic is kept separately under `provisional`. Arithmetic never upgrades a legal state.

Identity is unique or fails closed. A usage id, election id, rule id or pool id claimed by more than
one record is refused as a set: nothing is chosen between the claimants, nothing is collapsed, and
every capacity the claimants could touch fails closed with an explicit code. Array order decides
nothing.

## No implied allocation

A usage record whose capacity path is unresolved, but which names this capacity among its
candidates, blocks the answer with `AMBIGUOUS_CONSUMPTION_ALLOCATION`. A record with no candidates
at all blocks every capacity in scope with `ALLOCATION_INFORMATION_MISSING`: the usage exists, so
attribution is missing rather than absent. Candidates entirely outside the graph are reported as
`USAGE_NOT_ATTRIBUTABLE_IN_GRAPH`, never dropped. The runtime does not pick. Choosing a path is
Phase 4E's job.

## Reclassification batches

Every election in a batch draws on the usage its source carried in the before-state; conservation
is checked per election and aggregated by source over the whole batch; a batch applies whole or not
at all. Two elections that are each valid alone but together exceed the source are both refused and
`after` is null. Duplicate election ids, and an election whose rows the ledger already carries, fail
closed.

## Complexity

The ledger is indexed once by capacity path and selection is memoized per (path, currency);
membership, component and dependency lookups are indexed. The proof is the operation counters
(`ledgerEntriesExamined`, `edgesVisited`, `sharedResourceLookups`, `dependencyLookups`,
`indexLookups`, ...), which are exactly linear in n on the audit's own construction; wall-clock is
supplemental and is re-measured in `remediation/10-complexity-remediation.json`.

## Cycles

Cycle protection runs over evaluation dependencies only (`DEPENDS_ON` from a RULE_REFERENCE inside
a capacity expression, `BUILT_FROM`, `MEMBER_OF_SHARED_CAP`). Every other Phase-3 relationship is a
`LEGAL_RELATIONSHIP` edge: carried, never recursed. A symmetric pair of legal relationships is not a
cycle; a real RULE_REFERENCE cycle still fails closed with its path.

## Builders and growers are shapes, not formulas

A component is classified from the expression tree alone. A literal operand is base. A percentage
multiplied by a fact grows with that fact. Any other operand needing a fact builds from one. No
metric name is read, and a test proves renaming every metric leaves the classification identical.
Seven matrix cases run through one engine with zero production lines per formula.

## Two honest gaps in the frozen evidence

The frozen paid compile result contains **zero** shared-capacity resources and **zero**
reclassification edges. Both are recorded rather than worked around.

- A `SHARES_CAPACITY_WITH` edge states that two capacities share something. It does not say how
  much. Without an `IRSharedCapacity` resource carrying a cap expression there is no pool to
  compute, so the graph reports `SHARED_CAPACITY_NOT_QUANTIFIED` and invents nothing. Both members
  of such a relationship are REVIEW_REQUIRED with `effectiveRemaining` NOT_DETERMINED and their
  local arithmetic under `provisional`: an unknown constraint could bind, so nothing is
  authoritative. The frozen result has seven such edges and no resource behind them.
- Phase 3 records a reclassification right as a dependency carrying a target rule id and a
  description, with no amount, no effective date and no direction constraint. A transition therefore
  cannot be derived from the IR. Phase 4C executes an election the caller supplies, and only where
  the authorizing edge exists; anything the election omits is named in
  `RECLASSIFICATION_NOT_EXECUTABLE`, never filled in. The reclassification matrix is proved on
  synthetic and hand-authored IR because the frozen evidence has no such edge to exercise.

Nested shared capacity is also not representable: `memberRuleIds` is a list of rule ids, so a pool
cannot name another pool. That is reported as an explicit unsupported topology, with cycle
protection in place regardless.

## Artifacts

| # | file | content |
|---|------|---------|
| 01 | `01-phase4b-handoff-audit.json` | what is consumed from Phase 4B, and how snapshot identity binds to a state |
| 02 | `02-capacity-node-model.json` | the typed node, the statuses, the capacity-amount kinds |
| 03 | `03-capacity-graph-model.json` | typed edges, multi-pool membership, nested topology, cycle safety |
| 04 | `04-gross-capacity-evaluation.json` | gross through the Phase-4A evaluator, unlimited, bounds, review, scope |
| 05 | `05-builder-grower-model.json` | the component roles and the seven-case matrix |
| 06 | `06-consumption-ledger-contract.json` | the usage model, its identity, and what fails closed |
| 07 | `07-shared-capacity-model.json` | the shared cap as a constraint node, and the A to J matrix |
| 08 | `08-reclassification-model.json` | explicit elections, the block codes, and the frozen-evidence gap |
| 09 | `09-capacity-state-and-provenance.json` | immutability, hashing, the provenance chain, the explanation |
| 10 | `10-adversarial-matrix.json` | every matrix, executed through the production code |
| 11 | `11-anti-enumeration-determinism.json` | the generality scans, permutation hashes, complexity counters |
| 12 | `12-phase3-fixture-proof.json` | the state over frozen and hand-authored Phase-3 IR |
| 13 | `13-phase4d-handoff.json` | what Phase 4D receives |
| 14 | `14-phase4e-handoff.json` | what the solver will do, and how this phase stays neutral |
| 15 | `15-regression.json` | suites, full versus base, tsc, lint, build, timing characterisation |
| 16 | `16-phase4c-gate.json` | the 37 gate conditions and the verdict |

## Regression note

The full suite is not clean against base: the wall-clock scaling identities over
`segmentCoordinateClauses` (frozen Phase-3 compiler tree, unchanged by this phase) fail
intermittently. They are classified INHERITED FLAKY / UNSTABLE, not waived and not called passing.
`15-regression.json` records the exact identities, the isolation runs on the unchanged tree and the
direct log-log measurement of that function for the run that produced this package; the audit's
own measurement was 4 of 10 isolation failures and a slope of 0.985. Both identities predate Phase
4A and failed in the 4A and 4B regression artifacts. Gate condition 32 was reworded after the first
Phase-4C run (from "full suite clean" to "no new attributable regressions"); that change is
disclosed in `15-regression.json` and `16-phase4c-gate.json`.
