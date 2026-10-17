/**
 * Auto-accept must treat non-throwing compiler failures and
 * INCOMPLETE results as unresolved, not successful automatic
 * compilation. A routine item whose compile returns INCOMPLETE
 * (classification and compile disagree, or a transient fault)
 * keeps no approval row — it stays an exception for counsel.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const stored = { metadata: null as unknown };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeSource: {
      findFirst: async () => ({ metadata: stored.metadata }),
      update: async ({ data }: { data: { metadata: unknown } }) => {
        stored.metadata = data.metadata;
        return {};
      },
    },
  },
}));
const compileMock = vi.fn();
vi.mock("../../lib/product/customer-intelligence/compile-accepted", () => ({
  compileAcceptedInterpretation: (...args: unknown[]) => compileMock(...args),
}));

import { autoAcceptRoutineInterpretations } from "../../lib/product/customer-intelligence/reviewer-approvals";

function routineGrantItem() {
  return {
    heading: "6.01(a)",
    sectionRef: "6.01(a)",
    category: "INDEBTEDNESS",
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $50,000,000.",
    restriction: null,
    permissions: [],
    coveredEntities: [],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: ["Amount/threshold: $50,000,000"],
    draftingPatterns: [],
    operativeLanguageExcerpt: "The Borrower may incur Indebtedness not to exceed $50,000,000.",
    sourceCitation: "test",
    governingAgreement: "test",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {},
  };
}

beforeEach(() => {
  compileMock.mockReset();
  stored.metadata = { covenantSummary: { items: [routineGrantItem()], sourceId: "src-1" } };
});

describe("autoAcceptRoutineInterpretations compile verification", () => {
  it("a COMPILED result keeps the SYSTEM approval", async () => {
    compileMock.mockResolvedValue([{ status: "COMPILED", missingFields: [] }]);
    const res = await autoAcceptRoutineInterpretations({ companyId: "co-1", sourceId: "src-1" });
    expect(res).toEqual({ accepted: 1, skipped: 0 });
    const approvals = (stored.metadata as { reviewerApprovals: unknown[] }).reviewerApprovals;
    expect(approvals).toHaveLength(1);
  });

  it("a non-throwing INCOMPLETE result removes the approval and counts the item unresolved", async () => {
    compileMock.mockResolvedValue([{ status: "INCOMPLETE", missingFields: ["thresholdValue"] }]);
    const res = await autoAcceptRoutineInterpretations({ companyId: "co-1", sourceId: "src-1" });
    expect(res).toEqual({ accepted: 0, skipped: 1 });
    const approvals = (stored.metadata as { reviewerApprovals: unknown[] }).reviewerApprovals;
    expect(approvals).toHaveLength(0);
  });

  it("a thrown compile error also removes the approval", async () => {
    compileMock.mockRejectedValue(new Error("db down"));
    const res = await autoAcceptRoutineInterpretations({ companyId: "co-1", sourceId: "src-1" });
    expect(res).toEqual({ accepted: 0, skipped: 1 });
    const approvals = (stored.metadata as { reviewerApprovals: unknown[] }).reviewerApprovals;
    expect(approvals).toHaveLength(0);
  });
});
