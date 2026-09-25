/**
 * Phase 3B - the compiler's own public API (task §58): compileCovenantToIR.
 * Orchestrates: cache lookup -> source-context sufficiency + Pass A (frozen
 * inventory) -> deterministic EXECUTION-MODE selection (F-7C) -> either the
 * bounded monolithic composition (bounded-composition.ts: model call ->
 * deterministic normalization -> Phase 3A IR structural validation -> Pass C)
 * or the certified sharded path (shard-planner -> bounded per-shard
 * composition -> shard-stitcher -> GLOBAL Pass C) -> one normal
 * SemanticCompilationResult -> cache write.
 *
 * F-7C PRODUCTION ACTIVATION: production callers never choose a mode. After
 * Pass A the certified planner derives the unit's semantic source units and
 * the deterministic policy (execution-mode.ts) asks one architectural
 * question - can this unit be ONE normal bounded shard? If so the pre-F-7
 * monolithic path runs exactly as before. If the planner needs more than one
 * shard, or the unit is an oversized atomic block, the unit is knowingly
 * unbounded for one conversation and runs SHARDED. No agreement, section,
 * size constant or "try monolithic then fall back" enters the decision.
 *
 * PROPOSED, NEVER APPROVED (task §35): every IRRule/IRDefinition this
 * function returns carries `compilerVersion` set (marking it as a REAL
 * compiler-produced proposal, distinct from a hand-authored V1 fixture or
 * a legacy-adapter translation, both of which leave compilerVersion null
 * per Phase 3A's own convention) - but this function itself makes no
 * claim of human review or verification. Phase 3C (independent
 * verification, not built here) and human review are later, separate
 * gates before anything from this module could be treated as authoritative.
 */
import { getSemanticCaller, type SemanticCaller } from "./caller";
import { InMemorySemanticCompilationCache, computeCacheKey, type SemanticCompilationCache } from "./cache";
import { checkDefinitionCompleteness } from "./completeness-check";
import { compileBoundedComposition, contextBundleEvidenceFlags, hasStaleReferencedDefinition, type AccountabilityFields } from "./bounded-composition";
import { executionPolicyIdentity, selectCompilationExecutionMode, SEMANTIC_EXECUTION_POLICY_VERSION, type ExecutionModeDecision } from "./execution-mode";
import { planCompilationShards } from "./shard-planner";
import { executeShardPlan, type ShardExecutor } from "./shard-execution";
import { createBoundedShardExecutor } from "./shard-executor";
import { validateFrozenInventoryResume, type FrozenInventoryResumeRecord } from "./frozen-inventory-resume";
import { computeSourceContextHash } from "../semantic-accountability/source-identity";
import { normalizeDefinedTermRef } from "../amendment/chain";
import type { ShardBudget, ShardExecutionResult, ShardPlan, StitchedCompilation } from "./shard-types";
import type { SemanticCompilationResult, SemanticCompilationStatus, SemanticCompilerFailureReason, SemanticCompilerInput, SemanticExecutionMetadata } from "./types";
import type { StageCaller } from "../llm-caller";
import type { AnalyzerCallTelemetry } from "../../analyzer/telemetry";
import { resolveSourceContext } from "../semantic-accountability/source-context";
import { runSemanticInventory } from "../semantic-accountability/inventory";
import { resolveSemanticInventoryMode, runDualPassSemanticInventory, type SemanticInventoryMode } from "../semantic-accountability/dual-pass";
import type { FrozenSemanticInventory, SourceContextResult } from "../semantic-accountability/types";
import type { SemanticCompileCallOptions } from "./caller";
import { certifiedConfigIdentity, type CertifiedCompilerConfig } from "../certified-config";

// The helpers below moved to bounded-composition.ts (F-7C) so the monolithic
// unit and every shard share ONE implementation; re-exported here so existing
// importers (package-compile.ts, tests) keep their import path.
export { sanitizeErrorMessage, classifyFailureCategory } from "./bounded-composition";

// Phase 3F.1.4 (P1-1 remediation) - this module-level singleton is used by
// EVERY real current caller that omits `options.cache` (every script under
// scripts/phase-3*.ts, semantic/precedent-integration.ts:217), so its own
// safety is exactly as strong as computeCacheKey's (cache.ts). That formula
// now includes companyId/instrumentKey/sourceDocumentId (see cache.ts's own
// header comment for the full finding and the "flat key vs. per-tenant
// wrapper" design decision) - two different companies' otherwise-identical
// compile requests can no longer collide onto the same entry here, the same
// way they never could for two different candidateRefs. This singleton
// itself was never the defect; the key formula it was given was.
const defaultCache = new InMemorySemanticCompilationCache();

/** F-7C: bounded per-shard retry for genuine provider failure only (one retry - the certified F-7B.3E policy). */
const DEFAULT_SHARD_MAX_ATTEMPTS = 2;

export interface CompileOptions {
  caller?: SemanticCaller;
  cache?: SemanticCompilationCache;
  /**
   * SEMANTIC ACCOUNTABILITY: the provider-abstract StageCaller used for the
   * Pass A inventory call. Defaults to getStageCaller() (env-var driven); a
   * synthetic caller yields INVENTORY_SKIPPED_NO_PROVIDER, disclosed on the
   * result and never mistaken for "nothing material here."
   */
  inventoryCaller?: StageCaller;
  /**
   * F-5.3B: production semantic-inventory mode. SINGLE_PASS = one Pass A execution (the pre-F-5.3B path, kept for
   * tests/diagnostics). DUAL_PASS_ENSEMBLE = two INDEPENDENT Pass A executions over the same resolved source context,
   * reconciled by the deterministic, provider-free ensemble (semantic-accountability/dual-pass.ts) into one frozen
   * support-aware inventory - the candidate authoritative Phase 3 discovery unit. Omitted: the SEMANTIC_INVENTORY_MODE
   * env var, else SINGLE_PASS. Never silently doubles spend: the second paid call exists only under this mode.
   */
  inventoryMode?: SemanticInventoryMode;
  /** F-5.3B (DUAL_PASS_ENSEMBLE): one StageCaller per pass. Defaults to [inventoryCaller, inventoryCaller] when inventoryCaller is given (a stateless caller serves both independent executions), else the env-var-driven getStageCaller() for both. */
  inventoryPassCallers?: [StageCaller, StageCaller];
  /** SEMANTIC ACCOUNTABILITY: source-context budgets (mission §12/§13). Defaults are the layer's own; tests use small caps to exercise TRUNCATED_SOURCE deterministically. */
  sourceContextBudget?: { budgetChars?: number; maxExpansionRegionChars?: number; maxOperativeUnitChars?: number };
  /** SEMANTIC ACCOUNTABILITY: set false to skip source-context sufficiency + Pass A + Pass C entirely (result.accountability === null). Default true. */
  accountability?: boolean;
  /**
   * F-7C RESUME: an already-FROZEN Pass A inventory for exactly this candidateRef (content-hashed, immutable). When
   * supplied, Pass A is not executed again - the frozen inventory is whole-unit truth and freezing it once is the
   * whole point of freezing. The hash enters the outer cache key. A candidateRef mismatch is refused, never silently
   * accepted. Used by resumable orchestration and by zero-cost replay of certified runs; never a way to skip Pass A for
   * a unit that has no frozen inventory.
   */
  frozenInventory?: FrozenSemanticInventory;
  /** F-7C: shard budget override (defaults to the certified DEFAULT_SHARD_BUDGET). Part of the execution identity. */
  shardBudget?: Partial<ShardBudget>;
  /** F-7C: prior per-shard terminal results keyed by shardHash, reused without a call under the explicit reuse contract (shard-execution.ts). */
  priorShardResults?: Map<string, ShardExecutionResult>;
  /** F-7C: total attempts per shard, retried only on SHARD_PROVIDER_FAILURE (default 2). */
  shardMaxAttempts?: number;
  /** F-7C (tests / offline replay only): replaces the production bounded shard executor. Production never sets this. */
  shardExecutor?: ShardExecutor;
  /**
   * CERTIFIED EXECUTION: the explicit configuration (certified-config.ts). When present, the inventory mode and the
   * shard attempt policy come from it - never from the environment - and its identity enters the cache key.
   */
  certified?: CertifiedCompilerConfig;
  /** The candidate's abort signal and hard dispatch budget, threaded to EVERY provider request this compile makes. */
  callOptions?: SemanticCompileCallOptions;
}

interface WholeUnitSignals { failureReasons: SemanticCompilerFailureReason[]; issues: string[] }

/**
 * The whole-unit accountability signals that belong to the UNIT, not to any one bounded conversation. For the
 * monolithic path they are derived inside compileBoundedComposition (unchanged); for the sharded path they are layered
 * here on top of the stitcher's own shard-level + global-Pass-C reasons, so a sharded unit is never judged more
 * leniently than a monolithic one.
 */
function wholeUnitAccountabilitySignals(sourceContext: SourceContextResult | null, frozenInventory: FrozenSemanticInventory | null, accountability: StitchedCompilation["accountability"]): WholeUnitSignals {
  const failureReasons: SemanticCompilerFailureReason[] = [];
  const issues: string[] = [];
  if (sourceContext && (sourceContext.state === "TRUNCATED_SOURCE" || sourceContext.state === "STRUCTURALLY_INCOMPLETE_SOURCE")) {
    failureReasons.push("SOURCE_CONTEXT_TRUNCATED");
    issues.push(`[source-context] ${sourceContext.state}: ${sourceContext.reasons.join("; ")}`);
  }
  if (frozenInventory && (frozenInventory.inventoryStatus === "INVENTORY_FAILED" || frozenInventory.inventoryStatus === "INVENTORY_EMPTY_SUSPECT")) {
    failureReasons.push("SEMANTIC_INVENTORY_UNAVAILABLE");
    issues.push(`[inventory] ${frozenInventory.inventoryStatus}: ${frozenInventory.inventoryStatusReason}`);
  }
  if (frozenInventory && (frozenInventory.inventoryStatus === "INVENTORY_COVERAGE_GAP" || frozenInventory.unaccountedSource.length > 0)) {
    failureReasons.push("SEMANTIC_INVENTORY_COVERAGE_GAP");
    issues.push(`[inventory] ${frozenInventory.inventoryStatus === "INVENTORY_COVERAGE_GAP" ? "INVENTORY_COVERAGE_GAP" : "unaccounted source"}: ${frozenInventory.inventoryStatusReason}`);
    for (const seg of frozenInventory.unaccountedSource) issues.push(`[inventory] unaccounted source ${seg.regionId}:${seg.charStart}-${seg.charEnd}: "${seg.excerpt.slice(0, 160)}" - ${seg.reason}`);
  }
  if ((frozenInventory?.ensemble?.supportReviewRequired ?? false) || accountability.supportReviewRequired) {
    failureReasons.push("SEMANTIC_SUPPORT_REVIEW_REQUIRED");
    const e = frozenInventory?.ensemble;
    issues.push(`[support] ${e ? `${e.counts.materialSingleRun} CRITICAL/MATERIAL single-run and ${e.counts.materialConflicted} conflicted item(s) across passes ${e.passIds.join("+")}` : `${accountability.support?.materialSingleRun ?? 0} CRITICAL/MATERIAL single-run and ${accountability.support?.materialConflicted ?? 0} conflicted item(s)`} carry independent-pass support asymmetry - review required; never resolved by composition`);
    for (const cf of frozenInventory?.ensemble?.conflicts ?? []) issues.push(`[support] conflict ${cf.itemIds.join(" vs ")}: ${cf.reason}`);
  }
  return { failureReasons, issues };
}

/** F-7B.2 proof-class census over the retained definitions - the three authoritative classes, no shard-position fallback. */
function attributionProofCounts(plan: ShardPlan, stitched: StitchedCompilation): SemanticExecutionMetadata["sharded"] extends infer S ? S extends { attributionProofCounts: infer C } ? C : never : never {
  const defUnits = new Set(plan.units.filter((u) => u.kind === "DEFINITION").map((u) => u.normalizedTermName));
  const anchored = new Set(stitched.definitionAttribution.filter((a) => a.anchor).map((a) => a.objectId));
  const lineageOf = (o: unknown): boolean => { let found = false; const walk = (x: unknown): void => { if (found || !x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const r = x as Record<string, unknown>; if (Array.isArray(r.inventoryItemIds) && (r.inventoryItemIds as unknown[]).length > 0) { found = true; return; } for (const v of Object.values(r)) if (v && typeof v === "object") walk(v); }; walk(o); return found; };
  const counts = { PLANNER_DEFINITION_UNIT: 0, OWNED_INVENTORY_LINEAGE: 0, UNIQUE_PRIMARY_SOURCE_DECLARATION: 0, NONE: 0 };
  for (const d of stitched.definitions) {
    let n = 0;
    if (defUnits.has(normalizeDefinedTermRef(d.termName))) { counts.PLANNER_DEFINITION_UNIT++; n++; }
    if (lineageOf(d)) { counts.OWNED_INVENTORY_LINEAGE++; n++; }
    if (anchored.has(d.definitionId)) { counts.UNIQUE_PRIMARY_SOURCE_DECLARATION++; n++; }
    if (n === 0) counts.NONE++;
  }
  return counts;
}

/** §18 (PHASE 3 / 6.01 remediation): a detected contextual emission is a violation ONLY if its object was credited into the stitched IR (by its emitted id or its remapped id). */
export function contextualEmissionsCredited(stitched: Pick<StitchedCompilation, "contextualEmissions" | "rules" | "definitions" | "sharedCapacities" | "idMap">): number {
  const retained = new Set<string>([...stitched.rules.map((r) => r.ruleId), ...stitched.definitions.map((d) => d.definitionId), ...stitched.sharedCapacities.map((c) => c.sharedCapId)]);
  return stitched.contextualEmissions.filter((e) => retained.has(e.objectId) || retained.has(stitched.idMap[e.objectId] ?? "")).length;
}

/** §32 - deterministic, never optimistic: the stitcher's own status is the floor; whole-unit signals can only demote. */
function mapStitchedStatus(stitchedStatus: StitchedCompilation["status"], extraReasons: SemanticCompilerFailureReason[], hasReviewSufficiency: boolean): SemanticCompilationStatus {
  if (stitchedStatus === "COMPLETED" && (extraReasons.length > 0 || hasReviewSufficiency)) return "REVIEW_REQUIRED";
  return stitchedStatus;
}

function aggregateTelemetry(caller: SemanticCaller, results: ShardExecutionResult[], stats: { executed: number; retries: number }, latencyMs: number, promptVersion: string, schemaVersion: string): AnalyzerCallTelemetry {
  const sum = (pick: (t: NonNullable<ShardExecutionResult["telemetry"]>) => number | null): number | null => {
    let any = false; let total = 0;
    for (const r of results) { const v = r.telemetry ? pick(r.telemetry) : null; if (v !== null && v !== undefined) { any = true; total += v; } }
    return any ? total : null;
  };
  return {
    provider: caller.providerName, model: caller.model, promptVersion, schemaVersion, stage: "semantic_compile_sharded", timestamp: new Date().toISOString(),
    inputTokens: sum((t) => t.inputTokens), outputTokens: sum((t) => t.outputTokens), cachedInputTokens: null, cacheCreationInputTokens: null,
    attemptCount: stats.executed, retryCount: stats.retries, rateLimitFailures: 0, latencyMs,
    providerCost: undefined, calculatedCostUsd: sum((t) => t.costUsd),
  };
}

export async function compileCovenantToIR(input: SemanticCompilerInput, options: CompileOptions = {}): Promise<SemanticCompilationResult> {
  const caller = options.caller ?? getSemanticCaller();
  const cache = options.cache ?? defaultCache;
  // F-5.3B: the inventory mode is part of the compile's identity - a single-pass result must never be served from cache
  // for a dual-pass request (or vice versa).
  // CERTIFIED: the mode is the explicit config's; the env-var fallback exists only for the non-certified legacy path.
  const inventoryMode: SemanticInventoryMode | null = options.accountability !== false ? (options.certified ? options.certified.inventoryMode : resolveSemanticInventoryMode(options.inventoryMode)) : null;
  const providerIdentity = `${caller.providerName}::${caller.model}${inventoryMode ? `::inventory=${inventoryMode}` : ""}${options.certified ? `::${certifiedConfigIdentity(options.certified)}` : ""}`;
  const callOptions: SemanticCompileCallOptions = options.callOptions ?? {};
  const evidenceFlags = contextBundleEvidenceFlags(input);

  // F-7C.1: the CURRENT source context is resolved before the cache lookup. It is deterministic and free, and its
  // identity (computeSourceContextHash - every region's id/document/offsets/text plus the sufficiency state, the
  // same canonical hash Pass A records) enters the outer key, so a request whose expansion regions changed while
  // its operative text and bundle identity did not can never be served a result compiled over the old source - and
  // no cache hit can ever bypass the frozen-inventory compatibility gate below.
  let sourceContext: SourceContextResult | null = null;
  if (options.accountability !== false) {
    const index = input.toolAccess.structuralIndex;
    sourceContext = resolveSourceContext({
      index,
      documentId: input.sourceDocumentId,
      operativeSourceText: input.operativeSourceText,
      anchorNodeId: input.contextBundle.originatingStructuralNodeIds?.[0] ?? null,
      operativeCharStart: input.operativeCharStart ?? null,
      operativeSourceOrigin: input.operativeSourceOrigin ?? "STRUCTURAL_NODE",
      documentText: index.getDocumentText(input.sourceDocumentId) ?? null,
      ...(options.sourceContextBudget ?? {}),
    });
  }
  // F-7C: how the unit is executed is part of its identity too (cache.ts explains why it must be in the key before
  // Pass A runs). A resumed frozen inventory contributes its own hash; the resolved source context contributes its
  // identity.
  const executionIdentity = `${executionPolicyIdentity(options.shardBudget)}${sourceContext ? `|source:${computeSourceContextHash(sourceContext)}` : ""}${options.frozenInventory ? `|frozen:${options.frozenInventory.frozenContentHash}` : ""}`;
  const cacheKey = computeCacheKey(input, providerIdentity, executionIdentity);

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // SEMANTIC ACCOUNTABILITY (mission §12 -> §3 -> §7): source-context
  // sufficiency, then the source-only Pass A inventory, BOTH before the
  // composition model ever runs. The inventory is frozen (content-hashed)
  // here and handed to Pass B read-only, so Pass C's reconciliation can
  // never be circular. Disabled only by an explicit options.accountability
  // === false (zero-cost previews / legacy callers), never silently.
  // F-7C: Pass A runs ONCE for the whole unit here - never per shard.
  // Certified CONTEXT_ONLY policy: accountability (Pass A / Pass C) and planning see the unit's OWN operative region(s);
  // expansion regions remain in `sourceContext` for Pass B as context. Pass B's input is never narrowed.
  const accountabilityContext: SourceContextResult | null = sourceContext && options.certified?.expansionRegionPolicy === "CONTEXT_ONLY"
    ? (() => { const regions = sourceContext.regions.filter((r) => r.kind === "OPERATIVE"); return { ...sourceContext, regions, totalChars: regions.reduce((n, r) => n + r.text.length, 0) }; })()
    : sourceContext;
  let frozenInventory: FrozenSemanticInventory | null = null;
  let inventoryPasses: SemanticCompilationResult["inventoryPasses"] = null;
  let frozenInventoryResume: FrozenInventoryResumeRecord | null = null;
  let callerInput: SemanticCompilerInput = input;
  if (sourceContext) {
    const index = input.toolAccess.structuralIndex;
    if (options.frozenInventory) {
      // F-7C.1: the presence of a frozen inventory is a request, not an authorization. It is resumed only once it is
      // proven - against the source context resolved for THIS request - to belong to exactly this source. Otherwise
      // the compilation fails here, structurally and deterministically, before any model call: Pass A is never
      // silently rerun and the stale inventory is never used.
      const decision = validateFrozenInventoryResume({ candidateRef: input.candidateRef, sourceDocumentId: input.sourceDocumentId, frozenInventory: options.frozenInventory, sourceContext, structuralIndex: index });
      if (!decision.ok) {
        return {
          status: "FAILED",
          failureReasons: ["FROZEN_INVENTORY_SOURCE_MISMATCH"],
          errorDetail: null,
          rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [],
          unresolvedIssues: decision.failures.map((f) => `[frozen-inventory-resume] ${f.check}: ${f.detail}`),
          toolCallLog: [],
          ...evidenceFlags,
          definitionCompletenessCheck: null,
          sourceContext, frozenInventory: null, inventoryMode, inventoryPasses: null,
          accountability: null,
          rawModelOutput: null,
          provider: caller.providerName, model: caller.model,
          telemetry: null,
          cacheKey, compiledAt: new Date().toISOString(),
          execution: null,
        };
      }
      frozenInventory = decision.inventory;
      frozenInventoryResume = decision.record;
    } else if (inventoryMode === "DUAL_PASS_ENSEMBLE") {
      // F-5.3B: two independent Pass A executions -> deterministic ensemble (STRICT compatibility). The second paid
      // call is made here, visibly, by the orchestration module - never inside ensemble.ts, never a third pass.
      const passCallers = options.inventoryPassCallers ?? (options.inventoryCaller ? ([options.inventoryCaller, options.inventoryCaller] as [StageCaller, StageCaller]) : undefined);
      const dual = await runDualPassSemanticInventory({ candidateRef: input.candidateRef, documentId: input.sourceDocumentId, sourceContext: accountabilityContext!, structuralIndex: index, passCallers, signal: callOptions.signal, budget: callOptions.budget });
      frozenInventory = dual.inventory;
      inventoryPasses = dual.passes.map((p) => ({ passId: p.passId, frozenContentHash: p.inventory.frozenContentHash, inventoryStatus: p.inventory.inventoryStatus, items: p.inventory.items.length, telemetryCostUsd: p.inventory.telemetryCostUsd }));
    } else {
      frozenInventory = await runSemanticInventory({ candidateRef: input.candidateRef, documentId: input.sourceDocumentId, sourceContext: accountabilityContext!, caller: options.inventoryCaller, signal: callOptions.signal, budget: callOptions.budget });
    }
    // The COMPILATION UNIT (mission §13) is the resolved operative region - when the
    // supplied window was extended to its real unit boundary (with provenance on
    // sourceContext.regions[0].unitExtension), Pass B composes against the same
    // unit Pass A inventoried, never against the narrower window.
    const operativeRegion = sourceContext.regions[0]!;
    callerInput = { ...input, operativeSourceText: operativeRegion.text, operativeCharStart: operativeRegion.charStart >= 0 ? operativeRegion.charStart : input.operativeCharStart, sourceContext, frozenInventory };
  }
  const accountabilityFields: AccountabilityFields = { sourceContext, frozenInventory, inventoryMode, inventoryPasses };

  // ---- F-7C: THE BRANCH POINT. Everything above is unchanged; the deterministic plan is built from already-resolved
  // facts (resolved source context, frozen inventory, structural index) and the mode chosen before any model call.
  const plan: ShardPlan | null = sourceContext && frozenInventory
    ? planCompilationShards({ candidateRef: input.candidateRef, companyId: input.companyId, instrumentKey: input.instrumentKey, documentId: input.sourceDocumentId, sourceContext: accountabilityContext!, frozenInventory, structuralIndex: input.toolAccess.structuralIndex, budget: options.shardBudget, generation: { algorithmVersion: input.compilerAlgorithmVersion, promptVersion: input.compilerPromptVersion } })
    : null;
  const decision: ExecutionModeDecision = selectCompilationExecutionMode(plan);
  const executionBase = { mode: decision.mode, reason: decision.reason, policyVersion: SEMANTIC_EXECUTION_POLICY_VERSION, plannerAlgorithmVersion: decision.plannerAlgorithmVersion, planHash: decision.planHash, plannedShards: decision.shardCount, oversizedShards: decision.oversizedShards, frozenInventoryResume };

  if (decision.mode === "MONOLITHIC" || !plan) {
    // ---- the pre-F-7 bounded path, byte-for-byte the same machinery (bounded-composition.ts).
    const outcome = await compileBoundedComposition(callerInput, input, { caller, cacheKey, evidenceFlags, accountability: accountabilityFields, callOptions });
    const result: SemanticCompilationResult = { ...outcome.result, execution: { ...executionBase, sharded: null } };
    if (outcome.cacheable) cache.set(cacheKey, result);
    return result;
  }

  // ---- SHARDED: certified planner -> bounded per-shard composition -> certified stitcher -> GLOBAL Pass C.
  const started = Date.now();
  const executor = options.shardExecutor ?? createBoundedShardExecutor({ baseInput: callerInput, plan, caller, callOptions });
  const run = await executeShardPlan({
    plan, executor, frozenInventory: frozenInventory!, sourceContextState: sourceContext!.state,
    companyId: input.companyId, instrumentKey: input.instrumentKey, candidateRef: input.candidateRef,
    priorResults: options.priorShardResults, maxAttemptsPerShard: options.certified ? options.certified.shardMaxAttempts : (options.shardMaxAttempts ?? DEFAULT_SHARD_MAX_ATTEMPTS),
    sourceRegions: sourceContext!.regions.map((r) => ({ regionId: r.regionId, text: r.text })),
  });
  const stitched = run.stitched;
  const compiledAt = new Date().toISOString();

  // Whole-unit signals the stitcher does not own, layered exactly as the monolithic path derives them.
  const failureReasons: SemanticCompilerFailureReason[] = [...stitched.failureReasons];
  const push = (r: SemanticCompilerFailureReason) => { if (!failureReasons.includes(r)) failureReasons.push(r); };
  const extra: SemanticCompilerFailureReason[] = [];
  const addExtra = (r: SemanticCompilerFailureReason) => { if (!failureReasons.includes(r)) { extra.push(r); push(r); } };
  // Operative-state safety (FIX-2 / OPEN-2): the context-bundle flag and the stale-definition re-check apply to the unit
  // as a whole; per-shard toolCallLog evidenceUnresolved signals already arrived through each shard's failure reasons.
  if (evidenceFlags.inputHasUnresolvedOperativeEvidence || hasStaleReferencedDefinition(input, stitched.definitions)) addExtra("OPERATIVE_STATE_UNRESOLVED");
  // §35 - whole-unit definition-completeness layer: each shard already ran the check against its OWN primary text
  // (inside compileBoundedComposition) and any finding travelled through its failure reasons; this is the additional
  // whole-unit pass - the stitched definitions against the whole operative text - and is review evidence only.
  // Global Pass C, not this heuristic, remains the completeness authority.
  const definitionCompletenessCheck = checkDefinitionCompleteness(callerInput.operativeSourceText, stitched.definitions);
  if (definitionCompletenessCheck.fired) addExtra("DEFINITION_COMPLETENESS_SUSPECT");
  const whole = wholeUnitAccountabilitySignals(sourceContext, frozenInventory, stitched.accountability);
  for (const r of whole.failureReasons) addExtra(r);
  const hasReviewSufficiency = stitched.rules.some((r) => r.sufficiency !== "COMPLETE") || stitched.definitions.some((d) => d.sufficiency !== "COMPLETE");
  const status = mapStitchedStatus(stitched.status, extra, hasReviewSufficiency);

  const collisionsByKind: Record<string, number> = {};
  for (const c of stitched.collisions) collisionsByKind[c.kind] = (collisionsByKind[c.kind] ?? 0) + 1;
  const statusCounts: Record<string, number> = {};
  for (const r of run.results) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  const shardByHash = new Map(plan.shards.map((s) => [s.shardHash, s]));
  const anyProviderFailure = run.results.some((r) => r.status === "SHARD_PROVIDER_FAILURE");

  const execution: SemanticExecutionMetadata = {
    ...executionBase,
    sharded: {
      budget: plan.budget,
      executed: run.stats.executed, reused: run.stats.reused, retries: run.stats.retries, providerCalls: run.stats.executed,
      statusCounts, collisions: stitched.collisions.length, collisionsByKind,
      definitionConflicts: stitched.definitionConflicts.length, conflictVariants: stitched.definitionConflicts.reduce((a, c) => a + c.variants.length, 0),
      contextualEmissions: stitched.contextualEmissions.length, contextualEmissionsCredited: contextualEmissionsCredited(stitched), unresolvedOwnedItems: stitched.unresolvedOwnedItems.length,
      stitchedStatus: stitched.status, stitchedFailureReasons: stitched.failureReasons,
      definitionConflictEvidence: stitched.definitionConflicts,
      unresolvedOwnedItemList: stitched.unresolvedOwnedItems,
      attributionProofCounts: attributionProofCounts(plan, stitched),
      shards: run.results.map((r) => { const s = shardByHash.get(r.shardHash)!; return { shardId: r.shardId, shardHash: r.shardHash, ordinal: s.ordinal, status: r.status, attempts: r.attempts, reusedFromHash: r.reusedFromHash, failureReasons: r.failureReasons, ownedMaterialItems: s.ownedMaterialItemIds.length, oversized: s.oversized, telemetry: r.telemetry, ...(r.toolUsage ? { toolUsage: r.toolUsage } : {}), ...(r.missingContextAudit ? { missingContextAudit: r.missingContextAudit } : {}), ...(s.dependencyCertificate ? { dependencyCertificate: s.dependencyCertificate } : {}) }; }),
      telemetryNote: `${plan.shards.length} bounded conversations (${run.stats.executed} executed, ${run.stats.reused} reused by shardHash, ${run.stats.retries} provider-failure retries); rawModelOutput and toolCallLog are null/empty at the top level because no single transcript exists - per-shard telemetry is listed under execution.sharded.shards`,
    },
  };

  const result: SemanticCompilationResult = {
    status,
    failureReasons,
    errorDetail: null,
    rules: stitched.rules,
    definitions: stitched.definitions,
    sharedCapacities: stitched.sharedCapacities,
    // IR extension candidates are per-conversation proposals; ShardComposition does not carry them (they never affect IR content).
    irExtensionCandidates: [],
    unresolvedIssues: [...stitched.unresolvedIssues, ...whole.issues],
    // §36 - a sharded compile is many model conversations: no single transcript is faked.
    toolCallLog: [],
    ...evidenceFlags,
    definitionCompletenessCheck: definitionCompletenessCheck.fired ? definitionCompletenessCheck : null,
    ...accountabilityFields,
    // §12 - global Pass C over the full frozen inventory and the stitched canonical IR, computed once by the stitcher.
    accountability: stitched.accountability,
    rawModelOutput: null,
    provider: caller.providerName,
    model: caller.model,
    telemetry: aggregateTelemetry(caller, run.results, run.stats, Date.now() - started, input.compilerPromptVersion, input.irSchemaVersion),
    cacheKey,
    compiledAt,
    execution,
  };
  // A provider failure on any shard is transient (mirrors the monolithic never-cache-a-transport-failure rule): the
  // partial result is returned in full but not pinned in the cache for this key's lifetime.
  if (!anyProviderFailure) cache.set(cacheKey, result);
  return result;
}
