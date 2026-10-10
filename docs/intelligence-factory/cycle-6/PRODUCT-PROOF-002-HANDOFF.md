# Product Proof 002 — Handoff from Cycle 6 (Agent 1)

**From:** Covenant Intelligence Factory / Agent 1 Cycle 6  
**To:** Product Proof 002 owner  
**Accepted research tip:** `6808fad1622df59089a30933bf16d3fa3c13f115`  
**Verdict handed off:** `CYCLE6_RESEARCH_IMPROVEMENT_ACCEPTED` only  
**Not handed as:** unseen reliability · CERTIFIED · production compilation authority

---

## 1. What you can reuse

Source-backed **formula discovery and eligibility** for high-confidence mechanics only:

| Mechanic | Status after Cycle 6 |
|---|---|
| `FLAT_AMOUNT` | Formula-executable path with operative-dollar evidence |
| `GREATER_OF_FLAT_OR_PCT_EBITDA` | Formula-executable when `"greater of"` is in operative excerpt |
| `GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS` | Same grower-in-operative rule |
| `BUILDER_BASKET` / `LEVERAGE_RATIO_ROOM` / `RATIO_GATE` | **Still blocked** (`BLOCKED_MECHANIC_GATE`) — Agents 2/3 |

Promotion ladder (KF never jumps to production):

```
DISCOVERED
  → EXECUTABLE_FORMULA_ONLY      (numeric formula; not a legal rule)
  → COUNSEL_COMPILE_ELIGIBLE     (counselCompileEligible === true only)
  → REVIEW_READY_UNVERIFIED      (audit-backed)
  → Permission UNVERIFIED        (human ACCEPT/EDIT → compileAcceptedInterpretation)
  → PRODUCTION_AUTHORITATIVE     (NOT set by KF)
```

---

## 2. Exact files

### Core libraries

| File | Role |
|---|---|
| `lib/knowledge-factory/activation/provision-candidates.ts` | Eligibility gates; `activateSummaryItem()`; readiness / `executableEligible` / `counselCompileEligible` / `promotionState` |
| `lib/knowledge-factory/activation/completeness.ts` | `assessOperativeCompleteness`, `isNonPermissionThreshold`, `promotionStateFrom`, `PromotionState` |
| `lib/knowledge-factory/activation/review-ready-record.ts` | `buildReviewReadyRecord`, **`mayEnterCounselCompilePath`** (boolean gate for consumers) |
| `lib/knowledge-factory/activation/independent-audit.ts` | Operative-byte audit; false-executable classification; Wilson intervals |
| `lib/product/customer-intelligence/compile-accepted.ts` | `parseCounselFormulaForTest`, `compileAcceptedInterpretation` (human ACCEPT path only) |

### Scripts (read-only / measure — no Neon Permission writes)

| File | Role |
|---|---|
| `scripts/knowledge-factory/cycle-6-recall-measure.ts` | Frozen + holdout recall measure (`npm run kf:cycle-6-recall`) |
| `scripts/knowledge-factory/cycle-6-acceptance-sealed-holdout.ts` | Sealed `0xc6a1` protocol (`npm run kf:cycle-6-acceptance-sealed`) |
| `scripts/knowledge-factory/activate-neon-provisions.ts` | Read-only scan; demos require `counselCompileEligible === true` |
| `scripts/knowledge-factory/audit-formula-candidates.ts` | Audit-backed review-ready samples |

### Docs / evidence (do not retune against)

| File | Role |
|---|---|
| `docs/intelligence-factory/cycle-6/FINAL-ACCEPTANCE.md` | Freeze + verdict |
| `docs/intelligence-factory/cycle-6/ACCEPTANCE-REVIEW.md` | Independent acceptance write-up |
| `docs/intelligence-factory/cycle-6/CYCLE-6-REPORT.md` | Research report |
| `docs/intelligence-factory/cycle-6/recall-report.json` | Frozen TP/FN/TN/FP + population |
| `docs/intelligence-factory/cycle-6/false-executable-taxonomy.json` | Six false-exec root causes (exposed; taxonomy only) |
| `docs/intelligence-factory/cycle-6/promotion-trace.md` | Downstream consumer rules |
| `docs/intelligence-factory/cycle-6/new-blind-holdout.json` | Salt `0xc6c6` — **EXPOSED_EVALUATION_ARTIFACT** |
| `docs/intelligence-factory/cycle-6/acceptance-sealed-holdout.json` | Salt `0xc6a1` — **`BLOCKED_BY_NEON_CONNECTIVITY`** (preserve) |
| `docs/intelligence-factory/cycle-6/historical-cohorts.json` | Exposed cohort registry |
| `docs/intelligence-factory/cycle-6/ownership-handoff.json` | Agents 2/3/5 ownership |
| `docs/intelligence-factory/cycle-5/*` | Prior safety remediation (32/32) — historical |

---

## 3. Interfaces Product Proof 002 must call

```ts
import { activateSummaryItem } from "lib/knowledge-factory/activation/provision-candidates";
import {
  buildReviewReadyRecord,
  mayEnterCounselCompilePath,
} from "lib/knowledge-factory/activation/review-ready-record";
import { auditCandidateAgainstOperative } from "lib/knowledge-factory/activation/independent-audit";
```

### Hard consumer rules

1. **Never** gate compile/demo/production entry on `promotionState === "COUNSEL_COMPILE_ELIGIBLE"` alone.
2. **Always** require `counselCompileEligible === true` (prefer `mayEnterCounselCompilePath(rec)`).
3. `executableEligible` / `EXECUTABLE_FORMULA_ONLY` ≠ legally complete permission.
4. Do not write Neon `Permission` / CERTIFIED rows from KF activation.
5. Production path remains: human counsel ACCEPT/EDIT → `compileAcceptedInterpretation` → durable lifecycle elsewhere.

### Key fields on `ActivatedProvisionCandidate`

| Field | Meaning |
|---|---|
| `readiness` | `EXECUTABLE_FORMULA_CANDIDATE` \| `DISCOVERED_FORMULA` \| `BLOCKED_*` \| `REVIEW_REQUIRED` \| … |
| `executableEligible` | Numeric formula path only |
| `counselCompileEligible` | **Authoritative** compile-queue boolean |
| `promotionState` | Label; must agree with boolean before use |
| `completeness` | Abbreviation / chapeau / conditions / non-permission reasons |
| `certificationStatus` | Always `"NOT_CERTIFIED"` from KF |

---

## 4. Tests to keep green

| Suite | Path |
|---|---|
| Eligibility + structural / formula-shape gates | `tests/knowledge-factory/activation-eligibility-gates.test.ts` |
| Completeness + non-permission + `mayEnterCounselCompilePath` | `tests/knowledge-factory/completeness-and-non-permission.test.ts` |
| Independent audit | `tests/knowledge-factory/independent-audit.test.ts` |
| Broader KF suite | `npx vitest run tests/knowledge-factory/` (116 tests at acceptance tip) |

Synthetic tests prove **generalized** structural/formula-shape rules. They **do not** replace sealed holdout `0xc6a1` independent evidence.

---

## 5. Limitations (must not be papered over)

1. **Sealed holdout `0xc6a1`** remains `BLOCKED_BY_NEON_CONNECTIVITY` — unseen formula reliability is **not** validated.
2. Frozen-61 recall is modest (**5/27**, P=1.00 on gold−) — research improvement, not product reliability proof.
3. Cycle 6 blind holdout (`0xc6c6`) showed formula precision 8/14 and false-exec 6/14 before generalized demotions; cohort is now **exposed** — do not retune on it.
4. Builder / leverage still behind mechanic gates until Agents 2/3 + definitions.
5. High material-omission rate is intentional fail-closed completeness, not a waived defect.
6. Non-permission thresholds (EOD, judgment, indemnity, prepay, reporting) must stay blocked.
7. Article-level / structural non-capacity headings (successors, future guarantors, set-off) stay non-executable.

---

## 6. When (and only when) to reopen Agent 1 research

Open a new intelligence-factory research cycle **only if** Product Proof 002 documents a **specific** extraction or discovery defect that prevents authentic compilation on the counsel-compile path.

Otherwise: consume the interfaces above; do not start Cycle 7.

---

## 7. Stop line

Agent 1 Cycle 6 workstream is **closed** at SHA `6808fad1622df59089a30933bf16d3fa3c13f115`.  
Handoff location: **this file**.
