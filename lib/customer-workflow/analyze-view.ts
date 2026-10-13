/**
 * Analyze step — extraction pipeline / intelligence status.
 * Upload success never upgrades this to ANALYZED.
 */

import type { CustomerStatusCode } from "./status-contract";
import { presentCustomerStatus } from "./status-contract";
import type { UploadDocumentRow, UploadPackageView } from "./upload-view";

export interface AnalyzeDocumentRow {
  id: string;
  name: string;
  role: string;
  processingState: UploadDocumentRow["processingState"];
  extractionStatus: string | null;
  analysisError: string | null;
  covenantItemCount: number;
  analysisSucceeded: boolean;
  customerStatus: CustomerStatusCode;
}

export interface AnalyzeViewModel {
  companyId: string;
  documents: AnalyzeDocumentRow[];
  analyzedCount: number;
  failedCount: number;
  pendingCount: number;
  unsupportedCount: number;
  extractionErrors: string[];
  operativeAuthorityUncertainty: string[];
  compilationLimitation: string | null;
  overallStatus: CustomerStatusCode;
  overallGuidance: string;
}

export function buildAnalyzeView(args: {
  companyId: string;
  upload: UploadPackageView;
  /** When backend compilation is incomplete, surface truthfully — never fill with fixtures. */
  compilationLimitation?: string | null;
  canEvaluateExecutableCapacity?: boolean;
}): AnalyzeViewModel {
  const documents: AnalyzeDocumentRow[] = args.upload.documentsReceived.map((d) => ({
    id: d.id,
    name: d.name,
    role: d.role,
    processingState: d.processingState,
    extractionStatus: d.extractionStatus,
    analysisError: d.analysisError,
    covenantItemCount: d.covenantItemCount,
    analysisSucceeded: d.analysisSucceeded,
    customerStatus: d.customerStatus,
  }));

  const analyzedCount = documents.filter((d) => d.analysisSucceeded).length;
  const failedCount = documents.filter(
    (d) => d.processingState === "FAILED" || d.processingState === "RETRYABLE",
  ).length;
  const unsupportedCount = documents.filter((d) => d.processingState === "UNSUPPORTED").length;
  const pendingCount = documents.length - analyzedCount - failedCount - unsupportedCount;

  let compilationLimitation = args.compilationLimitation ?? null;
  if (args.canEvaluateExecutableCapacity === false && !compilationLimitation) {
    compilationLimitation =
      "Executable capacity path not available — compilation / rulebook / financial gates incomplete. UI will not invent fixture capacity.";
  }

  let overallStatus: CustomerStatusCode = args.upload.overallStatus;
  if (failedCount > 0) overallStatus = "REVIEW_REQUIRED";
  else if (analyzedCount === 0 && documents.length > 0) overallStatus = "NEEDS_INPUT";
  else if (compilationLimitation) overallStatus = "PARTIAL";

  return {
    companyId: args.companyId,
    documents,
    analyzedCount,
    failedCount,
    pendingCount,
    unsupportedCount,
    extractionErrors: args.upload.extractionErrors,
    operativeAuthorityUncertainty: args.upload.operativeAuthorityUncertainty,
    compilationLimitation,
    overallStatus,
    overallGuidance: presentCustomerStatus(overallStatus).customerGuidance,
  };
}
