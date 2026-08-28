/**
 * Phase 3C Layer 1a synthetic tests - source-inventory.ts. Generic,
 * synthetic fact patterns only (never real FWRG/LSB text/numbers).
 */
import { describe, expect, it } from "vitest";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";

describe("Phase 3C Layer 1a - source-side economic inventory", () => {
  it("extracts a flat dollar amount with its real parsed numeric value", () => {
    const text = "The Company may incur Indebtedness in an aggregate amount not to exceed $10,000,000 at any time outstanding.";
    const inv = buildSourceInventory("case-1", text, "doc-1", "§9.01", null);
    const amounts = inv.items.filter((i) => i.kind === "AMOUNT");
    expect(amounts).toHaveLength(1);
    expect(amounts[0]?.numericValue).toBe(10000000);
  });

  it("extracts a percent and a ratio with correct fraction/decimal values", () => {
    const text = "...not to exceed 10% of Consolidated Total Assets, so long as the Leverage Ratio does not exceed 4.00 to 1.00.";
    const inv = buildSourceInventory("case-2", text, "doc-1", "§9.02", null);
    const percents = inv.items.filter((i) => i.kind === "PERCENT");
    const ratios = inv.items.filter((i) => i.kind === "RATIO");
    expect(percents[0]?.numericValue).toBeCloseTo(0.1);
    expect(ratios[0]?.numericValue).toBeCloseTo(4.0);
  });

  it("detects a greater-of construction and metric mentions", () => {
    const text = "...the greater of $5,000,000 and 8% of Consolidated Net Income.";
    const inv = buildSourceInventory("case-3", text, "doc-1", "§9.03", null);
    expect(inv.items.some((i) => i.kind === "COMPARISON_OPERATOR" && /greater of/i.test(i.rawText))).toBe(true);
    expect(inv.items.some((i) => i.kind === "METRIC_MENTION" && i.rawText.includes("Consolidated Net Income"))).toBe(true);
  });

  it("counts genuine independent enumerated units, distinguishing them from a bare citation list", () => {
    const withRealBaskets = "(a) Indebtedness not to exceed $10,000,000; (b) Indebtedness incurred to refinance existing debt; (c) Indebtedness owed to Affiliates in the ordinary course of business.";
    const citationList = "Indebtedness permitted under clauses (j), (m), (n)(ii)(C), (u) above.";
    const invReal = buildSourceInventory("case-4a", withRealBaskets, "doc-1", "§9.04", null);
    const invCitation = buildSourceInventory("case-4b", citationList, "doc-1", "§9.04", null);
    expect(invReal.apparentIndependentUnitCount).toBe(3);
    expect(invCitation.apparentIndependentUnitCount).toBe(0);
  });

  it("stable content-derived item identity: identical text produces identical itemIds, never random", () => {
    const text = "$1,000,000 aggregate cap.";
    const inv1 = buildSourceInventory("case-5", text, "doc-1", "§9.05", null);
    const inv2 = buildSourceInventory("case-5", text, "doc-1", "§9.05", null);
    expect(inv1.items.map((i) => i.itemId)).toEqual(inv2.items.map((i) => i.itemId));
  });

  it("detects entity-scope and transaction-action signals generically", () => {
    const text = "No Restricted Subsidiary shall guarantee any Indebtedness of an Unrestricted Subsidiary.";
    const inv = buildSourceInventory("case-6", text, "doc-1", "§9.06", null);
    expect(inv.items.some((i) => i.kind === "ENTITY_SCOPE_TERM" && i.rawText === "Restricted Subsidiary")).toBe(true);
    expect(inv.items.some((i) => i.kind === "TRANSACTION_ACTION_SIGNAL")).toBe(true);
  });

  it("returns an empty, valid inventory for text with no economic signals at all", () => {
    const inv = buildSourceInventory("case-7", "This section is intentionally left blank.", "doc-1", "§9.07", null);
    expect(inv.items).toHaveLength(0);
    expect(inv.apparentIndependentUnitCount).toBe(0);
  });
});
