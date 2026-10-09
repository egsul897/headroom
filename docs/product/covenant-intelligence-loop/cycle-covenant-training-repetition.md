# Cycle — Continuous covenant training through repetition

**Parent tip:** `e2762398` → this cycle  
**Paid inference:** 0 · **promotedToLegalTruth:** 0 · **Status:** AGENT_REVIEWED_PROVISIONAL

## Method
Deterministic training loop (`scripts/product/train-covenant-repetition.ts`): analyze → verify against operative text → score L1/L2/L3 probes → fix generalizable defects → regression → persist.

## Targets (8)
Gibraltar, Chewy, CONMED Art.VII, Riot SAR, LSB Art.VI, FWRG Art.VI, Suja (Neon), Maravai (Neon)

## Accuracy by difficulty (final cycle)
| Level | Pass | Fail |
|---|---|---|
| L1 straightforward | **41** | **0** |
| L2 intermediate | **29** | **0** |
| L3 complex | **18** | **0** |

Baseline at cycle start: L1 41/0 · L2 28/1 · L3 14/4

## Verified defects → generalizable fixes
1. **Long-section truncation** dropped trailing reclass (CONMED §7.2) and mid-body Fixed Incremental / anti-stack — `stitchHeadTail` now keeps head + relationship hotspots + tail.
2. **Incremental Cap alias defs** (Maravai) — merge `extractBaskets` from operative Incremental Cap definition onto debt/incremental items; recognize Incremental Prepayment Amount naming.
3. **AA builder pointer** (Gibraltar “Available Amount Builder Basket” → §7.05(a)(y)) — surface section pointer + limb signals.
4. **False debt GP** on Chewy prepayment §2.09 — demote Mandatory Prepayment / ECF / repatriation spans.
5. **Anti-stack scope dropped by summary budget** — priority boost + sibling `propagateRelationshipClips`.

## Regression
- `tests/product/covenant-training-repetition.test.ts`
- Existing basket / dual-regime / collapsed-HTML suites green

## Remaining weaknesses
- Article-only fixtures (LSB/FWRG/CONMED) skip many L2/L3 probes when defs absent
- Full AA arithmetic still signal-level, not executable IR
- Multi-document amendments / side letters not yet exercised in this loop
