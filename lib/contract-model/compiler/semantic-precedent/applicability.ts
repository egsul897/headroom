/**
 * Phase 3D - Stage 2 applicability ranking + conflict detection (task
 * §15-§16). Takes Stage 1's broad candidate list (retrieval.ts) and decides
 * APPLICABLE / PARTIALLY_APPLICABLE / CONFLICTING / INSUFFICIENT_EVIDENCE /
 * NOT_APPLICABLE for each - "never inject precedent merely on high
 * retrieval score" (task §16), so this module layers on TOP of Stage 1's
 * raw score: core-dimension coverage, precedent review-quality signals
 * (task §27's own "reviewer approval, verifier agreement, diversity,
 * counterexamples ... do not equate frequency with correctness"), pairwise
 * conflict detection between candidates that share a bucket but disagree on
 * shape, and an explicit negative-precedent contrast check (task §27's own
 * "support negative precedent - this superficially similar pattern is NOT
 * equivalent").
 *
 * PERMANENT INVARIANT (task §16): this module only ever LABELS a
 * precedent's relationship to the current query. It never edits, injects
 * into, or overrides anything about the current source/IR - that remains
 * the caller's (compiler/verifier integration, task #144/#145) sole
 * responsibility, and "current source always wins" is enforced there, not
 * here.
 *
 * No company/package/section-specific logic anywhere in this file
 * (Architecture Invariant #29).
 */
import { SEMANTIC_PRECEDENT_RETRIEVAL_ALGORITHM_VERSION, scoreSignatureOverlap } from "./retrieval";
import type { RetrievalCandidate } from "./retrieval";
import type { GeneralizedPrecedent, PrecedentApplicability, PrecedentRetrievalMatch, SemanticSignature } from "./types";

export const SEMANTIC_PRECEDENT_APPLICABILITY_ALGORITHM_VERSION = "phase-3d-precedent-applicability.v1";

/** The three dimensions strong enough, on their own, to anchor a real applicability judgment - everything else in scoreSignatureOverlap is corroborating, not sufficient alone (task §14's own "textual similarity necessary but not sufficient" applied one layer up). */
const CORE_DIMENSIONS = ["ACTION", "POSTURE", "TOP_LEVEL_OPERATOR"];

function coreDimensionCoverage(matchedDimensions: string[]): number {
  return matchedDimensions.filter((d) => CORE_DIMENSIONS.includes(d)).length;
}

/** Quality-signal downgrade (task §27) - a precedent's own review/support history can only ever cap applicability DOWN from what raw structural overlap alone would suggest, never lift it. */
function qualityCappedApplicability(base: PrecedentApplicability, precedent: GeneralizedPrecedent): PrecedentApplicability {
  if (base !== "APPLICABLE") return base;
  if (precedent.reviewStatus === "APPROVED_WITH_LIMITATIONS") return "PARTIALLY_APPLICABLE";
  if (precedent.support.knownCounterexampleInstanceIds.length > 0) return "PARTIALLY_APPLICABLE";
  return base;
}

function baseApplicability(candidate: RetrievalCandidate): { applicability: PrecedentApplicability; reasoning: string } {
  const coverage = coreDimensionCoverage(candidate.matchedDimensions);
  if (coverage >= 3 && candidate.candidateScore >= 3) {
    return { applicability: "APPLICABLE", reasoning: `all ${CORE_DIMENSIONS.length} core dimensions (${CORE_DIMENSIONS.join(", ")}) matched with candidateScore=${candidate.candidateScore.toFixed(2)}` };
  }
  if (coverage >= 2) {
    return { applicability: "PARTIALLY_APPLICABLE", reasoning: `${coverage}/${CORE_DIMENSIONS.length} core dimensions matched (${candidate.matchedDimensions.join(", ")}) - real overlap, but not a full structural match` };
  }
  return { applicability: "INSUFFICIENT_EVIDENCE", reasoning: `only ${coverage}/${CORE_DIMENSIONS.length} core dimensions matched (${candidate.matchedDimensions.join(", ") || "none"}) - too weak to advise on its own` };
}

/**
 * Pairwise conflict detection (task §27's own "never silently pick highest
 * similarity"): two candidates that both clear PARTIALLY_APPLICABLE or
 * better, agree on enough core structure to be "the same bucket," but
 * disagree on the actual top-level operator (MAX vs MIN, AND vs OR) are
 * genuinely conflicting guidance for the same query - surfaced explicitly
 * rather than one silently winning by score.
 */
function detectConflicts(candidates: RetrievalCandidate[], applicabilityByPrecedentId: Map<string, PrecedentApplicability>): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  const contestable = candidates.filter((c) => {
    const a = applicabilityByPrecedentId.get(c.precedent.precedentId);
    return a === "APPLICABLE" || a === "PARTIALLY_APPLICABLE";
  });

  for (let i = 0; i < contestable.length; i++) {
    for (let j = i + 1; j < contestable.length; j++) {
      const a = contestable[i]!;
      const b = contestable[j]!;
      const sameBucket = a.precedent.signature.action === b.precedent.signature.action && a.precedent.signature.posture === b.precedent.signature.posture;
      const differentShape = a.precedent.signature.topLevelOperator !== null && b.precedent.signature.topLevelOperator !== null && a.precedent.signature.topLevelOperator !== b.precedent.signature.topLevelOperator;
      if (sameBucket && differentShape) {
        const existingA = conflicts.get(a.precedent.precedentId) ?? [];
        const existingB = conflicts.get(b.precedent.precedentId) ?? [];
        conflicts.set(a.precedent.precedentId, [...existingA, b.precedent.precedentId]);
        conflicts.set(b.precedent.precedentId, [...existingB, a.precedent.precedentId]);
      }
    }
  }
  return conflicts;
}

export function rankApplicability(candidates: RetrievalCandidate[]): PrecedentRetrievalMatch[] {
  const baseByPrecedentId = new Map<string, { applicability: PrecedentApplicability; reasoning: string }>();
  for (const candidate of candidates) {
    const base = baseApplicability(candidate);
    baseByPrecedentId.set(candidate.precedent.precedentId, base);
  }

  const applicabilityByPrecedentId = new Map<string, PrecedentApplicability>();
  for (const candidate of candidates) {
    const base = baseByPrecedentId.get(candidate.precedent.precedentId)!;
    applicabilityByPrecedentId.set(candidate.precedent.precedentId, qualityCappedApplicability(base.applicability, candidate.precedent));
  }

  const conflicts = detectConflicts(candidates, applicabilityByPrecedentId);

  return candidates.map((candidate) => {
    const id = candidate.precedent.precedentId;
    const base = baseByPrecedentId.get(id)!;
    const capped = applicabilityByPrecedentId.get(id)!;
    const conflictIds = conflicts.get(id) ?? [];
    const applicability: PrecedentApplicability = conflictIds.length > 0 ? "CONFLICTING" : capped;
    const reasoning =
      conflictIds.length > 0
        ? `${base.reasoning}; CONFLICTING - disagrees on shape with ${conflictIds.length} other equally-plausible precedent(s) in the same bucket (never auto-resolved by score)`
        : capped !== base.applicability
          ? `${base.reasoning}; capped from ${base.applicability} to ${capped} by precedent quality signals (review status / known counterexamples)`
          : base.reasoning;

    return {
      precedentId: id,
      precedentVersion: candidate.precedent.version,
      candidateScore: candidate.candidateScore,
      applicability,
      applicabilityReasoning: reasoning,
      conflictsWithPrecedentIds: conflictIds,
      retrievalAlgorithmVersion: SEMANTIC_PRECEDENT_RETRIEVAL_ALGORITHM_VERSION,
      applicabilityAlgorithmVersion: SEMANTIC_PRECEDENT_APPLICABILITY_ALGORITHM_VERSION,
    };
  });
}

const NEGATIVE_PRECEDENT_WARNING_THRESHOLD = 2;

/**
 * Explicit negative-precedent surfacing (task §27) - checks the query
 * signature against every negative precedent's own contrastedWithSignature
 * (the superficially-similar shape it was created to warn about) using the
 * SAME comparison Stage 1 uses for positive candidates, so a query that
 * would otherwise look like a strong match to that superficially-similar
 * shape gets an explicit NOT_APPLICABLE warning instead of silence.
 */
export function checkNegativePrecedentWarnings(querySignature: SemanticSignature, negativePrecedents: GeneralizedPrecedent[]): PrecedentRetrievalMatch[] {
  const warnings: PrecedentRetrievalMatch[] = [];
  for (const precedent of negativePrecedents) {
    if (!precedent.isNegativePrecedent || !precedent.contrastedWithSignature) continue;
    const { score, matched } = scoreSignatureOverlap(querySignature, precedent.contrastedWithSignature);
    if (score < NEGATIVE_PRECEDENT_WARNING_THRESHOLD) continue;
    warnings.push({
      precedentId: precedent.precedentId,
      precedentVersion: precedent.version,
      candidateScore: score,
      applicability: "NOT_APPLICABLE",
      applicabilityReasoning: `matches (${matched.join(", ")}) the superficially-similar shape this negative precedent explicitly warns is NOT equivalent: ${precedent.lessonDescription}`,
      conflictsWithPrecedentIds: [],
      retrievalAlgorithmVersion: SEMANTIC_PRECEDENT_RETRIEVAL_ALGORITHM_VERSION,
      applicabilityAlgorithmVersion: SEMANTIC_PRECEDENT_APPLICABILITY_ALGORITHM_VERSION,
    });
  }
  return warnings;
}
