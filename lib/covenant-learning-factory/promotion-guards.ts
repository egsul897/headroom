/**
 * Legal safety for the learning factory.
 * Extracted interpretations never become production authority automatically.
 */

import type { LearningKnowledgeState } from "./types";

export class LearningFactoryLegalSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningFactoryLegalSafetyError";
  }
}

const FORBIDDEN_AUTO_TARGETS = [
  "Permission",
  "PermissionRelationship",
  "SharedCapacityConstraint",
  "CovenantProvision",
  "ContractRule",
  "SemanticTruthRecord",
  "ContractInputSnapshot.APPROVED",
  "ContractLedgerUsage",
] as const;

export function assertLearningFactoryCannotWriteProductionAuthority(target: string): void {
  if ((FORBIDDEN_AUTO_TARGETS as readonly string[]).includes(target)) {
    throw new LearningFactoryLegalSafetyError(
      `learning-factory must not write ${target}; automated precedent processing is not production legal authority`,
    );
  }
}

/** Automated paths may append PROPOSED or REVIEW_REQUIRED only. */
export function assertAutomatedKnowledgeState(state: LearningKnowledgeState): void {
  if (state === "VERIFIED" || state === "REJECTED" || state === "SUPERSEDED") {
    throw new LearningFactoryLegalSafetyError(
      `automated learning path cannot set knowledge state ${state}; requires attributable reviewer action`,
    );
  }
}

export function defaultHonestyClaims() {
  return {
    trained: false as const,
    certified: false as const,
    generalized: false as const,
    productionReady: false as const,
    autoPromotedLegalAuthority: false as const,
  };
}
