# Handoff 02 — Restatement / operative-document authority

**Priority:** 2  
**Status:** ADDRESSED by Agent #7 (PR #283) — additive `lib/contract-model/compiler/operative-authority/` + offline-compile wiring  
**Source:** HEADROOM-3/5 — WOR doc-a/doc-b both classify as `AMENDED_AND_RESTATED_AGREEMENT`.

## Resolution delivered

- Deterministic governing-document selection for A&R → A&R succession from authentic caption / recital / §11.01-style operative language / signatures / facility continuity.
- `buildOperativeAuthorityHandoffBundle` consumed by `compileFrozenDebtPackage` (Agent #6 / unified execution pathway).
- Consumes #274 `ConfirmedInstrumentIdentityView` when available; **never** mutates package-graph RESTATES edges.
- WOR: as-of 2026-08-30 → doc-a (`NOT_YET_EFFECTIVE`); as-of 2026-08-31 → doc-b (`CONFIRMED_OPERATIVE_WITH_CAVEATS`).
- Effectiveness: `INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION`; CP satisfaction `NOT_INDEPENDENTLY_PROVEN` (supported by contractual language, not established).
- `evaluateProductionAuthorityPromotion` refuses `PRODUCTION_AUTHORITY_ACTIVE` for caveated / provisional / conflicting / review-required authority.

## Remaining (out of Agent #7 ownership)

- Broad relationship backfill / TOCTOU uniqueness activation from #246
- Independent CP-satisfaction proof from closing evidence outside the agreement text
- Production capacity activation (financial/utilization — separate gates)
