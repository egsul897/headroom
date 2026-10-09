/**
 * Thin product wire from workspace KnowledgeSource rows → Phase 2C buildPackageGraph.
 * Uses full text for the focal document; title/class caption text for siblings when
 * bytes are not loaded — classifier is title-deterministic for most amendment links.
 */

import { buildPackageGraph } from "../../contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput, PackageGraphResult } from "../../contract-model/compiler/package-graph/types";
import type { DebtDocumentClass } from "../../knowledge-factory/types";

function declaredTypeHint(
  documentClass: DebtDocumentClass | string,
): PackageDocumentInput["declaredType"] | undefined {
  switch (documentClass) {
    case "CREDIT_AGREEMENT":
    case "REVOLVING_CREDIT_AGREEMENT":
    case "TERM_LOAN_AGREEMENT":
    case "ABL_AGREEMENT":
      return "CREDIT_AGREEMENT";
    case "INDENTURE":
      return "INDENTURE";
    case "SUPPLEMENTAL_INDENTURE":
      return "SUPPLEMENTAL_INDENTURE";
    case "AMENDMENT":
      return "AMENDMENT";
    case "RESTATEMENT":
      return "AMENDED_AND_RESTATED_AGREEMENT";
    case "SIDE_LETTER":
      return "SIDE_LETTER";
    case "INTERCREDITOR_AGREEMENT":
      return "INTERCREDITOR_AGREEMENT";
    case "SECURITY_AGREEMENT":
      return "SECURITY_AGREEMENT";
    case "GUARANTEE_AGREEMENT":
      return "GUARANTEE";
    case "WAIVER":
    case "CONSENT":
      return "OTHER_DEBT_DOCUMENT";
    default:
      return undefined;
  }
}

export function buildWorkspacePackageGraph(params: {
  companyId: string;
  packageKey?: string;
  documents: Array<{
    sourceId: string;
    documentTitle: string;
    documentClass: DebtDocumentClass | string;
    /** Full source text when available; otherwise title caption is used. */
    text?: string | null;
  }>;
}): PackageGraphResult {
  const inputs: PackageDocumentInput[] = params.documents.map((d) => {
    const caption = `${d.documentTitle}\n\nThis ${String(d.documentClass).replace(/_/g, " ").toLowerCase()} is dated as of the filing date.`;
    return {
      documentId: d.sourceId,
      label: d.documentTitle.slice(0, 120) || d.sourceId,
      text: (d.text && d.text.trim().length > 40 ? d.text : caption).slice(0, 200_000),
      declaredType: declaredTypeHint(d.documentClass),
    };
  });
  return buildPackageGraph(
    params.companyId,
    params.packageKey ?? `workspace:${params.companyId}`,
    inputs,
  );
}

/** Compact metadata projection for KnowledgeSource.amendmentPackage.packageGraph. */
export function packageGraphMetadataSummary(graph: PackageGraphResult): Record<string, unknown> {
  return {
    pipelineVersion: "phase-2c-package-graph-pipeline.v1",
    documentCount: graph.performance.documentCount,
    relationshipsResolved: graph.performance.relationshipsResolved,
    relationshipsUnresolved: graph.performance.relationshipsUnresolved,
    instruments: graph.instruments.length,
    relationshipCandidates: graph.relationshipCandidates.slice(0, 40).map((r) => ({
      sourceDocumentId: r.sourceDocumentId,
      targetDocumentId: r.targetDocumentId,
      relationshipType: r.relationshipType,
      status: r.status,
      resolutionMethod: r.resolutionMethod,
    })),
    note: "Phase 2C package graph — DISCOVERED relationships; not operative legal effectiveness.",
  };
}
