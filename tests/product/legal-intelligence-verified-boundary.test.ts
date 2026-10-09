/**
 * Legacy execution is never verified legal capability. Negative tests: missing IR verification,
 * missing ledger evidence, ambiguous governing provisions, unresolved cross-references, missing
 * financial inputs, wrong-entity scope. Fixture paths stay fixture paths; unseen companies take the
 * generalized fail-closed path without an issuer branch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyChallengeVerdict, challengeLegalConclusions, countSurvivingExecutable, countSurvivingLegacy } from "../../lib/product/legal-intelligence/challenge";
import type { LegalChallengeContext, LegalConclusion } from "../../lib/product/legal-intelligence/types";

const mocks = vi.hoisted(() => ({ snapshotCount: vi.fn(), ledgerCount: vi.fn(), dashboard: vi.fn() }));
vi.mock("../../lib/prisma", () => ({
  prisma: { financialSnapshot: { count: mocks.snapshotCount }, ledgerEntry: { count: mocks.ledgerCount }, $disconnect: vi.fn() },
}));
vi.mock("../../lib/dashboard-service", () => ({ getCompanyDashboard: mocks.dashboard }));

const fullEvidence: LegalChallengeContext = {
  hasApprovedFinancialSnapshot: true,
  hasUtilizationLedger: true,
  hasVerifiedIrPackage: true,
  outOfPackageAmendments: [],
  unresolvedDefinitionTerms: [],
  entityScopeUnresolved: false,
};
const legacy: LegalConclusion = { id: "legacy-1", kind: "CAPACITY_EXECUTED", statement: "engine says 100", executability: "LEGACY_ENGINE", evidenceCitations: ["seed"], missingInputs: [], limitations: [], promotedToLegalTruth: 0 };
const verified: LegalConclusion = { id: "ver-1", kind: "CAPACITY_EXECUTED", statement: "verified 100", executability: "EXECUTABLE_VERIFIED", evidenceCitations: ["ir"], missingInputs: [], limitations: [], promotedToLegalTruth: 0 };
const run = (conclusions: LegalConclusion[], context: LegalChallengeContext, companyId = "any-co") => {
  const challenges = challengeLegalConclusions({ companyId, conclusions, context });
  const { surviving } = applyChallengeVerdict(conclusions, challenges);
  return { challenges, surviving };
};

describe("legacy engine numbers are reported, never verified capability", () => {
  it("a LEGACY_ENGINE conclusion is blocked even with every other piece of evidence present", () => {
    const { challenges, surviving } = run([legacy], fullEvidence);
    expect(challenges.some((c) => c.category === "LEGACY_EXECUTION" && c.severity === "BLOCKER" && c.targetConclusionId === "legacy-1")).toBe(true);
    expect(surviving[0]).toMatchObject({ executability: "BLOCKED", promotedToLegalTruth: 0 });
    expect(countSurvivingExecutable(surviving)).toBe(0);
    expect(countSurvivingLegacy(surviving)).toBe(0);
  });
  it("counting helpers never count LEGACY_ENGINE as executable", () => {
    expect(countSurvivingExecutable([legacy, verified])).toBe(1);
    expect(countSurvivingLegacy([legacy, verified])).toBe(1);
  });
});

describe("required negative tests for a verified capacity claim", () => {
  it("missing IR verification blocks the whole package for any company, not only CONMED", () => {
    const { challenges, surviving } = run([verified], { ...fullEvidence, hasVerifiedIrPackage: false }, "unseen-issuer");
    expect(challenges.some((c) => c.category === "MISSING_IR" && c.targetConclusionId === null && c.statement.includes("unseen-issuer"))).toBe(true);
    expect(surviving[0]!.executability).toBe("BLOCKED");
  });
  it("missing ledger evidence blocks a capacity claim (missing utilization is not zero utilization)", () => {
    const { challenges, surviving } = run([verified], { ...fullEvidence, hasUtilizationLedger: false });
    expect(challenges.some((c) => c.category === "UTILIZATION_UNKNOWN" && c.severity === "BLOCKER" && c.invalidatesExecutability)).toBe(true);
    expect(surviving[0]!.executability).toBe("BLOCKED");
  });
  it("an ambiguous governing provision blocks execution", () => {
    const { challenges, surviving } = run([verified], { ...fullEvidence, ambiguousGoverningProvisions: ["§7.02(c): Seventh A&R vs Eighth A&R"] });
    expect(challenges.some((c) => c.category === "AMBIGUOUS_GOVERNING_PROVISION" && c.severity === "BLOCKER")).toBe(true);
    expect(surviving[0]!.executability).toBe("BLOCKED");
  });
  it("an unresolved cross-reference blocks execution", () => {
    const { challenges, surviving } = run([verified], { ...fullEvidence, unresolvedCrossReferences: ["Section 7.04 (not bound)"] });
    expect(challenges.some((c) => c.category === "UNRESOLVED_CROSS_REFERENCE" && c.severity === "BLOCKER")).toBe(true);
    expect(surviving[0]!.executability).toBe("BLOCKED");
  });
  it("missing financial inputs block execution", () => {
    const { surviving } = run([verified], { ...fullEvidence, hasApprovedFinancialSnapshot: false });
    expect(surviving[0]!.executability).toBe("BLOCKED");
  });
  it("wrong or unresolved entity scope blocks execution", () => {
    const { challenges, surviving } = run([verified], { ...fullEvidence, entityScopeUnresolved: true });
    expect(challenges.some((c) => c.category === "ENTITY_SCOPE" && c.invalidatesExecutability)).toBe(true);
    expect(surviving[0]!.executability).not.toBe("EXECUTABLE_VERIFIED");
  });
  it("with complete evidence a verified conclusion survives (the gate is not a constant refusal)", () => {
    const { surviving } = run([verified], fullEvidence);
    expect(surviving[0]!.executability).toBe("EXECUTABLE_VERIFIED");
    expect(countSurvivingExecutable(surviving)).toBe(1);
  });
});

describe("package paths: fixture paths isolated, unseen companies generalized and fail-closed", () => {
  beforeEach(() => {
    mocks.snapshotCount.mockReset().mockResolvedValue(1);
    mocks.ledgerCount.mockReset().mockResolvedValue(0);
    mocks.dashboard.mockReset().mockResolvedValue({ capacity: { secured: { remainingCapacity: 100 }, unsecured: { remainingCapacity: 50 } }, documents: [] });
  });
  it("the Coherent legacy path reports its two engine numbers as LEGACY and counts zero verified executable conclusions", async () => {
    const { runPackageLegalPath } = await import("../../lib/product/legal-intelligence/run-package-path");
    const r = await runPackageLegalPath("coherent");
    expect(r.executionBasis).toBe("FIXTURE_PATH");
    expect(r.survivingExecutableConclusions).toBe(0);
    expect(r.survivingLegacyConclusions).toBe(0);
    expect(r.conclusions.filter((c) => c.executability === "BLOCKED")).toHaveLength(2);
    expect(r.challenges.some((c) => c.category === "LEGACY_EXECUTION")).toBe(true);
    expect(r.challenges.some((c) => c.category === "UTILIZATION_UNKNOWN")).toBe(true);
    expect(mocks.ledgerCount).toHaveBeenCalledWith({ where: { companyId: "coherent", status: "ACTIVE" } });
  });
  it("ledger availability comes from ACTIVE ledger rows, not a constant", async () => {
    mocks.ledgerCount.mockResolvedValue(3);
    const { runPackageLegalPath } = await import("../../lib/product/legal-intelligence/run-package-path");
    const r = await runPackageLegalPath("coherent");
    expect(r.challenges.some((c) => c.category === "UTILIZATION_UNKNOWN")).toBe(false);
    expect(r.survivingExecutableConclusions).toBe(0);
  });
  it("an unseen company takes the generalized fail-closed path: no throw, no issuer branch, no capacity", async () => {
    const { runPackageLegalPath, isFixtureLegalPath } = await import("../../lib/product/legal-intelligence/run-package-path");
    expect(isFixtureLegalPath("acme-unseen")).toBe(false);
    const r = await runPackageLegalPath("acme-unseen");
    expect(r.executionBasis).toBe("GENERALIZED_FAIL_CLOSED");
    expect(r.survivingExecutableConclusions).toBe(0);
    expect(r.metrics.capacityExecuted).toBe(0);
    expect(r.blockedReasons.some((b) => b.includes("acme-unseen"))).toBe(true);
    expect(r.conclusions.every((c) => c.promotedToLegalTruth === 0)).toBe(true);
  });
  it("the CONMED fixture path still yields zero surviving executable conclusions", async () => {
    mocks.snapshotCount.mockResolvedValue(0);
    const { runPackageLegalPath } = await import("../../lib/product/legal-intelligence/run-package-path");
    const r = await runPackageLegalPath("conmed-demo");
    expect(r.executionBasis).toBe("FIXTURE_PATH");
    expect(r.survivingExecutableConclusions).toBe(0);
    expect(r.survivingLegacyConclusions).toBe(0);
  });
});
