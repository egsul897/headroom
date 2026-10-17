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
    expect(result.structuralHealthErrors).toBe(0);

    // Exact hand-computed resolution counts for this sample
    // (verified against the real parser — Stage 0 pinning).
    // The detector records 8 references, not just the 3 in-body
    // ones: heading occurrences ("ARTICLE I", "ARTICLE VII",
    // "Section 1.01", "Section 7.01", "Section 7.02") are also
    // recorded as cross-references. Of the 8: 6 resolve to a
    // unique node, 0 are ambiguous, and 2 are not found — the
    // clause-level refs "Section 7.01(a)" and "Section 7.02(b)",
    // for which no clause nodes exist.
    expect(result.crossReferences).toHaveLength(8);
    expect(result.resolvedCrossReferenceCount).toBe(6);
    expect(result.crossReferences.filter((c) => c.resolved)).toHaveLength(6);
    expect(result.crossReferences.filter((c) => c.targetAmbiguous)).toHaveLength(0);
    expect(result.crossReferences.filter((c) => !c.resolved && !c.targetAmbiguous)).toHaveLength(2);

    const withTarget = result.crossReferences.filter((c) => c.targetSectionRef);
    expect(withTarget.length).toBeGreaterThan(0);
    expect(withTarget).toHaveLength(8);

    // The in-body "Section 1.01" reference resolves to the unique
    // node whose sectionRef is "1.01" (target identified — a
    // structural fact, nothing more).
    const section101Node = result.nodes.find((n) => n.sectionRef === "1.01");
    expect(section101Node).toBeTruthy();
    const refs101 = result.crossReferences.filter((c) => c.rawReference === "Section 1.01");
    expect(refs101.length).toBeGreaterThan(0);
    for (const r of refs101) {
      expect(r.resolved).toBe(true);
      expect(r.targetAmbiguous).toBe(false);
      expect(r.targetSectionRef).toBe("1.01");
      expect(r.targetNodeId).toBe(section101Node!.nodeId);
      expect(r.unresolvedReason).toBeNull();
    }

    // Clause-level references have no target node and stay
    // unresolved with the explicit not-found reason.
    for (const raw of ["Section 7.01(a)", "Section 7.02(b)"]) {
      const refs = result.crossReferences.filter((c) => c.rawReference === raw);
      expect(refs).toHaveLength(1);
      const r = refs[0]!;
      expect(r.resolved).toBe(false);
      expect(r.targetAmbiguous).toBe(false);
      expect(r.targetNodeId).toBeNull();
      expect(r.unresolvedReason).toContain("exists among this document's own structural nodes");
    }
  });
});
