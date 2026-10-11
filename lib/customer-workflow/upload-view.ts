/**
 * Upload / onboarding package view — documents received, roles, processing,
 * missing, unsupported, extraction errors, operative-authority uncertainty.
 * Never implies analysis succeeded merely because a file uploaded.
 */

import type { CustomerStatusCode } from "./status-contract";
import { mapEngineLabelToCustomerStatus, presentCustomerStatus } from "./status-contract";

export type DocumentProcessingState =
  | "RECEIVED_NOT_ANALYZED"
  | "STAGED"
  | "ANALYZING"
  | "ANALYZED"
  | "FAILED"
  | "RETRYABLE"
  | "UNSUPPORTED";

export interface UploadDocumentRow {
  id: string;
  name: string;
  role: string;
  processingState: DocumentProcessingState;
  customerStatus: CustomerStatusCode;
  extractionStatus: string | null;
  analysisError: string | null;
  covenantItemCount: number;
  /** Upload alone never means analysis succeeded. */
  analysisSucceeded: boolean;
}

export interface UploadPackageView {
  companyId: string;
  documentsReceived: UploadDocumentRow[];
  documentRoles: string[];
  processingSummary: Record<DocumentProcessingState, number>;
  missingDocuments: string[];
  unsupportedFiles: UploadDocumentRow[];
  extractionErrors: string[];
  operativeAuthorityUncertainty: string[];
  overallStatus: CustomerStatusCode;
  overallGuidance: string;
  /** Explicit honesty flag for UI. */
  uploadIsNotAnalysisSuccess: true;
}

function processingState(args: {
  analysisOk?: boolean;
  processingStatus?: string | null;
  extractionStatus?: string | null;
}): DocumentProcessingState {
  const ext = (args.extractionStatus ?? "").toUpperCase();
  if (ext === "UNSUPPORTED_FORMAT" || args.processingStatus === "UNSUPPORTED") {
    return "UNSUPPORTED";
  }
  if (args.analysisOk) return "ANALYZED";
  if (args.processingStatus === "STAGED_PENDING_ANALYSIS") return "STAGED";
  if (args.processingStatus === "ANALYZING") return "ANALYZING";
  if (args.processingStatus === "FAILED_RETRYABLE") return "RETRYABLE";
  if (ext === "FAILED" || args.processingStatus === "FAILED") return "FAILED";
  if (args.processingStatus || ext === "PENDING" || ext === "TEXT_EXTRACTED") {
    return "RECEIVED_NOT_ANALYZED";
  }
  return "RECEIVED_NOT_ANALYZED";
}

export function buildUploadPackageView(args: {
  companyId: string;
  documents: Array<{
    id: string;
    name: string;
    type?: string | null;
    role?: string | null;
    analysisOk?: boolean;
    processingStatus?: string | null;
    extractionStatus?: string | null;
    analysisError?: string | null;
    covenantItemCount?: number;
  }>;
  /** Expected package roles that are still missing (caller-supplied checklist). */
  expectedRoles?: string[];
  operativeAuthorityUncertainty?: string[];
  amendmentUnresolved?: boolean;
}): UploadPackageView {
  const documentsReceived: UploadDocumentRow[] = args.documents.map((d) => {
    const state = processingState(d);
    const analysisSucceeded = state === "ANALYZED" && d.analysisOk === true;
    const customerStatus: CustomerStatusCode = analysisSucceeded
      ? "PARTIAL"
      : state === "UNSUPPORTED"
        ? "UNSUPPORTED"
        : state === "FAILED" || state === "RETRYABLE"
          ? "REVIEW_REQUIRED"
          : "NEEDS_INPUT";
    return {
      id: d.id,
      name: d.name,
      role: d.role ?? d.type ?? "UNKNOWN_ROLE",
      processingState: state,
      customerStatus,
      extractionStatus: d.extractionStatus ?? null,
      analysisError: d.analysisError ?? null,
      covenantItemCount: d.covenantItemCount ?? 0,
      analysisSucceeded,
    };
  });

  const processingSummary: Record<DocumentProcessingState, number> = {
    RECEIVED_NOT_ANALYZED: 0,
    STAGED: 0,
    ANALYZING: 0,
    ANALYZED: 0,
    FAILED: 0,
    RETRYABLE: 0,
    UNSUPPORTED: 0,
  };
  for (const d of documentsReceived) processingSummary[d.processingState] += 1;

  const presentRoles = new Set(documentsReceived.map((d) => d.role));
  const expected = args.expectedRoles ?? [
    "CREDIT_AGREEMENT",
    "INDENTURE",
    "AMENDMENT",
    "FINANCIAL_EVIDENCE",
  ];
  const missingDocuments = expected.filter((r) => !presentRoles.has(r));

  const unsupportedFiles = documentsReceived.filter((d) => d.processingState === "UNSUPPORTED");
  const extractionErrors = documentsReceived
    .filter((d) => d.analysisError || d.processingState === "FAILED" || d.processingState === "RETRYABLE")
    .map((d) => `${d.name}: ${d.analysisError ?? d.extractionStatus ?? d.processingState}`);

  const operativeAuthorityUncertainty = [...(args.operativeAuthorityUncertainty ?? [])];
  if (args.amendmentUnresolved) {
    operativeAuthorityUncertainty.push(
      "Amendment / restatement precedence unresolved — operative authority is uncertain.",
    );
  }
  for (const d of documentsReceived) {
    if (/provisional|ambiguous|unresolved/i.test(d.extractionStatus ?? "")) {
      operativeAuthorityUncertainty.push(
        `${d.name}: extraction status indicates provisional / unresolved identity.`,
      );
    }
  }

  let overallStatus: CustomerStatusCode = "NEEDS_INPUT";
  if (documentsReceived.length === 0) overallStatus = "NEEDS_INPUT";
  else if (extractionErrors.length > 0 || unsupportedFiles.length > 0) overallStatus = "REVIEW_REQUIRED";
  else if (operativeAuthorityUncertainty.length > 0) overallStatus = "AMBIGUOUS";
  else if (documentsReceived.some((d) => d.analysisSucceeded)) overallStatus = "PARTIAL";
  else overallStatus = mapEngineLabelToCustomerStatus("DISCOVERY_ONLY");

  const overall = presentCustomerStatus(overallStatus);

  return {
    companyId: args.companyId,
    documentsReceived,
    documentRoles: [...presentRoles],
    processingSummary,
    missingDocuments,
    unsupportedFiles,
    extractionErrors,
    operativeAuthorityUncertainty: [...new Set(operativeAuthorityUncertainty)],
    overallStatus,
    overallGuidance:
      "File upload records receipt only. Analysis, operative authority, and capacity require separate successful stages.",
    uploadIsNotAnalysisSuccess: true,
  };
}
