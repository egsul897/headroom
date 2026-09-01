# Final Semantic Decomposition Generalization Iteration — Mission Report

**Verdict: `SEMANTIC_DECOMPOSITION_NEEDS_ITERATION`**

## Summary

This mission asked whether Headroom's contract-intelligence pipeline needed an
architectural redesign (a staged inventory → composition → reconciliation
pipeline) to close residual gaps in the frozen A1-A6/B1-B4 real holdout, and
whether the architecture generalizes across the full taxonomy of whole-agreement
contract semantics (definitions, debt, liens, restricted payments, investments,
asset sales, financial covenants, reporting, cure mechanics, shared caps,
cross-references) rather than being tuned to one benchmark package.

Direct, full-depth manual investigation of the prior mission's own real holdout
output (`docs/final-semantic-decomposition/01-residual-holdout-failure-analysis.json`)
found no evidence of a cognitive-overload or architecture-scale failure mode —
the model reasons correctly about high-cardinality clause sets in a single pass.
It found exactly one concrete, generalizable, bounded defect: the deterministic
`checkIntraDefinitionComponentCompleteness` diagnostic did not recurse into a
nested `UNSUPPORTED` node's own preserved substructure, undercounting deeply
nested calculation trees (a real pricing-grid definition reported 2/4 components
when the true count was 43/55). **Option 1** (a bounded fix within the existing
architecture) was selected over the two- and three-stage alternatives, and
implemented as a single recursive-descent change in
`lib/contract-model/compiler/semantic/completeness-check.ts`.

## What the evidence shows

- **The fix works and is safe.** Verified directly against real B2 data (2/4 →
  43/55 true count), covered by 36 new generic synthetic tests spanning 11
  provision-family scenarios, and causes 0 net-new regressions across the full
  3199-test suite.
- **Substantive capture generalizes.** A 12-region, pre-registered,
  source-first reality check against real DSGR (2022 and 2025) and LSB source
  text — not the Superior holdout package — produced genuine, cited rules and
  definitions in all 8 tested provision families.
- **Safety holds perfectly.** Across all 20 real compile+verify calls made
  this mission (8 holdout regions + 12 reality-check regions), 0 silent
  material omissions and 0 false trusted semantics occurred. Every material
  gap the pipeline produced was surfaced by the independent verifier with a
  citation, never hidden behind a false "complete" status.
- **The numeric target gates are not yet met.** A1-A6 substantive-capture rate
  showed real run-to-run variance (2/6 to 3/6 across two post-fix executions,
  against a required ≥5/6); B1-B4's qualifier gate remained 0/4 clean across
  all three real executions to date — the single most stable, reproducible
  finding across this entire multi-session engagement. The 12-region reality
  check's own material-finding pattern (36 findings, 8 of them literal
  absent-value misses) shows first-pass recall well below the required 95% on
  genuinely unseen real content.
- **One concrete, disclosed limitation for continuation:** shared-cap /
  cross-reference dependency wiring. No region — including one purpose-built
  to test it — produced a populated `SharedCapacity` object, despite a
  confirmed real shared cap existing in the DSGR source text.

## Why iteration, not closure and not failure

Every hard safety gate this mission is required to hold (0 silent omissions,
0 false trusted semantics, 14/14 false-credit controls, clean known-package
regression, 0 net-new test regressions, 0 independent-audit blockers) is MET.
Substantive capture generalizes across every tested family on genuinely unseen
content from packages that are not the benchmark. Nothing points to benchmark
gaming, an IR architecture gap, an environment failure, or a trust-boundary
regression. What remains is a real, honestly-measured capability gap on the
hardest decomposition and cross-reference tasks — narrower and better
characterized than at the start of this mission, but not yet closed.

## Artifacts

See `docs/final-semantic-decomposition/00-baseline.json` through
`22-final-verdict.json` for the full evidentiary record, and
`tests/fixtures/unseen-packages/final-semantic-decomposition-holdout-replay/`
and `.../final-semantic-decomposition-reality-check/` for the real, preserved
model outputs underlying every claim in this report.
