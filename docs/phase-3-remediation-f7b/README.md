# Phase 3 Chewy remediation - F-7B: real Chewy 1.01 sharded compiler canary (paid, hard-capped)

Starting SHA `8b6bd445ae56bb6d66406706d76b45a83ac690be`. Paid model calls: 17 turns over 5 shards, **$2.6322** (Stage 1 cap $3.00,
mission cap $15.00). Stage 2 not executed. Chewy not rerun. Verifier not run. No production module changed.
Verdict: **F7_NEEDS_ARCHITECTURAL_ITERATION** (Stage 1 gate failed on pre-registered points 3 and 10).

## What happened
The F-7A plan reproduced exactly at the starting SHA (planHash `67d9f086...`, 36 shards, 108/108 material items owned once,
planner max 30,562 / rendered max 34,344 tokens, one oversized atomic definition) - `00-precheck.json`, `01-frozen-plan.json`.
Scorer, gates, cost estimator, window envelope and the Stage 1 selection (5 shards chosen on structural dimensions only:
ordinals 2, 17, 21, 26 (oversized), 27) were frozen and committed before the first call - `02-scorer-and-gates.json`,
`03-stage1-selection.json`.

All five Stage 1 shards ended **FAILED / SHARD_SCHEMA_FAILURE (MODEL_SCHEMA_FAILURE)**: the model's terminal
`submit_compilation` tool input carried the top-level arrays (`definitions`, `sharedCapacities`, `irExtensionCandidates`,
`overallNotes`, and in 3 of 5 shards `inventoryDispositions`) as **JSON-encoded strings** instead of arrays. The production
wire schema (`semantic/wire-schema.ts` `SubmitCompilationSchema`) accepts only real arrays and has no string tolerance, so
the caller classified every submission as a schema failure and returned 0 rules / 0 definitions per shard. Every failure was
explicit: per-shard status recorded, the stitched candidate is FAILED, all 108 material items are listed as unresolved,
global Pass C reports 108/108 material items MISSING_FROM_COMPOSITION, and no trust check fired (`04`, `09`, `10`).

This failure mode had never been observed before: the recorded monolithic Chewy 6.08 submission carried real arrays, and no
fixture in the repository contains a stringified array. It appeared on 5 of 5 shard-shaped inputs (definition-heavy,
owned-inventory-only, read-only context regions) with the same model and prompt. Its exact trigger (input shape vs.
provider-side model drift since 2026-09-03) cannot be established without further calls and is not claimed.

## Classification of the defect
- **Where:** the compiler submission protocol (production `caller.ts` + `wire-schema.ts`), i.e. the wire-tolerance layer
  between the model's tool input and the parser. Not the planner, ownership, must-link, context construction, stitcher,
  Pass C or the IR.
- **What the content was:** `13-diagnostic-stringified-submissions.json` (DIAGNOSTIC ONLY, never scored or stitched) parses
  the stringified fields and runs the production normalizer, IR validator and per-shard reconciliation on the SAME content:
  every one of the 5 submissions validates; they carry 6 / 22 / 21 / 2 / 21 definitions, all scoped to the shard's own
  terms (0 definitions outside owned units, 0 lineage claims on unowned items in every shard); the owned material items
  would have been 13 REPRESENTED + 11 dispositioned (UNSUPPORTED) + 4 MISSING of 28 (85.7% accounted). This is what the
  canary could not prove because the protocol layer rejected it.
- **Why not fixed here:** mission §2/§28 - one root cause per mission, no fix-and-test in one experiment. The remedy is a
  small, generic wire-tolerance change (accept a JSON-encoded string for an array-typed top-level field, parse it, then
  validate as today; reject anything that does not parse), plus a synthetic test - a zero-cost production change for a
  follow-up mission, after which this canary can be re-run under the same frozen plan.

## What the run did establish (real numbers, `10-cost-window-summary.json`)
| | value |
|---|---|
| largest single turn, normal shards | 49,649 input tokens (envelope 60,000; 0 violations) |
| largest single turn, oversized shard (26,695-char atomic definition) | 46,151 input tokens; 30,906 output over 2 turns; inside provider limits; no truncation |
| peak window vs monolithic 312,143 | 84.1% reduction |
| per-shard output max / median / p95 | 42,224 / 27,697 / 42,224 tokens; max single turn 28,215; none near the 128k ceiling |
| total input over 17 turns | 633,487 tokens = 2.03x the monolithic first turn; fixed overhead 43.9% of it |
| mean cost per shard | $0.53 (pre-registered estimates $0.27-$0.61; actual/estimate ratios 0.55-1.76) |

The F-1 protocol's provisional-submit-then-nudge loop is the dominant cost driver: 2-5 turns per shard, each re-sending the
whole context, so per-shard total input reaches 217,357 tokens even though no single turn exceeds 49,649.

## Zero-cost proofs carried out after the run
- `11-invalidation-simulation.json`: one source byte in one definition invalidates only its owner shard (1 of 36; the
  mutated definition has no context readers), 35 shards keep their hash; an inventory-hash change invalidates all 36.
- Isolation: no real transport failure occurred; the F-7A §19 E/F mock tests (5) pass (`10`, isolation section).
- Production diff since the starting SHA: none (`12-final-gate.json` point 16).

## Verdict logic
Stage 1 gate (pre-registered, `04-stage1-results-and-gate.json`): points 1, 2, 4-9 pass; point 3 (zero protocol defect)
fails on 5/5 shards; point 10 (real recovery) is exactly 0/28. Per mission §9 the run stopped before any Stage 2 spend.
Trust was never violated (all nine §24 checks are 0), so F7_NOT_SAFE does not apply; the provider executed normally, so
F7B_ENVIRONMENT_BLOCKED does not apply; cost never bound. The honest verdict is **F7_NEEDS_ARCHITECTURAL_ITERATION**, with
the iteration located in the submission protocol layer, not in the sharding architecture, whose five canary questions
remain UNPROVEN (not disproven). No production activation was performed.
