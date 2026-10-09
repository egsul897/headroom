# Cycle — Suja HTML structure + deeper mechanics

**Parent tip:** `3a6d83fe` → this cycle  
**Paid inference:** 0 · **promotedToLegalTruth:** 0

## Suja defect (root cause → fix)
- **Symptom:** `structuralNodes: 0`, `covenantCandidates: 1`, Ask insufficient on all questions
- **Cause:** SEC HTML extract collapses `6.1 Indebtedness.` headings into paragraph flow (avg line ~1700). Line-anchored SECTION patterns find nothing. Phase 3 `stage-structure` left untouched.
- **Fix (KF only):** `normalizeStructureScanText` restores newlines before/after bare `N.N Title.` when avg line ≥ 400; wired through structure/defs/xrefs/candidates/conditions.
- **After:** Suja → **780 nodes**, **82 candidates**, **82 summary items**, secured-debt Ask **dualRegime=true** citing **§6.2 + §6.1**, growers 10 / builders 14.

## Mechanics beyond keywords
- Anti-stacking: scope + paired-clause clips
- Reclassification: election clips + reallocation paths
- Incremental: fixed mechanics, ratio condition, limbs, election order
- Available Amount: additive/deduction limbs (windowed before Incremental Cap)

## Regression
- `tests/product/collapsed-html-structure.test.ts`
- Extended `basket-mechanics` for AA limbs / incremental election order

## Boundaries
Phase 3 compiler / certification paths unchanged. Neon writes keep `promotedToLegalTruth: 0`.
