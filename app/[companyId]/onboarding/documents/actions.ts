"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runExtractionForDocument } from "@/lib/onboarding/documents";
import { proposeFinancialFactsFromDocument } from "@/lib/onboarding/financial-facts-from-document";
import { uploadDocumentThroughIngestion } from "@/lib/connectors/upload-connector";
import { getExtractionProvider } from "@/lib/extraction/get-provider";
import { runContractAnalysis } from "@/lib/contract-model/analysis";
import { analyzeCustomerDocument } from "@/lib/product/customer-intelligence/analyze-upload";
import { connectSource } from "@/lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "@/lib/connectors/ingestion";
import { prisma } from "@/lib/prisma";
import type { DocumentType } from "@prisma/client";

export async function uploadDocumentAction(companyId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  const { MAX_CUSTOMER_UPLOAD_BYTES, LARGE_UPLOAD_DEFER_BYTES, stageCustomerDocument, reanalyzeCustomerDocumentFromStorage } =
    await import("@/lib/product/customer-intelligence/analyze-upload");
  if (file.size > MAX_CUSTOMER_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds ${Math.floor(MAX_CUSTOMER_UPLOAD_BYTES / (1024 * 1024))}MB limit. Split the package or upload a smaller exhibit.`,
    );
  }
  const declaredType = String(formData.get("declaredType") ?? "OTHER") as DocumentType;
  const governs = String(formData.get("governs") ?? "") || undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  // Routed through uploadDocumentThroughIngestion (lib/connectors/upload-connector.ts)
  // rather than calling uploadAndChunkDocument directly (P1-3 remediation) -
  // byte-identical content re-uploaded for this company converges on the
  // EXISTING Document/SourceArtifact instead of minting a second row.
  const upload = await uploadDocumentThroughIngestion({
    companyId,
    filename: file.name,
    data: buffer,
    declaredType,
    governs,
  });

  // Customer document intelligence — company-scoped KnowledgeSource + covenant summaries.
  // Never claim success when extraction fails (analyzeCustomerDocument.ok === false).
  let documentId = upload.document?.id;
  if (!documentId && upload.duplicate) {
    const artifact = await prisma.sourceArtifact.findUnique({ where: { id: upload.artifactId } });
    documentId = artifact?.documentId ?? undefined;
  }
  if (documentId) {
    try {
      const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
      const staged = await stageCustomerDocument({
        companyId,
        documentId,
        bytes: buffer,
        filename: file.name,
        declaredType,
        existingStorageRef: doc?.storageRef,
      });

      // Large files: upload returns after durable stage; analysis runs from storage (retryable).
      if (buffer.length >= LARGE_UPLOAD_DEFER_BYTES) {
        void reanalyzeCustomerDocumentFromStorage({ companyId, documentId })
          .then(() => {
            revalidatePath(`/${companyId}/onboarding/documents`);
            revalidatePath(`/${companyId}/documents`);
            revalidatePath(`/${companyId}/covenants`);
            revalidatePath(`/${companyId}/documents/${documentId}`);
          })
          .catch((err) => {
            console.error(
              `[reanalyzeCustomerDocumentFromStorage] deferred failure company=${companyId} doc=${documentId}`,
              err,
            );
          });
        console.info(
          `[uploadDocumentAction] deferred analysis sourceId=${staged.sourceId} bytes=${buffer.length}`,
        );
      } else {
        await analyzeCustomerDocument({
          companyId,
          documentId,
          bytes: buffer,
          filename: file.name,
          declaredType,
        });
      }
    } catch (err) {
      console.error(
        `[analyzeCustomerDocument] unexpected error for company ${companyId} document ${documentId}:`,
        err,
      );
    }
  }

  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/documents`);
  revalidatePath(`/${companyId}/covenants`);
  if (documentId) revalidatePath(`/${companyId}/documents/${documentId}`);
}

export async function retryCustomerAnalysisAction(companyId: string, documentId: string) {
  const { reanalyzeCustomerDocumentFromStorage } = await import(
    "@/lib/product/customer-intelligence/analyze-upload"
  );
  await reanalyzeCustomerDocumentFromStorage({ companyId, documentId });
  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/documents`);
  revalidatePath(`/${companyId}/covenants`);
  revalidatePath(`/${companyId}/documents/${documentId}`);
}

export async function runExtractionAction(companyId: string, documentId: string) {
  const { provider, providerName, model, promptVersion, schemaVersion } = getExtractionProvider();
  await runExtractionForDocument({ companyId, documentId, provider, providerName, model, promptVersion, schemaVersion });

  // BLOCKER-10 remediation (docs/phase-3f1-6-r-blocker-remediation/15-live-contract-analysis-orchestrator.json):
  // this is the live trigger boundary for lib/contract-model/analysis's
  // runContractAnalysis - the ONE real application entry point that composes
  // the contract-model compiler/semantic/verification/safe-failure pipeline.
  try {
    await runContractAnalysis({ companyId, triggeringDocumentId: documentId });
  } catch (err) {
    console.error(`[runContractAnalysis] unexpected error for company ${companyId} (triggered by document ${documentId}):`, err);
  }

  // Re-run customer intelligence if durable bytes are available.
  try {
    const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
    if (doc?.storageRef) {
      const { getDocumentStorageProvider } = await import("@/lib/document-storage");
      const bytes = await getDocumentStorageProvider().retrieve(doc.storageRef);
      await analyzeCustomerDocument({
        companyId,
        documentId,
        bytes,
        filename: doc.originalFilename || doc.name,
        declaredType: doc.type,
      });
    }
  } catch (err) {
    console.error(`[analyzeCustomerDocument] re-analyze after extraction failed:`, err);
  }

  try {
    await proposeFinancialFactsFromDocument(companyId, documentId);
  } catch (err) {
    console.error(`[proposeFinancialFactsFromDocument] failed for ${documentId}:`, err);
  }

  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/onboarding/review`);
  revalidatePath(`/${companyId}/documents`);
  redirect(`/${companyId}/onboarding/review`);
}

/** CSV financials → FINANCIAL_FACT candidates (same connector as the sources stage). */
export async function uploadFinancialCsvAction(companyId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file to upload.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const connection = await connectSource({ companyId, connectorType: "CSV_FINANCIAL" });
  const kind = connection.lastSuccessfulSyncAt ? "SYNC" : "INITIALIZE";
  const job = await createIngestionJob({ companyId, kind, sourceConnectionId: connection.id, rawInput: buffer });
  await runAllPendingIngestionStages(job.id);
  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/onboarding/review`);
  revalidatePath(`/${companyId}/onboarding/sources`);
}
