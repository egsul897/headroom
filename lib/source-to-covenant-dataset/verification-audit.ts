/**
 * Phase 2 verification integrity audit.
 *
 * Do NOT invent reviewers or approvals. If independent review cannot be
 * demonstrated, do not represent the record as independently verified.
 */
import type { SourceToCovenantRecord, LabelVerificationStatus } from "./types";
import type {
  DeliveryVerificationStatus,
  VerificationEvidence,
  VerificationHistoryEntry,
} from "./types-v2";

const AUDIT_AT = "2026-10-08T22:30:00.000Z";

export function mapToDeliveryStatus(status: LabelVerificationStatus): DeliveryVerificationStatus {
  switch (status) {
    case "HUMAN_SOURCE_VERIFIED":
      // Only maps to VERIFIED when independence + verificationRecordId exist (enforced elsewhere).
      return "REVIEW_REQUIRED";
    case "HUMAN_HYPOTHESIS":
    case "MODEL_HYPOTHESIS":
      return "HYPOTHESIS";
    case "UNRESOLVED":
    case "UNSUPPORTED":
      return "REVIEW_REQUIRED";
    case "NOT_APPLICABLE":
      return "SOURCE_ONLY";
    default:
      return "HYPOTHESIS";
  }
}

export interface VerificationAuditResult {
  priorStatus: LabelVerificationStatus;
  status: LabelVerificationStatus;
  deliveryVerificationStatus: DeliveryVerificationStatus;
  verificationEvidence: VerificationEvidence;
  verificationHistory: VerificationHistoryEntry[];
  demoted: boolean;
}

/**
 * Audit one record's verification claim.
 * Catalog authoring by the dataset agent is NOT independent review.
 */
export function auditVerificationClaim(record: SourceToCovenantRecord): VerificationAuditResult {
  const prior = record.output.verificationStatus;
  const history: VerificationHistoryEntry[] = [];
  let status = prior;
  let demoted = false;

  const evidence: VerificationEvidence = {
    reviewerId: null,
    reviewerDisplayName: null,
    reviewDate: null,
    sourcePackage: record.document.instrumentKey,
    operativeVersion: record.operativeVersion.operativeDocumentId,
    exactScopeOfReview: null,
    evidenceSupportingInterpretation: [
      `sourceFixture=${record.document.sourceFixturePath}`,
      `windowSha256=${record.input.windowSha256}`,
      `sectionRef=${record.structural.sectionRef}`,
    ],
    reviewerIndependentOfLabelGeneration: null,
    verificationRecordId: null,
    independenceGap: null,
  };

  if (prior === "HUMAN_SOURCE_VERIFIED") {
    // Independent review cannot be demonstrated for Phase-1 catalog labels:
    // the same agent authored the candidate label and marked it verified.
    demoted = true;
    status = "HUMAN_HYPOTHESIS";
    evidence.independenceGap =
      "Phase-1 HUMAN_SOURCE_VERIFIED reflected catalog-author source reading by the dataset builder, not an independent reviewer with a verification_record_id. Preserved in verificationHistory; demoted per Phase-2 ground-truth integrity.";
    evidence.reviewerIndependentOfLabelGeneration = false;
    evidence.exactScopeOfReview =
      "No independent review scope recorded. Catalog author checked the cited source window while generating the candidate label.";
    history.push({
      at: AUDIT_AT,
      fromStatus: "HUMAN_SOURCE_VERIFIED",
      toStatus: "HUMAN_HYPOTHESIS",
      reason: evidence.independenceGap,
      actor: "PHASE2_INTEGRITY_AUDIT",
    });
  } else if (prior === "MODEL_HYPOTHESIS" || prior === "HUMAN_HYPOTHESIS") {
    evidence.independenceGap = "Hypothesis label — not independently verified.";
    evidence.reviewerIndependentOfLabelGeneration = false;
  } else if (prior === "UNRESOLVED" || prior === "UNSUPPORTED") {
    evidence.independenceGap = `Status ${prior} — no verified legal interpretation asserted.`;
  } else if (prior === "NOT_APPLICABLE") {
    evidence.independenceGap = "Negative / non-covenant material — verification N/A.";
  }

  // Never emit delivery VERIFIED without verification_record_id.
  let delivery = mapToDeliveryStatus(status);
  if (delivery === "VERIFIED" && !evidence.verificationRecordId) {
    delivery = "REVIEW_REQUIRED";
  }
  // After demotion, hypotheses map to HYPOTHESIS.
  if (status === "HUMAN_HYPOTHESIS" || status === "MODEL_HYPOTHESIS") {
    delivery = "HYPOTHESIS";
  }

  return {
    priorStatus: prior,
    status,
    deliveryVerificationStatus: delivery,
    verificationEvidence: evidence,
    verificationHistory: history,
    demoted,
  };
}
