# Phase C.1 — Multi-Basket Verification Fix + Revalidation

**Starting HEAD:** `1f737f7`
**Final HEAD:** `26baaf602b177b251b5a595bd1defbb1d7977387`
**Verdict: `MULTI_BASKET_REGRESSION_GATE_FAILED`**

## 1. Task

Fix the diagnosed Phase C failure mode: the adversarial verification layer
did not reliably detect when a section contains multiple distinct baskets
but extraction loses, merges, misassigns, or homogenizes their respective
thresholds and/or formulas. Gate: aggregate dangerous-unflagged error rate
≤5% across the FWRG and LSB regression fixtures.

## 2. Baseline

- HEAD at task start: `1f737f7`, clean working tree.
- Existing full suite (`npx vitest run`) passing before any change.
- `RULE_EXTRACTION`/verification/validation/promotion/dangerous-unflagged
  scoring located in `lib/contract-model/compiler/stage-verification.ts`,
  `lib/contract-model/compiler/orchestrator.ts`,
  `lib/contract-model/compiler/stage-validation.ts`,
  `lib/contract-model/compiler/stage-promotion.ts`, and
  `lib/contract-model/analyzer/evaluator.ts`.
- The 8 previously-diagnosed dangerous-unflagged cases were located in the
  Phase C report's per-package results (2 FWRG, 6 LSB).

## 3. Root-cause finding (before writing any fix)

Pulling the FULL raw persisted rule set (not just the evaluator's single
"best match" per provision) showed that 6 of the 8 originally-diagnosed
cases were **evaluator/grading artifacts, not real extraction losses**: the
correct per-basket thresholds were already present as separate, correctly
extracted sub-clause rules, but the evaluator's section matching either (a)
compared ground truth only against a coarse general-prohibition rule that
never carried a threshold, or (b) once a match was found, ran the *rest* of
its checks (family/formula) against the wrong rule even after the number
itself was resolved. Only 2 of the 8 cases (FWRG 6.10(a)/(b)) reflect a
genuine standalone single-basket ratio-test with no distinguishing formula
tag — a defensible ground-truth-authoring question, not a multi-basket
extraction loss.

This finding changed the scope of the fix from "build new LLM-prompt-based
adversarial machinery" to a narrower, evidence-justified combination: a
generalized deterministic section-completeness check (to catch *real*
future multi-basket losses) plus a scoring-bug fix in the evaluator's own
matching (to stop misattributing correctly-extracted data as unflagged
danger).

## 4. Changes made

### 4.1 Deterministic multi-basket completeness check (new capability, task §4)

`lib/contract-model/compiler/basket-completeness.ts` — parses a section into
lettered sub-clauses (`splitByLetteredClauses`), extracts real numeric /
percentage / ratio expressions per clause, and checks that each expression
appears in the extracted rule(s) for that clause. Flags a section when: a
real figure from the source text has no corresponding extracted rule
(`unmatchedNumbers`), or the identical threshold is reused verbatim across
two or more distinct baskets that a naive extraction could have conflated
(`duplicatedThresholds`). No document, company, or provision-specific logic
of any kind — operates purely on section text + rule structure.

Integrated into `stage-verification.ts` as a **final deterministic pass**
after the existing two-layer (model + adversarial) verification: any
flagged section downgrades all `EXECUTABLE` rules under it to
`JUDGMENT_REQUIRED` with a `MULTI_BASKET_COMPLETENESS_FAILED` note, and the
stage status becomes `REVIEW_REQUIRED`.

Division of labor: the **model-based** two-layer pass still owns semantic
judgments (is this rule internally consistent with its own cited text, does
its formula make sense). The **deterministic** pass owns a narrower,
mechanically-checkable question the model-based layer cannot reliably
answer on its own: does every distinct numeric expression in a section have
a home among the extracted rules for that section. Deterministic logic is
strictly a superset check on top of the existing verification, never a
replacement for it.

### 4.2 Evaluator matching fix (scoring-bug fix, task §3/§7 allowance)

`lib/contract-model/analyzer/evaluator.ts`:
- `findHierarchyChildren`: when the evaluator's primary match for a ground
  truth entry is an **exact** hit on the ground truth's own target
  reference, and that exact match itself carries no threshold, search its
  genuine lettered-clause children (not siblings, not the whole document)
  for the real figure. Restricted to exact-match starting points only —
  never from a loose prefix-fallback match — because two distinct lettered
  sub-clauses are never a prefix of one another, but a coarse fallback can
  spuriously share a prefix with unrelated baskets (this restriction was
  added after an early draft produced exactly that false positive against
  `analyzer-unseen-package.test.ts`).
- `comparisonRule` unification: once a resolving child is found, **all**
  remaining checks for that ground-truth entry (family, formula, real
  figure, conditions) and the final flag/unflag/matchedRule determination
  run against that same child — not a mix of parent-for-some-fields,
  child-for-others. This removed a residual, redundant "formula mismatch"
  that persisted for LSB 6.11/6.13/6.14 even after the number-matching gap
  was fixed.

This is a generalized matching-precision fix with no FWRG/LSB/company/
provision-specific logic — it operates only on section-reference structure
common to any lettered-clause legal document.

### 4.3 Cache-key correctness fix (task §11)

`stage-verification.ts` exports `MULTI_BASKET_CHECK_VERSION =
"multi-basket-completeness.v1"`. `orchestrator.ts`'s `verificationInputHash`
now incorporates this version string alongside provider identity and
extracted-rules content, so a future change to the completeness-check logic
correctly invalidates any previously-resumed VERIFICATION stage result
instead of silently reusing stale output. This generalizes rather than
special-cases the gap: any future logic version bump requires only
incrementing this string.

## 5. Tests added (16 new tests across 3 new files, task §5/§10)

- `tests/contract-model/basket-completeness.test.ts` — the 10 required
  synthetic scenarios (two different-dollar baskets; dollar+EBITDA%;
  fixed+grower; greater-of; omitted basket; swapped thresholds; duplicated
  threshold across two baskets; similar-wording-distinct-conditions;
  correctly-extracted multi-basket; single-basket no-false-positive). All
  10 passed on first implementation of the completeness checker.
- `tests/contract-model/evaluator-hierarchy-children.test.ts` — 4 tests:
  exact-match child correctly credited; false-positive guard (inexact
  match + unrelated same-number sibling NOT credited); still-unflagged
  when no child resolves the figure; FLAGGED (not unflagged) when the
  resolving child itself has a genuine remaining formula mismatch.
- `tests/contract-model/promotion-invariant-multi-basket.test.ts` — 2
  tests proving the hard promotion invariant (task §10): a swapped-
  threshold multi-basket section is downgraded and cannot reach
  `EXECUTABLE`; a correctly-extracted multi-basket section is not
  downgraded and both rules remain promotion-eligible (no false positive
  from the new check).

All 16 tests use invented section references and invented rule text —
no FWRG/LSB-specific strings, thresholds, or section numbers appear in any
of them.

**Targeted-test result:** all 19 tests across the 5 directly-relevant files
(the 3 new files plus the 2 pre-existing files touched by the evaluator
change) pass. **Full-suite result:** 585/585 tests across 77 files pass,
`tsc --noEmit` clean, `eslint .` clean, `npm run build` succeeds (only
pre-existing unrelated font warnings).

## 6. FWRG/LSB revalidation (regression fixtures — not unseen, not blind, not proof of generalization; see §9 below)

Re-derived with **zero new LLM calls**: `scripts/run-phase-c1-recompute.ts`
reuses the already-persisted, already-paid-for VERIFICATION stage output
(`finalRules`) plus persisted INVENTORY/DEFINITIONS stage output and
persisted `DocumentNode` SECTION boundaries from the last real Phase C run,
applies only the new deterministic completeness pass and the fixed
evaluator in-process, and re-runs VALIDATION/COVERAGE/PROMOTION.

### FWRG (18 total)

| | Before | After |
|---|---|---|
| Correct | 11 | 12 |
| Flagged | 4 | 3 |
| **Unflagged (dangerous)** | **2 (11.1%)** | **2 (11.1%)** |
| Missing | 1 | 1 |

`fwrg-6.04-a-iii` moved from flagged to `MATCHED_CORRECT` (an orthogonal
improvement from the comparisonRule fix, beyond the 8 originally-diagnosed
cases). The 2 remaining unflagged cases (`fwrg-6.10-a`, `fwrg-6.10-b`) are
unchanged: both are standalone ratio-tests where ground truth expects a
`formulaRef` a `RATIO_TEST` rule type does not require, assessed as
ground-truth-authoring imprecision rather than a real economic danger, and
NOT a multi-basket case.

### LSB (14 total)

| | Before | After |
|---|---|---|
| Correct | 7 | 10 |
| Flagged | 0 | 0 |
| **Unflagged (dangerous)** | **6 (42.9%)** | **3 (21.4%)** |
| Missing | 1 | 1 |

`lsb-6.11-restricted-payments`, `lsb-6.13-investments`,
`lsb-6.14-affiliate-transactions` all moved to `MATCHED_CORRECT`. Remaining
3 unflagged: `lsb-6.01-i-flat-or-pct-assets`, `lsb-6.04-a-abl-collateral-
disposal` (both a known, previously-documented `GREATER_OF_FLAT_OR_PCT_
EBITDA` vs. `OTHER` formula-label ontology gap), and `lsb-6.08-
subordinated-debt-payments` (extraction was always correct — the real
figure exists in persisted child rule `6.08(a)(vi)` — but the evaluator's
own exact-match-only safety guard does not reach two hierarchy levels deep
from an inexact top-level match, so it is not credited).

### Aggregate

- **Before: 8/32 = 25.0%** dangerous-unflagged.
- **After: 5/32 = 15.625%** dangerous-unflagged.
- Denominator unchanged (32 = 18 FWRG + 14 LSB applicable graded cases;
  no scoring-bug justified a denominator change).
- Dangerous-flagged: FWRG 16.7%→16.7% (unchanged), LSB 0.0%→0.0%
  (unchanged). Reported separately, never combined with dangerous-unflagged.
- Promotion counts (informational): FWRG `EXECUTABLE` 3 (unchanged
  composition aside from the 6.04(a)(iii) shift into `NON_EXECUTABLE_
  QUALITATIVE`/correct bucket); LSB `EXECUTABLE` 5, up from a lower count
  before the fix as 3 previously-suppressed-by-mismatch rules became
  eligible.

## 7. Case-by-case reconciliation of all 8 originally-diagnosed cases (task §6/§8 — mandatory, no aggregate-only conclusion)

| # | Case | Expected rule | Extraction before fix | Why originally scored dangerous | Extraction changed? | Verifier/evaluator result after fix | Classification |
|---|---|---|---|---|---|---|---|
| 1 | fwrg-6.10-a | Ratio test with formulaRef | Ratio test, no formulaRef | Evaluator expected formulaRef `RATIO_DERIVED_AMOUNT` | No | Still `MATCHED_INCORRECT_UNFLAGGED` | `EXTRACTION_WRONG_STILL_UNFLAGGED` (likely ground-truth-authoring imprecision; not multi-basket) |
| 2 | fwrg-6.10-b | Same pattern as #1 | Same as #1 | Same as #1 | No | Same as #1 | `EXTRACTION_WRONG_STILL_UNFLAGGED` (same caveat) |
| 3 | lsb-6.01(i) flat-or-pct-assets | `GREATER_OF_FLAT_OR_PCT_EBITDA` | Correct threshold, formula tagged `OTHER` | Formula-label mismatch | No | Still `MATCHED_INCORRECT_UNFLAGGED` | `EXTRACTION_WRONG_STILL_UNFLAGGED` (known formula-ontology gap, previously documented via Matthews) |
| 4 | lsb-6.04(a) ABL collateral disposal | Same pattern as #3 | Same as #3 | Same as #3 | No | Same as #3 | `EXTRACTION_WRONG_STILL_UNFLAGGED` (same caveat) |
| 5 | lsb-6.08 subordinated debt payments | $500,000 in family `RESTRICTED_PAYMENTS`... actually `INDEBTEDNESS`-adjacent family per ground truth, fixed-amount | Correct $500,000 present, but only in child rule `6.08(a)(vi)`; general-prohibition rule (bare "6.08") has none | Evaluator compared ground truth only to the general-prohibition rule | No — the correct data was always present in the persisted child rule | Still `MATCHED_INCORRECT_UNFLAGGED`: ground truth's target ("6.08") has no *exact* match (the real rule is tagged "Section 6.08(a)"), so the exact-match-only safety guard never triggers child search | `EXTRACTION_WRONG_STILL_UNFLAGGED`, nuanced: extraction was always correct; the persisting gap is a deliberately conservative evaluator guard, not a data loss |
| 6 | lsb-6.11 restricted payments | Threshold + formula matched to correct child | Correct data present in child, previously mis-scored against parent | Evaluator compared formula/family to the wrong (parent) rule after the number was resolved | No — comparisonRule fix is a scoring fix, not an extraction change | Now `MATCHED_CORRECT` | `EXTRACTION_CORRECTED` |
| 7 | lsb-6.13 investments | Same pattern as #6 | Same as #6 | Same as #6 | No | Now `MATCHED_CORRECT` | `EXTRACTION_CORRECTED` |
| 8 | lsb-6.14 affiliate transactions | Same pattern as #6 | Same as #6 | Same as #6 | No | Now `MATCHED_CORRECT` | `EXTRACTION_CORRECTED` |

**Totals:** `EXTRACTION_CORRECTED` = 3 clean (#6–8) + 1 nuanced (#5, where
extraction itself was always correct but the evaluator's deliberately
conservative guard still does not credit it) = 4 of 8 had correct
underlying extraction recognized or already present.
`EXTRACTION_WRONG_VERIFICATION_FLAGGED` = 0.
`EXTRACTION_WRONG_STILL_UNFLAGGED` = 4 literal (#1–4) + the nuanced #5 by a
different mechanism (evaluator guard, not extraction) = 5 of 8 remain
scored dangerous-unflagged after this fix.

None of the 8 cases moved from "verification missed it" to "verification
caught it" (`EXTRACTION_WRONG_VERIFICATION_FLAGGED` = 0) — the new
deterministic completeness check did not fire on any of these 8, because
none of them is actually a section where a real numeric expression from the
source text has no home in any extracted rule (the FWRG cases are
single-basket ratio tests; the LSB cases all had the correct figure present
somewhere in the extracted rule set all along). The improvement realized
here came entirely from the evaluator/scoring fix, not from the new
adversarial detection capability catching a live multi-basket loss. This is
reported plainly per task §6's explicit instruction not to describe a
verification catch as an extraction improvement, or vice versa.

## 8. Anti-gaming self-check (task §9)

- No fixture expected answer was modified.
- No correctness criterion was weakened; the evaluator change added a
  *narrower* correct-matching path (exact-match-gated child resolution),
  it did not relax any existing check.
- No dangerous error was converted to `REVIEW_REQUIRED` via grading logic;
  the 3 `EXECUTABLE` rules affected by the comparisonRule fix became
  `MATCHED_CORRECT`, not `REVIEW_REQUIRED`.
- No package-specific knowledge, section names, or thresholds were injected
  into any production code path (`basket-completeness.ts`,
  `evaluator.ts`, `stage-verification.ts`, `orchestrator.ts` contain zero
  FWRG/LSB-specific strings).
- Review-required rate: LSB's VERIFICATION stage status now reports
  `REVIEW_REQUIRED` when a section fails the new completeness check; in
  this recompute, 0 FWRG sections and 0 LSB sections were newly flagged by
  the completeness check itself (all 8 original cases were resolved, where
  resolved, via the evaluator fix, not the new check) — so no measurable
  new false-review-required cases were introduced by this change on these
  two fixtures. This also means the new detection capability remains
  **unproven against a real live multi-basket loss** on these two
  fixtures specifically; it is proven only via the 10 synthetic tests.
- No post-hoc manual edits were used as compiler output; all numbers come
  from `scripts/run-phase-c1-recompute.ts`'s programmatic re-derivation.
- First-run evidence (the original Phase C report,
  `docs/phase-c-contract-compiler-v1.md`) was not overwritten.

## 9. Promotion invariant (task §10)

Reconfirmed and covered by new regression tests
(`promotion-invariant-multi-basket.test.ts`): no rule under a
section flagged by the new completeness check can reach `EXECUTABLE`
(swapped-threshold test), and no false positive is introduced for a
correctly-extracted multi-basket section (both rules remain
promotion-eligible in the second test).

## 10. Resume/idempotency (task §11)

`MULTI_BASKET_CHECK_VERSION` is now part of `verificationInputHash` in
`orchestrator.ts`, so a future change to the completeness-check logic
invalidates stale resumed VERIFICATION results. Existing orchestrator
resume/idempotency tests continue to pass unmodified.

## 11. Full regression (task §12)

- `npx tsc --noEmit`: clean.
- `eslint .`: clean.
- `npx vitest run`: 585/585 tests, 77 files, 0 failures.
- `npm run golden-test -- coherent`: 26 passed / 3 failed / 1 flagged / 0
  errored (30 total) — unchanged from pre-task baseline.
- `npm run golden-test -- matthews`: 2 passed / 4 failed / 10 flagged / 2
  errored (18 total) — unchanged from pre-task baseline.
- Protected-data fingerprint (unchanged): `goldenTests=48, permissions=29,
  permissionRelationships=27, sharedConstraints=3, legalReview=111,
  coherentContractRule=0, matthewsContractRule=0, totalContractRule=130`.
- Zero new Prisma migrations.
- `npm run build`: succeeds (pre-existing unrelated font warnings only).
- Tenant isolation: no code touched company-scoping logic; no new queries
  introduced outside the existing per-`companyId` filtering pattern already
  used by `stage-validation.ts`/`stage-coverage.ts`.

## 12. Cost discipline (task §15)

**0 new model calls, 0 new tokens, $0 additional cost.** The entire
revalidation reused already-persisted VERIFICATION/INVENTORY/DEFINITIONS
stage output from the prior real Phase C run; only deterministic,
free logic was re-executed (`checkAllSectionsBasketCompleteness`,
`runValidationStage`, `runCoverageStage`, `runPromotionStage`,
`evaluateAll`).

## 13. Newly discovered limitations

- The evaluator's exact-match-only child-resolution guard, while correctly
  preventing false positives, is conservative enough to miss a real,
  correctly-extracted figure when ground truth's own target reference does
  not exactly match the general-prohibition rule's own citation format
  two levels up the hierarchy (case #5, `lsb-6.08`). Loosening this guard
  was considered and rejected within this task, since doing so without
  independent justification would reintroduce exactly the false-positive
  risk this guard was added to prevent (per task §9's anti-gaming
  constraints).
- The formula-label ontology gap (`GREATER_OF_FLAT_OR_PCT_EBITDA` vs.
  `OTHER`) remains unresolved and accounts for 2 of the 5 remaining
  dangerous-unflagged cases; it was already known before this task and is
  not a multi-basket-specific issue.
- The FWRG 6.10(a)/(b) cases suggest a possible ground-truth-authoring
  question (should a standalone `RATIO_TEST` rule type require a
  `formulaRef`) rather than a compiler defect; not resolved in this task
  since altering ground truth is explicitly prohibited by task §9 absent
  independent justification, which was not established here.
- The new deterministic completeness check has zero confirmed real-world
  detections on FWRG/LSB (all remaining dangerous-unflagged cases there
  are non-multi-basket-loss patterns); its only proof of correctness to
  date is the 10 synthetic tests plus the 2 promotion-invariant tests. A
  genuinely unseen third package is the only way to test whether it
  detects a real multi-basket loss it hasn't been shaped against.

## 14. Gate calculation and verdict

Aggregate dangerous-unflagged = 5/32 = **15.625%** > the required ≤5%.

**Verdict: `MULTI_BASKET_REGRESSION_GATE_FAILED`.**

Per task §13's FAILED branch: this task stops here. No third
"unseen"/genuinely-blind package is authorized (that step is gated on a
PASSED verdict, per task §14). No further Phase C compiler expansion or
unrelated product work follows automatically, per the task's own stop
condition.

## 15. Recommended next (smallest) intervention

The 5 remaining dangerous-unflagged cases split into two independent, small,
targeted fixes — neither requires new LLM prompting or architecture:

1. **Extend the exact-match-only child-resolution guard one level deeper,
   generically, only when the intermediate level is itself an exact
   ancestor-prefix chain with no ambiguity** (i.e., ground truth targets
   `X`, no exact rule for `X` exists, but exactly one rule with ref `X(a)`
   exists — an exact ancestor one level up — and *its* children are then
   searched). This targets case #5 without reopening the original
   loose-fallback false-positive risk, because the ambiguity that made the
   original fallback unsafe (many unrelated rules sharing a bare number)
   does not exist when there is exactly one intermediate exact ancestor.
   This is a 1-case fix (5→4/32 = 12.5%), still short of the gate on its
   own.
2. **Resolve the `GREATER_OF_FLAT_OR_PCT_EBITDA` vs. `OTHER` formula-label
   ontology gap** — either by tightening the extraction prompt's formula
   taxonomy guidance (a real, small LLM-prompt change, requiring
   authorization for new paid calls) or by documenting it as an accepted,
   permanent ground-truth-vs-ontology disagreement and excluding it from
   the dangerous-unflagged denominator with an explicit, reviewed scoring
   rationale (a documentation/scoring-policy change, not a code fix). This
   affects 2 cases (potentially 5→3/32 = 9.375% if resolved as a real
   fix, or a denominator/definition change requiring separate sign-off if
   treated as a scoring exclusion).

Neither intervention alone reaches the ≤5% gate; both together
would bring the aggregate to 3/32 = 9.375%, still above gate. The
FWRG 6.10(a)/(b) ground-truth-authoring question would need to be resolved
(likely requiring a human legal/product decision on whether `RATIO_TEST`
should require `formulaRef`) to close the remaining gap to ≤5% (1/32 =
3.125% if that pair is also resolved). Recommend addressing item 1 first
(pure code fix, zero cost, well-scoped, low risk) and raising items 2 and
the FWRG ground-truth question to the user for a decision before further
code changes, since both involve either new paid LLM iteration or a
ground-truth-authoring judgment call outside engineering discretion.
