# Phase 4A: deterministic compositional expression runtime

Starting SHA `34130bd20a1df0f87fcae87f52fab09742fb1ec8`. Zero paid, model or provider calls.
Phase-3 production baseline consumed: SHA `5c914558a30e2e1709f16b6d0aaca1bc9bf8e789`, semantic compiler tree
`f79bc12dd479e9b803bf9e37092d76b6aedb8c12` (unchanged by this phase).

## The boundary

Phase 3 turns source text into trusted IR. Phase 4 evaluates that IR deterministically. The runtime never
reinterprets contract language, never calls a model, never repairs semantics. A missing fact is NEEDS_INPUT, a
Phase-3 UNSUPPORTED operand stays UNSUPPORTED, an AMBIGUOUS or CONFLICTED Phase-3 object stays blocked, and
entity scope is reported exactly as the Phase-3 guard left it.

## What was built

New area `lib/contract-model/runtime/`, nothing else in `lib/` touched:

| module | role |
|--------|------|
| `version.ts` | runtime version `contract-runtime.v1`, part of evaluation identity |
| `decimal.ts` | exact rational arithmetic (BigInt over BigInt); IR literals convert through their decimal string, so 12.5% of 800,000,000 is exactly 100,000,000 |
| `types.ts` | runtime values, result states, diagnostics, trace, InputResolver and MetricInput interfaces |
| `values.ts` | value constructors and exact-string serialization |
| `units.ts` | total unit algebra: every operation returns a typed value or a structured failure |
| `input-resolver.ts` | the fixture/reference resolver Phase 5 will replace behind the same interface |
| `evaluate-expression.ts` | the evaluator; public entry point `evaluateExpression({expression, inputs, context})` |
| `dependency-graph.ts` | graph, topological order, cycle detection with node path and provenance |
| `rule-evaluator.ts` | minimal rule shell: capacity and conditions evaluated separately, scope reported, permission not decided |

The Phase-3 IR is evaluated directly. No parallel AST and no runtime normalizer were needed: the IR already
carries typed, identity-stable nodes, and the few representational quirks (ADD/SUM aliasing, string-or-expression
as-of dates, the UNLIMITED_CAPACITY wrapper) are handled inside the evaluator without rewriting the tree.

## Artifacts

| # | file | content |
|---|------|---------|
| 01 | `01-phase3-ir-runtime-surface.json` | every IR expression node kind with its runtime interpretation, result type, input dependencies and unsupported cases, plus the frozen-IR census |
| 02 | `02-runtime-type-model.json` | value types, numeric representation decision, result states and their precedence |
| 03 | `03-unit-algebra.json` | the full pairwise outcome table, computed by executing the unit layer over every type pair |
| 04 | `04-expression-operator-coverage.json` | every operator exercised through the public entry point, including the safe partial-evaluation rules |
| 05 | `05-input-contract.json` | reference resolution table, the InputResolver and MetricInput interfaces, and the Phase-5 boundary |
| 06 | `06-dependency-graph.json` | acyclic example with topological order, plus direct and indirect cycles at graph and evaluation time |
| 07 | `07-trace-provenance.json` | a complete evaluation result showing the trace, the winning branch, the inputs used and the provenance chain |
| 08 | `08-phase3-ir-fixture-proof.json` | frozen Phase-3 IR shapes and hand-authored fixtures evaluated through the runtime |
| 09 | `09-anti-enumeration.json` | the A to G matrix and the production-code scan for covenant-form or agreement-specific branching |
| 10 | `10-determinism.json` | repeated-run hashes for executed and missing-input evaluations |
| 11 | `11-regression.json` | runtime suites, Phase-3 suites, full suite versus base, tsc, lint, build |
| 12 | `12-phase4a-gate.json` | the 29 gate conditions and the verdict |

## Not in Phase 4A

Capacity ledger, shared-cap consumption, builders and growers, basket utilization history, reclassification
execution, transaction sequencing, the capacity solver, financial ingestion and UI are all later subphases. The
rule shell records each as an explicit placeholder so they can be added without changing expression semantics.

## Handoff hygiene

`docs/phase-3-closure-final/09-phase4-handoff-contract.json` retained the draft text
`blockedBy: "the entity-scope blocker in 11"` after the verdict flipped to PHASE_3_CLOSED. The field is now `null`,
with a `handoffHygiene` record explaining the correction, and the generator sets it correctly from now on. This is
documentation hygiene, not a Phase-3 defect: no Phase-3 semantics, model call or historical evidence was touched.

## Regression note: two wall-clock scaling identities

The full suite shows two new failing identities versus base, both in pre-existing timing files
(`part-b-recert-finding4-independent`, `part-b-terminal-recert-open3-independent`). Both assert wall-clock ratios
over `segmentCoordinateClauses`, which lives in the frozen Phase-3 compiler tree (`b4e6a9da...`, bit-identical to
the Phase-3 baseline, last changed at commit `223aa64`). Phase 4A changed no file either test exercises.

Evidence they are load-sensitive measurements rather than a regression, recorded in artifact 11:

- both files pass in isolation on all six recorded runs;
- direct measurement of the same function across a doubling series gives per-doubling time ratios of 1.95, 2.14
  and 1.94 on the comma-chain shape (linear predicts 2.0, quadratic predicts 4.0), and every step is sub-quadratic
  on both shapes;
- Phase 4A added 106 tests to the shared parallel runner, which is what moved these ratios.

The honest framing is that Phase 4A contributed to the conditions, not to the measured code.
