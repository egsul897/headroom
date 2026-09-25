# Architecture audit - findings with code citations

Scope: the mission's Parts III-VI, X, XIV (structure, discovery, operative source, context, compiler path, execution)
plus the Pass A addendum. Each finding names the file that proved it and the file that fixes it. Measurements are
offline (zero provider calls) over the sealed CONMED population and the preserved run-original evidence.

## Findings

| # | finding | evidence | fix |
|---|---|---|---|
| F1 | The semantic call ran an autonomous 12-turn tool loop that re-sent the growing transcript every turn (`compiler/semantic/caller.ts`, `maxTurns = maxToolCalls(8) + MAX_TURN_OVERHEAD(4)`); a 67-char candidate billed ~666k input tokens. | run-original telemetry | `compiler/semantic/bounded-caller.ts`: one structured call, at most one deterministic-retrieval refinement, single-message requests; `bounded-execution.test.ts`. |
| F2 | Retries had three owners (SDK `maxRetries: 2`, `withRetry` x5 on 429, shard retry x2) and the harness timeout did not cancel the request. | `analyzer/anthropic-analyzer.ts`, `compile-run.ts#callerFor` | `analyzer/transport-retry.ts` (one owner), `maxRetries: 0` everywhere, `analyzer/deadline.ts` AbortSignal through every request, `shardMaxAttempts: 1`. |
| F3 | Every non-Opus model was priced as Sonnet (`telemetry.ts#rateCardForModel`): $3.52 reported for a $0.21 DeepSeek call. | 7.8 telemetry | `analyzer/pricing.ts` per-model rate cards, `UNKNOWN_MODEL` -> null. |
| F4 | The inventory mode came from `SEMANTIC_INVENTORY_MODE` in the environment (`dual-pass.ts#resolveSemanticInventoryMode`). | code | `compiler/certified-config.ts`: explicit `inventoryMode` (DUAL_PASS_ENSEMBLE certified), identity in the cache key; `architecture.test.ts` bans `process.env` in certified modules. |
| F5 | A verifier finding's owner id was taken verbatim from the model (`reviewer.ts#normalizeWireFinding`): 7.16(a) cited `rule[r1].condition[1]`, 7.6(b) cited two ids joined by a comma. | run-original evidence | `semantic-verification/finding-owner.ts`; `finding-owner.test.ts` regressions on the real shapes. |
| F6 | `IRRule.sourceContentVersion` was null on every unit ever emitted. | run-original evidence (all 104 records) | `covenant-map/source-content-version.ts`, stamped by `covenant-map/pipeline.ts`. |
| F7 | Sharding was common, not rare: `shard-planner.ts#deriveUnits` made every expansion region an owned `EXPANSION_REGION` unit and `packBlocks` flushes on region change. Offline: 53 of 161 non-empty CONMED candidates would plan >= 2 shards (28 x2, 4 x3, 9 x4, 9 x5, 3 x7). | `scratchpad/measure-sharding` replay (deterministic) | `expansionRegionPolicy: CONTEXT_ONLY` in the certified config; `compile.ts#accountabilityContext`; the golden 7.02 (with a cross-reference) is MONOLITHIC. |
| F8 | Context retrieval was almost never SUFFICIENT: 62 BUDGET_EXCEEDED, 39 REVIEW_REQUIRED, 2 INCOMPLETE, 1 SUFFICIENT of 104; any LOW-severity disclosure demoted sufficiency (`pipeline.ts#computeSufficiencyState`), and VERIFIED status requires SUFFICIENT (`verify.ts#determineStatus`). | run-original bundles | LOW no longer demotes; MEDIUM -> REVIEW_REQUIRED. OPEN: BUDGET_EXCEEDED (maxCrossReferenceDepth 3 / maxItems 60 / 40k chars) remains the dominant state for real sections; the budget semantics were not changed in this mission. |
| F9 | A section's own label ("SECTION 7.01") was detected as a cross-reference to itself and expanded as a region (14 of 104 bundles). | run-original bundles | `reference-context.ts`: self / ancestor references are not dependencies. |
| F10 | Every amendment lead carried `OPERATIVE_STATE_UNRESOLVED` even when the instrument's operative state had RESOLVED that section with that document's effect; the candidate then failed `OPERATIVE_STATE_UNRESOLVED`. | `cross-document-context.ts#AMENDMENT_LEAD_EVIDENCE_STATE` | `resolvedProvisionFor`: a RESOLVED provision view proves the lead CURRENT. |
| F11 | The compiler compiled the BASE node's text even when the operative state said the amended text governs, and the verifier then flagged the base node KNOWN_SUPERSEDED. | golden 7.02 before the fix | `candidate-span.ts#resolveOperativeSource` (OPERATIVE_STATE_CURRENT_TEXT), `source-context.ts`, `verify.ts`; golden proves the amended text is compiled. |
| F12 | `p3-candidate-evidence.v1` did not record execution mode, source context, provider error or per-call Pass A usage; the sharding and Pass A questions could not be answered from evidence. | evidence records | evidence v2 (`execution`, `sourceContext`, `certified`, `passA`, `providerError`, `qualitativeLineage`). |
| F13 | Pass A: 128k generic ceiling, provider-default reasoning, unbounded schema, exhortative prompt, no per-call telemetry (P3-E10..E14). | benchmark recovery side calls | `inventory-policy.ts`, bounded `wire-schema.ts`, prompt v6, `StageCallOptions.execution`, call records; `07-pass-a-root-cause.md`. |
| F14 | The pilot assembled its own compiler input (`compile-run.ts#buildInput`) and the SINGLE_PASS compile path partitioned slots without the structural index while DUAL_PASS used it. | code | pilot delegates to `covenant-map/candidate-input.ts`; `compile.ts` passes the index in both modes. |

## Part-by-part audit

- **III Structure / authority**: `stage-structure.ts` + `structural-index.ts` remain the single structural authority
  (nodeId = physical occurrence identity). Unchanged; the map's `sourceOrder` and `structuralNodeId` come from it.
- **IV Discovery**: `discovery/pipeline.ts` is recall-first (deterministic signals + per-SECTION semantic pass +
  neighbourhood + reconcile). The map consumes `DiscoveredCandidate[]` as an input population; ineligible roles are
  explicit unresolved items. Discovery is a paid call and was not re-run.
- **V Operative source**: F9, F11, F14 above; one builder, architecture-tested.
- **VI Context**: F8, F9, F10; `buildCovenantContextBundle` is the only bundle builder; the map derives PROVISO /
  CONDITION / PARENT_SCOPE / CROSS_DOCUMENT edges from bundle items.
- **X Compiler path**: `covenant-map/pipeline.ts#compileCandidateToVerifiedIR` -> `compileCovenantToIR` (Pass A dual,
  bounded Pass B, Pass C) -> `verifyCompiledCandidate`; one deadline, one budget, callers wrapped to observe fatal
  provider errors (the compile path itself never throws).
- **XIV Execution**: F1-F4, F13; telemetry separates conversations, transport attempts, shard attempts, usage and
  cost, and now reasoning vs visible tokens where reported.

## Phase 4 boundary

`git diff --stat e9f6b97 -- lib/contract-model/verified-units lib/contract-model/verified-execution lib/contract-model/runtime`
is empty. No verification-gate, identity-check or exprId semantics were touched.
