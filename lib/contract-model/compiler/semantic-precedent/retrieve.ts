/**
 * Phase 3D - thin Stage 1 + Stage 2 orchestrator (task §14's own two-stage
 * retrieval, combined into one caller-facing entry point). Deliberately NOT
 * where any scoring/applicability logic lives - retrieval.ts and
 * applicability.ts each own their own concern; this module only sequences
 * them and applies the bounded top-K advisory cutoff (task §19's own
 * "bounded top-K, never the whole library dumped into prompt").
 */
import { checkNegativePrecedentWarnings, rankApplicability } from "./applicability";
import { generateCandidates } from "./retrieval";
import type { GenerateCandidatesOptions } from "./retrieval";
import type { GeneralizedPrecedent, PrecedentRetrievalResult, SemanticSignature } from "./types";

export interface RetrievePrecedentOptions extends GenerateCandidatesOptions {
  /** Hard cap on how many APPLICABLE precedents may be surfaced as advisory evidence to a compiler/verifier prompt - independent of how many candidates Stage 1 generated. */
  maxAdvisoryPrecedents?: number;
}

const DEFAULT_MAX_ADVISORY_PRECEDENTS = 3;

/**
 * Runs Stage 1 (candidate generation) then Stage 2 (applicability ranking +
 * conflict detection) against an already tenancy/package-filtered precedent
 * pool, plus an explicit negative-precedent contrast check. The caller
 * (compiler/verifier integration) is responsible for having filtered
 * `precedents`/`negativePrecedents` via store.ts's own tenancy/exclusion
 * filters BEFORE calling this - this function has no concept of tenant or
 * package and never could (task §9's own mechanical anti-memorization
 * requirement extends to this orchestration layer too).
 */
export function retrievePrecedent(candidateRef: string, querySignature: SemanticSignature, precedents: GeneralizedPrecedent[], options: RetrievePrecedentOptions = {}): PrecedentRetrievalResult {
  const positivePrecedents = precedents.filter((p) => !p.isNegativePrecedent);
  const negativePrecedents = precedents.filter((p) => p.isNegativePrecedent);

  const candidates = generateCandidates(querySignature, positivePrecedents, options);
  const positiveMatches = rankApplicability(candidates);
  const negativeWarnings = checkNegativePrecedentWarnings(querySignature, negativePrecedents);

  const matches = [...positiveMatches, ...negativeWarnings];

  const maxAdvisory = options.maxAdvisoryPrecedents ?? DEFAULT_MAX_ADVISORY_PRECEDENTS;
  const boundedAdvisoryPrecedentIds = matches
    .filter((m) => m.applicability === "APPLICABLE")
    .sort((a, b) => b.candidateScore - a.candidateScore)
    .slice(0, maxAdvisory)
    .map((m) => m.precedentId);

  return { candidateRef, matches, boundedAdvisoryPrecedentIds, retrievedAt: new Date().toISOString() };
}
