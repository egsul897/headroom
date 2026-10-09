"use server";

import { revalidatePath } from "next/cache";
import { recordReviewerDecision, type ReviewDecision } from "@/lib/product/customer-intelligence/reviewer-approvals";

export async function reviewProvisionAction(companyId: string, formData: FormData) {
  const sourceId = String(formData.get("sourceId") ?? "");
  const sectionRef = String(formData.get("sectionRef") ?? "");
  const category = String(formData.get("category") ?? "");
  const decision = String(formData.get("decision") ?? "") as ReviewDecision;
  const editedPlainEnglish = String(formData.get("editedPlainEnglish") ?? "") || undefined;
  const note = String(formData.get("note") ?? "") || undefined;
  if (!sourceId || !sectionRef || !["ACCEPTED", "EDITED", "REJECTED"].includes(decision)) {
    throw new Error("Invalid review decision payload");
  }
  await recordReviewerDecision({
    companyId,
    sourceId,
    sectionRef,
    category,
    decision,
    editedPlainEnglish,
    note,
    reviewerLabel: "workspace-counsel",
  });
  revalidatePath(`/${companyId}/rulebook`);
  revalidatePath(`/${companyId}/intelligence`);
  revalidatePath(`/${companyId}/covenants`);
  revalidatePath(`/${companyId}/alerts`);
}
