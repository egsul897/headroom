# Cycle 5 — Acceptance review

**Proposed merge tip (reconciled):** `e8addba0eda2a90893a5a9bd1defaaeba25684c2`  
**Follow-up tip (EOD family gate + this review):** see latest commit on `cursor/covenant-intelligence-factory-f761`  
**PR:** https://github.com/egsul897/headroom/pull/217  

Status: **provisionally accepted as safety improvement**, not as proof of mature extraction generality.

Holdout and frozen-61 cohorts remain **evaluation artifacts** — not retuned as training targets.

---

## 1. SHA / CI reconciliation

| Check | Result |
|---|---|
| Local `HEAD` | `e8addba0eda2a90893a5a9bd1defaaeba25684c2` (pre-review) |
| GitHub PR #217 `headRefOid` | **identical** `e8addba0…` |
| CI on that exact commit | **7/7 SUCCESS** (certified-path, soft gates, Vercel) |

Any commit after `e8addba0` that lands during this review must re-verify CI before merge approval.

---

## 2. Remaining 1/16 holdout false-executable

| Field | Value |
|---|---|
| Source | `ehb:d6850bb1094c5499596f775e` — “03-05-2019 FIVE YEAR REVOLVING CREDIT AGREEMENT” |
| Section | `6.01(g)` |
| Families | `EVENTS_OF_DEFAULT`, `GENERAL_CONDITIONS_AND_EXCEPTIONS` |
| Extracted interpretation | `FLAT_AMOUNT` @ **$250M** (executableEligible under gates at measurement time) |
| Operative meaning | ERISA / Event-of-Default **liability trigger**, not Permitted Indebtedness capacity |
| Independent parse | `BUILDER_BASKET` @ $250M — **auditor contamination**: nearby LC “Available Amount” (Cash Collateral) in the 2880-char window, not a builder basket |
| Missed restriction | EOD/ERISA threshold ≠ basket; condition language in full operative not in candidate excerpt |
| Classification mechanism | Dollar tokens + Borrower lexical scope + high-confidence FLAT path; family `EVENTS_OF_DEFAULT` was not yet gated |
| Production pathway? | **Yes, contingent:** could enter counsel-compile as FLAT **UNVERIFIED** if counsel ACCEPTed. **Not** auto-written, **not** CERTIFIED, **not** SemanticTruth. Still an unsafe executable *candidate*. |

**Generalizable fix (synthetic regression, not holdout-ID tuning):** block `EVENTS_OF_DEFAULT` / `JUDGMENT` families from `EXECUTABLE_FORMULA_CANDIDATE` (`non_basket_family`). Frozen holdout rates below remain the blind evaluation record.

---

## 3. Why category counts sum to 39 for 32 unique prior-false cases

**Not overlapping multi-labels on the same 32 rows.**

| Set | n |
|---|---:|
| Unique Cycle 4 prior-false cases | **32** |
| Rows in `false-executable-root-causes.json` | **39** |
| Extra rows | **7** |

The remediation script appended a root-cause row when:

`priorFalseExecutable OR productionReachableFalse OR rescore audit.falseExecutableClassification`

The **7 extras** are Cycle 4 **review-ready / non-false** cases that **failed rescore** under Cycle 5 gates (demoted; each has exactly one category). Category histogram sums to 39 because it counts **all rows in the file**, not only the original 32.

### Per-case mapping — original 32 (one category each)

| Prior formula | Section (repr.) | Category | C5 readiness |
|---|---|---|---|
| BUILDER (14) | 6.01, 6.03, 6.05(d/r), 6.06, 6.10, 3.12, 9.08/9.22, … | `builder_misclassify_or_ungated_builder` (8), `builder_over_flat` (4), `builder_over_greater_of` (1), `shared_capacity_ungated` (1) | BLOCKED_MECHANIC_GATE / DISCOVERED / BLOCKED_SHARED |
| LEVERAGE (7) | 5.01(b), 10.09, 2.21, 4.03, … | `leverage_ungated` (3), `missed_conditions` (3), `entity_scope` (1) | BLOCKED_MECHANIC_GATE / NEEDS_* |
| EBITDA grower (6) | 2.20(a/c/f/k), 1.01(i), 7.5(f) | `missed_conditions` (5), `shared_capacity_ungated` (1) | DISCOVERED / BLOCKED_SHARED |
| ASSETS grower (3) | 8.1×2, 5.02 | `missed_conditions`, `threshold_or_formula_mismatch`, `entity_scope` | REVIEW_REQUIRED / NEEDS_* |
| FLAT (2) | 1.09(d), 2.11 | `entity_scope`, `missed_conditions` | DISCOVERED_FORMULA |

All **32/32** `executableEligible=false` after remediation. **0** production-reachable false remaining among them.

### Extra 7 (rescore demotions of prior non-false)

Prior dispositions were `REVIEW_READY_*`; categories: missed_conditions (4), entity_scope (2), missing_from_rescan (1). All non-executable after C5.

---

## 4. Impact of 2,254 → 107 (precision **and** recall)

### Population

| Pool | n |
|---|---:|
| Cycle 3/4 EXECUTABLE (token checks only) | 2,254 |
| Of which BUILDER+LEVERAGE (strict-review) | 157 |
| Of which FLAT+EBITDA+ASSETS (high-conf pool) | 2,097 |
| Cycle 5 `executableEligible` | **107** |
| Formula discoveries retained (non-executable OK) | ~22,225 |

High-conf pool retention: **107 / 2,097 ≈ 5.1%** (strict gates, not abandonment of discovery).

### Frozen-61 gold (independent audit labels) — recall

| Class | Definition | C5 outcome |
|---|---|---|
| Gold positive | C4 `REVIEW_READY_EXECUTABLE` or `REVIEW_READY_WITH_GAPS` | **27** |
| Gold negative | C4 `falseExecutableClassification` | **32** |
| True executables **retained** as executable | gold+ ∩ C5 executableEligible | **0 / 27 (recall 0%)** |
| True executables **blocked** | gold+ demoted | **27 / 27** |
| True negatives (unsafe blocked) | gold− demoted | **32 / 32** |
| Unknown / other in cohort | `REQUIRES_HUMAN_REVIEW` | **2** (also non-executable) |

**Interpretation:** Cycle 5 is a **high-precision safety filter**, not yet a high-recall recognizer of legally complete formulas. The classifier currently **refuses almost all of the prior “review-ready” set** (including many `WITH_GAPS` rows). Holdout precision (below) shows that *among the survivors*, formula/threshold agreement is strong — but that does **not** establish mature generality.

### New-holdout precision (blind; n=16; not used for gate tuning)

| Metric | Value |
|---|---:|
| Formula + threshold both OK | **15 / 16** |
| False executable | **1 / 16** |
| Implied among 107 (point estimate) | ~100 true / ~7 false (unaudited **91**) |

Do not cite holdout precision without the frozen-61 **recall = 0%** for prior gold positives.

---

## 5. Holdout material omissions (8/16)

| Disposition | n | Reach counsel-compile? | Safety |
|---|---:|---|---|
| `FALSE_EXECUTABLE` (EOD case) | 1 | Only if still executableEligible | Unsafe candidate (EOD) — see §2 |
| `REQUIRES_HUMAN_REVIEW` (+ shared-cap) | 1 | No (`sufficient=false`) | Safely blocked from RR compile eligibility |
| `REVIEW_READY_WITH_GAPS` | **6** | **Yes** (`counselCompileEligible` path) | **Gap:** conditions exist in **full operative bytes** but not in summary `excerptEvidence`; activation gate only sees summary operative excerpt / `conditions[]`, so omissions can survive into RR |

**Conclusion:** Most omission rows are **not** hard-blocked. Conditions can be **lost downstream** into review-ready UNVERIFIED records unless counsel or Agent 5 structures `conditions[]` from full operative text. Ownership: **Agent 5** (conditions / shared capacity). Not cured by relaxing gates.

---

## 6. Cohort preservation

| Artifact | Status |
|---|---|
| `fixed-cohort-61.json` | **Frozen** — regression only |
| `new-holdout-audit.json` (n=16) | **Frozen blind holdout** — rates above are the evaluation record |
| Gate changes during this review | Synthetic EOD family regression only; **holdout not re-scored as success proof** |

---

## 7. Agent 2 / 3 coordination (builder & leverage recovery)

**Do not relax eligibility gates.** Recover via source-backed, condition-aware modeling:

| Owner | Work |
|---|---|
| **Agent 2** | Available Amount / Cumulative Credit **definitions**; CNI / equity components; financial inputs for builders & leverage tests |
| **Agent 3** | Distinguish LC “Available Amount” vs builder capacity; builder formula correctness; leverage/ratio formulas with fail-closed maintenance |
| **Agent 5** | Structure `conditions[]` + shared-capacity edges before any mechanic un-gate |
| **Neon / #232** | Durable reviewed-rule lifecycle only after counsel ACCEPT |

See `ownership-handoff.json`. Mechanics stay `BLOCKED_MECHANIC_GATE` until those dependencies land.

---

## 8. Thirteen review-ready candidates — still unverified

| Check | Result |
|---|---|
| Count | 13 (`review-ready-holdout-records.json`) |
| `certificationState` | **REVIEW_READY_UNVERIFIED** ×13 |
| `activationPath` | `counsel-compile-accepted-interpretation` (#225/#227/#232) |
| Neon mutations | **0** |
| `promotedToLegalTruth` | **0** |
| Counsel ACCEPT | **Not performed** |
| Note on records | Eligible for counsel ACCEPT → UNVERIFIED Permission; **NOT auto-certified; NOT written** |

---

## 9. Suites on integration candidate

| Suite | Result |
|---|---|
| Certified-path CI (`tsc` + provider-free) on `e8addba0` | **PASS** (7/7) |
| `tests/evaluation/live-false-permission.test.ts` | **3/3** |
| `tests/extraction/**` | **49/49** |
| `tests/covenant-knowledge-generalization/**` (adversarial / held-out isolation) | **11/11** |
| `tests/product/legal-reasoning.test.ts` | **16/16** |
| Activation eligibility gates | **10/10** (incl. synthetic EOD family) |

---

## 10. Required metrics (acceptance)

| Metric | Value | Notes |
|---|---|---|
| Precision (new holdout, formula) | **15/16 = 93.8%** | Blind holdout |
| Precision (new holdout, threshold) | **16/16 = 100%** | |
| Recall (frozen gold+ as executable) | **0/27 = 0%** | Safety over recall |
| False-executable rate (holdout) | **1/16 = 6.3%** | EOD case; see §2 |
| Material omission rate (holdout) | **8/16 = 50%** | Mostly RR-with-gaps; see §5 |
| False favorable outcomes | **0** (holdout & frozen rescore) | |
| Production-reachable false among prior-32 | **0** | |
| Exact SHA (CI-green proposed) | `e8addba0eda2a90893a5a9bd1defaaeba25684c2` | Reconcile again if HEAD moves |
| CI | **SUCCESS 7/7** on that SHA | |

### Verdict

Cycle 5 **retains the safety improvement** (unsafe executables demoted; discovery preserved). It does **not** yet prove the classifier **learns legally complete formulas** at useful recall — frozen gold+ recall is **0%**. Merge approval should treat this as a **gated safety layer**, with Agent 2/3/5 recovery work required before expanding executable coverage (especially builder/leverage), and Agent 5 work required before trusting RR-with-gaps omissions.
