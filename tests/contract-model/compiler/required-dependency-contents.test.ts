/**
 * A required section dependency is not a contents listing.
 * The operative body is delivered when it is the only substantive occurrence.
 * Two operative bodies stay unresolved.
 */
import { describe, expect, it } from "vitest";
import { deriveRequiredDependencies } from "../../../lib/contract-model/compiler/semantic/required-dependencies";
import type { FrozenSemanticInventory, SourceContextResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";

function node(partial: Pick<StructuralNode, "documentId" | "nodeId" | "nodeType" | "sectionRef" | "charStart" | "charEnd" | "parentNodeId"> & { ordinal?: number }): StructuralNode {
  return { heading: "", nodeKey: `${partial.documentId}::${partial.sectionRef}`, ordinal: partial.ordinal ?? 0, parentSectionRef: null, ...partial };
}

const doc = "unseen-synthetic-credit-agreement";
const inventory = { items: [], uninventoriedValues: [], unaccountedSource: [] } as unknown as FrozenSemanticInventory;
const sourceContext = { regions: [], unresolvedReferences: [] } as unknown as SourceContextResult;

function depsFor(text: string, nodes: StructuralNode[]) {
  const index = buildStructuralIndex(new Map([[doc, { text, nodes }]]), [], []);
  return deriveRequiredDependencies({
    shardUnits: [],
    ownedText: "The Borrower shall comply with Section 7.04.",
    ownedItemIds: [],
    inventory,
    index,
    documentId: doc,
    sourceContext,
    itemOwnerUnit: new Map(),
    ownedUnitKeys: new Set(["unit-1"]),
  });
}

describe("required section dependencies exclude a contents listing", () => {
  it("does not deliver a contents listing that is the only node for the cited label", () => {
    const toc = "Section 7.04 Asset Dispositions 233\n";
    const found = depsFor(toc, [node({ documentId: doc, nodeId: "toc", nodeType: "SECTION", sectionRef: "7.04", charStart: 0, charEnd: toc.length, parentNodeId: null })]);
    const section = found.find((item) => item.kind === "REQUIRED_REFERENCED_SECTION");
    expect(section?.fullText).toBe("");
    expect(section?.disposition).toBe("INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED");
    expect(section?.dispositionReason).toContain("contents listing");
  });

  it("delivers the operative body when a contents row shares the cited label", () => {
    const toc = "Section 7.04 Asset Dispositions 233\n";
    const body = "Section 7.04 Asset Dispositions. The Borrower shall not sell any asset.\n";
    const text = toc + body;
    const found = depsFor(text, [
      node({ documentId: doc, nodeId: "toc", nodeType: "SECTION", sectionRef: "7.04", charStart: 0, charEnd: toc.length, parentNodeId: null }),
      node({ documentId: doc, nodeId: "body", nodeType: "SECTION", sectionRef: "7.04", charStart: toc.length, charEnd: text.length, parentNodeId: null, ordinal: 1 }),
    ]);
    const section = found.find((item) => item.kind === "REQUIRED_REFERENCED_SECTION");
    expect(section?.sourceNodeId).toBe("body");
    expect(section?.fullText).toContain("shall not sell any asset");
    expect(section?.fullText).not.toContain("233");
  });

  it("does not deliver either body when two operative occurrences share the cited label", () => {
    const first = "Section 7.04 First. The Borrower shall pay.\n";
    const second = "Section 7.04 Second. The Borrower shall not pay.\n";
    const text = first + second;
    const found = depsFor(text, [
      node({ documentId: doc, nodeId: "first", nodeType: "SECTION", sectionRef: "7.04", charStart: 0, charEnd: first.length, parentNodeId: null }),
      node({ documentId: doc, nodeId: "second", nodeType: "SECTION", sectionRef: "7.04", charStart: first.length, charEnd: text.length, parentNodeId: null, ordinal: 1 }),
    ]);
    const section = found.find((item) => item.kind === "REQUIRED_REFERENCED_SECTION");
    expect(section?.fullText).toBe("");
    expect(section?.disposition).toBe("AMBIGUOUS_REQUIRED_DEPENDENCY");
  });
});
