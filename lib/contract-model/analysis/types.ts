/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - domain types for the
 * live contract-analysis orchestration boundary. See orchestrator.ts for the
 * composed pipeline itself and docs/phase-3f1-6-r-blocker-remediation/
 * 14-live-contract-analysis-architecture.json for the design rationale.
 */
import type { AnalysisRunStatus } from "@prisma/client";
import type { DocumentAuditOutput } from "../compiler/semantic-coverage/pipeline";
import type { PackageCoverageResult } from "../compiler/semantic-coverage/types";
import type { RecordClaimReviewsFromCoverageResult } from "../compiler/safe-failure/integrate";
import type { PersistSemanticTruthSummary } from "./semantic-truth/types";

export type { AnalysisRunStatus };

export const CONTRACT_DOCUMENT_TYPES = [
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "AMENDMENT",
  "INTERCREDITOR_AGREEMENT",
  "AMENDED_AND_RESTATED_AGREEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "JOINDER",
  "SECURITY_AGREEMENT",
  "GUARANTEE",
  "SIDE_LETTER",
  "FEE_LETTER",
  "OTHER_DEBT_DOCUMENT",
  "GUARANTEE_AND_SECURITY_AGREEMENT",
  "UNKNOWN",
] as const;

/**
 * Deliberately excluded: `OTHER` (a human explicitly declared this document
 * is not a debt/credit document at all - task's own "do not force uncertain
 * classification" applied to scope, not just labeling) and
 * `COMPLIANCE_CERTIFICATE` (a periodic reporting artifact ABOUT an
 * instrument's covenants, never itself the source of covenant TEXT the
 * compiler pipeline is built to parse - running structural/discovery
 * analysis over one would only produce noise, never a real covenant claim).
 * This is a disclosed, bounded scoping choice - see
 * 19-contract-truth-ownership-map.json.
 */
export const CONTRACT_DOCUMENT_TYPE_SET = new Set<string>(CONTRACT_DOCUMENT_TYPES);

export interface RunContractAnalysisInput {
  companyId: string;
  /** Optional trigger provenance for observability only (e.g. the just-uploaded document's id) - never changes which documents are analyzed (always the company's FULL current contract-document set, per this phase's own disclosed single-package-per-company scoping decision). */
  triggeringDocumentId?: string | null;
}

export type AnalysisRunOutcome = "STARTED_TO_COMPLETION" | "SKIPPED_ALREADY_RUNNING" | "SKIPPED_NO_CONTRACT_DOCUMENTS" | "FAILED";

export interface InstrumentAnalysisOutcome {
  instrumentKey: string;
  baseDocumentId: string | null;
  documentIds: string[];
  discoveredCandidateCount: number;
  compiledCount: number;
  verifiedCount: number;
  packageCoverage: PackageCoverageResult;
  documentDetails: DocumentAuditOutput[];
  claimReviewOutcomes: RecordClaimReviewsFromCoverageResult[];
  /** AUDIT-F1 - durable semantic-truth persistence outcome for this instrument's own compiled rules/definitions (lib/contract-model/analysis/semantic-truth/service.ts). */
  semanticTruthSummary: PersistSemanticTruthSummary;
}

export interface RunContractAnalysisResult {
  outcome: AnalysisRunOutcome;
  runId: string | null;
  status: AnalysisRunStatus | null;
  companyId: string;
  packageKey: string | null;
  documentIds: string[];
  analysisAlgorithmVersion: string;
  instruments: InstrumentAnalysisOutcome[];
  openReviewItemCount: number;
  fatalError: { stage: string; message: string; errorClass: string } | null;
  /** AUDIT-F3 - every instrument-level failure this attempt recorded (durably persisted as AnalysisRunIssue rows - this is a convenience in-memory mirror of that, never the sole record of it). Empty when every instrument succeeded, or when the run never reached the per-instrument stage at all. */
  instrumentFailures: { instrumentKey: string; errorClass: string; message: string }[];
}
