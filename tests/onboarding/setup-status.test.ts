import { describe, expect, it } from "vitest";
import { nextSetupStep, type CompanySetupStatus } from "../../lib/onboarding/setup-status";

function base(over: Partial<CompanySetupStatus> = {}): CompanySetupStatus {
  return {
    companyId: "acme",
    companyName: "Acme",
    onboardingStatus: "ONBOARDING",
    documentsUploaded: 0,
    extractedDocuments: 0,
    pendingReview: 0,
    readyToPromote: 0,
    promoted: 0,
    financialSnapshots: 0,
    permissions: 0,
    dashboardReady: false,
    ...over,
  };
}

describe("nextSetupStep", () => {
  it("starts at upload, then read, review, financials, activate", () => {
    expect(nextSetupStep(base()).label).toBe("Upload documents");
    expect(nextSetupStep(base({ documentsUploaded: 1 })).label).toBe("Read documents");
    expect(nextSetupStep(base({ documentsUploaded: 1, extractedDocuments: 1, pendingReview: 4 })).label).toBe("Review findings");
    expect(
      nextSetupStep(
        base({ documentsUploaded: 1, extractedDocuments: 1, pendingReview: 0, readyToPromote: 3, financialSnapshots: 0 }),
      ).label,
    ).toBe("Confirm financials");
    expect(
      nextSetupStep(
        base({
          documentsUploaded: 1,
          extractedDocuments: 1,
          pendingReview: 0,
          readyToPromote: 0,
          promoted: 3,
          financialSnapshots: 1,
        }),
      ).label,
    ).toBe("Activate workspace");
    expect(
      nextSetupStep(
        base({
          onboardingStatus: "ACTIVE",
          documentsUploaded: 1,
          extractedDocuments: 1,
          financialSnapshots: 1,
          promoted: 3,
          dashboardReady: true,
        }),
      ).label,
    ).toBe("Open dashboard");
  });
});
