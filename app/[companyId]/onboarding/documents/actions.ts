"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runExtractionForDocument } from "@/lib/onboarding/documents";
import { uploadDocumentThroughIngestion } from "@/lib/connectors/upload-connector";
import { getExtractionProvider } from "@/lib/extraction/get-provider";
import { runContractAnalysis } from "@/lib/contract-model/analysis";
import type { DocumentType } from "@prisma/client";

export async function uploadDocumentAction(companyId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  const declaredType = String(formData.get("declaredType") ?? "OTHER") as DocumentType;
  const governs = String(formData.get("governs") ?? "") || undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  // Routed through uploadDocumentThroughIngestion (lib/connectors/upload-connector.ts)
  // rather than calling uploadAndChunkDocument directly (P1-3 remediation) -
  // byte-identical content re-uploaded for this company converges on the
  // EXISTING Document/SourceArtifact instead of minting a second row. A
  // duplicate is a silent no-op here, same as before this fix: the page
  // below only ever lists whatever Document rows exist, so a de-duped
  // re-upload correctly renders as "nothing new appeared," not an error.
  await uploadDocumentThroughIngestion({ companyId, filename: file.name, data: buffer, declaredType, governs });
  revalidatePath(`/${companyId}/onboarding/documents`);
}

export async function runExtractionAction(companyId: string, documentId: string) {
  const { provider, providerName, model, promptVersion, schemaVersion } = getExtractionProvider();
  await runExtractionForDocument({ companyId, documentId, provider, providerName, model, promptVersion, schemaVersion });

  // BLOCKER-10 remediation (docs/phase-3f1-6-r-blocker-remediation/15-live-contract-analysis-orchestrator.json):
  // this is the live trigger boundary for lib/contract-model/analysis's
  // runContractAnalysis - the ONE real application entry point that composes
  // the contract-model compiler/semantic/verification/safe-failure pipeline
  // (lib/contract-model/compiler/**), which previously had ZERO application
  // callers at all (17-safe-failure-wiring-certification.json). Runs
  // alongside, and independently of, the pre-existing lib/extraction/**
  // candidate-review pipeline above - see
  // 19-contract-truth-ownership-map.json for why both pipelines remain live
  // today and which one owns which kind of truth going forward.
  //
  // Deliberately best-effort at THIS call site: runContractAnalysis itself
  // never throws for an ordinary analysis failure (it persists a FAILED
  // AnalysisRun row and returns a structured result instead - see its own
  // header comment) - this catch exists only as defense in depth so a truly
  // unexpected exception here can never break the pre-existing extraction
  // wizard's own redirect/UX, which must keep working regardless of this
  // newer pipeline's own health.
  try {
    await runContractAnalysis({ companyId, triggeringDocumentId: documentId });
  } catch (err) {
    console.error(`[runContractAnalysis] unexpected error for company ${companyId} (triggered by document ${documentId}):`, err);
  }

  revalidatePath(`/${companyId}/onboarding/documents`);
  redirect(`/${companyId}/onboarding/review`);
}
