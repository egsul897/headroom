import { describe, expect, it, vi, beforeEach } from "vitest";
import { challengeLegalConclusions, applyChallengeVerdict } from "../../lib/product/legal-intelligence/challenge";
import type { LegalConclusion } from "../../lib/product/legal-intelligence/types";

const mocks = vi.hoisted(() => ({
  financialSnapshotCount: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    financialSnapshot: { count: mocks.financialSnapshotCount },
    $disconnect: vi.fn(),
  },
}));

describe("challenge stage", () => {
  it("blocks fabricated EXECUTABLE_VERIFIED without IR package", () => {
    const conclusions: LegalConclusion[] = [
      {
        id: "bad",
        kind: "CAPACITY_EXECUTED",
        statement: "fake capacity",
        executability: "EXECUTABLE_VERIFIED",
        evidenceCitations: [],
        missingInputs: [],
        limitations: [],
        promotedToLegalTruth: 1,
      },
    ];
    const challenges = challengeLegalConclusions({
      companyId: "conmed-demo",
      conclusions,
      context: {
        hasApprovedFinancialSnapshot: false,
        hasUtilizationLedger: false,
        hasVerifiedIrPackage: false,
        outOfPackageAmendments: ["Doc C out of package"],
        unresolvedDefinitionTerms: ["Consolidated EBITDA"],
        entityScopeUnresolved: true,
      },
    });
    expect(challenges.some((c) => c.category === "MISSING_IR")).toBe(true);
    expect(challenges.some((c) => c.category === "AMENDMENT_OUT_OF_PACKAGE")).toBe(true);
    const { surviving, blockedIds } = applyChallengeVerdict(conclusions, challenges);
    expect(blockedIds).toContain("bad");
    expect(surviving[0]!.executability).toBe("BLOCKED");
    expect(surviving[0]!.promotedToLegalTruth).toBe(0);
  });

  it("does not invent capacity for structure-only conclusions", () => {
    const conclusions: LegalConclusion[] = [
      {
        id: "struct",
        kind: "STRUCTURE_SOURCE_BACKED",
        statement: "§7.2 Lien basket structure",
        executability: "NOT_EXECUTABLE",
        evidenceCitations: ["doc-a"],
        missingInputs: ["definition:Consolidated Total Assets"],
        limitations: ["NEEDS_FINANCIAL_INPUTS"],
        promotedToLegalTruth: 0,
      },
    ];
    const challenges = challengeLegalConclusions({
      companyId: "conmed-demo",
      conclusions,
      context: {
        hasApprovedFinancialSnapshot: false,
        hasUtilizationLedger: false,
        hasVerifiedIrPackage: false,
        outOfPackageAmendments: [],
        unresolvedDefinitionTerms: ["Consolidated Total Assets"],
        entityScopeUnresolved: false,
      },
    });
    const { surviving } = applyChallengeVerdict(conclusions, challenges);
    expect(surviving[0]!.kind).toBe("STRUCTURE_SOURCE_BACKED");
    expect(surviving[0]!.promotedToLegalTruth).toBe(0);
  });
});

describe("CONMED legal path", () => {
  beforeEach(() => {
    mocks.financialSnapshotCount.mockResolvedValue(0);
  });

  it("runs fail-closed with zero surviving executable conclusions", async () => {
    const { runPackageLegalPath } = await import(
      "../../lib/product/legal-intelligence/run-package-path"
    );
    const result = await runPackageLegalPath("conmed-demo");
    expect(result.survivingExecutableConclusions).toBe(0);
    expect(result.metrics.covenantRowsExamined).toBeGreaterThan(0);
    expect(result.challenges.some((c) => c.severity === "BLOCKER")).toBe(true);
    expect(result.conclusions.every((c) => c.promotedToLegalTruth === 0)).toBe(true);
  });
});
