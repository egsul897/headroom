"use server";
import { requireTenantAction } from "@/lib/auth/guard";
import { shouldFallbackAfterFceRefusal } from "@/lib/product/north-star-workflow/approve-fallback-guard";

import { revalidatePath } from "next/cache";
import {
  approveWorkspaceCertificate,
  appendContractLedgerUsage,
  proposeCertificateRestatement,
  proposeCertificateTextForCompany,
  approveFceProposedCertificate,
} from "@/lib/product/north-star-workflow";

function revalidateCertificateSurfaces(companyId: string) {
  revalidatePath(`/${companyId}/certificates`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/ask`);
  revalidatePath(`/${companyId}/dashboard`);
  revalidatePath(`/${companyId}/intelligence`);
}

/** Propose NS-4 DRAFT from pasted / uploaded certificate (+ optional statement) text via FCE. */
export async function proposeUploadedCertificateTextAction(
  companyId: string,
  form: { certificateText: string; statementText?: string },
) {
  await requireTenantAction(companyId);
  const result = await proposeCertificateTextForCompany({
    companyId,
    certificateText: form.certificateText,
    statementText: form.statementText,
  });
  revalidateCertificateSurfaces(companyId);
  return result;
}

export async function approveCertificateAction(
  companyId: string,
  snapshotId: string,
  reviewedBy: string,
  approvalRef: string,
) {
  await requireTenantAction(companyId);
  const reviewer = reviewedBy.trim();
  if (!reviewer) {
    return {
      ok: false as const,
      snapshotId,
      status: "REJECTED",
      issues: ["reviewedBy is required — never auto-approve"],
    };
  }

  // Prefer FCE attributable path (refuses BLOCKED reconciliation when
  // the caller supplies one); fall back to workspace approve for
  // synthetic seeds / already-approved idempotency. Rule 82: a
  // safety refusal (BLOCKED) must never fall through to the
  // workspace path, which has no reconciliation check.
  const fce = await approveFceProposedCertificate({
    companyId,
    snapshotId,
    reviewedBy: reviewer,
    approvalRef: approvalRef.trim() || `apr-${snapshotId}`,
  });
  if (fce.ok) {
    revalidateCertificateSurfaces(companyId);
    return fce;
  }
  if (!shouldFallbackAfterFceRefusal(fce.issues)) {
    return {
      ok: false as const,
      snapshotId,
      status: "REJECTED",
      issues: fce.issues,
    };
  }

  const result = await approveWorkspaceCertificate({
    companyId,
    snapshotId,
    reviewedBy: reviewer,
    approvalRef: approvalRef.trim() || `apr-${snapshotId}`,
  });
  revalidateCertificateSurfaces(companyId);
  return result;
}

export async function appendHistoricalUsageAction(
  companyId: string,
  form: {
    usageId: string;
    amount: string;
    currency: string;
    ruleId: string;
    effectiveAsOf: string;
    instrumentKey: string;
  },
) {
  await requireTenantAction(companyId);
  // Rule 106: never default a missing instrument key to a
  // fabricated generic ("company") or accept a missing date —
  // a manual ledger entry must carry the user's real values.
  const missing = [
    !form.usageId && "usageId",
    !form.amount && "amount",
    !form.ruleId && "ruleId",
    !form.effectiveAsOf && "effectiveAsOf",
    !form.instrumentKey && "instrumentKey",
  ].filter(Boolean);
  if (missing.length > 0) {
    return { ok: false, issues: [`Manual ledger entry refused — missing: ${missing.join(", ")}`] };
  }
  const result = await appendContractLedgerUsage({
    companyId,
    usageId: form.usageId,
    instrumentKey: form.instrumentKey,
    effectiveAsOf: form.effectiveAsOf,
    amount: form.amount,
    currency: form.currency || "USD",
    ruleId: form.ruleId,
    transactionRef: form.usageId,
    approvalRef: `manual-${form.usageId}`,
  });
  revalidatePath(`/${companyId}/certificates`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/ledger`);
  return result;
}

export async function restateCertificateAction(companyId: string, predecessorSnapshotId: string) {
  await requireTenantAction(companyId);
  const result = await proposeCertificateRestatement({
    companyId,
    predecessorSnapshotId,
    reviewedByNote: "workspace restatement",
  });
  revalidatePath(`/${companyId}/certificates`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/ask`);
  return result;
}
