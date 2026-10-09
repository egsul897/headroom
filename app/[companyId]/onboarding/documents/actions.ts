"use server";

import { requireCompanyAccess } from "@/lib/auth/tenant-boundary";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runExtractionForDocument } from "@/lib/onboarding/documents";
import { uploadDocumentThroughIngestion } from "@/lib/connectors/upload-connector";
import { getExtractionProvider } from "@/lib/extraction/get-provider";
import { runContractAnalysis } from "@/lib/contract-model/analysis";
import { analyzeCustomerDocument } from "@/lib/product/customer-intelligence/analyze-upload";
import { prisma } from "@/lib/prisma";
import type { DocumentType } from "@prisma/client";

export async function uploadDocumentAction(companyId: string, formData: FormData) {
  await requireCompanyAccess(companyId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
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
      await analyzeCustomerDocument({
        companyId,
        documentId,
        bytes: buffer,
        filename: file.name,
        declaredType,
      });
    } catch (err) {
      console.error(
        `[analyzeCustomerDocument] unexpected error for company ${companyId} document ${documentId}:`,
        err,
      );
    }
  }

  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/documents`);
  if (documentId) revalidatePath(`/${companyId}/documents/${documentId}`);
}

export async function runExtractionAction(companyId: string, documentId: string) {
  await requireCompanyAccess(companyId);
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

  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/documents`);
  redirect(`/${companyId}/onboarding/review`);
}
