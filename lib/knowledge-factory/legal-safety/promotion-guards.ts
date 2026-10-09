/**
 * Legal safety: discovery/taxonomy/pattern similarity must never silently
 * promote a provision into an approved capacity rule.
 */

import type { KnowledgeRepresentationLevel } from "../types";
import { assertNotSilentPromotion } from "../representation/levels";

export class LegalSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegalSafetyError";
  }
}

const CAPACITY_WRITE_TARGETS = [
  "Permission",
  "PermissionRelationship",
  "SharedCapacityConstraint",
  "CovenantProvision",
  "ContractRule",
  "SemanticTruthRecord",
] as const;

export function assertKnowledgeFactoryCannotWriteCapacity(target: string): void {
  if ((CAPACITY_WRITE_TARGETS as readonly string[]).includes(target)) {
    throw new LegalSafetyError(
      `legal-safety: knowledge factory must not write ${target}; discovery/taxonomy/pattern labels are not approved capacity rules`,
    );
  }
}

export function assertRepresentationCannotApproveCapacity(level: KnowledgeRepresentationLevel): void {
  assertNotSilentPromotion(level);
  if (level === "DISCOVERED_CANDIDATE" || level === "SEMANTIC_HYPOTHESIS" || level === "DETERMINISTICALLY_VALIDATED") {
    // Explicitly allowed as non-capacity states — no throw.
    return;
  }
  if (level === "REVIEWER_VERIFIED" || level === "CERTIFIED") {
    throw new LegalSafetyError(`legal-safety: automated path cannot set ${level}`);
  }
}

export function patternSimilarityIsNotRuleApproval(similarity: number): { approved: false; note: string } {
  return {
    approved: false,
    note: `Similarity ${similarity} is a retrieval aid only and never approves a capacity rule.`,
  };
}

export function taxonomyLabelIsNotOperativeAuthority(family: string): { operative: false; note: string } {
  return {
    operative: false,
    note: `Taxonomy label "${family}" is a discovery classification, not operative legal authority.`,
  };
}
