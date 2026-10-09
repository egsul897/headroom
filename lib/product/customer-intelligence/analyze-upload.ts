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
import { buildDocumentCovenantSummary } from "../covenant-intelligence/summarize";
import { analyzeAmendmentPackage } from "./amendment-package";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function customerSourceId(companyId: string, documentId: string, contentHash: string): string {
  return `customer:${companyId}:${documentId}:${contentHash.slice(0, 16)}`;
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

    const summary = buildDocumentCovenantSummary({
      sourceId,
      documentTitle: processed.source.documentTitle || params.filename,
      issuerName: company.name,
      issuerCik: "0000000000",
      documentClass: processed.source.documentClass,
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
    for (const s of siblingSources) {
      if (byId.has(s.sourceId)) continue;
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
        covenantSummary: summary,
        amendmentPackage: amendment,
        storageProvider: stored.provider,
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
        storageRef: stored.storageRef,
        metadata,
      },
      update: {
        companyId: params.companyId,
        documentId: params.documentId,
        documentClass: processed.source.documentClass as never,
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
