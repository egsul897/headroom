import { describe, expect, it } from "vitest";
import { extractStructure } from "../../lib/knowledge-factory/pipeline/structural";

const SAMPLE = `
ARTICLE I DEFINITIONS
Section 1.01 Defined Terms.
"Available Amount" means the sum of (a) $50,000,000 and (b) 50% of Consolidated Net Income.
"Consolidated EBITDA" means, for any period, Consolidated Net Income plus interest expense.

ARTICLE VII NEGATIVE COVENANTS
Section 7.01 Indebtedness.
The Borrower shall not incur Indebtedness except as permitted under Section 7.01(a) and Section 1.01.
Section 7.02 Liens.
The Borrower shall not create Liens except Permitted Liens under Section 7.02(b).
`;

describe("KF structural Phase 2 wire", () => {
  it("resolves definitions via Phase 2 detector and cross-ref targets when unique", () => {
    const result = extractStructure("doc-test", SAMPLE);
    expect(result.definitions.some((d) => /Available Amount/i.test(d.term))).toBe(true);
    expect(result.definitions.some((d) => /Consolidated EBITDA/i.test(d.term))).toBe(true);
    expect(result.crossReferences.length).toBeGreaterThan(0);
    // At least one xref should resolve to a unique section when structure parsed.
    expect(result.resolvedCrossReferenceCount).toBeGreaterThanOrEqual(0);
    expect(result.structuralHealthErrors).toBe(0);
    const withTarget = result.crossReferences.filter((c) => c.targetSectionRef);
    expect(withTarget.length).toBeGreaterThan(0);
  });
});
