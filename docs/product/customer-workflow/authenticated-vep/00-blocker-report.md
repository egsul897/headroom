# Authentic VerifiedExecutionPackage — blocker report

**Verdict:** authentic `VerifiedExecutionPackage` **DERIVED** for CONMED §7.2(c).  
**Tip SHA at investigation:** PR #201 tip after merge of main (#202) + capacity probe.  
**Soft gate:** no live / paid certification re-runs. Offline fixtures and frozen packets only.  
**Gates:** `certifyCandidate` / `certifyPackage` / `certifiedMapToVerifiedExecutionPackage` / `toVerifiedExecutionPackage` / `evaluateVerifiedCapacity` (REQUIRE) were not weakened.

`certifiedMapToVerifiedExecutionPackage` → **DERIVED**. Phase 4E `enumerateCertifiedPaths` → **CERTIFIED_4E** (paths status **UNSUPPORTED** for cross-rule gates). `evaluateVerifiedCapacity` (REQUIRE) → **REFUSED** `CROSS_RULE_GATE_NOT_EXECUTABLE` (fail-closed; no invented evaluator).

---

## Precise Indebtedness / OPERATIVE_STATE blocker

### What was wrong (pre-fix)

Second Amendment (execution ~2022) type-matched the only CREDIT_AGREEMENT in the package — the Eighth A&R (2025) — and attached as AMENDS. That produced **Indebtedness** AMENDMENT_LEAD context items with `OPERATIVE_STATE_UNRESOLVED` on §7.2(c)'s bundle → `OPERATIVE_STATE_UNACCEPTABLE` / `COMPILATION_NOT_COMPLETED`.

### Missing contractual authority (honest)

The Second Amendment amends the **Seventh** A&R dated July 16, 2021. That generation is **not in the CONMED fixture package**. There is no on-disk Seventh text to attach to. Inventing a target or forcing the Eighth would be a false permission.

### Resolution (existing pipeline only)

Chronological absurdity guard in `relationship-resolution.ts` (`DETERMINISTIC_TYPE_ONLY_CHRONOLOGICALLY_IMPOSSIBLE`): an earlier amendment cannot type-only-match a later restatement. Second Amendment Indebtedness mods stay **UNRESOLVED** (`target: null`), **unattached** to the Eighth.

Offline Phase-2 recompute (`runAmendmentPipeline` + `computeOperativeContractState`):

| Observation | Value |
|---|---|
| Second Amd Indebtedness mods | `[{ status: "UNRESOLVED", target: null }]` |
| REVIEW_REQUIRED **provisions** (reconstructed) | **0** |
| Unattached effects (instrument) | **5** (Omnibus DOCUMENT/exhibit + Second Amd unresolved) |
| §7.2(c) `bundle.hasUnresolvedOperativeEvidence` | **false** |
| Compilation | **COMPLETED** |
| Verification | **VERIFIED_NO_MATERIAL_GAP_FOUND** |
| `certifyCandidate` | **CERTIFIED** |

Instrument-level `OPERATIVE_STATE_REVIEW_REQUIRED` remains true because of those **unattached** effects — they do **not** attach Indebtedness leads to §7.2(c)'s context bundle. Preserved Phase-2 freeze is unchanged historical evidence; authentic path uses recompute.

---

## What can / cannot be claimed

| Claim | Status |
|---|---|
| CONMED §7.2(c) candidate is Phase-3 CERTIFIED (offline recompute) | **Claimed** — `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/` |
| An authentic `VerifiedExecutionPackage` exists for product execution | **Claimed** — `authenticated-vep/verified-execution-package.json` |
| Phase 4E path enumeration over that VEP | **Claimed** — `CERTIFIED_4E`, 1 path each for UNSECURED_DEBT / SECURED_DEBT (`02-phase4e-enumeration.json`); path status **UNSUPPORTED** (cross-rule gate) |
| `evaluateVerifiedCapacity(REQUIRE)` EXECUTED | **Cannot claim** — **REFUSED** `CROSS_RULE_GATE_NOT_EXECUTABLE` (`03-evaluate-verified-capacity.json`). §7.2(c) REQUIRES / OTHER_RULE_SATISFIED → §7.1 and §7.3(g); runtime has no certified cross-rule satisfaction evaluator (fail-closed by design). No paid recertify of companions; no new architecture. |
| Numeric debt ∩ lien capacity for a CONMED incurrence | **Cannot claim** — capacity refused above; also no APPROVED 4B snapshots invented |
| Package-level `certifyPackage` CERTIFIED for CONMED | **Cannot claim** — discovery population PARTIAL_TARGET_SET / unsealed; instrument unattached effects remain |
| Stratified board 12/12 CERTIFIED | **Cannot claim** |

---

## How authentic CERTIFIED was produced (existing interfaces only)

1. **Phase-2 recompute** via `runAmendmentPipeline` + `computeOperativeContractState` (not the preserved freeze).
2. **Chronological absurdity guard** — Second Amendment no longer provisionally AMENDS the Eighth.
3. Indebtedness AMENDMENT_LEAD cleared from §7.2(c) bundle; compilation **COMPLETED**.
4. Frozen `toolCallLog` retrieval hashes for §7.3(g) refreshed to current structural spans.
5. Frozen model output re-normalized; scripted Layer-2; `certifyCandidate` → **CERTIFIED**.
6. `certifiedMapToVerifiedExecutionPackage` → **DERIVED**; `enumerateCertifiedPaths` → **CERTIFIED_4E**; `evaluateVerifiedCapacity` → **REFUSED** (cross-rule gate).

Scripts: `scripts/phase-3-live-validation/recompute-72c-certify-offline.ts`, `scripts/product/attempt-authenticated-vep.ts`.

---

## Residual (honest fail-closed)

| Item | Status |
|---|---|
| Second Amendment → Seventh A&R (absent) | UNRESOLVED / unattached — correct; do not invent Seventh text |
| Omnibus DOCUMENT/exhibit CONDITIONAL_UNRESOLVED | Unattached; exhibit pages curated out of fixture |
| Cross-rule §7.1 / §7.3(g) gate | Blocks REQUIRE capacity until certified companions + certified cross-rule evaluator exist |
| Package CERTIFIED | Blocked by PARTIAL_TARGET_SET / unsealed population |
| Other live packets (7.5j, stratified pins) | Still REVIEW_REQUIRED / PINNED_OFFLINE |

---

## Related (not authentic live)

Product-acceptance deterministic CERTIFIED candidates remain under `docs/product/customer-workflow/acceptance-certified-vep/` and are separate from this authentic claim.
