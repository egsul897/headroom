# Covenant levels / test kind / categorization — handoff to Muse

Status: **checkpoint, not feature-complete.** Grok stopped here at Egzon's request so Muse can own this lane from now on.
Design: #383 issuecomment-6240146575 (extends Muse's issuecomment-6239865667). Categorization semantics: Muse, per issuecomment-6240147469.

## What is in this branch
- `scripts/covenant-learning-factory/dev-set-coverage.ts`: the baseline metric. For each agreement in a list file it reports
  - categorization: item count, OTHER count / %, OTHER-with-reason count, and the reasons histogram
  - limited baskets: total, COMPUTED, NEEDS_INPUT, uncomputed (count and %)
  - ratio thresholds (the headroom RATIO rows) and `maintenanceLevels` (empty until covenant-levels.ts lands)
  - Usage: `npx tsx scripts/covenant-learning-factory/dev-set-coverage.ts <list-of-paths.txt> <out.json>`. It refuses HELD_OUT/BLIND paths. The output belongs outside the repo, never in docs/ or fixtures/.

## Baseline (dev set, 17 docs, MHK/held-out excluded, run at a113351a)
| metric | value |
|---|---|
| provisions/items | 5488 |
| OTHER | 3240 (59%) |
| OTHER with recorded reason | 0 (`otherReason` is not emitted yet) |
| limited baskets | 4161 |
| computed | 166 (4%) |
| needs-input | 3995 (96%) |
| uncomputed (neither) | 0 |
| maintenance levels emitted | 0 (parser not built yet) |

## TODO (in suggested order)
1. **`lib/contract-model/covenant-computation/covenant-levels.ts`** (pure). Build `parseCovenantLevel` per the #383 design:
   - level tokenizer: `2.50:1.00`, `2.50 to 1.00`, `4.50x`, `4.50 times`; normalize to an exact decimal (BigInt GCD)
   - direction lexicon: MAX (`not more than`, `not to exceed`, `permit … to exceed`, `greater than … shall not`), MIN (`at least`, `not less than`, `maintain … of not less than`)
   - test kind by **section role first** (Financial Covenants = MAINTENANCE; Indebtedness/Liens/RP/Investments provisos = INCURRENCE), then wording. A `provided that … pro forma` proviso is always INCURRENCE and never yields a maintenance level.
   - schedules: keep every row with its from/to test dates; choose the governing row by `testDate`; with no testDate, emit the full level-by-date schedule (still DETERMINED for the level, NEEDS_INPUT only for the applicable row)
   - modifiers: `increased by`, `step-up`, `plus 0.50x`, acquisition holidays, and relative levels are MODIFIERs, never the threshold
   - metric identity: ratio name or `ratio of A to B` → GROSS/NET/SECURED_LEVERAGE, INTEREST_COVERAGE, FIXED_CHARGE_COVERAGE
   - NEEDS_INPUT only for external inputs (metric value, test date) or genuine ambiguity, with `missing[]` naming what is missing. Overcautious counts as a failure.
2. Synthetic unit tests (`tests/contract-model/covenant-levels.test.ts`). Synthetic text only: no text, labels or amounts from #422 samples or held-out material.
3. Wiring (additive, fail-closed):
   - `runAgreementPipeline`: take maintenance thresholds only from a MAINTENANCE + DETERMINED level; emit `maintenanceLevels[]` (the script already reads it)
   - `parseMaintenanceRatio`: record `agreementMetric` into provision params
   - `covenant-overview-builder.ts:88-103` `RatioRow`: add `testKind`, `complianceVerdict`, `agreementDefinedMetric` (this activates #413/#420)
4. Categorization: emit a per-provision `category` with `otherReason` whenever the category is OTHER (the script counts `otherWithReason`). Target: OTHER is a last resort only.
5. Limited baskets: drive NEEDS_INPUT toward COMPUTED where the text gives the cap. Keep NEEDS_INPUT only where an external figure (EBITDA, total assets) is needed, and say which.
6. Re-run the script for an after.json. Dev-set computed covenant results may only move toward correct or more cautious. WRONG and FALSE-CONFIDENT must be 0.

## Rules carried over
Normal commits only (no force-push), `git status` before each commit, never touch HELD_OUT/BLIND/baseline/FROZEN files, CI green.
