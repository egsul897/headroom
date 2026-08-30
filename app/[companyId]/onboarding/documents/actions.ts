"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runExtractionForDocument } from "@/lib/onboarding/documents";
import { uploadDocumentThroughIngestion } from "@/lib/connectors/upload-connector";
import { getExtractionProvider } from "@/lib/extraction/get-provider";
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
  revalidatePath(`/${companyId}/onboarding/documents`);
  redirect(`/${companyId}/onboarding/review`);
}
