/**
 * Rule 43 — FCCR condition thresholds must be qualifier-aware,
 * not first-number-in-string.
 *
 * The evaluator took the FIRST number in the condition as the
 * FCCR threshold: "Section 6.10 requires a Fixed Charge Coverage
 * Ratio of at least 1.25" used 6.10 (the section ref) as the
 * threshold, and "FCCR for the 12 months ended ..." used 12 (the
 * period length). Both made a satisfiable condition look
 * unsatisfied (CONDITIONAL instead of PERMITS). The threshold is
 * now found after the FCCR phrase, attached to a qualifier, with
 * direction honored ("not to exceed" is an upper bound).
 */
import { describe, expect, it } from "vitest";
import { fccrConditionSatisfied } from "../../lib/product/covenant-intelligence/fccr-condition";

describe("fccrConditionSatisfied", () => {
  it("ignores a preceding section ref (6.10 is not the threshold)", () => {
    expect(
      fccrConditionSatisfied(
        "Section 6.10 requires a Fixed Charge Coverage Ratio of at least 1.25 to 1.00.",
        1.5,
      ),
    ).toBe(true);
    expect(
      fccrConditionSatisfied(
        "Section 6.10 requires a Fixed Charge Coverage Ratio of at least 1.25 to 1.00.",
        1.0,
      ),
    ).toBe(false);
  });

  it("ignores a preceding period length (12 months is not the threshold)", () => {
    expect(
      fccrConditionSatisfied(
        "Fixed Charge Coverage Ratio for the 12 months ended June 30, 2026 of at least 1.25 to 1.00.",
        1.5,
      ),
    ).toBe(true);
  });

  it("honors upper-bound direction (not to exceed)", () => {
    expect(fccrConditionSatisfied("Fixed Charge Coverage Ratio not to exceed 3.00.", 2.5)).toBe(true);
    expect(fccrConditionSatisfied("Fixed Charge Coverage Ratio not to exceed 3.00.", 3.5)).toBe(false);
  });

  it("returns null when no FCCR threshold is stated", () => {
    expect(fccrConditionSatisfied("No Default has occurred.", 1.5)).toBeNull();
    expect(fccrConditionSatisfied("Fixed Charge Coverage Ratio must be tested quarterly.", 1.5)).toBeNull();
  });
});
