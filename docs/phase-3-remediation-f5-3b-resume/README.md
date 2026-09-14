# Phase 3 / F-5.3B RESUME - one fresh second pass, authoritative E2 certification

Verdict: **F5_CLOSED** (see `09-final-summary.json`).

E2 = STRICT Ensemble(preserved run C [332 items], fresh run D2 [350 items]) = 390 canonical items (292 corroborated, 40 C-only, 58 D2-only, 0 conflicts), hash `1dfe368a2f4dc6f0...`, INVENTORY_COVERAGE_GAP with 21 unaccounted stretches (all 21 present in both passes remain disclosed).

E1 vs E2 (pre-registered scorer sha256 `0ac56e31...`, unchanged): strict 0.8322, semantic 0.8582, CRITICAL/MATERIAL 0.8565, span 0.9951, quantitative 0.9048, condition/exception 0.7218, dependency 0.6504, semantic-function (all tokens) 0.724; item-count delta -6. Decomposition: {'A_IDENTITY_VARIANCE': 57, 'D_TRUE_ENSEMBLE_OMISSION': 1, 'G_OTHER': 1, 'E_TRUE_ENSEMBLE_ADDITION': 1}; dangerous silent omissions 0. Reference recall E1/E2 = 1.0 on every measured dimension. Review burden 28.28% -> 25.13%.

Paid: 8 calls (7 first-pass + 1 gap), 0 failures, $3.3013 (cap $4.50). Production diff from c4373f7: zero.

| file | content |
|---|---|
| `01-resume-precheck.json` | identity/contract hashes for C and D2, estimate, balance, GO |
| `07-ensemble-certification-score.json` | E1 vs E2 pre-registered scorer output (metrics, support diagnostics, A-G rows) |
| `08-reference-recall-e1-e2.json` | frozen human-reference recall E1 / E2 |
| `09-e2-deterministic-checks.json` | STRICT compatibility, order independence, source verification, support propagation, values/lineage, recomputed coverage + rescue |
| `09-final-summary.json` | gates, criteria, cost, verdict |
| `10-historical-residual-recovery-e2.json` | F/B/H residual semantics recovered by E2 (diagnostic) |
| `11-material-de-inspection-and-support-diagnostics.json` | every material D/E case inspected; singleton/pass cross-tab; review-burden delta |

Evidence: `tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b-resume/` (run-D2.json, e2.json, ledger.json, pair.json). Preserved run C and the old failed D stay untouched under `certification-f5-3b/`.
