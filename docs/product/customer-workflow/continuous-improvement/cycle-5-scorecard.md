# Continuous covenant intelligence — Cycle 5 scorecard

| Field | Value |
|---|---|
| Cycle | 5 |
| Starting SHA | `fc81cb57d1ee078ac34a2e4a34b280db48f17999` (Cycle 4 code tip) |
| Ending SHA | `733ba57eca520aa4b63850d9c989601479b34e1e` |
| Paid inference cost | **$0** |
| Controlling North Star | `docs/headroom-north-star-v2.md` |

## Agreements analyzed

| Package | Provenance | Role |
|---|---|---|
| `pkg-i-secured-debt-lien` | Synthetic; Cycle 4 DERIVED VEP | Stage D capacity/sim (development) |

**New authentic packages:** 0. **New complexity:** companion-REQUIRES discharge for finite MONEY permissions.

## L1/L2/L3/L4 results

| Level | Case | Outcome |
|---|---|---|
| L2 | §7.02(b) REQUIRES §7.01(b) | Companion discharge (finite MONEY) |
| L4 | Dual-path package REQUIRE capacity | **EXECUTED** (debt AVAILABLE) |
| L4 | $15M debt sim §7.01(b) | **SATISFIED** (synthetic labeled) |
| L4 | Secured lien capacity §7.02(b) | **Correct refusal** — ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON |
| L4 | UNLIMITED behind gate (xref) | **Correct refusal** preserved |

| Metric | Count |
|---|---|
| Cases attempted | 4 |
| Correct executions | 1 (debt-side sim) |
| Correct refusals | 2 (lien entity-scope; UNLIMITED gate) |
| Incorrect answers | 0 |
| Critical false permissions | **0** |

## Actual defects found

1. **Missing dependency (fixed):** Package-level `CROSS_RULE_GATE_NOT_EXECUTABLE` blocked all REQUIRE capacity whenever any rule had a companion `REQUIRES`, including finite MONEY lien baskets with in-package target permissions.
2. **Incomplete coverage (not fixed):** §7.02(b) lettered child lacks PARENT_SCOPE/governing entity scope → `ENTITY_SCOPE_UNWITNESSED` → lien capacity not safe to rely.

## Generalizable fixes

| Fix | File |
|---|---|
| `isCompanionRequiresDischargeable` — finite non-UNLIMITED + SOURCE_REFERENCE_RESOLVED REQUIRES only + COMPLETE target permission in-package | `verified-execution.ts` |
| Skip package refusal when every gated rule is companion-dischargeable | same |

## Regression and holdout

| Suite | Result |
|---|---|
| `xref-fixtures` Phase-4 gating (UNLIMITED) | Pass (still REFUSED) |
| `stage-d-pkgi-cross-rule.test.ts` | Pass |
| `stage-d-pkgi-entity-scope.test.ts` | Pass |
| Blind holdout | Not consumed |

## End-to-end execution progress

| Stage | Status |
|---|---|
| D dual-path 4E | Pass (Cycle 4) |
| D REQUIRE capacity (debt) | **Pass** this cycle |
| D debt-side sim | **Pass** this cycle (synthetic) |
| D secured dual-path capacity/sim | **Blocked** — lien entity-scope UNWITNESSED |

Customer-grade paths: **0**.

## Remaining functional blockers

1. PARENT_SCOPE / governing entity-scope for lettered children (pkg-i §7.02(a)/(b)/(c)).
2. Authentic CONMED §7.3(m) PINNED_OFFLINE ≠ CERTIFIED.
3. §9.15 pkg-i REVIEW_REQUIRED.

## PR

| Item | URL |
|---|---|
| This cycle | https://github.com/egsul897/headroom/pull/228 |
| Prior (entity-scope) | https://github.com/egsul897/headroom/pull/222 |

## Recommended next cycle

1. Wire PARENT_SCOPE / governing entity scope into lettered child compiles so §7.02(b) becomes safeToRely — then secured dual-path capacity ∩ sim.
2. Or expand authentic corpus L3/L4 while Stage D lien scope lands.
