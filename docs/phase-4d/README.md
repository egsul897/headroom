# Phase 4D: deterministic hypothetical transaction and state-transition simulation

Recorded starting SHA `87d7baff80ba9cb51ac090c04d2fecbfa27c35ec` (the Phase-4C remediation commit).
Execution began from clean head `c7fa62b20286870f5b22d7d796d7b9492e1533a4`; the single commit
between the two adds one Phase-4C handoff artifact and no production file, so the runtime baseline
is unchanged and was not silently redefined. The reconciliation is
[`01-phase4c-handoff-audit.json`](01-phase4c-handoff-audit.json), verdict `HANDOFF_RECONCILED`.

Zero paid calls, zero model calls, zero provider calls, zero network calls, $0.00 spend.

Phase-3 compiler tree `b4e6a9da496a23b9f98607355520a456e6c48e1f` and semantic tree
`f79bc12dd479e9b803bf9e37092d76b6aedb8c12` remain frozen and unchanged. Runtime
`contract-runtime.v1`, input contract `financial-input-contract.v1`, capacity graph
`capacity-graph.v1`, this phase `transaction-simulation.v1`.

## What this phase answers

Given **this** explicitly described hypothetical transaction and **this** explicitly selected path,
what happens to state.

It simulates only transactions the caller has fully specified. It does not choose a transaction
structure. It does not select the best path. It does not optimize an allocation. It does not solve
for a maximum transaction size. It does not infer accounting treatment. It does not ingest financial
data. Every result carries a `notComputed` block stating each of those six omissions on its face.

Choosing among paths, ranking outcomes and solving for a maximum belong to Phase 4E, which has not
been started. Phase 5 has not been started.

## What was built

New area `lib/contract-model/runtime/transaction/`. Nothing outside it changed: the prior-phase
change forensics in [`16-regression.json`](16-regression.json) record zero files changed outside
this module since the baseline and zero substantive semantic changes to Phase 3, 4A, 4B or 4C.

| module | role |
|--------|------|
| `version.ts` | `transaction-simulation.v1`, carried on every result |
| `types.ts` | the transaction, the typed effect vocabulary, the two status dimensions, the limitation codes |
| `identity.ts` | the canonicalization contract and the deterministic transaction, ledger and simulation hashes |
| `overlay.ts` | the caller-supplied pro-forma financial overlay over an immutable Phase-4B snapshot |
| `effects.ts` | effect classification, read/write sets, dependency edges, cycle and fixed-point detection |
| `simulate.ts` | the single public entry point and the fifteen-step canonical state-transition order |

One public entry point: `simulateTransaction({ transaction, currentState, capacityGraph,
selectedPath, inputs, context })`. It is pure. It mutates no argument, performs no I/O and writes
nothing. A commit plan is returned as data; committing it is somebody else's job.

## The two status dimensions

`simulationStatus` says whether the simulation itself could be carried out: `SIMULATED`,
`NEEDS_INPUT`, `UNSUPPORTED`, `AMBIGUOUS`, `REVIEW_REQUIRED`, `ERROR`. `selectedPathResult` says what
happened to the path the caller chose: `SATISFIED`, `NOT_SATISFIED`, `INSUFFICIENT_CAPACITY`,
`REVIEW_REQUIRED`, `INDETERMINATE`, `NOT_APPLICABLE`. They are never collapsed into a boolean and
never into "permitted / not permitted". A currency mismatch, for instance, returns `ERROR` on the
first dimension and `NOT_SATISFIED` on the second: the engine could not carry the arithmetic, and
the path still fails closed.

A post-state is published only when the selected path is `SATISFIED` or `REVIEW_REQUIRED`. Any
required effect that fails leaves `postState` null, so a partial application is never presented as
a state.

## Labels do not control behaviour

`transaction.category` and `transaction.label` are display fields. They are excluded from identity
and no production branch reads them; the scan in
[`14-anti-enumeration-determinism.json`](14-anti-enumeration-determinism.json) is clean across all
seven modules, as are the scans for per-covenant-form enumeration, solver entry points and
ingestion.

## Evidence

79 Phase-4D tests, all passing: 42 synthetic matrix cases covering the required A–AG scenarios, 14
identity and determinism tests, 14 anti-enumeration tests and 9 tests over the frozen real Phase-3
compile result.

The real-corpus boundary is stated rather than papered over. The frozen corpus carries 52 rules with
a capacity expression, **0 quantified shared-capacity resources** and **0 reclassification edges**,
so quantified shared-pool execution and reclassification execution are proved on synthetic and
hand-authored IR only. They are **synthetic-only**, and no fixture in this phase is described as
real-package extraction proof. What the real corpus does prove: capacity consumption, refusal of
over-consumption, legal-state dominance, an unquantified shared relationship staying
non-authoritative, and a real unreducible condition leaving the path `INDETERMINATE` while the
capacity draw itself reads `SATISFIED`. That last case is the honest one: the condition carries no
boolean expression, so it is reported `UNSUPPORTED` and no post-state is published.

## Regression

Full suite at this head: 4,417 tests, 162 failed, against a Phase-4C baseline of 4,338 tests and 162
failed. The 79 new tests are exactly the Phase-4D additions. One failing identity differs from the
baseline set: an inherited wall-clock scaling assertion over the unchanged Phase-3 tree, which fails
in 2 of 10 isolation runs and whose measured function is sub-quadratic under direct measurement
(log-log slope 1.021). It is classified as inherited instability, **not waived** and not called
passing. No regression is attributable to Phase 4C or Phase 4D. `tsc` adds no new error beyond the
six pre-existing `tests/foundation-audit/` errors; lint and build pass.

## Gate

[`17-phase4d-gate.json`](17-phase4d-gate.json): **58 of 58 conditions PASS**, verdict
**`PHASE4D_TRANSACTION_SIMULATION_READY`**.

## Artifacts

| file | contents |
|------|----------|
| [`01-phase4c-handoff-audit.json`](01-phase4c-handoff-audit.json) | baseline reconciliation before any production change |
| [`02-transaction-model.json`](02-transaction-model.json) | the transaction shape, identity and the label-neutrality proof |
| [`03-effect-model.json`](03-effect-model.json) | the supported effect vocabulary and the reserved kinds with reasons |
| [`04-selected-path-contract.json`](04-selected-path-contract.json) | the caller-supplied path contract; no search, no selection, no optimization |
| [`05-capacity-consumption.json`](05-capacity-consumption.json) | consumption, exhaustion, over-consumption, shared constraints, currency |
| [`06-ledger-effects.json`](06-ledger-effects.json) | proposed rows only; the actual ledger untouched; supersession preserves history |
| [`07-financial-overlay.json`](07-financial-overlay.json) | the pro-forma overlay over the immutable snapshot |
| [`08-reclassification-simulation.json`](08-reclassification-simulation.json) | explicit elections, encoded authority, conservation |
| [`09-pre-post-state.json`](09-pre-post-state.json) | the canonical order, fixed-point detection, chaining, failure atomicity |
| [`10-condition-and-scope.json`](10-condition-and-scope.json) | individually typed conditions, legal-state dominance, entity scope |
| [`11-provenance-and-trace.json`](11-provenance-and-trace.json) | the provenance chain, the ordered trace, the dependency manifest |
| [`12-synthetic-matrix.json`](12-synthetic-matrix.json) | the A–AG matrix through one generic engine |
| [`13-real-fixture-proof.json`](13-real-fixture-proof.json) | simulation over the frozen real compile result, gaps intact |
| [`14-anti-enumeration-determinism.json`](14-anti-enumeration-determinism.json) | the scans, the replay hashes and the complexity counters |
| [`15-phase4e-handoff.json`](15-phase4e-handoff.json) | what Phase 4E receives and what Phase 4D deliberately left neutral |
| [`16-regression.json`](16-regression.json) | regression at this head and the prior-phase change forensics |
| [`17-phase4d-gate.json`](17-phase4d-gate.json) | the 58-condition gate and the verdict |

Regenerate the artifacts and the gate with `scripts/phase-4d-gate.ts`.
