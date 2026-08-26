/**
 * Document upload + extraction kickoff (docs/company-onboarding-v1-implementation.md,
 * onboarding wizard's Documents/Extraction stages).
 *
 * Composes Phase 1's own building blocks (lib/document-storage,
 * lib/extraction/parse|chunk|persist-chunks|pipeline) - never re-implements
 * storage, parsing, or the staged-extraction contract. This file's only job
 * is the ONE new step Phase 1 explicitly left for Phase 2: wiring an
 * uploaded file's bytes through storage -> parse -> chunk -> persist -> a
 * Document row a company owns, and then handing that document to
 * createExtractionRun/runAllPendingStages.
 */

import { getDocumentStorageProvider } from "../document-storage";
import { chunkDocument } from "../extraction/chunk";
import { parseDocument } from "../extraction/parse";
import { persistDocumentChunks } from "../extraction/persist-chunks";
import { createExtractionRun, runAllPendingStages } from "../extraction/pipeline";
import type { ContractExtractionProvider } from "../extraction/provider";
import { prisma } from "../prisma";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export function inferContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const contentType = CONTENT_TYPE_BY_EXTENSION[ext];
  if (!contentType) throw new Error(`Unsupported document file extension ".${ext}" - supported: ${Object.keys(CONTENT_TYPE_BY_EXTENSION).join(", ")}.`);
  return contentType;
}

export interface UploadDocumentParams {
  companyId: string;
  filename: string;
  data: Buffer;
  /** Human-declared best guess at the time of upload - STRUCTURE-stage extraction may later propose a correction, which stays unconfirmed (typeConfirmedByUser: false) until a reviewer approves it. */
  declaredType: "CREDIT_AGREEMENT" | "INDENTURE" | "OTHER" | "AMENDMENT" | "INTERCREDITOR_AGREEMENT" | "COMPLIANCE_CERTIFICATE";
  governs?: string;
}

/**
 * UPLOAD -> PARSE -> CHUNK -> PERSIST, server-side only (this function must
 * never be called from a client component - `storageRef` must never reach a
 * client bundle, per lib/document-storage's own documented discipline).
 * Creates the Document row itself (source: "user-upload",
 * typeConfirmedByUser/amendmentRelationshipConfirmedByUser: false - an
 * uploaded document's type/amendment relationship is NOT yet human-confirmed
 * until the STRUCTURE-stage candidate is reviewed, unlike an
 * engineer-authored row).
 *
 * Blob-then-DB write order: if the Document row fails to create after the
 * blob was already stored, the orphaned blob is cleaned up (best-effort -
 * DocumentStorageProvider.delete never throws) and the original DB error is
 * rethrown unchanged. No Document row ever exists without a real, already-
 * stored blob behind it - there is no state where a document is "marked as
 * uploaded" without the bytes actually being retrievable.
 */
export async function uploadAndChunkDocument(params: UploadDocumentParams) {
  const contentType = inferContentType(params.filename);
  const storage = getDocumentStorageProvider();
  const stored = await storage.store({ companyId: params.companyId, filename: params.filename, contentType, data: params.data });

  let document;
  try {
    document = await prisma.document.create({
      data: {
        companyId: params.companyId,
        name: params.filename,
        type: params.declaredType,
        governs: params.governs,
        storageRef: stored.storageRef,
        storageProvider: stored.provider,
        originalFilename: params.filename,
        uploadedAt: new Date(),
        source: "user-upload",
        typeConfirmedByUser: false,
        amendmentRelationshipConfirmedByUser: false,
      },
    });
  } catch (err) {
    await storage.delete(stored.storageRef);
    throw err;
  }

  const parsed = await parseDocument(params.data, contentType);
  const chunks = chunkDocument(parsed);
  await persistDocumentChunks(document.id, chunks);

  return { document, chunkCount: chunks.length };
}

export interface DocumentWithExtractionStatus {
  id: string;
  name: string;
  type: string;
  originalFilename: string | null;
  uploadedAt: Date | null;
  typeConfirmedByUser: boolean;
  chunkCount: number;
  latestRun: { id: string; provider: string; model: string; stages: { stage: string; status: string; error: string | null }[] } | null;
}

/**
 * The onboarding wizard's Documents stage listing - one document row per
 * upload, its chunk count, and its most recent extraction run's per-stage
 * status. `latestRun.provider`/`model` (production-readiness fix,
 * docs/autonomous-ingestion-production-readiness.md) surface
 * ExtractionRun's own already-recorded provider/model columns - this was
 * always persisted, just never previously shown, and is the intended way to
 * confirm which provider actually ran a given extraction ("anthropic" vs.
 * "synthetic") from the deployed app itself, without inferring it from
 * response timing.
 */
export async function getDocumentsWithExtractionStatus(companyId: string): Promise<DocumentWithExtractionStatus[]> {
  const documents = await prisma.document.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  const results: DocumentWithExtractionStatus[] = [];
  for (const d of documents) {
    const [chunkCount, latestRun] = await Promise.all([
      prisma.documentChunk.count({ where: { documentId: d.id } }),
      prisma.extractionRun.findFirst({ where: { documentId: d.id }, orderBy: { startedAt: "desc" }, include: { stages: { select: { stage: true, status: true, error: true } } } }),
    ]);
    results.push({
      id: d.id,
      name: d.name,
      type: d.type,
      originalFilename: d.originalFilename,
      uploadedAt: d.uploadedAt,
      typeConfirmedByUser: d.typeConfirmedByUser,
      chunkCount,
      latestRun: latestRun ? { id: latestRun.id, provider: latestRun.provider, model: latestRun.model, stages: latestRun.stages } : null,
    });
  }
  return results;
}

/**
 * Drives every pending/failed stage for a document's extraction - the
 * wizard's "Extraction" stage single action. Reuses the document's most
 * recent ExtractionRun (retrying/resuming it from persisted state, per
 * lib/extraction/run-stage.ts's own partial-failure contract) rather than
 * creating a fresh run + six new PENDING stages every time this is called;
 * a new run is only created the FIRST time a document is extracted.
 */
export async function runExtractionForDocument(params: { companyId: string; documentId: string; provider: ContractExtractionProvider; providerName: string; model: string; promptVersion?: string; schemaVersion?: string }) {
  const existing = await prisma.extractionRun.findFirst({ where: { documentId: params.documentId }, orderBy: { startedAt: "desc" } });
  const run =
    existing ??
    (await createExtractionRun({
      companyId: params.companyId,
      documentId: params.documentId,
      provider: params.providerName,
      model: params.model,
      promptVersion: params.promptVersion ?? "v1",
      schemaVersion: params.schemaVersion ?? "v1",
    }));
  const results = await runAllPendingStages(run.id, params.provider);
  return { run, results };
}
