/**
 * Validate ground-truth provenance before a case may execute as authentic.
 * Fail closed: missing fields → case cannot claim independent ground truth.
 */

import { CVF_GROUND_TRUTH_CONTRACT_VERSION } from "./version";
import type { GroundTruthProvenance, VerificationCaseMeta } from "./types";

export interface ProvenanceValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGroundTruthProvenance(p: GroundTruthProvenance): ProvenanceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (p.contractVersion !== CVF_GROUND_TRUTH_CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${CVF_GROUND_TRUTH_CONTRACT_VERSION}`);
  }
  if (!p.issuerId?.trim()) errors.push("issuerId required");
  if (!p.financingPackageId?.trim()) errors.push("financingPackageId required");
  if (!p.sourceDocuments?.length) errors.push("sourceDocuments required");
  for (const d of p.sourceDocuments ?? []) {
    if (!d.path) errors.push(`sourceDocuments[${d.documentId}].path required`);
    if (d.sha256 == null) warnings.push(`sourceDocuments[${d.documentId}].sha256 not yet hashed`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.operativeAsOf ?? "")) {
    errors.push("operativeAsOf must be YYYY-MM-DD");
  }
  if (!p.relevantSections?.length) errors.push("relevantSections required");
  if (!p.independentlyEnumeratedRestrictions?.length) {
    errors.push("independentlyEnumeratedRestrictions required");
  }
  if (!p.expectedLegalOutcome) errors.push("expectedLegalOutcome required");
  if (!p.reviewerIdentity?.trim()) errors.push("reviewerIdentity required");
  if (!p.reviewProvenance?.trim()) errors.push("reviewProvenance required");
  if (!p.confidence) errors.push("confidence required");
  if (!Array.isArray(p.unresolvedAmbiguities)) errors.push("unresolvedAmbiguities must be an array");
  if (!p.frozenAt) errors.push("frozenAt required");
  if (p.notDerivedFromEngine !== true) {
    errors.push("notDerivedFromEngine must be true — never derive expectations from the SUT");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function caseHasIndependentGroundTruth(meta: VerificationCaseMeta): boolean {
  if ("holdoutSealId" in meta.provenance) return true; // sealed holdout still counts as GT case
  return validateGroundTruthProvenance(meta.provenance).ok;
}

/**
 * Freeze guard: refuse to silently rewrite expected outcomes.
 * Callers that want to update GT must pass explicit allowRewrite with a reason.
 */
export function assertExpectationsFrozen(args: {
  previous: GroundTruthProvenance;
  next: GroundTruthProvenance;
  allowRewrite?: { reason: string; approver: string };
}): { ok: boolean; reason: string } {
  if (args.previous.expectedLegalOutcome === args.next.expectedLegalOutcome) {
    return { ok: true, reason: "expected outcome unchanged" };
  }
  if (!args.allowRewrite) {
    return {
      ok: false,
      reason:
        "Silent rewrite of expectedLegalOutcome forbidden. Provide allowRewrite with reason + approver.",
    };
  }
  return {
    ok: true,
    reason: `Rewrite allowed: ${args.allowRewrite.reason} (approver=${args.allowRewrite.approver})`,
  };
}
