# Agent 1 Cycle 3 — Required Return

**PR:** https://github.com/egsul897/headroom/pull/217  
**Branch:** `cursor/covenant-intelligence-factory-f761`  
**Tip SHA:** `15809e3e6ca3e0e37fe3b113bba4a372f2a7e189`  
**Paid inference:** $0  
**Neon mutations applied:** 0  

## 1. New authentic documents actually ingested
**0** into Neon this cycle (no SEC User-Agent / no live-write authorization).  
EHB plan: 25 planned → 21 already present → **4 pending authorized fetch**.

## 2. New unique provisions actually persisted
**0** new Neon provision rows. Activation is read-only over existing v2 summaries.

## 3. Existing provisions newly activated
- Scanned **21,994** summary items (400 sources)
- **2,254** independently checked executable formula candidates (`NOT_CERTIFIED`)
- Breakdown: FLAT 2023 · BUILDER 150 · GREATER_OF_EBITDA 50 · GREATER_OF_ASSETS 24 · LEVERAGE_ROOM 7

## 4. Correctly extracted formulas and thresholds
Independent excerpt-token checks for $ / % / greater-of language. Sample greater-of EBITDA candidates include thresholds such as $12M@15%, $150M@9.5%, $100M@25%.

## 5. Independently verified executable candidates
**2,254** with `allChecksPassed` and `certificationStatus: NOT_CERTIFIED`. No Permission writes.

## 6. Correct executable calculations
5 synthetic demos via `evaluateProvision` (labeled `SYNTHETIC_LABELED_FINANCIAL_INPUTS_NOT_COMPANY_CAPACITY`):
- §5.14: max(12, 0.15×500) = **75** modeled
- §7.02: max(150, 0.095×500) = **150** modeled
- §6.01(j): max(100, 0.25×500) = **125** modeled  
**Not company capacity.**

## 7. Incorrect calculations and false permissions
- Live path false permissions: **0/2**
- Adversarial CKG control: **1/2 (50%)** retained as detection control
- No incorrect live capacity claimed

## 8. Exact false-permission control results
| Path | Failures | Evaluated | Rate |
|---|---:|---:|---:|
| CKG adversarial fixture | 1 | 2 | 50% |
| Live Ask→bridge path | 0 | 2 | **0%** |

Failing adversarial case: `syn-false-perm-general-prohibition` with injected `{permitted:true,status:PERMITTED}`.  
Not production-reachable. Certification gates keep discovery non-authoritative (`usableByPhase4A/E=false`).

## 9. Metadata repairs proposed vs applied
| | Proposed | Applied |
|---|---:|---:|
| instrumentIdentity | 675 | **0** |
| UNKNOWN safe reclass | 13 | **0** |
| UNKNOWN byte-review hold | 167 | 0 |

## 10. Neon writes and authorization status
**Neon writes: 0.** Authorization not granted (`KF_MASS_PRECEDENT_LIVE_WRITE` unset). Reviewable batches staged under `docs/intelligence-factory/cycle-3/`.

## 11. Regression and blind-holdout results
| Metric | Result |
|---|---|
| shared_capacity_recognition | 100% |
| amendment_reconstruction | **100%** (was 66.7%) |
| unseen_document_performance | **100%** (was 0%) |
| false_permission_rate (adversarial) | 50% control retained |
| Gibraltar HOLDOUT_DEVELOPMENT | untouched |
| Knife River HOLDOUT_BLIND | untouched |
| `tests/knowledge-factory` + new probes | pass |

## 12. PR, SHA, CI, cost
- PR #217
- Cost: **$0** paid inference; **0** Neon mutations; **0** SEC fetches
- Tip SHA recorded at push
````