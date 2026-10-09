import { describe, expect, it } from "vitest";
import { nextSetupStep, type CompanySetupStatus } from "../../lib/onboarding/setup-status";

function base(over: Partial<CompanySetupStatus> = {}): CompanySetupStatus {
  return {
    companyId: "acme",
    companyName: "Acme",
    onboardingStatus: "ONBOARDING",
    documentsUploaded: 0,
    extractedDocuments: 0,
    analysisReady: false,
    analysisReason: "NEVER_ANALYZED",
    pendingReview: 0,
    readyToPromote: 0,
    promoted: 0,
    financialSnapshots: 0,
    ns4ApprovedSnapshots: 0,
    phase3TrustedUnitCount: 0,
    phase3TrustedRuleCount: 0,
    permissions: 0,
    unverifiedPermissions: 0,
    dashboardReady: false,
    capacityCertified: false,
    ...over,
  };
}

describe("nextSetupStep", () => {
  it("starts at upload, then read (until analysis ready), review, financials, activate", () => {
    expect(nextSetupStep(base()).label).toBe("Upload documents");
    expect(nextSetupStep(base({ documentsUploaded: 1 })).label).toBe("Read documents");
    expect(nextSetupStep(base({ documentsUploaded: 1, extractedDocuments: 1, analysisReady: false })).label).toBe(
      "Read documents",
    );
    expect(
      nextSetupStep(
        base({ documentsUploaded: 1, extractedDocuments: 1, analysisReady: true, analysisReason: "READY", pendingReview: 4 }),
      ).label,
    ).toBe("Review findings");
    expect(
      nextSetupStep(
        base({
          documentsUploaded: 1,
          extractedDocuments: 1,
          analysisReady: true,
          analysisReason: "READY",
          pendingReview: 0,
          readyToPromote: 3,
          financialSnapshots: 0,
        }),
      ).label,
    ).toBe("Confirm financials");
    expect(
      nextSetupStep(
        base({
          documentsUploaded: 1,
          extractedDocuments: 1,
          analysisReady: true,
          analysisReason: "READY",
          pendingReview: 0,
          readyToPromote: 0,
          promoted: 3,
          financialSnapshots: 1,
        }),
      ).label,
    ).toBe("Activate workspace");
    const open = nextSetupStep(
      base({
        onboardingStatus: "ACTIVE",
        documentsUploaded: 1,
        extractedDocuments: 1,
        analysisReady: true,
        analysisReason: "READY",
        financialSnapshots: 1,
        promoted: 3,
        permissions: 2,
        unverifiedPermissions: 2,
        ns4ApprovedSnapshots: 1,
        phase3TrustedUnitCount: 3,
        phase3TrustedRuleCount: 2,
        dashboardReady: true,
      }),
    );
    expect(open.label).toBe("Open dashboard");
    expect(open.detail).toMatch(/not Phase 4E-certified/i);
    expect(open.detail).toMatch(/Phase 3 VERIFIED semantic units: 3/);
    expect(open.detail).toMatch(/UNVERIFIED Permission/);
  });

  it("never claims capacityCertified", () => {
    expect(base().capacityCertified).toBe(false);
  });
});
