/**
 * Rule 36 — Ask's proposed-amount parser must not drop "thousand".
 *
 * parseProposedAmount had no thousand branch: "$150.0 thousand"
 * parsed as "$150" — a 1000x understatement of the proposed
 * amount shown in the Ask amount lead (same class as rule 18).
 * Bare amounts stay raw dollars; thousand multiplies by 1,000.
 */
import { describe, expect, it } from "vitest";
import { parseProposedAmount } from "../../lib/product/covenant-intelligence/parse-proposed-amount";

describe("parseProposedAmount", () => {
  it("converts $150.0 thousand to $150,000", () => {
    expect(parseProposedAmount("Can we incur $150.0 thousand of secured debt?")).toBe("$150,000");
  });

  it("converts bare '150 thousand of secured debt' to $150,000", () => {
    expect(parseProposedAmount("Can we incur 150 thousand of secured debt?")).toBe("$150,000");
  });

  it("keeps bare $5,000 as raw dollars", () => {
    expect(parseProposedAmount("Can we incur $5,000 of debt?")).toBe("$5,000");
  });

  it("keeps $150 million", () => {
    expect(parseProposedAmount("Can we incur $150 million of secured debt?")).toBe("$150 million");
  });

  it("keeps $2.5 billion", () => {
    expect(parseProposedAmount("Can we incur $2.5 billion of debt?")).toBe("$2.5 billion");
  });

  it("returns null when no amount is present", () => {
    expect(parseProposedAmount("What are the debt baskets?")).toBeNull();
  });
});
