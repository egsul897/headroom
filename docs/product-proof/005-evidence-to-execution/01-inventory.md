# Evidence inventory — CONMED §7.6(d)

## In repository

| Piece | Location | Notes |
|---|---|---|
| Operative text | Population evidence + curated Article VII fixture | “Parent Borrower may make Restricted Payments… $40,000,000” |
| Compiled IR leaf | Same evidence JSON | `DURING_PERIOD` $40M; `conditions: []`; `action: OTHER` |
| VerifiedUnitArtifact package | `…/verified-units/discovery-candidate:9e35243e….json` | `complete: true` but `verificationStatus: MATERIAL_DISCREPANCY` |
| Context / supersession notes | Population evidence | Leaf marked CURRENT_OPERATIVE; accountability incomplete |
| Contrast CERTIFIED §7.2(c) | `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/` | Adapter DERIVES VEP; path UNSUPPORTED |
| Execution spine modules | `certifyCandidate`, `certifiedMapToVerifiedExecutionPackage`, `enumerateCertifiedPaths`, `evaluateVerifiedCapacity`, `attemptVerifiedSimulate` | Reuse only |

## Absent / external / paid

| Piece | Class | Why required |
|---|---|---|
| Clean semantic verification | Soft-gated paid or new offline-clean packet | `certifyCandidate` needs `VERIFIED_NO_MATERIAL_GAP_FOUND` (or non-material-only) |
| CERTIFIED `10-certification.json` for §7.6(d) | Absent | Blocks VEP inclusion |
| Lattice fidelity for Parent Borrower | In-repo representation gap | Current alias PARENT_BORROWER→BORROWER expands vs §7.6(g) contrast |
| Definition binding RP / Parent Borrower | In-repo IR gap | UNCERTAIN `MISSING_DEPENDENCY` |
| NS-4 APPROVED + util completeness | External/human | Only for verified remaining — not for proving CANDIDATE path on fixed-dollar period basket |

## Not selected

- **§7.2(c):** furthest Phase-3; blocked before *eligible* path by cross-rule evaluator absence.
- **Matthews (1)(a):** best GROSS finance substrate; no Phase-3 CERTIFIED package on main.
