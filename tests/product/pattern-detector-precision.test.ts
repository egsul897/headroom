/**
 * Precedent-review finding: the pattern detectors feed the product
 * directly (candidate signals in candidates.ts, draftingPatterns in
 * analyze-provision.ts), but several fire on generic words with no
 * covenant context — so the next upload would show "shared capacity"
 * on every siloed basket, "equity cure" on every default cure period,
 * and "fixed-dollar basket" on every purchase price.
 *
 * Each case below pairs a false-positive trap (must NOT fire) with a
 * genuine instance (must fire).
 */
import { describe, expect, it } from "vitest";
import { detectPatternsInText } from "../../lib/knowledge-factory/patterns/library";

describe("pattern detector precision", () => {
  it("shared-capacity: 'aggregate principal amount' is a siloed basket, not shared capacity", () => {
    const trap = detectPatternsInText(
      "(a) Indebtedness in an aggregate principal amount not to exceed $150,000,000.",
    );
    expect(trap).not.toContain("shared-capacity");
    const genuine = detectPatternsInText(
      "The basket may be shared across Indebtedness and Liens; combined capacity shall not exceed $100,000,000.",
    );
    expect(genuine).toContain("shared-capacity");
  });

  it("financial-covenant-cure: a default cure period is not an equity cure", () => {
    const trap = detectPatternsInText(
      "Upon an Event of Default, the Issuer shall have 30 days to cure such Default. Consolidated EBITDA for the period was $50,000,000.",
    );
    expect(trap).not.toContain("financial-covenant-cure");
    const genuine = detectPatternsInText(
      "The Borrower may cure a Financial Covenant Default by an equity contribution, and Consolidated EBITDA shall be increased by the amount of such contribution.",
    );
    expect(genuine).toContain("financial-covenant-cure");
  });

  it("reclassification: accounting reclassification is not basket reclassification", () => {
    const trap = detectPatternsInText(
      "The Company reclassified prior period amounts in its financial statements for comparative purposes.",
    );
    expect(trap).not.toContain("reclassification");
    const genuine = detectPatternsInText(
      "The Issuer may reclassify Indebtedness from one basket to another basket under which such Indebtedness was deemed incurred.",
    );
    expect(genuine).toContain("reclassification");
  });

  it("refinancing-debt: refinancing risk talk is not a refinancing permission", () => {
    const trap = detectPatternsInText(
      "The Company faces refinancing risk if market conditions deteriorate.",
    );
    expect(trap).not.toContain("refinancing-debt");
    const genuine = detectPatternsInText(
      "The Issuer may incur Indebtedness to refinance outstanding Indebtedness.",
    );
    expect(genuine).toContain("refinancing-debt");
  });

  it("fixed-dollar-basket: a bare dollar amount is not a basket", () => {
    const trap = detectPatternsInText("The purchase price is $150,000,000 payable at closing.");
    expect(trap).not.toContain("fixed-dollar-basket");
    const genuine = detectPatternsInText(
      "The Issuer shall not incur Indebtedness except Permitted Indebtedness in an aggregate principal amount not to exceed $150,000,000.",
    );
    expect(genuine).toContain("fixed-dollar-basket");
  });

  it("asset-sale-reinvestment: generic reinvestment is not asset-sale reinvestment", () => {
    const trap = detectPatternsInText(
      "The Company reinvests profits in research and development.",
    );
    expect(trap).not.toContain("asset-sale-reinvestment");
    const genuine = detectPatternsInText(
      "Net Proceeds from any Asset Sale may be reinvested in the business within 365 days, failing which the Issuer shall prepay the Notes.",
    );
    expect(genuine).toContain("asset-sale-reinvestment");
  });
});
