# F-5.2A - zero-cost forensics + architecture proof (source-owned inventory obligations)

Starting SHA `0ca111f4a107a178cd993c7f6db0c1fcb64e66dd`. Input data: the ALREADY-PAID F-5.1 pair
(`tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5/run-A.json`, `run-B.json`) and the frozen
scorer's decomposition. Paid calls 0, spend $0.00, no provider access. **Verdict: F5_2_ARCHITECTURE_NOT_PROVEN**
(hypothesis proven; the generic obligation ledger misses the pre-registered capture and false-obligation thresholds).
No production file changed.

| # | artifact | what |
|---|----------|------|
| 01 | `01-f-cases.json` | every F_TRUE_SEMANTIC_OMISSION: slot, full slot text, span, functions, values, refs, missing-run coverage disposition, overlapping/subsuming items, scorer check, source form A-L, failure stage |
| 02 | `02-b-h-cases.json` | the 12 B and 6 H cases, same record; 8 B + 6 H share F's root |
| 03 | `03-failure-stages.json` | earliest failure stage per F case: MODEL_ENUMERATION_OMISSION 34, GAP_MODEL_OMISSION 16, partition/post-processing/scorer 0 |
| 04 | `04-hypothesis.json` | per-slot proposition counts A vs B: 284 slots populated by both, 38 with different counts; all 50 F cases in slots where the missing run produced fewer items |
| 05 | `05-preregistration.json` | the gate, written before any ledger was generated |
| 06 | `06-obligation-ledger-chewy-608(-fine).json` | the generic ledger (619 obligations conservative / 927 fine), byte-identical across two generations |
| 07 | `07-counterfactual(-fine).json` | paid A/B mapped onto the ledger: F capture 0.56 / 0.60, false obligations 0.53 / 0.61 |
| 08 | `08-architecture-gate.json` | gate evaluation |
| 09 | `09-final-summary.json` | verdict, why generic obligations fail, recommendation |

Scripts: `scripts/f5-2a-forensics.ts`, `scripts/f5-2a-counterfactual.ts`, `scripts/f5-2a-obligations-experiment.ts`
(the generator/resolver used for the experiment; not wired into production).
