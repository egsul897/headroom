# P3 Lane E — metrics from tip `1acdff345fff655f602fd61ff20c395028b6f140`

Soft gate. Docs only. No product remediation. invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

Tip under test: `1acdff345fff655f602fd61ff20c395028b6f140` (merge of #103). Every figure below was recomputed at that tree from the fixtures and the code that defines the denominator. A number that is only quoted from an earlier write-up, and that this lane did not recompute, is marked as such.

## Freeze contract this lane used

Phase-3 semantic freeze is roadmap step 3. The controlling product contract is `docs/headroom-north-star-reconciliation/06-revised-roadmap.md` (last change `8f57e78`, 2026-10-06). The contract that lists what must be true before that freeze is `docs/phase-3-reliability-stratified-certification/00-selection-contract.json` → `acceptanceCriteria.beforeSemanticFreeze` (last change `dbcfb96`, 2026-10-06). That list is nine bullets: stratum pins or named TBD blockers, cross-cuts pinned or TBD-with-blocker, first live candidate stays `first-target/`, `certifyCandidate` with an empty blocker list before `CERTIFIED`, interim-B series never credited, EC-V3 safety-critical dimensions not overridden by diagnostic dimensions, zero provider calls on the pin path, A/B seal untouched, packets append-only.

None of those bullets is “holdout disposition stability ≥ 95%”, “V3 agreement ≥ 90%”, or “§7.5(j) `supportReviewRequired` is false”.

Step 2 (the stratified set) is what the selection contract says unblocks step 3. This lane does not score step 2. Leaving these three folklore items off the freeze list does not clear an unpinned stratum, a missing cross-cut, or any other `beforeSemanticFreeze` bullet.

## Verdict

| Folklore | Tip status | Phase-3 freeze-critical |
|---|---|---|
| Holdout 90.11% vs ≥95% | Reproduced. 82/91 = 0.9010989010989011. Gate fails on its own contract. | No |
| “C7 V3 agreement <90%” | The identifier `C7` does not name an agreement metric. **UNVERIFIED_CARRIED_FORWARD_CLAIM** for that label. The V3 agreement shortfalls that do reproduce are checklist items 2, 3, and 4. Checklist item 7 passes. | No |
| `supportReviewRequired` / §7.5(j) | Reproduced. Boolean true. Numerator 2, denominator 12, fraction 0.1667. | No, as a freeze input. The boolean remains a per-candidate certification rule. |

## 1. Holdout 90.11% vs ≥95%

### Controlling file and contract

- Definition and threshold: `scripts/semantic-accountability-stability.ts` (mission comparator). Gate object written to `docs/semantic-accountability/14-holdout-stability.json`.
- Release row that failed on that number: `docs/semantic-accountability/25-phase3-release-gate.json` gate `G5-disposition-stability`. Requirement text: “Disposition stability (same disposition on the same content-derived item across both holdout runs) >= 95%”.
- Region list: `scripts/lib/semantic-accountability-regions.ts` `HOLDOUT_SPEC.regions` (eight ids).
- Inputs: `tests/fixtures/semantic-accountability-validation/holdout/run-1/` and `run-2/`.

A later mission (`docs/phase3-final-closure/23-phase3-release-gate.json` gates A and J, production SHA `1957105`) applied 95% to a different matcher. That file is not the freeze contract. Its gated conservative figure was not re-executed in this lane. See “Later redefinition” below.

### Exact metric

Per material inventory item (`materiality` ∈ {`CRITICAL`, `MATERIAL`}), keyed by exact `inventoryItemId`.

- Denominator `inBoth`: the item exists in both runs’ frozen inventories.
- Numerator `sameDisposition`: those items whose accountability `disposition` strings are equal.
- Gate: `sameDisposition / inBoth >= 0.95`, and `inBoth > 0`.
- `captured` for the separate variance counters is any non-null disposition other than `MISSING_FROM_COMPOSITION`. `compositionVariance` increments only when the item is in both inventories and exactly one side is captured. A label change between two captured dispositions (`UNSUPPORTED` vs `REPRESENTED`, `INTENTIONALLY_NON_COMPUTATIONAL` vs `UNSUPPORTED`) does not increment `compositionVariance`.

The comparator walks `HOLDOUT_SPEC.regions` and skips a region missing from either run. It does not invent a zero for the missing side.

### Current value and threshold

Recomputed from the two run directories at this tip, using that rule:

| field | value |
|---|---|
| regions scored | 6 (`ebitda`, `net-income`, `interest-expense`, `first-lien-debt`, `secured-net-leverage`, `applicable-liquidity-rate`) |
| skipped | `new-definitions` (run-2 only), `cash-sweep-cure` (neither run) |
| materialUnion | 463 |
| inBoth | 91 |
| sameDisposition | 82 |
| dispositionStability | 82/91 = 0.9010989010989011 (artifact rounds the totals field to 0.9011) |
| threshold | 0.95 |
| pass | false |
| inventoryVariance | 372 |
| compositionVariance | 0 |
| criticalVariableOmissions | 0 (that gate passes) |
| minimum numerator that would pass | 87/91 = 0.956043956. 86/91 = 0.945054945 is still under 0.95. |

These totals match `14-holdout-stability.json` field for field.

The 372 inventory-variance items are outside the 91. They do not move G5. G5 moves only when a shared id’s disposition string changes.

### Failing cases (the 9 label inequalities)

All nine are `STABLE_CAPTURED` under the captured/missed classifier (`varianceKind` `NONE`). All nine are inside `inBoth`.

| region | inventoryItemId | role | materiality | run-1 | run-2 | excerpt head |
|---|---|---|---|---|---|---|
| ebitda | `inv-item:51ae3fe1b158808d8fec8686` | SHARED_CAP | CRITICAL | UNSUPPORTED | REPRESENTED | the aggregate amount of cost savings, synergies and operating expense reductions |
| interest-expense | `inv-item:e402f6addf6989d4d9e52bb8` | EXCEPTION | CRITICAL | UNSUPPORTED | REPRESENTED | (other than clauses (h) and (l)) |
| interest-expense | `inv-item:90ac584225bba9bf29fbeae9` | EXCEPTION | MATERIAL | UNSUPPORTED | REPRESENTED | with the exception of any cash payments related to the settlement of deferred co |
| interest-expense | `inv-item:9117be67f7e01c8a71fe08ef` | EXCEPTION | MATERIAL | UNSUPPORTED | REPRESENTED | excluding amortization of a prepaid cash item that was paid in a prior period |
| interest-expense | `inv-item:e7af2bc02a3390544b5849d9` | EXCEPTION | MATERIAL | UNSUPPORTED | REPRESENTED | excluding cash distributions in respect thereof |
| interest-expense | `inv-item:9ac0a26ccc76e64eaf41159e` | FORMULA_COMPONENT | MATERIAL | UNSUPPORTED | REPRESENTED | (i) the amount of board of director fees |
| interest-expense | `inv-item:69ea3dec1bd51e448bd926ee` | ALTERNATIVE | MATERIAL | UNSUPPORTED | REPRESENTED | (i) any restructuring (including, without limitation, facility closures and work |
| interest-expense | `inv-item:fc71284e921af51333175119` | ALTERNATIVE | MATERIAL | UNSUPPORTED | REPRESENTED | (ii) any Permitted Acquisition |
| secured-net-leverage | `inv-item:283a981919c6ee4b4a120b58` | DEPENDENCY | CRITICAL | INTENTIONALLY_NON_COMPUTATIONAL | UNSUPPORTED | in each case on a pro forma basis with such pro forma adjustments as are appropr |

Seven of the nine sit in `interest-expense` and share the direction UNSUPPORTED → REPRESENTED. This lane did not re-derive a single-unit cascade claim beyond that shared region and direction. `docs/phase3-final-closure.md` calls those seven one cascade; that sentence is prior narrative.

### Phase-3 freeze-critical

No. `beforeSemanticFreeze` does not contain G5. The Oct 6 roadmap does not cite 90.11% or a 95% holdout bar. G5 remains a failed historical gate on the preserved Superior holdout pair. It is not an input to step 3.

### Exact lawful unlock

Of the historical G5 contract, on its own terms: a new pair of independent runs of the same holdout spec, scored by `scripts/semantic-accountability-stability.ts`, with `sameDisposition / inBoth >= 0.95`. The preserved pair cannot be edited into a pass. That re-run is not a `beforeSemanticFreeze` bullet and is not authorized by this lane.

Of the freeze: no unlock action against this metric. Do not keep step 3 blocked on 82/91.

### Later redefinition (recorded, not re-executed here)

`docs/phase3-final-closure/02-semantic-equivalence-analysis.json` keeps 82/91 as the exact-id figure and gates a different number: conservative semantic-inventory stability 194/250 = 0.776 against the same 0.95, on gate A of `23-phase3-release-gate.json`. Gate J of that file also records exact-id 90.11% and a label-stability 86.7%. This lane did not re-run `scripts/phase3-final-closure-forensics.ts`. Those later percentages stay artifact-recorded. They are also absent from `beforeSemanticFreeze`.

## 2. “C7 V3 agreement <90%”

### What the label binds to

No tip file defines a metric whose id is `C7` and whose formula is an agreement rate. The string is **UNVERIFIED_CARRIED_FORWARD_CLAIM** as an identifier. Nearby `C7` / item-7 objects, checked so the label is not silently reassigned:

| object | contract | what it is | agreement <90%? |
|---|---|---|---|
| False-credit control `C7` | `docs/semantic-accountability/21-false-credit-controls.json` | Degenerate duplicate occurrence excluded with disclosure. `pass: true`. | No. Not an agreement metric. |
| V3 section-30 checklist item 7 | `docs/evaluation-contract-v3/23-final-verdict.json` | “sibling-claim protections remain intact”. Result PASS (22/22). | No. |
| Closure-resolution requirement n=7 | `docs/phase-3-final-closure-resolution/22-phase3-final-gate.json` | “evaluator-vs-consensus credit meets threshold”. Status `NOT MEASURABLE` (depends on an independent re-adjudication that the same file says is absent). | The frozen study’s credit accuracy is 89.36%. The post-AMB-1 remeasurement does not exist. |
| Pre-4E readiness condition n=7 | `docs/pre-phase-4e-readiness/01-readiness.json` | “no unresolved semantic-evaluation defect capable of poisoning solver inputs”. `met: false`. Evidence text cites the three V3 agreement misses. | The condition cites them. It is a 4E-readiness row, dated 2026-09-21. |

The reproducible agreement contract is Evaluation Contract V3, frozen before adjudication.

### Controlling file and contract

- Thresholds, frozen before results: `docs/evaluation-contract-v3/06-validation-preregistration.json` `frozenThresholds`.
- Safety-critical vs diagnostic: `docs/evaluation-contract-v3/04-certification-vs-diagnostic-policy.json` (section 8). Closure depends on `creditEligibility` and `surfacingStatus` each passing both gates. Diagnostic dimensions do not block that closure.
- Adjudicators: `docs/evaluation-contract-v3/09-adjudicator-a.json`, `10-adjudicator-b.json`, `11-adjudicator-c.json` (47 cases each).
- Evaluator labels, sealed: `docs/evaluation-contract-v3/_sample-labels-SEALED.json` (47 labels, keyed by `gtUnitId`).
- Checklist: `docs/evaluation-contract-v3/23-final-verdict.json`.

### Exact metrics

Sample n = 47. Pairs are A-B, A-C, B-C.

**Inter-reviewer mean pairwise raw agreement.** For a dimension, average of the three pair-fractions. A pair-fraction is (cases in scope where the two adjudicators assigned the same value) / (cases in scope).

- `creditEligibility` scope: all 47.
- `surfacingStatus` scope: cases where at least 2 of 3 adjudicators assigned `creditEligibility = NO_CREDIT`. Recomputed scope n = 36.

**Evaluator vs consensus.** Consensus is the value shared by at least 2 of 3 adjudicators. A 3-way split is `UNRESOLVED_CONSENSUS` and leaves the denominator. Recomputed unresolved count is 0 on both safety-critical dimensions. Numerator is cases where the sealed evaluator label equals that consensus. Denominator is scoped cases minus unresolved.

Threshold on each safety-critical gate: 0.90. `representationCompleteness` has an 0.85 inter-reviewer bar and is diagnostic when that bar fails. `verificationStatus` and `evidenceQuality` have no certification threshold on this contract.

### Current values (recomputed from the three adjudicator files and the sealed labels)

| gate | checklist id | numerator / denominator | value | threshold | result |
|---|---|---|---|---|---|
| creditEligibility inter-reviewer | 1 | pair counts 45/47, 44/47, 46/47 | mean 0.9574468085106383 | 0.90 | PASS |
| surfacingStatus inter-reviewer | 2 | pair counts 27/36, 28/36, 25/36 | mean 0.7407407407407408 | 0.90 | FAIL |
| evaluator vs consensus, creditEligibility | 3 | 42/47 | 0.8936170212765957 | 0.90 | FAIL |
| evaluator vs consensus, surfacingStatus | 4 | 24/36 | 0.6666666666666666 | 0.90 | FAIL |
| sibling-claim protections | 7 | 22/22 recorded in the verdict; matcher not re-scored here | PASS in `23-final-verdict.json` | n/a | PASS |

Pair rates match `docs/evaluation-contract-v3/12-inter-reviewer-agreement-by-dimension.json` exactly. Checklist items 2, 3, and 4 match `23-final-verdict.json` exactly.

One additional credit match would clear item 3 (43/47 = 0.914893617). Item 4 needs nine additional matches to clear (33/36 = 0.916666667; 32/36 = 0.888888889 is still under 0.90). Item 2 is a mean of three pair rates, not a single flip count.

`docs/evaluation-contract-v3/12-inter-reviewer-agreement-by-dimension.json` `creditEligibility.disagreementCaseIds` does not match the pairwise diffs. The recomputed union of credit pairs that disagree is:

- `doc-a::I::applicable-ebitda`
- `fwrg-6.04-a-iii`
- `lsb-6.02-liens`

The published list mixes in evaluator-vs-consensus mismatches (`doc-a::X::10.01a-us-guaranty`, `fwrg-6.01-j`, `lsb-6.01-general-ratio-gated`). The rates in that file are the contract; the case-id list is not.

The surfacing prose “26 of the 36 applicable cases” does not match the case union. Recomputed cases with at least one disagreeing pair: 14. The 26 figure matches the off-diagonal pair-comparisons on `SPECIFICALLY_SURFACED` vs `NOT_SPECIFICALLY_SURFACED` (28 pair-disagreements minus 2 that touch `NOT_APPLICABLE`). The mean 0.7407407407407408 is the gate.

### Failing cases

**Item 2 — surfacingStatus, at least one adjudicator pair differs (14 cases):**

`a-7.1`, `a-7.10`, `a-7.2`, `doc-a::VI::6.04-unrestricted-sub-valuation`, `doc-a::VI::6.05-chapeau`, `doc-a::VI::6.05-ip-flush-prohibition`, `doc-b::VI::6-04-lead-in`, `doc-b::VI::6-05-lead-in`, `doc-d::VI::6-04-chapeau`, `doc-d::VI::6-05-chapeau`, `lsb-6.01-m-secured-notes`, `lsb-6.02-liens`, `lsb-6.04-b-notes-collateral-disposal`, `lsb-6.08-subordinated-debt-payments`.

**Item 3 — sealed evaluator credit ≠ majority (5 cases):**

| case | consensus | evaluator |
|---|---|---|
| `doc-a::I::applicable-ebitda` | CREDIT | NO_CREDIT |
| `doc-a::X::10.01a-us-guaranty` | NO_CREDIT | CREDIT |
| `fwrg-6.01-j` | CREDIT | NO_CREDIT |
| `fwrg-6.04-a-iii` | CREDIT | NO_CREDIT |
| `lsb-6.01-general-ratio-gated` | CREDIT | NO_CREDIT |

**Item 4 — sealed evaluator surfacing ≠ majority (12 cases):**

| case | consensus | evaluator |
|---|---|---|
| `a-7.1` | SPECIFICALLY_SURFACED | NOT_SPECIFICALLY_SURFACED |
| `a-7.10` | SPECIFICALLY_SURFACED | NOT_SPECIFICALLY_SURFACED |
| `doc-a::I::1.04-accounting-terms-gaap` | SPECIFICALLY_SURFACED | NOT_SPECIFICALLY_SURFACED |
| `doc-a::I::interest-coverage-ratio` | NOT_SPECIFICALLY_SURFACED | SPECIFICALLY_SURFACED |
| `doc-a::VI::6.05-ip-flush-prohibition` | NOT_SPECIFICALLY_SURFACED | SPECIFICALLY_SURFACED |
| `doc-a::VI::6.08b-chapeau` | NOT_SPECIFICALLY_SURFACED | SPECIFICALLY_SURFACED |
| `doc-a::X::10.01a-us-guaranty` | SPECIFICALLY_SURFACED | NOT_APPLICABLE |
| `doc-b::VI::6-01-lead-in` | NOT_SPECIFICALLY_SURFACED | SPECIFICALLY_SURFACED |
| `doc-d::VI::6-04-chapeau` | NOT_SPECIFICALLY_SURFACED | SPECIFICALLY_SURFACED |
| `doc-d::VI::6-05-chapeau` | SPECIFICALLY_SURFACED | NOT_SPECIFICALLY_SURFACED |
| `lsb-6.04-b-notes-collateral-disposal` | SPECIFICALLY_SURFACED | NOT_SPECIFICALLY_SURFACED |
| `lsb-6.08-subordinated-debt-payments` | SPECIFICALLY_SURFACED | NOT_SPECIFICALLY_SURFACED |

These are scores of the frozen 2026-08-29 study. `22-phase3-final-gate.json` records that AMB-1 was specified later and that a fresh independent adjudication was not imported. This lane did not rescore the post-V3.1 evaluator against the old adjudicators. That number is absent.

### Phase-3 freeze-critical

No. `beforeSemanticFreeze` does not require items 2, 3, or 4 to pass. It does require that diagnostic dimensions not override `creditEligibility` / `surfacingStatus`, and the selection-contract exclusions forbid weakening those dimensions to raise an automation rate. That is a standing constraint on later pins. It is not a demand to re-hit 90% before step 3.

The Oct 6 roadmap still says “pre-4E readiness condition 7 unmet”, and it says step 3 unblocks that condition. Condition 7 in `01-readiness.json` is a 4E row. The roadmap’s dependency into the freeze is step 2, not a new agreement study.

### Exact lawful unlock

Of the V3 safety-gate contract, on its own terms (`docs/phase-3-final-closure-resolution/22-phase3-final-gate.json` and the preregistration’s no-rescope rule): a genuine independent re-adjudication of the frozen 47-case sample under the written rubric, then a remeasure of the agreement gates. The historical adjudicator files stay immutable. The 0.90 bars stay. This lane does not authorize that study, and the study is not a `beforeSemanticFreeze` bullet.

Of the freeze: no unlock action against the 74.07%, 89.36%, or 66.67% figures. Do not keep step 3 blocked on them. Do not lower the bars.

Of the label `C7`: leave it **UNVERIFIED_CARRIED_FORWARD_CLAIM**. Do not attach it to false-credit C7 (that control passes) or to checklist item 7 (that item passes).

## 3. `supportReviewRequired` / §7.5(j)

### Controlling file and contract

- Formula: `lib/contract-model/compiler/semantic-accountability/ensemble.ts`. `reviewItems = counts.materialSingleRun + counts.materialConflicted`. `supportReviewRequired = reviewItems > 0`. `supportReviewFraction = reviewItems / canonicalItems`, rounded to 4 decimal places, or 0 when there are no items. `MATERIAL` is {`CRITICAL`, `MATERIAL`}. A `SINGLE_RUN` item counts toward `materialSingleRun` only when its materiality is in that set. `COVERAGE_CORROBORATED` does not.
- Propagation: `lib/contract-model/compiler/semantic-accountability/reconciliation.ts` sets the accountability flag from the ensemble flag or from the same material single-run + material-conflicted sum. `semanticallyComplete` requires the flag false, among other conjuncts. The comment on that branch says the flag is cleared by the verifier, human approval, or another certified mechanism, and is not cleared by Pass B consuming the items.
- Compile failure reason: `lib/contract-model/compiler/semantic/compile.ts` pushes `SEMANTIC_SUPPORT_REVIEW_REQUIRED` when the ensemble flag or the accountability flag is true. `lib/contract-model/phase3-certification/certify.ts` has no blocker code by that name. A compilation status other than `COMPLETED` becomes blocker `COMPILATION_NOT_COMPLETED`.
- Certified mode that makes the signal exist: `lib/contract-model/compiler/certified-config.ts` `DUAL_PASS_ENSEMBLE`. A single pass cannot observe its own asymmetry.
- Selection-contract residual: `00-selection-contract.json` `residualsTreatment.supportReviewRequired` — the flag “remains a certification REVIEW blocker until independently resolved; diagnostic asymmetry is not rewritten as CREDIT”.
- §7.5(j) live evidence (immutable): `docs/phase-3-live-validation/7.5j-end-to-end-certification/`. Replay that must keep the flag: `tests/contract-model/certified/live-7-5j-deterministic-replay.test.ts` expects `supportReviewRequired: true`, `materialSingleRun: 2`.

There is no percentage threshold. The contract threshold is the boolean false.

### Exact metric on the frozen §7.5(j) ensemble

Source: `docs/phase-3-live-validation/7.5j-end-to-end-certification/04b-support-groups.json` `items` (12 canonical items). Recomputed with the ensemble formula:

| field | value |
|---|---|
| canonical items (denominator of the fraction) | 12 |
| CORROBORATED | 4 |
| COVERAGE_CORROBORATED | 6 |
| SINGLE_RUN | 2 |
| CONFLICTED | 0 |
| materialSingleRun (numerator) | 2 |
| materialConflicted | 0 |
| reviewItems | 2 |
| supportReviewRequired | true |
| supportReviewFraction | 2/12 = 0.1666…, rounded 0.1667 |
| threshold | false |

### Failing cases (the numerator)

| inventoryItemId | role | materiality | support | span | proposition |
|---|---|---|---|---|---|
| `inv-item:c262463526204a96714cd8f6` | ALTERNATIVE | MATERIAL | SINGLE_RUN, pass-1 only | [44, 103) | Includes series of related Dispositions |
| `inv-item:5ac2fef6fb6c8558c27ae9af` | THRESHOLD | CRITICAL | SINGLE_RUN, pass-2 only | [406, 507) | Threshold amount $25,000,000 |

`inv-item:2bb0c84da8ad713ef2667e0f` (“Series of related dispositions treated as one”) is `COVERAGE_CORROBORATED` and is outside the numerator.

Live certification at `10-certification.json` is `REVIEW_REQUIRED`. Blockers on that frozen packet: `COMPILATION_NOT_COMPLETED` (detail lists `SEMANTIC_INVENTORY_COVERAGE_GAP`, `INVENTORY_ITEM_MISSING_FROM_COMPOSITION`, `SEMANTIC_SUPPORT_REVIEW_REQUIRED`), `UNACCOUNTED_MATERIAL_SOURCE`, `UNIT_SUFFICIENCY_INCOMPLETE`.

The offline replay test, which this lane did not re-run, records the post-seal expectation: compilation `failureReasons` after the replay equal `["SEMANTIC_SUPPORT_REVIEW_REQUIRED"]`, status `REVIEW_REQUIRED`, and certification blockers `COMPILATION_NOT_COMPLETED` plus `UNACCOUNTED_MATERIAL_SOURCE`. `UNIT_SUFFICIENCY_INCOMPLETE` is absent from that after-list. `docs/phase-3-live-validation/7.5j-deterministic-remediation/08-residual-genuine-blockers.json` records the same boolean and `materialSingleRun: 2`. Clearing the boolean on a future replay would still leave `UNACCOUNTED_MATERIAL_SOURCE` on the expectation the test pins. This lane did not invent a path that makes the candidate `CERTIFIED`.

### Phase-3 freeze-critical

No, as a freeze input. `beforeSemanticFreeze` does not require this candidate’s flag to be false. The selection contract excludes a paid §7.5(j) re-run and excludes using §7.5(j) as the first stratified pin. The live packet stays immutable.

The mechanism stays in force for any later candidate: `reviewItems > 0` yields `SEMANTIC_SUPPORT_REVIEW_REQUIRED`, which keeps compilation off `COMPLETED`, which `certifyCandidate` records as `COMPILATION_NOT_COMPLETED`. `beforeSemanticFreeze` already says `CERTIFIED` requires an empty blocker list. A later pin that trips the flag cannot be counted as `CERTIFIED`. That rule is already in the freeze contract. The historical §7.5(j) true value is not an extra freeze gate on top of it.

### Exact lawful unlock

Of the boolean, on the code’s own terms: `reviewItems` becomes 0 because the CRITICAL/MATERIAL single-run items and any material conflicts are independently resolved (verifier, human approval, or another certified mechanism). Pass B consuming the items does not clear it. Rewriting the asymmetry as credit is forbidden by `residualsTreatment.supportReviewRequired`.

Of this §7.5(j) packet: no unlock that edits `7.5j-end-to-end-certification/` or the deterministic-remediation packet in place. A paid re-run is an exclusion. The candidate is not the stratified first target.

Of the freeze: no unlock action that demands this flag be false before step 3. Do not drop the per-candidate rule. Do not keep step 3 blocked on the frozen §7.5(j) true.

## What this lane leaves in place

Roadmap step 2 is still what the selection contract says unblocks the semantic freeze. This document does not score pins, cross-cuts, or `certifyCandidate` on the stratified set. Those remain on `beforeSemanticFreeze` whether or not the three folklore rows are freeze inputs.

The three historical measurements stay on the record at the values recomputed above. They are not deleted. They are not step-3 inputs.
