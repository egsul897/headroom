/**
 * Phase 2A - tests for the nested-clause marker parser itself
 * (clause-hierarchy.ts), independent of the full structural index. All text
 * is invented/synthetic - never FWRG/LSB-specific.
 */
import { describe, expect, it } from "vitest";
import { buildClauseTree } from "../../lib/contract-model/compiler/clause-hierarchy";

describe("buildClauseTree", () => {
  it("parses a flat lettered list as SUBSECTION siblings", () => {
    const tree = buildClauseTree("except: (a) first; (b) second; (c) third.");
    expect(tree.map((n) => n.marker)).toEqual(["(a)", "(b)", "(c)"]);
    expect(tree.every((n) => n.nodeType === "SUBSECTION" && n.parentMarkerPath.length === 0)).toBe(true);
  });

  it("nests roman-numeral CLAUSE items under their opening SUBSECTION", () => {
    const tree = buildClauseTree("(a) outer text; (b) container: (i) first sub, and (ii) second sub; (c) trailing.");
    const b = tree.find((n) => n.marker === "(b)")!;
    const i = tree.find((n) => n.marker === "(i)")!;
    const ii = tree.find((n) => n.marker === "(ii)")!;
    const c = tree.find((n) => n.marker === "(c)")!;
    expect(b.nodeType).toBe("SUBSECTION");
    expect(i.nodeType).toBe("CLAUSE");
    expect(i.parentMarkerPath).toEqual(["(b)"]);
    expect(ii.parentMarkerPath).toEqual(["(b)"]);
    expect(c.parentMarkerPath).toEqual([]); // (c) returns to the top level, not nested under (b).
  });

  it("nests uppercase-letter and numeric SUBCLAUSE items under a CLAUSE", () => {
    const tree = buildClauseTree("(a) container: (i) sub: (A) deepest one; (B) deepest two; and (ii) second sub: (1) numeric one; (2) numeric two.");
    const A = tree.find((n) => n.marker === "(A)")!;
    const one = tree.find((n) => n.marker === "(1)")!;
    expect(A.nodeType).toBe("SUBCLAUSE");
    expect(A.parentMarkerPath).toEqual(["(a)", "(i)"]);
    expect(one.nodeType).toBe("SUBCLAUSE");
    expect(one.parentMarkerPath).toEqual(["(a)", "(ii)"]);
  });

  it("resolves the genuine i/roman ambiguity by preferring continuation of an already-open lettered sequence (documented convention)", () => {
    const tree = buildClauseTree("(a) x; (b) x; (c) x; (d) x; (e) x; (f) x; (g) x; (h) x; (i) x; (j) x.");
    expect(tree.map((n) => n.marker)).toEqual(["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "(j)"]);
    expect(tree.every((n) => n.nodeType === "SUBSECTION")).toBe(true);
  });

  it("direct-nesting with only a space (no punctuation) between parent and child marker, e.g. '(d) (i)', is recognized", () => {
    const tree = buildClauseTree("(a) reserved; (b) reserved; (c) reserved; (d) (i) first nested; and (ii) second nested; (e) trailing.");
    const i = tree.find((n) => n.marker === "(i)")!;
    expect(i.parentMarkerPath).toEqual(["(d)"]);
  });

  it("does not treat an incidental parenthetical as a clause marker", () => {
    const tree = buildClauseTree("(a) first; this includes (the foregoing) and (other items); (b) second.");
    expect(tree.map((n) => n.marker)).toEqual(["(a)", "(b)"]);
  });

  it("does not treat a compound citation like 'Section 6.01(a)(i)' (no space before the parens) as clause-marker occurrences", () => {
    const tree = buildClauseTree("(a) first. Reference to Section 6.01(a)(i) elsewhere does not create nodes. (b) second.");
    expect(tree.map((n) => n.marker)).toEqual(["(a)", "(b)"]);
  });

  it("an unrelated leaf item (no children) does not create ambiguity for a sibling container with real children", () => {
    const tree = buildClauseTree("(a) container: (i) child one; and (ii) child two; (b) plain leaf item, no nested list.");
    const b = tree.find((n) => n.marker === "(b)")!;
    expect(b.nodeType).toBe("SUBSECTION");
    expect(tree.filter((n) => n.depth === 2)).toHaveLength(2);
  });
});
