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
import type { SemanticCompilationResult, SemanticCompilationStatus, SemanticCompilerFailureReason, SemanticCompilerInput } from "./types";

const defaultCache = new InMemorySemanticCompilationCache();

function determineStatus(failureReasons: SemanticCompilerFailureReason[], ruleCount: number, hasReviewRequiredSufficiency: boolean, hasUnresolvedIssues: boolean): SemanticCompilationStatus {
  if (ruleCount === 0 && failureReasons.length > 0) return "FAILED";
  if (failureReasons.includes("IR_VALIDATION_FAILURE") || failureReasons.includes("MODEL_SCHEMA_FAILURE")) return ruleCount > 0 ? "PARTIAL" : "FAILED";
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

  const callResult = await caller.compile(input);
  const compiledAt = new Date().toISOString();

  if (!callResult.submission) {
    const result: SemanticCompilationResult = {
      status: "FAILED",
      failureReasons: [callResult.failureReason ?? "MODEL_SCHEMA_FAILURE"],
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
  if (!validation.ok) failureReasons.push("IR_VALIDATION_FAILURE");
  if (normalized.rules.length === 0 && normalized.definitions.length === 0) failureReasons.push("PARTIAL_COMPILATION");
  if (normalized.rules.some((r) => r.sufficiency === "MISSING_CONTEXT") || normalized.definitions.some((d) => d.sufficiency === "MISSING_CONTEXT")) failureReasons.push("MISSING_CONTEXT");
  if (normalized.rules.some((r) => r.sufficiency === "CONFLICTED")) failureReasons.push("OPERATIVE_STATE_UNRESOLVED");
  if (normalized.rules.some((r) => r.sufficiency === "UNSUPPORTED") || normalized.definitions.some((d) => d.sufficiency === "UNSUPPORTED")) failureReasons.push("UNSUPPORTED_SEMANTICS");

  const hasReviewRequiredSufficiency = normalized.rules.some((r) => r.sufficiency !== "COMPLETE") || normalized.definitions.some((d) => d.sufficiency !== "COMPLETE");
  const unresolvedIssues = [...validation.issues.map((i) => `[${i.kind}]${i.ruleId ? ` (${i.ruleId})` : ""} ${i.message}`), ...normalized.warnings.map((w) => `[${w.scope}] ${w.message}`), ...callResult.submission.overallNotes];

  const result: SemanticCompilationResult = {
    status: determineStatus(failureReasons, normalized.rules.length + normalized.definitions.length, hasReviewRequiredSufficiency, unresolvedIssues.length > 0),
    failureReasons,
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
}
