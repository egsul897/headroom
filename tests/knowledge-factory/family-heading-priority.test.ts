import { describe, expect, it } from "vitest";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";

describe("family classification heading priority", () => {
  it("keeps Investments primary when heading is Investments even if body mentions Indebtedness", () => {
    const families = classifyFamiliesFromText(
      "The Borrower shall not make any Investment in Indebtedness of any Person except Permitted Investments.",
      "Investments, Loans and Advances",
    );
    expect(families[0]).toBe("INVESTMENTS");
    expect(families).toContain("INDEBTEDNESS");
  });

  it("keeps Indebtedness primary for indebtedness headings", () => {
    const families = classifyFamiliesFromText(
      "The Borrower shall not incur any Indebtedness except as permitted below.",
      "Indebtedness",
    );
    expect(families[0]).toBe("INDEBTEDNESS");
  });

  it("inherits Investments from composite parent/child heading strings", () => {
    const families = classifyFamiliesFromText(
      "(i) Purchase or acquire Indebtedness of any Person; provided that …",
      "Investments, Loans and Advances / 10.04(i)",
    );
    expect(families[0]).toBe("INVESTMENTS");
  });
});
