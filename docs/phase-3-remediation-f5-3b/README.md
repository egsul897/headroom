# Phase 3 / F-5.3B - dual-pass semantic ensemble: production activation + authoritative certification attempt

Verdict: **F5_3B_ENVIRONMENT_BLOCKED** (see `11-final-summary.json`).

Zero-cost work (complete, tested, committed): STRICT input-compatibility gate (`ensemble.ts`, `source-identity.ts`), dual-pass production mode (`dual-pass.ts`, `compile.ts` `inventoryMode: DUAL_PASS_ENSEMBLE`), support-trust propagation (`reconciliation.ts`, `rollup.ts`, `compile.ts` failure reason `SEMANTIC_SUPPORT_REVIEW_REQUIRED`), Pass B support tags (`caller.ts`). E1 reproduced exactly at the starting SHA and under the final code (hash `6f648e72...`).

Paid pair: `cert-pass-1` completed (332 items); `cert-pass-2` failed at batch 4/7 on a gateway transport error (`gateway_stream_terminated`). The orchestrator refused to build a one-pass ensemble. Spend $4.73 of the $8.00 cap; a retry (~$3.40) would breach the cap, so no further paid call was made. No E2 exists; the ensemble stability gates are unmeasured, not failed.

| file | content |
|---|---|
| `00-freeze-manifest-and-e1-baseline.json` | frozen hashes + E1 reproduced at the starting SHA |
| `01-e1-reference-recall.json` | E1 frozen-reference recall (1.0) |
| `03-scorer-preregistration.json` | pre-registered scorer hash + gates (frozen before the pair) |
| `04-paid-pair-precheck.json` | precheck (GO) |
| `06-e1-rebuilt-final-code.json`, `e1-final.json` | E1 under the final STRICT code (identical hash, order-independent) |
| `11-final-summary.json` | verdict, cost, run C/D records, diagnostics, resume path |
| `12-diagnostic-*.json` | single-pass diagnostics (NOT certification): run C vs A / B, run C reference recall |

Scripts: `scripts/f5-3b-e1-baseline.ts`, `scripts/f5-3b-certification-pair.ts`, `scripts/f5-3b-ensemble-certification-score.py` (pre-registered), `scripts/f5-3b-e2-checks.ts`, `scripts/f5-3b-residual-recovery.py`, `scripts/f5-3b-certification-analysis.py` (the last three await a built E2).
