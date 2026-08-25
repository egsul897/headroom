"use server";

import { revalidatePath } from "next/cache";
import { reviewCandidate } from "@/lib/onboarding/review";

function readReviewedBy(formData: FormData): string {
  const value = String(formData.get("reviewedBy") ?? "").trim();
  if (!value) throw new Error("A reviewer name/email is required.");
  return value;
}

export async function approveCandidateAction(companyId: string, candidateId: string, formData: FormData) {
  await reviewCandidate({ candidateId, action: "APPROVE", reviewedBy: readReviewedBy(formData), note: String(formData.get("note") ?? "") || undefined });
  revalidatePath(`/${companyId}/onboarding/review`);
}

export async function rejectCandidateAction(companyId: string, candidateId: string, formData: FormData) {
  await reviewCandidate({ candidateId, action: "REJECT", reviewedBy: readReviewedBy(formData), note: String(formData.get("note") ?? "") || undefined });
  revalidatePath(`/${companyId}/onboarding/review`);
}

export async function markReviewRequiredAction(companyId: string, candidateId: string, formData: FormData) {
  await reviewCandidate({ candidateId, action: "REVIEW_REQUIRED", reviewedBy: readReviewedBy(formData), note: String(formData.get("note") ?? "") || undefined });
  revalidatePath(`/${companyId}/onboarding/review`);
}

/**
 * EDIT accepts the corrected value as raw JSON (a textarea pre-filled with
 * the candidate's own current proposedValue) - a single generic editor
 * across all 8 candidate kinds rather than eight bespoke forms, validated
 * server-side against the SAME per-kind zod schema promotion itself reads
 * (lib/onboarding/review.ts's VALUE_SCHEMA_BY_KIND) - an invalid edit is
 * rejected with a clear error, never silently coerced.
 */
export async function editCandidateAction(companyId: string, candidateId: string, formData: FormData) {
  const raw = String(formData.get("editedValueJson") ?? "");
  let editedValue: unknown;
  try {
    editedValue = JSON.parse(raw);
  } catch {
    throw new Error("Edited value must be valid JSON.");
  }
  await reviewCandidate({ candidateId, action: "EDIT", editedValue, reviewedBy: readReviewedBy(formData), note: String(formData.get("note") ?? "") || undefined });
  revalidatePath(`/${companyId}/onboarding/review`);
}
