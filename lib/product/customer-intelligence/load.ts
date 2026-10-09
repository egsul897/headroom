/**
 * Load customer-workspace document intelligence from Neon KnowledgeSource rows.
 * Always scoped by companyId — never mixes public research corpus.
 */

import { prisma } from "../../prisma";
import { summarizeFromStoredMetadata, type DocumentCovenantSummary } from "../covenant-intelligence/summarize";
import type { AmendmentPackageView } from "./amendment-package";

export interface CustomerDocumentIntelligence {
  documentId: string;
  sourceId: string;
  filename: string;
  documentClass: string;
  extractionStatus: string;
  representationLevel: string;
  storageRef: string | null;
  originalBytesHash: string;
  filingDate: string;
  processingStatus: string | null;
  covenantItemCount: number;
  summary: DocumentCovenantSummary | null;
  amendmentPackage: AmendmentPackageView | null;
  analysisOk: boolean;
  analysisError: string | null;
  declaredType: string | null;
}

function amendmentFromMetadata(metadata: unknown): AmendmentPackageView | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const ap = (metadata as Record<string, unknown>).amendmentPackage;
  if (!ap || typeof ap !== "object") return null;
  return ap as AmendmentPackageView;
}

function analysisErrorFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const err = (metadata as Record<string, unknown>).analysisError;
  return typeof err === "string" ? err : null;
}

export async function listCustomerDocumentIntelligence(
  companyId: string,
): Promise<CustomerDocumentIntelligence[]> {
  const rows = await prisma.knowledgeSource.findMany({
    where: { companyId },
    orderBy: [{ filingDate: "desc" }, { sourceId: "asc" }],
  });

  return rows.map((row) => {
    const summary = summarizeFromStoredMetadata(row.metadata);
    const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
    const analysisOk =
      Boolean(summary && summary.items.length > 0) &&
      row.extractionStatus !== "FAILED" &&
      row.extractionStatus !== "UNSUPPORTED_FORMAT";
    const processingStatus =
      typeof meta.processingStatus === "string" ? meta.processingStatus : null;
    return {
      documentId: row.documentId ?? "",
      sourceId: row.sourceId,
      filename: row.exhibitFilename || row.documentTitle,
      documentClass: row.documentClass,
      extractionStatus: row.extractionStatus,
      representationLevel: row.representationLevel,
      storageRef: row.storageRef,
      originalBytesHash: row.originalBytesHash,
      filingDate: row.filingDate.toISOString().slice(0, 10),
      processingStatus,
      covenantItemCount: summary?.items.length ?? 0,
      summary,
      amendmentPackage: amendmentFromMetadata(row.metadata),
      analysisOk,
      analysisError: analysisErrorFromMetadata(row.metadata),
      declaredType: typeof meta.declaredType === "string" ? meta.declaredType : null,
    };
  });
}

export async function getCustomerDocumentIntelligence(
  companyId: string,
  documentId: string,
): Promise<CustomerDocumentIntelligence | null> {
  const rows = await listCustomerDocumentIntelligence(companyId);
  return rows.find((r) => r.documentId === documentId) ?? null;
}

export async function getLatestAmendmentPackage(
  companyId: string,
): Promise<AmendmentPackageView | null> {
  const rows = await listCustomerDocumentIntelligence(companyId);
  for (const r of rows) {
    if (r.amendmentPackage) return r.amendmentPackage;
  }
  return null;
}
