/**
 * P0 STRUCTURAL HARDENING CORRECTION — parentage inference.
 *
 * Inferred parent relationships (reconstructed from section
 * references + source positions) must NEVER drive coverage
 * suppression or covenant-family inheritance: they cannot
 * establish instrument boundaries or span containment. The
 * ONLY structural authority is node.parentNodeId. A node
 * with no parent pointer (null / undefined / dangling) is
 * UNRESOLVED — it is never suppressed and never inherits;
 * it keeps its own classification and gets its own candidate
 * (fail-closed).
 *
 * These tests cover: multiple instruments within one source,
 * repeated section references, missing parent pointers,
 * overlapping and noncontaining source spans, valid legacy
 * parentless nodes, and cross-instrument family inheritance.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";

function textFor(head: string, clauseAt: number, clause: string): { text: string; clauseStart: number } {
  const filler = "The Borrower shall comply with all applicable laws and regulations in all material respects. ";
  let text = head;
  while (text.length < clauseAt) text += filler;
  const clauseStart = text.length;
  text += clause;
  return { text, clauseStart };
}

function sectionNode(nodeId: string, ref: string, heading: string, start: number, end: number): StructuralNodeRecord {
  return { nodeId, sourceId: "src", nodeType: "SECTION", sectionRef: ref, heading, charStart: start, charEnd: end };
}

describe("P0: inferred parentage never drives suppression or inheritance", () => {
  it("multiple instruments in one source: a clause is not suppressed by another instrument's coverage", () => {
    // One source bundles two instruments (CA + Guaranty), each
    // with its own §6.01. The Guaranty 6.01(k) has NO parent
    // pointer. The CA 6.01's coverage must not suppress it —
    // ref + position alone cannot prove the clause belongs to
    // the CA's §6.01.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-ca-601", "6.01", "Indebtedness", 0, 30),
      sectionNode("n-guar-601", "6.01", "Guarantee", 100, 130),
      // Parentless: no parentNodeId key at all (legacy shape).
      { nodeId: "n-guar-601k", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60 },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-guar-601k");
  });

  it("cross-instrument family inheritance: a parentless clause does not inherit another instrument's families", () => {
    // The Guaranty 6.01(k)'s own text classifies UNKNOWN. The
    // CA 6.01 produced an INDEBTEDNESS candidate. Without a
    // validated parent pointer, the clause must NOT inherit
    // INDEBTEDNESS — it stays UNKNOWN (unresolved), never
    // attributed to the CA's covenant.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-ca-601", "6.01", "Indebtedness", 0, 30),
      sectionNode("n-guar-601", "6.01", "Guarantee", 100, 130),
      { nodeId: "n-guar-601k", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60 },
    ]);
    const found = cands.find((c) => c.nodeId === "n-guar-601k");
    expect(found).toBeDefined();
    expect(found!.families).not.toContain("INDEBTEDNESS");
    expect(found!.families).toEqual(["UNKNOWN"]);
  });

  it("repeated section references: the validated pointer wins over the nearest preceding label", () => {
    // Two §6.01 nodes: the FIRST carries INDEBTEDNESS, the
    // SECOND (nearest preceding) carries LIENS. The clause's
    // parentNodeId points to the FIRST. Inheritance must
    // follow the validated pointer, not the nearest label —
    // a ref-based fallback would have picked the SECOND.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-first-601", "6.01", "Indebtedness", 0, 30),
      sectionNode("n-second-601", "6.01", "Liens", 100, 130),
      { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: "n-first-601" },
    ]);
    const found = cands.find((c) => c.nodeId === "n-clause");
    expect(found).toBeDefined();
    expect(found!.families).toContain("INDEBTEDNESS");
    expect(found!.families).not.toContain("LIENS");
  });

  it("missing parent pointer (null): the clause is preserved unresolved — not suppressed, not inherited", () => {
    // Same shape as Rule 193's suppressed case, but the clause's
    // parent pointer is explicitly null. The parent's excerpt
    // covers the clause's position, yet without structural
    // authority the clause must NOT be suppressed and must NOT
    // inherit — it is unresolved, fail-closed.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.01", "Indebtedness", 0, 30),
      { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: null },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-clause");
    const found = cands.find((c) => c.nodeId === "n-clause")!;
    expect(found.families).toEqual(["UNKNOWN"]);
  });

  it("dangling parent pointer: a pointer to a nonexistent node is unresolved, never an error, never inheritance", () => {
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.01", "Indebtedness", 0, 30),
      { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: "n-does-not-exist" },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-clause");
    const found = cands.find((c) => c.nodeId === "n-clause")!;
    expect(found.families).toEqual(["UNKNOWN"]);
  });

  it("noncontaining span: a parentless clause inside the parent's excerpt range is NOT suppressed", () => {
    // The parent's span [0, 100) does NOT contain the clause's
    // span [2000, 2060), but the clause sits inside the parent's
    // 4000-char excerpt range. Ref + position would suppress
    // it; without structural authority it is preserved.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.01", "Indebtedness", 0, 100),
      { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60 },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-parent");
    expect(refs).toContain("n-clause");
  });

  it("overlapping but noncontaining span: a parentless clause overlapping the parent's span is NOT suppressed", () => {
    // The clause's span [3999, 8000) overlaps the parent's
    // span [0, 5000) but is not contained by it, and its
    // start sits just inside the parent's excerpt range.
    // Overlap is not containment and ref is not authority:
    // the clause is preserved.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      3999,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.01", "Indebtedness", 0, 5000),
      { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60 },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-clause");
  });

  it("valid legacy parentless node: a node with no parentNodeId key gets its own candidate with its own families", () => {
    // Legacy data may carry no parent pointer at all. Such a
    // node is valid and unresolved — it must not be dropped
    // and must not be re-parented by inference.
    const clause = "(k) other Liens securing Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.02. Liens. The Borrower shall not create any Lien except: (a) Liens under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.02", "Liens", 0, 30),
      // No parentNodeId key — the legacy shape.
      { nodeId: "n-legacy", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.02(k)", heading: "6.02(k)", charStart: clauseStart, charEnd: clauseStart + 60 },
    ]);
    const found = cands.find((c) => c.nodeId === "n-legacy");
    expect(found).toBeDefined();
    // Own classification (LIENS from its own text), not
    // inherited from the parent.
    expect(found!.families).toContain("LIENS");
  });

  it("validated pointer still drives suppression and inheritance (Rule 193, authority path)", () => {
    // The positive control: when structural authority IS
    // present (parentNodeId), suppression and inheritance
    // still fire exactly as Rule 193 requires.
    const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
    const { text, clauseStart } = textFor(
      "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ",
      2000,
      clause,
    );
    const cands = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.01", "Indebtedness", 0, 30),
      { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: "n-parent" },
    ]);
    // Suppressed: the parent's excerpt covers the clause.
    expect(cands.map((c) => c.nodeId)).not.toContain("n-clause");

    // Inheritance: a SUBSECTION with UNKNOWN own text inherits
    // its validated parent's families.
    const cands2 = discoverCovenantCandidates("src", text, [
      sectionNode("n-parent", "6.01", "Indebtedness", 0, 30),
      { nodeId: "n-sub", sourceId: "src", nodeType: "SUBSECTION", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: "n-parent" },
    ]);
    const sub = cands2.find((c) => c.nodeId === "n-sub");
    expect(sub).toBeDefined();
    expect(sub!.families).toContain("INDEBTEDNESS");
  });
});
