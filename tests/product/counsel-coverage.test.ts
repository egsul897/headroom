/**
 * Rule 171: counsel-review completion creates SolverCoverageDeclarations,
 * so counsel-compiled Permissions stop falling back to LEGACY.
 */
import { describe, expect, it } from "vitest";
import { evaluateCounselCoverage, type CounselCoverageDb } from "../../lib/product/customer-intelligence/counsel-coverage";
import { determineCoverage } from "../../lib/solver/coverage";

function fakeDb(opts: {
  items: string[];
  decided: string[];
  modeledGrants: string[];
}): { db: CounselCoverageDb; upserts: { side: string; grantType: string; isComplete: boolean; notes: string }[] } {
  const upserts: { side: string; grantType: string; isComplete: boolean; notes: string }[] = [];
  const db: CounselCoverageDb = {
    knowledgeSource: {
      findUnique: async () => ({
        documentId: "doc-1",
        metadata: {
          covenantSummary: { items: opts.items.map((sectionRef) => ({ sectionRef })) },
          reviewerApprovals: opts.decided.map((sectionRef) => ({ sectionRef, decision: "ACCEPTED" })),
        },
      }),
    },
    permission: {
      findMany: async () => opts.modeledGrants.map((grantType) => ({ grantType })),
    },
    solverCoverageDeclaration: {
      upsert: async (args: { create: { side: string; grantType: string; isComplete: boolean; notes: string } }) => {
        upserts.push({ side: args.create.side, grantType: args.create.grantType, isComplete: args.create.isComplete, notes: args.create.notes });
        return {};
      },
    },
  };
  return { db, upserts };
}

describe("rule 171: counsel coverage", () => {
  it("all items decided + MODELED permissions -> complete declarations", async () => {
    const { db, upserts } = fakeDb({ items: ["6.01(e)", "6.01(j)"], decided: ["6.01(e)", "6.01(j)"], modeledGrants: ["DEBT_INCURRENCE", "LIEN"] });
    const res = await evaluateCounselCoverage(db, { companyId: "co-1", sourceId: "src-1" });
    expect(res.reviewComplete).toBe(true);
    expect(res.scopes).toHaveLength(2);
    // DEBT: secured + unsecured; LIEN: secured only.
    expect(upserts).toHaveLength(3);
    expect(upserts.every((u) => u.isComplete)).toBe(true);
    expect(upserts.filter((u) => u.grantType === "LIEN").map((u) => u.side)).toEqual(["secured"]);
  });

  it("one item undecided -> incomplete declarations", async () => {
    const { db, upserts } = fakeDb({ items: ["6.01(e)", "6.01(j)"], decided: ["6.01(e)"], modeledGrants: ["DEBT_INCURRENCE"] });
    const res = await evaluateCounselCoverage(db, { companyId: "co-1", sourceId: "src-1" });
    expect(res.reviewComplete).toBe(false);
    expect(res.decidedCount).toBe(1);
    expect(upserts).toHaveLength(2);
    expect(upserts.every((u) => !u.isComplete)).toBe(true);
  });

  it("a REJECTED item counts as decided", async () => {
    const { db } = fakeDb({ items: ["6.01(e)"], decided: [], modeledGrants: ["DEBT_INCURRENCE"] });
    // Override approvals with a REJECTED decision.
    db.knowledgeSource.findUnique = async () => ({
      documentId: "doc-1",
      metadata: {
        covenantSummary: { items: [{ sectionRef: "6.01(e)" }] },
        reviewerApprovals: [{ sectionRef: "6.01(e)", decision: "REJECTED" }],
      },
    });
    const res = await evaluateCounselCoverage(db, { companyId: "co-1", sourceId: "src-1" });
    expect(res.reviewComplete).toBe(true);
  });

  it("no MODELED permissions -> no declarations", async () => {
    const { db, upserts } = fakeDb({ items: ["6.01(e)"], decided: ["6.01(e)"], modeledGrants: [] });
    const res = await evaluateCounselCoverage(db, { companyId: "co-1", sourceId: "src-1" });
    expect(res.reviewComplete).toBe(true);
    expect(upserts).toHaveLength(0);
  });

  it("a SYSTEM auto-accept counts as decided; the complete note says exception-based (never counsel-verified)", async () => {
    const { db, upserts } = fakeDb({ items: ["6.01(e)"], decided: [], modeledGrants: ["DEBT_INCURRENCE"] });
    db.knowledgeSource.findUnique = async () => ({
      documentId: "doc-1",
      metadata: {
        covenantSummary: { items: [{ sectionRef: "6.01(e)" }] },
        reviewerApprovals: [{ sectionRef: "6.01(e)", decision: "ACCEPTED", reviewerKind: "SYSTEM", reviewerLabel: "system:auto-accept" }],
      },
    });
    const res = await evaluateCounselCoverage(db, { companyId: "co-1", sourceId: "src-1" });
    expect(res.reviewComplete).toBe(true);
    expect(upserts[0]?.notes).toContain("exception-based review");
    expect(upserts[0]?.notes).toContain("not counsel-verified");
  });

  it("complete declaration + MODELED permissions -> SOLVER_NATIVE at the gate", async () => {
    const { db } = fakeDb({ items: ["6.01(e)"], decided: ["6.01(e)"], modeledGrants: ["DEBT_INCURRENCE"] });
    const res = await evaluateCounselCoverage(db, { companyId: "co-1", sourceId: "src-1" });
    expect(res.reviewComplete).toBe(true);
    const coverage = determineCoverage({
      declaration: { documentId: "doc-1", side: "secured", grantType: "DEBT_INCURRENCE", isComplete: true },
      permissions: [{ id: "p1", documentId: "doc-1", grantType: "DEBT_INCURRENCE", modelingStatus: "MODELED", effectiveFrom: null, effectiveTo: null } as never],
      documentId: "doc-1",
      side: "secured",
      grantType: "DEBT_INCURRENCE",
      asOfDate: new Date("2026-10-16"),
      legacyFormulaPresent: true,
    });
    expect(coverage.status).toBe("SOLVER_NATIVE");
  });
});
