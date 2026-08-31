/**
 * Phase 3F.1.6.RX-FINAL Part A - Workstream C - FINDING-4: generalized,
 * arbitrary-N-ary fused-claim decomposition.
 *
 * The prior Part B recertification (docs/phase-3f1-6-rx-final-blocker-
 * closure/26-part-b-blocker8-recertification.json, PART-B-BLOCKER8-FINDING-1)
 * proved findCoordinateClauseSplit (lib/contract-model/compiler/semantic-
 * coverage/unit-hypothesis.ts) performs AT MOST ONE split per region and
 * never recurses: a sentence fusing THREE OR MORE independently-operative
 * claims (same-family or cross-family, no lettered markers) is only
 * partially separated - the 2nd and every later claim collapse into one
 * semanticUnitId despite each carrying its own distinguishing number.
 *
 * This file is the required adversarial matrix for the fix
 * (segmentCoordinateClauses, an iterative single-forward-pass replacement -
 * see that function's own module doc comment in unit-hypothesis.ts for the
 * full design and termination proof): N=2..5, same-family-all-claims,
 * mixed-families, "and", "or", "and/or", semicolon-separated coordinate
 * clauses, a shared chapeau with multiple sibling permissions, a nested
 * condition applying to all children, an ordinary noun-phrase conjunction
 * that must NOT be split ("cash and cash equivalents"), determinism,
 * stable ordering, non-overlapping independent spans, and a dedicated
 * degenerate/malformed-input non-termination probe.
 *
 * Every test runs through the REAL, unmodified production functions
 * (hypothesizeUnitsForDocument / segmentCoordinateClauses) over a REAL
 * parsed StructuralIndex - never a mocked or re-derived stand-in, matching
 * every other claim-identity test file's own discipline in this codebase.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { hypothesizeUnitsForDocument, segmentCoordinateClauses } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";
import type { MaterialSemanticUnit } from "../../lib/contract-model/compiler/semantic-coverage/types";

function indexFor(doc: CompilerDocumentInput) {
  const nodes = parseDocumentStructure(doc);
  const nodesByDocument = new Map([[doc.documentId, { text: doc.text, nodes }]]);
  return buildStructuralIndex(nodesByDocument, [], []);
}

const CTX = { companyId: "c", packageKey: "p", instrumentKey: null, operativeVersionRef: null };

function unitsFor(documentId: string, text: string): MaterialSemanticUnit[] {
  const index = indexFor({ documentId, label: documentId, text });
  const routing = routeDocument(documentId, index);
  return hypothesizeUnitsForDocument(routing, index, CTX);
}

/** No two units' anchors ever overlap or duplicate a span, and every unit's excerpt is a real, verbatim substring of the source text at its own claimed offsets (source-span grounded, never fabricated). */
function assertNonOverlappingAndGrounded(units: MaterialSemanticUnit[], sourceText: string) {
  const spans = units.map((u) => {
    const a = u.anchors[0]!;
    return { start: a.charStart, end: a.charEnd };
  });
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
  }
  const spanKeys = spans.map((s) => `${s.start}-${s.end}`);
  expect(new Set(spanKeys).size).toBe(spanKeys.length); // no duplicate spans
  for (const u of units) {
    const a = u.anchors[0]!;
    const literalSlice = sourceText.slice(a.charStart, a.charEnd);
    // The unit's own excerpt (truncated to 500 chars by buildUnit) must be a
    // prefix of the real source slice at its own claimed coordinates - never
    // text copied from a sibling or fabricated independent of the source.
    expect(literalSlice.startsWith(u.excerptText.slice(0, Math.min(u.excerptText.length, literalSlice.length)))).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// N=2..5, same-family-all-claims - the defect class this fix exists for.
// Each claim must remain independently addressable (its own semanticUnitId,
// its own non-overlapping span) at every N, not just N=2.
// ---------------------------------------------------------------------------

describe("N-ary same-family-all-claims: every N from 2 to 5 fully separates, not just N=2", () => {
  const amounts = [10, 20, 30, 40, 50];

  for (const n of [2, 3, 4, 5]) {
    it(`N=${n}: ${n} fused INDEBTEDNESS baskets each resolve to their own semanticUnitId with independent, non-overlapping spans`, () => {
      const clauses = amounts.slice(0, n).map((m) => `incur Indebtedness not to exceed $${m},000,000`);
      const text = `Section 6.${50 + n}. Indebtedness. The Company may ${clauses.join(", or ")}.`;
      const units = unitsFor(`n-ary-same-${n}`, text);
      const indebtednessUnits = units.filter((u) => u.family === "INDEBTEDNESS");
      expect(indebtednessUnits).toHaveLength(n);
      expect(new Set(indebtednessUnits.map((u) => u.semanticUnitId)).size).toBe(n);
      for (const m of amounts.slice(0, n)) {
        expect(indebtednessUnits.some((u) => u.excerptText.includes(`${m},000,000`))).toBe(true);
      }
      // Stable, left-to-right ordering matching source order.
      const starts = indebtednessUnits.map((u) => u.anchors[0]!.charStart);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      assertNonOverlappingAndGrounded(indebtednessUnits, text);
    });
  }
});

// ---------------------------------------------------------------------------
// N=3..5, mixed-families - confirms the fix generalizes across BOTH the
// pre-existing cross-family branch and the same-family branch uniformly.
// ---------------------------------------------------------------------------

describe("N-ary mixed-families: cross-family fusion also fully separates at N=3, 4, 5", () => {
  it("N=3: Liens / Indebtedness / Investments -> 3 distinct units, 3 distinct families", () => {
    const text = "Section 6.60. Restrictions. The Company shall not create Liens on the Collateral in excess of $5,000,000, or incur Indebtedness in excess of $10,000,000, or make Investments in excess of $15,000,000.";
    const units = unitsFor("mixed-3", text);
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["LIENS", "INDEBTEDNESS", "INVESTMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
    assertNonOverlappingAndGrounded(units, text);
  });

  it("N=4: Liens / Indebtedness / Investments / Restricted Payments -> 4 distinct units, 4 distinct families", () => {
    const text =
      "Section 6.61. Restrictions. The Company shall not create Liens on the Collateral in excess of $5,000,000, or incur Indebtedness in excess of $10,000,000, or make Investments in excess of $15,000,000, or make Restricted Payments in excess of $20,000,000.";
    const units = unitsFor("mixed-4", text);
    expect(units).toHaveLength(4);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["LIENS", "INDEBTEDNESS", "INVESTMENTS", "RESTRICTED_PAYMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(4);
    assertNonOverlappingAndGrounded(units, text);
  });

  it("N=5: Liens / Indebtedness / Investments / Restricted Payments / Acquisitions -> 5 distinct units, 5 distinct families", () => {
    const text =
      "Section 6.62. Restrictions. The Company shall not create Liens on the Collateral in excess of $5,000,000, or incur Indebtedness in excess of $10,000,000, or make Investments in excess of $15,000,000, or make Restricted Payments in excess of $20,000,000, or make Acquisitions in excess of $25,000,000.";
    const units = unitsFor("mixed-5", text);
    expect(units).toHaveLength(5);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["LIENS", "INDEBTEDNESS", "INVESTMENTS", "RESTRICTED_PAYMENTS", "ACQUISITIONS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(5);
    assertNonOverlappingAndGrounded(units, text);
  });
});

// ---------------------------------------------------------------------------
// Delimiter-shape coverage: "and", "or", "and/or", ";" - the required
// matrix's own named coordinate words/punctuation.
// ---------------------------------------------------------------------------

describe("delimiter shapes: 'and', 'or', 'and/or', and semicolon-separated coordinate clauses all decompose correctly", () => {
  it("'or': 3 baskets joined by 'or' fully separate (baseline, already covered above, reconfirmed as part of this matrix)", () => {
    const text = "Section 6.63. Indebtedness. The Company may incur Indebtedness not to exceed $11,000,000, or incur Indebtedness not to exceed $22,000,000, or incur Indebtedness not to exceed $33,000,000.";
    const units = unitsFor("delim-or", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(3);
  });

  it("'and': baskets joined by 'and' fully separate (the algorithm's qualification rule treats 'and'/'or' identically - a genuine claim boundary is a genuine claim boundary regardless of conjunction word)", () => {
    const text = "Section 6.64. Indebtedness. The Company may incur Indebtedness not to exceed $11,000,000, and incur Indebtedness not to exceed $22,000,000, and incur Indebtedness not to exceed $33,000,000.";
    const units = unitsFor("delim-and", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
  });

  it("'and/or': matched as a single token (not two adjacent 'and'+'or' matches) - no stray '/or'/'and/' punctuation glued onto either resulting segment", () => {
    const text = "Section 6.65. Indebtedness. The Company may incur Indebtedness not to exceed $11,000,000 and/or incur Indebtedness not to exceed $22,000,000.";
    const units = unitsFor("delim-and-or", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(2);
    for (const u of units) {
      expect(u.excerptText.startsWith("/")).toBe(false);
      expect(u.excerptText.endsWith("/")).toBe(false);
      expect(u.excerptText).not.toContain("/or");
      expect(u.excerptText).not.toContain("and/");
    }
  });

  it("semicolon-separated coordinate clauses (no 'and'/'or' at all): 3 un-enumerated baskets joined only by ';' fully separate", () => {
    const text =
      "Section 6.66. Indebtedness. Indebtedness in an amount not to exceed $11,000,000 shall be permitted; Indebtedness in an amount not to exceed $22,000,000 shall be permitted; Indebtedness in an amount not to exceed $33,000,000 shall be permitted.";
    const units = unitsFor("delim-semicolon", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
    assertNonOverlappingAndGrounded(units, text);
  });
});

// ---------------------------------------------------------------------------
// Shared chapeau with multiple sibling permissions - a real, common
// drafting pattern where the family keyword is stated ONCE (in the shared
// chapeau) and never repeated in each sibling basket. The exactly-once
// two-way findCoordinateClauseSplit primitive could not reach this case
// even at N=2 (a sibling with no local family keyword never qualified);
// segmentCoordinateClauses' established-family tracking generalizes to it.
// ---------------------------------------------------------------------------

describe("shared chapeau with multiple sibling permissions: family stated once, never repeated per sibling", () => {
  it("3 siblings, none of which repeat 'Indebtedness' locally, still each resolve to their own unit via the chapeau's inherited family", () => {
    const text = "Section 6.67. Indebtedness. The Company may incur Indebtedness in an amount not to exceed $10,000,000, or in an amount not to exceed $20,000,000, or in an amount not to exceed $30,000,000.";
    const units = unitsFor("shared-chapeau", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
    // The chapeau's own text is embedded (real, source-grounded) only in the
    // FIRST unit's own span - never duplicated/fabricated into the others.
    const withChapeau = units.filter((u) => u.excerptText.includes("The Company may incur Indebtedness"));
    expect(withChapeau).toHaveLength(1);
    assertNonOverlappingAndGrounded(units, text);
  });
});

// ---------------------------------------------------------------------------
// A nested/trailing condition applying to all children - the shared
// condition text is real, source-grounded, and stays wherever it actually
// appears (the last segment here) rather than being fabricated into every
// sibling; the fix must still find all N genuine claim boundaries even
// though a later, unrelated top-level "and" (inside the trailing condition
// clause itself) exists in the same sentence.
// ---------------------------------------------------------------------------

describe("a nested condition applying to all children does not defeat, nor over-trigger, the N-ary split", () => {
  it("3 baskets plus a trailing 'so long as ... has occurred and is continuing' condition still yields exactly 3 units, not 4", () => {
    const text =
      "Section 6.68. Indebtedness. The Company may incur Indebtedness up to $10,000,000, or incur Indebtedness up to $20,000,000, or incur Indebtedness up to $30,000,000, in each case so long as no Default has occurred and is continuing.";
    const units = unitsFor("nested-condition", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
    // The trailing condition text is real source content that stays with
    // whichever unit it is textually part of (the last one) - never
    // fabricated into a unit whose own span does not contain it.
    const withCondition = units.filter((u) => u.excerptText.includes("has occurred and is continuing"));
    expect(withCondition).toHaveLength(1);
    assertNonOverlappingAndGrounded(units, text);
  });
});

// ---------------------------------------------------------------------------
// Critical negative case: a coordinate word inside an ORDINARY NOUN PHRASE
// must never be treated as a claim boundary.
// ---------------------------------------------------------------------------

describe("critical negative case: an ordinary noun-phrase conjunction is never split", () => {
  it("'cash and cash equivalents' is never treated as two coordinate claims, even though the surrounding sentence has a real family keyword and a real number", () => {
    const text = "Section 6.69. Investments. Permitted Investments include cash and cash equivalents in an amount not to exceed $10,000,000.";
    const units = unitsFor("noun-phrase-guard", text);
    const investmentsUnits = units.filter((u) => u.family === "INVESTMENTS");
    expect(investmentsUnits).toHaveLength(1);
    expect(investmentsUnits[0]!.excerptText).toContain("cash and cash equivalents");
  });

  it("regression guard (unchanged from BLOCKER-8): 'shall not, and shall not permit ... to, create or suffer to exist any Lien' stays ONE unit", () => {
    const text = "The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property, except Permitted Liens.";
    const units = unitsFor("modal-restate-guard", text);
    const liensUnits = units.filter((u) => u.excerptText.includes("Permitted Liens"));
    expect(liensUnits).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Determinism - identical source input yields identical identities across
// independent runs.
// ---------------------------------------------------------------------------

describe("determinism: identical source input yields identical semanticUnitIds across independent runs", () => {
  it("re-running the same N=4 fixture twice produces byte-identical semanticUnitId sets in the same order", () => {
    const text = "Section 6.70. Indebtedness. The Company may incur Indebtedness not to exceed $10,000,000, or incur Indebtedness not to exceed $20,000,000, or incur Indebtedness not to exceed $30,000,000, or incur Indebtedness not to exceed $40,000,000.";
    const run1 = unitsFor("determinism", text)
      .filter((u) => u.family === "INDEBTEDNESS")
      .map((u) => u.semanticUnitId);
    const run2 = unitsFor("determinism", text)
      .filter((u) => u.family === "INDEBTEDNESS")
      .map((u) => u.semanticUnitId);
    expect(run1).toHaveLength(4);
    expect(run1).toEqual(run2);
  });
});

// ---------------------------------------------------------------------------
// Degenerate/malformed input - direct probe of segmentCoordinateClauses to
// confirm no infinite loop/recursion and no throw under any input shape,
// including deliberately pathological ones. The function is iterative (a
// single bounded forward pass over a precomputed, finite fragment list, see
// its own module doc comment) so there is no recursion to bound at all -
// these tests confirm that holds in practice, not just on paper.
// ---------------------------------------------------------------------------

describe("degenerate/malformed input never hangs, never throws, and never fabricates a split", () => {
  it("empty string", () => {
    expect(segmentCoordinateClauses("")).toBeNull();
  });

  it("whitespace only", () => {
    expect(segmentCoordinateClauses("   \n\t  ")).toBeNull();
  });

  it("a long run of bare delimiters with no real words at all never splits and completes quickly", () => {
    const text = new Array(2000).fill("or").join(" ");
    const start = Date.now();
    const result = segmentCoordinateClauses(text);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result).toBeNull();
  });

  it("deeply nested / unbalanced parentheses never crash and never mis-split (top-level delimiter tracking degrades safely to 'nothing is top-level')", () => {
    const text = "((((((((((the Company shall not create Indebtedness or incur Indebtedness in excess of $10,000,000 or incur Indebtedness in excess of $20,000,000";
    expect(() => segmentCoordinateClauses(text)).not.toThrow();
    // Every delimiter after the unmatched, ever-open parens is treated as
    // non-top-level and ignored - a safe, fail-closed degradation (never a
    // fabricated split) rather than a crash or a hang.
    expect(segmentCoordinateClauses(text)).toBeNull();
  });

  it("a huge number of top-level semicolons with real repeating content still terminates promptly and produces a bounded, correct result", () => {
    const clause = "Indebtedness in an amount not to exceed $1,000,000 shall be permitted";
    const text = new Array(500).fill(clause).join("; ") + ".";
    const start = Date.now();
    const result = segmentCoordinateClauses(text);
    expect(Date.now() - start).toBeLessThan(5000);
    // Every clause states the IDENTICAL value ($1,000,000) so no adjacent
    // pair is ever value-DISJOINT - this is the genuine-duplicate case, not
    // a fused-distinct-claims case, so it correctly does NOT split (matches
    // the pre-existing "identical value on both sides never splits"
    // discipline, reused unchanged here).
    expect(result).toBeNull();
  });

  it("mixed real and empty fragments (adjacent delimiters, e.g. 'or or') never crash and never fabricate an empty-text unit", () => {
    const text = "The Company may incur Indebtedness not to exceed $10,000,000 or or incur Indebtedness not to exceed $20,000,000";
    expect(() => segmentCoordinateClauses(text)).not.toThrow();
    const result = segmentCoordinateClauses(text);
    if (result) {
      for (const seg of result) expect(seg.text.length).toBeGreaterThan(0);
    }
  });
});
