# docs/phase-3-final-closure

Evidence for HEADROOM — PHASE 3 V3 CALIBRATION, SOURCE-DOCUMENT ADJUDICATION & FINAL SEMANTIC CLOSURE.

Starting SHA: `2948677fa237066b3bba9525cb3d43941c8e8d09` (verified independently, §1).
Production files changed: **0**. No Phase-3 production defect was proved, so none was changed (§3, §45).

## Verdict

- Phase 3: **PHASE3_ADJUDICATION_CONTRACT_AMBIGUOUS**
- Phase 4E: **PHASE4E_FOUNDATION_NOT_READY**

The disagreement that blocks closure is **not** evidentiary. On the worked case `a-7.1` all
three adjudicators record identical facts and apply different invariants, and the written V3
contract adjudicates between those invariants nowhere. That is a specification defect in the
evaluation methodology, not a defect in Phase-3 output.

## Independence disclosure (§7)

This analysis was performed by the **same agent** that performed the prior Phase-4D remediation
and post-remediation audit. It is **not** independent human consensus. No case was re-adjudicated
and no fourth opinion was added. The inter-reviewer surfacing agreement of 74.07% therefore
cannot be raised from inside this mission — see `15-independence-limitation.json`.

## Artifacts

| # | File | Covers |
|---|------|--------|
| 01 | starting-state | §1 independently verified HEAD, branch, tree hashes |
| 02 | v3-contract-reconstruction | §4/§5 the contract as written, plus AMB-1 and AMB-2 |
| 03 | surfacing-definition | §5 ten questions the contract must answer, and the `a-7.1` worked disagreement |
| 04 | disagreement-corpus | §6 all 47 credit rows and 36 surfacing rows with root causes |
| 05 | confusion-matrices | §8 raw counts and pairwise agreement, independently recomputed |
| 06 | threshold-forensics | §9 distance to the 0.90 threshold; the 1 flip that was NOT taken |
| 07 | historical-false-credit-regression | §10 the 14 controls and 1,115 units, re-run |
| 08 | evaluator-implementation-audit | §11 atomic-contract.ts read in full against 11 checks |
| 09 | source-adjudication-shared-capacity | §13 the 7 SHARES_CAPACITY_WITH edges |
| 10 | source-adjudication-reclassification | §14 reclassification mechanism search |
| 11 | root-cause-classification | §12 every disagreement assigned a root cause |
| 12 | production-defect-determination | §12 — **no production remediation was necessary** |
| 13 | remediation-log | §12 — **no production remediation was necessary** |
| 14 | goalpost-integrity | §25 six no-moving-the-goalposts checks |
| 15 | independence-limitation | §7 who actually did this |
| 16 | determinism-and-replay | §26 replay evidence on four layers |
| 17 | end-to-end-trace | §31 31,000,000 → 1,000 → 30,999,000, re-run |
| 18 | known-false-credit-controls | §10 the 14-control table re-derived |
| 19 | quality-gates | §37/§38 vitest, tsc, lint, build, by failing identity |
| 20 | cross-dataset-regression | §10 the 1,115-unit run |
| 21 | phase4e-readiness | §40/§44 verdict and the exact blocking condition |

## Frozen evidence integrity (§2)

Nothing under `docs/evaluation-contract-v3/`, `docs/evaluation-v2*/`, `docs/phase-4d/` or
`docs/source-coverage-repair/` was modified. Where a re-run's script hardcodes a frozen output
path, the frozen bytes were preserved and restored, and the sha256 is recorded before and after.
