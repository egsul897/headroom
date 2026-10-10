/**
 * Batch 1 — CONMED operative hierarchy (source-backed ground truth).
 * Doc C amends the Seventh A&R, not the Eighth (Doc A). A resolver that
 * collapses same-titled credit agreements across generations is a
 * false-favorable / wrong-operative defect class.
 *
 * Expectations come from human-ground-truth.ts (authored from source),
 * never from engine discovery output.
 */
import { describe, expect, it } from "vitest";
import { PACKAGE_FACTS } from "../fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth";

describe("corpus batch1 — CONMED amendment target identity", () => {
  it("ground truth: Doc C targets Seventh A&R, not Eighth (Doc A)", () => {
    const pkg3 = PACKAGE_FACTS.find((f) => f.id === "pkg-3");
    expect(pkg3).toBeDefined();
    expect(pkg3!.fact).toMatch(/Seventh Amended and Restated/i);
    expect(pkg3!.fact).toMatch(/NOT part of this package|not Document A/i);
    expect(pkg3!.clarity).toBe("CLEAR");
  });

  it("ground truth: Doc D amends both Doc A and Doc B", () => {
    const pkg4 = PACKAGE_FACTS.find((f) => f.id === "pkg-4");
    expect(pkg4).toBeDefined();
    expect(pkg4!.fact).toMatch(/Eighth Amended and Restated Credit Agreement/i);
    expect(pkg4!.fact).toMatch(/Guarantee and Collateral Agreement/i);
  });

  it("ground truth: Doc A is the operative base CA", () => {
    const pkg1 = PACKAGE_FACTS.find((f) => f.id === "pkg-1");
    expect(pkg1!.fact).toMatch(/BASE, currently-operative/i);
    expect(pkg1!.fact).toMatch(/Eighth Amended and Restated Credit Agreement/i);
  });
});
