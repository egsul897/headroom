/**
 * Phase 3E §158 - package-level coverage rollup. A declared
 * reconciliation-stage module. Never returns a bare "SAFE" verdict
 * (Architecture Invariants #24/North Star §10) - PACKAGE_SEMANTICALLY_COVERED
 * is the closest state to that, and it is still qualified by everything
 * else this module reports alongside it (per-document gate reasons,
 * family summaries, dangerous-unaccounted units).
 */
import { computePackageContentIdentity } from "./identity";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION, type DocumentCoverageResult, type PackageCoverageResult, type PackageSemanticCoverageStatus } from "./types";

const REVIEW_WORTHY_STATES = new Set(["AMBIGUOUS_MATCH", "SOURCE_CONTEXT_INCOMPLETE", "FULLY_REPRESENTED_REVIEW_REQUIRED", "PARTIALLY_REPRESENTED"]);

export interface PackageCoverageInput {
  companyId: string;
  packageKey: string;
  documents: DocumentCoverageResult[];
  /** Document ids the auditor could not complete at all (e.g. a structural-health/raw-source-fallback failure severe enough that even the fallback path produced no usable inventory) - a real, disclosed failure mode, never silently folded into a passing status. */
  auditIncompleteDocumentIds: string[];
  structuralParserVersion: string;
  aiInventoryPromptVersion: string | null;
  providerIdentity: string | null;
  frozenContentHash: string;
}

function computeStatus(input: PackageCoverageInput): { status: PackageSemanticCoverageStatus; reasons: string[] } {
  if (input.auditIncompleteDocumentIds.length > 0) {
    return { status: "PACKAGE_AUDIT_INCOMPLETE", reasons: [`${input.auditIncompleteDocumentIds.length} document(s) could not be audited at all: ${input.auditIncompleteDocumentIds.join(", ")}`] };
  }

  const unresolvedOperativeStateDocs = input.documents.filter((d) => d.coverageEntries.some((e) => e.coverageState === "OPERATIVE_STATE_UNRESOLVED"));
  if (unresolvedOperativeStateDocs.length > 0) {
    return { status: "PACKAGE_OPERATIVE_STATE_UNRESOLVED", reasons: unresolvedOperativeStateDocs.map((d) => `document ${d.documentId} has an unresolved operative-state conflict affecting semantic coverage`) };
  }

  const failedDocs = input.documents.filter((d) => d.gateStatus === "DOCUMENT_GATE_FAILED");
  if (failedDocs.length > 0) {
    return { status: "PACKAGE_SEMANTICALLY_INCOMPLETE", reasons: failedDocs.flatMap((d) => d.gateFailureReasons.map((r) => `document ${d.documentId}: ${r}`)) };
  }

  const reviewReasons: string[] = [];
  for (const doc of input.documents) {
    const reviewWorthy = doc.coverageEntries.filter((e) => REVIEW_WORTHY_STATES.has(e.coverageState));
    if (reviewWorthy.length > 0) reviewReasons.push(`document ${doc.documentId}: ${reviewWorthy.length} semantic unit(s) require human review (${[...new Set(reviewWorthy.map((e) => e.coverageState))].join(", ")})`);
  }
  if (reviewReasons.length > 0) return { status: "PACKAGE_REVIEW_REQUIRED", reasons: reviewReasons };

  return { status: "PACKAGE_SEMANTICALLY_COVERED", reasons: ["every semantic unit across every audited document reached a fully-verified or fully-reviewed representation with no dangerous-unaccounted units, no missing families, and no unresolved operative state"] };
}

export function computePackageCoverage(input: PackageCoverageInput): PackageCoverageResult {
  const { status, reasons } = computeStatus(input);
  return {
    companyId: input.companyId,
    packageKey: input.packageKey,
    documents: input.documents,
    status,
    statusReasons: reasons,
    auditAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
    contentIdentity: computePackageContentIdentity({
      companyId: input.companyId,
      packageKey: input.packageKey,
      structuralParserVersion: input.structuralParserVersion,
      coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
      aiInventoryPromptVersion: input.aiInventoryPromptVersion,
      providerIdentity: input.providerIdentity,
      frozenContentHash: input.frozenContentHash,
    }),
  };
}
