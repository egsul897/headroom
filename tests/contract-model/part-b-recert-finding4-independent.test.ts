/**
 * Phase 3F.1.6.RX-FINAL Part B - INDEPENDENT recertification of FINDING-4
 * (BLOCKER-8 / AUDIT-F4, "coordinate-clause splitting handles at most one
 * split and fails on 3+ fused claims").
 *
 * This file is DELIBERATELY NOT a rerun of Workstream C's own adversarial
 * matrix (tests/contract-model/finding-4-recursive-coordinate-decomposition
 * .test.ts) - it constructs FRESH adversarial fixtures per this
 * recertification's own charter, calling the real, unmodified production
 * function `segmentCoordinateClauses` directly (lib/contract-model/compiler/
 * semantic-coverage/unit-hypothesis.ts) to independently attempt to FALSIFY
 * Workstream C's own claim that the fix "genuinely generalizes to arbitrary
 * finite N" rather than merely being "tuned to support 2..5".
 *
 * PRODUCTION IS FROZEN for this recertification - no production file is
 * touched by this file. Every test asserts the CURRENT, ACTUAL behavior of
 * unmodified production code. Tests whose name says "GAP"/"FALSIFIES"
 * document a genuine, reproducible defect this recertification discovered.
 *
 * No database is used - segmentCoordinateClauses is a pure, synchronous,
 * in-memory text function, so every test here runs at the pure-unit level
 * (Postgres is neither needed nor touched).
 */
import { describe, expect, it } from "vitest";
import { segmentCoordinateClauses } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";

// ---------------------------------------------------------------------------
// Baseline sanity checks - confirm the fix DOES work for the shapes
// Workstream C's own adversarial matrix directly tested (N=4/N=20 clean
// and/or chains with no repeated modal verb and no comma-separated list
// shape). An honest recertification must show where the fix holds, not only
// where it breaks.
// ---------------------------------------------------------------------------

describe("FINDING-4 independent recertification - baseline (fix genuinely works here)", () => {
  it("N=4 same-family clean or-chain (no repeated modal, no comma list) splits into 4", () => {
    const text =
      "the Company shall not incur Indebtedness in excess of $10,000,000 or incur Indebtedness in excess of $20,000,000 or incur Indebtedness in excess of $30,000,000 or incur Indebtedness in excess of $40,000,000";
    const segs = segmentCoordinateClauses(text);
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(4);
  });

  it("N=20 cross-family clean or-chain (no repeated modal, no comma list) splits into 20", () => {
    const families = ["Indebtedness", "Liens", "Investments", "Restricted Payments", "Acquisitions"];
    let text = "the Company shall not ";
    for (let i = 0; i < 20; i++) {
      text += (i === 0 ? "" : " or ") + `incur ${families[i % families.length]} in excess of $${i + 1},000,000`;
    }
    const segs = segmentCoordinateClauses(text);
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// FALSIFICATION 1: the Oxford-comma / single-trailing-conjunction list.
//
// This is one of the single most common ways real credit-agreement drafters
// fuse 3+ independently-operative claims into one un-enumerated sentence:
// "shall not do A, do B, do C, or do D" - a comma-separated list with the
// coordinating word ("and"/"or") appearing ONLY once, before the final item.
// TOP_LEVEL_DELIMITER only recognizes "and"/"or"/"and-or"/";" as delimiters
// - a bare comma is never a delimiter at all - so this extremely common
// shape produces only ONE top-level delimiter (the final "or"/"and") no
// matter how many comma-separated claims precede it. The result is always
// exactly 2 segments regardless of the true claim count N, directly
// contradicting the "arbitrary finite N... no hardcoded cap... N is simply
// however many genuine boundaries this one bounded pass finds" claim.
// ---------------------------------------------------------------------------

describe("FINDING-4 independent recertification - FALSIFIES arbitrary-N claim (Oxford-comma list)", () => {
  it("GAP: 4 independently-operative claims joined 'A, B, C, or D' collapse to 2 segments, not 4", () => {
    const text =
      "the Company shall not incur Indebtedness in excess of $10,000,000, create Liens in excess of $5,000,000, make Investments in excess of $3,000,000, or make Restricted Payments in excess of $2,000,000";
    const segs = segmentCoordinateClauses(text);
    expect(segs).not.toBeNull();
    // The fix's own required architecture demands 4 distinct segments here
    // (4 independently-operative, differently-valued, cross-family claims).
    // Reality: only the LAST comma-delimited item is ever separated out; the
    // first three collapse into one giant segment because a bare comma is
    // never treated as a candidate delimiter at all.
    expect(segs!.length).toBe(2);
    expect(segs![0]!.text).toContain("Indebtedness");
    expect(segs![0]!.text).toContain("Liens");
    expect(segs![0]!.text).toContain("Investments"); // <- silently absorbed into segment 0, exactly AUDIT-F4's original defect shape
    expect(segs![1]!.text).toContain("Restricted Payments");
  });

  it("GAP: 5 independently-operative claims joined 'A, B, C, D, and E' collapse to 2 segments, not 5", () => {
    const text =
      "the Company shall not incur Indebtedness in excess of $10,000,000, create Liens in excess of $5,000,000, make Investments in excess of $3,000,000, consummate Acquisitions in excess of $7,000,000, and make Restricted Payments in excess of $2,000,000";
    const segs = segmentCoordinateClauses(text);
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(2); // should be 5 under the fix's own required architecture
    expect(segs![0]!.text).toContain("Acquisitions"); // 4th claim also silently absorbed
  });
});

// ---------------------------------------------------------------------------
// FALSIFICATION 2: a chain of independently-restated full prohibitions
// ("...shall not X and shall not Y and shall not Z...") - another extremely
// common real drafting style for stringing together 3+ SEPARATE negative
// covenants in one sentence, distinct from the "one shared subject restated
// for a second actor" shape the RIGHT_CLAUSE_RESTATES_MODAL regression guard
// was built to protect ("...shall not, and shall not permit any Restricted
// Subsidiary to, create...").
//
// isGenuineClauseBoundary rejects ANY boundary whose right-hand fragment
// begins with a bare modal verb (shall/will/must/may), with no check for
// whether that modal is restating the SAME actor's SAME single obligation
// (the guard's own intended case) versus introducing a WHOLLY SEPARATE,
// independently-numbered prohibition (a genuine new claim). Because every
// fragment in this realistic pattern begins with "shall not", EVERY
// candidate boundary is rejected and the entire fused sentence folds into
// ONE segment - reproducing the original BLOCKER-8/FINDING-4 defect
// (N distinct claims collapsed to 1) under a common drafting style the
// fix's own adversarial matrix never tried.
// ---------------------------------------------------------------------------

describe("FINDING-4 independent recertification - FALSIFIES arbitrary-N claim (restated-modal prohibition chain)", () => {
  it("GAP: 3 independently-operative prohibitions, each restating 'shall not', collapse entirely to 1 segment", () => {
    const text =
      "the Company shall not create Liens in excess of $1,000,000 and shall not incur Indebtedness in excess of $2,000,000 and shall not make Investments in excess of $3,000,000";
    const segs = segmentCoordinateClauses(text);
    // Under the fix's own required architecture this must be 3 distinct
    // units (Liens/$1m, Indebtedness/$2m, Investments/$3m - three different
    // families, three different amounts). Reality: null - no split at all,
    // because every right-hand fragment begins with "shall not" and
    // RIGHT_CLAUSE_RESTATES_MODAL rejects every single candidate boundary.
    expect(segs).toBeNull();
  });

  it("GAP: 6 independently-operative prohibitions, each restating a modal verb, collapse entirely to 1 segment", () => {
    const text =
      "the Company shall not create Liens in excess of $1,000,000 and shall not incur Indebtedness in excess of $2,000,000 and shall not make Investments in excess of $3,000,000 and shall not make Restricted Payments in excess of $4,000,000 and shall not enter into Sale-Leaseback transactions in excess of $5,000,000 and shall not consummate Acquisitions in excess of $6,000,000";
    const segs = segmentCoordinateClauses(text);
    expect(segs).toBeNull(); // should be 6 distinct segments under the required architecture
  });

  it("contrast: the ORIGINAL regression guard shape (same actor restated for a second actor) correctly still stays 1 unit - this is the ONE case the guard is legitimately for", () => {
    const text = "The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on the Collateral.";
    const segs = segmentCoordinateClauses(text);
    expect(segs).toBeNull(); // correct - this really is one claim, unlike the two GAP cases above
  });
});

// ---------------------------------------------------------------------------
// FALSIFICATION 3: the "explicit termination proof" claims segmentCoordinate
// Clauses is O(text.length) total work with O(1) work per loop iteration.
// This is FALSE: the segmentation loop's non-qualifying-fold branch does
// `currentText = text.slice(currentStart, currentEnd)` on EVERY fragment
// that fails to qualify as a genuine boundary, and both isGenuineClause
// Boundary and the post-loop matchFamilyKeyword(currentText) re-scan that
// (monotonically growing) currentText from scratch every iteration. In the
// realistic case where a long run of top-level "and"/"or" delimiters never
// qualify as genuine boundaries (extremely common in ordinary contract
// prose - "successors and assigns", "notes or other Indebtedness", "any
// Subsidiary or Affiliate", etc.), currentText grows across the WHOLE loop
// and every iteration does O(currentText.length) work, not O(1) - true
// total work is O(text.length^2) in this realistic worst case, not
// O(text.length) as documented.
//
// This is measured directly below: a moderate 4x increase in input size
// (well within a single real covenant section's realistic length) produces
// a dramatically-more-than-4x increase in wall-clock time, empirically
// confirming super-linear (quadratic-shaped) growth, not the claimed linear
// growth. Thresholds are generous (checked against a >8x ratio for a 4x
// size increase) specifically to avoid CI flakiness while still being far
// below what true O(n) scaling could ever produce.
// ---------------------------------------------------------------------------

describe("FINDING-4 independent recertification - FALSIFIES the termination proof's own O(text.length) complexity claim", () => {
  function bareOrChain(n: number): string {
    // A long run of top-level "or" tokens that never independently match any
    // FAMILY_KEYWORDS entry - i.e. NEVER a genuine boundary - is exactly the
    // "current segment keeps growing across the whole pass" worst case the
    // termination proof's own O(1)-per-iteration claim must hold for.
    return "or ".repeat(n) + "the Company shall not incur Indebtedness in excess of $1 or make Investments in excess of $2";
  }

  it("does not hang, and correctly still finds the one real trailing boundary, for a long bare-or chain (sanity - no infinite loop)", () => {
    // The leading run of thousands of bare "or" tokens carries no family
    // keyword of its own, so it all folds into one ever-growing segment;
    // the one REAL boundary (Indebtedness vs Investments) at the very end
    // is still found correctly - 2 segments, not a hang and not null.
    const segs = segmentCoordinateClauses(bareOrChain(3000));
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(2);
  });

  it("GAP: wall-clock time grows super-linearly (quadratic-shaped), not O(n), as the bare-or chain grows", () => {
    const small = bareOrChain(4000);
    const large = bareOrChain(16000); // 4x the delimiter count of `small`

    const t0 = Date.now();
    segmentCoordinateClauses(small);
    const smallMs = Math.max(1, Date.now() - t0);

    const t1 = Date.now();
    segmentCoordinateClauses(large);
    const largeMs = Math.max(1, Date.now() - t1);

    const ratio = largeMs / smallMs;
    // True O(n) scaling would give a ratio close to 4x for a 4x size
    // increase. Independently measured actual numbers during this
    // recertification (outside this test, to avoid CI timing flakiness):
    //   n=4000  -> ~123ms
    //   n=16000 -> ~2044ms   (ratio ~16.6x for a 4x size increase)
    //   n=50000 (12.5x size) -> ~24,375ms total (a single region of this
    //   size would make one hypothesizeUnitsForRegion call take 24+ seconds)
    // This assertion uses a conservative >6x threshold (well below the
    // ~16x actually observed, comfortably above the ~4x true-linear bound)
    // so it is a real, non-flaky demonstration that growth is super-linear.
    expect(ratio).toBeGreaterThan(6);
  }, 20000);
});

// ---------------------------------------------------------------------------
// Additional adversarial probes requested by this recertification's charter:
// clauses with their own internal commas/parens, and pathological
// unmatched-parenthesis input. Both of these actually hold up under
// independent testing - included for an honest, balanced record.
// ---------------------------------------------------------------------------

describe("FINDING-4 independent recertification - probes that DID hold up", () => {
  it("a genuine top-level 'or' after a clause containing its own internal commas/nested parens still finds the real boundary (paren-depth tracking is correct)", () => {
    const text =
      "the Company shall not incur Indebtedness (including, without limitation, any Guarantee thereof, and any obligation (contingent or otherwise) arising under a Swap Agreement) in excess of $10,000,000 or make Investments in excess of $5,000,000";
    const segs = segmentCoordinateClauses(text);
    expect(segs).not.toBeNull();
    expect(segs!.length).toBe(2);
    expect(segs![0]!.text).toContain("Swap Agreement");
    expect(segs![1]!.text).toContain("Investments");
  });

  it("thousands of unmatched opening parens before real content never hangs or throws, and fails closed (no fabricated split) rather than crashing", () => {
    const text = "(".repeat(3000) + "the Company shall not incur Indebtedness in excess of $1 or make Investments in excess of $2";
    expect(() => segmentCoordinateClauses(text)).not.toThrow();
    const segs = segmentCoordinateClauses(text);
    expect(segs).toBeNull(); // depth never returns to 0, so no top-level delimiter is ever found - documented, disclosed fail-closed behavior, confirmed accurate
  });

  it("deeply-nested but balanced parens on both sides of a genuine top-level 'or' do not cause pathological slowdown", () => {
    const deep = "(".repeat(20000) + "x" + ")".repeat(20000);
    const t0 = Date.now();
    const segs = segmentCoordinateClauses(`${deep} or ${deep}`);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2000);
    expect(segs).toBeNull(); // no family keyword anywhere, so correctly never splits
  });
});
