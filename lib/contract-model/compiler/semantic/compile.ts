/**
 * Phase 3B - the compiler's own public API (task §58): compileCovenantToIR.
 * Orchestrates: cache lookup -> bounded tool-use model call (caller.ts) ->
 * deterministic normalization (normalize.ts) -> Phase 3A IR structural
 * validation (lib/contract-model/ir/validate.ts, reused verbatim, never
 * re-implemented) -> final SemanticCompilationResult -> cache write.
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
import { validateCompilationUnit } from "../../ir/validate";
import { getSemanticCaller, type SemanticCaller } from "./caller";
import { InMemorySemanticCompilationCache, computeCacheKey, type SemanticCompilationCache } from "./cache";
import { normalizeSubmission } from "./normalize";
import { checkDefinitionCompleteness } from "./completeness-check";
import { EMPTY_SUPERSESSION_INDEX, buildNodeSupersessionIndex, resolveOperativeDefinitionEvidence } from "../amendment/operative-state";
import type { IRDefinition } from "../../ir/types";
import type { SemanticCompilationResult, SemanticCompilationStatus, SemanticCompilerErrorDetail, SemanticCompilerFailureReason, SemanticCompilerInput } from "./types";
import type { StageCaller } from "../llm-caller";
import { resolveSourceContext } from "../semantic-accountability/source-context";
import { runSemanticInventory } from "../semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, SourceContextResult } from "../semantic-accountability/types";

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

const MAX_SANITIZED_MESSAGE_LENGTH = 500;
/** Redacts common credential/token shapes before a message is ever persisted (task §33's "no secrets" instruction) - defensive even though a compile-time exception message should not ordinarily contain one. */
const CREDENTIAL_LIKE_PATTERN = /\b(?:sk-|Bearer\s+|api[_-]?key["':=\s]+)[A-Za-z0-9._-]{8,}/gi;

export function sanitizeErrorMessage(message: string): string {
  const redacted = message.replace(CREDENTIAL_LIKE_PATTERN, "[REDACTED]");
  return redacted.length > MAX_SANITIZED_MESSAGE_LENGTH ? `${redacted.slice(0, MAX_SANITIZED_MESSAGE_LENGTH)}... [truncated]` : redacted;
}

export function classifyFailureCategory(errorClass: string, message: string): SemanticCompilerErrorDetail["failureCategory"] {
  const lower = `${errorClass} ${message}`.toLowerCase();
  if (/timeout|timedout|network|econnreset|econnrefused|fetch failed|abort|enotfound|socket|connection reset/.test(lower)) return "TRANSPORT";
  if (/schema|json|parse/.test(lower)) return "SCHEMA";
  if (/tool/.test(lower)) return "TOOL";
  if (/model|provider|rate.?limit|overloaded/.test(lower)) return "MODEL";
  return "INTERNAL";
}

/** Phase 3F.1 FIX-2 - the ONE place `inputHasUnresolvedOperativeEvidence`/`unresolvedEvidenceItemIds` are ever derived, straight off the context bundle's own already-computed fields (never re-scanning `items` a second, independent way here). */
function contextBundleEvidenceFlags(input: SemanticCompilerInput): Pick<SemanticCompilationResult, "inputHasUnresolvedOperativeEvidence" | "unresolvedEvidenceItemIds"> {
  return { inputHasUnresolvedOperativeEvidence: input.contextBundle.hasUnresolvedOperativeEvidence, unresolvedEvidenceItemIds: input.contextBundle.unresolvedEvidenceItemIds };
}

/**
 * Phase 3F.1 FIX-2 (§5, defense in depth - "optional but preferred where
 * practical") - independent of `contextBundleEvidenceFlags` above (which
 * depends on the context bundle's own items having been routed through
 * evidenceState at CONSTRUCTION time - the normal, real production path):
 * for every IRDefinition this compilation actually emitted, directly
 * re-resolves that exact term's CURRENT operative status against the real
 * operativeState/structuralIndex this compilation's own toolAccess already
 * carries (the SAME canonical resolveOperativeDefinitionEvidence primitive
 * context-retrieval's own resolveDefinitionEvidenceState and semantic/
 * tools.ts's getDefinition already rely on). This is what keeps the
 * required end-to-end invariant true even for a bundle that was HAND-BUILT
 * or produced by code that predates this fix (no evidenceState on its own
 * items at all, `hasUnresolvedOperativeEvidence` never set) - a compiled
 * definition can never be silently trusted merely because the upstream
 * bundle construction step happened to skip trust annotation. Mirrors
 * semantic-verification/verify.ts's OWN independent copy of this exact
 * check (deliberately duplicated, never imported, per that module's own
 * independence-from-compile.ts contract) rather than a shared helper.
 */
function hasStaleReferencedDefinition(input: SemanticCompilerInput, definitions: IRDefinition[]): boolean {
  const { operativeState, structuralIndex } = input.toolAccess;
  if (definitions.length === 0) return false;
  const supersessionIndex = operativeState ? buildNodeSupersessionIndex([{ baseDocumentId: input.sourceDocumentId, state: operativeState }]) : EMPTY_SUPERSESSION_INDEX;
  return definitions.some((def) => {
    const resolution = resolveOperativeDefinitionEvidence({ index: structuralIndex, operativeState, term: def.termName, searchDocumentIds: [def.sourceDocumentId ?? input.sourceDocumentId], supersessionIndex });
    return resolution.outcome !== "FOUND" || !resolution.isCurrentTruth;
  });
}

/** Phase 3F.1 §33/F6 - builds a structured FAILED result for a genuinely thrown exception, so compileCovenantToIR never lets a caller's own try/catch discard the failure's real content (the exact gap the DSGR first-blind run exposed: 2 compile failures preserved only `{candidateRef, status: "FAILED"}`). Never cached - a thrown exception is more likely transient (network blip, timeout) than a structured, deterministic model/schema failure, and caching it would incorrectly treat a transient condition as a permanent verdict for this cache key's lifetime. */
function buildTransportFailureResult(err: unknown, caller: SemanticCaller, cacheKey: string, retryCount: number | null, evidenceFlags: Pick<SemanticCompilationResult, "inputHasUnresolvedOperativeEvidence" | "unresolvedEvidenceItemIds">): SemanticCompilationResult {
  const errorClass = err instanceof Error ? err.constructor.name : "UnknownError";
  const rawMessage = err instanceof Error ? err.message : String(err);
  const sanitizedMessage = sanitizeErrorMessage(rawMessage);
  const errorDetail: SemanticCompilerErrorDetail = {
    errorClass,
    sanitizedMessage,
    failureCategory: classifyFailureCategory(errorClass, rawMessage),
    retryCount,
    hadPartialOutput: false,
  };
  return {
    status: "FAILED",
    failureReasons: ["TRANSPORT_OR_INTERNAL_ERROR"],
    errorDetail,
    rules: [],
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    unresolvedIssues: [`Compilation threw ${errorClass}: ${sanitizedMessage}`],
    toolCallLog: [],
    ...evidenceFlags,
    definitionCompletenessCheck: null,
    rawModelOutput: null,
    provider: caller.providerName,
    model: caller.model,
    telemetry: null,
    cacheKey,
    compiledAt: new Date().toISOString(),
  };
}

function determineStatus(failureReasons: SemanticCompilerFailureReason[], ruleCount: number, hasReviewRequiredSufficiency: boolean, hasUnresolvedIssues: boolean): SemanticCompilationStatus {
  if (ruleCount === 0 && failureReasons.length > 0) return "FAILED";
  // Phase 3B.1 (task §10): OUTPUT_TRUNCATED belongs alongside IR_VALIDATION_FAILURE/
  // MODEL_SCHEMA_FAILURE here - a response cut off at the output-token ceiling is a
  // degraded attempt (PARTIAL when a validated prefix was recovered) even when every
  // recovered rule/definition itself validates cleanly, never a plain REVIEW_REQUIRED.
  if (failureReasons.includes("IR_VALIDATION_FAILURE") || failureReasons.includes("MODEL_SCHEMA_FAILURE") || failureReasons.includes("OUTPUT_TRUNCATED")) return ruleCount > 0 ? "PARTIAL" : "FAILED";
  if (failureReasons.length > 0 || hasReviewRequiredSufficiency || hasUnresolvedIssues) return "REVIEW_REQUIRED";
  return "COMPLETED";
}

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
  /** SEMANTIC ACCOUNTABILITY: source-context budgets (mission §12/§13). Defaults are the layer's own; tests use small caps to exercise TRUNCATED_SOURCE deterministically. */
  sourceContextBudget?: { budgetChars?: number; maxExpansionRegionChars?: number; maxOperativeUnitChars?: number };
  /** SEMANTIC ACCOUNTABILITY: set false to skip source-context sufficiency + Pass A + Pass C entirely (result.accountability === null). Default true. */
  accountability?: boolean;
}

export async function compileCovenantToIR(input: SemanticCompilerInput, options: CompileOptions = {}): Promise<SemanticCompilationResult> {
  const caller = options.caller ?? getSemanticCaller();
  const cache = options.cache ?? defaultCache;
  const providerIdentity = `${caller.providerName}::${caller.model}`;
  const cacheKey = computeCacheKey(input, providerIdentity);

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const evidenceFlags = contextBundleEvidenceFlags(input);

  // SEMANTIC ACCOUNTABILITY (mission §12 -> §3 -> §7): source-context
  // sufficiency, then the source-only Pass A inventory, BOTH before the
  // composition model ever runs. The inventory is frozen (content-hashed)
  // here and handed to Pass B read-only, so Pass C's reconciliation can
  // never be circular. Disabled only by an explicit options.accountability
  // === false (zero-cost previews / legacy callers), never silently.
  let sourceContext: SourceContextResult | null = null;
  let frozenInventory: FrozenSemanticInventory | null = null;
  let callerInput: SemanticCompilerInput = input;
  if (options.accountability !== false) {
    const index = input.toolAccess.structuralIndex;
    sourceContext = resolveSourceContext({
      index,
      documentId: input.sourceDocumentId,
      operativeSourceText: input.operativeSourceText,
      anchorNodeId: input.contextBundle.originatingStructuralNodeIds?.[0] ?? null,
      operativeCharStart: input.operativeCharStart ?? null,
      documentText: index.getDocumentText(input.sourceDocumentId) ?? null,
      ...(options.sourceContextBudget ?? {}),
    });
    frozenInventory = await runSemanticInventory({ candidateRef: input.candidateRef, documentId: input.sourceDocumentId, sourceContext, caller: options.inventoryCaller });
    // The COMPILATION UNIT (mission §13) is the resolved operative region - when the
    // supplied window was extended to its real unit boundary (with provenance on
    // sourceContext.regions[0].unitExtension), Pass B composes against the same
    // unit Pass A inventoried, never against the narrower window.
    const operativeRegion = sourceContext.regions[0]!;
    callerInput = { ...input, operativeSourceText: operativeRegion.text, operativeCharStart: operativeRegion.charStart >= 0 ? operativeRegion.charStart : input.operativeCharStart, sourceContext, frozenInventory };
  }
  const accountabilityFields = { sourceContext, frozenInventory };

  // Phase 3F.1 §33/F6 - this call is never allowed to throw out of
  // compileCovenantToIR uncaught: a genuine transport/internal exception is
  // converted into the same structured SemanticCompilationResult shape every
  // other failure path already returns, so no caller can silently discard a
  // real failure's content the way the pre-remediation run script's own
  // try/catch did.
  let callResult: Awaited<ReturnType<SemanticCaller["compile"]>>;
  try {
    callResult = await caller.compile(callerInput);
  } catch (err) {
    return { ...buildTransportFailureResult(err, caller, cacheKey, null, evidenceFlags), ...accountabilityFields, accountability: null };
  }
  const compiledAt = new Date().toISOString();

  if (!callResult.submission) {
    const result: SemanticCompilationResult = {
      status: "FAILED",
      failureReasons: [callResult.failureReason ?? "MODEL_SCHEMA_FAILURE"],
      errorDetail: null,
      rules: [],
      definitions: [],
      sharedCapacities: [],
      irExtensionCandidates: [],
      unresolvedIssues: callResult.failureDetail ? [callResult.failureDetail] : [],
      toolCallLog: callResult.toolCallLog,
      ...evidenceFlags,
      definitionCompletenessCheck: null,
      ...accountabilityFields,
      accountability: null,
      rawModelOutput: callResult.rawSubmission,
      provider: caller.providerName,
      model: caller.model,
      telemetry: callResult.telemetry,
      cacheKey,
      compiledAt,
    };
    cache.set(cacheKey, result);
    return result;
  }

  // Phase 3F.1 §33/F6 - normalization/validation is deterministic post-
  // processing over a real model response, but a bug here must still
  // surface as a structured, diagnosable failure rather than an uncaught
  // exception that would abort whatever loop called compileCovenantToIR (a
  // partial submission was already assembled at this point, so
  // hadPartialOutput is true on this path).
  try {
    const normalized = normalizeSubmission(callResult.submission, input);

    const validation = validateCompilationUnit({
      irSchemaVersion: input.irSchemaVersion,
      companyId: input.companyId,
      instrumentKey: input.instrumentKey,
      rules: normalized.rules,
      definitions: normalized.definitions,
      sharedCapacities: normalized.sharedCapacities,
    });

    const failureReasons: SemanticCompilerFailureReason[] = [];
    // Phase 3B.1 (task §10): a submission can be non-null yet still carry a caller-level
    // failureReason - the partial-output-recovery path (caller.ts's recoverPartialSubmission)
    // returns a validated, truncated-but-usable submission alongside OUTPUT_TRUNCATED. That
    // must not be silently dropped just because normalization/validation otherwise succeeds.
    if (callResult.failureReason) failureReasons.push(callResult.failureReason);
    if (!validation.ok) failureReasons.push("IR_VALIDATION_FAILURE");
    if (normalized.rules.length === 0 && normalized.definitions.length === 0) failureReasons.push("PARTIAL_COMPILATION");
    if (normalized.rules.some((r) => r.sufficiency === "MISSING_CONTEXT") || normalized.definitions.some((d) => d.sufficiency === "MISSING_CONTEXT")) failureReasons.push("MISSING_CONTEXT");
    if (normalized.rules.some((r) => r.sufficiency === "CONFLICTED")) failureReasons.push("OPERATIVE_STATE_UNRESOLVED");
    if (normalized.rules.some((r) => r.sufficiency === "UNSUPPORTED") || normalized.definitions.some((d) => d.sufficiency === "UNSUPPORTED")) failureReasons.push("UNSUPPORTED_SEMANTICS");
    // Phase 3F.1.6-terminal Part A (OPEN-2 / BLOCKER-5 / BLOCKER-6) -
    // deterministic propagation, independent of the model's own
    // self-reported `sufficiency` above (task's own "must NOT become
    // trusted verified current truth solely from [an unresolved]
    // definition" requirement): if ANY evidence tool call this attempt
    // actually made (getDefinition chief among them - see
    // ToolExecutionOutcome.evidenceUnresolved in semantic/tools.ts) itself
    // returned evidence that could not be confirmed current operative
    // truth, this attempt can never be COMPLETED merely because the model
    // happened to mark every rule/definition it produced sufficiency
    // COMPLETE - determineStatus below already treats any non-empty
    // failureReasons as at least REVIEW_REQUIRED (never silently upgraded
    // by ruleCount>0 alone). Never suppressed even when the model's own
    // narrative text made no mention of the issue.
    //
    // Phase 3F.1 FIX-2 ("the actual safety gate must not require any tool
    // call") - `evidenceFlags.inputHasUnresolvedOperativeEvidence` is an
    // INDEPENDENT second source for this exact same gate, computed from the
    // context bundle handed to the model on turn 1 (context-retrieval/
    // pipeline.ts's own hasUnresolvedOperativeEvidence), never from anything
    // the model did. This is the fix for the reproduced exploit: a model
    // that submits sufficiency COMPLETE on turn 1 with a completely EMPTY
    // toolCallLog can no longer reach COMPLETED/REVIEW_REQUIRED-free status
    // when the bundle it was given already embedded a CONFLICTED/AMBIGUOUS/
    // PARTIAL/superseded definition or section excerpt - determineStatus
    // below already treats any non-empty failureReasons as at least
    // REVIEW_REQUIRED regardless of the model's own self-reported
    // sufficiency, exactly mirroring the pre-existing toolCallLog-derived
    // check this is threaded alongside (never instead of).
    if (
      !failureReasons.includes("OPERATIVE_STATE_UNRESOLVED") &&
      (callResult.toolCallLog.some((entry) => entry.evidenceUnresolved) || evidenceFlags.inputHasUnresolvedOperativeEvidence || hasStaleReferencedDefinition(input, normalized.definitions))
    )
      failureReasons.push("OPERATIVE_STATE_UNRESOLVED");

    // POST-3F.2 remediation (Unit A3, S7) - a definition/qualifier read off
    // a tool result truncated at semantic/tools.ts's MAX_TEXT_RESULT_CHARS
    // ceiling must never be silently treated as complete evidence merely
    // because it happened to validate against the IR schema. Independent
    // of OPERATIVE_STATE_UNRESOLVED above (truncation is a COMPLETENESS
    // concern, not a CURRENCY/staleness concern) and threaded the same way
    // every other deterministic safety signal in this function is: into
    // failureReasons, so determineStatus below can never upgrade this
    // attempt past REVIEW_REQUIRED regardless of the model's own
    // self-reported sufficiency.
    if (callResult.toolCallLog.some((entry) => entry.evidenceTruncated)) failureReasons.push("TRUNCATED_EVIDENCE_USED");

    // POST-3F.2 remediation (Unit A2) - deterministic, model-independent
    // completeness cross-check (see completeness-check.ts's own header for
    // the full scope/conservatism contract). Run against the SAME source
    // text the model itself was given (input.operativeSourceText), never a
    // wider span, so a "missing" finding always means "missing from what
    // this attempt actually saw." Diagnostic-safety-net only: a `fired`
    // result never manufactures IR content, never silently marks the
    // attempt complete, and routes through the exact same failureReasons ->
    // determineStatus safe-failure machinery as every other signal here.
    const definitionCompletenessCheck = checkDefinitionCompleteness(input.operativeSourceText, normalized.definitions);
    if (definitionCompletenessCheck.fired) failureReasons.push("DEFINITION_COMPLETENESS_SUSPECT");

    // SEMANTIC ACCOUNTABILITY - Pass C (mission §9/§10): deterministic
    // reconciliation of the FROZEN Pass A inventory against the composed IR.
    // No model decides this. Every signal below routes through the SAME
    // failureReasons -> determineStatus machinery as every other safety
    // signal (never a new status kind): a known-truncated source unit, a
    // material inventory item/value with no lineage and no disposition, or
    // an inventory that failed/came back suspiciously empty can never yield
    // COMPLETED. INVENTORY_SKIPPED_NO_PROVIDER (no real provider configured)
    // is disclosed on result.accountability instead of forcing review, so
    // zero-cost/synthetic orchestration tests keep their meaning.
    const accountabilityIssues: string[] = [];
    const accountability = frozenInventory
      ? reconcileInventoryWithComposition({
          inventory: frozenInventory,
          composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities },
          dispositions: normalized.inventoryDispositions,
          sourceContextState: sourceContext?.state ?? "UNKNOWN_SOURCE_COMPLETENESS",
        })
      : null;
    if (sourceContext && (sourceContext.state === "TRUNCATED_SOURCE" || sourceContext.state === "STRUCTURALLY_INCOMPLETE_SOURCE")) {
      failureReasons.push("SOURCE_CONTEXT_TRUNCATED");
      accountabilityIssues.push(`[source-context] ${sourceContext.state}: ${sourceContext.reasons.join("; ")}`);
    }
    if (frozenInventory && (frozenInventory.inventoryStatus === "INVENTORY_FAILED" || frozenInventory.inventoryStatus === "INVENTORY_EMPTY_SUSPECT")) {
      failureReasons.push("SEMANTIC_INVENTORY_UNAVAILABLE");
      accountabilityIssues.push(`[inventory] ${frozenInventory.inventoryStatus}: ${frozenInventory.inventoryStatusReason}`);
    }
    if (accountability && (accountability.counts.materialMissingFromComposition > 0 || accountability.counts.materialQuantitativeValuesMissing > 0)) {
      failureReasons.push("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
      accountabilityIssues.push(...accountability.reasons.filter((r) => /MISSING_FROM_COMPOSITION|absent from the composed IR/.test(r)).map((r) => `[accountability] ${r}`));
    }

    const hasReviewRequiredSufficiency = normalized.rules.some((r) => r.sufficiency !== "COMPLETE") || normalized.definitions.some((d) => d.sufficiency !== "COMPLETE");
    const unresolvedIssues = [
      ...(callResult.failureDetail ? [callResult.failureDetail] : []),
      ...validation.issues.map((i) => `[${i.kind}]${i.ruleId ? ` (${i.ruleId})` : ""} ${i.message}`),
      ...normalized.warnings.map((w) => `[${w.scope}] ${w.message}`),
      ...callResult.submission.overallNotes,
      ...accountabilityIssues,
    ];

    const result: SemanticCompilationResult = {
      status: determineStatus(failureReasons, normalized.rules.length + normalized.definitions.length, hasReviewRequiredSufficiency, unresolvedIssues.length > 0),
      failureReasons,
      errorDetail: null,
      rules: normalized.rules,
      definitions: normalized.definitions,
      sharedCapacities: normalized.sharedCapacities,
      irExtensionCandidates: normalized.irExtensionCandidates,
      unresolvedIssues,
      toolCallLog: callResult.toolCallLog,
      ...evidenceFlags,
      definitionCompletenessCheck: definitionCompletenessCheck.fired ? definitionCompletenessCheck : null,
      ...accountabilityFields,
      accountability,
      rawModelOutput: callResult.rawSubmission,
      provider: caller.providerName,
      model: caller.model,
      telemetry: callResult.telemetry,
      cacheKey,
      compiledAt,
    };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    const failure = buildTransportFailureResult(err, caller, cacheKey, null, evidenceFlags);
    return { ...failure, ...accountabilityFields, accountability: null, errorDetail: failure.errorDetail ? { ...failure.errorDetail, hadPartialOutput: true } : null };
  }
}
