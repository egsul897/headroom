# Inventory reconciliation (deep explore)

Cross-check of shipped `BASELINE-INVENTORY.md` against parallel deep inventories:

- [Inventory KF/EHB/flywheel](bc-f5031287-f3f2-5b27-b651-60dfc95839f6)
- [Inventory compiler/eval/Neon](bc-d4ea5c84-19a4-5a35-a438-228b30b4d61f)

## Confirmed (no rebuild)

| Finding | Action |
|---|---|
| Canonical offline entry = `compileFrozenDebtPackage` | Already CLF process path |
| KF pipeline + mass-precedent + EHB handoff reusable; no auto-promotion | Already inventory + promotion guards |
| Live path = `runContractAnalysis`; Phase C `compiler/orchestrator.ts` quarantined | Added `live-analysis-orchestrator` + `phase-c-compiler-quarantine` |
| Paid semantic compile queue disabled | Added `kf-uncertainty-queue` as incomplete |
| Mass-precedent Neon bulk write needs owner approval | Noted on `kf-mass-precedent` |
| No Prisma `CovenantSummary` model | Added as **missing** (`covenant-summary-prisma`) — out of MVP |
| Unified TRAIN_DEV/HELD_OUT registry was a gap | Partially filled by `lib/covenant-learning-factory/cohorts.ts` |
| Live Neon inventory historically auth-blocked | Still blocked this run: host reachable, **`28P01` auth failed** for `neondb_owner` (see `neon-connect-status.json`) |

## Explicit non-goals (both inventories)

- No closed-loop ML weight training
- No silent CERTIFIED / production Permission promotion
- No second compiler parallel to Phase 2–4 substrate
