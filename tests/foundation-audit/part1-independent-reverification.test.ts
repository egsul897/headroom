/**
 * Foundation Assurance Audit - Part 1: independent re-verification of I1-I16.
 *
 * This file deliberately does NOT copy any test body from
 * tests/contract-model/structural-node-identity-invariants.test.ts or
 * structural-node-identity-property.test.ts. Its angle is different in two
 * ways from both existing suites:
 *
 *  1. Unlike structural-node-identity-invariants.test.ts (which hand-builds
 *     StructuralNode[] to synthesize otherwise-impossible violations), every
 *     test here drives the REAL production functions end-to-end
 *     (parseDocumentStructure -> buildStructuralIndex) - the same discipline
 *     structural-node-identity-property.test.ts uses, but targeting scenarios
 *     that suite's 11 named categories and 1500-case fuzz loop do not exercise
 *     (see part4 file for the fuzz-generator's own coverage gaps).
 *  2. Unlike structural-node-identity-property.test.ts's core-invariant
 *     helper (which only checks I1/I7/I9/I13/zero-ERROR - its own stated
 *     scope), tests here individually target I6, I11, I13, I15 and the
 *     ADR's own "I9 negative-space" claim (I10/orphans should be
 *     unreachable from the real parser at all) with assertions written
 *     directly from the ADR's invariant text (§10), not from what the
 *     current implementation happens to output.
 *
 * Frozen production code (lib/, app/, prisma/schema.prisma) is read-only in
 * this audit - nothing here modifies it.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";

function build(documentId: string, text: string): { index: StructuralIndex; nodes: ReturnType<typeof parseDocumentStructure> } {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { index, nodes };
}

describe("Part 1 / new angle 1 - I14 at scale: byte-identical text in N documents parsed in ONE index construction call never cross-contaminates", () => {
  it("10 documents with byte-identical text (real, common in amendment packages that repeat boilerplate) each get fully independent, non-colliding nodeIds and children", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.
(a) Permitted Indebtedness of the first kind.
(b) Permitted Indebtedness of the second kind.

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment.
`.trim();
    const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
    for (let i = 0; i < 10; i++) {
      const documentId = `boilerplate-doc-${i}`;
      nodesByDocument.set(documentId, { text, nodes: parseDocumentStructure({ documentId, label: documentId, text }) });
    }
    const index = buildStructuralIndex(nodesByDocument, [], []);

    // I1/I14: every nodeId across all 10 documents must be globally unique, even though every document's own content (and therefore every charStart) is byte-identical to every other.
    const allNodes = index.allNodes();
    expect(allNodes).toHaveLength(10 * parseDocumentStructure({ documentId: "probe", label: "probe", text }).length);
    const idSet = new Set(allNodes.map((n) => n.nodeId));
    expect(idSet.size).toBe(allNodes.length);

    // I6: getChildren for document 3's "6.01" node must return ONLY document 3's own (a)/(b) - never document 5's, even though both physical occurrences have identical charStart/sectionRef/heading.
    const doc3Section = index.resolveUniqueNodeByRef("boilerplate-doc-3", "6.01");
    const doc5Section = index.resolveUniqueNodeByRef("boilerplate-doc-5", "6.01");
    expect(doc3Section.status).toBe("UNIQUE");
    expect(doc5Section.status).toBe("UNIQUE");
    if (doc3Section.status === "UNIQUE" && doc5Section.status === "UNIQUE") {
      const doc3Children = index.getChildren(doc3Section.node.nodeId);
      const doc5Children = index.getChildren(doc5Section.node.nodeId);
      expect(doc3Children).toHaveLength(2);
      expect(doc5Children).toHaveLength(2);
      expect(doc3Children.every((c) => c.documentId === "boilerplate-doc-3")).toBe(true);
      expect(doc5Children.every((c) => c.documentId === "boilerplate-doc-5")).toBe(true);
      // Cross-document child identity must never intersect.
      const doc3ChildIds = new Set(doc3Children.map((c) => c.nodeId));
      expect(doc5Children.some((c) => doc3ChildIds.has(c.nodeId))).toBe(false);
    }
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });
});

describe("Part 1 / new angle 2 - I6 via the REAL parser's own quoted-amendment collision (not hand-built nodes)", () => {
  it("getChildren on each of the two REAL physical '6.04' occurrences the parser itself produces never mixes the other occurrence's own lettered clauses", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except:
(a) an original distribution payable in additional equity;
(b) an original distribution to fund operating expenses.

Section 6.10 Amendments . Section 6.04 of this Agreement is hereby amended and restated in its entirety to read as follows:

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except:
(a) an AMENDED distribution payable in cash;
(b) an AMENDED distribution to fund capital expenditures;
(c) an AMENDED third exception with no counterpart in the original.
`.trim();
    const { index } = build("real-quoted-amendment-i6", text);
    const occurrences = index.findNodesByRef("real-quoted-amendment-i6", "6.04");
    expect(occurrences.length, "the real parser must actually produce 2 distinct physical '6.04' occurrences here, or this test is not exercising the intended scenario").toBe(2);

    const [first, second] = occurrences.sort((a, b) => a.charStart - b.charStart);
    const firstChildren = index.getChildren(first!.nodeId);
    const secondChildren = index.getChildren(second!.nodeId);

    // The ORIGINAL occurrence must show exactly its own 2 original clauses, with ORIGINAL text - never the amended occurrence's 3 clauses or their text.
    expect(firstChildren).toHaveLength(2);
    expect(firstChildren.every((c) => index.getNodeText(c.nodeId, "OWN").includes("original") || index.getNodeText(c.nodeId, "OWN").includes("an original"))).toBe(true);

    // The AMENDED occurrence must show exactly its own 3 amended clauses - never the original's 2.
    expect(secondChildren).toHaveLength(3);
    expect(secondChildren.every((c) => index.getNodeText(c.nodeId, "OWN").includes("AMENDED"))).toBe(true);

    // No child nodeId may appear in both lists (the exact cross-parent-merge defect the ADR names).
    const firstIds = new Set(firstChildren.map((c) => c.nodeId));
    expect(secondChildren.some((c) => firstIds.has(c.nodeId))).toBe(false);

    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });
});

describe("Part 1 / new angle 3 - I11 (cycle impossibility) stress-tested with real maximal-depth nested clauses, not a hand-built 2-node cycle", () => {
  it("a real section with a full a->i->A->1 nesting chain produces a strictly-increasing-depth ancestor chain with no cycle, at every depth", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except:
(a) Indebtedness incurred for the following purposes:
(i) working capital purposes, including:
(A) seasonal working capital needs, including:
(1) inventory financing needs.
`.trim();
    const { index } = build("real-deep-nesting-i11", text);
    const allNodes = index.allNodes();
    // Deepest node ("(1)") must have a strictly acyclic, strictly-shortening-toward-root ancestor chain.
    const deepest = allNodes.find((n) => n.sectionRef.endsWith("(1)"));
    expect(deepest, "the real clause-hierarchy parser must actually produce a 4-level-deep nested clause here").toBeDefined();
    const ancestors = index.getAncestors(deepest!.nodeId);
    // Root-to-parent order, closest ancestor last (per the index's own documented contract).
    expect(ancestors.length).toBeGreaterThanOrEqual(4); // SECTION, (a), (i), (A) at minimum.
    const ancestorIds = ancestors.map((a) => a.nodeId);
    expect(new Set(ancestorIds).size).toBe(ancestorIds.length); // no repeated ancestor - a cycle would repeat one.
    // Every ancestor's own charStart must be strictly less than the deepest node's charStart (a real physical enclosure, not a fabricated one).
    for (const a of ancestors) expect(a.charStart).toBeLessThan(deepest!.charStart);
    expect(index.healthDiagnostics().filter((f) => f.code === "CYCLE")).toHaveLength(0);
  });
});

describe("Part 1 / new angle 4 - I13 sibling ordering survives out-of-source-order REGEX MATCH ARRAY construction, not just out-of-order test-input arrays", () => {
  it("mixing decimal-style and bare-integer-style headings (matched by DIFFERENT pattern arrays, unioned and re-sorted) still yields charStart-ascending siblings", () => {
    // INTEGER_SECTION_PATTERNS and SECTION_PATTERNS are matched as separate
    // regex passes over the whole text and then concatenated BEFORE the
    // final sort in stage-structure.ts. This constructs a document where a
    // decimal-style section is interleaved with bare-integer sections so the
    // two pattern families' own match arrays are not already in document
    // order relative to each other before that sort runs - a genuine
    // construction-order stress the hand-ordered existing I13 test (which
    // only shuffles a single already-homogeneous node array) does not cover.
    const text = `
ARTICLE VI COVENANTS

Section 1 General Provisions . An integer-style heading with no decimal point.

Section 6.01 Indebtedness . A decimal-style heading interleaved between two integer-style ones.

Section 2 Specific Provisions . A second integer-style heading.
`.trim();
    const { index } = build("real-mixed-pattern-i13", text);
    const article = index.roots().find((n) => n.nodeType === "ARTICLE");
    expect(article).toBeDefined();
    const children = index.getChildren(article!.nodeId);
    const starts = children.map((c) => c.charStart);
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts, "I13: siblings from two different regex-pattern families must still come back charStart-ascending").toEqual(sorted);
    expect(index.healthDiagnostics().filter((f) => f.code === "SOURCE_ORDER_VIOLATION")).toHaveLength(0);
  });
});

describe("Part 1 / new angle 5 - the ADR's own I9/I10 negative-space claim: can the REAL parser ever actually produce an orphan?", () => {
  it("a battery of malformed-hierarchy real documents (no enclosing ARTICLE, no enclosing SECTION, mid-clause-sequence start) produces zero orphans - independently confirming (not assuming) the ADR's implicit claim that parentNodeId assignment can only ever be null-as-root or a real resolved ancestor, never null-as-dangling", () => {
    const documents = [
      "(a) a lettered clause with absolutely no ARTICLE or SECTION anywhere before it in the whole document.\n(b) a second one.",
      "Section 6.01 Indebtedness . text (i) a roman-numeral clause with no preceding (a) to open the level - starts mid-sequence.",
      "ARTICLE VI COVENANTS\n(a) a clause directly under an ARTICLE, skipping SECTION and SUBSECTION entirely.",
    ];
    for (const [i, text] of documents.entries()) {
      const { index } = build(`orphan-battery-${i}`, text);
      expect(index.orphans(), `document ${i} ("${text.slice(0, 40)}...") must produce zero orphans if the ADR's I9/I10 negative-space claim holds`).toHaveLength(0);
      expect(index.healthDiagnostics().filter((f) => f.code === "IMPOSSIBLE_PARENT")).toHaveLength(0);
    }
  });
});

describe("Part 1 / new angle 6 - I15 with THREE-way ambiguity (existing test only proves 2-way)", () => {
  it("resolveUniqueNodeByRef reports AMBIGUOUS with all 3 candidates, in document order, when three real physical occurrences share one legal reference", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . First real physical occurrence.

Section 6.10 Cross-Reference . As referenced in Section 6.04 Limitation on Distributions . above (a second occurrence via an in-text citation matching the same heading shape).

Section 6.20 Amendments . Section 6.04 of this Agreement is hereby amended and restated to read: Section 6.04 Limitation on Distributions . Third, amended physical occurrence.
`.trim();
    const { index } = build("real-triple-ambiguity-i15", text);
    const resolution = index.resolveUniqueNodeByRef("real-triple-ambiguity-i15", "6.04");
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status === "AMBIGUOUS") {
      expect(resolution.candidates.length, "this document must actually produce 3 real physical '6.04' occurrences, or this test is not exercising 3-way ambiguity").toBeGreaterThanOrEqual(3);
      const starts = resolution.candidates.map((c) => c.charStart);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(new Set(resolution.candidates.map((c) => c.nodeId)).size).toBe(resolution.candidates.length);
    }
    expect(index.getNodeByRef("real-triple-ambiguity-i15", "6.04")).toBeUndefined();
  });
});
