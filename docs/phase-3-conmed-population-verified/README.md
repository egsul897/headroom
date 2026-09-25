# Phase 3 — CONMED current-pipeline population run (compile + verify + paired persistence)

The first complete current-pipeline CONMED evidence set: every attemptable candidate of the sealed
population dispatched once and, where compilation completed, verified once through the current
verifier, with the forensic evidence and the paired verified-unit package written from the same
in-memory objects. Executed under the manifest in `docs/phase-3-conmed-resume/` — locked model
`deepseek/deepseek-v4-flash`, 480 s per call, concurrency 1, one attempt, no retry, no fallback,
$3.50 ceiling with STOP_AT $3.4506 under reserve-before-dispatch accounting, carried across runs.

No benchmark case is scored here. Scoring is the next mission.

The population was executed in three segments because the cloud container is reclaimed on session
inactivity, which kills every process. Each segment wrote beside the others, never over them; each
later segment derived its skip set and its seeded spend from the preserved artifacts of the earlier
ones, and never re-attempted a candidate with a terminal record or an in-flight (indeterminate)
request.

| Artifact | What it holds |
|---|---|
| `run-original/` | The original run (104 of 133 attempted; container restart with 7.6(f)(i) in flight), copied verbatim and verified by sha256: `00-plan`, `01-statuses`, `02-costs`, `03-run-manifest.reconstructed`, `preflight-health`, `run.log`, `evidence/` (one forensic evidence file per candidate, `verified-units/` packages, `verified-units-manifest`). Was `run/` when `01-run-validation.json` and `02-run-report.json` were written. |
| `01-run-validation.json`, `02-run-report.json` | The original run's validation and report |
| `run-continuation-1/` | Continuation segment 1: 28 dispatched, 1 attempted (7.6(f)(ii) TIMEOUT), killed by a container reclaim with 7.6(g) in flight |
| `run-continuation-2/` | Continuation segment 2: the remaining 26, all attempted; from 7.9(a) onward the gateway refused every request with HTTP 402 (credit exhausted), so 10 candidates carry an unserved PROVIDER_FAILURE row |
| `03-continuation-N-validation.json` | Per-segment validation: secret scan, package hashes, dispatch order, no prior candidate re-attempted, ledger = seeded prior + own charges, gateway refusals, P-1 occurrences, file inventory with hashes |
| `04-population-manifest.json` | The consolidated manifest: all 135 dedup candidates exactly once (131 terminal attempts, 2 EMPTY_OPERATIVE_TEXT, 2 IN_FLIGHT_UNKNOWN), with `served` and `providerFailureKind` per row, the merged cost components, band and benchmark execution facts |
| `05-continuation-report.json` | The continuation mission's own report |

Long-band candidates (operative span ≥ 1,886 chars) that timed out are classified
EXECUTION_LIMITED. That is a model capability measurement, not a semantic miss. Candidates the
gateway refused before any model work (`served: false`) are execution-environment failures, not
pipeline outcomes.
