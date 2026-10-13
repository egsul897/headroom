# Irreducible blocker

## Code

`PHASE3_SEMANTIC_VERIFICATION_NOT_CLEAN`

## Statement

CONMED §7.6(d) cannot enter **CERTIFIED → VEP → eligible CANDIDATE → verified capacity → transaction simulation** until Phase-3 semantic verification is clean against authentic evidence.

## On-disk facts (not invented)

| Fact | Value |
|---|---|
| Compile | `REVIEW_REQUIRED` / `SEMANTIC_ACCOUNTABILITY_INCOMPLETE` |
| Verification | `MATERIAL_DISCREPANCY` |
| MATERIAL finding | `WRONG_ENTITY_SCOPE` — source “Parent Borrower” vs IR `BORROWER` (alias collapse) |
| UNCERTAIN finding | `MISSING_DEPENDENCY` — empty definitions / `action: OTHER` |
| Soft gate | No paid re-compile / re-verify |
| Offline-clean CERTIFIED packet for §7.6(d) | **Does not exist** |

## Why this is irreducible (this mission)

- Editing findings or writing a CERTIFIED `10-certification.json` would fabricate certification.
- Paid re-verify is soft-gated.
- Entity-lattice alias `PARENT_BORROWER → BORROWER` is an in-repo representation defect that must be resolved *before* a clean re-verify can honestly pass — but resolving it alone does not mint CERTIFIED without a new clean verification artifact.

## Contrast (not a bypass)

§7.2(c) proves the adapter spine (CERTIFIED → DERIVED VEP → `CERTIFIED_4E` enum) and also proves that **spine ≠ eligible execution**: path status `UNSUPPORTED` (`CROSS_RULE_GATE_NOT_EXECUTABLE`). That package must not be presented as Restricted Payments permission.
