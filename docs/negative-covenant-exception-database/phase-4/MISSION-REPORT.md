# NCEDB Phase 4 — Mission Report

Starting SHA: `1456000040f03faeb2beca3c9f46bc2db91ac960`
Dataset: `ncedb.phase4.v1`

## Root causes (Phase 3 failures)
- **RC-1** remote-condition recall 0/6: Naive Phase-3 detector emitted empty predictedRemoteConditions for every limb
- **RC-2** proviso attachment accuracy 0/2: Detector hard-coded predictedProvisoAttachment=NONE
- **RC-3** entity-scope accuracy 0/2: Detector emitted empty predictedEntityScope
- **RC-4** cross-reference accuracy 0/3: Detector emitted empty predictedCrossRefs and silently ignored refs
- **RC-5** incorrect unconditional rate 1.0: Detector always predicted UNCONDITIONAL_SOURCE_VERIFIED

## Before → after (frozen Phase-3 Gibraltar §7.06)

| metric | Phase 3 | Phase 4 |
|---|---|---|
| remote-condition recall | 0 (0/6) | 1 (6/6) |
| proviso attachment | 0 (0/2) | 1 (2/2) |
| entity-scope | 0 (0/2) | 1 (2/2) |
| cross-reference | 0 (0/3) | 1 (3/3) |
| incorrect unconditional rate | 1 (16/16) | 0 (0/16) |

## CKF integration
Status: **ALIGNED_FOR_REVIEW** — productionCapacityApproved always false.

## Costs
actualPaidSpendUsd: **0**
