/**
 * Customer-workspace document intelligence on top of existing KF pipelines.
 * Isolates KnowledgeSource rows via companyId — never appears in public research corpus.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../../prisma";
import { CorpusStore, defaultCorpusPaths } from "../../knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../knowledge-factory/pipeline/run";
import { discoverDocumentRelationships } from "../../knowledge-factory/relationships/discover";
import { PostgresDocumentStorageProvider } from "../../document-storage/postgres-bytea-provider";
import type { DebtDocumentClass } from "../../knowledge-factory/types";
import { buildDocumentCovenantSummary } from "../covenant-intelligence/summarize";
import { analyzeAmendmentPackage } from "./amendment-package";
import {
  mergePreservedReviewerDecisions,
  type ReviewerApproval,
} from "./reviewer-approvals";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function customerSourceId(companyId: string, documentId: string, contentHash: string): string {
  return `customer:${companyId}:${documentId}:${contentHash.slice(0, 16)}`;
}

/** Map human-declared DocumentType onto KF debt classes when classifier returns UNKNOWN. */
function documentClassFromDeclared(
  declaredType: string | undefined,
  classified: DebtDocumentClass,
): DebtDocumentClass {
  if (classified !== "UNKNOWN" && classified !== "OTHER_DEBT_RELATED") return classified;
  switch (declaredType) {
    case "CREDIT_AGREEMENT":
      return "CREDIT_AGREEMENT";
    case "INDENTURE":
      return "INDENTURE";
    case "AMENDMENT":
      return "AMENDMENT";
    case "INTERCREDITOR_AGREEMENT":
      return "INTERCREDITOR_AGREEMENT";
    default:
      return classified;
  }
}

export interface CustomerAnalyzeResult {
  ok: boolean;
  sourceId?: string;
  documentId: string;
  companyId: string;
  extractionStatus: string;
  representationLevel?: string;
  covenantItemCount: number;
  definitionCount: number;
  structuralNodeCount: number;
  error?: string;
  promotedToLegalTruth: 0;
  /** True when bytes were staged and analysis was deferred off the request path. */
  deferred?: boolean;
}

/** Files at/above this size stage durable bytes first, then analyze outside the upload critical path. */
export const LARGE_UPLOAD_DEFER_BYTES = 1_500_000;

/** Hard cap — reject before memory blowups / request body exhaustion (~80MB). */
export const MAX_CUSTOMER_UPLOAD_BYTES = 80 * 1024 * 1024;

/**
 * Persist original customer bytes + a PENDING KnowledgeSource row before heavy analysis.
 * Idempotent on (companyId, documentId, contentHash).
 */
export async function stageCustomerDocument(params: {
  companyId: string;
  documentId: string;
  bytes: Buffer;
  filename: string;
  declaredType?: string;
  /** Prefer existing Document storageRef when present to avoid double BYTEA write. */
  existingStorageRef?: string | null;
}): Promise<{ sourceId: string; storageRef: string; contentHash: string; reusedBytes: boolean }> {
  const contentHash = sha256(params.bytes);
  const sourceId = customerSourceId(params.companyId, params.documentId, contentHash);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: params.companyId } });

  let storageRef = params.existingStorageRef ?? null;
  let reusedBytes = Boolean(storageRef);
  if (!storageRef) {
    const provider = new PostgresDocumentStorageProvider();
    const stored = await provider.store({
      companyId: params.companyId,
      filename: params.filename,
      contentType: contentTypeFor(params.filename),
      data: params.bytes,
    });
    storageRef = stored.storageRef;
    reusedBytes = false;
  }

  const pendingMeta = JSON.parse(
    JSON.stringify({
      workspaceScope: "CUSTOMER",
      companyId: params.companyId,
      documentId: params.documentId,
      declaredType: params.declaredType ?? null,
      processingStatus: "STAGED_PENDING_ANALYSIS",
      promotedToLegalTruth: 0,
    }),
  );

  await prisma.knowledgeSource.upsert({
    where: { sourceId },
    create: {
      sourceId,
      companyId: params.companyId,
      documentId: params.documentId,
      issuerCik: "0000000000",
      issuerTicker: company.ticker,
      issuerName: company.name,
      accessionNumber: `customer-${params.documentId}`,
      exhibitFilename: params.filename,
      sourceUrl: `fixture://customer/${params.companyId}/${params.documentId}/${params.filename}`,
      filingDate: new Date(),
      formType: "UPLOAD",
      documentTitle: params.filename,
      documentClass: documentClassFromDeclared(params.declaredType, "UNKNOWN") as never,
      originalBytesHash: contentHash,
      acquisitionTimestamp: new Date(),
      parserVersion: "customer-stage-v1",
      extractionStatus: "PENDING",
      representationLevel: "SOURCE_ONLY",
      provenance: "customer-upload",
      usageRightsReviewStatus: "UNREVIEWED",
      byteSize: params.bytes.length,
      storageRef,
      metadata: pendingMeta,
    },
    update: {
      companyId: params.companyId,
      documentId: params.documentId,
      storageRef,
      byteSize: params.bytes.length,
      issuerName: company.name,
      issuerTicker: company.ticker,
      metadata: pendingMeta,
    },
  });

  return { sourceId, storageRef, contentHash, reusedBytes };
}

/** Mark staged source as analyzing / failed without deleting durable bytes. */
export async function markCustomerProcessingStatus(params: {
  sourceId: string;
  status: "STAGED_PENDING_ANALYSIS" | "ANALYZING" | "ANALYZED" | "FAILED_RETRYABLE";
  error?: string;
}): Promise<void> {
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: params.sourceId } });
  if (!row) return;
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {};
  meta.processingStatus = params.status;
  if (params.error) meta.analysisError = params.error;
  else if (params.status === "ANALYZED") delete meta.analysisError;
  await prisma.knowledgeSource.update({
    where: { sourceId: params.sourceId },
    data: {
      metadata: JSON.parse(JSON.stringify(meta)),
      ...(params.status === "FAILED_RETRYABLE" ? { extractionStatus: "FAILED" as never } : {}),
    },
  });
}

/**
 * Re-run analysis from durable storage (retry / background worker path).
 * Does not require the original upload request to still hold bytes in memory.
 */
export async function reanalyzeCustomerDocumentFromStorage(params: {
  companyId: string;
  documentId: string;
}): Promise<CustomerAnalyzeResult> {
  const row = await prisma.knowledgeSource.findFirst({
    where: { companyId: params.companyId, documentId: params.documentId },
    orderBy: { acquisitionTimestamp: "desc" },
  });
  const doc = await prisma.document.findFirst({
    where: { id: params.documentId, companyId: params.companyId },
  });
  const storageRef = row?.storageRef ?? doc?.storageRef;
  if (!storageRef) {
    return {
      ok: false,
      documentId: params.documentId,
      companyId: params.companyId,
      extractionStatus: "FAILED",
      covenantItemCount: 0,
      definitionCount: 0,
      structuralNodeCount: 0,
      error: "No durable storageRef — re-upload required",
      promotedToLegalTruth: 0,
    };
  }
  if (row) await markCustomerProcessingStatus({ sourceId: row.sourceId, status: "ANALYZING" });
  try {
    const { getDocumentStorageProvider } = await import("../../document-storage");
    const bytes = await getDocumentStorageProvider().retrieve(storageRef);
    const result = await analyzeCustomerDocument({
      companyId: params.companyId,
      documentId: params.documentId,
      bytes,
      filename: doc?.originalFilename || doc?.name || row?.exhibitFilename || "document",
      declaredType: doc?.type ?? undefined,
    });
    if (result.sourceId) {
      await markCustomerProcessingStatus({
        sourceId: result.sourceId,
        status: result.ok ? "ANALYZED" : "FAILED_RETRYABLE",
        error: result.error,
      });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (row) {
      await markCustomerProcessingStatus({
        sourceId: row.sourceId,
        status: "FAILED_RETRYABLE",
        error: message,
      });
    }
    return {
      ok: false,
      documentId: params.documentId,
      companyId: params.companyId,
      extractionStatus: "FAILED",
      covenantItemCount: 0,
      definitionCount: 0,
      structuralNodeCount: 0,
      error: message,
      promotedToLegalTruth: 0,
    };
  }
}

/**
 * Analyze an already-uploaded Document's bytes into a company-scoped KnowledgeSource.
 * Public research queries must filter companyId IS NULL.
 */
export async function analyzeCustomerDocument(params: {
  companyId: string;
  documentId: string;
  bytes: Buffer;
  filename: string;
  declaredType?: string;
}): Promise<CustomerAnalyzeResult> {
  const contentHash = sha256(params.bytes);
  const sourceId = customerSourceId(params.companyId, params.documentId, contentHash);
  const workRoot = mkdtempSync(path.join(tmpdir(), "cust-intel-"));
  const store = new CorpusStore(defaultCorpusPaths(path.join(workRoot, "corpus")));

  try {
    const company = await prisma.company.findUnique({ where: { id: params.companyId } });
    if (!company) {
      return {
        ok: false,
        documentId: params.documentId,
        companyId: params.companyId,
        extractionStatus: "FAILED",
        covenantItemCount: 0,
        definitionCount: 0,
        structuralNodeCount: 0,
        error: "Company not found",
        promotedToLegalTruth: 0,
      };
    }

    const processed = await processAcquiredDocument(store, {
      discovered: {
        sourceId,
        filing: {
          accessionNumber: `customer-${params.documentId}`,
          formType: "UPLOAD",
          filingDate: new Date().toISOString().slice(0, 10),
          issuer: {
            cik: "0000000000",
            ticker: company.ticker ?? undefined,
            name: company.name,
          },
        },
        exhibit: {
          filename: params.filename,
          description: params.filename,
          exhibitType: "EX-10",
          sourceUrl: `fixture://customer/${params.companyId}/${params.documentId}/${params.filename}`,
        },
        discoverySignals: ["customer-upload-intelligence"],
      },
      bytes: params.bytes,
      contentHash,
      provenance: "customer-upload",
      usageRightsReviewStatus: "UNREVIEWED",
    });

    if (
      processed.source.extractionStatus === "FAILED" ||
      processed.source.extractionStatus === "UNSUPPORTED_FORMAT"
    ) {
      const failMeta = JSON.parse(
        JSON.stringify({
          workspaceScope: "CUSTOMER",
          companyId: params.companyId,
          documentId: params.documentId,
          declaredType: params.declaredType ?? null,
          analysisError: `Extraction status ${processed.source.extractionStatus}`,
          promotedToLegalTruth: 0,
        }),
      );
      await prisma.knowledgeSource.upsert({
        where: { sourceId },
        create: {
          sourceId,
          companyId: params.companyId,
          documentId: params.documentId,
          issuerCik: "0000000000",
          issuerTicker: company.ticker,
          issuerName: company.name,
          accessionNumber: `customer-${params.documentId}`,
          exhibitFilename: params.filename,
          sourceUrl: `fixture://customer/${params.companyId}/${params.documentId}/${params.filename}`,
          filingDate: new Date(),
          formType: "UPLOAD",
          documentTitle: params.filename,
          documentClass: processed.source.documentClass as never,
          originalBytesHash: contentHash,
          normalizedTextHash: processed.source.normalizedTextHash,
          acquisitionTimestamp: new Date(),
          parserVersion: processed.source.parserVersion,
          extractionStatus: processed.source.extractionStatus as never,
          representationLevel: processed.source.representationLevel as never,
          provenance: "customer-upload",
          usageRightsReviewStatus: "UNREVIEWED",
          byteSize: params.bytes.length,
          metadata: failMeta,
        },
        update: {
          companyId: params.companyId,
          documentId: params.documentId,
          extractionStatus: processed.source.extractionStatus as never,
          representationLevel: processed.source.representationLevel as never,
          metadata: failMeta,
        },
      });
      return {
        ok: false,
        sourceId,
        documentId: params.documentId,
        companyId: params.companyId,
        extractionStatus: processed.source.extractionStatus,
        representationLevel: processed.source.representationLevel,
        covenantItemCount: 0,
        definitionCount: processed.definitionCount,
        structuralNodeCount: processed.structuralNodeCount,
        error: `Extraction status ${processed.source.extractionStatus}`,
        promotedToLegalTruth: 0,
      };
    }

    const documentClass = documentClassFromDeclared(
      params.declaredType,
      processed.source.documentClass,
    );
    processed.source.documentClass = documentClass;
    store.upsertSource({ ...processed.source, documentClass });

    const summary = buildDocumentCovenantSummary({
      sourceId,
      documentTitle: processed.source.documentTitle || params.filename,
      issuerName: company.name,
      issuerCik: "0000000000",
      documentClass,
      candidates: store.loadCandidates(sourceId),
      definitions: store.loadDefinitions(sourceId),
      structuralNodes: store.loadStructuralNodes(sourceId),
      crossReferences: store.loadCrossReferences(sourceId),
    });

    // Workspace-isolated durable bytes — never alias into public research sourceId.
    const provider = new PostgresDocumentStorageProvider();
    const stored = await provider.store({
      companyId: params.companyId,
      filename: params.filename,
      contentType: contentTypeFor(params.filename),
      data: params.bytes,
    });

    const siblingSources = await prisma.knowledgeSource.findMany({
      where: { companyId: params.companyId },
    });
    // Merge in-memory current source + durable siblings for amendment graph
    const byId = new Map<string, ReturnType<typeof store.listSources>[number]>();
    for (const s of store.listSources()) byId.set(s.sourceId, s);
    byId.set(sourceId, { ...processed.source, documentClass });
    for (const s of siblingSources) {
      if (s.sourceId === sourceId) continue;
      byId.set(s.sourceId, {
        sourceId: s.sourceId,
        issuerCik: s.issuerCik,
        issuerTicker: s.issuerTicker ?? undefined,
        issuerName: s.issuerName ?? undefined,
        documentTitle: s.documentTitle,
        documentClass: s.documentClass as never,
        formType: s.formType,
        filingDate: s.filingDate.toISOString().slice(0, 10),
        accessionNumber: s.accessionNumber,
        exhibitFilename: s.exhibitFilename,
        sourceUrl: s.sourceUrl,
        originalBytesHash: s.originalBytesHash,
        acquisitionTimestamp: s.acquisitionTimestamp.toISOString(),
        parserVersion: s.parserVersion,
        extractionStatus: s.extractionStatus as never,
        representationLevel: s.representationLevel as never,
        provenance: s.provenance,
        usageRightsReviewStatus: s.usageRightsReviewStatus as never,
      });
    }
    const packageSources = [...byId.values()];
    const relationships = discoverDocumentRelationships(packageSources);
    const amendment = analyzeAmendmentPackage({
      companyId: params.companyId,
      sources: packageSources,
      relationships,
    });

    // Preserve counsel decisions across reanalysis; flag conflicts when AI text drifts.
    const priorRow = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
    const priorMeta =
      priorRow?.metadata && typeof priorRow.metadata === "object" && !Array.isArray(priorRow.metadata)
        ? (priorRow.metadata as Record<string, unknown>)
        : {};
    const priorApprovals = Array.isArray(priorMeta.reviewerApprovals)
      ? (priorMeta.reviewerApprovals as ReviewerApproval[])
      : [];
    const merged = mergePreservedReviewerDecisions({
      summary,
      priorApprovals,
    });

    const metadata = JSON.parse(
      JSON.stringify({
        workspaceScope: "CUSTOMER",
        companyId: params.companyId,
        documentId: params.documentId,
        declaredType: params.declaredType ?? null,
        analysis: {
          structuralNodes: processed.structuralNodeCount,
          definitions: processed.definitionCount,
          covenantCandidates: processed.candidateCount,
          crossReferences: processed.crossReferenceCount,
          processingMs: processed.processingMs,
        },
        covenantSummary: merged.summary,
        amendmentPackage: amendment,
        storageProvider: stored.provider,
        processingStatus: "ANALYZED",
        promotedToLegalTruth: 0,
        reviewerApprovals: priorApprovals,
        reviewerDecisionHistory: priorMeta.reviewerDecisionHistory ?? [],
        reviewerReanalysisConflicts: merged.conflicts,
        aiFirstLawyerReview: true,
      }),
    );

    await prisma.knowledgeSource.upsert({
      where: { sourceId },
      create: {
        sourceId,
        companyId: params.companyId,
        documentId: params.documentId,
        issuerCik: "0000000000",
        issuerTicker: company.ticker,
        issuerName: company.name,
        accessionNumber: `customer-${params.documentId}`,
        exhibitFilename: params.filename,
        sourceUrl: `fixture://customer/${params.companyId}/${params.documentId}/${params.filename}`,
        filingDate: new Date(),
        formType: "UPLOAD",
        documentTitle: params.filename,
        documentClass: documentClass as never,
        originalBytesHash: contentHash,
        normalizedTextHash: processed.source.normalizedTextHash,
        acquisitionTimestamp: new Date(),
        parserVersion: processed.source.parserVersion,
        extractionStatus: processed.source.extractionStatus as never,
        representationLevel: processed.source.representationLevel as never,
        provenance: "customer-upload",
        usageRightsReviewStatus: "UNREVIEWED",
        byteSize: params.bytes.length,
        storageRef: stored.storageRef,
        metadata,
      },
      update: {
        companyId: params.companyId,
        documentId: params.documentId,
        documentClass: documentClass as never,
        extractionStatus: processed.source.extractionStatus as never,
        representationLevel: processed.source.representationLevel as never,
        issuerName: company.name,
        issuerTicker: company.ticker,
        byteSize: params.bytes.length,
        storageRef: stored.storageRef,
        metadata,
      },
    });

    const analysisSucceeded =
      processed.source.extractionStatus === "CANDIDATES_DISCOVERED" ||
      processed.source.extractionStatus === "TEXT_EXTRACTED" ||
      processed.structuralNodeCount > 0;

    return {
      ok: analysisSucceeded,
      sourceId,
      documentId: params.documentId,
      companyId: params.companyId,
      extractionStatus: processed.source.extractionStatus,
      representationLevel: processed.source.representationLevel,
      covenantItemCount: summary.items.length,
      definitionCount: processed.definitionCount,
      structuralNodeCount: processed.structuralNodeCount,
      promotedToLegalTruth: 0,
    };
  } catch (err) {
    return {
      ok: false,
      documentId: params.documentId,
      companyId: params.companyId,
      extractionStatus: "FAILED",
      covenantItemCount: 0,
      definitionCount: 0,
      structuralNodeCount: 0,
      error: err instanceof Error ? err.message : String(err),
      promotedToLegalTruth: 0,
    };
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "htm" || ext === "html") return "text/html";
  return "text/plain";
}
