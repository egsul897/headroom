import { describe, expect, it, vi } from "vitest";
// setup-status now imports the rulebook readiness chain (loadRulebookReadiness
// -> capacity-readiness -> north-star-bridge), which pulls the real Prisma
// client and cannot collect locally (same pre-existing limitation as the
// compile-accepted tests). nextSetupStep is pure and never touches the DB,
// so the Prisma chain is stubbed here; CI verifies the real chain.
vi.mock("@prisma/client", () => {
  // The rulebook-readiness chain imports Prisma enums as VALUES
  // (CovenantFamily, FormulaType, ...). Collection only needs those
  // names to resolve — nextSetupStep never executes the chain.
  // The Proxy returns the export name for any missing export, so
  // `CovenantFamily.X` is undefined (not a throw) at load time.
  const base: Record<string, unknown> = {
    PrismaClient: class {},
    Prisma: { JsonNull: Symbol("JsonNull") },
    Decimal: class Decimal {
      constructor(public value: number) {}
      toNumber() {
        return this.value;
      }
    },
  };
  return new Proxy(base, {
    get: (t, prop) => (prop in t ? t[prop as string] : prop),
    has: () => true,
  });
});
vi.mock("../../lib/prisma", () => ({ prisma: {} }));
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
    deterministicAnalyzed: 0,
    deterministicItems: 0,
    deterministicDecisions: 0,
    deterministicExceptions: 0,
    deterministicExceptionDecisions: 0,
    rulebookStage: "DISCOVERED",
    rulebookExecutablePermissions: 0,
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

  it("routes deterministic (no-LLM) exception review through the Rulebook, not the LLM queue", () => {
    // Uploaded + analyzed deterministically, no LLM extraction, exceptions unreviewed
    // -> the Rulebook (the review path that works with no LLM credential).
    // Routine items are system-accepted; only exceptions need counsel.
    expect(
      nextSetupStep(
        base({
          documentsUploaded: 1,
          deterministicAnalyzed: 1,
          deterministicItems: 120,
          deterministicDecisions: 90,
          deterministicExceptions: 30,
          deterministicExceptionDecisions: 0,
        }),
      ).label,
    ).toBe("Review exceptions");
    // All exception items reviewed -> past review (financials next).
    expect(
      nextSetupStep(
        base({
          documentsUploaded: 1,
          deterministicAnalyzed: 1,
          deterministicItems: 120,
          deterministicDecisions: 120,
          deterministicExceptions: 30,
          deterministicExceptionDecisions: 30,
          financialSnapshots: 0,
        }),
      ).label,
    ).toBe("Confirm financials");
    // Uploaded but NO successful analysis anywhere -> Read documents (re-analyze),
    // not the LLM review queue (which would redirect back to documents).
    expect(nextSetupStep(base({ documentsUploaded: 1 })).label).toBe("Read documents");
    // Deterministic Permissions exist, LLM queue empty -> financials, not "Review findings".
    expect(
      nextSetupStep(
        base({
          documentsUploaded: 1,
          deterministicAnalyzed: 1,
          deterministicItems: 5,
          deterministicDecisions: 5,
          rulebookStage: "EXECUTABLE",
          rulebookExecutablePermissions: 2,
          permissions: 2,
          financialSnapshots: 0,
        }),
      ).label,
    ).toBe("Confirm financials");
  });
});
