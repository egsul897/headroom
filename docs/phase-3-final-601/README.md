# Phase 3 Final-Bridge — Chewy Section 6.01 Fresh Integrated Production Validation

**Verdict: `PHASE3_601_COST_BOUND_BEFORE_START`** — zero paid calls, $0.00 spent, Phase 4 not started, Phase 3 not closed.

Starting SHA `a013ffdc4195257505a2e6546e984e7153cbf5bb`. Production files changed: **0**.

## What was asked

One high-value fresh integrated validation of Chewy Section 6.01 through the current production stack:
`compileCovenantToIR` with a fresh DUAL_PASS_ENSEMBLE Pass A, automatic execution-mode selection, production
sharding, stitching, global Pass C and the independent verifier, scored against the 8 frozen human-reference
items for that section. Hard cap **$11.50**. Section 33 of the mission stresses that even a pass here would
not close Phase 3.

Mission §12 gates the first call: the conservative projected total must be **≤ $11.50 AND ≤ the gateway
balance**, computed with the cost methodology already committed in `docs/phase-3-final-chewy/02-cost-preflight.json`,
and **the estimator must not be weakened**. That gate fails.

## Freeze (00) — everything matched

| Item | Value |
|---|---|
| Starting SHA | `a013ffdc4195257505a2e6546e984e7153cbf5bb` (verified) |
| Chewy extracted text sha256 | `f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb` (expected, matched) |
| Human reference set sha256 | `e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036` (expected, matched) |
| Section 6.01 node | unique in document body, chars 608,901–642,524, 33,623 chars |
| 6.01 reference items | **8**, of which **4 CRITICAL** and 4 MATERIAL |
| Label vs span agreement | all 8 items labelled `6.01*` also fall inside the node span; no disagreement |
| Reference set exposed to any model | No |

The mission's predicted execution shape was reproduced exactly by the deterministic preflight: **SHARDED,
6 shards, 0 oversized, 6 Pass A batches per pass, 33,623 chars.** The batch count is not an approximation —
it was computed through the real production slot partitioner and batcher (255 slots → 6 batches of
5,967 / 5,907 / 5,971 / 5,865 / 5,906 / 4,007 chars).

## Why no call was made (01)

The committed methodology has three tiers: mean observed rates, worst single observed rate, and
`conservative` = worst rates × 1.25.

| Tier | Pass A | Pass B | Verifier | Total |
|---|---|---|---|---|
| Mean | $5.8820 | $2.0403 | $0.3863 | **$8.3086** |
| Worst observed | $8.4789 | $3.7996 | $0.3863 | **$12.6648** |
| Conservative (×1.25) | $10.5986 | $4.7495 | $0.4829 | **$15.8309** |

Cap $11.50. Gateway balance $12.559204. The conservative total is **$4.33 over the cap** and **$3.27 over the
balance**.

Two things are worth stating plainly. First, the mission's own expected mean of about $8.3 is reproduced to
the cent ($8.3086), so the disagreement is not about the model of the work — it is only about which tier the
word "conservative" names. The mission's expected $10.4 corresponds to mean × 1.25; the committed artifact
applies the 1.25 factor to the worst observed rates. Second, and independent of that choice: the
worst-observed total with **no** safety factor ($12.66) already exceeds the balance ($12.56). There is no
headroom for a worst-case draw, which is the exact failure that halted the original whole-agreement
Validation B when the account hit its budget mid-run.

Pass A is 67% of the conservative total, because §7 mandates two independent passes over a 6-batch unit.

## Unblocking levers (01, none applied)

- **A — fund and raise the cap.** Cap and balance of **$15.84** clear §12 with the committed methodology untouched. Shortfall against the current balance: **$3.27**.
- **B — state that the conservative tier is mean × 1.25.** That gives $10.3857, which fits both the current cap and the current balance. This mission will not make that substitution on its own, because §12 says not to weaken the estimator, but it is one explicit instruction away.
- **C — single-pass Pass A.** $10.5316 conservative, clears both bounds, but contradicts §7. Disclosed, not taken.
- **D — a smaller unit.** Section 6.02 costs about $2.27 mean but carries 1 reference item instead of 8 and would not exercise sharding.

## Artifacts

- `00`, `01`, `02`, `10` are real. `02` is the paid ledger: 0 calls, 2 gateway balance reads, $0.00, balance unchanged at $12.559204.
- `03`–`08` are committed as explicit `produced: false` placeholders. Each needs paid production output that does not exist.
- `09` holds the trust gate, the quality gate and the §32 verdict table. Its hard trust counters are all zero and are recorded as **vacuous zeros that confer no trust evidence**; the trust gate is marked not passed rather than passed-with-zeros. The quality gate is `NOT_EVALUABLE`, which is deliberately not the same claim as `PHASE3_601_NEEDS_SEMANTIC_ITERATION`.
- `10` is the regression record. Full suite 107 failing files / 162 failing tests / 3,167 passing, identical to baseline, failing identities unchanged. `npm run build` passes, lint is clean, `tsc` shows the same 6 pre-existing errors in untouched foundation-audit test files and 0 in mission files. The three targeted suites that fail (`pass-a-inventory`, `pass-a-stability`, `pass-bc-reconciliation`) are inside that baseline: no file under `lib/`, `tests/`, `app/` or `prisma/` changed since the starting SHA, and those tests are deterministic and make no model calls. Every F-7 suite passes.

§32 scorecard: 17 conditions, 7 PASS, 8 FAIL, 2 NOT_EVALUATED.

## Next step

The next mission remains the zero-cost Phase 3 closure synthesis described in §33. If the Section 6.01
evidence is still wanted first, it needs one of the levers above — most cleanly, a balance of $15.84 and a
matching cap, or an explicit pre-registered statement that the conservative tier is mean × 1.25. Re-run
`scripts/phase-3-601-preflight.ts` at the new head so `00` and `01` are re-frozen before any paid call.

---

# Funded resume run (artifacts 11-21)

**Verdict: `PHASE3_601_COST_BOUND_DURING_RUN`** — $3.5017 spent of a $15.84 cap, Phase 3 not closed, Phase 4 not
started. Starting SHA `d51e7f275f6a7ffbaa2f61c19dd823b9da143b23`. Production files changed: **0**.

## The gate passed; the run then voided itself

Funding cleared §6 exactly as intended. Balance $32.559204 against the $15.84 cap, and the conservative estimate
reproduced the earlier preflight **to the cent** at $15.8309 (mean $8.3086, worst-observed $12.6648). Every frozen
identity matched, including the Section 6.01 text hash `6b79685c…`, the span 608,901–642,524 at 33,623 chars, and
the 8-item reference slice at 4 CRITICAL / 4 MATERIAL with label and span selection in exact agreement.

Then the run voided itself through **harness defect HD-1**, in my scaffolding, not in production.

The §7 in-run affordability guard priced remaining Pass B work as
`max(tokensRemaining × worstTokenRate, shardsRemaining × worstSingleShardUsd)`. The §4 frozen methodology prices
Pass B **solely** per planner-estimated input token. That extra per-shard term added $0.647 and pushed
conservative-remaining to **$16.6405** against the gate's own **$15.8309**. The guard and the gate disagreed, so the
guard refused the very first Pass A call of *both* passes before either could run.

Consequences: both passes returned `INVENTORY_FAILED` with 0 calls and 0 items, the dual-pass ensemble was never
built, and the compilation proceeded over an **empty inventory**. That is not the validation that was commissioned.

## What production did, which was correct

Starved of its inventory layer, the system degraded safely and loudly at every level:

- both Pass A passes recorded `INVENTORY_FAILED` carrying the refusal reason verbatim, never silently skipped
- the ensemble refused to build: *a pass that did not run cannot corroborate or be corroborated*
- unit status **PARTIAL** with 8 failure reasons including `SEMANTIC_INVENTORY_UNAVAILABLE` and `SEMANTIC_ACCOUNTABILITY_INCOMPLETE`
- Pass C reported `semanticallyComplete=false`, 0 inventoried, 47 unaccounted source spans, 30 uninventoried values
- **0 definitions** retained as authoritative: all 7 unowned definitions and 4 out-of-scope rules were demoted by the stitcher rather than credited
- the independent verifier returned `MATERIAL_DISCREPANCY` with 5 MATERIAL findings

This is real evidence about safe failure, and it is incidental. It does not substitute for the commissioned run.

## Why the mission stops here rather than re-running

| | |
|---|---|
| Spent | $3.5017 |
| Cap | $15.84 |
| Remaining cap | $12.3383 |
| Conservative cost of a valid fresh run | $15.8309 |
| Fits remaining cap | **No** |

§7 permits another call only if all remaining required work fits both the remaining cap and the remaining balance.
It does not. Using mean × 1.25 ($10.3857, which would fit) is precisely the estimator substitution §6 forbids, so I
did not make it. All completed outputs are preserved.

## Scoring was deliberately not attempted

Artifacts `17` and `18` are committed as `produced: false`. Scoring 8 reference items against a run with no semantic
inventory would measure HD-1, not semantic quality, and would emit 8 vacuous `NOT_DISCOVERED` rows that read like a
recall finding. `19` records the trust counters honestly: 6 genuinely **MEASURED** at zero on real output, 3
**VACUOUS** zeros where nothing existed to lose, and 5 **NOT_MEASURABLE** without Pass A. The quality gate is
`NOT_EVALUABLE`, which is deliberately not the claim `PHASE3_601_NEEDS_SEMANTIC_ITERATION` would make.

§29 scorecard: 17 conditions, 12 PASS, 5 FAIL.

## Regression and the harness fix

Full suite 107 failing files / 162 failing tests / 3,167 passing, with the failing identities compared as exact sets
before and after and found unchanged. Build passes, lint is clean, `tsc` shows the same 6 pre-existing errors in
untouched foundation-audit files. Zero production files changed.

HD-1 is fixed in `scripts/phase-3-601-funded-run.ts`, with the reasoning recorded at the call site. The fix was
applied **after** the run, touches no production code, produced no evidence in this mission, and cost 0 paid calls.

## Next step

A new pre-registered mission whose cap again covers the full $15.8309 conservative estimate. The identities, the
deterministic plan and all three cost tiers reproduced exactly, and the guard now uses the same estimator as the
gate, so that mission should reach a real Pass A on its first attempt.

---

# Clean rerun (artifacts 22-34)

**Verdict: `PHASE3_601_HARNESS_DEFECT`** — $5.2913 spent of a $15.84 cap, Phase 3 not closed, Phase 4 not started.

## What worked

The mandatory §3 certification passed: `CERTIFIED_CLEAR_TO_EXECUTE`. The live guard's initial
conservative-remaining was **$15.830939, bit-identical to the unrounded frozen estimator**, and both Pass A
paths were probed admissible at zero cost. HD-1 is closed structurally, because the certification and the paid
run now import one guard module, so the formula proved is the formula that runs.

**Pass A ran to completion for the first time in this series.**

| | Pass 1 | Pass 2 |
|---|---|---|
| Status | INVENTORY_COVERAGE_GAP | INVENTORY_COVERAGE_GAP |
| Items | 284 | 290 |
| Calls | 7 (6 batches + gap) | 7 (6 batches + gap) |
| Cost | $2.6008 | $2.6905 |

The ensemble built under STRICT compatibility: **322 canonical items, 252 corroborated, 70 single-run
(32 / 38 by pass), 0 conflicted**, support-review fraction 0.1988, frozen at content hash `25203003…`.
Anti-hallucination held perfectly: **0 items rejected as unverifiable** across both passes, with 252
same-identity wordings merged. Source accountability: 255 stretches covered by inventory, 16 unaccounted,
2 uninventoried values.

## What went wrong: HD-2

My §4 prerequisite gate demanded `INVENTORY_OK` from both passes. Both returned `INVENTORY_COVERAGE_GAP`,
which is a **successful** Pass A that honestly discloses 16 unaccounted stretches. §4's enumerated stop
conditions are: refused by the cost guard, throws, `INVENTORY_FAILED`, or no usable inventory due to
harness/environment failure. None applied, and §4's own third requirement, that the ensemble be
successfully constructed, was met. The gate was stricter than its specification and killed the run before
Pass B.

This is the same shape as HD-1. Both were harness gates stricter than the spec they implemented, and in
both cases the over-strictness destroyed the run rather than protecting it. Production was not defective
and was not changed.

## Why the mission stops here

§13 requires stopping rather than patching and continuing when a harness defect is found after paid calls.
Independently, a full fresh run costs $15.8309 conservative against $10.5487 of remaining cap, so §7 would
also forbid it. Reusing this mission's own 322-item inventory is permitted by §11 and would cost about
$4.75 conservative for Pass B plus verifier, which **would** fit, but reaching it requires the patch §13
prohibits. HD-2 is fixed in the harness anyway, after the run, with zero paid calls after the fix.

## Artifacts

`22`–`26` and `33`, `34` are real. `27`–`31` are committed as `produced: false`: scoring 8 reference items
against a run with no compilation output would measure HD-2, not semantic quality. `32` records the trust
counters as `NOT_MEASURABLE` and the quality gate as `NOT_EVALUABLE`, which is deliberately not the claim
`PHASE3_601_NEEDS_SEMANTIC_ITERATION` would make, and carries the real Pass A evidence.

§27 scorecard: 18 conditions, 9 PASS, 9 FAIL.

## Regression

Full suite 106 failing files / 161 failing tests / 3,168 passing, against a 107 / 162 baseline. **Zero new
failures.** One file flipped to passing, `part-b-recert-finding4-independent`, characterised as a genuine
flake by three isolated runs giving 12 passed, 1 failed, 12 passed with **zero `.ts` source files changed**
since the pin. Build passes, lint clean, `tsc` shows the same 6 pre-existing errors.

## Next step

The 322-item ensemble inventory is frozen and directly reusable under §11. A follow-up mission can resume
from it for roughly $4.75 conservative, covering Pass B, Pass C and the verifier, which is well inside a
fresh $15.84 cap. Cumulative Section 6.01 spend so far is $8.792976 across the void run and this one.

---

# Completion attempt (artifacts 35-46)

**Verdict: `PHASE3_601_BANKED_INVENTORY_NOT_RESUMABLE`** — zero paid calls, $0.00 spent, Phase 3 not closed,
Phase 4 not started.

## The banked inventory does not exist

This mission was to resume the 322-item Pass A ensemble and finish Pass B, Pass C and the verifier. It cannot,
because **the inventory object was never written to disk.**

`scripts/phase-3-601-clean-rerun.ts` wrote `frozen-inventory.json` only inside the post-compile freeze block,
after `compileCovenantToIR`. HD-2 aborted that run before the compile, so the write never executed. The
322-item truth layer, representing **$5.291298 of paid Pass A**, existed only in process memory and died with
the process. Call this **HD-3**.

The negative is proved, not assumed. Searching for the frozen hash across the repository returns only three of
my own summary artifacts, which record it as a string. Searching the clean-rerun evidence directory for
`inventoryItemId` returns nothing. The evidence directory contains one file: the guard-state log.

§5 requires passing the banked inventory **object** through the production resume logic before any paid call.
There is no object to pass. §6 forbids rerunning Pass A. So the truth layer cannot be reconstituted here at
any price, and the correct outcome is zero spend.

## What was proved at zero cost

- **HD-2 closure certified: 6/6.** The §4 predicate is now one exported function imported by both the paid run and its certification. All three required negative tests pass (`INVENTORY_FAILED`, absent inventory, zero usable items), plus ensemble-not-built and an `INVENTORY_OK` positive control, plus the banked `INVENTORY_COVERAGE_GAP` shape returning **true**.
- **Banked statistics intact.** Every §4 figure matches exactly: 322 canonical, 252 corroborated, 70 single-run, 0 conflicted, 64 material single-run, 0 material conflicted, 0 rejected unverifiable, `INVENTORY_COVERAGE_GAP`, 16 unaccounted, 2 uninventoried, STRICT.
- **Remaining cost recomputed: $5.2323** conservative, against the mission's expected ~$5.2324, the $5.30 cap and a $23.77 balance. The mission was affordable and would have proceeded but for HD-3.
- **Identities verified.** Source hash, Section 6.01 span and text hash, and the 8-item reference slice.

## The defect series

| | Defect | Shape |
|---|---|---|
| HD-1 | In-run guard stricter than the frozen estimator | Refused both Pass A passes |
| HD-2 | Pass-A gate stricter than §4 | Stopped Pass B after a *successful* Pass A |
| HD-3 | Expensive evidence persisted after an abortable gate | Let HD-2 destroy irreplaceable output |

All three were in scaffolding I wrote. Production behaved correctly throughout. HD-1 and HD-2 were gates
stricter than their own specifications; HD-3 was the ordering error that turned HD-2 from a wasted run into a
destroyed one.

HD-3 is fixed: the harness now writes the inventory and both pass records the instant the ensemble is
validated, before any gate that can abort. The §4 predicate is defined once and imported, so HD-2's class of
defect is structurally prevented too.

§33 scorecard: 18 conditions, 7 PASS, 1 PARTIAL, 10 FAIL.

## Regression

106 failing files / 161 failing tests / 3,168 passing. **Zero new failures** against the 107/162 baseline, and
identical to the previous run. Build passes, lint clean, `tsc` shows the same 6 pre-existing errors. Zero
production files changed.

## Next step

Resuming is no longer possible, so the $8.792974 spent on Section 6.01 buys no shortcut. The honest path is one
fresh end-to-end mission under the corrected harness at a cap covering the full $15.8309 conservative estimate.
The structural causes of all three defects are now closed, so that run should reach Pass B, Pass C and the
verifier on its first attempt.
