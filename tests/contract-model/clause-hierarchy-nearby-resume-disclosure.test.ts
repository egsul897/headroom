/**
 * Disclosed effects of the openLetterResumesNearby guard (PR #161) beyond Chewy §6.08(a)(3)(b).
 * Real committed fixtures, structure stage only, zero paid calls. These are regression pins, not
 * certification evidence: each asserts that an interior (x)/(y)[/(z)] proviso or exclusion run stays
 * inside the owning clause's text and that no fabricated structural child is minted for it.
 * (Path touch: re-trigger canonical-compiler after tip typecheck unblock outside this glob.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

const FIXTURES = "tests/fixtures/unseen-packages";

function nodesOf(file: string) {
  const text = readFileSync(`${FIXTURES}/${file}`, "utf8");
  const nodes = parseDocumentStructure({ documentId: "doc", label: file, text });
  return { text, nodes };
}

function owned(text: string, nodes: ReturnType<typeof parseDocumentStructure>, ref: string, after = 0) {
  const n = nodes.find((x) => x.sectionRef === ref && x.charStart >= after);
  expect(n, `${ref} must parse`).toBeDefined();
  return { node: n!, text: text.slice(n!.charStart, n!.charEnd) };
}

describe("openLetterResumesNearby - disclosed interior proviso limbs (no fabricated children, limb text owned by the clause)", () => {
  it("Chewy 6.08(b)(16)(g): the 'shall (x) reduce ... and (y) increase ...' proviso stays inside (g)", () => {
    const { text, nodes } = nodesOf("chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt");
    const g = owned(text, nodes, "6.08(b)(16)(g)", 600_000);
    expect(g.node.charStart).toBe(689219);
    expect(g.node.charEnd).toBe(690271);
    expect(g.text).toContain("(x) reduce Consolidated Net Income");
    expect(g.text).toContain("(y) increase (or, without duplication");
    expect(nodes.some((n) => n.sectionRef === "6.08(b)(16)(g)(x)" || n.sectionRef === "6.08(b)(16)(g)(y)")).toBe(false);
    expect(nodes.some((n) => n.parentNodeId === g.node.nodeId)).toBe(false);
    expect(owned(text, nodes, "6.08(b)(16)(h)", 600_000).node.charStart).toBe(690271);
  });

  it("DSGR 8.06(c)(ii) (both restatements): the '(x) ... or (y) ...' erroneous-payment enumeration stays inside (ii)", () => {
    for (const [file, start] of [
      ["dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt", 531278],
      ["dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt", 557961],
    ] as const) {
      const { text, nodes } = nodesOf(file);
      const ii = owned(text, nodes, "8.06(c)(ii)", 500_000);
      expect(ii.node.charStart).toBeLessThan(start);
      expect(ii.node.charEnd).toBeGreaterThan(start + 1000);
      expect(ii.text).toContain("(x) that is in a different amount");
      expect(ii.text).toContain("(y) that was not preceded or accompanied by a Payment Notice");
      expect(ii.text).toContain("it shall be on notice");
      expect(nodes.some((n) => n.sectionRef === "8.06(c)(ii)(x)" || n.sectionRef === "8.06(c)(ii)(y)")).toBe(false);
      expect(nodes.some((n) => n.parentNodeId === ii.node.nodeId)).toBe(false);
      expect(owned(text, nodes, "8.06(c)(iii)", 500_000).node.charStart).toBe(ii.node.charEnd);
    }
  });

  it("term-loan 2.05(2)(e) (both restatements): the 'provided that (x) ... (y) ... (z)' proviso stays inside (e)", () => {
    for (const [file, start] of [
      ["final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt", 355347],
      ["final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt", 358943],
    ] as const) {
      const { text, nodes } = nodesOf(file);
      const e = owned(text, nodes, "2.05(2)(e)", 300_000);
      expect(e.node.charStart).toBeLessThan(start);
      expect(e.text).toContain("provided that");
      expect(e.text).toContain("(x) such prepayments may not be directed");
      expect(e.text).toContain("(y) in the event that there are");
      expect(e.text).toContain("(z) each prepayment of Term Loans required by");
      expect(nodes.some((n) => /^2\.05\(2\)\(e\)\((x|y|z)\)$/.test(n.sectionRef))).toBe(false);
      expect(nodes.some((n) => n.parentNodeId === e.node.nodeId)).toBe(false);
      expect(owned(text, nodes, "2.05(2)(f)", 300_000).node.charStart).toBe(e.node.charEnd);
    }
  });

  it("a genuine nested alphabetic list is still addressable (control)", () => {
    const { nodes } = { nodes: parseDocumentStructure({ documentId: "syn", label: "syn", text: "ARTICLE VII COVENANTS\n\nSECTION 7.01 Test . The Borrower shall not:\n\n(a) first:\n\n(i) sub one;\n\n(ii) sub two:\n\n(A) deep one;\n\n(B) deep two;\n\n(iii) sub three;\n\n(b) second.\n" }) };
    const refs = nodes.map((n) => n.sectionRef);
    for (const r of ["7.01(a)", "7.01(a)(i)", "7.01(a)(ii)", "7.01(a)(ii)(A)", "7.01(a)(ii)(B)", "7.01(a)(iii)", "7.01(b)"]) expect(refs).toContain(r);
  });
});
