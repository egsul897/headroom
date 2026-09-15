# F-7C — Production activation of bounded sharded compilation

Starting SHA `c9b28224e118f6a5e54f99da88715da110ad7dee`. Zero paid calls, $0.
No whole-Chewy rerun. Phase 4 not started. **Phase 3 is not closed** — the
next and final Phase-3 mission is the integrated Chewy validation through this
activated path.

## What changed

`compileCovenantToIR` is still the only public compiler entry point and
callers never choose a mode. After Pass A has frozen the inventory, the
certified planner derives the unit's semantic source units and one
deterministic function — `selectCompilationExecutionMode` in
`execution-mode.ts` — asks a single architectural question: *can this unit be
one normal bounded shard under the certified window budget?*

| Planner outcome | Mode | Reason |
|---|---|---|
| exactly one shard, not oversized | `MONOLITHIC` | `SINGLE_BOUNDED_SHARD` — the pre-F-7 path runs unchanged |
| more than one shard | `SHARDED` | `MULTIPLE_SHARDS_REQUIRED` |
| any oversized atomic unit | `SHARDED` | `OVERSIZED_ATOMIC_UNIT` — isolated, flagged, never token-cut |
| accountability disabled | `MONOLITHIC` | `ACCOUNTABILITY_DISABLED` — nothing to plan from |

No agreement name, section number, character count, definition count or
covenant-family list enters the decision, and there is no
try-monolithic-then-shard: F-7's finding is that knowingly sending an
unbounded unit into one conversation *is* the defect.

### Production files (all under `lib/contract-model/compiler/semantic/`)

| File | Change |
|---|---|
| `bounded-composition.ts` (new) | The ONE model-call → transport normalization → `normalizeSubmission` → `validateCompilationUnit` → failure-reason primitive, extracted verbatim from `compile.ts`. The monolithic unit and every shard use it. |
| `execution-mode.ts` (new) | `selectCompilationExecutionMode`, `SEMANTIC_EXECUTION_POLICY_VERSION`, `executionPolicyIdentity`. |
| `shard-executor.ts` (new) | The per-shard adapter: `buildShardCompilerInput` → `compileBoundedComposition` (Pass A/Pass C off — the certified F-7B run shape) → `classifyShardStatus`. Never calls `compileCovenantToIR`. |
| `compile.ts` | Orchestration only: cache → source context → Pass A once (or resume a frozen inventory) → plan → mode → monolithic primitive **or** `executeShardPlan` → stitcher → global Pass C → whole-unit signals → one `SemanticCompilationResult`. |
| `shard-execution.ts` | Explicit reuse contract (below); `sourceRegions` forwarded to the stitcher so the third attribution proof class is available. |
| `cache.ts` | Optional third argument: the execution-policy identity. Two-argument callers get the byte-identical key they always had. |
| `types.ts` | Additive `execution` metadata on the result. |
| `index.ts` | Exports. |

Untouched: planner, stitcher, definition-source-anchor, transport
normalization, caller, prompt, normalize, wire schema, Pass A, Pass C,
verifier, IR.

## The decisive proof: the certified canary through the production path

`01-chewy-production-route-replay.json`. The frozen Chewy 1.01 input was
handed to the public `compileCovenantToIR` with a semantic caller, a Pass A
caller and a shard executor that each **throw if reached**; the frozen
inventory was resumed by content hash and the 36 certified terminal results
were offered by exact `shardHash`.

- mode `SHARDED`, planHash `67d9f086…cfe36` reproduced, 36 planned
- **36 reused, 0 executed, 0 semantic calls, 0 Pass A calls, 0 executor calls**
- rules 17 / definitions 487 / shared capacities 1
- definition conflicts 5 / variants 10, all review-required
- global Pass C over 108 material: 64 / 2 / 26 / 0 / 16 — 85.19%
- attribution 368 / 47 / 118 / **NONE 0**
- every F-7B.3D trust count 0
- canonical IR, accountability, conflict evidence and unresolved-item list
  **hash-identical** to the certified stitcher over the same 36 results

`02-certified-vs-activated-differential.json`: 40 trust-significant fields
`equal`, 4 `intentionally_additive`, **0 mismatches**. The additive rows: the
whole-unit layer adds `SEMANTIC_INVENTORY_COVERAGE_GAP` (the frozen inventory's
own status, which the harness never applied) on top of the certified stitch
reasons; status stays `PARTIAL` (the stitcher's status is the floor and can
only be demoted); the cache key folds in the execution identity; telemetry is
the honest aggregate.

## Ordinary bounded units are unchanged

`03-monolithic-differential.json`: an 8-scenario scripted matrix (success,
schema failure, transport failure, MISSING_CONTEXT, unresolved operative
evidence, accountability on with skipped Pass A, a real small structural
corpus, dangling dependencies) run in a worktree at the starting SHA and on
the activated tree — the normalized projection of every semantic field is
**byte-identical** (21,364 bytes). Every scenario selects `MONOLITHIC`.

## Shard reuse contract — what costs money again

A `shardHash` covers the shard's primary source, owned items, every context
entry's full-text hash, the frozen inventory hash and the compiler generation,
so re-running an identical shard shows the model nothing new.

| Prior status | Reused by hash? |
|---|---|
| `SHARD_COMPLETE` | yes |
| `SHARD_MISSING_CONTEXT` | yes — terminal; its reasons travel into the stitched result |
| `SHARD_PARTIAL` | yes — same |
| `SHARD_SCHEMA_FAILURE` | yes — a re-run of the identical input is a paid favourable-draw retry |
| `SHARD_PROVIDER_FAILURE` | **no** — transient; re-executed under the bounded policy (default 2 attempts) |

The way to change a terminal result is to change its input, which changes its
hash. Each status is tested through the production entry
(`tests/contract-model/f7c-production-activation.test.ts`, §29).

## Cache identity

The mode is only known after Pass A — after the cache lookup — so the
execution-policy identity (policy version + planner algorithm + effective
budget, plus the hash of any resumed frozen inventory) enters the outer key
up front. A pre-activation monolithic entry can never satisfy a request the
policy now routes `SHARDED`; a budget or policy change invalidates sharded
entries the same way. `SEMANTIC_COMPILER_ALGORITHM_VERSION` was deliberately
**not** bumped: it is folded into every shard hash, and bumping it would have
changed the certified planHash the equivalence gate requires. The outer key
extension gives the same invalidation without touching shard identity. A
sharded result with any provider failure is returned in full but not cached,
mirroring the monolithic transport-failure rule.

## Whole-unit signals, status and telemetry

The stitcher's status/reasons are the floor. The orchestration layers on the
signals that belong to the unit rather than to any one conversation —
context-bundle operative-evidence flag, stale-definition re-check over the
stitched definitions, a whole-unit definition-completeness pass, source-context
truncation, inventory status, support review — and can only demote
(`COMPLETED` → `REVIEW_REQUIRED`). Global Pass C, computed once by the
stitcher over the full frozen inventory and the stitched canonical IR, is the
completeness authority; conflict evidence earns no credit.

A sharded compile is many conversations: `rawModelOutput` is `null`,
`toolCallLog` is `[]`, and `execution.sharded` carries per-shard status,
attempts, reuse, failure reasons and telemetry with an explicit note.
`telemetry` is the honest sum (attemptCount = shards executed, retryCount =
provider-failure retries).

## Tests

`tests/contract-model/f7c-production-activation.test.ts` — 26 tests, all
provider-free: §25 boundary A–H, §26 Pass-A call count (SINGLE and DUAL,
sharded equals monolithic; resumed inventory makes zero), §27 Pass-C authority
(missing item despite a sibling's contextual emission; conflict variant
preserved with no credit), §28 failure isolation and bounded retry, §29 reuse
per status, §30 invalidation (source byte, context reader, inventory hash,
budget), §31 outer-cache safety, §34 operative-state, §36/§37 telemetry.

## Artifacts

| File | What it is |
|---|---|
| `00-current-vs-target-path.json` | §2 audit: current path, target path, exact branch point |
| `01-chewy-production-route-replay.json` | §22/§43 the zero-cost production-route replay |
| `02-certified-vs-activated-differential.json` | §44 field-by-field classification |
| `03-monolithic-differential.json` | §24 starting-SHA vs activated projection |
| `04-regression.json` | §45/§46 suites, failing-set diff, build |
| `05-f7c-gate.json` | §48 the 28-point gate |
