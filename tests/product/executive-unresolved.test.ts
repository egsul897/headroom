/**
 * Rule 48 — the executive "unresolved" list must disclose
 * truncation.
 *
 * The old code silently truncated: an item with 3 unresolved
 * questions showed only the first, and a workspace with 20
 * questions showed 8, with no marker that the list was
 * partial. Same disclosure rule as summary/compare caps
 * (rules 7/31): a cap must say it is a cap.
 */
import { describe, expect, it } from "vitest";
import { executiveUnresolved } from "../../lib/product/customer-intelligence/executive-unresolved";

describe("executiveUnresolved", () => {
  it("discloses when an item has more questions than shown", () => {
    const out = executiveUnresolved([
      { sectionRef: "6.01", unresolvedQuestions: ["Q1", "Q2", "Q3"] },
    ]);
    expect(out).toEqual(["§6.01: Q1", "… and 2 more unresolved question(s) — see the covenant categories below."]);
  });

  it("discloses when more than 8 items have questions", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      sectionRef: `6.0${i}`,
      unresolvedQuestions: [`Q${i}`],
    }));
    const out = executiveUnresolved(items);
    expect(out).toHaveLength(9);
    expect(out[8]).toBe("… and 2 more unresolved question(s) — see the covenant categories below.");
  });

  it("shows everything with no marker when nothing is truncated", () => {
    const out = executiveUnresolved([
      { sectionRef: "6.01", unresolvedQuestions: ["Q1"] },
      { sectionRef: "6.02", unresolvedQuestions: ["Q2"] },
    ]);
    expect(out).toEqual(["§6.01: Q1", "§6.02: Q2"]);
  });

  it("dedups identical questions", () => {
    const out = executiveUnresolved([
      { sectionRef: "6.01", unresolvedQuestions: ["Same?", "Same?"] },
    ]);
    expect(out).toEqual(["§6.01: Same?"]);
  });
});
