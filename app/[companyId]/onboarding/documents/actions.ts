"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uploadAndChunkDocument, runExtractionForDocument } from "@/lib/onboarding/documents";
import { getExtractionProvider } from "@/lib/extraction/get-provider";
import type { DocumentType } from "@prisma/client";

export async function uploadDocumentAction(companyId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  const declaredType = String(formData.get("declaredType") ?? "OTHER") as DocumentType;
  const governs = String(formData.get("governs") ?? "") || undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadAndChunkDocument({ companyId, filename: file.name, data: buffer, declaredType, governs });
  revalidatePath(`/${companyId}/onboarding/documents`);
}

export async function runExtractionAction(companyId: string, documentId: string) {
  const { provider, providerName, model, promptVersion, schemaVersion } = getExtractionProvider();
  await runExtractionForDocument({ companyId, documentId, provider, providerName, model, promptVersion, schemaVersion });
  revalidatePath(`/${companyId}/onboarding/documents`);
  redirect(`/${companyId}/onboarding/review`);
}
