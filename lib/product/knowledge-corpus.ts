/**
 * Read-only browse of persisted KnowledgeSource rows.
 * Precedents never override a company's governing documents.
 * Browse counts prefer substantive financing documents.
 */

import { prisma } from "../prisma";
import {
  classifyCorpusRole,
  isSubstantiveFinancingPrecedent,
} from "./covenant-intelligence/corpus-quality";

export interface CorpusBrowseRow {
  sourceId: string;
  issuerCik: string;
  issuerTicker: string | null;
  issuerName: string | null;
  documentTitle: string;
  documentClass: string;
  formType: string;
  filingDate: string;
  extractionStatus: string;
  representationLevel: string;
  byteSize: number | null;
  hasDurableBytes: boolean;
  storageRef: string | null;
  provenance: string;
  originalBytesHash: string;
  corpusRole: "SUBSTANTIVE_FINANCING" | "NON_FINANCING_EXHIBIT";
}

export interface CorpusBrowseSummary {
  totalSources: number;
  withStorageRef: number;
  substantiveFinancingSources: number;
  nonFinancingExhibits: number;
  distinctIssuers: number;
  byDocumentClass: Record<string, number>;
  byRepresentationLevel: Record<string, number>;
  note: string;
}

/** Public research corpus only — customer workspace uploads (companyId set) are excluded. */
const PUBLIC_CORPUS = { companyId: null as string | null };

export async function loadCorpusBrowseSummary(): Promise<CorpusBrowseSummary> {
  const rows = await prisma.knowledgeSource.findMany({
    where: { ...PUBLIC_CORPUS, storageRef: { not: null } },
    select: {
      sourceId: true,
      documentTitle: true,
      documentClass: true,
      exhibitFilename: true,
      provenance: true,
      issuerName: true,
      issuerCik: true,
      byteSize: true,
      representationLevel: true,
    },
  });
  const substantive = rows.filter((r) => isSubstantiveFinancingPrecedent(r));
  const nonFinancing = rows.length - substantive.length;
  const issuers = new Set(substantive.map((r) => r.issuerCik));
  const byClass: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  for (const r of substantive) {
    byClass[r.documentClass] = (byClass[r.documentClass] ?? 0) + 1;
    byLevel[r.representationLevel] = (byLevel[r.representationLevel] ?? 0) + 1;
  }
  const totalSources = await prisma.knowledgeSource.count({ where: PUBLIC_CORPUS });

  return {
    totalSources,
    withStorageRef: rows.length,
    substantiveFinancingSources: substantive.length,
    nonFinancingExhibits: nonFinancing,
    distinctIssuers: issuers.size,
    byDocumentClass: byClass,
    byRepresentationLevel: byLevel,
    note: "Public research corpus only (companyId IS NULL). Substantive financing counts exclude accounting consents, bylaws, and other non-financing exhibits. DISCOVERED ≠ VERIFIED.",
  };
}

export interface CorpusBrowseFilters {
  issuer?: string;
  documentClass?: string;
  dateFrom?: string;
  dateTo?: string;
  /** When true, only rows with covenantSummary metadata. */
  analysisReady?: boolean;
}

export async function listCorpusBrowseRows(
  limit = 100,
  filters: CorpusBrowseFilters = {},
): Promise<CorpusBrowseRow[]> {
  const where: Record<string, unknown> = { ...PUBLIC_CORPUS };
  if (filters.documentClass) {
    where.documentClass = filters.documentClass;
  }
  if (filters.issuer) {
    const q = filters.issuer.trim();
    where.OR = [
      { issuerTicker: { equals: q, mode: "insensitive" } },
      { issuerName: { contains: q, mode: "insensitive" } },
      { issuerCik: { contains: q.replace(/^0+/, "") } },
    ];
  }
  if (filters.dateFrom || filters.dateTo) {
    where.filingDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  const rows = await prisma.knowledgeSource.findMany({
    where: where as never,
    orderBy: [{ filingDate: "desc" }, { sourceId: "asc" }],
    take: Math.max(limit * 3, 150),
  });
  return rows
    .map((r) => {
      const meta =
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      const summary = meta.covenantSummary as { items?: unknown[] } | undefined;
      const hasAnalysis = Array.isArray(summary?.items) && summary!.items!.length > 0;
      return {
        sourceId: r.sourceId,
        issuerCik: r.issuerCik,
        issuerTicker: r.issuerTicker,
        issuerName: r.issuerName,
        documentTitle: r.documentTitle,
        documentClass: r.documentClass,
        formType: r.formType,
        filingDate: r.filingDate.toISOString().slice(0, 10),
        extractionStatus: r.extractionStatus,
        representationLevel: r.representationLevel,
        byteSize: r.byteSize,
        hasDurableBytes: Boolean(r.storageRef),
        storageRef: r.storageRef,
        provenance: r.provenance,
        originalBytesHash: r.originalBytesHash,
        corpusRole: classifyCorpusRole(r),
        hasAnalysis,
      };
    })
    .filter((r) => r.corpusRole === "SUBSTANTIVE_FINANCING")
    .filter((r) => (filters.analysisReady ? r.hasAnalysis : true))
    .slice(0, limit)
    .map(({ hasAnalysis: _a, ...row }) => row);
}
