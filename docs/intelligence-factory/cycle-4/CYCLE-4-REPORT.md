# Cycle 4 — From formula candidates to trustworthy rules

**Branch:** `cursor/covenant-intelligence-factory-f761`  
**PR:** https://github.com/egsul897/headroom/pull/217  
**Peer coordination:** [#225](https://github.com/egsul897/headroom/pull/225) (extraction), [#227](https://github.com/egsul897/headroom/pull/227) (Neon→capacity lifecycle)  
**Paid inference:** $0 · **Neon mutations:** 0 · **CERTIFIED / VERIFIED writes:** 0

## Population

| Metric | Value |
|---|---:|
| Sources scanned (PUBLIC_SEC_EDGAR) | 400 |
| Executable formula candidates (Cycle 3 set) | **2,254** |
| Independently audited (stratified) | **61** |
| Holdouts excluded | Gibraltar, Knife River |

### Sample quotas (complex mechanics oversampled)

| Mechanic | Population | Audited |
|---|---:|---:|
| FLAT_AMOUNT | 2,023 | 12 |
| BUILDER_BASKET | 150 | 14 |
| GREATER_OF_FLAT_OR_PCT_EBITDA | 50 | 16 |
| GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS | 24 | 12 |
| LEVERAGE_RATIO_ROOM | 7 | 7 |

## P0 — Independent legal correctness (operative text)

Audit path: Neon `DocumentByteObject` → section/excerpt-anchored operative window → independent formula parse → field verdicts. **Not** summary token overlap.

| Rate | Successes / n | Point | Wilson 95% |
|---|---:|---:|---|
| Formula precision | 33 / 61 | **54.1%** | 41.7–66.0% |
| Threshold precision | 37 / 61 | **60.7%** | 48.1–71.9% |
| Incorrect greater-of vs lesser-of | 0 / 61 | **0%** | 0–5.9% |
| Missed conditions | 37 / 61 | 60.7% | 48.1–71.9% |
| Missed shared-capacity | 6 / 61 | 9.8% | 4.6–19.8% |
| Incorrect / unresolved entity scope | 12 / 61 | 19.7% | 11.6–31.3% |
| Material legal omission (≥1) | 44 / 61 | **72.1%** | 59.8–81.8% |
| False executable classification | 32 / 61 | **52.5%** | 40.2–64.5% |
| Review-ready (exec or with gaps) | 27 / 61 | **44.3%** | 32.5–56.7% |
| Requires human review (strict) | 2 / 61 | 3.3% | 0.9–11.2% |
| Insufficient operative text | 0 / 61 | 0% | 0–5.9% |

### Formula precision by mechanic

| Mechanic | Formula precision | Threshold precision | False executable |
|---|---:|---:|---:|
| FLAT_AMOUNT | 10/12 (**83%**) | 10/12 (83%) | 2/12 (17%) |
| GREATER_OF … TOTAL_ASSETS | 11/12 (**92%**) | 9/12 (75%) | 3/12 (25%) |
| GREATER_OF … EBITDA | 10/16 (**63%**) | 11/16 (69%) | 6/16 (38%) |
| BUILDER_BASKET | 0/14 (**0%**) | 7/14 (50%) | 14/14 (100%) |
| LEVERAGE_RATIO_ROOM | 2/7 (**29%**) | 0/7 (0%) | 7/7 (100%) |

**Trustworthy advance set:** 27 counsel-compile-eligible review-ready records (7 `REVIEW_READY_EXECUTABLE` + 20 `REVIEW_READY_WITH_GAPS`). BUILDER and LEVERAGE candidates largely fail independent re-parse and are blocked from activation.

Artifacts: `independent-audit-report.json`, `independent-audit-summary.json`, `review-ready-activation-records.json`.

## P1 — Neon activation integration

- Path: summary item → `parseCounselFormulaForTest` → (counsel ACCEPT) → `compileAcceptedInterpretation` → Permission **UNVERIFIED**
- No competing activation pipeline; coordinates with PR #227 lifecycle
- Certification states on records: `REVIEW_READY_UNVERIFIED` / `BLOCKED_*`
- **Newly accepted interpretations: 0** (not authorized)
- **New durable Permissions: 0** (not authorized)

## P1 — Authentic calculation examples

| Example | Independent formula | Labeled capacity |
|---|---|---:|
| FWRG §6.01 non-Loan-Party debt | greater-of $30M / 50% EBITDA | $50M |
| CONMED §7.2 | greater-of $50M / 3% CTA | $84M |
| LSB §6.01 | greater-of $70M / 5.5% assets | $110M |

All 3/3: authentic text → independent parse → formula → labeled synthetic finance → capacity. Capacity ≠ legal permission. Gibraltar holdout untouched.

## P1 — Amendment chains

- RESTATEMENT self-link exclusion retained
- Multi-doc chain (base → restatement → two amendments): discovery edges without self-links; operative instrument selected by evaluation date (`tests/knowledge-factory/amendment-chain-operative.test.ts`)

## P2 — Corpus readiness

- Pending authorized SEC documents: **4** (EHB batch; no SEC UA)
- Metadata repair batches remain reviewable/idempotent — **0 applied**
- Artifact: `corpus-readiness.json`

## Regression / holdouts

- KF independent-audit + amendment-chain: pass
- Authentic examples: 3/3
- Blind holdouts (Gibraltar / Knife River): excluded from sample; not mutated

## Optimization note

Cycle 4 optimizes for **legally trustworthy reusable rules**, not max candidate count. Of 2,254 executable-labeled candidates, the stratified audit shows roughly half are false-executable under operative-text checks; ~27/61 sampled (~44%) are review-ready for the existing counsel-compile path without certification.
