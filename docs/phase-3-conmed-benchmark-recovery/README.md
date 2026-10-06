# Phase 3 — CONMED benchmark recovery (BENCHMARK_RECOVERY)

A supplementary run over the eight V3.1.1 benchmark cases that were EXECUTION_LIMITED in the
immutable one-shot population (7.1, 7.2, 7.10, 7.2(c), 7.13, 7.14, 7.16, 7.17; 7.11 excluded because
it already has complete evidence). Same locked model, compiler, verifier, prompts, context, limits
and 480 s timeout; concurrency 1; one attempt each in Pass 1 and at most one bounded retry in Pass 2;
a fresh $15.00 ledger (STOP_AT $14.90) with the P-7 shape-derived reservations, the hard pre-dispatch
invariant and the P-6 credit-exhaustion stop. The population record is untouched.

Result: **0 of 8 recovered**. Every served attempt timed out with the same shape: the Pass A
semantic-inventory stage alone returned 26k–117k output tokens, exhausting the ceiling before any
shard compile could run. The ceiling admitted exactly one Pass 2 retry (7.2(c)), which timed out too.

The run executed in four segments, each preserved verbatim and validated; a later segment resumes
from the preserved one before it, never re-attempts a recorded attempt, and seeds its ledger from the
earlier cumulative ledger so one $15 ceiling governs the whole run.

| Artifact | What it holds |
|---|---|
| `run-segment-1/` | 7.1 attempt 1 (TIMEOUT). Stopped by the operator after one row because the loop had settled the timeout from Pass A usage instead of retaining the reservation (fixed, pinned); 7.10 was in flight and its attempt is consumed as HARNESS_ABORTED_IN_FLIGHT |
| `run-segment-2/` | 7.13, 7.14, 7.16 (all TIMEOUT); stopped by the P-7 shape guard on 7.16 (Pass A output 63,943 > 60,000 reserved) |
| `run-segment-3/` | 7.17, 7.2, 7.2(c) (all TIMEOUT); Pass 1 complete; stopped by the guard on 7.2(c) (116,913 > 96,000) |
| `run-segment-4/` | Pass 2: 7.2(c) attempt 2 (TIMEOUT); next dispatch refused by the hard ceiling. Its `03-run-manifest.json` is the consolidated manifest of all nine attempts, canonical selection and variance |
| `01-segment-N-validation.json`, `01-run-validation.json` | Per-segment validation (the last one is the final): targets, attempt counts, reservations, ledger and seeded-prior reconciliation, population immutability, sha256 inventory |
| `02-recovery-report.json` | The mission report |

No benchmark case is scored here.
