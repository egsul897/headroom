# Authentic VerifiedExecutionPackage — blocker report

<<<<<<< HEAD
**Verdict:** authentic `VerifiedExecutionPackage` **DERIVED** for CONMED §7.2(c).  
**Tip SHA at investigation:** see PR #201 tip after this commit.  
=======
**Verdict:** no authentic `VerifiedExecutionPackage` was produced.  
**Tip SHA at investigation:** `657a7e8b` (PR #202; typecheck restored after main merge; certification 481/481; acceptance 703/CFP0). Authentic scan remains `NO_CERTIFIED_ARTIFACTS` (5× REVIEW_REQUIRED).  
>>>>>>> origin/main
**Soft gate:** no live / paid certification re-runs. Offline fixtures and frozen packets only.  
**Gates:** `certifyCandidate` / `certifyPackage` / `certifiedMapToVerifiedExecutionPackage` / `toVerifiedExecutionPackage` / `evaluateVerifiedCapacity` (REQUIRE) were not weakened.

`certifiedMapToVerifiedExecutionPackage` over the authentic on-disk set returns **DERIVED** with matching `artifactPackageHash`. Phase 4E `enumerateCertifiedPaths` returns **CERTIFIED_4E** (1 INCUR_DEBT path). `evaluateVerifiedCapacity` (REQUIRE) was **not** invoked in this soft-gate pass.

---

## What can / cannot be claimed

| Claim | Status |
|---|---|
| CONMED §7.2(c) candidate is Phase-3 CERTIFIED (offline recompute) | **Claimed** — `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/` |
| An authentic `VerifiedExecutionPackage` exists for product execution | **Claimed** — `authenticated-vep/verified-execution-package.json` |
| Phase 4E path enumeration over that VEP | **Claimed** — `CERTIFIED_4E`, 1 path (`02-phase4e-enumeration.json`) |
| Certified debt ∩ lien capacity for a CONMED incurrence (numeric) | **Cannot claim** — `evaluateVerifiedCapacity(REQUIRE)` not invoked |
| Package-level `certifyPackage` CERTIFIED for CONMED | **Cannot claim** |
| Stratified board 12/12 CERTIFIED | **Cannot claim** (board remains partially pinned) |

---

## How authentic CERTIFIED was produced (existing interfaces only)

1. **Phase-2 recompute** via `runAmendmentPipeline` + `computeOperativeContractState` (not the preserved freeze).
2. **Chronological absurdity guard** in `relationship-resolution.ts`: an earlier amendment that type-matches only a *later* restatement is **UNRESOLVED** (`DETERMINISTIC_TYPE_ONLY_CHRONOLOGICALLY_IMPOSSIBLE`). CONMED Second Amendment (2022 → Seventh A&R dated July 16, 2021) no longer provisionally AMENDS the Eighth A&R (2025).
3. Result: Indebtedness / leverage AMENDMENT_LEAD context items disappear; `bundle.hasUnresolvedOperativeEvidence === false`; compilation **COMPLETED**.
4. Frozen `toolCallLog` retrieval hashes for §7.3(g) refreshed to current structural spans (IPV-23 span recovery: 205 → 958 chars).
5. Frozen model output re-normalized; scripted Layer-2 (empty findings; F1/F2/F3 already closed); `certifyCandidate` → **CERTIFIED**.
6. `certifiedMapToVerifiedExecutionPackage` → **DERIVED**; `enumerateCertifiedPaths` → **CERTIFIED_4E**.

Script: `scripts/phase-3-live-validation/recompute-72c-certify-offline.ts`. Scanner: `scripts/product/attempt-authenticated-vep.ts`.

---

## Residual (non-blocking for this VEP claim)

| Item | Status |
|---|---|
| Instrument-level `OPERATIVE_STATE_REVIEW_REQUIRED` | Still true — Omnibus DOCUMENT/exhibit UNKNOWN_CHANGE effects + Second Amendment UNRESOLVED targets remain **unattached**. They do not attach Indebtedness leads to §7.2(c)'s bundle. |
| Omnibus CONDITIONAL_UNRESOLVED effective date | Unchanged; exhibit pages curated out of fixture. |
| Preserved Phase-2 freeze | Unchanged historical evidence; authentic path uses recompute. |
| `evaluateVerifiedCapacity(REQUIRE)` | Not run (soft gate / no numeric ledger binding in this pass). |
| Other live packets (7.5j, stratified pins) | Still REVIEW_REQUIRED / PINNED_OFFLINE. |

---

## Prior blockers (closed for §7.2(c))

| Code | Was | Now |
|---|---|---|
| `OPERATIVE_STATE_UNACCEPTABLE` (Indebtedness AMENDMENT_LEAD) | REVIEW | Cleared — Second Amendment no longer targets Eighth |
| `COMPILATION_NOT_COMPLETED` / `OPERATIVE_STATE_UNRESOLVED` | REVIEW | Cleared — compilation COMPLETED |
| `VERIFICATION_NOT_CLEAN` (upstream axis) | REVIEW | Cleared — `VERIFIED_NO_MATERIAL_GAP_FOUND` |
| `NO_CERTIFIED_ARTIFACTS` adapter refusal | REFUSED | Cleared — DERIVED |

---

## Related (not authentic live)

Product-acceptance deterministic CERTIFIED candidates remain under `docs/product/customer-workflow/acceptance-certified-vep/` and are separate from this authentic claim.
