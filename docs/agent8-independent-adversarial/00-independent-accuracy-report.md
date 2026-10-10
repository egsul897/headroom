# Agent 8 — Independent Accuracy Report

**Mission:** Independently challenge the legal, financial, and transactional correctness of Headroom.  
**Date:** 2026-10-09  
**Production code modified:** No  
**Ground truth:** Phase-2 adversarial arithmetic (`docs/covenant-basket-capacity-formula-library/phase-2/05-adversarial-scenarios.json`), product-acceptance Package F hand-computed expectations, CONMED `human-ground-truth.ts`, authentic CONMED/Chewy SEC extracts. **Not** derived from compiler/runtime dumps.

**Artifact:** `docs/agent8-independent-adversarial/01-results.json`  
**Runner:** `npx tsx scripts/agent8-independent-adversarial/run.ts`  
**Tests:** `npx vitest run tests/agent8-independent-adversarial`

---

## Executive verdict

**Initial finding (pre-remediation):** release-blocking A8-01 — `status: AVAILABLE` with amount `GATE_NOT_SATISFIED`. Material observation A8-02 — shared pool published negative remaining.

**Post-remediation + post-merge (`main` `b99f934b` via PR #229):** **DEFECT-A8-01 / A8-02 CLOSED**. Independent Agent 8 matrix **32/32 pass**, **0** incorrect favorable, **0** incorrect refusal, **0** release-blocking. See `05-remediation-verdict.md` and `07-post-merge-close.md`.

**No incorrect executable permission** on `simulateTransaction` for exercised scenarios. Legitimate favorable paths remain AVAILABLE when independently justified.

Prior IPV critical false-permission rows (IPV-01/02/20/22) remain **CLOSED** in `docs/product-readiness/03-defect-register.json`.

---

## Outcome tracking (required buckets) — post-merge retest on `main`

| Bucket | Count | Notes |
|---|---:|---|
| Correct executable outcomes | 16 | Growers, builders, equity contribution, path separation, CONMED figure spans |
| Correct prohibitions | 5 | Shared overdraw, no auto-reclass, AA sequential depletion, ordering, gated unlimited |
| Correct refusals | 11 | Missing EBITDA, stale/draft inputs, FX, negative usage, duplicate identity, unsupported operand, amendment non-attach |
| Incorrect refusals | 0 | — |
| Incorrect favorable outcomes | 0 | A8-01 remediated — failed gate is `NOT_SATISFIED` |
| Unsupported cases | 0 | — |
| Untested cases | 0 | All 20 challenge categories exercised (≥1 case each) |
| Observations | 0 | A8-02 remediated — over-consumption withholds remaining |

Totals: **32** cases · **32** pass · **0** fail · **0** release-blocking.

---

## Challenge coverage (1–20)

| # | Challenge | Result |
|---|---|---|
| 1 | Incorrect covenant extraction | PASS — CONMED Art VII material baskets in structure spans |
| 2 | Missing defined-term exceptions | PASS — UNSUPPORTED earn-out operand poisons capacity |
| 3 | Wrong amendment precedence | PASS — Doc C (Second Am to Seventh) not RESOLVED to Eighth |
| 4 | Incorrect EBITDA definitions | PASS — Chewy source EBITDA↔Test Period presence (heldout: source-only) |
| 5 | Incorrect financial periods | PASS — greater-of missing EBITDA refuses; stale as-of refuses |
| 6 | Misclassified debt | PASS — ratio vs grower paths not collapsed |
| 7 | Missing lien restrictions | PASS — lien vs debt nodes distinct (product must still require both) |
| 8 | Double-counted basket capacity | PASS — shared overdraw flagged |
| 9 | Incorrect shared-capacity usage | PASS — missing shared in IR documented as certification dependency |
| 10 | Incorrect reclassification | PASS — no silent auto-reclass; no-edge election refused |
| 11 | Unjustified capacity restoration | PASS on negative usage / supersede; **OBS** on shared negative publish |
| 12 | Incorrect dividend consumption | PASS — AA RP+Inv sequential |
| 13 | Incorrect equity contribution treatment | PASS — builder needs contribution fact; 10+5=15 |
| 14 | Missing subsidiary restrictions | PASS (runtime trusts IR scope; cert owns narrowing — IPV-01 closed) |
| 15 | Stale financial inputs | PASS — exact as-of + DRAFT policy |
| 16 | Missing ledger entries | PASS — duplicate usage quarantined |
| 17 | Contradictory document permissions | PASS — duplicate rule identity refused (no max pick) |
| 18 | Incorrect transaction ordering | PASS — intra-tx AA depletion |
| 19 | Stale simulation results | PASS — stateHash diverges after external ledger; EUR no USD invent |
| 20 | Unsupported favorable conclusions | **FAIL RB** — AVAILABLE + GATE_NOT_SATISFIED |

---

## Critical defects

### DEFECT-A8-01 — Gated unlimited capacity reports AVAILABLE (release-blocking)

| Field | Detail |
|---|---|
| Authentic / independent source | Phase-2 `sc-ratio-test-failure` / `sc-conditional-permission`; Chewy-style First Lien Net Leverage gate 3.75x with pro forma 4.1x |
| Expected | `status` ≠ `AVAILABLE` when amount kind is `GATE_NOT_SATISFIED` |
| Actual | `status=AVAILABLE`, `gross.kind=GATE_NOT_SATISFIED`, `effectiveRemaining.kind=GATE_NOT_SATISFIED`; `simulateTransaction` → `NOT_SATISFIED` |
| Minimal reproduction | `npx tsx scripts/agent8-independent-adversarial/probe-gate-status.ts` or case `RT-08b` in the runner |
| Severity | **CRITICAL_FALSE_PERMISSION** (status-layer favorable signal) |
| Generalizable root cause | `statusFromEvaluation` maps `EvaluationResult.status === "EXECUTABLE"` → `AVAILABLE` without consulting capacity amount kind (`GATE_NOT_SATISFIED`) |
| Regression recommendation | Floor status when amount is `GATE_NOT_SATISFIED`; add Agent-8 RT-08b to runtime certification matrix; audit product UI for `status === "AVAILABLE"` without reading amount kind |
| Executable path | Safe today via `simulateTransaction` (`NOT_SATISFIED`) — defect is **presentation / status API**, not silent consumability |

### DEFECT-A8-02 — Shared pool publishes negative remaining (material observation)

| Field | Detail |
|---|---|
| Source | Phase-2 `sc-negative-capacity` (`availableAmountPresented=0`, `doNotReportNegativeAsPermission`); DSGR shared 15% EBITDA mechanic |
| Expected | Pool remaining withheld / non-permission presentation, consistent with member withholding |
| Actual | `sharedConstraints[0].status=REVIEW_REQUIRED` but `remaining=-5000000`; member `effectiveRemaining` withheld as `NOT_DETERMINED` |
| Minimal reproduction | Case `RT-02b` in runner |
| Severity | **MATERIAL_OVERSTATEMENT** (asymmetry; not AVAILABLE) |
| Root cause | Member capacities withhold under `legalUnsafe`; shared-constraint path always publishes raw `computeRemaining` arithmetic |
| Regression | Align shared publishing with member withholding; keep deficit only under overConsumption/provisional |
| Release-blocking | No — status is not AVAILABLE |

---

## Holdout results

| Holdout / blind asset | Treatment this mission |
|---|---|
| Chewy / Gibraltar / RIOT (`eval-heldout`) | **Not** used as dollar-permission GT. Chewy extract used only for Consolidated EBITDA / Test Period **source presence** (`AUTH-03`, `HOLD-01`) |
| CONMED Phase 2F | Used as **regression / authentic** package with `human-ground-truth.ts` (disclosed single-agent isolation). Structure + package-graph precedence tested |
| Condition-suspicion frozen holdout (22 cases) | **Untouched** — environment historically blocked for real-model run; not rescored |
| Golden tests Coherent | **Not used** — export rows are `UNVERIFIED`; circular-risk |
| Basket-formula affirmative corpus | Arithmetic scenarios used; library “AFFIRMATIVE_CAPACITY” statuses **not** treated as executable GT |

---

## What passed that matters (anti-refusal bias)

The suite deliberately includes **favorable** executable outcomes that must succeed:

- Equity contribution builder computes 15mm when fact supplied (`RT-12`)
- Separate general grower remains AVAILABLE when ratio gate fails (`RT-08`)
- Supersede release restores to gross, not above (`RT-19`)
- CONMED material figures are parseable (`AUTH-01-*`)

A system that refused everything would fail these CORRECT_EXECUTABLE cases.

---

## Certification dependency (not a runtime false permission)

`RT-03`: if IR omits `sharedCapacities` for “together with” drafting, runtime correctly shows independent baskets. False permission risk lives in **certification** if `DROP_SHARED_CAPS` certifies. IPV-02 is CLOSED; keep that adversarial gate.

---

## Residual IPV / acceptance context (not re-tested live this turn)

Latest on-disk acceptance summaries still show residual findings under offline mocked-model runs (e.g. `fcff8318be30`: 41 findings, 0 CRITICAL_FALSE_PERMISSION in that summary’s severity rollup). Defect register OPEN set is **IPV-14 only** (nonmaterial fail-closed residuals). This mission’s new runtime finding (A8-01) is **not** yet in that register — recommend filing as IPV-25 or equivalent.

---

## Reproduction commands

```bash
npx tsx scripts/agent8-independent-adversarial/run.ts
npx tsx scripts/agent8-independent-adversarial/probe-gate-status.ts
npx vitest run tests/agent8-independent-adversarial
```

---

## Release recommendation

**Do not treat Phase-4 capacity `status: AVAILABLE` as authoritative permission** until DEFECT-A8-01 is fixed. Prefer amount-kind + simulation path outcomes. Shared negative remaining (A8-02) should be cleaned before any UI surfaces `sharedConstraints.remaining` as headroom.
