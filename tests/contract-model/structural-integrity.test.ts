/**
 * Phase B — structural integrity contract tests (Hardening Initiative).
 * Each invariant: a violating input must produce a violation with
 * the right code, never a silently repaired parentage.
 */
import { describe, expect, it } from "vitest";
import {
  isRefDescendant,
  validateStructuralIntegrity,
} from "../../lib/contract-model/compiler/structural-integrity";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

function node(over: Partial<StructuralNode> & { nodeId: string }): StructuralNode {
  return {
    documentId: "doc-1",
    nodeType: "SECTION",
    heading: "Test",
    sectionRef: "7.01",
    nodeKey: "doc-1::7.01",
    charStart: 100,
    charEnd: 200,
    ordinal: 0,
    parentSectionRef: null,
    parentNodeId: null,
    ...over,
  };
}

describe("isRefDescendant", () => {
  it("article numeral matches section major (roman and arabic)", () => {
    expect(isRefDescendant("VII", "ARTICLE", "7.01")).toBe(true);
    expect(isRefDescendant("7", "ARTICLE", "7.01")).toBe(true);
    expect(isRefDescendant("VI", "ARTICLE", "7.01")).toBe(false);
    expect(isRefDescendant("V", "ARTICLE", "7.01")).toBe(false);
  });
  it("section is ancestor of its sub-clauses, not of siblings", () => {
    expect(isRefDescendant("7.01", "SECTION", "7.01(a)")).toBe(true);
    expect(isRefDescendant("7.01(a)", "SUBSECTION", "7.01(a)(i)")).toBe(true);
    expect(isRefDescendant("7.01", "SECTION", "7.02")).toBe(false);
    // String-prefix trap: "7.01" is a prefix of "7.011" but not its parent.
    expect(isRefDescendant("7.01", "SECTION", "7.011")).toBe(false);
    expect(isRefDescendant("7.01", "SECTION", "7.01")).toBe(false);
  });
  it("unparseable refs return null (not a verdict)", () => {
    expect(isRefDescendant("AMBIGUOUS", "ARTICLE", "7.01")).toBe(null);
    expect(isRefDescendant("VII", "ARTICLE", "SCHEDULE 1")).toBe(null);
  });
});

describe("validateStructuralIntegrity", () => {
  it("a well-formed hierarchy is valid", () => {
    const nodes = [
      node({ nodeId: "art", nodeType: "ARTICLE", sectionRef: "VII", heading: "Covenants", charStart: 0, charEnd: 1000 }),
      node({ nodeId: "sec", nodeType: "SECTION", sectionRef: "7.01", heading: "Liens", charStart: 10, charEnd: 500, parentNodeId: "art", parentSectionRef: "VII" }),
      node({ nodeId: "sub", nodeType: "SUBSECTION", sectionRef: "7.01(a)", heading: "", charStart: 20, charEnd: 100, parentNodeId: "sec", parentSectionRef: "7.01" }),
    ];
    expect(validateStructuralIntegrity(nodes, 1000).valid).toBe(true);
  });

  it("a child outside its parent span violates PARENT_CONTAINMENT", () => {
    const nodes = [
      node({ nodeId: "sec", nodeType: "SECTION", sectionRef: "6.03", heading: "Notices", charStart: 0, charEnd: 100, parentNodeId: "art", parentSectionRef: "VI" }),
      node({ nodeId: "art", nodeType: "ARTICLE", sectionRef: "VI", heading: "Covenants", charStart: 0, charEnd: 1000 }),
      // 7.01(a) parented to 6.03 but sitting outside 6.03's span (the Tenable failure).
      node({ nodeId: "sub", nodeType: "SUBSECTION", sectionRef: "7.01(a)", heading: "", charStart: 500, charEnd: 600, parentNodeId: "sec", parentSectionRef: "6.03" }),
    ];
    const result = validateStructuralIntegrity(nodes, 1000);
    expect(result.valid).toBe(false);
    expect(result.violations.map((v) => v.invariant)).toContain("PARENT_CONTAINMENT");
    expect(result.violations.map((v) => v.invariant)).toContain("REF_CONSISTENCY");
  });

  it("a dangling parent violates PARENT_EXISTS (never re-rooted)", () => {
    const nodes = [node({ nodeId: "a", parentNodeId: "missing" })];
    const result = validateStructuralIntegrity(nodes, 1000);
    expect(result.violations.map((v) => v.invariant)).toContain("PARENT_EXISTS");
  });

  it("a parent cycle violates ACYCLIC", () => {
    const nodes = [
      node({ nodeId: "a", sectionRef: "7.01", charStart: 0, charEnd: 500, parentNodeId: "b" }),
      node({ nodeId: "b", sectionRef: "7.01(a)", charStart: 10, charEnd: 400, parentNodeId: "a" }),
    ];
    expect(validateStructuralIntegrity(nodes, 1000).violations.map((v) => v.invariant)).toContain("ACYCLIC");
  });

  it("a cross-document parent violates SAME_SEGMENT", () => {
    const nodes = [
      node({ nodeId: "art", nodeType: "ARTICLE", sectionRef: "V", documentId: "doc-ca", charStart: 0, charEnd: 1000 }),
      node({ nodeId: "sec", sectionRef: "5.01", documentId: "doc-guaranty", charStart: 10, charEnd: 100, parentNodeId: "art" }),
    ];
    expect(validateStructuralIntegrity(nodes, 1000).violations.map((v) => v.invariant)).toContain("SAME_SEGMENT");
  });

  it("a section with no parent in a document with articles violates ROOT_VALIDITY", () => {
    const nodes = [
      node({ nodeId: "art", nodeType: "ARTICLE", sectionRef: "VII", charStart: 0, charEnd: 1000 }),
      node({ nodeId: "sec", sectionRef: "7.01", charStart: 10, charEnd: 100, parentNodeId: null }),
    ];
    expect(validateStructuralIntegrity(nodes, 1000).violations.map((v) => v.invariant)).toContain("ROOT_VALIDITY");
  });

  it("a section root in an article-less document is valid", () => {
    const nodes = [node({ nodeId: "sec", sectionRef: "1.01", charStart: 0, charEnd: 100, parentNodeId: null })];
    expect(validateStructuralIntegrity(nodes, 1000).valid).toBe(true);
  });

  it("invalid offsets and unsorted input violate", () => {
    const nodes = [
      node({ nodeId: "b", charStart: 500, charEnd: 400 }),
      node({ nodeId: "a", charStart: 100, charEnd: 200 }),
    ];
    const invariants = validateStructuralIntegrity(nodes, 1000).violations.map((v) => v.invariant);
    expect(invariants).toContain("OFFSETS_VALID");
    expect(invariants).toContain("SORTED");
  });

  it("two nodes sharing (document, type, charStart) violate OCCURRENCE_IDENTITY", () => {
    const nodes = [
      node({ nodeId: "a", charStart: 100, charEnd: 200 }),
      node({ nodeId: "b", sectionRef: "7.02", charStart: 100, charEnd: 300 }),
    ];
    expect(validateStructuralIntegrity(nodes, 1000).violations.map((v) => v.invariant)).toContain("OCCURRENCE_IDENTITY");
  });
});
