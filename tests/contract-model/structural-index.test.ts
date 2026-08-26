/**
 * Phase 2A - tests for the full structural parse + navigation API
 * (stage-structure.ts + structural-index.ts). Synthetic text only, covering
 * hierarchy, identity, text boundaries, and formatting robustness required
 * by task §17.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";

function indexFor(docs: CompilerDocumentInput[]) {
  const nodesByDocument = new Map(docs.map((d) => [d.documentId, { text: d.text, nodes: parseDocumentStructure(d) }]));
  return { nodesByDocument, index: buildStructuralIndex(nodesByDocument, [], []) };
}

const SAMPLE = "ARTICLE 6 NEGATIVE COVENANTS General provisions. Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) the Senior Obligations; (b) other Indebtedness of (i) the Company and (ii) any Subsidiary; (c) Indebtedness not to exceed $5,000,000. Section 6.02. Liens. The Company shall not grant Liens, except Permitted Liens.";

describe("Structural hierarchy", () => {
  it("discovers ARTICLE, SECTION, SUBSECTION, and CLAUSE nodes with correct nesting", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const types = new Map(index.allNodes().map((n) => [n.nodeType, (index.allNodes().filter((x) => x.nodeType === n.nodeType).length)]));
    expect(types.get("ARTICLE")).toBe(1);
    expect(types.get("SECTION")).toBe(2);
    expect(types.get("SUBSECTION")).toBe(3);
    expect(types.get("CLAUSE")).toBe(2);
  });

  it("ancestry: getAncestors returns root-to-parent order", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const clause = index.getNodeByRef("doc1", "6.01(b)(i)")!;
    const ancestors = index.getAncestors(clause.nodeKey);
    expect(ancestors.map((a) => a.sectionRef)).toEqual(["6", "6.01", "6.01(b)"]);
  });

  it("siblings: getSiblings excludes the node itself and returns only same-parent nodes", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const b = index.getNodeByRef("doc1", "6.01(b)")!;
    const siblings = index.getSiblings(b.nodeKey);
    expect(siblings.map((s) => s.sectionRef).sort()).toEqual(["6.01(a)", "6.01(c)"]);
  });

  it("descendants: getDescendants returns every nested node at any depth, in document order", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const section = index.getNodeByRef("doc1", "6.01")!;
    const descendants = index.getDescendants(section.nodeKey);
    expect(descendants.map((d) => d.sectionRef)).toEqual(["6.01(a)", "6.01(b)", "6.01(b)(i)", "6.01(b)(ii)", "6.01(c)"]);
  });

  it("children: getChildren returns only direct children, not grandchildren", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const section = index.getNodeByRef("doc1", "6.01")!;
    const children = index.getChildren(section.nodeKey);
    expect(children.map((c) => c.sectionRef)).toEqual(["6.01(a)", "6.01(b)", "6.01(c)"]);
  });
});

describe("Structural identity", () => {
  it("distinguishes exact refs at every depth without fuzzy matching", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    expect(index.getNodeByRef("doc1", "6.01")).toBeDefined();
    expect(index.getNodeByRef("doc1", "6.01(a)")).toBeDefined();
    expect(index.getNodeByRef("doc1", "6.01(b)(i)")).toBeDefined();
    expect(index.getNodeByRef("doc1", "6.10(a)")).toBeUndefined(); // never exists in this sample - must not fuzzily resolve to a similar ref.
  });

  it("a coarser ref is never confused with a more specific one that merely shares a prefix", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const section = index.getNodeByRef("doc1", "6.01")!;
    const subsection = index.getNodeByRef("doc1", "6.01(a)")!;
    expect(section.nodeKey).not.toBe(subsection.nodeKey);
    expect(section.nodeType).toBe("SECTION");
    expect(subsection.nodeType).toBe("SUBSECTION");
  });

  it("duplicate section numbers across two different documents never collide (task §13 package-level separation)", () => {
    const docA = { documentId: "docA", label: "Credit Agreement", text: SAMPLE };
    const docB = { documentId: "docB", label: "Indenture", text: SAMPLE.replace("Senior Obligations", "Notes Obligations") };
    const { index } = indexFor([docA, docB]);
    const a601 = index.getNodeByRef("docA", "6.01")!;
    const b601 = index.getNodeByRef("docB", "6.01")!;
    expect(a601.nodeKey).not.toBe(b601.nodeKey);
    expect(a601.documentId).toBe("docA");
    expect(b601.documentId).toBe("docB");
    // A's children must never appear when querying B's own tree.
    const aChildren = index.getChildren(a601.nodeKey);
    const bChildren = index.getChildren(b601.nodeKey);
    expect(aChildren.every((c) => c.documentId === "docA")).toBe(true);
    expect(bChildren.every((c) => c.documentId === "docB")).toBe(true);
  });
});

describe("Text boundaries", () => {
  it("OWN text for a leaf clause equals DESCENDANTS text (no children to exclude)", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const clause = index.getNodeByRef("doc1", "6.01(c)")!;
    const own = index.getNodeText(clause.nodeKey, "OWN");
    const desc = index.getNodeText(clause.nodeKey, "DESCENDANTS");
    expect(own).toBe(desc);
    expect(own).toContain("$5,000,000");
  });

  it("OWN text for a container excludes its children's text; DESCENDANTS includes it", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const b = index.getNodeByRef("doc1", "6.01(b)")!;
    const own = index.getNodeText(b.nodeKey, "OWN");
    const desc = index.getNodeText(b.nodeKey, "DESCENDANTS");
    expect(own).not.toContain("(ii)"); // the child clause's own marker/text is excluded from OWN.
    expect(desc).toContain("(ii)");
    expect(desc.length).toBeGreaterThan(own.length);
  });

  it("a section's text never bleeds into the next section's text", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const s601 = index.getNodeByRef("doc1", "6.01")!;
    const text = index.getNodeText(s601.nodeKey, "DESCENDANTS");
    expect(text).not.toContain("Liens");
    expect(text).not.toContain("Permitted Liens");
  });

  it("requesting one specific deep clause returns exactly that clause, not the whole section", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const clause = index.getNodeByRef("doc1", "6.01(b)(i)")!;
    const text = index.getNodeText(clause.nodeKey, "DESCENDANTS");
    expect(text).toContain("the Company");
    expect(text).not.toContain("Senior Obligations");
    expect(text).not.toContain("(ii)");
  });
});

describe("Formatting robustness (task §12)", () => {
  it("handles a document with zero real newline characters (all headings run together in one line)", () => {
    const flat = SAMPLE.replace(/\n/g, " ");
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: flat }]);
    expect(index.getNodeByRef("doc1", "6.01")).toBeDefined();
    expect(index.getNodeByRef("doc1", "6.02")).toBeDefined();
    expect(index.getNodeByRef("doc1", "6.01(a)")).toBeDefined();
  });

  it("tolerates inconsistent/doubled whitespace and a leading space before a heading", () => {
    const messy = SAMPLE.replace("Section 6.02.", "\n   SECTION  6.02  ");
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: messy }]);
    expect(index.getNodeByRef("doc1", "6.02")).toBeDefined();
  });

  it("handles a line break inside a heading's own title text", () => {
    const wrapped = SAMPLE.replace("Section 6.02. Liens.", "Section 6.02.\nLiens\n.");
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: wrapped }]);
    expect(index.getNodeByRef("doc1", "6.02")).toBeDefined();
  });

  it("handles ARTICLE with an all-caps multi-word title directly followed by body prose with no separating period", () => {
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: SAMPLE }]);
    const article = index.getNodeByRef("doc1", "6")!;
    expect(article.heading).toContain("NEGATIVE COVENANTS");
    expect(article.heading).not.toContain("General provisions");
  });

  it("a defined term containing punctuation (semicolon in the section title) does not break heading detection", () => {
    const withSemicolon = SAMPLE.replace("Section 6.02. Liens.", "Section 6.02. Liens; Related Restrictions.");
    const { index } = indexFor([{ documentId: "doc1", label: "CA", text: withSemicolon }]);
    const s = index.getNodeByRef("doc1", "6.02")!;
    expect(s.heading).toContain("Liens; Related Restrictions");
  });
});
