/**
 * Customer setup progress — what is still required before the dashboard can
 * show engine-backed figures. Read-only; never invents numbers.
 */

import { prisma } from "@/lib/prisma";
import { getReviewProgress } from "@/lib/onboarding/review";
import type { OnboardingStatus } from "@prisma/client";

export interface CompanySetupStatus {
  companyId: string;
  companyName: string;
  onboardingStatus: OnboardingStatus;
  documentsUploaded: number;
  extractedDocuments: number;
  pendingReview: number;
  readyToPromote: number;
  promoted: number;
  financialSnapshots: number;
  permissions: number;
  dashboardReady: boolean;
}

export async function getCompanySetupStatus(companyId: string): Promise<CompanySetupStatus | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const [documentsUploaded, extractedDocuments, progress, financialSnapshots, permissions] = await Promise.all([
    prisma.document.count({ where: { companyId } }),
    prisma.extractionRun.count({ where: { companyId } }),
    getReviewProgress(companyId),
    prisma.financialState.count({ where: { companyId } }),
    prisma.permission.count({ where: { companyId } }),
  ]);

  const dashboardReady =
    (company.onboardingStatus === "ACTIVE" || company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS") &&
    financialSnapshots > 0 &&
    (permissions > 0 || extractedDocuments > 0);

  return {
    companyId,
    companyName: company.name,
    onboardingStatus: company.onboardingStatus,
    documentsUploaded,
    extractedDocuments,
    pendingReview: progress.pending + progress.reviewRequired,
    readyToPromote: progress.approved + progress.edited,
    promoted: progress.promoted,
    financialSnapshots,
    permissions,
    dashboardReady,
  };
}

export function nextSetupStep(status: CompanySetupStatus): {
  href: string;
  label: string;
  detail: string;
} {
  const id = status.companyId;
  if (status.documentsUploaded === 0) {
    return {
      href: `/${id}/onboarding/documents`,
      label: "Upload documents",
      detail: "Add the credit agreement, indenture, and latest compliance certificate or financials.",
    };
  }
  if (status.extractedDocuments === 0) {
    return {
      href: `/${id}/onboarding/documents`,
      label: "Read documents",
      detail: "Run analysis so Headroom can extract covenants and proposed financial figures.",
    };
  }
  if (status.pendingReview > 0 || (status.readyToPromote === 0 && status.promoted === 0)) {
    return {
      href: `/${id}/onboarding/review`,
      label: "Review findings",
      detail: "Approve, edit, or reject what the software extracted. Nothing becomes operative until you do.",
    };
  }
  if (status.financialSnapshots === 0) {
    return {
      href: `/${id}/onboarding/financials`,
      label: "Confirm financials",
      detail: "Promote approved facts or enter the reporting-period figures the covenants need.",
    };
  }
  if (status.onboardingStatus === "ONBOARDING") {
    return {
      href: `/${id}/onboarding/activate`,
      label: "Activate workspace",
      detail: "Promote approved candidates so the dashboard can compute headroom from this company’s documents.",
    };
  }
  return {
    href: `/${id}`,
    label: "Open dashboard",
    detail: "Figures below come from the uploaded documents and approved financials.",
  };
}
