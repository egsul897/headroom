import { describe, expect, it } from "vitest";
import { extractDeterministicCovenantFacts } from "../../../lib/contract-model/compiler/deterministic-extraction";

describe("deterministic covenant extraction", () => {
  it("extracts thresholds as facts that do not imply permission", () => {
    const result = extractDeterministicCovenantFacts({
      text: 'The Borrower shall not make Investments in an aggregate amount exceeding $25,000,000, except as provided in Section 7.02, provided that the Leverage Ratio is less than 3.00 to 1.00.',
      documentId: "doc-a",
      candidateRef: "7.03",
      citation: "Section 7.03",
    });
    expect(result.inventory.numericalThresholds.length).toBeGreaterThan(0);
    expect(result.inventory.crossReferences).toContain("7.02");
    expect(result.inventory.exceptions.length).toBeGreaterThan(0);
    expect(result.inventory.financialRatios.length).toBeGreaterThan(0);
    for (const f of result.facts) {
      expect(f.doesNotImplyPermission).toBe(true);
      expect(f.doesNotImplyOperativeAuthority).toBe(true);
    }
    expect(result.hypotheses.some((h) => h.kind === "PERMISSION_GUESS" && h.status === "UNRESOLVED")).toBe(true);
  });

  it("never emits a permission verdict as a fact", () => {
    const result = extractDeterministicCovenantFacts({
      text: "Investments not to exceed $10,000,000.",
    });
    expect(result.facts.every((f) => f.kind !== ("PERMISSION" as never))).toBe(true);
    expect(result.facts.filter((f) => f.kind === "NUMERICAL_THRESHOLD").every((f) => f.value.interpretation === "THRESHOLD_FACT_ONLY")).toBe(true);
  });
});
