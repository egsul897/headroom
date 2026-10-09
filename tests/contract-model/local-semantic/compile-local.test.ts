import { describe, expect, it } from "vitest";
import { compileLocalSemanticUnit } from "../../../lib/contract-model/compiler/local-semantic";

describe("local semantic compiler", () => {
  it("deterministic mode yields UNVERIFIED unresolved output with source provenance path", async () => {
    const result = await compileLocalSemanticUnit(
      {
        unitId: "u1",
        documentId: "d1",
        sectionRef: "7.02",
        operativeText: "The Borrower shall not incur Indebtedness except as set forth in Section 7.02(b), in an amount not to exceed $50,000,000.",
        dependencyTexts: [{ ref: "7.02(b)", text: "Permitted Indebtedness includes ...", citation: "7.02(b)" }],
      },
      { mode: "DETERMINISTIC_ONLY" }
    );
    expect(result.verificationStatus).toBe("UNVERIFIED");
    expect(result.inference.status).toBe("DETERMINISTIC");
    expect(result.output?.verificationStatus).toBe("UNVERIFIED");
    expect(result.output?.rules).toEqual([]);
    expect(result.deterministicFacts.facts.every((f) => f.doesNotImplyPermission)).toBe(true);
    expect(result.inference.cost.costUsd).toBe(0);
  });
});
