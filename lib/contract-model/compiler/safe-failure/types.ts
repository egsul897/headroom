/**
 * Phase 3F.1.5.R - explicit claim-level safe-failure domain types.
 *
 * Responds to Evaluation Contract V3's verdict
 * (EVALUATION_CONTRACT_V3_SAFETY_GATE_FAILED_REQUIRES_HUMAN_DECISION): rather
 * than asking an evaluator to reconstruct "did Headroom specifically surface
 * this failure" indirectly from nearby pipeline artifacts, the production
 * pipeline now RECORDS that fact explicitly, as first-class persisted state
 * (see prisma/schema.prisma's ClaimReviewItem/ClaimReviewObservation/
 * ClaimReviewDecision models for the persisted shape these types mirror).
 *
 * This module is a pure derivation/domain layer - it introduces zero new
 * semantic judgment of its own. Every field below is populated from facts
 * the existing, unmodified pipeline stages already compute (semantic-coverage's
 * SemanticUnitCoverageEntry/DangerousUnaccountedSemanticUnit, the semantic
 * compiler's SemanticCompilationResult, the verifier's SemanticVerificationResult).
 * See derive.ts for the actual derivation logic.
 */
import type { ClaimReviewDecisionAction, ClaimReviewPipelineStage, ClaimReviewReasonCode, ClaimReviewStatus } from "@prisma/client";

export type { ClaimReviewDecisionAction, ClaimReviewPipelineStage, ClaimReviewReasonCode, ClaimReviewStatus };

/**
 * Task §7's bounded, non-exhaustive unresolved-dimension vocabulary. A
 * derivation function may emit any of these strings, or a fresh descriptive
 * string when none fits (never forced into a false match) - this is
 * documentation of the expected common values, not a closed enum enforced by
 * the database (ClaimReviewItem.unresolvedDimensions is a plain String[]).
 */
export const KNOWN_UNRESOLVED_DIMENSIONS = [
  "action",
  "posture",
  "object",
  "scope",
  "threshold",
  "metric",
  "condition",
  "exception",
  "dependency",
  "cross-reference",
  "temporal-state",
  "operative-version",
  "shared-cap",
  "builder-grower-mechanics",
  "reclassification",
] as const;

/** Input to record/update one claim's review need - the pure output of a derive.ts function, never constructed by hand from raw pipeline internals outside this module. */
export interface ClaimReviewItemInput {
  companyId: string;
  packageKey: string | null;
  instrumentKey: string | null;
  documentId: string;

  /** Stable, content-derived, sibling-safe claim identity - see identity.ts. Never a freshly invented scheme. */
  claimKey: string;
  structuralNodeId: string | null;
  sectionRef: string | null;
  charStart: number | null;
  charEnd: number | null;
  covenantFamily: string | null;

  /** SemanticUnitMateriality's own vocabulary - reused verbatim, never re-derived. */
  materiality: string;

  reasonCode: ClaimReviewReasonCode;
  unresolvedDimensions: string[];
  originStage: ClaimReviewPipelineStage;

  sourceEvidence: string;
  sourceCitation: string | null;
  relatedSemanticObjectId: string | null;
  operativeVersionRef: string | null;

  rationale: string;
  algorithmVersion: string;
}

/** One pipeline-stage detection to append as a ClaimReviewObservation - always paired with a ClaimReviewItemInput describing the claim it concerns. */
export interface ClaimReviewObservationInput {
  stage: ClaimReviewPipelineStage;
  reasonCode: ClaimReviewReasonCode;
  detail: string;
  algorithmVersion: string;
}

/** Result of recordClaimReview - tells the caller whether this claim's review item was newly created, updated (an existing OPEN item gained a new observation), or left untouched because an identical observation already exists (idempotent re-run). */
export type ClaimReviewRecordOutcome = "CREATED" | "OBSERVATION_APPENDED" | "ALREADY_RECORDED" | "REOPENED_FROM_RESOLVED";

export interface ClaimReviewRecordResult {
  outcome: ClaimReviewRecordOutcome;
  reviewItemId: string;
  claimKey: string;
}

export interface ResolveClaimReviewInput {
  reviewItemId: string;
  action: ClaimReviewDecisionAction;
  note: string | null;
  decidedBy: string | null;
}

/** Section 15's thin evaluator-compatibility function's own result shape - deliberately NOT a new certification threshold, never a new evaluator methodology (Section 15's explicit "do NOT build another evaluator methodology"). */
export interface ExplicitSafeFailureCheckResult {
  claimKey: string;
  noCredit: boolean;
  claimSpecificReviewEventExists: boolean;
  explicitSafeFailure: boolean;
  matchedReviewItemId: string | null;
  matchedReviewItemStatus: ClaimReviewStatus | null;
}
