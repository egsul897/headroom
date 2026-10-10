# Cycle 6 — Downstream promotion trace

**Audited SHA:** `daa4fb1e72fe9373898fce38a4f27aa8e36d20af`  
**Follow-up tip:** see PR #217 head after acceptance commits

## Ladder

```
DISCOVERED
  → EXECUTABLE_FORMULA_ONLY   (activateSummaryItem.executableEligible)
  → COUNSEL_COMPILE_ELIGIBLE  (counselCompileEligible === true)
  → REVIEW_READY_UNVERIFIED   (audit-backed certificationState)
  → Permission UNVERIFIED     (compileAcceptedInterpretation after human ACCEPT/EDIT)
  → PRODUCTION_AUTHORITATIVE  (never set by KF; durable lifecycle + counsel only)
```

## Discrepancy (item 6) — root cause

On Cycle 5 RR-WITH_GAPS recheck, two records showed:

| Field | Source | Value |
|---|---|---|
| `counselCompileEligible` | `buildReviewReadyRecord` (full-window completeness) | `false` |
| `promotionState` | `activateSummaryItem` (short-excerpt completeness) | `COUNSEL_COMPILE_ELIGIBLE` |

**Cause:** `cycle-6-recall-measure.ts` mixed activation-path `promotionState` with audit-backed `counselCompileEligible`. Activation completeness without the full operative window can over-claim compile eligibility; the review-ready builder correctly forces `BLOCKED_INCOMPLETE_OPERATIVE`.

**Fix:** report `rec.promotionState`; expose `activationPromotionState` for forensics; add `mayEnterCounselCompilePath()` requiring **both** the boolean and consistent labels.

## Consumer enforcement (item 7)

| Consumer | Pre-fix | Post-fix |
|---|---|---|
| `buildReviewReadyRecord` | Sets boolean + state together | Unchanged; boolean is authoritative |
| `mayEnterCounselCompilePath` | n/a | **New** — requires `counselCompileEligible === true` AND `REVIEW_READY_UNVERIFIED` AND matching promotionState |
| `audit-formula-candidates.ts` demos | `counselCompileEligible` filter | Explicit `=== true` |
| `activate-neon-provisions.ts` demos | `executableEligible` only | **Now** `counselCompileEligible === true` |
| `compileAcceptedInterpretation` | Requires human ACCEPT/EDIT + workspace Document | Unchanged — KF cannot auto-promote |

**Rule for all downstream code:** never gate on `promotionState === "COUNSEL_COMPILE_ELIGIBLE"` alone.

## Six false-executables — can they promote?

All six holdout false-executables have audit-backed:

- `certificationState = BLOCKED_FALSE_EXECUTABLE`
- `counselCompileEligible = false`
- `promotionState = DISCOVERED`
- `mayEnterCounselCompilePath = false`
- `PRODUCTION_AUTHORITATIVE` unreachable (KF never sets it; no counsel ACCEPT)

They **did** enter the `EXECUTABLE_FORMULA_ONLY` pool (how they were sampled). Generalized structural / formula-shape gates demote that class without holdout-ID exceptions. Production path remains closed.
