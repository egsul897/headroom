/**
 * F-7C - THE ONE BOUNDED COMPOSITION PRIMITIVE.
 *
 * Everything from "hand the caller one bounded SemanticCompilerInput" to "a normalized, validated, failure-classified
 * SemanticCompilationResult" lives here, extracted verbatim (behavior-preserving) from compileCovenantToIR so that the
 * ordinary MONOLITHIC unit and every individual SHARD of a large unit run the SAME model-call -> transport
 * normalization -> normalizeSubmission -> validateCompilationUnit -> failure-reason machinery. compile.ts orchestrates
 * (cache, source context, Pass A, execution-mode selection, stitching, global Pass C); it contains no second copy of
 * this, and the shard executor (shard-executor.ts) calls this directly - never compileCovenantToIR - so a shard can
 * never re-enter mode selection.
 *
 * Nothing here decides completeness for a large unit: when `ctx.frozenInventory` is null (every shard, and any
 * caller that disabled accountability) Pass C is simply not run and the whole-unit signals are not derived - the
 * certified F-7B/F-7B.3E per-shard run shape. Global Pass C for a sharded unit runs once, after stitching.
 */
import { validateCompilationUnit } from "../../ir/validate";
import type { SemanticCaller } from "./caller";
import { normalizeSubmission } from "./normalize";
import { checkDefinitionCompleteness } from "./completeness-check";
import { EMPTY_SUPERSESSION_INDEX, buildNodeSupersessionIndex, resolveOperativeDefinitionEvidence } from "../amendment/operative-state";
import type { IRDefinition } from "../../ir/types";
import type { SemanticCompilationResult, SemanticCompilationStatus, SemanticCompilerErrorDetail, SemanticCompilerFailureReason, SemanticCompilerInput } from "./types";
import { reconcileInventoryWithComposition } from "../semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, SourceContextResult } from "../semantic-accountability/types";
import type { SemanticInventoryMode } from "../semantic-accountability/dual-pass";
import type { NormalizedCompilation } from "./normalize";
import type { SemanticCompileCallOptions } from "./caller";

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

export type EvidenceFlags = Pick<SemanticCompilationResult, "inputHasUnresolvedOperativeEvidence" | "unresolvedEvidenceItemIds">;

/** Phase 3F.1 FIX-2 - the ONE place `inputHasUnresolvedOperativeEvidence`/`unresolvedEvidenceItemIds` are ever derived, straight off the context bundle's own already-computed fields (never re-scanning `items` a second, independent way here). */
export function contextBundleEvidenceFlags(input: SemanticCompilerInput): EvidenceFlags {
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
export function hasStaleReferencedDefinition(input: SemanticCompilerInput, definitions: IRDefinition[]): boolean {
  const { operativeState, structuralIndex } = input.toolAccess;
  if (definitions.length === 0) return false;
  const supersessionIndex = operativeState ? buildNodeSupersessionIndex([{ baseDocumentId: input.sourceDocumentId, state: operativeState }]) : EMPTY_SUPERSESSION_INDEX;
  return definitions.some((def) => {
    const resolution = resolveOperativeDefinitionEvidence({ index: structuralIndex, operativeState, term: def.termName, searchDocumentIds: [def.sourceDocumentId ?? input.sourceDocumentId], supersessionIndex });
    return resolution.outcome !== "FOUND" || !resolution.isCurrentTruth;
  });
}

/** Phase 3F.1 §33/F6 - builds a structured FAILED result for a genuinely thrown exception, so compileCovenantToIR never lets a caller's own try/catch discard the failure's real content (the exact gap the DSGR first-blind run exposed: 2 compile failures preserved only `{candidateRef, status: "FAILED"}`). Never cached - a thrown exception is more likely transient (network blip, timeout) than a structured, deterministic model/schema failure, and caching it would incorrectly treat a transient condition as a permanent verdict for this cache key's lifetime. */
export function buildTransportFailureResult(err: unknown, caller: SemanticCaller, cacheKey: string, retryCount: number | null, evidenceFlags: EvidenceFlags): SemanticCompilationResult {
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

export function determineStatus(failureReasons: SemanticCompilerFailureReason[], ruleCount: number, hasReviewRequiredSufficiency: boolean, hasUnresolvedIssues: boolean): SemanticCompilationStatus {
  if (ruleCount === 0 && failureReasons.length > 0) return "FAILED";
  // Phase 3B.1 (task §10): OUTPUT_TRUNCATED belongs alongside IR_VALIDATION_FAILURE/
  // MODEL_SCHEMA_FAILURE here - a response cut off at the output-token ceiling is a
  // degraded attempt (PARTIAL when a validated prefix was recovered) even when every
  // recovered rule/definition itself validates cleanly, never a plain REVIEW_REQUIRED.
  if (failureReasons.includes("IR_VALIDATION_FAILURE") || failureReasons.includes("MODEL_SCHEMA_FAILURE") || failureReasons.includes("OUTPUT_TRUNCATED")) return ruleCount > 0 ? "PARTIAL" : "FAILED";
  if (failureReasons.length > 0 || hasReviewRequiredSufficiency || hasUnresolvedIssues) return "REVIEW_REQUIRED";
  return "COMPLETED";
}

/** The whole-unit accountability fields compile.ts resolved before the model ran (all null when accountability is off, and for every shard). */
export interface AccountabilityFields {
  sourceContext: SourceContextResult | null;
  frozenInventory: FrozenSemanticInventory | null;
  inventoryMode: SemanticInventoryMode | null;
  inventoryPasses: SemanticCompilationResult["inventoryPasses"];
}

export interface BoundedCompositionContext {
  caller: SemanticCaller;
  cacheKey: string;
  evidenceFlags: EvidenceFlags;
  accountability: AccountabilityFields;
  /** Abort signal + dispatch budget for the model call (certified path). */
  callOptions?: SemanticCompileCallOptions;
}

export interface BoundedCompositionOutcome {
  result: SemanticCompilationResult;
  /** False on the transport/internal-exception paths, which compile.ts never caches (see buildTransportFailureResult). */
  cacheable: boolean;
  /** The composition's own explicit inventory dispositions, passed through verbatim from normalization (empty when no submission arrived). Needed by the shard executor; never interpreted here. */
  inventoryDispositions: NormalizedCompilation["inventoryDispositions"];
}

/**
 * One bounded model conversation over `callerInput`, judged against `input` (the caller-supplied identity/evidence):
 * for the monolithic unit both are compile.ts's own callerInput/input pair exactly as before; for a shard both are the
 * shard's own SemanticCompilerInput (buildShardCompilerInput). Behavior is the pre-F-7C compile.ts body, unchanged.
 */
export async function compileBoundedComposition(callerInput: SemanticCompilerInput, input: SemanticCompilerInput, ctx: BoundedCompositionContext): Promise<BoundedCompositionOutcome> {
  const { caller, cacheKey, evidenceFlags } = ctx;
  const { sourceContext, frozenInventory } = ctx.accountability;
  const accountabilityFields = ctx.accountability;

  // Phase 3F.1 §33/F6 - this call is never allowed to throw out of
  // compileCovenantToIR uncaught: a genuine transport/internal exception is
  // converted into the same structured SemanticCompilationResult shape every
  // other failure path already returns, so no caller can silently discard a
  // real failure's content the way the pre-remediation run script's own
  // try/catch did.
  let callResult: Awaited<ReturnType<SemanticCaller["compile"]>>;
  try {
    callResult = await caller.compile(callerInput, ctx.callOptions);
  } catch (err) {
    return { result: { ...buildTransportFailureResult(err, caller, cacheKey, null, evidenceFlags), ...accountabilityFields, accountability: null }, cacheable: false, inventoryDispositions: [] };
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
    return { result, cacheable: true, inventoryDispositions: [] };
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
    // NO_SEMANTIC_COMPLETE_WITH_UNACCOUNTED_SOURCE, enforced here independently of the inventory's own status
    // string and independently of reconciliation's boolean: either signal alone raises the failure.
    if (frozenInventory && (frozenInventory.inventoryStatus === "INVENTORY_COVERAGE_GAP" || frozenInventory.unaccountedSource.length > 0)) {
      failureReasons.push("SEMANTIC_INVENTORY_COVERAGE_GAP");
      accountabilityIssues.push(`[inventory] ${frozenInventory.inventoryStatus === "INVENTORY_COVERAGE_GAP" ? "INVENTORY_COVERAGE_GAP" : "unaccounted source"}: ${frozenInventory.inventoryStatusReason}`);
      for (const seg of frozenInventory.unaccountedSource) accountabilityIssues.push(`[inventory] unaccounted source ${seg.regionId}:${seg.charStart}-${seg.charEnd}: "${seg.excerpt.slice(0, 160)}" - ${seg.reason}`);
    }
    if (accountability && (accountability.counts.materialMissingFromComposition > 0 || accountability.counts.materialQuantitativeValuesMissing > 0)) {
      failureReasons.push("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
      accountabilityIssues.push(...accountability.reasons.filter((r) => /MISSING_FROM_COMPOSITION|absent from the composed IR/.test(r)).map((r) => `[accountability] ${r}`));
    }
    // F-5.3B - SUPPORT TRUST PROPAGATION: enforced here on the ensemble record AND on reconciliation's own field, each
    // sufficient alone. inventoryStatus (raw source coverage) may read INVENTORY_OK while a CRITICAL/MATERIAL item is
    // SINGLE_RUN or CONFLICTED; that combination is REVIEW_REQUIRED, never COMPLETED.
    if ((frozenInventory?.ensemble?.supportReviewRequired ?? false) || (accountability?.supportReviewRequired ?? false)) {
      failureReasons.push("SEMANTIC_SUPPORT_REVIEW_REQUIRED");
      const e = frozenInventory?.ensemble;
      accountabilityIssues.push(`[support] ${e ? `${e.counts.materialSingleRun} CRITICAL/MATERIAL single-run and ${e.counts.materialConflicted} conflicted item(s) across passes ${e.passIds.join("+")}` : `${accountability?.support?.materialSingleRun ?? 0} CRITICAL/MATERIAL single-run and ${accountability?.support?.materialConflicted ?? 0} conflicted item(s)`} carry independent-pass support asymmetry - review required; never resolved by composition`);
      for (const cf of frozenInventory?.ensemble?.conflicts ?? []) accountabilityIssues.push(`[support] conflict ${cf.itemIds.join(" vs ")}: ${cf.reason}`);
    }

    if (accountability && !accountability.semanticallyComplete && frozenInventory && frozenInventory.inventoryStatus !== "INVENTORY_SKIPPED_NO_PROVIDER" && !failureReasons.some((r) => r === "INVENTORY_ITEM_MISSING_FROM_COMPOSITION" || r === "SEMANTIC_INVENTORY_UNAVAILABLE" || r === "SEMANTIC_INVENTORY_COVERAGE_GAP" || r === "SOURCE_CONTEXT_TRUNCATED" || r === "SEMANTIC_SUPPORT_REVIEW_REQUIRED")) {
      // Re-audit finding B2': every remaining way accountability can be incomplete (uninventoried operative money/percent/ratio values, a REVIEW_UNCERTAIN item missing from the composition, dangling lineage) must be visible on the attempt status, never left as a reason string only.
      failureReasons.push("SEMANTIC_ACCOUNTABILITY_INCOMPLETE");
      accountabilityIssues.push(...accountability.reasons.map((r) => `[accountability] ${r}`));
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
    return { result, cacheable: true, inventoryDispositions: normalized.inventoryDispositions };
  } catch (err) {
    const failure = buildTransportFailureResult(err, caller, cacheKey, null, evidenceFlags);
    return { result: { ...failure, ...accountabilityFields, accountability: null, errorDetail: failure.errorDetail ? { ...failure.errorDetail, hadPartialOutput: true } : null }, cacheable: false, inventoryDispositions: [] };
  }
}
