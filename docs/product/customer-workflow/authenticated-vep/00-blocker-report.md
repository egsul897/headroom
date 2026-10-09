# Authentic VerifiedExecutionPackage — Phase 3→4 completion

**Verdict:** authentic `VerifiedExecutionPackage` **DERIVED** for CONMED §7.2(c).
**Soft gate:** no live / paid certification re-runs. Offline fixtures and frozen packets only.
**Gates:** `certifyCandidate` / `certifyPackage` / `certifiedMapToVerifiedExecutionPackage` / `evaluateVerifiedCapacity` (REQUIRE) / `simulateVerifiedTransaction` were not weakened.

`certifiedMapToVerifiedExecutionPackage` → **DERIVED**. Phase 4E → **CERTIFIED_4E** (1 UNSECURED_DEBT path(s); status UNSUPPORTED for cross-rule gates). `evaluateVerifiedCapacity(REQUIRE)` **invoked** with null financial/ledger resolvers (outcome `REFUSED`).

---

## Precise Indebtedness / OPERATIVE_STATE blocker

### What was wrong (pre-fix)

Second Amendment (~2022) type-matched the only CREDIT_AGREEMENT in the package — the Eighth A&R (2025) — and attached as AMENDS. That produced **Indebtedness** AMENDMENT_LEAD context items with `OPERATIVE_STATE_UNRESOLVED` on §7.2(c)'s bundle → `OPERATIVE_STATE_UNACCEPTABLE` / `COMPILATION_NOT_COMPLETED`.

### Missing contractual authority (honest)

The Second Amendment amends the **Seventh** A&R dated July 16, 2021. That generation is **not in the CONMED fixture package**. There is no on-disk Seventh text to attach to. Inventing a target or forcing the Eighth would be a false permission.

### Resolution (existing pipeline only)

Chronological absurdity guard in `relationship-resolution.ts` (`DETERMINISTIC_TYPE_ONLY_CHRONOLOGICALLY_IMPOSSIBLE`): an earlier amendment cannot type-only-match a later restatement. Second Amendment Indebtedness mods stay **UNRESOLVED** (`target: null`), **unattached** to the Eighth. Offline Phase-2 recompute → §7.2(c) bundle clean; compilation **COMPLETED**; `certifyCandidate` → **CERTIFIED**. Instrument-level `OPERATIVE_STATE_REVIEW_REQUIRED` remains for unattached Omnibus/Second-Amendment effects — they do **not** attach Indebtedness leads to §7.2(c).

---

## What can / cannot be claimed

| Claim | Status |
|---|---|
| CONMED §7.2(c) candidate is Phase-3 CERTIFIED (offline recompute) | **Claimed** — `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/` |
| An authentic `VerifiedExecutionPackage` exists for product execution | **Claimed** — `authenticated-vep/verified-execution-package.json` |
| Phase 4E path enumeration over that VEP | **Claimed** — `CERTIFIED_4E`, 1 path(s); path status UNSUPPORTED |
| `evaluateVerifiedCapacity(REQUIRE)` invoked | **Claimed** — outcome `REFUSED` `CROSS_RULE_GATE_NOT_EXECUTABLE`; numeric headroom **not** claimed |
| Package-level `certifyPackage` CERTIFIED for CONMED | **Cannot claim** — status `PARTIAL` (DISCOVERY_POPULATION_UNSEALED, PARTIAL_TARGET_SET, REVIEW_UNRESOLVED_ITEM) |
| Stratified board 12/12 CERTIFIED | **Cannot claim** (board remains partially pinned / soft-gated) |

---

## Capacity REQUIRE — missing inputs

- `CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed`

Required for numeric EXECUTE (not supplied; not invented; no new architecture):
- Certified cross-rule satisfaction evaluator (PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE)
- Independently CERTIFIED companion units for §7.1 and §7.3(g)
- Approved financial snapshots + attributed ledger (when companions execute)

---

## Omnibus DOCUMENT / exhibit CONDITIONAL

Omnibus markup-exhibit / schedule DOCUMENT effects remain `CONDITIONAL_UNRESOLVED` (First Amendment Effective Date conditions precedent; exhibit blackline not in fixture). They now surface as **unattached** whole-document activity under the product instrument key (`computeOperativeContractState` includes DOCUMENT effects targeting `baseDocumentId` even when package-graph instrument keys differ). They do **not** attach Indebtedness leads to §7.2(c)'s bundle — isolation preserved.

---

## Stratified board

Matrix status: `OFFLINE_PIN_MATRIX_PARTIAL`. Live CERTIFIED: **0**. Pin status counts: {"PINNED_OFFLINE":9,"HAND_AUTHORED_GOLDEN":1,"BASELINE_PINNED":1}.
