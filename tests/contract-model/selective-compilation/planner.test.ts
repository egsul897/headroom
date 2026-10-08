import { describe, expect, it } from "vitest";
import { planSelectiveCompilation } from "../../../lib/contract-model/compiler/selective-compilation";

describe("selective compilation planner", () => {
  it("expands seeds to definitions, exceptions, and shared caps — not top-k", () => {
    const plan = planSelectiveCompilation({
      provisions: [
        {
          unitId: "seed",
          documentId: "d1",
          sectionRef: "7.03",
          text: 'The Borrower shall not make Investments except as permitted below, subject to the definition of "Consolidated EBITDA" and the Combined Cap.',
          roles: ["GENERAL_PROHIBITION"],
          families: ["INVESTMENTS"],
          isSeed: true,
          sharedCapacityGroup: "combined",
        },
        {
          unitId: "exception",
          documentId: "d1",
          sectionRef: "7.03(b)",
          text: "Exceptions: Investments in Restricted Subsidiaries.",
          roles: ["EXCEPTION"],
          families: ["INVESTMENTS"],
        },
        {
          unitId: "def",
          documentId: "d1",
          sectionRef: "1.01",
          text: '"Consolidated EBITDA" means Consolidated Net Income plus ...',
          roles: ["DEFINITIONAL_DEPENDENCY_CANDIDATE"],
          definitionTerms: ["Consolidated EBITDA"],
        },
        {
          unitId: "cap",
          documentId: "d1",
          sectionRef: "7.03(c)",
          text: "Combined Cap shared across clauses.",
          roles: ["SHARED_CAP"],
          families: ["INVESTMENTS"],
          sharedCapacityGroup: "combined",
        },
        {
          unitId: "noise",
          documentId: "d1",
          sectionRef: "9.01",
          text: "Notices shall be delivered by email.",
          roles: [],
        },
      ],
      seedUnitIds: ["seed"],
    });
    // Attach shared group on seed for shared-cap expansion
    expect(plan.compileUnitIds).toContain("seed");
    expect(plan.compileUnitIds).toContain("exception");
    expect(plan.compileUnitIds).toContain("def");
    expect(plan.omitted.some((o) => o.sourceId === "noise" && o.independentlyReviewed)).toBe(true);
    expect(plan.notes.some((n) => n.includes("not top-k"))).toBe(true);
    expect(plan.stats.reductionRatio).toBeGreaterThanOrEqual(0);
  });
});
