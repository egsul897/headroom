"use server";

import { revalidatePath } from "next/cache";
import {
  approveWorkspaceCertificate,
  appendContractLedgerUsage,
  proposeSyntheticCertificateForCompany,
} from "@/lib/product/north-star-workflow";

export async function seedSyntheticCertificateAction(companyId: string) {
  const result = await proposeSyntheticCertificateForCompany(companyId);
  revalidatePath(`/${companyId}/certificates`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/ask`);
  return result;
}

export async function approveCertificateAction(
  companyId: string,
  snapshotId: string,
  reviewedBy: string,
  approvalRef: string,
) {
  const result = await approveWorkspaceCertificate({
    companyId,
    snapshotId,
    reviewedBy: reviewedBy.trim() || "workspace-user",
    approvalRef: approvalRef.trim() || `apr-${snapshotId}`,
  });
  revalidatePath(`/${companyId}/certificates`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/ask`);
  revalidatePath(`/${companyId}/intelligence`);
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
