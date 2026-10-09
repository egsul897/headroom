/**
 * IPV-15: a dependsOn to a sibling named only inside a retrieved definition
 * (Available Amount netting 7.06(c)/7.08(d)) is source-stated, not invented.
 */
import { describe, expect, it } from "vitest";
import { classifyEmittedReferences, SOURCE_REFERENCE_FIDELITY_VERSION } from "../../lib/contract-model/compiler/semantic/source-reference-fidelity";

const AA =
  '"Available Amount" means an amount equal to $20,000,000 minus Restricted Payments under Section 7.06(c) and Investments under Section 7.08(d); provided that the Available Amount shall be zero at any time a Default has occurred and is continuing.';

describe("definition-mediated shared capacity (IPV-15)", () => {
  it("exposes fidelity v3", () => {
    expect(SOURCE_REFERENCE_FIDELITY_VERSION).toBe("source-reference-fidelity.v3");
  });

  it("rejects a sibling dependsOn when only the clause text is scanned", () => {
    const outcome = classifyEmittedReferences({
      emitted: ["Section 7.06(c)"],
      operativeText: "(d) Investments in an aggregate amount not to exceed the Available Amount.",
    });
    expect(outcome.invented).toBe(true);
    expect(outcome.excluded.map((e) => e.classification)).toContain("MODEL_INVENTED_REFERENCE");
  });

  it("admits a sibling dependsOn stated inside a retrieved Available Amount definition", () => {
    const outcome = classifyEmittedReferences({
      emitted: ["Section 7.06(c)"],
      operativeText: "(d) Investments in an aggregate amount not to exceed the Available Amount.",
      dependentDefinitionTexts: [AA],
    });
    expect(outcome.invented).toBe(false);
    expect(outcome.excluded).toEqual([]);
    expect(outcome.authoritativeRefs.some((r) => /7\.06\(c\)/.test(r))).toBe(true);
    expect(outcome.classifications[0]?.classification).toMatch(/EXACT_SOURCE_REFERENCE|SOURCE_EQUIVALENT_NORMALIZATION/);
  });

  it("still rejects a reference the operative text and definitions never state", () => {
    const outcome = classifyEmittedReferences({
      emitted: ["Section 9.99"],
      operativeText: "(d) Investments in an aggregate amount not to exceed the Available Amount.",
      dependentDefinitionTexts: [AA],
    });
    expect(outcome.invented).toBe(true);
    expect(outcome.excluded.map((e) => e.emitted)).toContain("Section 9.99");
  });
});
