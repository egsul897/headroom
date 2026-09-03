/**
 * Phase 3 Chewy remediation F-2 - a local label such as (a), (b), (1), (A) does not determine structural
 * level by itself. Regression matrix A-J over buildClauseTree (synthetic text) plus the exact Chewy Section
 * 6.08 regression through the real structure stage. Zero paid calls.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { buildClauseTree, findRawMarkerOccurrences, hasHangingParagraph, isInlineReferenceMarker } from "../../lib/contract-model/compiler/clause-hierarchy";
import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";

const refs = (text: string) => buildClauseTree(text).map((n) => [...n.parentMarkerPath, n.marker].join(""));
const NESTED = "(a) The Borrower shall not: (i) declare any dividend; (ii) purchase any stock; or (iii) make any Investment,\n\n(the foregoing being Restricted Payments), unless at the time of such payment:\n\n(1) [reserved];\n\n(2) [reserved]; and\n\n(3) such payment, together with all other payments (the amounts in clauses (a) through (c) below being the Available Amount), is less than the sum of:\n\n(a) 50% of Consolidated Net Income; plus\n\n(b) 100% of cash proceeds; plus\n\n(c) the amount of any Investment returned.\n\n";

describe("F-2 mechanism 1 - inline references and spelled numerals are not labels (legal numbering grammar)", () => {
  it("skips 'clauses (i) through (iv) above', 'this clause (b)', 'paragraph (c) of this Section' and 'sixty (60) days'", () => {
    const text = "(a) first item as described in clauses (i) through (iv) above and this clause\n(b) shall not include anything; paragraph (c) of this Section applies within sixty (60) days; (b) second item.";
    expect(refs(text)).toEqual(["(a)", "(b)"]);
    const occ = findRawMarkerOccurrences(text);
    expect(occ.filter((o) => isInlineReferenceMarker(text, o)).map((o) => o.token)).toEqual(["i", "iv", "b", "c", "60"]);
  });
  it("E/F: ordinary flat lettered and numbered lists are unchanged", () => {
    expect(refs("(a) one; (b) two; (c) three.")).toEqual(["(a)", "(b)", "(c)"]);
    expect(refs("(1) one; (2) two; (3) three.")).toEqual(["(1)", "(2)", "(3)"]);
    expect(buildClauseTree("(1) one; (2) two; (3) three.").every((n) => n.nodeType === "SUBSECTION")).toBe(true);
  });
});

describe("F-2 mechanism 2 - a new label family after a hanging paragraph attaches to the enclosing level", () => {
  it("A: outer (a) -> numbered (1)-(3) -> inner (a)-(c) stays nested beneath (3), never promoted to the outer lettered level", () => {
    const r = refs(NESTED);
    expect(r).toContain("(a)(1)");
    expect(r).toContain("(a)(3)");
    expect(r).toContain("(a)(3)(a)");
    expect(r).toContain("(a)(3)(b)");
    expect(r).toContain("(a)(3)(c)");
    expect(r.filter((x) => /^\([a-z]\)$/.test(x))).toEqual(["(a)"]);
  });
  it("B: the same structure followed by a true outer (b) still detects the outer subsection transition", () => {
    const text = NESTED + "(b) The foregoing shall not prohibit:\n\n(1) the payment of any dividend within 60 days of declaration;\n\n(2) the redemption of Equity Interests.";
    const r = refs(text);
    expect(r).toContain("(b)");
    expect(r).toContain("(b)(1)");
    expect(r).toContain("(b)(2)");
    expect(r.filter((x) => /^\([a-z]\)$/.test(x))).toEqual(["(a)", "(b)"]);
    expect(buildClauseTree(text).find((n) => n.marker === "(b)" && n.parentMarkerPath.length === 0)?.nodeType).toBe("SUBSECTION");
  });
  it("C: a nested uppercase list (A)-(C) beneath a numbered clause stays beneath it", () => {
    const text = "(a) container:\n\n(1) first: (A) alpha; (B) beta; and (C) gamma; and\n\n(2) second.";
    const r = refs(text);
    expect(r).toEqual(["(a)", "(a)(1)", "(a)(1)(A)", "(a)(1)(B)", "(a)(1)(C)", "(a)(2)"]);
  });
  it("D: numbered children that follow nested letter children continue the numbered list at the correct level", () => {
    const r = refs(NESTED + "(4) any other amount.\n\n");
    expect(r).toContain("(a)(4)");
    expect(r.indexOf("(a)(4)")).toBeGreaterThan(r.indexOf("(a)(3)(c)"));
  });
  it("G: deeper mixed hierarchy (a) -> (1) -> (A) -> (i) is preserved by the existing grammar", () => {
    const text = "(a) outer: (1) first: (A) deep: (i) deepest one; (ii) deepest two; (B) next; (2) second.";
    expect(refs(text)).toEqual(["(a)", "(a)(1)", "(a)(1)(A)", "(a)(1)(A)(i)", "(a)(1)(A)(ii)", "(a)(1)(B)", "(a)(2)"]);
  });
  it("a continuation of the innermost list after a two-paragraph item is NOT affected (only a NEW family re-attaches)", () => {
    const text = "(a) outer:\n\n(i) first paragraph of item one.\n\nSecond paragraph of item one.\n\n(ii) item two.";
    expect(refs(text)).toEqual(["(a)", "(a)(i)", "(a)(ii)"]);
  });
  it("hasHangingParagraph ignores page-marker lines and the next label itself", () => {
    const text = "(i) item;\n\n-142-\n\n(ii) next";
    const labels = new Set(findRawMarkerOccurrences(text).map((o) => o.charStart));
    expect(hasHangingParagraph(text, 3, text.indexOf("(ii)"), (p) => labels.has(p))).toBe(false);
    const text2 = "(i) item,\n\n(the foregoing being defined terms), unless:\n\n(1) x";
    const labels2 = new Set(findRawMarkerOccurrences(text2).map((o) => o.charStart));
    expect(hasHangingParagraph(text2, 3, text2.indexOf("(1)"), (p) => labels2.has(p))).toBe(true);
  });
});

describe("F-2 mechanism 3 - a label continues the nearest open list of its family; inline enumeration never re-opens a distant outer subsection", () => {
  it("'(2) (a) the redemption ..., (b) the declaration ... and (c) if ...' keeps (c) inline instead of creating a false outer subsection (c)", () => {
    const text = "(a) first;\n\n(b) The foregoing shall not prohibit:\n\n(1) the payment of any dividend;\n\n(2) (a) the redemption of Treasury Capital Stock, (b) the declaration of dividends and (c) if immediately prior to the retirement, the payment thereof; and\n\n(3) the prepayment of Subordinated Indebtedness.";
    const r = refs(text);
    expect(r.filter((x) => /^\([a-z]\)$/.test(x))).toEqual(["(a)", "(b)"]);
    expect(r).toContain("(b)(3)");
  });
  it("a genuine outer item separated by ';' still resumes the outer list across nested levels, even on one line (flattened text)", () => {
    const text = "(a) first: (i) sub: (A) deep; (B) deep two; (ii) sub two; (b) second; (c) third.";
    const r = refs(text);
    expect(r.filter((x) => /^\([a-z]\)$/.test(x))).toEqual(["(a)", "(b)", "(c)"]);
  });
  it("'; and (c)' is list punctuation, not inline enumeration", () => {
    const text = "(a) first: (i) sub: (A) deep; (B) deep two; and (ii) sub two; and (b) second.";
    expect(refs(text).filter((x) => /^\([a-z]\)$/.test(x))).toEqual(["(a)", "(b)"]);
  });
});

describe("F-2 I/J - identity and determinism", () => {
  it("I: no duplicate sibling refs and no source-ref collisions in the nested fixture", () => {
    const r = refs(NESTED + "(b) The foregoing shall not prohibit: (1) x; (2) y.");
    expect(new Set(r).size).toBe(r.length);
  });
  it("J: parsing is deterministic and offsets are preserved across runs", () => {
    const a = buildClauseTree(NESTED);
    const b = buildClauseTree(NESTED);
    expect(a).toEqual(b);
    expect(a.every((n) => NESTED.slice(n.charStart, n.markerCharEnd) === n.marker)).toBe(true);
  });
});

const CHEWY = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
(existsSync(CHEWY) ? describe : describe.skip)("F-2 H - Chewy Section 6.08 exact regression (real committed fixture, structure stage, zero paid calls)", () => {
  const text = readFileSync(CHEWY, "utf-8");
  const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
  const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08" && n.charStart > 8980)[0]!;
  const inside = nodes.filter((n) => n.nodeType !== "SECTION" && n.charStart >= section.charStart && n.charStart < section.charEnd);
  const byRef = new Map(inside.map((n) => [n.sectionRef, n]));
  it("6.08 has exactly two real subsections, (a) and (b), and no false 6.08(c)..(i) from the Available Amount builder", () => {
    expect(inside.filter((n) => n.nodeType === "SUBSECTION").map((n) => n.sectionRef)).toEqual(["6.08(a)", "6.08(b)"]);
  });
  it("6.08(a)(3) is a numbered child of (a) and the builder items (a)-(i) are its children", () => {
    expect(byRef.get("6.08(a)(3)")?.parentNodeId).toBe(byRef.get("6.08(a)")?.nodeId);
    for (const l of ["a", "b", "c", "d", "e", "f", "g", "h", "i"]) expect(byRef.get(`6.08(a)(3)(${l})`)?.parentNodeId).toBe(byRef.get("6.08(a)(3)")?.nodeId);
    expect(text.slice(byRef.get("6.08(a)(3)(a)")!.charStart, byRef.get("6.08(a)(3)(a)")!.charStart + 30)).toMatch(/^\(a\) the greater of \(x\) 50%/);
  });
  it("the real 6.08(b) is 6.08(b) and its children are 6.08(b)(1)..(27) with 6.08(b)(12) anchoring the general basket text", () => {
    const b = byRef.get("6.08(b)")!;
    expect(text.slice(b.charStart, b.charStart + 40)).toMatch(/^\(b\) The foregoing provisions of Section/);
    for (let i = 1; i <= 27; i++) expect(byRef.get(`6.08(b)(${i})`)?.parentNodeId).toBe(b.nodeId);
    expect(text.slice(byRef.get("6.08(b)(12)")!.charStart, byRef.get("6.08(b)(12)")!.charEnd)).toMatch(/\$720\.0 million/);
    expect(inside.some((n) => n.sectionRef.startsWith("6.08(i)"))).toBe(false);
  });
  it("identity invariants hold across the whole document: unique nodeIds, valid containing parents, deterministic reparse", () => {
    expect(new Set(nodes.map((n) => n.nodeId)).size).toBe(nodes.length);
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    for (const n of nodes) if (n.parentNodeId) { const p = byId.get(n.parentNodeId)!; expect(p.charStart <= n.charStart && n.charEnd <= p.charEnd).toBe(true); }
    const again = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
    expect(again.map((n) => [n.nodeId, n.sectionRef, n.charStart, n.charEnd])).toEqual(nodes.map((n) => [n.nodeId, n.sectionRef, n.charStart, n.charEnd]));
  });
});
