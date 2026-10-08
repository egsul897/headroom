/**
 * A definition's cross-reference retrieves the operative body when a contents
 * listing shares the label. Two operative bodies stay unresolved. A contents
 * listing alone is not retrieved.
 */
import { describe, expect, it } from "vitest";
import { retrieveCrossReferencesFromDefinitionText, retrieveCrossReferencesFromNode } from "../../lib/contract-model/compiler/context-retrieval/reference-context";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { createRetrievalState } from "../../lib/contract-model/compiler/context-retrieval/state";
import { DEFAULT_RETRIEVAL_BUDGET } from "../../lib/contract-model/compiler/context-retrieval/types";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const doc = "unseen-synthetic-credit-agreement";

function node(partial: Pick<StructuralNode, "nodeId" | "nodeType" | "sectionRef" | "charStart" | "charEnd"> & { ordinal?: number }): StructuralNode {
  return {
    documentId: doc,
    heading: "",
    nodeKey: `${doc}::${partial.sectionRef}::${partial.nodeId}`,
    ordinal: partial.ordinal ?? 0,
    parentSectionRef: null,
    parentNodeId: null,
    ...partial,
  };
}

function retrieve(text: string, nodes: StructuralNode[], definitionText: string) {
  const index = buildStructuralIndex(new Map([[doc, { text, nodes }]]), [], []);
  const state = createRetrievalState(DEFAULT_RETRIEVAL_BUDGET);
  retrieveCrossReferencesFromDefinitionText(state, index, doc, definitionText, "def-item", 0, null);
  return state;
}

describe("definition cross-references skip contents listings", () => {
  it("retrieves the operative body when a contents row shares the label", () => {
    const toc = "Section 7.01 Minimum Liquidity of $50,000,000 225\n";
    const body = "Section 7.01 Indebtedness. The Borrower shall not incur debt.\n";
    const state = retrieve(toc + body, [
      node({ nodeId: "toc", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: toc.length }),
      node({ nodeId: "body", nodeType: "SECTION", sectionRef: "7.01", charStart: toc.length, charEnd: toc.length + body.length, ordinal: 1 }),
    ], "\"Permitted Debt\" means Indebtedness permitted under Section 7.01.");
    const excerpts = [...state.items.values()].map((item) => item.excerptText);
    expect(excerpts.some((text) => text.includes("shall not incur"))).toBe(true);
    expect(excerpts.some((text) => text.includes("225"))).toBe(false);
    expect(state.unresolved).toEqual([]);
  });

  it("does not retrieve either body when two operative occurrences share the label", () => {
    const a = "Section 7.01 First. The Borrower shall pay.\n";
    const b = "Section 7.01 Second. The Borrower shall not pay.\n";
    const state = retrieve(a + b, [
      node({ nodeId: "a", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: a.length }),
      node({ nodeId: "b", nodeType: "SECTION", sectionRef: "7.01", charStart: a.length, charEnd: a.length + b.length, ordinal: 1 }),
    ], "\"Permitted Debt\" means the covenant in Section 7.01.");
    expect([...state.items.values()]).toEqual([]);
    expect(state.unresolved.map((row) => row.reason).join(" ")).toContain("never guessed");
  });

  it("follows a detected reference to the operative body and not the contents row", () => {
    const cite = "Section 8.01 Notice. Read Section 7.02 before sending notice.\n";
    const toc = "Section 7.02 Minimum Liquidity of $50,000,000 225\n";
    const body = "Section 7.02 Liens. The Borrower shall not create Liens.\n";
    const text = cite + toc + body;
    const nodes = [
      node({ nodeId: "cite", nodeType: "SECTION", sectionRef: "8.01", charStart: 0, charEnd: cite.length }),
      node({ nodeId: "toc", nodeType: "SECTION", sectionRef: "7.02", charStart: cite.length, charEnd: cite.length + toc.length, ordinal: 1 }),
      node({ nodeId: "body", nodeType: "SECTION", sectionRef: "7.02", charStart: cite.length + toc.length, charEnd: text.length, ordinal: 2 }),
    ];
    const index = buildStructuralIndex(new Map([[doc, { text, nodes }]]), [], detectStructuralReferences(doc, text, nodes));
    const state = createRetrievalState(DEFAULT_RETRIEVAL_BUDGET);
    retrieveCrossReferencesFromNode(state, index, doc, "cite", "cite-item", 0, false, null);
    const excerpts = [...state.items.values()].map((item) => item.excerptText);
    expect(excerpts.some((value) => value.includes("shall not create Liens"))).toBe(true);
    expect(excerpts.some((value) => value.includes("225"))).toBe(false);
  });

  it("does not retrieve a contents listing that is the only occurrence", () => {
    const toc = "Section 7.01 Minimum Liquidity of $50,000,000 225\n";
    const state = retrieve(toc, [
      node({ nodeId: "toc", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: toc.length }),
    ], "\"Permitted Debt\" means Indebtedness permitted under Section 7.01.");
    expect([...state.items.values()]).toEqual([]);
    expect(state.unresolved.map((row) => row.reason).join(" ")).toContain("contents listing");
  });
});
