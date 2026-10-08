/**
 * A contents listing is not a cross-reference expansion region.
 * A unique operative body beside that listing is kept. Two operative bodies are not guessed.
 */
import { describe, expect, it } from "vitest";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import { detectStructuralReferences } from "../../../lib/contract-model/compiler/structural-references";
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

function contextFor(text: string, nodes: StructuralNode[], anchorId: string) {
  const anchor = nodes.find((item) => item.nodeId === anchorId)!;
  const index = buildStructuralIndex(new Map([[doc, { text, nodes }]]), [], detectStructuralReferences(doc, text, nodes));
  return resolveSourceContext({
    index,
    documentId: doc,
    operativeSourceText: text.slice(anchor.charStart, anchor.charEnd),
    anchorNodeId: anchor.nodeId,
    operativeCharStart: anchor.charStart,
    documentText: text,
  });
}

describe("source context does not expand a contents listing", () => {
  it("does not expand a contents listing that is the only node for the cited label", () => {
    const cite = "The Borrower shall not sell assets except as permitted under Section 7.04.\n";
    const toc = "Section 7.04 Asset Dispositions 233\n";
    const text = cite + toc;
    const nodes = [
      node({ documentId: doc, nodeId: "cite", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: cite.length, parentNodeId: null }),
      node({ documentId: doc, nodeId: "toc", nodeType: "SECTION", sectionRef: "7.04", charStart: cite.length, charEnd: text.length, parentNodeId: null, ordinal: 1 }),
    ];
    const result = contextFor(text, nodes, "cite");
    expect(result.regions.filter((region) => region.kind === "CROSS_REFERENCE_EXPANSION")).toEqual([]);
    expect(result.regions.some((region) => region.text.includes("233"))).toBe(false);
    expect(result.unresolvedReferences.some((item) => item.reason.includes("contents listing"))).toBe(true);
  });

  it("expands the operative body when a contents row shares the cited label", () => {
    const cite = "The Borrower shall not sell assets except as permitted under Section 7.04.\n";
    const toc = "Section 7.04 Asset Dispositions 233\n";
    const body = "Section 7.04 Asset Dispositions. The Borrower shall not sell any asset.\n";
    const text = cite + toc + body;
    const nodes = [
      node({ documentId: doc, nodeId: "cite", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: cite.length, parentNodeId: null }),
      node({ documentId: doc, nodeId: "toc", nodeType: "SECTION", sectionRef: "7.04", charStart: cite.length, charEnd: cite.length + toc.length, parentNodeId: null, ordinal: 1 }),
      node({ documentId: doc, nodeId: "body", nodeType: "SECTION", sectionRef: "7.04", charStart: cite.length + toc.length, charEnd: text.length, parentNodeId: null, ordinal: 2 }),
    ];
    const result = contextFor(text, nodes, "cite");
    const expansions = result.regions.filter((region) => region.kind === "CROSS_REFERENCE_EXPANSION");
    expect(expansions.map((region) => region.sourceNodeId)).toEqual(["body"]);
    expect(expansions[0]!.text).toContain("shall not sell any asset");
    expect(expansions[0]!.text).not.toContain("233");
  });

  it("does not expand either body when two operative occurrences share the cited label", () => {
    const cite = "The Borrower shall comply with Section 4.01.\n";
    const first = "Section 4.01 First. The Borrower shall pay.\n";
    const second = "Section 4.01 Second. The Borrower shall not pay.\n";
    const text = cite + first + second;
    const nodes = [
      node({ documentId: doc, nodeId: "cite", nodeType: "SECTION", sectionRef: "3.01", charStart: 0, charEnd: cite.length, parentNodeId: null }),
      node({ documentId: doc, nodeId: "first", nodeType: "SECTION", sectionRef: "4.01", charStart: cite.length, charEnd: cite.length + first.length, parentNodeId: null, ordinal: 1 }),
      node({ documentId: doc, nodeId: "second", nodeType: "SECTION", sectionRef: "4.01", charStart: cite.length + first.length, charEnd: text.length, parentNodeId: null, ordinal: 2 }),
    ];
    const result = contextFor(text, nodes, "cite");
    expect(result.regions.filter((region) => region.kind === "CROSS_REFERENCE_EXPANSION")).toEqual([]);
    expect(result.unresolvedReferences.some((item) => item.status === "AMBIGUOUS")).toBe(true);
  });
});
