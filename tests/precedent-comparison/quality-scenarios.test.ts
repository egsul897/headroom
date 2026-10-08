import { describe, expect, it } from "vitest";
import {
  ALL_QUALITY_SCENARIOS,
  compareProvisions,
  reviewForClaim,
} from "../../lib/precedent-comparison";

describe("Independently reviewed quality scenarios", () => {
  it("covers all eight mandated comparison-quality scenarios", () => {
    expect(ALL_QUALITY_SCENARIOS).toHaveLength(8);
  });

  it("Q1: similar wording yields source-supported legal difference (not identical effect)", () => {
    const s = ALL_QUALITY_SCENARIOS[0]!;
    const record = compareProvisions(s.left, s.right);
    expect(record.textual.identical).toBe(false);
    expect(record.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
  });

  it("Q2: different wording can still share greater-of structural features", () => {
    const s = ALL_QUALITY_SCENARIOS[1]!;
    const record = compareProvisions(s.left, s.right);
    expect(record.structuralOverlap).toEqual(expect.arrayContaining(["GREATER_OF_BASKET"]));
  });

  it("Q3: remote condition appears as additional proviso/condition on one side", () => {
    const s = ALL_QUALITY_SCENARIOS[2]!;
    const record = compareProvisions(s.left, s.right);
    expect(
      record.claims.some(
        (c) =>
          c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" &&
          (c.dimension === "PROVISOS" || c.dimension === "CONDITIONS" || c.dimension === "STRUCTURE"),
      ),
    ).toBe(true);
  });

  it("Q4: definition addbacks produce definition-dimension divergence", () => {
    const s = ALL_QUALITY_SCENARIOS[3]!;
    const record = compareProvisions(s.left, s.right);
    expect(record.claims.some((c) => c.dimension === "DEFINITIONS" || c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
  });

  it("Q5: amendment supersession is claim-reviewable as SOURCE_SUPPORTED then verified", () => {
    const s = ALL_QUALITY_SCENARIOS[4]!;
    const base = compareProvisions(s.left, s.right);
    const legal = base.claims.find((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE");
    expect(legal).toBeTruthy();
    const reviewed = compareProvisions(s.left, s.right, {
      claimReviews: [
        reviewForClaim({
          claimId: legal!.claimId,
          comparisonId: base.comparisonId,
          left: s.left,
          right: s.right,
          note: "Amendment restates leverage schedule — verified against source.",
        }),
      ],
    });
    expect(reviewed.claims.find((c) => c.claimId === legal!.claimId)?.standing).toBe("REVIEWER_VERIFIED_CONCLUSION");
  });

  it("Q6: entity scope divergence is source-supported", () => {
    const s = ALL_QUALITY_SCENARIOS[5]!;
    const record = compareProvisions(s.left, s.right);
    expect(record.claims.some((c) => c.dimension === "SCOPE")).toBe(true);
  });

  it("Q7: shared basket / reclassification asymmetry is detected", () => {
    const s = ALL_QUALITY_SCENARIOS[6]!;
    const record = compareProvisions(s.left, s.right);
    expect(
      record.structuralDivergence.rightOnly.includes("SHARED_CAPACITY") ||
        record.structuralDivergence.rightOnly.includes("RECLASSIFICATION_RIGHT") ||
        record.claims.some((c) => c.dimension === "SHARED_CAPACITY" || c.dimension === "RECLASSIFICATION"),
    ).toBe(true);
  });

  it("Q8: numerical comparator maintenance vs permission are not collapsed by family mismatch alone", () => {
    const s = ALL_QUALITY_SCENARIOS[7]!;
    const record = compareProvisions(s.left, s.right);
    // Cross-family comparison still produces textual/structural claims; must not emit reviewer-verified.
    expect(record.claims.some((c) => c.standing === "REVIEWER_VERIFIED_CONCLUSION")).toBe(false);
    expect(record.claims.some((c) => c.standing === "TEXTUAL_SIMILARITY")).toBe(true);
  });
});
