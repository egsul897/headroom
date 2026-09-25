# Phase 3 — CONMED current-pipeline population run (compile + verify + paired persistence)

The first complete current-pipeline CONMED evidence set: every attemptable candidate of the sealed
population compiled once and, where compilation completed, verified once through the current
verifier, with the forensic evidence and the paired verified-unit package written from the same
in-memory objects. Executed under the manifest in `docs/phase-3-conmed-resume/` — locked model
`deepseek/deepseek-v4-flash`, 480 s per call, concurrency 1, one attempt, no retry, no fallback,
$3.50 ceiling with STOP_AT $3.4506 under reserve-before-dispatch accounting.

No benchmark case is scored here. Scoring is the next mission.

| Artifact | What it holds |
|---|---|
| `run/` | The complete scratch output copied verbatim and verified by sha256: `00-plan`, `01-statuses`, `02-costs`, `03-run-manifest`, `preflight-health`, `run.log`, and `evidence/` with one forensic evidence file per candidate, `evidence/verified-units/` with one paired package per candidate, and `evidence/verified-units-manifest.json` |
| `01-run-validation.json` | End-of-run validation: secret scan, every package hash re-checked, run-manifest and ledger reconciliation, denominator reconciliation, band breakdown, the nine benchmark candidates' execution facts, the file inventory with hashes |
| `02-run-report.json` | The mission's own report: what was attempted, what happened, what it cost, and what was observed but not remediated |

Long-band candidates (operative span ≥ 1,886 chars) that timed out are classified
EXECUTION_LIMITED. That is a model capability measurement, not a semantic miss.
