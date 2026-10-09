/**
 * Legal-safety promotion guards for WS-CCA compute outputs.
 *
 * Incomplete structural extraction, Pass A signals, and compute assessments
 * must never be treated as legally verified or as affirmative covenant /
 * capacity conclusions. Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */

export class ComputePromotionSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComputePromotionSafetyError";
  }
}

/** Statuses that are never eligible for legal / capacity promotion. */
export const NON_PROMOTABLE_EXTRACTION_STATUSES = [
  "STRUCTURE_EMPTY",
  "MISSING_DEFINITIONS",
  "STRUCTURE_BROKEN_HIERARCHY",
  "FAILED",
  "UNSUPPORTED",
  "OVERSIZED",
  "SKIPPED_DUPLICATE",
] as const;

export type NonPromotableExtractionStatus = (typeof NON_PROMOTABLE_EXTRACTION_STATUSES)[number];

const FORBIDDEN_LEGAL_STATUSES = [
  "REVIEWER_VERIFIED",
  "CERTIFIED",
  "OPERATIVE",
  "APPROVED_CAPACITY",
] as const;

const CAPACITY_WRITE_TARGETS = [
  "Permission",
  "PermissionRelationship",
  "SharedCapacityConstraint",
  "CovenantProvision",
  "ContractRule",
  "SemanticTruthRecord",
] as const;

export function isNonPromotableExtractionStatus(status: string): boolean {
  return (NON_PROMOTABLE_EXTRACTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Fail closed: incomplete or quality-flagged structural extraction cannot be
 * promoted into affirmative covenant / capacity conclusions.
 */
export function assertCannotPromoteIncompleteStructure(params: {
  extractionStatus: string;
  verificationStatus?: string | null;
  target?: string | null;
  proposedLegalStatus?: string | null;
}): void {
  const verification = params.verificationStatus ?? "SOURCE_ONLY";
  if (verification !== "SOURCE_ONLY" && verification !== "HYPOTHESIS" && verification !== "COMPUTE_ASSESSMENT_NOT_CERTIFIED") {
    if ((FORBIDDEN_LEGAL_STATUSES as readonly string[]).includes(verification)) {
      throw new ComputePromotionSafetyError(
        `legal-safety: compute path cannot set verificationStatus=${verification}`,
      );
    }
  }

  if (params.proposedLegalStatus && (FORBIDDEN_LEGAL_STATUSES as readonly string[]).includes(params.proposedLegalStatus)) {
    throw new ComputePromotionSafetyError(
      `legal-safety: compute outputs cannot be promoted to ${params.proposedLegalStatus}`,
    );
  }

  if (params.target && (CAPACITY_WRITE_TARGETS as readonly string[]).includes(params.target)) {
    throw new ComputePromotionSafetyError(
      `legal-safety: WS-CCA must not write ${params.target}; compute/structure signals are not approved capacity rules`,
    );
  }

  if (isNonPromotableExtractionStatus(params.extractionStatus)) {
    throw new ComputePromotionSafetyError(
      `legal-safety: extractionStatus=${params.extractionStatus} is incomplete/quality-flagged and cannot be treated as legally verified or as an affirmative covenant conclusion`,
    );
  }
}

/**
 * Even structurally OK compute outputs remain SOURCE_ONLY. Pass A / structure
 * success is not legal verification.
 */
export function assertComputeOutputRemainsSourceOnly(verificationStatus: string): void {
  if (verificationStatus !== "SOURCE_ONLY") {
    throw new ComputePromotionSafetyError(
      `legal-safety: WS-CCA outputs must remain SOURCE_ONLY (got ${verificationStatus}); IMPLEMENTED ≠ CERTIFIED`,
    );
  }
}

export function structureSuccessIsNotLegalVerification(params: {
  nodeCount: number;
  extractionStatus: string;
}): { legallyVerified: false; affirmativeCovenantConclusion: false; note: string } {
  return {
    legallyVerified: false,
    affirmativeCovenantConclusion: false,
    note:
      params.nodeCount === 0 || isNonPromotableExtractionStatus(params.extractionStatus)
        ? "Incomplete structural extraction — blocked from legal promotion."
        : "Structural/Pass A success is SOURCE_ONLY compute evidence, never legal verification.",
  };
}
