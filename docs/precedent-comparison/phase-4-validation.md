# Precedent Comparison Intelligence — Phase 4

**PR:** #144  
**Starting head:** `86cb255cd0737f94a0fc27766a35657310da8001`  
**Phase 3 code tree:** unchanged vs `9f2ba8c` (docs-only delta confirmed)

## Mandatory return

1. **Starting / ending SHAs:** start `86cb255cd0737f94a0fc27766a35657310da8001`; Phase 4 code `5b1e27015efd00bb5153551fa14c65dbbc0704d0`; CI-green tip `40a1083c816550e73d7f30408570e915731f3e21`.
2. **Context completeness (100 stratified):**
   - Span-heuristic complete rate **64% → 81%** (parent-basket assembly in corpus audit).
   - Dependency-classification incomplete **54 → 52** after peer assembly attempt (mostly unmounted peers; residual gaps → `comparisonQualified`).
   - Dominant gap kinds: CROSS_REFERENCE (106), DEFINED_TERM (25), ENTITY_RESTRICTION (12).
3. **D18 / D28 / H02:**
   - **D18** — orthographic ratio tokens treated as ECONOMICS difference → **fixed** (normalize `N to 1.00` / `N:1.00`); positive control 4.00 vs 3.50 retained.
   - **D28** — `ordinary course` vs `ordinary-course` missed feature → **fixed** (hyphen-tolerant); positive control without carveout retained.
   - **H02** — Borrower naming elevated as SCOPE/STRUCTURE → **fixed** (borrower-only → SEMANTIC_HYPOTHESIS); Restricted Subsidiary/Guarantor asymmetries still elevate.
4. **Independent metrics (Phase 4 held-out, n=15):** precision **1.0** (den 9); recall **0.818** (den 11); false-material **0**; missed-material **2**; citation **1.0**; unsupported refusal **1.0**. Phase 3 held-out false-material after remediation: **0**.
5. **Authentic documents added:** **0** new agreements (text slices reused under Phase-4 identity; no CKF mount).
6. **CKF integration:** **not mounted** — import probe `imported=0`; no second SEC downloader; samples not treated as production.
7. **Tests / CI:** `npx vitest run tests/precedent-comparison` → **52 passed**; **CI: all 2 checks green** on `40a1083`.
8. **Remaining legal-safety limitations:** unmounted peer exports; heuristic context ≠ full closure; SOURCE_SUPPORTED ≠ REVIEWER_VERIFIED; no certification.
9. **PR status / costs:** Ready for review (not merged); **$0** paid inference.

Artifacts: `phase-4-results.json`.
