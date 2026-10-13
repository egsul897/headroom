/**
 * Reviewer workflow — governing documents, extracted covenants, definitions /
 * exceptions, executable-rule coverage, financial evidence, utilization
 * completeness, approval status. Never fabricates REVIEWED or APPROVED.
 */

import type { CustomerStatusCode } from "./status-contract";
import { mapEngineLabelToCustomerStatus, presentCustomerStatus } from "./status-contract";
import type { EvidenceReviewViewModel } from "./evidence-view";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";

export interface ReviewApprovalRow {
  sectionRef: string;
  heading: string;
  decision: "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING" | null;
  citation: string | null;
  /** True only when an explicit reviewer decision row exists. */
  hasRecordedDecision: boolean;
}

export interface ReviewViewModel {
  companyId: string;
  governingDocuments: Array<{ id: string; name: string; status: CustomerStatusCode }>;
  extractedCovenants: number;
  definitionsNote: string;
  exceptionsNote: string;
  executableRuleCoverage: {
    stage: string;
    discovered: number;
    interpreted: number;
    reviewed: number;
    executableReported: number;
    /** Never invent REVIEWED — expose actual stage only. */
    fabricatedReviewed: false;
  };
  financialEvidence: {
    hasSnapshot: boolean;
    ns4ApprovedCount: number;
    status: CustomerStatusCode;
  };
  utilizationCompleteness: {
    activeLedgerRows: number;
    complete: boolean;
    status: CustomerStatusCode;
  };
  approvals: ReviewApprovalRow[];
  sourceCitations: string[];
  outstandingBlockers: string[];
  overallStatus: CustomerStatusCode;
  overallGuidance: string;
}

export function buildReviewView(args: {
  companyId: string;
  evidence: EvidenceReviewViewModel;
  rulebook: RulebookReadiness;
  readiness: CapacityReadiness;
  approvals?: Array<{
    sectionRef: string;
    heading?: string;
    decision: "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING" | null;
    citation?: string | null;
  }>;
}): ReviewViewModel {
  const stage = args.rulebook.stage;
  // Honesty: INTERPRETED / DISCOVERED must never be labeled REVIEWED or APPROVED.
  const stageLabel = stage;
  if (stage === "REVIEWED" || stage === "EXECUTABLE") {
    // Only report these when rulebook readiness actually says so — still not production.
  }

  const approvals: ReviewApprovalRow[] = (args.approvals ?? args.evidence.clauses.map((c) => ({
    sectionRef: c.sectionRef,
    heading: c.heading,
    decision: c.decision,
    citation: c.citation,
  }))).map((a) => ({
    sectionRef: a.sectionRef,
    heading: a.heading ?? a.sectionRef,
    decision: a.decision,
    citation: a.citation ?? null,
    hasRecordedDecision: a.decision === "ACCEPTED" || a.decision === "EDITED" || a.decision === "REJECTED",
  }));

  const outstandingBlockers = [
    ...args.evidence.reviewerRequired,
    ...args.evidence.missingInputs,
    ...args.rulebook.blockers,
    ...args.readiness.blockers,
  ];
  if (stage !== "REVIEWED" && stage !== "EXECUTABLE") {
    outstandingBlockers.push(
      `Rulebook stage is ${stageLabel} — not fabricated as REVIEWED/APPROVED.`,
    );
  }

  const utilizationComplete = args.readiness.contractLedgerActiveCount > 0;
  // Active ledger rows alone do not certify completeness — keep honest.
  const utilStatus: CustomerStatusCode = utilizationComplete ? "PARTIAL" : "NEEDS_INPUT";

  const finStatus: CustomerStatusCode = args.readiness.hasFinancialSnapshot
    ? args.readiness.ns4ApprovedSnapshotCount > 0 || args.readiness.approvedNorthStarSnapshotCount > 0
      ? "PARTIAL"
      : "NOT_PRODUCTION_AUTHORITATIVE"
    : "NEEDS_INPUT";

  let overallStatus: CustomerStatusCode = "REVIEW_REQUIRED";
  if (args.evidence.overallStatus === "AMBIGUOUS") overallStatus = "AMBIGUOUS";
  else if (outstandingBlockers.length > 0) overallStatus = "REVIEW_REQUIRED";
  else if (approvals.every((a) => a.hasRecordedDecision) && approvals.length > 0) {
    overallStatus = mapEngineLabelToCustomerStatus(stage);
  } else overallStatus = "PARTIAL";

  const citations = args.evidence.clauses
    .map((c) => c.citation)
    .filter((c): c is string => Boolean(c));

  return {
    companyId: args.companyId,
    governingDocuments: args.evidence.documents.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.customerStatus,
    })),
    extractedCovenants: args.evidence.clauses.length || args.readiness.summaryCount,
    definitionsNote: args.evidence.definitionsNote,
    exceptionsNote:
      "Exceptions and carve-outs appear in covenant review items. Absence of an exception row is not approval.",
    executableRuleCoverage: {
      stage: stageLabel,
      discovered: args.rulebook.discoveredSummaries,
      interpreted: args.rulebook.interpretedProvisions,
      reviewed: args.rulebook.reviewedPermissions,
      executableReported: args.rulebook.executablePermissions,
      fabricatedReviewed: false,
    },
    financialEvidence: {
      hasSnapshot: args.readiness.hasFinancialSnapshot,
      ns4ApprovedCount: Math.max(
        args.readiness.ns4ApprovedSnapshotCount,
        args.readiness.approvedNorthStarSnapshotCount,
      ),
      status: finStatus,
    },
    utilizationCompleteness: {
      activeLedgerRows: args.readiness.contractLedgerActiveCount,
      complete: false, // never claim complete without production completeness cert
      status: utilStatus,
    },
    approvals,
    sourceCitations: [...new Set(citations)],
    outstandingBlockers: [...new Set(outstandingBlockers)],
    overallStatus,
    overallGuidance: presentCustomerStatus(overallStatus).customerGuidance,
  };
}
