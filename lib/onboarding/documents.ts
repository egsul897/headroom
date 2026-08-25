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
 */
export async function uploadAndChunkDocument(params: UploadDocumentParams) {
  const contentType = inferContentType(params.filename);
  const storage = getDocumentStorageProvider();
  const stored = await storage.store({ companyId: params.companyId, filename: params.filename, contentType, data: params.data });

  const document = await prisma.document.create({
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

  const parsed = await parseDocument(params.data, contentType);
  const chunks = chunkDocument(parsed);
  await persistDocumentChunks(document.id, chunks);

  return { document, chunkCount: chunks.length };
}

/** Creates an ExtractionRun for a document and immediately drives every pending stage - the wizard's "Extraction" stage single action. */
export async function runExtractionForDocument(params: { companyId: string; documentId: string; provider: ContractExtractionProvider; providerName: string; model: string; promptVersion?: string; schemaVersion?: string }) {
  const run = await createExtractionRun({
    companyId: params.companyId,
    documentId: params.documentId,
    provider: params.providerName,
    model: params.model,
    promptVersion: params.promptVersion ?? "v1",
    schemaVersion: params.schemaVersion ?? "v1",
  });
  const results = await runAllPendingStages(run.id, params.provider);
  return { run, results };
}
