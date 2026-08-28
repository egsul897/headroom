/**
 * Phase 3B - package-level bulk semantic compilation (task §59/§60).
 * Bounded concurrency, per-candidate fault isolation (one candidate's
 * failure never aborts the batch - the exact same discipline
 * stage-rule-extraction.ts's own per-batch try/catch already established
 * for the legacy pipeline), deterministic eligibility filtering, and a
 * package-level summary. This module does not decide HOW to build each
 * candidate's own SemanticCompilerInput (that requires the real
 * CovenantContextBundle/StructuralIndex/OperativeContractState for the
 * actual package being compiled) - the caller supplies one
 * SemanticCompilerInput per eligible candidate, already built via Phase
 * 2's real pipelines.
 */
import type { DiscoveredCandidate, DiscoveryRole } from "../discovery/types";
import { classifyFailureCategory, compileCovenantToIR, sanitizeErrorMessage } from "./compile";
import type { SemanticCaller } from "./caller";
import type { SemanticCompilationCache } from "./cache";
import type { SemanticCompilationResult, SemanticCompilerErrorDetail, SemanticCompilerInput } from "./types";

/**
 * Deterministic, non-package-specific eligibility (task §60's own "do not
 * use package-specific exclusions"): every real covenant-mechanic role is
 * eligible; REPRESENTATION (a representations & warranties clause - legal
 * boilerplate, never itself a capacity mechanic) is the one generic,
 * always-true exclusion. Every other DiscoveryRole is left eligible
 * deliberately - a false negative here (skipping something that mattered)
 * is a materially worse failure mode than a false positive (compiling
 * something that turns out non-substantive, which just costs one call and
 * produces an honest low-value result).
 */
const INELIGIBLE_ROLES = new Set<DiscoveryRole>(["REPRESENTATION"]);

export function isEligibleForSemanticCompilation(candidate: DiscoveredCandidate): { eligible: boolean; reason: string | null } {
  if (INELIGIBLE_ROLES.has(candidate.role)) return { eligible: false, reason: `role ${candidate.role} is representations/warranties boilerplate, not a covenant capacity mechanic` };
  return { eligible: true, reason: null };
}

export interface PackageCompilationCandidate {
  candidate: DiscoveredCandidate;
  compilerInput: SemanticCompilerInput;
}

export interface PackageCompilationOptions {
  concurrency?: number;
  caller?: SemanticCaller;
  cache?: SemanticCompilationCache;
}

export interface PackageCompilationResultEntry {
  discoveryId: string;
  result: SemanticCompilationResult;
}

export interface PackageCompilationSummary {
  companyId: string;
  instrumentKey: string;
  totalCandidates: number;
  eligibleCount: number;
  skipped: { discoveryId: string; reason: string }[];
  results: PackageCompilationResultEntry[];
  completedCount: number;
  partialCount: number;
  reviewRequiredCount: number;
  failedCount: number;
}

const DEFAULT_CONCURRENCY = 4;

/** Hand-rolled bounded-concurrency pool - no external dependency needed for this small, well-understood shape. Every task settles independently (fault isolation); a rejected task is caught and mapped to a FAILED-shaped result by the caller, never left unhandled and never allowed to reject the whole Promise.all. */
async function runBounded<TIn, TOut>(items: TIn[], concurrency: number, worker: (item: TIn) => Promise<TOut>): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  async function runner(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

export async function compilePackageToIR(companyId: string, instrumentKey: string, candidates: PackageCompilationCandidate[], options: PackageCompilationOptions = {}): Promise<PackageCompilationSummary> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const skipped: PackageCompilationSummary["skipped"] = [];
  const eligible: PackageCompilationCandidate[] = [];

  for (const c of candidates) {
    const check = isEligibleForSemanticCompilation(c.candidate);
    if (!check.eligible) {
      skipped.push({ discoveryId: c.candidate.discoveryId, reason: check.reason! });
      continue;
    }
    eligible.push(c);
  }

  // Phase 3F.1 §33/F6: compileCovenantToIR itself no longer throws (every
  // failure path, including a genuine transport/internal exception, now
  // returns a structured SemanticCompilationResult with populated
  // errorDetail) - this try/catch is a redundant secondary safety net kept
  // for defense in depth, using the same sanitized/classified error-detail
  // shape so a truly unexpected throw here (e.g. from compilerInput
  // construction itself, outside compileCovenantToIR) is never reduced to a
  // bare status string either.
  const entries = await runBounded(eligible, concurrency, async (c): Promise<PackageCompilationResultEntry> => {
    try {
      const result = await compileCovenantToIR(c.compilerInput, { caller: options.caller, cache: options.cache });
      return { discoveryId: c.candidate.discoveryId, result };
    } catch (err) {
      const errorClass = err instanceof Error ? err.constructor.name : "UnknownError";
      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitizedMessage = sanitizeErrorMessage(rawMessage);
      const errorDetail: SemanticCompilerErrorDetail = { errorClass, sanitizedMessage, failureCategory: classifyFailureCategory(errorClass, rawMessage), retryCount: null, hadPartialOutput: false };
      return {
        discoveryId: c.candidate.discoveryId,
        result: {
          status: "FAILED",
          failureReasons: ["TRANSPORT_OR_INTERNAL_ERROR"],
          errorDetail,
          rules: [],
          definitions: [],
          sharedCapacities: [],
          irExtensionCandidates: [],
          unresolvedIssues: [`uncaught error compiling candidate ${c.candidate.discoveryId}: ${errorClass}: ${sanitizedMessage}`],
          toolCallLog: [],
          rawModelOutput: null,
          provider: options.caller?.providerName ?? "unknown",
          model: options.caller?.model ?? "unknown",
          telemetry: null,
          cacheKey: `error:${c.candidate.discoveryId}`,
          compiledAt: new Date().toISOString(),
        },
      };
    }
  });

  return {
    companyId,
    instrumentKey,
    totalCandidates: candidates.length,
    eligibleCount: eligible.length,
    skipped,
    results: entries,
    completedCount: entries.filter((e) => e.result.status === "COMPLETED").length,
    partialCount: entries.filter((e) => e.result.status === "PARTIAL").length,
    reviewRequiredCount: entries.filter((e) => e.result.status === "REVIEW_REQUIRED").length,
    failedCount: entries.filter((e) => e.result.status === "FAILED").length,
  };
}
