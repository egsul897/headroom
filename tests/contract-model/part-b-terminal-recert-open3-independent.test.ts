/**
 * Phase 3F.1-terminal Part B - INDEPENDENT recertification of OPEN-3
 * (BLOCKER-8/AUDIT-F4, "N-way fused claim decomposition").
 *
 * This file is written by an INDEPENDENT auditor, separately from the Part
 * A implementer's own tests/contract-model/open-3-n-way-claim-decomposition.test.ts
 * and the pre-existing tests/contract-model/finding-4-recursive-coordinate-
 * decomposition.test.ts / part-b-recert-finding4-independent.test.ts. It
 * does not rerun or re-assert those files' own fixtures; every fixture
 * below was independently authored to probe the specific claims made in
 * docs/phase-3f1-terminal-architecture-decision/05-n-way-claim-
 * decomposition.json (GAP-1 Oxford-comma recognition, GAP-2 narrowed
 * restated-modal guard, GAP-3 genuine O(text.length) scaling), plus one
 * shape (mixing GAP-1 and GAP-2 in a single sentence) neither Part A's own
 * matrix nor the pre-existing suite exercises at all.
 *
 * Every test runs through the REAL, unmodified production functions
 * (hypothesizeUnitsForDocument / segmentCoordinateClauses) over a REAL
 * parsed StructuralIndex - no mocking, no reimplementation of the
 * algorithm under test.
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

/** Every unit's own claimed source span is real, non-overlapping, and its
 * excerpt is a verbatim prefix of the real source text at those offsets -
 * independently re-verified here rather than assumed from Part A's own
 * helper of the same shape. */
function assertNonOverlappingAndGrounded(units: MaterialSemanticUnit[], sourceText: string) {
  const spans = units.map((u) => {
    const a = u.anchors[0]!;
    return { start: a.charStart, end: a.charEnd };
  });
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
  }
  expect(new Set(spans.map((s) => `${s.start}-${s.end}`)).size).toBe(spans.length);
  for (const u of units) {
    const a = u.anchors[0]!;
    const literalSlice = sourceText.slice(a.charStart, a.charEnd);
    expect(literalSlice.startsWith(u.excerptText.slice(0, Math.min(u.excerptText.length, literalSlice.length)))).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// 1. FRESH fixture mixing Oxford-comma AND restated-modal structure in the
// SAME sentence - a shape neither the Part A fix's own new test file nor the
// pre-existing suite tries at all (each of their files tests the two
// patterns in SEPARATE fixtures). 4 same-family (INDEBTEDNESS) claims: three
// joined by an Oxford-comma list sharing one stated verb/family, then a
// fourth claim restating "shall not incur Indebtedness" outright (GAP-2's
// own pattern) as the final coordinate clause.
// ---------------------------------------------------------------------------

describe("OPEN-3 independent probe 1: Oxford-comma list AND restated-modal chain fused in ONE sentence", () => {
  const text =
    "Section 6.96. Indebtedness. The Company shall not incur Indebtedness in excess of $1,000,000, in excess of $2,000,000, or in excess of $3,000,000, and shall not incur Indebtedness in excess of $4,000,000.";

  it("decomposes to 4 distinct units (not 2, not 3) - each with its own distinguishing value", () => {
    const units = unitsFor("mixed-oxford-restated-modal", text);
    expect(units).toHaveLength(4);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["INDEBTEDNESS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(4);
    for (const amount of ["1,000,000", "2,000,000", "3,000,000", "4,000,000"]) {
      expect(units.filter((u) => u.excerptText.includes(amount))).toHaveLength(1);
    }
    assertNonOverlappingAndGrounded(units, text);
  });

  it("every non-root fragment inherits PROHIBITION_SIGNAL posture from the root (the fourth, restated-modal claim carries its own local 'shall not' too - inheritance is not the only correct path here)", () => {
    const units = unitsFor("mixed-oxford-restated-modal-posture", text);
    for (const u of units) expect(u.postureSignal).toBe("PROHIBITION_SIGNAL");
  });

  it("ordering is stable and ascending by source position", () => {
    const units = unitsFor("mixed-oxford-restated-modal-order", text);
    const starts = units.map((u) => u.anchors[0]!.charStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// 2. FALSE-POSITIVE CONTROL - a fresh, independently-invented ordinary
// coordinated noun phrase that must NOT over-split, distinct from the
// existing suite's "cash and cash equivalents" fixture. This one is chosen
// specifically to stress GAP-1's new comma-as-delimiter rule: a genuine
// Oxford-comma-SHAPED list ("rights, powers, privileges, and remedies")
// embedded in an ordinary boilerplate sentence with NO covenant-family
// keyword anywhere and no numeric value - the comma delimiter is now a
// candidate here (unlike before OPEN-3), so this is exactly the shape most
// likely to newly regress if the family/value qualification gate were
// weakened by the GAP-1 fix.
// ---------------------------------------------------------------------------

describe("OPEN-3 independent probe 2: false-positive control - ordinary Oxford-comma-shaped noun coordination must not split", () => {
  const text =
    "Section 8.02. Miscellaneous. The rights, powers, privileges, and remedies of the Administrative Agent and the Lenders under this Agreement and the other Loan Documents shall be cumulative and not exclusive of any other right or remedy that any such Person would otherwise have.";

  it("stays exactly ONE unit despite 3 commas and 2 'and's, none of which independently state a covenant family or value", () => {
    const units = unitsFor("false-positive-rights-powers", text);
    expect(units).toHaveLength(1);
    expect(units[0]!.excerptText).toBe(text);
    expect(units[0]!.family).toBe("OTHER_UNCLASSIFIED");
  });

  it("segmentCoordinateClauses itself returns null for this text (no genuine boundary found) rather than merely being overridden downstream", () => {
    expect(segmentCoordinateClauses(text)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Nested parentheticals with their OWN internal commas (and an internal
// "or") sitting INSIDE an Oxford-comma list - stresses the exact boundary
// between "paren-depth tracking excludes this from being a top-level
// delimiter" and "GAP-1 made every non-numeric comma a candidate delimiter".
// A regression here would look like: the parenthetical's own internal
// commas get mistaken for enumeration boundaries, fragmenting a single
// claim's own qualifying aside into spurious extra units, or corrupting the
// span/offsets of the units around it.
// ---------------------------------------------------------------------------

describe("OPEN-3 independent probe 3: nested parentheticals with internal commas inside an Oxford-comma list", () => {
  const text =
    "Section 6.95. Restrictions. The Company shall not incur Indebtedness (including, without limitation, letters of credit, surety bonds, or similar instruments) in excess of $1,000,000, create Liens (whether arising by contract, statute, or operation of law) in excess of $2,000,000, or make Investments (excluding, for the avoidance of doubt, cash and cash equivalents) in excess of $3,000,000.";

  it("still decomposes to exactly the 3 genuine top-level claims - the parentheticals' own internal commas/or never become extra delimiters", () => {
    const units = unitsFor("nested-parens-oxford", text);
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["INDEBTEDNESS", "LIENS", "INVESTMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
  });

  it("each unit's excerpt retains its own FULL parenthetical intact (never truncated mid-parenthetical by a spurious internal split)", () => {
    const units = unitsFor("nested-parens-oxford-intact", text);
    const indebtedness = units.find((u) => u.family === "INDEBTEDNESS")!;
    const liens = units.find((u) => u.family === "LIENS")!;
    const investments = units.find((u) => u.family === "INVESTMENTS")!;
    expect(indebtedness.excerptText).toContain("(including, without limitation, letters of credit, surety bonds, or similar instruments)");
    expect(liens.excerptText).toContain("(whether arising by contract, statute, or operation of law)");
    expect(investments.excerptText).toContain("(excluding, for the avoidance of doubt, cash and cash equivalents)");
    assertNonOverlappingAndGrounded(units, text);
  });

  it("each unit still carries its own correct, disjoint value anchor ($1,000,000 / $2,000,000 / $3,000,000) despite the intervening parenthetical text", () => {
    const units = unitsFor("nested-parens-oxford-values", text);
    for (const [family, amount] of [
      ["INDEBTEDNESS", "1,000,000"],
      ["LIENS", "2,000,000"],
      ["INVESTMENTS", "3,000,000"],
    ] as const) {
      const u = units.find((x) => x.family === family)!;
      expect(u.excerptText).toContain(amount);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. INDEPENDENT re-measurement of scaling behavior, at several sizes, using
// a construction Part A's own scaling proof never used: a long run of
// COMMA-delimited (not "or"-delimited) non-qualifying fragments - the exact
// GAP-1-introduced code path (bare comma as a candidate delimiter) that the
// prior FINDING-4 fix's own quadratic defect never even exercised (GAP-3's
// own reproduction and Part A's own re-measurement both used a bare-"or"
// chain). If GAP-1's new comma handling reintroduced any per-fragment
// re-scan of the growing segment, this construction is the one most likely
// to expose it. Six size buckets (more than Part A's own 4), each timed as
// the MEDIAN of 5 trials (post-JIT-warmup) to reduce GC/scheduler noise, and
// both a direct ratio check AND an independent log-log slope estimate
// (a stronger, more general test than a single endpoint ratio - a true
// O(n) algorithm has slope ~1, a true O(n^2) algorithm has slope ~2).
// ---------------------------------------------------------------------------

describe("OPEN-3 independent probe 4: re-measured scaling behavior (fresh construction, not merely Part A's own numbers)", () => {
  function commaChain(n: number): string {
    // "widget" matches no FAMILY_KEYWORDS entry, so every comma-delimited
    // fragment is a non-qualifying fold - the realistic worst-case shape
    // for the GAP-3 termination proof, applied specifically to the
    // GAP-1-introduced comma delimiter rather than "and"/"or"/";".
    return "widget, ".repeat(n) + "the Company shall not incur Indebtedness in excess of $1, or make Investments in excess of $2";
  }

  function medianTiming(text: string, trials: number): number {
    const samples: number[] = [];
    for (let i = 0; i < trials; i++) {
      const t0 = process.hrtime.bigint();
      segmentCoordinateClauses(text);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)]!;
  }

  it("does not hang and still finds the one real trailing boundary at very large n", () => {
    const segs = segmentCoordinateClauses(commaChain(50000));
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(2);
  });

  it("measured multi-point scaling is consistent with O(n), not O(n^2)", () => {
    const sizes = [4000, 8000, 16000, 32000, 64000, 128000];
    const points: { n: number; len: number; ms: number }[] = [];
    for (const n of sizes) {
      const text = commaChain(n);
      medianTiming(text, 1); // JIT warmup, discarded
      const ms = Math.max(0.01, medianTiming(text, 5));
      points.push({ n, len: text.length, ms });
    }

    // (a) Per-step ratio check: each successive bucket roughly doubles
    // `len`; a genuinely quadratic algorithm would roughly QUADRUPLE time at
    // each step, a genuinely linear one would roughly DOUBLE it. Require
    // every step's time ratio to stay well under the quadratic prediction.
    for (let i = 1; i < points.length; i++) {
      const lenRatio = points[i]!.len / points[i - 1]!.len;
      const timeRatio = points[i]!.ms / points[i - 1]!.ms;
      expect(timeRatio).toBeLessThan(lenRatio * lenRatio * 0.6);
    }

    // (b) End-to-end ratio check across the full 6-bucket range.
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const lenRatio = last.len / first.len;
    const timeRatio = last.ms / first.ms;
    expect(timeRatio).toBeLessThan(lenRatio * lenRatio * 0.4);

    // (c) Independent log-log slope estimate via least-squares regression
    // over ALL 6 points (not just two endpoints) - the standard way to
    // estimate a power-law exponent (time ~ len^slope). slope ~1 => linear,
    // slope ~2 => quadratic. A slope comfortably below 1.7 across 6
    // independently-measured points is strong, multi-point evidence of
    // genuinely sub-quadratic (in fact near-linear) scaling - not merely
    // "faster than the old defective version".
    const xs = points.map((p) => Math.log(p.len));
    const ys = points.map((p) => Math.log(p.ms));
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i]! - meanY), 0);
    const den = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
    const slope = num / den;

    // eslint-disable-next-line no-console
    console.log("OPEN-3 independent re-measurement (comma-chain construction):", points, "estimated log-log slope:", slope);

    expect(slope).toBeLessThan(1.7);
  }, 60000);
});
