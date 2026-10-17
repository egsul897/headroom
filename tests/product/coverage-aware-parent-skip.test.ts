/**
 * Rule 193 — a covered parent suppresses its clauses only for
 * the text its excerpt actually reaches. The candidate excerpt
 * is capped at 4000 chars, so a clause sitting past the cap
 * (Strata 6.01(k), near the end of a long 6.01) is NOT covered
 * by the parent's candidate and gets its own chance through
 * the discovery gates. A clause inside the parent's excerpt
 * range is still suppressed (the parent covers it).
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";

function buildText(clauseAt: number): { text: string; clauseStart: number } {
  const head = "6.01. Indebtedness. The Borrower shall not incur Indebtedness except: (a) Indebtedness under the Loan Documents. ";
  const clause = "(k) other unsecured Indebtedness not exceeding the Threshold Amount.";
  const filler = "The Borrower shall comply with all applicable laws and regulations in all material respects. ";
  let text = head;
  while (text.length < clauseAt) text += filler;
  const clauseStart = text.length;
  // End the text at the clause: any trailing sentence would
  // pollute the clause's excerpt (its span runs to text end).
  text += clause;
  return { text, clauseStart };
}

function nodesFor(clauseStart: number): StructuralNodeRecord[] {
  return [
    { nodeId: "n-parent", sourceId: "src", nodeType: "SECTION", sectionRef: "6.01", heading: "Indebtedness", charStart: 0, charEnd: 30 },
    // P0 correction: the parent link is structural authority
    // (parentNodeId), never ref inference. The clause is a
    // validated child of n-parent.
    { nodeId: "n-clause", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: "n-parent" },
  ];
}

describe("Rule 193: coverage-aware parent-skip", () => {
  it("a clause past the parent's 4000-char excerpt cap gets its own candidate", () => {
    const { text, clauseStart } = buildText(4500);
    expect(clauseStart).toBeGreaterThan(4000);
    const cands = discoverCovenantCandidates("src", text, nodesFor(clauseStart));
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-parent");
    expect(refs).toContain("n-clause");
    const clause = cands.find((c) => c.nodeId === "n-clause")!;
    expect(clause.excerpt).toContain("Threshold Amount");
  });

  it("a SUBSECTION with a bare-marker heading inherits its parent's families (Strata 6.01(k) shape)", () => {
    // The (k) node is a SUBSECTION, not a CLAUSE: its own text
    // classifies UNKNOWN (no amount — the cap is the defined
    // term "Threshold Amount") and the score filter would drop
    // it. Inheriting the parent 6.01's INDEBTEDNESS families
    // admits it as a candidate.
    const { text, clauseStart } = buildText(2000);
    const cands = discoverCovenantCandidates("src", text, [
      { nodeId: "n-parent", sourceId: "src", nodeType: "SECTION", sectionRef: "6.01", heading: "Indebtedness", charStart: 0, charEnd: 30 },
      { nodeId: "n-sub", sourceId: "src", nodeType: "SUBSECTION", sectionRef: "6.01(k)", heading: "6.01(k)", charStart: clauseStart, charEnd: clauseStart + 60, parentNodeId: "n-parent" },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-sub");
    expect(cands.find((c) => c.nodeId === "n-sub")!.families).toContain("INDEBTEDNESS");
  });

  it("a nested fragment inside a clause parent's span is skipped even past the excerpt cap", () => {
    // 6.02(l)(a) is a fragment within the (l) basket, not a
    // distinct basket: the parent (l) is a SUBSECTION, so the
    // child is ALWAYS skipped when the parent produced a
    // candidate (even past the parent's excerpt cap / span —
    // the parser misattributes later sections' clauses to
    // stale SUBSECTION parent refs).
    const { text } = buildText(4500);
    const cands = discoverCovenantCandidates("src", text, [
      { nodeId: "n-parent", sourceId: "src", nodeType: "SECTION", sectionRef: "6.02", heading: "Liens", charStart: 0, charEnd: 30 },
      { nodeId: "n-clause", sourceId: "src", nodeType: "SUBSECTION", sectionRef: "6.02(l)", heading: "6.02(l)", charStart: 100, charEnd: 160, parentNodeId: "n-parent" },
      { nodeId: "n-frag", sourceId: "src", nodeType: "CLAUSE", sectionRef: "6.02(l)(a)", heading: "6.02(l)(a)", charStart: 4500, charEnd: 4560, parentNodeId: "n-clause" },
      // A following SECTION node bounds the (l) span at 6000.
      { nodeId: "n-next", sourceId: "src", nodeType: "SECTION", sectionRef: "6.03", heading: "Other", charStart: 6000, charEnd: 6060 },
    ]);
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-clause");
    expect(refs).not.toContain("n-frag");
  });

  it("a clause inside the parent's excerpt range is still suppressed", () => {
    const { text, clauseStart } = buildText(2000);
    expect(clauseStart).toBeLessThan(4000);
    const cands = discoverCovenantCandidates("src", text, nodesFor(clauseStart));
    const refs = cands.map((c) => c.nodeId);
    expect(refs).toContain("n-parent");
    expect(refs).not.toContain("n-clause");
  });
});

describe("Rule 193: defined-term-cap ranker signal", () => {
  it("a cap through a defined term scores like a real basket clause", async () => {
    const { scoreDiscoveryPotential } = await import("../../lib/knowledge-factory/rank/discovery-score");
    const r = scoreDiscoveryPotential("(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount.", "6.01(k)");
    expect(r.signals).toContain("defined_term_cap");
    expect(r.score).toBeGreaterThanOrEqual(3);
    // A single Capitalized party word is not a defined-term cap.
    const r2 = scoreDiscoveryPotential("The Borrower shall not exceed the Borrower limit.", "");
    expect(r2.signals).not.toContain("defined_term_cap");
  });
});

describe("Rule 195: amount-cap ranker signal", () => {
  it("a cap through a dollar amount scores like a real basket clause", async () => {
    const { scoreDiscoveryPotential } = await import("../../lib/knowledge-factory/rank/discovery-score");
    const r = scoreDiscoveryPotential("(j) other Indebtedness in an aggregate principal amount not to exceed $20,000,000.", "6.01(j)");
    expect(r.signals).toContain("amount_cap");
    expect(r.score).toBeGreaterThanOrEqual(3);
    // "in excess of" alone (a trigger threshold, not a cap) is not an amount cap.
    const r2 = scoreDiscoveryPotential("any Lien or claim made or asserted against Collateral in excess of $150,000.", "");
    expect(r2.signals).not.toContain("amount_cap");
  });
});
