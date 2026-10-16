/**
 * Rule 69 — heading evidence outranks body evidence in family
 * classification.
 *
 * The old code returned families in taxonomy order, so a
 * body-pattern match for an early-taxonomy family beat a
 * heading match for the section's true family — e.g. a
 * GUARANTEES section whose body mentioned "reinvestment"
 * came back [ASSET_SALES, GUARANTEES], and analyzeProvision
 * takes families[0] as the primary family, miscategorizing
 * the section as ASSET_SALES. Heading matches now list first.
 */
import { describe, expect, it } from "vitest";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";

describe("classifyFamiliesFromText heading priority", () => {
  it("heading family beats an earlier-taxonomy body match", () => {
    const families = classifyFamiliesFromText(
      "The Guarantor shall guarantee the obligations, and any proceeds shall be applied to reinvestment.",
      "Limitation on Guarantees",
    );
    expect(families[0]).toBe("GUARANTEES");
    expect(families).toContain("ASSET_SALES");
  });

  it("body-only matches keep taxonomy order when the heading names no family", () => {
    const families = classifyFamiliesFromText(
      "Any proceeds shall be applied to reinvestment. The Company shall not merge or consolidate.",
      "Additional Provisions",
    );
    expect(families).toContain("ASSET_SALES");
    expect(families).toContain("FUNDAMENTAL_CHANGES");
  });

  it("a heading matching two families keeps taxonomy order between them", () => {
    const families = classifyFamiliesFromText(
      "The Company shall not incur Indebtedness or create Liens.",
      "Limitation on Indebtedness and Liens",
    );
    expect(families[0]).toBe("INDEBTEDNESS");
    expect(families).toContain("LIENS");
  });
});
