"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import {
  approveWorkspaceCertificate,
  appendContractLedgerUsage,
  proposeSyntheticCertificateForCompany,
  proposeCertificateRestatement,
  proposeAuthenticCertificateFixtureForCompany,
  proposeCertificateTextForCompany,
  approveFceProposedCertificate,
  type CertificateFixtureIssuer,
} from "@/lib/product/north-star-workflow";

function revalidateCertificateSurfaces(companyId: string) {
  revalidatePath(`/${companyId}/certificates`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/ask`);
  revalidatePath(`/${companyId}/dashboard`);
  revalidatePath(`/${companyId}/intelligence`);
}

export async function seedSyntheticCertificateAction(companyId: string) {
  await requireTenantAction(companyId);
  const result = await proposeSyntheticCertificateForCompany(companyId);
  revalidateCertificateSurfaces(companyId);
  return result;
}

/** Propose NS-4 DRAFT from committed Matthews / Coherent certificate fixtures via FCE. Never APPROVED. */
export async function seedAuthenticCertificateFixtureAction(
  companyId: string,
  issuer: CertificateFixtureIssuer,
) {
  await requireTenantAction(companyId);
  const result = await proposeAuthenticCertificateFixtureForCompany(companyId, issuer);
  revalidateCertificateSurfaces(companyId);
  return result;
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

  // Prefer FCE attributable path (refuses BLOCKED); fall back to workspace approve for synthetic seeds.
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
  const result = await appendContractLedgerUsage({
    companyId,
    usageId: form.usageId,
    instrumentKey: form.instrumentKey || "company",
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
