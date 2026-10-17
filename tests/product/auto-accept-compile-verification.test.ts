/**
 * Auto-accept must treat non-throwing compiler failures and
 * INCOMPLETE results as unresolved, not successful automatic
 * compilation. A routine item whose compile returns INCOMPLETE
 * (classification and compile disagree, or a transient fault)
 * keeps no approval row — it stays an exception for counsel.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const stored = { metadata: null as unknown };
/** Per-document metadata for sweep tests, keyed by sourceId. */
const docsBySource = new Map<string, unknown>();
/** When set, called with the 1-based update call number; may throw to simulate a persistence failure. */
let updateHook: ((call: number) => void) | null = null;
let updateCalls = 0;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeSource: {
      findFirst: async ({ where }: { where?: { sourceId?: string } }) => {
        const sid = where?.sourceId;
        if (sid && docsBySource.has(sid)) return { metadata: docsBySource.get(sid) };
        return { metadata: stored.metadata };
      },
      findMany: async () =>
        [...docsBySource.entries()].map(([sourceId, metadata]) => ({ sourceId, metadata })),
      update: async ({ where, data }: { where?: { sourceId?: string }; data: { metadata: unknown } }) => {
        updateCalls += 1;
        if (updateHook) updateHook(updateCalls);
        const sid = where?.sourceId;
        if (sid && docsBySource.has(sid)) docsBySource.set(sid, data.metadata);
        else stored.metadata = data.metadata;
        return {};
      },
    },
  },
}));
const compileMock = vi.fn();
vi.mock("../../lib/product/customer-intelligence/compile-accepted", () => ({
  compileAcceptedInterpretation: (...args: unknown[]) => compileMock(...args),
}));

import {
  autoAcceptRoutineInterpretations,
  sweepAutoAcceptForWorkspace,
} from "../../lib/product/customer-intelligence/reviewer-approvals";

function routineGrantItem() {
  return {
    heading: "6.01(a)",
    sectionRef: "6.01(a)",
    category: "DEBT_INCURRENCE",
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
  docsBySource.clear();
  updateHook = null;
  updateCalls = 0;
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

describe("P0 recording integrity: per-item persistence isolation", () => {
  function twoRoutineItems() {
    const a = routineGrantItem();
    const b = {
      ...routineGrantItem(),
      heading: "6.01(b)",
      sectionRef: "6.01(b)",
      plainEnglish: "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $25,000,000.",
      materialBasketsThresholds: ["Amount/threshold: $25,000,000"],
      operativeLanguageExcerpt: "The Borrower may incur Indebtedness not to exceed $25,000,000.",
    };
    return [a, b];
  }

  it("a persistence throw at item k does not block item k+1", async () => {
    stored.metadata = { covenantSummary: { items: twoRoutineItems(), sourceId: "src-1" } };
    compileMock.mockResolvedValue([{ status: "COMPILED", missingFields: [] }]);
    // The FIRST update call is item 1's pre-compile persist. Before
    // P0 it sat outside the per-item try/catch, so this throw
    // aborted the whole loop and item 2 was never attempted.
    updateHook = (call) => {
      if (call === 1) throw new Error("transient persistence failure");
    };
    const res = await autoAcceptRoutineInterpretations({ companyId: "co-1", sourceId: "src-1" });
    expect(res).toEqual({ accepted: 1, skipped: 1 });
    const approvals = (stored.metadata as { reviewerApprovals: { sectionRef: string }[] }).reviewerApprovals;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.sectionRef).toBe("6.01(b)");
  });
});

describe("P0 convergence sweep", () => {
  it("a second sweep over a fully decided document adds zero rows", async () => {
    docsBySource.set("src-1", { covenantSummary: { items: [routineGrantItem()], sourceId: "src-1" } });
    docsBySource.set("src-raw", { metadataOnly: true }); // not analyzed — skipped
    compileMock.mockResolvedValue([{ status: "COMPILED", missingFields: [] }]);
    const first = await sweepAutoAcceptForWorkspace({ companyId: "co-1" });
    expect(first.documents).toBe(1);
    expect(first.accepted).toBe(1);
    const second = await sweepAutoAcceptForWorkspace({ companyId: "co-1" });
    expect(second.accepted).toBe(0);
    const approvals = (docsBySource.get("src-1") as { reviewerApprovals: unknown[] }).reviewerApprovals;
    expect(approvals).toHaveLength(1);
  });

  it("an orphaned-nodeId SYSTEM row is replaced, not duplicated", async () => {
    const itemWithNode = { ...routineGrantItem(), nodeId: "node-new" };
    docsBySource.set("src-1", {
      covenantSummary: { items: [itemWithNode], sourceId: "src-1" },
      reviewerApprovals: [
        {
          sourceId: "src-1",
          sectionRef: "6.01(a)",
          category: "DEBT_INCURRENCE",
          nodeId: "node-old",
          decision: "ACCEPTED",
          reviewerKind: "SYSTEM",
          reviewedAt: "2026-10-16T00:00:00.000Z",
          reviewerLabel: "system:auto-accept",
          version: 3,
        },
      ],
    });
    compileMock.mockResolvedValue([{ status: "COMPILED", missingFields: [] }]);
    const res = await autoAcceptRoutineInterpretations({ companyId: "co-1", sourceId: "src-1" });
    expect(res.accepted).toBe(1);
    const approvals = (docsBySource.get("src-1") as { reviewerApprovals: { nodeId?: string; version: number }[] })
      .reviewerApprovals;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.nodeId).toBe("node-new");
    expect(approvals[0]!.version).toBe(4);
  });

  it("an ambiguous orphan (two occurrences share ref+category) is NOT re-matched by the loose key", async () => {
    const base = routineGrantItem() as Record<string, unknown>;
    const occ1 = { ...base, nodeId: "n1" };
    const occ2 = { ...base, nodeId: "n2" };
    docsBySource.set("src-1", {
      covenantSummary: { items: [occ1, occ2], sourceId: "src-1" },
      reviewerApprovals: [
        {
          sourceId: "src-1",
          sectionRef: "6.01(a)",
          category: "DEBT_INCURRENCE",
          nodeId: "node-old",
          decision: "ACCEPTED",
          reviewerKind: "SYSTEM",
          reviewedAt: "2026-10-16T00:00:00.000Z",
          reviewerLabel: "system:auto-accept",
          version: 1,
        },
      ],
    });
    compileMock.mockResolvedValue([{ status: "COMPILED", missingFields: [] }]);
    const res = await autoAcceptRoutineInterpretations({ companyId: "co-1", sourceId: "src-1" });
    expect(res.accepted).toBe(2);
    const approvals = (docsBySource.get("src-1") as { reviewerApprovals: { nodeId?: string }[] }).reviewerApprovals;
    // Orphan left as history; each occurrence holds its own row.
    expect(approvals).toHaveLength(3);
    expect(approvals.map((a) => a.nodeId).sort()).toEqual(["n1", "n2", "node-old"]);
  });
});
