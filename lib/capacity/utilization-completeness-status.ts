/**
 * Explicit utilization-completeness authority ladder (Agent 2).
 *
 * Distinguishes five mutually exclusive statuses. Never promotes one into
 * another implicitly — each step requires affirmative evidence.
 *
 *   NO_UTILIZATION_RECORDS
 *   SOME_UTILIZATION_RECORDS
 *   RECONCILED_UTILIZATION_HISTORY
 *   REVIEWED_COMPLETENESS
 *   TRUSTED_AUTHORIZED_COMPLETENESS
 */

import type { TrustedIssuerAuthorizationContext } from "./completeness-issuer-auth";
import {
  evaluateCompletenessForRemainingClaim,
  type SolverCompletenessCertInput,
} from "./utilization-authority";
import type {
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
} from "./utilization-types";
import type { UtilizationReconstructionResult } from "./utilization-evidence-reconstruction";

export type UtilizationCompletenessAuthorityStatus =
  | "NO_UTILIZATION_RECORDS"
  | "SOME_UTILIZATION_RECORDS"
  | "RECONCILED_UTILIZATION_HISTORY"
  | "REVIEWED_COMPLETENESS"
  | "TRUSTED_AUTHORIZED_COMPLETENESS";

export const UTILIZATION_COMPLETENESS_AUTHORITY_VERSION =
  "utilization-completeness-authority.v1" as const;

export interface ClassifyUtilizationCompletenessArgs {
  capacityRuleId: string;
  asOf: string;
  records: readonly UtilizationEvidenceRecord[];
  /**
   * Optional reconstruction envelope — when present, RECONCILED requires
   * attributed path usage with no unallocated path blockers that prevent
   * chronological reconciliation.
   */
  reconstruction?: UtilizationReconstructionResult | null;
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  allowSyntheticRemaining?: boolean;
}

export interface UtilizationCompletenessAuthorityResult {
  contractVersion: typeof UTILIZATION_COMPLETENESS_AUTHORITY_VERSION;
  status: UtilizationCompletenessAuthorityStatus;
  /** True only for TRUSTED_AUTHORIZED_COMPLETENESS (or demo hatch REVIEWED with synthetic). */
  maySupportRemainingClaim: boolean;
  productionAuthoritative: boolean;
  recordCount: number;
  attributedRecordCount: number;
  blockers: string[];
  note: string;
  /**
   * Explicit ladder — each boolean is independently evidenced.
   * Higher rungs never imply lower ones were skipped without evidence.
   */
  ladder: {
    hasAnyRecords: boolean;
    hasAttributedRecords: boolean;
    historyReconciled: boolean;
    reviewerConfirmed: boolean;
    trustedAuthorized: boolean;
  };
}

function activeAttributed(
  records: readonly UtilizationEvidenceRecord[],
  capacityRuleId: string,
): UtilizationEvidenceRecord[] {
  return records.filter(
    (r) =>
      r.capacityRuleId === capacityRuleId &&
      (r.status === "ACTIVE" ||
        r.status === "RECORDED" ||
        r.status === "RECLASSIFICATION_ELECTION") &&
      r.kind !== "SUPERSEDED" &&
      r.approvalState === "APPROVED",
  );
}

/**
 * Classify utilization completeness without implicit promotion.
 * Empty ledger → NO_UTILIZATION_RECORDS (not verified zero).
 */
export function classifyUtilizationCompletenessAuthority(
  args: ClassifyUtilizationCompletenessArgs,
): UtilizationCompletenessAuthorityResult {
  const blockers: string[] = [];
  const attributed = activeAttributed(args.records, args.capacityRuleId);
  const hasAnyRecords = args.records.length > 0;
  const hasAttributedRecords = attributed.length > 0;

  // Reconciliation: explicit reconstruction attributed the path with no unallocated
  // observations remaining in the envelope. Approved attributed records required.
  // Without a reconstruction envelope, records alone stay SOME — never promoted.
  let historyReconciled = false;
  if (args.reconstruction) {
    const recon = args.reconstruction;
    const pathUnallocated = recon.usageUnallocated.filter(
      (e) =>
        e.applicableProvisionId === args.capacityRuleId ||
        e.applicableProvisionId == null,
    );
    historyReconciled =
      hasAttributedRecords &&
      recon.ok &&
      recon.usageAttributed.length > 0 &&
      recon.layers.includes("USAGE_ATTRIBUTED") &&
      pathUnallocated.length === 0;
  }

  const cert = args.completenessCertificate as SolverCompletenessCertInput | null;
  const completenessEval = evaluateCompletenessForRemainingClaim({
    cert,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSyntheticRemaining,
  });

  const reviewerConfirmed =
    cert != null &&
    cert.approvalState === "APPROVED" &&
    cert.capacityRuleId === args.capacityRuleId &&
    (cert.kind === "VERIFIED_COMPLETE" || cert.kind === "VERIFIED_EMPTY") &&
    (cert.authenticity === "AUTHENTIC" ||
      (args.allowSyntheticRemaining === true && cert.authenticity === "SYNTHETIC_LABELED"));

  const trustedAuthorized =
    completenessEval.productionAuthoritative === true && reviewerConfirmed;

  // Demo hatch: synthetic reviewed completeness may support remaining claims
  // without production authority — still never TRUSTED_AUTHORIZED.
  const syntheticReviewed =
    args.allowSyntheticRemaining === true &&
    completenessEval.demoSynthetic === true &&
    reviewerConfirmed;

  const ladder = {
    hasAnyRecords,
    hasAttributedRecords,
    historyReconciled,
    reviewerConfirmed,
    trustedAuthorized,
  };

  let status: UtilizationCompletenessAuthorityStatus;
  if (trustedAuthorized) {
    status = "TRUSTED_AUTHORIZED_COMPLETENESS";
  } else if (reviewerConfirmed || syntheticReviewed) {
    // REVIEWED requires reviewer certificate — never inferred from record count.
    status = "REVIEWED_COMPLETENESS";
    if (!trustedAuthorized) {
      blockers.push(
        ...completenessEval.blockers,
        "reviewed completeness is not trusted-authorized — production remaining refused",
      );
    }
  } else if (historyReconciled) {
    status = "RECONCILED_UTILIZATION_HISTORY";
    blockers.push(
      "utilization history reconciled but completeness not reviewer-confirmed — remaining not supported",
    );
  } else if (hasAnyRecords) {
    status = "SOME_UTILIZATION_RECORDS";
    blockers.push(
      "some utilization records present — incomplete history; empty-attribution gaps are not zero",
    );
  } else {
    status = "NO_UTILIZATION_RECORDS";
    blockers.push(
      "no utilization records — empty ledger does not establish that a basket is unused",
    );
  }

  // VERIFIED_EMPTY certificate with zero records can still be REVIEWED / TRUSTED.
  if (
    !hasAnyRecords &&
    cert?.kind === "VERIFIED_EMPTY" &&
    (reviewerConfirmed || trustedAuthorized)
  ) {
    status = trustedAuthorized
      ? "TRUSTED_AUTHORIZED_COMPLETENESS"
      : "REVIEWED_COMPLETENESS";
    // Remove the empty-ledger blocker when certificate affirms emptiness.
    const filtered = blockers.filter((b) => !/no utilization records/i.test(b));
    blockers.length = 0;
    blockers.push(...filtered);
    if (!trustedAuthorized && !syntheticReviewed) {
      blockers.push(
        "verified-empty certificate reviewed but not trusted-authorized",
      );
    }
  }

  const maySupportRemainingClaim =
    status === "TRUSTED_AUTHORIZED_COMPLETENESS" ||
    (status === "REVIEWED_COMPLETENESS" && syntheticReviewed);

  const note = `Utilization completeness authority=${status}; remainingSupported=${maySupportRemainingClaim}; productionAuthoritative=${trustedAuthorized}.`;

  return {
    contractVersion: UTILIZATION_COMPLETENESS_AUTHORITY_VERSION,
    status,
    maySupportRemainingClaim,
    productionAuthoritative: trustedAuthorized,
    recordCount: args.records.length,
    attributedRecordCount: attributed.length,
    blockers: [...new Set(blockers)],
    note,
    ladder,
  };
}
