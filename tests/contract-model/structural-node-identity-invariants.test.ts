/**
 * Phase 3F.1.2 - mechanical tests for the 16 structural invariants
 * (docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md §10, I1-I16) that
 * buildStructuralIndex (lib/contract-model/compiler/structural-index.ts)
 * must uphold. Each test targets exactly one invariant, using directly
 * hand-constructed StructuralNode[] input (never the real parser) so a
 * violation can be deliberately synthesized where the real parser would
 * never produce one (I5 duplicate ids, I10 orphans, I11 cycles, I12
 * malformed spans) - this is the "verified rather than assumed" defensive
 * layer the ADR's own construction-time health pass is meant to prove,
 * not merely a happy-path re-check of what the parser already guarantees.
 *
 * Complements (does not duplicate) tests/contract-model/structural-index.test.ts
 * (parser + navigation happy-path coverage) and
 * structural-node-identity-property.test.ts (adversarial synthetic
 * documents run through the real parser).
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex, type StructuralHealthFinding } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import { computeStableKey } from "../../lib/contract-model/stable-keys";

const DOC = "invariant-doc";

function mintNodeId(documentId: string, nodeType: string, charStart: number): string {
  return computeStableKey("structural-node", documentId, nodeType, String(charStart));
}

/** Builds a fully-specified StructuralNode with sensible defaults; every field can be overridden to synthesize a deliberately malformed case. */
function node(overrides: Partial<StructuralNode> & { documentId?: string; nodeType?: StructuralNode["nodeType"]; charStart: number; charEnd: number; sectionRef: string; parentNodeId?: string | null }): StructuralNode {
  const documentId = overrides.documentId ?? DOC;
  const nodeType = overrides.nodeType ?? "SECTION";
  const nodeId = overrides.nodeId ?? mintNodeId(documentId, nodeType, overrides.charStart);
  return {
    documentId,
    nodeType,
    heading: overrides.heading ?? overrides.sectionRef,
    sectionRef: overrides.sectionRef,
    nodeKey: overrides.nodeKey ?? `${documentId}::${overrides.sectionRef}`,
    nodeId,
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    ordinal: overrides.ordinal ?? 0,
    parentSectionRef: overrides.parentSectionRef ?? null,
    parentNodeId: overrides.parentNodeId ?? null,
  };
}

function buildIndex(nodes: StructuralNode[], text = "x".repeat(10000)) {
  return buildStructuralIndex(new Map([[DOC, { text, nodes }]]), [], []);
}

function findings(index: ReturnType<typeof buildIndex>, code: string): StructuralHealthFinding[] {
  return index.healthDiagnostics().filter((f) => f.code === code);
}

describe("I1 - no two source occurrences share nodeId within one document", () => {
  it("distinct physical occurrences (different charStart) always get distinct nodeIds", () => {
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const b = node({ sectionRef: "6.04", charStart: 200, charEnd: 210 });
    expect(a.nodeId).not.toBe(b.nodeId);
    const index = buildIndex([a, b]);
    expect(index.allNodes()).toHaveLength(2);
    expect(index.getNodeById(a.nodeId)?.charStart).toBe(100);
    expect(index.getNodeById(b.nodeId)?.charStart).toBe(200);
  });

  it("a genuine construction-time nodeId collision is detected as DUPLICATE_OCCURRENCE_ID, never silently indexed twice", () => {
    // Synthesizes what should be structurally impossible under real minting (same nodeType+charStart forced to share one id).
    const collidedId = mintNodeId(DOC, "SECTION", 100);
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110, nodeId: collidedId });
    const b = node({ sectionRef: "6.99", charStart: 100, charEnd: 130, nodeId: collidedId });
    const index = buildIndex([a, b]);
    expect(index.allNodes()).toHaveLength(1); // second occurrence NOT inserted - no silent overwrite (I5).
    const dupFindings = findings(index, "DUPLICATE_OCCURRENCE_ID");
    expect(dupFindings).toHaveLength(1);
    expect(dupFindings[0]!.severity).toBe("ERROR");
  });
});

describe("I2 - duplicate sectionRef/label values are allowed and expected", () => {
  it("two distinct occurrences sharing a legal reference both remain indexed, only flagged INFO", () => {
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const b = node({ sectionRef: "6.04", charStart: 500, charEnd: 510 });
    const index = buildIndex([a, b]);
    expect(index.allNodes()).toHaveLength(2);
    const dupLabel = findings(index, "DUPLICATE_LABEL_EXPECTED");
    expect(dupLabel).toHaveLength(1);
    expect(dupLabel[0]!.severity).toBe("INFO");
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });
});

describe("I3 - duplicate legal-reference candidates are represented as a set, never collapsed to one", () => {
  it("findNodesByRef returns every physical occurrence sharing a reference, in document order", () => {
    const a = node({ sectionRef: "6.04", charStart: 500, charEnd: 510 });
    const b = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const c = node({ sectionRef: "6.04", charStart: 300, charEnd: 310 });
    const index = buildIndex([a, b, c]);
    const matches = index.findNodesByRef(DOC, "6.04");
    expect(matches.map((m) => m.charStart)).toEqual([100, 300, 500]); // document order, not insertion order.
  });
});

describe("I4/I6 - parent-child ownership uses occurrence identity, never label; no cross-occurrence child-list merging", () => {
  it("getChildren(parentNodeId) returns only children owned by that exact physical parent occurrence", () => {
    const parentA = node({ sectionRef: "6.06", charStart: 0, charEnd: 400 });
    const parentB = node({ sectionRef: "6.06", charStart: 500, charEnd: 900 }); // same label, different physical occurrence.
    const childOfA = node({ sectionRef: "6.06(a)", nodeType: "SUBSECTION", charStart: 50, charEnd: 60, parentNodeId: parentA.nodeId });
    const childOfB = node({ sectionRef: "6.06(a)", nodeType: "SUBSECTION", charStart: 550, charEnd: 560, parentNodeId: parentB.nodeId });
    const index = buildIndex([parentA, parentB, childOfA, childOfB]);
    expect(index.getChildren(parentA.nodeId).map((c) => c.charStart)).toEqual([50]);
    expect(index.getChildren(parentB.nodeId).map((c) => c.charStart)).toEqual([550]);
  });
});

describe("I5 - no silent map overwrite on identity collision", () => {
  it("the first-seen occurrence remains authoritative and queryable after a collision, not the last", () => {
    const collidedId = mintNodeId(DOC, "SECTION", 100);
    const first = node({ sectionRef: "6.04", charStart: 100, charEnd: 110, nodeId: collidedId });
    const second = node({ sectionRef: "6.99", charStart: 100, charEnd: 999, nodeId: collidedId });
    const index = buildIndex([first, second]);
    expect(index.getNodeById(collidedId)?.sectionRef).toBe("6.04"); // first-seen, not last-write-wins.
  });
});

describe("I7 - every indexed node is retrievable by nodeId", () => {
  it("getNodeById never returns undefined for a nodeId present in allNodes()", () => {
    const nodes = [node({ sectionRef: "6.01", charStart: 0, charEnd: 100 }), node({ sectionRef: "6.02", charStart: 200, charEnd: 300 }), node({ sectionRef: "6.03", charStart: 400, charEnd: 500 })];
    const index = buildIndex(nodes);
    for (const n of index.allNodes()) {
      expect(index.getNodeById(n.nodeId)).toBeDefined();
      expect(index.getNodeById(n.nodeId)!.nodeId).toBe(n.nodeId);
    }
  });
});

describe("I8 - own-text boundary only ever consults the node's own (occurrence-correct) children", () => {
  it("getNodeText(nodeId, 'OWN') truncates at the FIRST child of the SAME physical parent, ignoring a same-labeled other occurrence's children", () => {
    const text = "0123456789".repeat(100); // 1000 chars, content irrelevant - only offsets matter.
    const parentA = node({ sectionRef: "6.06", charStart: 0, charEnd: 400 });
    const parentB = node({ sectionRef: "6.06", charStart: 500, charEnd: 900 });
    const childOfB = node({ sectionRef: "6.06(a)", nodeType: "SUBSECTION", charStart: 550, charEnd: 560, parentNodeId: parentB.nodeId });
    const index = buildIndex([parentA, parentB, childOfB], text);
    // parentA has no children of its own (childOfB belongs to parentB) - its OWN text must run its full span, not truncate early at childOfB's charStart.
    expect(index.getNodeText(parentA.nodeId, "OWN")).toBe(text.slice(0, 400));
    expect(index.getNodeText(parentB.nodeId, "OWN")).toBe(text.slice(500, 550)); // truncates at its OWN child.
  });
});

describe("I9 - every indexed node is reachable via traversal from its intended root, except explicit orphans", () => {
  it("every non-orphan node appears exactly once among roots()+every root's getDescendants()", () => {
    const root = node({ sectionRef: "VI", nodeType: "ARTICLE", charStart: 0, charEnd: 1000 });
    const section = node({ sectionRef: "6.01", charStart: 10, charEnd: 500, parentNodeId: root.nodeId });
    const sub = node({ sectionRef: "6.01(a)", nodeType: "SUBSECTION", charStart: 20, charEnd: 100, parentNodeId: section.nodeId });
    const index = buildIndex([root, section, sub]);
    const reached = new Set<string>();
    for (const r of index.roots()) {
      reached.add(r.nodeId);
      for (const d of index.getDescendants(r.nodeId)) reached.add(d.nodeId);
    }
    expect(reached.size).toBe(index.allNodes().length);
    expect([...reached].sort()).toEqual(index.allNodes().map((n) => n.nodeId).sort());
  });
});

describe("I10 - orphaned nodes (unresolvable parent) are explicit, never silently re-rooted or dropped", () => {
  it("a node whose declared parentNodeId does not resolve appears in orphans() and IMPOSSIBLE_PARENT health, but stays in allNodes()", () => {
    const orphan = node({ sectionRef: "6.04(a)", nodeType: "SUBSECTION", charStart: 100, charEnd: 110, parentNodeId: "structural-node:does-not-exist" });
    const index = buildIndex([orphan]);
    expect(index.allNodes()).toHaveLength(1); // never dropped.
    expect(index.orphans().map((o) => o.nodeId)).toEqual([orphan.nodeId]);
    const impossibleParent = findings(index, "IMPOSSIBLE_PARENT");
    expect(impossibleParent).toHaveLength(1);
    expect(impossibleParent[0]!.severity).toBe("ERROR");
    // an orphan is never silently re-rooted: it does not appear in roots() (parentNodeId is non-null) and its intended parent never claims it as a child.
    expect(index.roots().map((r) => r.nodeId)).not.toContain(orphan.nodeId);
  });
});

describe("I11 - cycles are impossible by construction, and explicitly detected if synthesized", () => {
  it("a synthesized 2-node parent cycle is detected as a CYCLE finding, and traversal never infinite-loops", () => {
    const idA = mintNodeId(DOC, "SECTION", 0);
    const idB = mintNodeId(DOC, "SECTION", 100);
    const a = node({ sectionRef: "6.01", charStart: 0, charEnd: 50, nodeId: idA, parentNodeId: idB });
    const b = node({ sectionRef: "6.02", charStart: 100, charEnd: 150, nodeId: idB, parentNodeId: idA });
    const index = buildIndex([a, b]);
    const cycleFindings = findings(index, "CYCLE");
    expect(cycleFindings.length).toBeGreaterThan(0);
    expect(cycleFindings.every((f) => f.severity === "ERROR")).toBe(true);
    // getAncestors must terminate (guarded) rather than infinite-loop on a cyclic parent chain.
    expect(() => index.getAncestors(idA)).not.toThrow();
    expect(index.getAncestors(idA).length).toBeLessThan(10);
  });
});

describe("I12 - source spans satisfy deterministic validity checks", () => {
  it("charStart >= charEnd is flagged INVALID_SOURCE_SPAN", () => {
    const bad = node({ sectionRef: "6.01", charStart: 100, charEnd: 100 });
    const index = buildIndex([bad]);
    expect(findings(index, "INVALID_SOURCE_SPAN").length).toBeGreaterThan(0);
  });

  it("charEnd exceeding document text length is flagged INVALID_SOURCE_SPAN", () => {
    const bad = node({ sectionRef: "6.01", charStart: 0, charEnd: 99999 });
    const index = buildIndex([bad], "short text");
    expect(findings(index, "INVALID_SOURCE_SPAN").length).toBeGreaterThan(0);
  });

  it("a child span not nested inside its parent's span is flagged OVERLAPPING_INCOMPATIBLE_SPAN", () => {
    const parent = node({ sectionRef: "6.01", charStart: 100, charEnd: 200 });
    const escapingChild = node({ sectionRef: "6.01(a)", nodeType: "SUBSECTION", charStart: 150, charEnd: 500, parentNodeId: parent.nodeId }); // charEnd beyond parent's own charEnd.
    const index = buildIndex([parent, escapingChild], "x".repeat(10000));
    const overlap = findings(index, "OVERLAPPING_INCOMPATIBLE_SPAN");
    expect(overlap).toHaveLength(1);
    expect(overlap[0]!.severity).toBe("ERROR");
  });

  it("a properly-nested child span produces no OVERLAPPING_INCOMPATIBLE_SPAN finding", () => {
    const parent = node({ sectionRef: "6.01", charStart: 100, charEnd: 200 });
    const child = node({ sectionRef: "6.01(a)", nodeType: "SUBSECTION", charStart: 120, charEnd: 150, parentNodeId: parent.nodeId });
    const index = buildIndex([parent, child]);
    expect(findings(index, "OVERLAPPING_INCOMPATIBLE_SPAN")).toHaveLength(0);
  });
});

describe("I13 - sibling ordering is source order (charStart ascending)", () => {
  it("getChildren returns children in charStart order regardless of construction-array order", () => {
    const parent = node({ sectionRef: "6.01", charStart: 0, charEnd: 1000 });
    const c = node({ sectionRef: "6.01(c)", nodeType: "SUBSECTION", charStart: 300, charEnd: 310, parentNodeId: parent.nodeId });
    const a = node({ sectionRef: "6.01(a)", nodeType: "SUBSECTION", charStart: 100, charEnd: 110, parentNodeId: parent.nodeId });
    const b = node({ sectionRef: "6.01(b)", nodeType: "SUBSECTION", charStart: 200, charEnd: 210, parentNodeId: parent.nodeId });
    const index = buildIndex([parent, c, a, b]); // deliberately out-of-order construction input.
    expect(index.getChildren(parent.nodeId).map((n) => n.sectionRef)).toEqual(["6.01(a)", "6.01(b)", "6.01(c)"]);
  });
});

describe("I14 - document boundary is part of the identity domain", () => {
  it("nodeId is never comparable across two different documentIds - same label/offsets in two documents never collide", () => {
    const nodeInDocA = node({ documentId: "doc-A", sectionRef: "6.01", charStart: 100, charEnd: 200 });
    const nodeInDocB = node({ documentId: "doc-B", sectionRef: "6.01", charStart: 100, charEnd: 200 }); // identical type+charStart, different document.
    expect(nodeInDocA.nodeId).not.toBe(nodeInDocB.nodeId);
    const index = buildStructuralIndex(
      new Map([
        ["doc-A", { text: "x".repeat(1000), nodes: [nodeInDocA] }],
        ["doc-B", { text: "x".repeat(1000), nodes: [nodeInDocB] }],
      ]),
      [],
      []
    );
    expect(index.allNodes()).toHaveLength(2);
    expect(index.getNodeById(nodeInDocA.nodeId)?.documentId).toBe("doc-A");
    expect(index.getNodeById(nodeInDocB.nodeId)?.documentId).toBe("doc-B");
  });

  it("a parent occurrence from a different document is flagged CROSS_DOCUMENT_PARENT, never silently linked", () => {
    const parentInOtherDoc = node({ documentId: "doc-OTHER", sectionRef: "VI", nodeType: "ARTICLE", charStart: 0, charEnd: 5000 });
    const childHere = node({ documentId: DOC, sectionRef: "6.01", charStart: 10, charEnd: 100, parentNodeId: parentInOtherDoc.nodeId });
    const index = buildStructuralIndex(
      new Map([
        ["doc-OTHER", { text: "x".repeat(5000), nodes: [parentInOtherDoc] }],
        [DOC, { text: "x".repeat(1000), nodes: [childHere] }],
      ]),
      [],
      []
    );
    const cross = findings(index, "CROSS_DOCUMENT_PARENT");
    expect(cross).toHaveLength(1);
    expect(cross[0]!.severity).toBe("ERROR");
  });
});

describe("I15 - ambiguous legal-reference lookups return multiple candidates, never a silent pick", () => {
  it("resolveUniqueNodeByRef reports AMBIGUOUS with all candidates when >1 occurrence shares a reference", () => {
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const b = node({ sectionRef: "6.04", charStart: 500, charEnd: 510 });
    const index = buildIndex([a, b]);
    const resolution = index.resolveUniqueNodeByRef(DOC, "6.04");
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status === "AMBIGUOUS") expect(resolution.candidates.map((c) => c.charStart).sort((x, y) => x - y)).toEqual([100, 500]);
  });

  it("resolveUniqueNodeByRef reports UNIQUE for an unambiguous reference and NOT_FOUND for a missing one", () => {
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const index = buildIndex([a]);
    const unique = index.resolveUniqueNodeByRef(DOC, "6.04");
    expect(unique.status).toBe("UNIQUE");
    const missing = index.resolveUniqueNodeByRef(DOC, "9.99");
    expect(missing.status).toBe("NOT_FOUND");
  });

  it("the deprecated getNodeByRef shim is safe-by-omission: undefined on AMBIGUOUS, never an arbitrary pick", () => {
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const b = node({ sectionRef: "6.04", charStart: 500, charEnd: 510 });
    const index = buildIndex([a, b]);
    expect(index.getNodeByRef(DOC, "6.04")).toBeUndefined();
  });
});

describe("I16 - structural-health diagnostics surface every invariant violation as a named, queryable condition", () => {
  it("a healthy index (no violations) produces zero ERROR findings", () => {
    const parent = node({ sectionRef: "6.01", charStart: 0, charEnd: 200 });
    const child = node({ sectionRef: "6.01(a)", nodeType: "SUBSECTION", charStart: 50, charEnd: 100, parentNodeId: parent.nodeId });
    const index = buildIndex([parent, child]);
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });

  it("INFO-severity findings (DUPLICATE_LABEL_EXPECTED/AMBIGUOUS_LEGAL_REFERENCE/DUPLICATE_NORMALIZED_PATH) never gate - only I1/I5/I6/I7/I9/I10/I11/I12/I14 violations are ERROR-severity", () => {
    const a = node({ sectionRef: "6.04", charStart: 100, charEnd: 110 });
    const b = node({ sectionRef: "6.04", charStart: 500, charEnd: 510 });
    const index = buildIndex([a, b]);
    const infoFindings = index.healthDiagnostics().filter((f) => f.severity === "INFO");
    expect(infoFindings.length).toBeGreaterThan(0);
    expect(infoFindings.every((f) => ["DUPLICATE_LABEL_EXPECTED", "AMBIGUOUS_LEGAL_REFERENCE", "DUPLICATE_NORMALIZED_PATH"].includes(f.code))).toBe(true);
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });

  it("every finding names the affected document and (where applicable) node", () => {
    const orphan = node({ sectionRef: "6.04(a)", nodeType: "SUBSECTION", charStart: 100, charEnd: 110, parentNodeId: "structural-node:missing" });
    const index = buildIndex([orphan]);
    for (const f of index.healthDiagnostics()) {
      expect(f.documentId).toBeTruthy();
      expect(f.code).toBeTruthy();
      expect(f.severity === "ERROR" || f.severity === "INFO").toBe(true);
    }
  });
});
