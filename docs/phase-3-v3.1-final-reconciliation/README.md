# Phase 3 — V3.1.1 benchmark correction, evidence repair and final re-adjudication

The mission before this one audited the 47-case V3.1 benchmark against primary legal
source and returned `PHASE3_V3_1_BENCHMARK_REQUIRES_CORRECTION`. Four of the ground-truth
claims were wrong, nine evidence excerpts pointed at unrelated text, and two cases could
not be located in the source at all. This mission repairs the measuring instrument and
then re-reads the measurement.

Everything here is additive. No frozen artifact was modified; `01-starting-state.json`
hashes all 34 of them before generation and `10-regression-and-determinism.json` re-hashes
them afterwards.

## Verdict

**`PHASE3_SEMANTIC_REMEDIATION_REQUIRED`**

The benchmark is no longer unsafe to read. The corrected measurement is worse than the
one it replaces.

## What changed in the benchmark

| | count |
|---|---|
| Claim corrections applied | 4 (plus 1 further omission found by this mission) |
| Excerpt repairs | 11 (9 named by the audit, 2 found here) |
| Source-unresolved cases resolved | 2 of 2 |
| Cases carrying a primary-source location | 47 of 47 |

The four claim corrections are the ones the audit proved: `CASE-e3520246bd` and
`CASE-9001417020` were missing a no-Event-of-Default gate the source imposes;
`CASE-a898053843` recast a general asset-disposal basket as an ABL-Priority-Collateral-only
basket; `CASE-1284ab8e71` omitted a carve-out and, materially, the anti-stacking proviso
that is the whole economic meaning of its $500,000 basket.

The fifth is new. Resolving `CASE-e555117f4c` against the located EBITDA definition showed
the frozen claim had omitted the 20% Combined Cap on add-back clauses (a)(vii), (a)(viii)
and (a)(xviii)(b), and the stipulated 2021 quarterly overrides. Both were added. Every
correction in this mission makes the benchmark stricter except one — the
`CASE-e3520246bd` claim that the basket had "no default condition attached", which was
simply false.

`CASE-5c33066800` and `CASE-768547a920` were added to the repair set under §9: the audit
named `CASE-5c33066800` as an example of the wrong-excerpt defect but left it out of its
own nine-case list, and `CASE-768547a920` fails the identical containment test.

## What the corrected measurement says

| | prior (V3 consensus) | corrected |
|---|---|---|
| CREDIT | 11 | **12** |
| NO_CREDIT | 36 | **35** |
| ABSTAIN | 0 | **0** |
| Fully surfaced (NO_CREDIT) | — | **13** |
| Partially surfaced (NO_CREDIT) | — | **9** |
| Not specifically surfaced (NO_CREDIT) | — | **13** |
| **Dangerous silent omissions** | **15** | **22** |

One credit decision changed and nine surfacing decisions changed. The single credit flip is
`CASE-e3520246bd`, and it flips because Headroom extracted the no-Event-of-Default
condition correctly and the benchmark said there wasn't one.

Dangerous silent omissions rose from 15 to 22. That is the intended consequence of
applying V3.1's atomic-surfacing rule with an explicit proposition decomposition, which
V3.1 itself says takes precedence over its derived signals. A warning about one sub-part
of a composite claim no longer counts as a warning about its siblings.

The decomposition rule is not applied in one direction only. It demotes seven cases and
**promotes two** (`CASE-5ac1cd56ef` and `CASE-e008d4278a`, where the frozen evaluator's
structural proxy had demoted claims whose descendant flags in fact tile every material
proposition).

## Where Phase 3 actually stands

All 35 NO_CREDIT cases are root-caused. Four genuine production defect groups:

1. **P3-DEFECT-1 — inventory not promoted (20 cases, 57%).** The system found the
   provision and never compiled it. This is a throughput problem at one seam, not an
   extraction-quality problem, and it is by a wide margin the largest lever in Phase 3.
2. **P3-DEFECT-2 — chapeau and flush text never raised as a unit (6 cases).** Every
   candidate sits at a numbered descendant. The chapeau is the part that states what is
   forbidden.
3. **P3-DEFECT-3 — composite rule flattened (4 cases).** A rule captures the chapeau and
   points at the exceptions; where an exception carries its own gate, the pointer discards
   it, and a pointer that discards a gate over-permits.
4. **P3-DEFECT-4 — cross-reference absorbed as structural containment (6 cases).** Text in
   Article I that says "permitted under Section 6.05" is addressed `6.05(A)(a)(B)(b)`.
   This is the same failure mode that produced the benchmark's own bad excerpts, which is
   why it is worth fixing once, generically, on both sides.

Two further groups are recorded as observations, not defects: two cross-document
dependencies that cannot be resolved from the filed package, and two cases where the
system compiled the provision and then honestly said it had not fully modelled it. In one
of those the system's own `unresolvedReasons` name the Combined Cap that the benchmark
grading it had left out.

## Artifacts

| file | section | contents |
|---|---|---|
| `01-starting-state.json` | §2 | starting SHA, the SHA discrepancy, 34 frozen-file hashes |
| `02-corrected-benchmark-cases.json` | §3 | the claim corrections, with superseded text preserved |
| `03-source-excerpt-repairs.json` | §4/§9 | 11 repairs, each proved to come from the operative provision |
| `04-source-unresolved-resolution.json` | §5 | both source-unresolved cases, resolved |
| `05-v3.1.1-corrected-47-case-corpus.json` | §6 | the versioned corpus and its content hash |
| `06-affected-case-manifest.json` | §7 | all 47 cases in exactly one bucket |
| `07-readjudication.json` | §8/§9/§10 | 22 source-grounded adjudications, with cited candidate IDs |
| `08-final-47-case-results.json` | §11 | the canonical result |
| `09-phase3-defect-backlog.json` | §12 | per-case root causes and the defect groups |
| `10-regression-and-determinism.json` | §15 | frozen hashes after generation, artifact hashes |
| `11-phase3-closure-gate.json` | §13 | the gate, criterion by criterion |

## How to regenerate

```
npx tsx scripts/v3-1-1/build-artifacts.ts
npx vitest run tests/benchmark-v311/
```

The generator is a pure function of the frozen inputs and the authored data modules in
`scripts/v3-1-1/`. Two runs produce byte-identical output; test 16 asserts it.

## What this mission did not do

No production extraction, compiler or analyzer logic was changed. No Phase 4A/4B/4C/4D
file was touched. Phase 4E was not started. No threshold, denominator or closure criterion
was altered — the same criteria applied to a corrected benchmark return a worse result,
and that is the finding.

No second three-model review was commissioned (§8), and the deterministic adjudication
here is not a substitute for the independent human round that the prior mission's gate
still requires.
