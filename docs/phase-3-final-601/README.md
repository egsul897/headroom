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

# Final clean end-to-end attempt (artifacts 47-62)

**Verdict: `PHASE3_601_ENVIRONMENT_BLOCKED`** — $4.732104 spent, Phase 3 not closed, Phase 4 not started.

## What happened

The zero-cost triple certification passed (48): HD-1 live guard $15.830939 bit-identical to the frozen estimator
with the first call admissible; HD-2 5/5 predicate shapes; HD-3 write → fsync → reload → hash + structural
equality → exists before the simulated gate. The cost gate cleared (49: $15.8309 ≤ $15.84 cap, $23.77 balance).
The certified paid run started at 14:09:59Z and ran correctly: every one of 12 admission checks passed under the
conservative rule, pass 1 completed all 6 batch calls and its gap call ($2.8183), and pass 2 completed 4 of 6
batch calls ($1.5283).

At ~15:02Z the session worker/container restarted and SIGKILLed the run (exit 137) with pass 2 batch 5 in
flight. The host did not reboot; the harness worker was restarted and took its child processes with it. Nothing
in the run, the guard or production raised or returned. The provider completed the in-flight call server-side and
billed it after the client died ($0.385486 — a balance read at 15:04:45Z showed no charge, a later read did), so
the gateway-authoritative spend is **$4.732104** against the guard ledger's $4.346618 for the 11 completed calls.

## Why nothing was resumed and nothing was rerun

`runDualPassSemanticInventory` had not returned, so the HD-3 persistence (which fires the instant it returns) never
executed and no inventory object exists on disk. Pass 1's inventory lived only in process memory. A fresh
end-to-end run needs the full $15.8309 conservative estimate against $11.1079 of cap remaining, which §7 forbids
starting. So the run stopped at zero further cost.

## HD-4 (candidate): persistence granularity

The HD-3 closure persists at ensemble granularity (after both passes). It cannot protect against a process kill
during Pass A itself. Pass 1 (7 calls, $2.8183) would have survived under per-pass or per-call persistence of raw
provider responses, which a replaying `StageCaller` could feed back into the production
`runDualPassSemanticInventory` at zero cost. This is classified **environment-caused, harness-amplified**: no gate
refused, no gate mis-fired, production behaved correctly up to the kill. It is a design observation for the next
mission, not a fix applied here — no harness or production change was made after paid execution began. The only
new script, `scripts/phase-3-601-final-postmortem.ts`, reconstructs 50-57 from the two durable traces the guard
wrote synchronously (guard-state.ndjson, run.log) plus one gateway balance read; it makes no model call.

## Scorecard

§34: 25 conditions, **9 PASS / 16 FAIL**. Passing: identities frozen, HD-1/HD-2/HD-3 certified, no historical
Pass-B reuse, spend ≤ cap, no fix-and-continue, no new regression, build passes. All 14 hard trust counters are
**NOT_MEASURABLE** (none VACUOUS, none MEASURED) because no compiled unit exists; the quality gate is
NOT_EVALUABLE.

## Regression

107 failing files / 162 failing tests / 3,167 passing — the exact mission baseline count, with one substitution:
`part-b-terminal-recert-open3-independent` (a wall-clock O(n) scaling probe) failed only because tsc, eslint and
next build were run concurrently with vitest, and the previously characterised `finding4` flake passed. Both pass in
isolation (22/22). Zero production files changed. `tsc` shows the same 6 pre-existing errors; lint clean; build
passes.

## Cumulative Section 6.01 spend

$3.501676 (HD-1 void) + $5.291298 (HD-2 lost Pass A) + $4.732104 (this run, killed) = **$13.525078**.

## Next step

The harness is certified and production is unchanged; the only unaddressed loss channel is a process kill
during Pass A. The next attempt should (a) persist every raw Pass-A provider response the moment it returns and
run Pass A through a replaying caller so a kill costs at most one call, and (b) be funded at a cap covering the
full $15.8309 conservative estimate.

# HD-4 durable Pass-A call replay (artifacts 63-73)

**Verdict: `HD4_DURABLE_REPLAY_CERTIFIED`** — 21/21 gate conditions, zero paid calls, $0.00 spent, zero production
files changed, Phase 3 not closed, Phase 4 not started, Section 6.01 not run.

## What HD-4 is

A successful paid `StageCaller` call made during Pass A was not durable until `runDualPassSemanticInventory`
returned. The worker restart at `5bd15c2` therefore destroyed 11 completed paid calls ($4.73). Closure invariant:
**after every successful Pass-A model call a validated replayable record is durably written before control proceeds;
after restart the identical call is served from that record with provider calls = 0 and new spend = $0.**

## How it is closed (harness only)

- `scripts/phase-3-601-durable-replay.ts` — `DurableReplayStageCaller` (a `StageCaller` wrapper; production Pass A,
  prompts, batching, gap logic, ensemble untouched). Order per call: guard → provider → schema validation → atomic
  durable write (temp → fsync → rename → fsync dir → read-back hash) → return. Persistence failure = STOP.
  Exact identity over 16 fields (mission, pass, stage, provider, model, explicit schema id + structural JSON-Schema
  fingerprint, system-prompt hash, user-content hash, document, candidate, source-context hash, algorithm and prompt
  versions); never by ordinal, section, batch number or candidateRef. A present-but-invalid record **fails closed**;
  any identity change is a **miss**. Replay re-validates the stored payload with the current Zod schema and returns
  the original telemetry so production's own cost bookkeeping equals the uninterrupted run.
- `scripts/phase-3-601-hd4-resume.ts` — the ONE resumable orchestration (`resumablePassA`) used by both the paid run
  and the certification: per-call replay → production dual pass → HD-3 ensemble persistence (unchanged) → resume.
  A usable persisted ensemble is resumed with no Pass-A caller constructed; an unusable one is never resumed.
- Pass B: the audit found the previous harness's per-shard files were **not** replayable (they lacked the
  `inventoryDispositions` a `ShardExecutionResult` needs). `durableShardExecutor` now wraps the production executor
  and persists every terminal reusable outcome by `shardHash`; `DurableShardStore.loadPriorResults` feeds the
  existing `priorShardResults` contract on restart. Shard semantics unchanged.
- Verifier: `durableVerifierCallers` — the same primitive for semantic review and condition suspicion.
- Guard: `Guard.recordReplay()` decrements remaining logical work and charges $0; historical cost is reported
  separately; Pass-B tokens of shards already in the store are excluded from paid remaining work.
- `scripts/phase-3-601-hd4-run.ts` — the restart-safe paid run for the next mission (refuses to start without
  `HD4_PAID_RUN_AUTHORIZED=1`; not executed here).

## Proof

- Crash matrix A–F over the real `runDualPassSemanticInventory` (synthetic I35 at batchChars 600 = 6 batches + 1 gap
  per pass, the 6.01 shape) with a kill switch: persisted calls replay, the interrupted call executes, no persisted
  call re-executes, result equals the uninterrupted control, replays cost $0, ordering deterministic. Pass 2's
  byte-identical prompts are never served from pass-1 records.
- **Real SIGKILL**: a single node child process persisted 5 calls, was SIGKILLed, relaunched: 5 replayed, 9 live,
  hash and projection equal to control; a third launch resumed the ensemble with zero calls.
- Corruption: truncated file, payload/record hash mismatch, schema-rejected payload, version mismatch, planted
  identity → fail closed. Changed prompt / source / model / schema id / schema structure / prompt version /
  algorithm version / pass / candidate / document / mission / user content → miss.
- Pass B G/H, verifier I/I′, cost accounting 10 logical = 6 replayed + 4 live (guard prices 4).
- 42 new tests, all passing; full suite 106 files / 161 tests failing, zero new failures against the 107/162
  baseline; tsc 6 pre-existing errors; lint clean; build passes.

## Next paid mission

Gateway balance $19.034126 ≥ the $15.84 cap: **no additional funding required.** The $4.732104 charged at
`5bd15c2` is historical; nothing from that run is reused. Cumulative Section 6.01 spend remains $13.525078.

# Final restart-safe paid run (artifacts 74-88)

**Verdict (pinned finalizer, 87): `PHASE3_601_NOT_SAFE`** — 18/21 conditions; $8.553656 spent in one launch, zero
restarts, zero replays needed; Phase 3 not closed, Phase 4 not started.

## The run

Mission `phase-3-final-601-final-paid`, evidence `tests/fixtures/unseen-packages/phase-3-final-601-final-paid`.
Preflight (74/75): SHA `e6baf51` exact, lib tree identical to the HD-4 certification, HD-4 gate 21/21, certified
imports verified, conservative $15.8309 ≤ $15.84, balance $19.034126. The certified restart-safe runner completed
in a single launch: Pass A 14 live / 0 replayed calls ($5.75), both passes `INVENTORY_COVERAGE_GAP` with 289
items each, ensemble 326 canonical, persisted and reloaded (hash + structural equality), F-7C.1 resume proof
`RECORDED_SOURCE_CONTEXT_HASH`. Production chose **SHARDED / OVERSIZED_ATOMIC_UNIT, 3 shards** (not the
historical six-shard assumption). Pass B ($2.46): 2 shards `SHARD_MISSING_CONTEXT`, 1 `SHARD_COMPLETE`, all three
persisted durably; compile `PARTIAL`, 60 rules / 1 definition / 4 shared capacities. Global Pass C: 326
inventoried, 319 material, 283 represented, 6 intentionally non-computational, 23 unsupported, 9 ambiguous, 5
missing (4 CRITICAL), 50 material quantitative values / 5 missing, 0 dangling refs, `semanticallyComplete=false`.
Verifier ($0.34): review invoked (deterministic routing), `MATERIAL_DISCREPANCY`, 10 findings (7 MATERIAL, 1
UNCERTAIN, 2 NON_MATERIAL). Gateway-confirmed spend $8.553656; $10.480470 remains.

## Why it is NOT_SAFE

The hard trust gate fails on measured counters: **distinct owned lineage lost = 317** (every owned material item
of the two `SHARD_MISSING_CONTEXT` shards — production disclosed this as PARTIAL/MISSING_CONTEXT), owned values
lost = 5, contextual ownership-credit violations = 2 (counted conservatively). Silent counters are all zero:
no silent omission, no silent CRITICAL miss, no hallucination, no hidden failure, no silent quantitative
corruption. Every failure is disclosed by production itself.

## Two harness defects discovered during scoring (88)

- **HD-5 (scorer, not patched):** the pinned scorer parses a source "50%" as 50 while Pass A normalizes it to
  0.5, so every percent — and a reference span cut before "million" — is flagged as a contradiction. Six of eight
  items are therefore `FOUND_BUT_INCORRECT` and "incorrect authoritative CRITICAL claims" reads 2. The IR values are
  verbatim the source values. Per §27 the scorer was not patched; 83/84/85/87 stand as produced. A reading of the
  same frozen evidence without the artifact gives CRITICAL 2 represented + 2 explicit limitation, MATERIAL 3 + 1,
  0 incorrect, 0 silent — recorded in 88 as diagnostic, not verdict.
- **HD-6 (finalizer, read-shape only):** the finalizer expected `contextualEmissions` as a list; production
  exposes a count. Fixed only to read the real shape, conservatively (unowned emissions count as violations
  whether or not demoted). Without it no 85/87 could be written; it can only make the gate stricter.

Under §27 either defect also supports `PHASE3_601_HARNESS_DEFECT`; the pinned finalizer's `PHASE3_601_NOT_SAFE` is
reported because the trust gate fails on production-measured counters independently of both.

## Regression

106 / 161 failing, zero new against the 107/162 baseline; targeted HD-4, F-7C.1, F-7C, shard planner/stitcher,
semantic compiler, semantic verifier, operative-state suites clean; semantic-accountability's 18 failures are all
inside the baseline. tsc 6 pre-existing; lint clean; build passes. Zero production files changed.

## Cumulative Section 6.01 spend

$13.525078 prior + $8.553656 = **$22.078734**.

# PHASE 3 / 6.01 TRUST-FAILURE REMEDIATION (89-103) - zero-cost forensic + deterministic fix

Starting SHA `51fda653190d6859096be145245406b1c9329c58`. Zero paid calls, $0 spend. The paid evidence
(`tests/fixtures/unseen-packages/phase-3-final-601-final-paid`) and artifacts 74-88 are untouched (89 hashes them).

## What actually failed (90/91/92)

Exactly ONE rule per failed shard carried `sufficiency: MISSING_CONTEXT`, and that single rule escalated the whole
shard (bounded composition -> `SHARD_MISSING_CONTEXT` -> every owned material item unresolved at stitch: 52 + 265 = 317).

- **Shard 0** (`6.01(b)(1)(X)`): Sections 2.18/2.19/2.22 are each indexed twice (a table-of-contents entry plus the
  body section). The planner's strict resolver marked them AMBIGUOUS and excluded them; `getOperativeProvision` and
  the context-scoped `getReferencedProvision` refused; only the absolute route resolved and it served a 39-47 char
  heading. Root cause `RETRIEVAL_ROUTE_PRESENT_BUT_NOT_USABLE` + `PLANNER_OMITTED_REQUIRED_LOCAL_CONTEXT`.
  Contributing: 25 parent propositions consumed 8,855 of the 10,000 context chars ahead of every referenced term.
- **Shard 1** (`6.01(b)(32)`): "Available Amount" is defined by a *forwarding* declaration ("has the meaning assigned
  to such term in Section 6.08(a)(3)"). The detector accepted only means / shall mean / shall have the meaning, so
  the term was not indexed; planner NOT_FOUND, `getDefinition` refused, the model concluded "not defined anywhere".
  Root cause `PLANNER_OMITTED_REQUIRED_DEFINITION` + `RETRIEVAL_ROUTE_PRESENT_BUT_NOT_USABLE`. Its second claim
  ("Not Otherwise Applied" not defined) was false: indexed, retrievable, budget-starved.
- **OPERATIVE_STATE_UNRESOLVED** (shard 0): the validation harness passed `operativeState: null`; the tools treat an
  uncovered document as UNKNOWN_SUPERSESSION_STATUS, so every successful section read returned
  `evidenceUnresolved=true`. `OPERATIVE_STATE_WIRING_WRONG` in the harness; production's orchestrator already
  computes the state. Not causal for the shard status.
- **Oversized shard 1** (69 units, 29,414 chars, 270 items) was structural: must-link groups closed over their whole
  ordinal RANGE, so five 2-4 member SHARED_CAP groups fused ordinals 12..80; 57 units (18,857 chars) were adjacency
  victims. Causal for context starvation (58 unresolved entries, 8 PARTIAL rules), not for the MISSING_CONTEXT trigger.

29 recorded requests in total: 16 definitions, 12 source units, 1 operative-state fact; 3 invalid/false (2 external
document, 1 false claim). Root-cause counts are in 90.

## Red baseline (94) and closure (96/97/98)

`tests/contract-model/phase-3-601-remediation-red-baseline.test.ts` replays the frozen pre-fix plan (hash-verified
against the paid run) and the three persisted shard records through the real stitcher: 2 MISSING_CONTEXT shards,
317 unresolved, 5 values lost, 5 material misses (4 CRITICAL). It stays red-for-the-record forever.

`tests/contract-model/phase-3-601-remediation-closure.test.ts` runs the remediated production layers over the same
frozen inventory: all 29 old requests are supplied (2 planner context), retrievable through a confirmed-current
production tool route (24), disclosed as a defined variant (1) or proven external to the package (2) - **still
unresolved 0**. The scripted faithful projection gives ownedValuesLost 0, distinctOwnedLineageLost 0,
contextualOwnershipCreditViolations 0, sourceUnverifiableAuthoritativeIr 0, silentIncompatibleMerges 0,
newDanglingRefs 0. The paid `contextualOwnershipCreditViolations = 2` was an audit-counter defect (detection counted as
credit; re-stitching proves 2 detected/demoted, 0 credited). The old shard records are rejected by identity under the
new plan (§22).

## Production remediation (95) - general, minimal

Planner v2 (`semantic-compilation-shards.v2`): member closure of must-link groups, sentence-continuation links,
resolver-backed section context with descendants text, forwarding-aware term context, dependency-first priorities
with fair-share admission per kind, compositional multi-slice rendering with provenance gap markers. Definition
detector: "has the meaning" FORWARDING declarations with typed targets; nested declarations never cut the enclosing
definition. Reference resolver: `RESOLVED_WITHIN_ENUMERATION_RUN` for restarted enumerations. Tools: degenerate
duplicates fall through to the generic resolver, `getDefinition` follows a forwarding declaration one bounded hop, a
plural citation is refused with a disclosed variant pointer (OPEN-2 invariant kept). `contextualEmissionsCredited`
added to execution metadata. No limit raised; Pass A, stitcher trust rules, Pass C, verifier thresholds and the
reference set untouched. 6.01 now plans as 6 shards, none oversized, none ending mid-sentence, within the unchanged
default budget.

## HD-5 / HD-6 (99/100/101)

Shared numeric module: percents as fractions, money scaled, unit-aware, truncation-safe. B6's frozen span ends inside
"$360.0 million" ("...$360.0 milli") - recorded as REFERENCE_SET_ERROR, span preserved. CORRECTED_DIAGNOSTIC_SCORE
(101): CRITICAL 2 correct + 2 explicit limitation, 0 incorrect, 0 silent; MATERIAL 3 + 1, 0, 0. Diagnostic only; 87's
`PHASE3_601_NOT_SAFE` stands. The finalizer reads the canonical shape through one reader; a missing counter is
NOT_MEASURABLE, never 0.

## Regression (102) and gate (103)

Full suite 106 files / 161 tests failing - the identical set as the previous run (0 new, 0 fixed); targeted suites
clean except the baseline semantic-accountability/DB failures; tsc 6 pre-existing; lint clean; build passes.
Gate: 20/20 - **PHASE3_601_REMEDIATION_READY_FOR_PAID_REVALIDATION**. Phase 3 not closed; Phase 4 not started; no paid
revalidation authorized by this mission.

## Post-remediation paid revalidation (104-117)

Resume-first: the exact persisted Pass-A ensemble of the failed paid run was verified from the object itself
(326 canonical items, frozenContentHash `88e7419f…`), accepted by the certified source-bound resume gate through
`RECORDED_SOURCE_CONTEXT_HASH`, and reused with **zero new Pass-A provider calls**. §6 is answered behaviourally, not
textually: a detached worktree at the pre-remediation SHA and the current tree each derive their own source context,
slot partition, batching, system prompt and all six per-batch user contents, and every one is byte-identical, so the
remediation changed no Pass-A semantics (105).

The corrected topology planned exactly as the zero-cost mission predicted - 6 shards, 0 oversized, max primary 11,801
chars, max 16 units, 0 mid-sentence, 0 unowned, 0 multiply owned - under a new plan identity, and the old run's durable
store yields 0 accepted records (107). Cost was priced for resumed work only; the cap was the conservative estimate
rounded up ($7.97), above the mission's recommended $6.00 ceiling, and actual spend was $4.419228 (108, 109).

**The run did not pass.** 5 of 6 shards completed - including both shards that failed before - but one new shard
(`shard:86cc5e439f113d6053a9`, 98 owned material items) returned SHARD_MISSING_CONTEXT, and four of the dependencies
its MISSING_CONTEXT rule recorded (`Fixed Incremental Amount`, `Voluntary Prepayment Incremental Amount`,
`Ratio Incremental Amount`, `Extension Amount`) are among the 29 that artifact 96 certified closed by bounded tool
route. The routes exist and still resolve deterministically; the model did not use them within the shard's tool budget.
Existence of a retrieval route is therefore not the same property as retrieval under budget - the gap this run exposes.

Trust counters are all MEASURED, none guessed: 12 of 14 are zero, but owned values lost = 2 and distinct owned lineage
lost = 98 (the unresolved shard's items), against 5 and 317 before. Contextual emissions: 3 detected, 0 credited.
Source-unverifiable authoritative IR 0, silent incompatible merges 0, dangling refs 0, authoritative hallucinations 0.
Corrected (HD-5) score: CRITICAL 1 represented + 3 explicit limitation, 0 incorrect, 0 silent; MATERIAL 0 + 4, 0, 0.
B6 remains REFERENCE_SET_ERROR with its span preserved. The one operative-state flag is traced to the model emitting
IR definitions for `incur`/`incurrence`, which are not defined terms - not the previous run's harness wiring (112).

Verdict **PHASE3_601_REMEDIATION_FAILED** (18/24). Phase 3 not closed; Phase 4 not started.
