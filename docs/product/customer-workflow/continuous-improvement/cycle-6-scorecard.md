# Continuous covenant intelligence — Cycle 6 scorecard

| Field | Value |
|---|---|
| Cycle | 6 |
| Starting SHA | `c517820bd36d302b5124c156ad1dd9d6af2c3a8e` (#228 tip) |
| Ending SHA | _(integration-gate tip — see PR #233 head)_ |
| Paid inference cost | **$0** |
| Controlling North Star | `docs/headroom-north-star-v2.md` |

## Dependencies reconciled

| PR | Tip SHA | Role |
|---|---|---|
| #222 | `271d4ef17d826200ad103daef4d602d78f2cf7b5` | Entity-scope COUNTERPARTY (debt CERTIFY) |
| #228 | `c517820bd36d302b5124c156ad1dd9d6af2c3a8e` | Companion-REQUIRES discharge (base of this branch) |
| #229 | `d56386470bc463d7fc8504166209179ceb6c9008` | Capacity gate-status — **not edited** (`state.ts`/`types.ts`) |

#222 and #228 diverged after `6e33dc13` (parallel COUNTERPARTY pins); this cycle stacks on #228.

## Agreements analyzed

| Package | Provenance | Role |
|---|---|---|
| `pkg-i-secured-debt-lien` | Synthetic Stage D acceptance | Dual-path secured execution |
| CONMED authenticated VEP | PINNED_OFFLINE | Reported separately — **not CERTIFIED** |

**New authentic packages:** 0. **New complexity:** source-witnessed parent-scope inheritance for lettered children; runtime `SOURCE_SCOPE_DERIVED` → confirmed applicability.

## L1/L2/L3/L4 results

| Level | Case | Outcome |
|---|---|---|
| L2 | §7.02(b) parent chapeau inheritance | SOURCE_SCOPE_DERIVED `BORROWER+ANY_SUBSIDIARY` |
| L4 | Debt pathway §7.01(b) | **AVAILABLE** $50M |
| L4 | Lien pathway §7.02(b) | **AVAILABLE** $20M |
| L4 | Combined secured dual-path sim $15M | **SATISFIED** |
| L4 | Debt-only path | SATISFIED — **not** a secured answer |
| L4 | Companion absent / prohibited / UNLIMITED gate | **Correct refusal** |
| L4 | Entity-scope unwitnessed lien | **REVIEW_REQUIRED** (debt alone ≠ secured) |

| Metric | Count |
|---|---|
| Cases attempted | 8+ adversarial |
| Correct executions | 1 (dual-path secured sim) |
| Correct refusals | Several (companion/entity adversarial) |
| Incorrect / false favorable | **0** |
| Critical false permissions | **0** |

## Actual defects found

1. **Root cause (fixed):** §7.02(b) compiled under section-level candidate → empty governing PARENT_SCOPE → `ENTITY_SCOPE_UNWITNESSED` despite §7.02 chapeau "Borrower shall not…permit any Subsidiary".
2. **Runtime gap (fixed):** Capacity graph / rule-evaluator mapped only `SOURCE_MATCH_CONFIRMED` to `SCOPE_CONFIRMED_BY_SOURCE`, leaving `SOURCE_SCOPE_DERIVED` (safeToRely true) as `SCOPE_NOT_SAFE_TO_RELY_ON` → false REVIEW_REQUIRED.

## Generalizable fixes

| Fix | File |
|---|---|
| `resolveGoverningScopeForCitedUnit` — re-resolve from lettered child's structural node | `governing-scope.ts` |
| `parentSectionLeadIn` + parent-derived source scope (v6) | `entity-scope-guard.ts` |
| Per-rule governing scope in normalize | `normalize.ts` |
| `SOURCE_SCOPE_DERIVED` → `SCOPE_CONFIRMED_BY_SOURCE` | `graph.ts`, `rule-evaluator.ts` |

## Regression and holdout

| Suite | Result |
|---|---|
| entity-scope-guard + governing-scope-fidelity + live-7-2c | Pass |
| stage-d-pkgi-{entity-scope,cross-rule,secured-dual-path} | Pass |
| capacity runtime + verified-execution + synthetic-matrix | Pass (252+) |
| Blind holdout | Not consumed |

## End-to-end execution progress

| Stage | Status |
|---|---|
| D dual-path 4E | Pass |
| D REQUIRE capacity (debt ∩ lien) | **Pass** this cycle |
| D secured dual-path sim | **Pass** this cycle (synthetic) |
| Authentic secured dual-path | **Not claimed** (PINNED_OFFLINE ≠ CERTIFIED) |

Customer-grade paths: **0** (synthetic evidence only).

## Remaining functional blockers

1. Authentic CONMED secured dual-path with independently CERTIFIED companions.
2. §9.15 pkg-i shared secured cap not in VEP sharedCapacities.
3. PR #229 capacity NOT_SATISFIED status — coordinate on merge; do not bypass gates.

## PR

| Item | URL |
|---|---|
| This cycle | https://github.com/egsul897/headroom/pull/233 |
| Prior (companion) | https://github.com/egsul897/headroom/pull/228 |
| Prior (entity-scope) | https://github.com/egsul897/headroom/pull/222 |

## Recommended next cycle

1. Wire §9.15 shared secured capacity into pkg-i dual-path anti-stacking.
2. Authentic package with pinned operative secured-debt source — keep PINNED_OFFLINE separate from CERTIFIED.
