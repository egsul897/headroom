# Phase 3 — CONMED current-pipeline resume: calibration and execution manifest

Zero paid calls. This directory prepares the resumed CONMED population run; it does not run it.

The denominator was recomputed from the sealed population through the repaired pipeline, offline:
163 discovered → 135 after exact dedup (28 duplicates; the candidate-span repair made two more
pairs byte-identical than the historical 26) → **133 attemptable** (two candidates carry empty
operative text). Nothing is current-pipeline complete under the resume's definition (compile AND
verify AND paired package), so all 133 remain. The halted run's per-candidate rows were lost with
the scratch directory; only its aggregate survives and it is used as corroboration, never as data.

Costs come only from locked-model calls recorded in `docs/`: 17 exact compiles, 9 timeout
reservations, 2 verifier calls, 1 amendment call. Every exact row is re-derived from tokens ×
catalogue price before it enters the table.

| Artifact | What it holds |
|---|---|
| `01-calibration.json` | The recomputed denominator with every candidate's operative span and band, the empirical cost table (included and excluded sources), compile/verify statistics, the timeout reservation, the four scenarios with formulas, the recommended ceiling and stop-at, and the nine benchmark cases mapped into the population |
| `02-execution-manifest.json` | The manifest: entry point and start guard, model lock, execution policy (480 s, concurrency 1, one attempt, no retry, no fallback), paid calls per candidate, budget and halt conditions, the complete-candidate definition, persistence path, run-manifest schema, benchmark cases, post-run scoring plan and decision tree |

Entry point: `scripts/p3-conmed-pilot/run-population-verified.ts` (compile + verify + paired
persistence; `--dry-run` computes the plan offline). Calibration: `resume-calibration.ts`.
