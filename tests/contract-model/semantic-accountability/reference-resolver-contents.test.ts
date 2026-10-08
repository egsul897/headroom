/**
 * A long contents listing is not the operative target of a section label.
 * Length is not a vote. Two operative bodies stay unresolved.
 */
import { describe, expect, it } from "vitest";
import { resolveReferenceTarget } from "../../../lib/contract-model/compiler/semantic-accountability/reference-resolver";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";

function node(partial: Pick<StructuralNode, "documentId" | "nodeId" | "nodeType" | "sectionRef" | "charStart" | "charEnd" | "parentNodeId"> & { ordinal?: number }): StructuralNode {
  return {
    heading: "",
    nodeKey: `${partial.documentId}::${partial.sectionRef}`,
    ordinal: partial.ordinal ?? 0,
    parentSectionRef: null,
    ...partial,
  };
}

const doc = "unseen-synthetic-credit-agreement";

describe("reference resolution excludes a contents listing at any length", () => {
  it("takes the shorter operative body when the contents title is longer", () => {
    const longToc = `Section 12.03 ${"Minimum Liquidity of $50,000,000 ".repeat(12)} 14\n`;
    const shortBody = "Section 12.03 Payments. The Borrower shall pay.\n";
    expect(longToc.length).toBeGreaterThan(200);
    expect(shortBody.length).toBeLessThan(200);
    const combined = longToc + shortBody;
    const index = buildStructuralIndex(new Map([[doc, {
      text: combined,
      nodes: [
        node({ documentId: doc, nodeId: "toc", nodeType: "SECTION", sectionRef: "12.03", charStart: 0, charEnd: longToc.length, parentNodeId: null }),
        node({ documentId: doc, nodeId: "body", nodeType: "SECTION", sectionRef: "12.03", charStart: longToc.length, charEnd: combined.length, parentNodeId: null, ordinal: 1 }),
      ],
    }]]), [], []);
    const resolved = resolveReferenceTarget(index, doc, "Section 12.03");
    expect(resolved.status).toBe("UNIQUE_AFTER_DEGENERATE_EXCLUSION");
    expect(resolved.node?.nodeId).toBe("body");
    expect(resolved.excludedDegenerateNodeIds).toEqual(["toc"]);
    expect(index.getNodeText(resolved.node!.nodeId, "DESCENDANTS")).toContain("shall pay");
  });

  it("does not choose between two operative bodies", () => {
    const a = "Section 4.01 First. The Borrower shall pay.\n";
    const b = "Section 4.01 Second. The Borrower shall not pay.\n";
    const combined = a + b;
    const index = buildStructuralIndex(new Map([[doc, {
      text: combined,
      nodes: [
        node({ documentId: doc, nodeId: "a", nodeType: "SECTION", sectionRef: "4.01", charStart: 0, charEnd: a.length, parentNodeId: null }),
        node({ documentId: doc, nodeId: "b", nodeType: "SECTION", sectionRef: "4.01", charStart: a.length, charEnd: combined.length, parentNodeId: null, ordinal: 1 }),
      ],
    }]]), [], []);
    const resolved = resolveReferenceTarget(index, doc, "Section 4.01");
    expect(resolved.status).toBe("AMBIGUOUS");
    expect(resolved.node).toBeNull();
  });
});
