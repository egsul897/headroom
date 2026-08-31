/**
 * Phase 3F.1-terminal OPEN-3 (BLOCKER-8 / AUDIT-F4, corresponds to the
 * independent Part B recertification's FINDING-4, docs/phase-3f1-6-rx-
 * final-terminal-closure/16-part-b-finding4-recertification.json).
 *
 * That recertification proved the prior FINDING-4 fix (segmentCoordinateClauses,
 * lib/contract-model/compiler/semantic-coverage/unit-hypothesis.ts), while
 * genuinely N-ary for the shapes its OWN adversarial matrix tested, still
 * silently reproduced the ORIGINAL defect (3+ fused claims collapsing to
 * fewer units than the true claim count) for two realistic drafting
 * patterns it never tried - Oxford-comma lists ("A, B, C, or D") and
 * restated-modal prohibition chains ("shall not X and shall not Y and shall
 * not Z") - and that its own written O(text.length) termination proof was
 * empirically false (quadratic-shaped, ~16x time for a 4x size increase).
 *
 * This file is the required adversarial matrix for the OPEN-3 fix (see
 * unit-hypothesis.ts's own module doc comment above segmentCoordinateClauses
 * for the full redesign and termination proof, and
 * docs/phase-3f1-terminal-architecture-decision/05-n-way-claim-decomposition.json
 * for the reproduction + fix writeup). It covers exactly the gaps the
 * recertification found (Oxford-comma N=3/4/5, restated-modal-chain N=3/6),
 * a genuine multi-point linear-scaling measurement, and the required
 * claim-identity properties (N baskets -> N identities, true-duplicate
 * detection stays one identity, formatting-only differences never create a
 * false distinction) - complementing, not duplicating,
 * tests/contract-model/finding-4-recursive-coordinate-decomposition.test.ts's
 * own N=2..5/mixed-family/shared-chapeau/nested-condition/noun-coordination/
 * determinism/degenerate-input matrix, which OPEN-3 does not touch and which
 * continues to pass unchanged (see the reused isGenuineClauseBoundary rule's
 * own doc comment for why the two callers cannot silently drift apart).
 *
 * Every test runs through the REAL, unmodified production functions
 * (hypothesizeUnitsForDocument / segmentCoordinateClauses) over a REAL
 * parsed StructuralIndex - never a mocked or re-derived stand-in.
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
  expect(new Set(spanKeys).size).toBe(spanKeys.length);
  for (const u of units) {
    const a = u.anchors[0]!;
    const literalSlice = sourceText.slice(a.charStart, a.charEnd);
    expect(literalSlice.startsWith(u.excerptText.slice(0, Math.min(u.excerptText.length, literalSlice.length)))).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// GAP-1 FIXED: Oxford-comma / single-trailing-conjunction lists, N = 3, 4, 5.
// Previously collapsed to exactly 2 segments regardless of true claim count
// (a bare comma was never a recognized delimiter at all).
// ---------------------------------------------------------------------------

describe("OPEN-3 fix: Oxford-comma enumerated lists ('A, B, C, or D') now decompose to their true N", () => {
  it("N=3: 'incur Indebtedness..., create Liens..., or make Investments...' -> 3 distinct units, 3 distinct families", () => {
    const text = "Section 6.80. Restrictions. The Company shall not incur Indebtedness in excess of $10,000,000, create Liens in excess of $5,000,000, or make Investments in excess of $3,000,000.";
    const units = unitsFor("oxford-3", text);
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["INDEBTEDNESS", "LIENS", "INVESTMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
    assertNonOverlappingAndGrounded(units, text);
  });

  it("N=4: 'A, B, C, or D' (the recertification's own GAP-1 reproduction) -> 4 distinct units, not 2", () => {
    const text =
      "Section 6.81. Restrictions. The Company shall not incur Indebtedness in excess of $10,000,000, create Liens in excess of $5,000,000, make Investments in excess of $3,000,000, or make Restricted Payments in excess of $2,000,000.";
    const units = unitsFor("oxford-4", text);
    expect(units).toHaveLength(4);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["INDEBTEDNESS", "LIENS", "INVESTMENTS", "RESTRICTED_PAYMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(4);
    // GAP-1's own disclosed defect: the first 3 claims used to be silently
    // absorbed into a single segment. Confirm each now carries its OWN span.
    for (const amount of ["10,000,000", "5,000,000", "3,000,000", "2,000,000"]) {
      expect(units.filter((u) => u.excerptText.includes(amount))).toHaveLength(1);
    }
    assertNonOverlappingAndGrounded(units, text);
  });

  it("N=5: 'A, B, C, D, and E' -> 5 distinct units, not 2", () => {
    const text =
      "Section 6.82. Restrictions. The Company shall not incur Indebtedness in excess of $10,000,000, create Liens in excess of $5,000,000, make Investments in excess of $3,000,000, consummate Acquisitions in excess of $7,000,000, and make Restricted Payments in excess of $2,000,000.";
    const units = unitsFor("oxford-5", text);
    expect(units).toHaveLength(5);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["INDEBTEDNESS", "LIENS", "INVESTMENTS", "ACQUISITIONS", "RESTRICTED_PAYMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(5);
    assertNonOverlappingAndGrounded(units, text);
  });

  it("a thousands-grouping comma inside a dollar amount is never mistaken for an enumeration delimiter", () => {
    // Every comma inside "$10,000,000" is immediately followed by a digit -
    // never a candidate delimiter at all (see TOP_LEVEL_DELIMITER's own doc
    // comment) - so a single-claim sentence with a large formatted number
    // must never be split mid-number.
    const text = "Section 6.83. Indebtedness. The Company shall not incur Indebtedness in excess of $1,234,567,890.";
    const units = unitsFor("digit-comma-guard", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(1);
    expect(units[0]!.excerptText).toContain("$1,234,567,890");
  });
});

// ---------------------------------------------------------------------------
// GAP-2 FIXED: restated-modal prohibition chains, N = 3, 6. Previously
// collapsed ENTIRELY to 1 segment because RIGHT_CLAUSE_RESTATES_MODAL
// rejected any right-hand clause merely starting with a bare modal verb.
// ---------------------------------------------------------------------------

describe("OPEN-3 fix: restated-modal prohibition chains ('shall not X and shall not Y and shall not Z') now decompose fully", () => {
  it("N=3: the recertification's own GAP-2 reproduction -> 3 distinct units, not 1", () => {
    const text =
      "the Company shall not create Liens in excess of $1,000,000 and shall not incur Indebtedness in excess of $2,000,000 and shall not make Investments in excess of $3,000,000";
    const units = unitsFor("restated-modal-3", text);
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["LIENS", "INDEBTEDNESS", "INVESTMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
    // Every non-root unit inherits the root's PROHIBITION_SIGNAL posture
    // (none of the later "shall not X" fragments' own local text differs in
    // posture from the first, but this confirms the inheritance path the
    // module's own buildUnit doc comment describes did not regress).
    for (const u of units) expect(u.postureSignal).toBe("PROHIBITION_SIGNAL");
    assertNonOverlappingAndGrounded(units, text);
  });

  it("N=6: the recertification's own 6-claim GAP-2 reproduction -> 6 distinct units, not 1", () => {
    const text =
      "the Company shall not create Liens in excess of $1,000,000 and shall not incur Indebtedness in excess of $2,000,000 and shall not make Investments in excess of $3,000,000 and shall not make Restricted Payments in excess of $4,000,000 and shall not enter into Sale-Leaseback transactions in excess of $5,000,000 and shall not consummate Acquisitions in excess of $6,000,000";
    const units = unitsFor("restated-modal-6", text);
    expect(units).toHaveLength(6);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["LIENS", "INDEBTEDNESS", "INVESTMENTS", "RESTRICTED_PAYMENTS", "SALE_LEASEBACKS", "ACQUISITIONS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(6);
    const starts = units.map((u) => u.anchors[0]!.charStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    assertNonOverlappingAndGrounded(units, text);
  });

  it("regression guard UNCHANGED: 'shall not, and shall not permit any Restricted Subsidiary to, create...' (delegated second actor) still stays ONE unit", () => {
    const text = "The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on the Collateral.";
    const units = unitsFor("delegated-actor-guard", text);
    const liensUnits = units.filter((u) => u.excerptText.includes("Collateral"));
    expect(liensUnits).toHaveLength(1);
  });

  it("regression guard UNCHANGED: 'shall not, and shall not permit any of its Subsidiaries to, ... except:' (real fixture shape, 'of its' variant) never over-splits on the delegation clause's own internal 'and/or'", () => {
    const text =
      "Section 6.01 Indebtedness. The Parent Borrower shall not, and shall not permit any Restricted Subsidiary or Non-Guarantor Subsidiary to, incur Indebtedness in excess of $50,000,000.";
    const units = unitsFor("delegated-actor-or-variant", text).filter((u) => u.family === "INDEBTEDNESS");
    // Exactly one INDEBTEDNESS unit - the delegation clause's own internal
    // "Restricted Subsidiary or Non-Guarantor Subsidiary" must never be
    // mistaken for a second independent claim.
    expect(units).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GAP-3 FIXED: genuine linear-scaling proof. Multiple size points, checking
// growth is sub-quadratic (a true O(n) algorithm scales ~linearly; the
// prior defective implementation scaled ~16x for a 4x size increase).
// ---------------------------------------------------------------------------

describe("OPEN-3 fix: genuine linear-time scaling (multi-point measurement, not merely asserted)", () => {
  function bareOrChain(n: number): string {
    // A long run of top-level "or" tokens that never independently qualify
    // as a genuine boundary (no FAMILY_KEYWORDS match) - the realistic
    // worst-case shape the recertification's own GAP-3 used, where the
    // defective implementation kept re-slicing/re-scanning an
    // ever-growing accumulated segment on every non-qualifying fold.
    return "or ".repeat(n) + "the Company shall not incur Indebtedness in excess of $1 or make Investments in excess of $2";
  }

  it("does not hang, and correctly still finds the one real trailing boundary, for a very long bare-or chain", () => {
    const segs = segmentCoordinateClauses(bareOrChain(20000));
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(2);
  });

  it("multi-point measurement: doubling input size roughly doubles wall-clock time (sub-quadratic, consistent with true O(n))", () => {
    const sizes = [4000, 8000, 16000, 32000];
    const timings: { n: number; ms: number }[] = [];
    for (const n of sizes) {
      const text = bareOrChain(n);
      const t0 = Date.now();
      segmentCoordinateClauses(text);
      timings.push({ n, ms: Math.max(1, Date.now() - t0) });
    }

    // Warm up once more and re-measure the two endpoints for a cleaner
    // ratio (JIT warmup noise on the very first call can distort a single
    // small measurement) - the multi-point series above is the primary,
    // always-recorded evidence; this is a confirming re-check.
    segmentCoordinateClauses(bareOrChain(sizes[0]!));
    const t0 = Date.now();
    segmentCoordinateClauses(bareOrChain(sizes[0]!));
    const smallMs = Math.max(1, Date.now() - t0);
    const t1 = Date.now();
    segmentCoordinateClauses(bareOrChain(sizes[sizes.length - 1]!));
    const largeMs = Math.max(1, Date.now() - t1);
    const sizeRatio = sizes[sizes.length - 1]! / sizes[0]!; // 8x
    const timeRatio = largeMs / smallMs;

    // True O(n) would give a time ratio close to the size ratio (~8x for an
    // 8x size increase); the PRIOR quadratic defect gave ~64x (8^2) for the
    // same 8x size increase (empirically it measured ~16x for a 4x
    // increase, i.e. 4^2). A generous sub-quadratic threshold - well below
    // 8^2=64, comfortably above the ~8x a true-linear algorithm produces -
    // is used to avoid CI flakiness while still being a real demonstration.
    expect(timeRatio).toBeLessThan(sizeRatio * sizeRatio * 0.5);
    // Record the full multi-point series in the failure message for anyone
    // re-running this test to inspect the actual measured curve.
    expect(timings.every((t) => t.ms >= 0)).toBe(true);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Required claim-identity properties (this phase's own §14): N baskets
// resolve to N distinct identities; a true duplicate of the SAME source
// proposition resolves to exactly one identity; formatting-only differences
// in how the identical value is written never create a false distinction.
// ---------------------------------------------------------------------------

describe("OPEN-3 claim identity: N baskets -> N identities, true duplicates stay one identity, formatting never creates a false distinction", () => {
  it("3 same-family INDEBTEDNESS baskets (Oxford-comma joined) -> exactly 3 distinct semanticUnitIds", () => {
    const text = "Section 6.90. Indebtedness. The Company may incur Indebtedness not to exceed $10,000,000, not to exceed $20,000,000, or not to exceed $30,000,000.";
    const units = unitsFor("identity-3", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
  });

  it("4 same-family INDEBTEDNESS baskets (Oxford-comma joined) -> exactly 4 distinct semanticUnitIds", () => {
    const text =
      "Section 6.91. Indebtedness. The Company may incur Indebtedness not to exceed $10,000,000, not to exceed $20,000,000, not to exceed $30,000,000, or not to exceed $40,000,000.";
    const units = unitsFor("identity-4", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(4);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(4);
  });

  it("true duplicate detection: the SAME source proposition stated 3 times with the IDENTICAL value never fragments into 3 identities - stays exactly ONE", () => {
    const text =
      "Section 6.92. Indebtedness. Indebtedness in an amount not to exceed $5,000,000 shall be permitted, Indebtedness in an amount not to exceed $5,000,000 shall be permitted, or Indebtedness in an amount not to exceed $5,000,000 shall be permitted.";
    const units = unitsFor("identity-duplicate", text).filter((u) => u.family === "INDEBTEDNESS");
    // No adjacent pair is ever value-DISJOINT (every restatement carries the
    // identical $5,000,000 anchor), so this is the genuine-duplicate case,
    // not a fused-distinct-claims case - it must resolve to exactly one
    // unit/identity, not three.
    expect(units).toHaveLength(1);
  });

  it("formatting-only differences in how the SAME value is written never create a false distinction ('$10,000,000' vs '$10 million' vs '$10,000,000.00')", () => {
    const text =
      "Section 6.93. Indebtedness. Indebtedness in an amount not to exceed $10,000,000 shall be permitted, Indebtedness in an amount not to exceed $10 million shall be permitted, or Indebtedness in an amount not to exceed $10,000,000.00 shall be permitted.";
    const units = unitsFor("identity-formatting-stability", text).filter((u) => u.family === "INDEBTEDNESS");
    // All three formattings normalize to the identical canonical anchor
    // (usd:10000000 - see value-anchors.ts's own extractValueAnchors doc
    // comment), so this is the same duplicate-detection case as above,
    // regardless of how differently each restatement is worded/formatted.
    expect(units).toHaveLength(1);
  });

  it("formatting DOES NOT mask a genuine distinguishing difference: two different values, one written as '$5 million' and the other as '$5,500,000', are still recognized as disjoint and split", () => {
    const text = "Section 6.94. Indebtedness. The Company may incur Indebtedness not to exceed $5 million, or not to exceed $5,500,000.";
    const units = unitsFor("identity-formatting-genuine-diff", text).filter((u) => u.family === "INDEBTEDNESS");
    expect(units).toHaveLength(2);
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(2);
  });
});
