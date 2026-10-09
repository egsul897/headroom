/**
 * Read-only browse of persisted KnowledgeSource rows.
 * Precedents never override a company's governing documents.
 */

import { prisma } from "../prisma";

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
}

export interface CorpusBrowseSummary {
  totalSources: number;
  withStorageRef: number;
  distinctIssuers: number;
  byDocumentClass: Record<string, number>;
  byRepresentationLevel: Record<string, number>;
  note: string;
}

export async function loadCorpusBrowseSummary(): Promise<CorpusBrowseSummary> {
  const totalSources = await prisma.knowledgeSource.count();
  const withStorageRef = await prisma.knowledgeSource.count({
    where: { storageRef: { not: null } },
  });
  const issuers = await prisma.knowledgeSource.findMany({
    select: { issuerCik: true },
    distinct: ["issuerCik"],
  });
  const classes = await prisma.knowledgeSource.groupBy({
    by: ["documentClass"],
    _count: true,
  });
  const levels = await prisma.knowledgeSource.groupBy({
    by: ["representationLevel"],
    _count: true,
  });

  return {
    totalSources,
    withStorageRef,
    distinctIssuers: issuers.length,
    byDocumentClass: Object.fromEntries(classes.map((c) => [c.documentClass, c._count])),
    byRepresentationLevel: Object.fromEntries(levels.map((l) => [l.representationLevel, l._count])),
    note: "Row counts are not legal coverage. DISCOVERED ≠ VERIFIED. Precedents do not govern customer capacity.",
  };
}

export async function listCorpusBrowseRows(limit = 100): Promise<CorpusBrowseRow[]> {
  const rows = await prisma.knowledgeSource.findMany({
    orderBy: [{ filingDate: "desc" }, { sourceId: "asc" }],
    take: limit,
  });
  return rows.map((r) => ({
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
  }));
}
