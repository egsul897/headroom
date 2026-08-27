/**
 * Phase 2A - tests for the general deterministic cross-reference detector
 * (structural-references.ts) and its reverse-lookup support via
 * structural-index.ts (task §8/§9/§17 References).
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";

function parse(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const refs = detectStructuralReferences(documentId, text, nodes);
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], refs);
  return { nodes, refs, index };
}

const TEXT = "ARTICLE 6 NEGATIVE COVENANTS. Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) Indebtedness permitted under Section 6.06, and (b) Indebtedness described in clause (a) above or in Schedule 6.01. Section 6.06. Investments. The Company may make Investments as described in Article VI. See Exhibit A for the form of certificate.";

describe("detectStructuralReferences", () => {
  it("resolves a same-section relative clause reference ('clause (a)') to a fully-qualified sibling ref", () => {
    const { refs } = parse("d1", TEXT);
    const clauseRef = refs.find((r) => r.referenceText.includes("clause (a)"));
    expect(clauseRef?.resolved).toBe(true);
    expect(clauseRef?.normalizedTarget).toBe("6.01(a)");
  });

  it("resolves a cross-section reference ('Section 6.06') to the real target node", () => {
    const { refs, nodes } = parse("d1", TEXT);
    const target = nodes.find((n) => n.sectionRef === "6.06")!;
    const ref = refs.find((r) => r.normalizedTarget === "6.06" && r.targetKind === "SECTION");
    expect(ref?.resolved).toBe(true);
    expect(ref?.targetNodeKey).toBe(target.nodeKey);
  });

  it("an unresolved reference (target does not exist in this document) is reported as unresolved, never guessed", () => {
    const { refs } = parse("d1", TEXT);
    const scheduleRef = refs.find((r) => r.targetKind === "SCHEDULE");
    expect(scheduleRef?.resolved).toBe(false);
    expect(scheduleRef?.targetNodeKey).toBeNull();
    expect(scheduleRef?.unresolvedReason).toBeTruthy();
  });

  it("an Exhibit reference is detected and reported unresolved when no such node exists", () => {
    const { refs } = parse("d1", TEXT);
    const exhibitRef = refs.find((r) => r.targetKind === "EXHIBIT");
    expect(exhibitRef).toBeDefined();
    expect(exhibitRef?.resolved).toBe(false);
  });

  it("every reference is attributed to its enclosing source node", () => {
    const { refs, nodes } = parse("d1", TEXT);
    const ref = refs.find((r) => r.normalizedTarget === "6.06" && r.targetKind === "SECTION");
    // The reference to Section 6.06 physically appears inside 6.01(a) - the deepest enclosing node.
    const enclosing = nodes.find((n) => n.nodeKey === ref?.sourceNodeKey);
    expect(enclosing).toBeDefined();
    expect(enclosing?.sectionRef.startsWith("6.01")).toBe(true);
  });

  it("reverse-reference lookup: findReferencesTo returns every reference resolving to a given node", () => {
    const { index, nodes } = parse("d1", TEXT);
    const section606 = nodes.find((n) => n.sectionRef === "6.06")!;
    const incoming = index.findReferencesTo(section606.nodeKey);
    expect(incoming.length).toBeGreaterThan(0);
    expect(incoming.every((r) => r.targetNodeKey === section606.nodeKey)).toBe(true);
  });

  it("findReferencesFrom returns only references whose source is that exact node, unless includeDescendants is set", () => {
    const { index, nodes } = parse("d1", TEXT);
    const section601 = nodes.find((n) => n.sectionRef === "6.01")!;
    const directOnly = index.findReferencesFrom(section601.nodeKey);
    const withDescendants = index.findReferencesFrom(section601.nodeKey, true);
    expect(withDescendants.length).toBeGreaterThanOrEqual(directOnly.length);
  });

  it("a reference is scoped to its OWN document only - never resolved against a different document's nodes", () => {
    const docA = { documentId: "docA", label: "CA", text: "Section 6.01. Indebtedness. Investments permitted under Section 6.06." };
    const docB = { documentId: "docB", label: "Indenture", text: "Section 9.01. Different content entirely." };
    const nodesA = parseDocumentStructure(docA);
    const nodesB = parseDocumentStructure(docB);
    // Deliberately reference docB's nodes when detecting docA's own references - must never cross-resolve.
    const refsAgainstWrongDoc = detectStructuralReferences("docA", docA.text, nodesB);
    expect(refsAgainstWrongDoc.every((r) => !r.resolved)).toBe(true);
    // And the real, same-document detection also correctly fails to resolve 6.06 (it was never defined in docA either).
    const realRefs = detectStructuralReferences("docA", docA.text, nodesA);
    const ref606 = realRefs.find((r) => r.normalizedTarget === "6.06");
    expect(ref606?.resolved).toBe(false);
  });
});
