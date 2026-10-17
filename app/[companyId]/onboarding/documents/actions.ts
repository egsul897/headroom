"use server";
import { requireTenantAction } from "@/lib/auth/guard";

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
import { runInBackground } from "@/lib/platform/background";
import type { DocumentType } from "@prisma/client";

export async function uploadDocumentAction(companyId: string, formData: FormData) {
  await requireTenantAction(companyId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  const { MAX_CUSTOMER_UPLOAD_BYTES, LARGE_UPLOAD_DEFER_BYTES, stageCustomerDocument, reanalyzeCustomerDocumentFromStorage } =
    await import("@/lib/product/customer-intelligence/analyze-upload");
  if (file.size > MAX_CUSTOMER_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds ${Math.floor(MAX_CUSTOMER_UPLOAD_BYTES / (1024 * 1024))}MB limit. Split the package or upload a smaller exhibit.`,
    );
  }
  // Rule 109: an empty or unexpected declared type is OTHER
  // (unknown), never a pre-chosen Credit Agreement.
  const declaredRaw = String(formData.get("declaredType") || "OTHER");
  const declaredType = (
    ["CREDIT_AGREEMENT", "INDENTURE", "AMENDMENT", "INTERCREDITOR_AGREEMENT", "COMPLIANCE_CERTIFICATE", "FINANCIAL_STATEMENT", "OTHER"].includes(declaredRaw)
      ? declaredRaw
      : "OTHER"
  ) as DocumentType;
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
    // The staged sourceId, so a failed analysis can stamp
    // FAILED_RETRYABLE instead of leaving the row STAGED ("in
    // progress") forever. There is no background worker for staged
    // rows — only upload and manual retry drive analysis.
    let stagedSourceId: string | null = null;
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
      stagedSourceId = staged.sourceId;

      // Large files: upload returns after durable stage; analysis runs from storage (retryable).
      if (buffer.length >= LARGE_UPLOAD_DEFER_BYTES) {
        // Registered with waitUntil (lib/platform/background.ts) — a bare
        // `void promise` is torn down with the serverless instance once
        // the response returns, leaving the document STAGED forever.
        const deferredSourceId = staged.sourceId;
        runInBackground(() => reanalyzeCustomerDocumentFromStorage({ companyId, documentId }), {
          label: "upload.deferred-analysis",
          tags: { companyId },
          onSuccess: () => {
            revalidatePath(`/${companyId}/onboarding/documents`);
            revalidatePath(`/${companyId}/documents`);
            revalidatePath(`/${companyId}/covenants`);
            revalidatePath(`/${companyId}/documents/${documentId}`);
          },
          // A thrown deferred analysis must stamp FAILED_RETRYABLE (same
          // rule as the direct path) so the row never reads "in progress".
          onError: async (err) => {
            const { markCustomerProcessingStatus } = await import(
              "@/lib/product/customer-intelligence/analyze-upload"
            );
            await markCustomerProcessingStatus({
              sourceId: deferredSourceId,
              status: "FAILED_RETRYABLE",
              error: err instanceof Error ? err.message : String(err),
            });
          },
        });
        console.info(
          `[uploadDocumentAction] deferred analysis sourceId=${staged.sourceId} bytes=${buffer.length}`,
        );
      } else {
        const result = await analyzeCustomerDocument({
          companyId,
          documentId,
          bytes: buffer,
          filename: file.name,
          declaredType,
        });
        if (!result.ok) {
          // Durable failure: the direct path must stamp FAILED_RETRYABLE
          // like the reanalyze path does — discarding the return value
          // left the row STAGED ("in progress") forever.
          const { markCustomerProcessingStatus } = await import(
            "@/lib/product/customer-intelligence/analyze-upload"
          );
          await markCustomerProcessingStatus({
            sourceId: staged.sourceId,
            status: "FAILED_RETRYABLE",
            error: result.error,
          });
        }
      }
    } catch (err) {
      console.error(
        `[analyzeCustomerDocument] unexpected error for company ${companyId} document ${documentId}:`,
        err,
      );
      // Thrown errors must also stamp FAILED_RETRYABLE (best-effort,
      // never masking the original error).
      if (stagedSourceId) {
        try {
          const { markCustomerProcessingStatus } = await import(
            "@/lib/product/customer-intelligence/analyze-upload"
          );
          await markCustomerProcessingStatus({
            sourceId: stagedSourceId,
            status: "FAILED_RETRYABLE",
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // Best-effort: the log above still reports the failure.
        }
      }
    }
  }

  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/documents`);
  revalidatePath(`/${companyId}/covenants`);
  if (documentId) revalidatePath(`/${companyId}/documents/${documentId}`);
}

/**
 * P0 repair action: re-run the auto-accept convergence sweep over
 * every analyzed document in the workspace. Operator-triggered
 * repair (e.g. after a routine-class widening ships) that does
 * not require re-uploading or re-analyzing any document. The
 * sweep is idempotent — already-decided items are untouched.
 */
export async function sweepAutoAcceptAction(companyId: string) {
  await requireTenantAction(companyId);
  const { sweepAutoAcceptForWorkspace } = await import(
    "@/lib/product/customer-intelligence/reviewer-approvals"
  );
  await sweepAutoAcceptForWorkspace({ companyId });
  revalidatePath(`/${companyId}/onboarding/documents`);
  revalidatePath(`/${companyId}/documents`);
  revalidatePath(`/${companyId}/covenants`);
  revalidatePath(`/${companyId}/rulebook`);
}

export async function retryCustomerAnalysisAction(companyId: string, documentId: string) {
  await requireTenantAction(companyId);
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
  await requireTenantAction(companyId);
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
      const { getDocumentStorageProviderForRef } = await import("@/lib/document-storage");
      const bytes = await getDocumentStorageProviderForRef(doc.storageRef).retrieve(doc.storageRef);
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
  await requireTenantAction(companyId);
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
