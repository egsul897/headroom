/**
 * Colon-style definitions ("Term": ...) in the EBITDA definition lookup. Synthetic text only.
 */
import { describe, expect, it } from "vitest";

describe("definition lookup: colon convention", () => {
  it("finds a \u201cTerm\u201d: definition and ends it at the next colon-style or means-style term", async () => {
    const { findDefinitionText, findEbitdaMeasureTerm } = await import("../../lib/covenant-learning-factory/xbrl/definition-items");
    const doc = [
      "\u201cCapital Expenditures\u201d: for any period, additions to property.",
      "\u201cConsolidated EBITDA\u201d: for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in computing Consolidated Net Income, (a) interest expense, (b) provision for taxes based on income, (c) depreciation and amortization expense and (d) non-cash charges; provided that the aggregate amount added back pursuant to clause (d) shall not exceed $5,000,000 for any period.",
      "\u201cConsolidated Net Income\u201d: for any period, the net income of the Borrower.",
      "\u201cFixed Charges\u201d means, for any period, cash interest expense.",
    ].join("\n");
    expect(findEbitdaMeasureTerm(doc)).toBe("Consolidated EBITDA");
    const def = findDefinitionText(doc, "Consolidated EBITDA")!;
    expect(def).toMatch(/^"Consolidated EBITDA": for any period/);
    expect(def).toContain("$5,000,000 for any period.");
    expect(def).not.toContain("Consolidated Net Income\": for any period, the net income");
    // a quoted word followed by a colon with no space is not a definition
    expect(findDefinitionText("\u201cAttention\u201d:Treasurer", "Attention")).toBeNull();
  });
});
