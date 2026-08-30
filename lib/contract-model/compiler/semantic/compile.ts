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
import type { SemanticCompilationResult, SemanticCompilationStatus, SemanticCompilerErrorDetail, SemanticCompilerFailureReason, SemanticCompilerInput } from "./types";

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

/** Phase 3F.1 §33/F6 - builds a structured FAILED result for a genuinely thrown exception, so compileCovenantToIR never lets a caller's own try/catch discard the failure's real content (the exact gap the DSGR first-blind run exposed: 2 compile failures preserved only `{candidateRef, status: "FAILED"}`). Never cached - a thrown exception is more likely transient (network blip, timeout) than a structured, deterministic model/schema failure, and caching it would incorrectly treat a transient condition as a permanent verdict for this cache key's lifetime. */
function buildTransportFailureResult(err: unknown, caller: SemanticCaller, cacheKey: string, retryCount: number | null): SemanticCompilationResult {
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

export async function compileCovenantToIR(input: SemanticCompilerInput, options: { caller?: SemanticCaller; cache?: SemanticCompilationCache } = {}): Promise<SemanticCompilationResult> {
  const caller = options.caller ?? getSemanticCaller();
  const cache = options.cache ?? defaultCache;
  const providerIdentity = `${caller.providerName}::${caller.model}`;
  const cacheKey = computeCacheKey(input, providerIdentity);

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Phase 3F.1 §33/F6 - this call is never allowed to throw out of
  // compileCovenantToIR uncaught: a genuine transport/internal exception is
  // converted into the same structured SemanticCompilationResult shape every
  // other failure path already returns, so no caller can silently discard a
  // real failure's content the way the pre-remediation run script's own
  // try/catch did.
  let callResult: Awaited<ReturnType<SemanticCaller["compile"]>>;
  try {
    callResult = await caller.compile(input);
  } catch (err) {
    return buildTransportFailureResult(err, caller, cacheKey, null);
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
    if (!failureReasons.includes("OPERATIVE_STATE_UNRESOLVED") && callResult.toolCallLog.some((entry) => entry.evidenceUnresolved)) failureReasons.push("OPERATIVE_STATE_UNRESOLVED");

    const hasReviewRequiredSufficiency = normalized.rules.some((r) => r.sufficiency !== "COMPLETE") || normalized.definitions.some((d) => d.sufficiency !== "COMPLETE");
    const unresolvedIssues = [
      ...(callResult.failureDetail ? [callResult.failureDetail] : []),
      ...validation.issues.map((i) => `[${i.kind}]${i.ruleId ? ` (${i.ruleId})` : ""} ${i.message}`),
      ...normalized.warnings.map((w) => `[${w.scope}] ${w.message}`),
      ...callResult.submission.overallNotes,
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
    const failure = buildTransportFailureResult(err, caller, cacheKey, null);
    return { ...failure, errorDetail: failure.errorDetail ? { ...failure.errorDetail, hadPartialOutput: true } : null };
  }
}
