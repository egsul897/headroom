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
import { documentClassFromConfirmedType } from "./document-class";
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

/**
 * General rule: an analysis that found NO covenant items, NO structural
 * nodes, and NO definitions found nothing at all — either the document
 * is not a debt document or extraction failed. That is a review/failure
 * state, never a silent ANALYZED success: presenting an empty covenant
 * list as success tells the customer "no covenants" when the truth is
 * "we could not read the document." A document with structure but no
 * covenants (e.g. a short waiver with a section tree) still succeeds —
 * the rule fires only on total emptiness.
 *
 * Rule 156: total emptiness is not the only silent-success shape.
 * Phase-2 precedent aggregates showed discovery failure at scale
 * (DISCOVERY_GAP the dominant scoreboard class, 13,581 findings): a
 * large structured document whose covenant discovery finds NOTHING
 * used to succeed with an empty covenant list, because the old guard
 * fired only when structural nodes were also zero. A real indenture
 * or credit agreement has hundreds of nodes and always carries
 * covenants; a short waiver has a handful. Zero covenant items with
 * substantial parsed structure — or candidates that all got dropped
 * by summarization — is a discovery failure, not a covenant-free
 * document, and fails the same way.
 */
/** Parsed-structure count above which "zero covenant items" means discovery failed. */
export const SUBSTANTIAL_STRUCTURE_NODES = 20;

export function emptyAnalysisReason(args: {
  covenantItemCount: number;
  structuralNodeCount: number;
  definitionCount: number;
  covenantCandidateCount?: number;
}): string | null {
  if (
    args.covenantItemCount === 0 &&
    args.structuralNodeCount === 0 &&
    args.definitionCount === 0
  ) {
    return "Analysis found no covenant structure (no covenant items, no structural nodes, no definitions) — document may not be a debt document or extraction failed. Re-upload or request review.";
  }
  if (
    args.covenantItemCount === 0 &&
    args.structuralNodeCount >= SUBSTANTIAL_STRUCTURE_NODES
  ) {
    return `Analysis found no covenant items despite parsing ${args.structuralNodeCount} structural nodes — covenant discovery failed for this document. Re-upload or request review; do not treat the empty list as "no covenants".`;
  }
  if (
    args.covenantItemCount === 0 &&
    (args.covenantCandidateCount ?? 0) > 0
  ) {
    return `Analysis found ${args.covenantCandidateCount} covenant candidates but none survived summarization — covenant discovery failed for this document. Re-upload or request review; do not treat the empty list as "no covenants".`;
  }
  return null;
}

export function isEmptyAnalysis(args: {
  covenantItemCount: number;
  structuralNodeCount: number;
  definitionCount: number;
  covenantCandidateCount?: number;
}): boolean {
  return emptyAnalysisReason(args) !== null;
}

/** Map human-declared DocumentType onto KF debt classes when classifier returns UNKNOWN. */function documentClassFromDeclared(
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

  // General rule: staging must never clobber a prior analysis. The stage
  // upsert is keyed by sourceId = (companyId, documentId, contentHash),
  // so an update here means IDENTICAL bytes — the prior analysis is for
  // these exact bytes and stays valid until the new analysis replaces it.
  // Without this merge, a re-upload (or a retry after a transient
  // failure) wiped covenantSummary/amendmentPackage/reviewer decisions,
  // and a failed re-analysis left the row with no analysis at all.
  // The fresh attempt supersedes a prior analysisError, but keeps the
  // prior analysis payload.
  const priorRow = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
  const priorMeta =
    priorRow?.metadata && typeof priorRow.metadata === "object" && !Array.isArray(priorRow.metadata)
      ? { ...(priorRow.metadata as Record<string, unknown>) }
      : {};
  const stagedMeta = JSON.parse(
    JSON.stringify({ ...priorMeta, ...pendingMeta }),
  );
  delete stagedMeta.analysisError;

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
      metadata: stagedMeta,
    },
    update: {
      companyId: params.companyId,
      documentId: params.documentId,
      storageRef,
      byteSize: params.bytes.length,
      issuerName: company.name,
      issuerTicker: company.ticker,
      metadata: stagedMeta,
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
      // Rule 66: a failed re-analysis must NOT wipe the prior
      // analysis (rule-4 bug class in the FAILED branch). The
      // success branch preserves reviewer decisions and the
      // staging branch merges priorMeta — but this branch built
      // failMeta from scratch and replaced the whole metadata,
      // destroying covenantSummary / amendmentPackage /
      // reviewerApprovals / compile results for a previously
      // analyzed document. Merge: the fresh attempt supersedes
      // the error field, the prior analysis payload survives
      // (it is for these exact bytes — sourceId includes the
      // content hash). The caller stamps FAILED_RETRYABLE.
      const failedPriorRow = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
      const failedPriorMeta =
        failedPriorRow?.metadata && typeof failedPriorRow.metadata === "object" && !Array.isArray(failedPriorRow.metadata)
          ? { ...(failedPriorRow.metadata as Record<string, unknown>) }
          : {};
      const failMeta = JSON.parse(
        JSON.stringify({
          ...failedPriorMeta,
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

    // Rule 128: a counsel-confirmed type must survive re-analysis.
    // Without this, re-analyzing a document whose class counsel
    // corrected (rule 127) recomputes the class from the
    // classifier verdict alone and silently undoes the
    // correction — the mismatch returns and operative
    // resolution flips back to the classifier's (wrong) class.
    // The confirmed Document.type wins; the classifier verdict
    // is used only when no confirmation exists.
    const confirmedDoc = await prisma.document.findFirst({
      where: { id: params.documentId, companyId: params.companyId },
      select: { type: true, typeConfirmedByUser: true },
    });
    const confirmedClass =
      confirmedDoc?.typeConfirmedByUser && confirmedDoc.type
        ? documentClassFromConfirmedType(confirmedDoc.type)
        : null;
    const documentClass =
      confirmedClass ??
      documentClassFromDeclared(params.declaredType, processed.source.documentClass);
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
    // Phase 2C package graph (title caption for siblings; full text for focal doc).
    try {
      const { buildWorkspacePackageGraph, packageGraphMetadataSummary } = await import(
        "../legal-reasoning/package-graph-wire"
      );
      const { extractTextAsync } = await import("../../knowledge-factory/pipeline/text");
      let focalText: string | null = null;
      try {
        focalText = (await extractTextAsync(params.bytes, params.filename)).text;
      } catch {
        focalText = null;
      }
      const graph = buildWorkspacePackageGraph({
        companyId: params.companyId,
        documents: packageSources.map((s) => ({
          sourceId: s.sourceId,
          documentTitle: s.documentTitle,
          documentClass: s.documentClass,
          text: s.sourceId === sourceId ? focalText : null,
        })),
      });
      Object.assign(amendment, { packageGraph: packageGraphMetadataSummary(graph) });
    } catch {
      /* non-blocking — title/metadata amendment package still returned */
    }
    // Persist discovered agreement edges into Neon (idempotent). Failures must not block analysis.
    try {
      const { persistAmendmentGraph } = await import("../legal-reasoning/amendment-graph");
      await persistAmendmentGraph({ companyId: params.companyId });
    } catch {
      /* non-blocking */
    }

    // Deterministic agreement pipeline (text → section tree → roles/xrefs → checklist → baskets/compute).
    // Persisted ONLY to customer_* tables scoped by (companyId, documentId) — never the shared kf_* corpus.
    // Tables come from migrations (no DDL here). A failure is recorded as a FAILED run (status + error) and
    // surfaced in metadata.agreementPipeline; it never fails the upload. Disable with CLF_AGREEMENT_PIPELINE=0.
    let agreementPipeline: Record<string, unknown> | null = null;
    if (process.env.CLF_AGREEMENT_PIPELINE !== "0") {
      const { runAgreementPipeline, persistCustomerAgreementRun } = await import(
        "../../covenant-learning-factory/pipeline/agreement-pipeline"
      );
      const { extractTextAsync } = await import("../../knowledge-factory/pipeline/text");
      let summary: { stats: unknown; families: unknown } | null = null;
      const outcome = await persistCustomerAgreementRun(
        prisma as never,
        { companyId: params.companyId, documentId: params.documentId, sourceId },
        async () => {
          const text = (await extractTextAsync(params.bytes, params.filename)).text;
          const r = runAgreementPipeline({ sourceId, text });
          summary = { stats: r.stats, families: r.families };
          return r;
        },
      );
      agreementPipeline = { ...outcome, ...(outcome.status === "OK" && summary ? summary : {}) };
    }

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

    const emptyReason = emptyAnalysisReason({
      covenantItemCount: summary.items.length,
      structuralNodeCount: processed.structuralNodeCount,
      definitionCount: processed.definitionCount,
      covenantCandidateCount: processed.candidateCount,
    });
    const foundNothing = emptyReason !== null;

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
        agreementPipeline,
        storageProvider: stored.provider,
        processingStatus: foundNothing ? "FAILED_RETRYABLE" : "ANALYZED",
        ...(foundNothing
          ? {
              analysisError: emptyReason,
            }
          : {}),
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

    // Rule 171: re-analysis can add undecided items, which must flip
    // a previously-complete coverage declaration back to incomplete.
    // Must never fail the upload (same pattern as feedback capture).
    try {
      const { evaluateCounselCoverage } = await import("./counsel-coverage");
      await evaluateCounselCoverage(prisma, { companyId: params.companyId, sourceId });
    } catch {
      // Coverage evaluation must not fail the upload.
    }

    const analysisSucceeded =
      (processed.source.extractionStatus === "CANDIDATES_DISCOVERED" ||
        processed.source.extractionStatus === "TEXT_EXTRACTED" ||
        processed.structuralNodeCount > 0) &&
      !foundNothing;

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
      ...(foundNothing
        ? {
            error: emptyReason,
          }
        : {}),
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
