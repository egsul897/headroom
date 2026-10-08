import type { SourceToCovenantRecord } from "./types";
import type {
  ControllingContextAudit,
  DuplicateDecision,
  EvaluationEligibility,
  TrainingEligibility,
  DeliveryVerificationStatus,
} from "./types-v2";
import { HELDOUT_ISSUER_IDS } from "./catalog";

export function computeTrainingEligibility(args: {
  record: SourceToCovenantRecord;
  deliveryVerificationStatus: DeliveryVerificationStatus;
  context: ControllingContextAudit;
  duplicate: DuplicateDecision | null;
}): TrainingEligibility {
  const { record, deliveryVerificationStatus, context, duplicate } = args;

  if ((HELDOUT_ISSUER_IDS as readonly string[]).includes(record.document.issuerId) || record.split === "eval-heldout") {
    return "BLOCKED_HELDOUT_ISSUER";
  }
  if (duplicate && !duplicate.trainingEligible) {
    return "BLOCKED_DUPLICATE_OBSERVATION";
  }
  if (deliveryVerificationStatus !== "VERIFIED") {
    if (
      deliveryVerificationStatus === "HYPOTHESIS" ||
      record.output.verificationStatus === "UNRESOLVED" ||
      record.output.verificationStatus === "UNSUPPORTED" ||
      record.output.verificationStatus === "MODEL_HYPOTHESIS"
    ) {
      return "BLOCKED_HYPOTHESIS_OR_UNRESOLVED";
    }
    return "BLOCKED_UNVERIFIED_LABEL";
  }
  if (context.status === "CONTEXT_INCOMPLETE") {
    return "BLOCKED_CONTEXT_INCOMPLETE";
  }
  // Even VERIFIED still requires usage-rights review before SFT.
  return "ELIGIBLE_PENDING_RIGHTS_AND_VERIFICATION";
}

export function computeEvaluationEligibility(args: {
  record: SourceToCovenantRecord;
  context: ControllingContextAudit;
  duplicate: DuplicateDecision | null;
  isBenchmarkCase: boolean;
}): EvaluationEligibility {
  const { record, context, duplicate, isBenchmarkCase } = args;
  if (duplicate?.classification === "INTENTIONAL_DEDUP_PROBE") {
    return "EVAL_INELIGIBLE_DUPLICATE_PROBE";
  }
  if (context.status === "CONTEXT_INCOMPLETE" && record.split !== "eval-heldout" && !isBenchmarkCase) {
    // Still allow held-out / benchmark incompleteness as evaluation stress cases.
    if (!isBenchmarkCase && record.split === "train") return "EVAL_INELIGIBLE_INCOMPLETE";
  }
  if (record.split === "eval-heldout") return "EVAL_ELIGIBLE_HELD_OUT";
  if (isBenchmarkCase) return "EVAL_ELIGIBLE_BENCHMARK_CASE";
  return "EVAL_ELIGIBLE_DEV_DIAGNOSTIC";
}

/** SFT may only include VERIFIED + rights-cleared records. Phase 2: always empty. */
export function isSftExportAllowed(trainingEligibility: TrainingEligibility, deliveryVerificationStatus: DeliveryVerificationStatus): boolean {
  return (
    deliveryVerificationStatus === "VERIFIED" &&
    trainingEligibility === "ELIGIBLE_PENDING_RIGHTS_AND_VERIFICATION" &&
    false // usage-rights not cleared in Phase 2 — hard block
  );
}
