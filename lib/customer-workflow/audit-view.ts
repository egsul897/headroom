/**
 * Audit step — coherent explanation of governance, provisions, financials,
 * utilization, assumptions, reviewer approvals, and publishability.
 */

import type { CustomerStatusCode } from "./status-contract";
import { presentCustomerStatus } from "./status-contract";
import type { ReviewViewModel } from "./review-view";
import type { SeparatedCapacityClaims } from "./capacity-state";
import type { AnalyzeViewModel } from "./analyze-view";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";

export interface AuditViewModel {
  companyId: string;
  governingDocuments: string[];
  provisionsApplied: string[];
  financialValuesUsed: string[];
  utilizationEntriesConsidered: string[];
  assumptionsMade: string[];
  reviewerApprovals: string[];
  publishability: {
    publishable: false;
    reasons: string[];
    overallStatus: CustomerStatusCode;
  };
  overallGuidance: string;
}

export function buildAuditView(args: {
  companyId: string;
  analyze: AnalyzeViewModel;
  review: ReviewViewModel;
  capacity: SeparatedCapacityClaims | null;
  asOfDate?: string | null;
}): AuditViewModel {
  const governingDocuments = args.review.governingDocuments.map(
    (d) => `${d.name} [${d.status}]`,
  );

  const provisionsApplied = [
    ...args.capacity?.bindingRestrictions ?? [],
    ...args.capacity?.sourceEvidence ?? [],
    `Rulebook stage: ${args.review.executableRuleCoverage.stage} (not fabricated REVIEWED)`,
  ];

  const financialValuesUsed: string[] = [];
  if (args.asOfDate) financialValuesUsed.push(`Position as-of: ${args.asOfDate}`);
  financialValuesUsed.push(
    args.review.financialEvidence.hasSnapshot
      ? `Financial snapshot present; NS-4/NS APPROVED count=${args.review.financialEvidence.ns4ApprovedCount}`
      : "No authenticated financial snapshot — financial values unavailable (not zero).",
  );

  const utilizationEntriesConsidered = [
    `Active contract-ledger rows: ${args.review.utilizationCompleteness.activeLedgerRows}`,
    args.review.utilizationCompleteness.complete
      ? "Utilization marked complete"
      : "Utilization completeness NOT certified — missing utilization never treated as zero remaining.",
  ];

  const assumptionsMade = [
    "Legacy covenant-engine figures are MODELED / NOT_PRODUCTION_AUTHORITATIVE unless production gates pass.",
    "Gross contractual ceilings are never labeled AVAILABLE.",
    "Upload success does not imply analysis or capacity success.",
    TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.reason,
  ];
  if (args.analyze.compilationLimitation) {
    assumptionsMade.push(args.analyze.compilationLimitation);
  }

  const reviewerApprovals = args.review.approvals.map((a) => {
    if (!a.hasRecordedDecision) {
      return `${a.sectionRef}: no recorded decision (not fabricated APPROVED)`;
    }
    return `${a.sectionRef}: ${a.decision}${a.citation ? ` · ${a.citation}` : ""}`;
  });

  const reasons: string[] = [
    ...args.review.outstandingBlockers,
    ...args.capacity?.missingInputs ?? [],
    ...args.analyze.extractionErrors,
    ...args.analyze.operativeAuthorityUncertainty,
  ];
  if (TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED") {
    reasons.push("Trusted identity production activation BLOCKED.");
  }
  if (!args.capacity?.remainingAuthoritative) {
    reasons.push("Verified remaining not authoritative — result not publishable as AVAILABLE.");
  }

  // Product honesty: never claim publishable while gates remain blocked.
  const publishability = {
    publishable: false as const,
    reasons: [...new Set(reasons)],
    overallStatus: "NOT_PRODUCTION_AUTHORITATIVE" as CustomerStatusCode,
  };

  return {
    companyId: args.companyId,
    governingDocuments,
    provisionsApplied: [...new Set(provisionsApplied)],
    financialValuesUsed,
    utilizationEntriesConsidered,
    assumptionsMade,
    reviewerApprovals,
    publishability,
    overallGuidance: presentCustomerStatus(publishability.overallStatus).customerGuidance,
  };
}
