/**
 * Epistemic boundary enforcement for comparison claims.
 *
 * Every elevated standing must carry explicit evidence. Reviewer-verified
 * conclusions require a ClaimReviewRecord bound to claimId + source versions.
 */
import { shortHash } from "./hash";
import type {
  ClaimDimension,
  ClaimEvidence,
  ClaimReviewRecord,
  ComparisonClaim,
  ComparisonStanding,
  DraftingFeature,
} from "./types";

export class EpistemicBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpistemicBoundaryError";
  }
}

const STANDING_RANK: Record<ComparisonStanding, number> = {
  TEXTUAL_SIMILARITY: 1,
  STRUCTURAL_SIMILARITY: 2,
  SEMANTIC_HYPOTHESIS: 3,
  SOURCE_SUPPORTED_LEGAL_DIFFERENCE: 4,
  REVIEWER_VERIFIED_CONCLUSION: 5,
};

export function standingRank(s: ComparisonStanding): number {
  return STANDING_RANK[s];
}

export function maxStandingAmongClaims(claims: ComparisonClaim[]): ComparisonStanding {
  let best: ComparisonStanding = "TEXTUAL_SIMILARITY";
  for (const c of claims) {
    if (standingRank(c.standing) > standingRank(best)) best = c.standing;
  }
  return best;
}

function assertEvidence(standing: ComparisonStanding, evidence: ClaimEvidence, summary: string): void {
  if (!evidence.justification.trim()) {
    throw new EpistemicBoundaryError(`standing ${standing} requires non-empty evidence.justification (${summary.slice(0, 60)})`);
  }
  if (
    (standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" || standing === "REVIEWER_VERIFIED_CONCLUSION") &&
    evidence.sourceExcerpts.length === 0
  ) {
    throw new EpistemicBoundaryError(`standing ${standing} requires sourceExcerpts (${summary.slice(0, 60)})`);
  }
  if (standing === "SEMANTIC_HYPOTHESIS") {
    const s = summary.toLowerCase();
    if (/\bis reviewed precedent\b/.test(s) && !/not reviewed precedent/.test(s)) {
      throw new EpistemicBoundaryError("SEMANTIC_HYPOTHESIS must not be described as reviewed precedent");
    }
  }
  if (standing === "REVIEWER_VERIFIED_CONCLUSION") {
    // claimReviewId checked by makeClaim / attachClaimReviews
  }
}

export function makeClaim(input: {
  standing: ComparisonStanding;
  dimension: ClaimDimension;
  summary: string;
  evidence: ClaimEvidence;
  featuresOnlyIn?: { left: DraftingFeature[]; right: DraftingFeature[] } | null;
  claimReviewId?: string | null;
}): ComparisonClaim {
  assertEvidence(input.standing, input.evidence, input.summary);
  if (input.standing === "REVIEWER_VERIFIED_CONCLUSION" && !input.claimReviewId) {
    throw new EpistemicBoundaryError("REVIEWER_VERIFIED_CONCLUSION requires claimReviewId from ClaimReviewRecord");
  }
  const idBase = `${input.standing}:${input.dimension}:${input.summary}:${input.evidence.justification}`;
  return {
    claimId: `claim_${shortHash(idBase, 12)}`,
    standing: input.standing,
    dimension: input.dimension,
    summary: input.summary,
    evidence: input.evidence,
    sourceEvidence: input.evidence.sourceExcerpts.map((e) => ({ provisionId: e.provisionId, excerpt: e.excerpt })),
    featuresOnlyIn: input.featuresOnlyIn ?? null,
    claimReviewId: input.claimReviewId ?? null,
  };
}

/**
 * Apply claim-level reviews. Elevates a matching claim only when hashes match
 * and disposition is AFFIRM. Never elevates from provision-level approval alone.
 */
export function applyClaimReviews(
  claims: ComparisonClaim[],
  reviews: ClaimReviewRecord[],
  leftProvisionId: string,
  rightProvisionId: string,
  leftHash: string,
  rightHash: string,
  comparisonId: string,
): ComparisonClaim[] {
  const byClaim = new Map(claims.map((c) => [c.claimId, c]));
  const out = claims.map((c) => ({ ...c }));
  for (const review of reviews) {
    if (review.comparisonId !== comparisonId && review.comparisonId !== "*") continue;
    if (review.leftProvisionId !== leftProvisionId || review.rightProvisionId !== rightProvisionId) {
      throw new EpistemicBoundaryError(`claim review ${review.claimReviewId} provision pair mismatch`);
    }
    if (review.leftSourceVersionHash !== leftHash || review.rightSourceVersionHash !== rightHash) {
      throw new EpistemicBoundaryError(
        `claim review ${review.claimReviewId} sourceVersionHash mismatch — approval does not transfer across source versions`,
      );
    }
    if (!review.reviewedBy.trim()) {
      throw new EpistemicBoundaryError(`claim review ${review.claimReviewId} missing reviewedBy`);
    }
    const claim = byClaim.get(review.claimId);
    if (!claim) {
      throw new EpistemicBoundaryError(`claim review ${review.claimReviewId} references unknown claimId ${review.claimId}`);
    }
    if (review.disposition !== "AFFIRM") continue;
    const idx = out.findIndex((c) => c.claimId === review.claimId);
    if (idx < 0) continue;
    const elevatedStanding =
      review.affirmedStanding === "REVIEWER_VERIFIED_CONCLUSION"
        ? "REVIEWER_VERIFIED_CONCLUSION"
        : claim.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE"
          ? "SOURCE_SUPPORTED_LEGAL_DIFFERENCE"
          : claim.standing;
    // Only permit elevation to REVIEWER_VERIFIED when reviewer affirms that standing
    // and the underlying claim already had source-supported evidence.
    if (review.affirmedStanding === "REVIEWER_VERIFIED_CONCLUSION") {
      if (claim.standing !== "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" && claim.standing !== "REVIEWER_VERIFIED_CONCLUSION") {
        throw new EpistemicBoundaryError(
          `cannot verify claim ${claim.claimId} at REVIEWER_VERIFIED — base standing is ${claim.standing}`,
        );
      }
      out[idx] = {
        ...claim,
        standing: "REVIEWER_VERIFIED_CONCLUSION",
        claimReviewId: review.claimReviewId,
        summary: `${claim.summary} [claim-level review ${review.claimReviewId} by ${review.reviewedBy}]`,
        evidence: {
          ...claim.evidence,
          justification: `${claim.evidence.justification} | reviewer ${review.reviewedBy}: ${review.note}`,
        },
      };
    } else {
      out[idx] = { ...claim, claimReviewId: review.claimReviewId, standing: elevatedStanding };
    }
  }
  for (const c of out) {
    assertEvidence(c.standing, c.evidence, c.summary);
    if (c.standing === "REVIEWER_VERIFIED_CONCLUSION" && !c.claimReviewId) {
      throw new EpistemicBoundaryError(`orphan REVIEWER_VERIFIED claim ${c.claimId}`);
    }
  }
  return out;
}

export function evidenceFromExcerpts(
  excerpts: Array<{ provisionId: string; excerpt: string; sourceVersionHash: string }>,
  justification: string,
  structuralKeys: string[] = [],
): ClaimEvidence {
  return { sourceExcerpts: excerpts, structuralKeys, justification };
}
