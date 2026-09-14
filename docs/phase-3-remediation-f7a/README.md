# Phase 3 Chewy remediation - F-7A: large-unit compiler window + cost concentration (zero-cost architecture proof)

Starting SHA `9b4c10bf7844f2966cb4c19dac90ee5fe6d9a7c5`. Zero paid model calls, $0.00. Chewy not rerun. Nothing deployed.
Verdict: **F7A_READY_FOR_PAID_CANARY** (F7_CLOSED is not available by construction).

## What was reproduced (`00-current-large-unit-shape.json`)
The first turn of every frozen Chewy 1.01 unit was re-rendered byte-exactly by the current caller with a capturing fake
client. Chewy 1.01 (the whole definitions section, 379 definitions, 353,523 source chars) renders to 888,779 chars
(~312k recorded input tokens). The operative text is rendered twice: once as the region and once as the context bundle's
OPERATIVE_SOURCE item. A complete answer would need ~949k output tokens against a 128k ceiling. The recorded attempt
emitted 60,318 output tokens, then a protocol error on the continuation turn lost the entire unit ($2.04, 0 objects).

## Classification (`01-defect-classification-and-budget-evidence.json`)
Earliest defect: **A - UNBOUNDED_INPUT_UNIT** at `compile.ts:217` (the unit of model work is the discovered section,
whatever its size). B (context duplication), C (unbounded inventory rendering), D (single submission), E (output
concentration), F (one failure loses the unit) and G (run-level cost cap blind to per-unit burden) are consequences.
Not solved by raising limits. Bounded property: every call has bounded primary source, bounded read-only context,
owned-items-only inventory and a bounded pre-call output estimate, all computed before any call; global completeness
is decided only by the global Pass C.

## Architecture implemented (provider-free, not wired into any production path)
- `lib/contract-model/compiler/semantic/shard-types.ts` - types, calibrated token estimator (0.3957 tokens/char, conservative), fixed per-call overhead.
- `shard-planner.ts` - units from the structural index (definitions atomic; structural nodes; segments as degraded fallback), ownership (each material item exactly one owner unit), must-link groups (span crossing, shared capacity, expansion-to-referrer), deterministic packing (no unit ever split; oversized flagged), bounded read-only context with provenance (chapeau, parent item, referenced term/section), shard freeze hash, shard compiler input (context rendered as READ-ONLY regions; owned items only; no OPERATIVE_SOURCE duplicate).
- `shard-stitcher.ts` - ownership attribution of emitted objects, lineage scoped to owned items (digest-form ids canonicalized like Pass C), contextual emissions dropped and never credited, explicit collisions (consistent duplicate / conflict -> AMBIGUOUS / possible duplicate / out-of-scope / dangling reference -> UNSUPPORTED + unresolved dependency), globally stable ids derived from the owner unit, global Pass C, status never COMPLETED with an incomplete shard.
- `shard-execution.ts` - generic executor: reuse by shard hash, retry only the failed shard, bounded attempts, thrown executor contained as that shard's provider failure.

## Chewy 1.01 plan at the chosen budget T12k/U16 (`02-chewy-101-shard-plan.json`, sensitivity over 7 budgets)
36 shards; rendered first turn max 34,344 / median 24,837 / p95 30,016 tokens; largest shard inventory 11 items; max
estimated output 41,500 tokens; 1 oversized shard (a single 26,695-char definition, never split); ownership 108/108;
total rendered input 2.87x the failed single call because the ~43.8k-char fixed overhead is paid 36 times.

## Zero-cost historical simulation (`03-historical-simulation.json`)
Chewy 6.08 recorded IR redistributed to 7 shards and re-stitched: nodes, values, rules, definitions, dependency edges
preserved; 18 of 292 lineage refs stripped as minority claims on items owned by another shard (recorded as collisions;
Pass C reports them as missing; status REVIEW_REQUIRED, never COMPLETED). 6 holdout fixtures and a synthetic
400-definition corpus fully preserved. Synthetic tests A-H: 31/31.

## Gate and verdict (`04-gate-evaluation-and-final-summary.json`)
12/12 zero-cost gate points met. Regression: 18 and 24 pre-existing failures unchanged (identical names to the F-4
baseline); tsc 6 pre-existing errors unchanged; eslint clean. The F-4 summary's
`beforeFindingIdsEqualRecordedPostF3Ids = false` is acknowledged as a historical evidence-metadata inconsistency (F-4
artifacts untouched; not carried into F-7A evidence). Not started: F-7B, any model call, any Chewy rerun, Phase 4.
