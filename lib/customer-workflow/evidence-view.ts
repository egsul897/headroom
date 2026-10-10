/**
 * Evidence-review journey assembler — uploaded docs, clauses, definitions,
 * cross-doc refs, amendments, verification, reviewer decisions, missing inputs.
 * Presentation only; consumes existing customer-intelligence loaders' shapes.
 */

import type { CustomerStatusCode } from "./status-contract";
import { mapEngineLabelToCustomerStatus, presentCustomerStatus } from "./status-contract";

export interface EvidenceDocumentRow {
  id: string;
  name: string;
  type: string;
  analysisStatus: string;
  customerStatus: CustomerStatusCode;
  covenantItemCount: number;
  extractionStatus: string | null;
  provisionalIdentity: boolean;
}

export interface EvidenceClauseRow {
  sourceId: string;
  sectionRef: string;
  heading: string;
  posture: string | null;
  documentTitle: string | null;
  citation: string | null;
  unresolvedCount: number;
  decision: "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING" | null;
}

export interface EvidenceAmendmentSummary {
  operativeResolution: string;
  customerStatus: CustomerStatusCode;
  unresolvedReasons: string[];
  askGuidance: string | null;
  conflicting: boolean;
}

export interface EvidenceReviewViewModel {
  companyId: string;
  documents: EvidenceDocumentRow[];
  clauses: EvidenceClauseRow[];
  definitionsNote: string;
  crossDocumentNote: string;
  amendment: EvidenceAmendmentSummary | null;
  verificationEvidence: string[];
  reviewerRequired: string[];
  missingInputs: string[];
  overallStatus: CustomerStatusCode;
  overallGuidance: string;
}

export function buildEvidenceReviewView(args: {
  companyId: string;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    analysisOk?: boolean;
    processingStatus?: string | null;
    covenantItemCount?: number;
    extractionStatus?: string | null;
    /** Provisional / unresolved document identity from intelligence. */
    provisionalIdentity?: boolean;
  }>;
  clauses?: Array<{
    sourceId: string;
    sectionRef: string;
    heading: string;
    posture?: string | null;
    documentTitle?: string | null;
    citation?: string | null;
    unresolvedQuestions?: string[];
    decision?: "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING" | null;
  }>;
  amendment?: {
    operativeResolution: string;
    unresolvedReasons: string[];
    askGuidance?: string | null;
  } | null;
  verificationEvidence?: string[];
  missingInputs?: string[];
  readinessBlockers?: string[];
}): EvidenceReviewViewModel {
  const documents: EvidenceDocumentRow[] = args.documents.map((d) => {
    const provisional = d.provisionalIdentity === true;
    let analysisStatus = "NOT_ANALYZED";
    if (d.analysisOk) analysisStatus = "ANALYZED";
    else if (d.processingStatus === "STAGED_PENDING_ANALYSIS") analysisStatus = "STAGED";
    else if (d.processingStatus === "ANALYZING") analysisStatus = "ANALYZING";
    else if (d.processingStatus === "FAILED_RETRYABLE") analysisStatus = "RETRYABLE";
    else if (d.processingStatus) analysisStatus = "FAILED";

    const customerStatus: CustomerStatusCode = provisional
      ? "AMBIGUOUS"
      : d.analysisOk
        ? "PARTIAL"
        : analysisStatus === "FAILED" || analysisStatus === "RETRYABLE"
          ? "REVIEW_REQUIRED"
          : "NEEDS_INPUT";

    return {
      id: d.id,
      name: d.name,
      type: d.type,
      analysisStatus,
      customerStatus,
      covenantItemCount: d.covenantItemCount ?? 0,
      extractionStatus: d.extractionStatus ?? null,
      provisionalIdentity: provisional,
    };
  });

  const clauses: EvidenceClauseRow[] = (args.clauses ?? []).map((c) => ({
    sourceId: c.sourceId,
    sectionRef: c.sectionRef,
    heading: c.heading,
    posture: c.posture ?? null,
    documentTitle: c.documentTitle ?? null,
    citation: c.citation ?? null,
    unresolvedCount: c.unresolvedQuestions?.length ?? 0,
    decision: c.decision ?? null,
  }));

  const amendment = args.amendment
    ? {
        operativeResolution: args.amendment.operativeResolution,
        customerStatus: mapEngineLabelToCustomerStatus(args.amendment.operativeResolution),
        unresolvedReasons: args.amendment.unresolvedReasons,
        askGuidance: args.amendment.askGuidance ?? null,
        conflicting:
          args.amendment.operativeResolution === "UNRESOLVED_PRECEDENCE" ||
          args.amendment.unresolvedReasons.some((r) => /conflict|amend|precedence|competing/i.test(r)),
      }
    : null;

  const reviewerRequired: string[] = [];
  for (const c of clauses) {
    if (c.decision === null || c.decision === "PENDING") {
      reviewerRequired.push(`${c.sectionRef}: reviewer decision required (${c.heading})`);
    }
    if (c.unresolvedCount > 0) {
      reviewerRequired.push(`${c.sectionRef}: ${c.unresolvedCount} unresolved question(s)`);
    }
    if (!c.citation) {
      reviewerRequired.push(`${c.sectionRef}: source citation missing`);
    }
  }
  for (const d of documents) {
    if (d.provisionalIdentity) {
      reviewerRequired.push(`${d.name}: provisional document identity — do not treat as settled authority`);
    }
  }
  if (amendment?.conflicting) {
    reviewerRequired.push("Conflicting or unresolved amendment precedence blocks operative rulebook.");
  }

  const missingInputs = [
    ...(args.missingInputs ?? []),
    ...(args.readinessBlockers ?? []),
  ];

  let overallStatus: CustomerStatusCode = "PARTIAL";
  if (documents.length === 0) overallStatus = "NEEDS_INPUT";
  else if (amendment?.conflicting) overallStatus = "AMBIGUOUS";
  else if (reviewerRequired.length > 0) overallStatus = "REVIEW_REQUIRED";
  else if (documents.every((d) => d.customerStatus === "PARTIAL")) overallStatus = "PARTIAL";

  const overall = presentCustomerStatus(overallStatus);

  return {
    companyId: args.companyId,
    documents,
    clauses,
    definitionsNote:
      "Relevant definitions are reachable from document detail and covenant review. Definitions alone do not establish executable capacity.",
    crossDocumentNote:
      "Cross-document references and amendment packages must resolve before a rule is executable. Unresolved precedence stays AMBIGUOUS.",
    amendment,
    verificationEvidence: args.verificationEvidence ?? [],
    reviewerRequired: [...new Set(reviewerRequired)],
    missingInputs: [...new Set(missingInputs)],
    overallStatus,
    overallGuidance: overall.customerGuidance,
  };
}

/** Explain why a rule is executable or refused — for Evidence surface. */
export function explainRuleExecutability(args: {
  executable: boolean;
  blockers: string[];
  missingCitations: boolean;
  utilizationComplete: boolean;
  amendmentResolved: boolean;
}): { status: CustomerStatusCode; explanation: string } {
  if (args.executable && args.amendmentResolved && args.utilizationComplete && !args.missingCitations) {
    return {
      status: "VERIFIED_EXECUTABLE",
      explanation:
        "Canonical gates report an executable path with citations, resolved amendments, and complete utilization.",
    };
  }
  if (!args.amendmentResolved) {
    return {
      status: "AMBIGUOUS",
      explanation: "Amendment / operative precedence is unresolved — rule execution is refused.",
    };
  }
  if (args.missingCitations) {
    return {
      status: "REVIEW_REQUIRED",
      explanation: "Source citation missing — Headroom will not present an unverified executable claim.",
    };
  }
  if (!args.utilizationComplete) {
    return {
      status: "NEEDS_INPUT",
      explanation:
        "Utilization completeness is not verified. Remaining capacity is withheld (UNKNOWN — not zero).",
    };
  }
  if (args.blockers.length > 0) {
    return {
      status: "UNSUPPORTED",
      explanation: `Execution refused: ${args.blockers.join("; ")}`,
    };
  }
  return {
    status: "REVIEW_REQUIRED",
    explanation: "Engine has not established permission. No favorable executable claim is shown.",
  };
}
