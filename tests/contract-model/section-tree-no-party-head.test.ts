import { describe, expect, it } from "vitest";
import {
  classifyCovenantFamily,
  isObligorProhibitionLead,
} from "../../lib/contract-model/section-tree/family-classifier";

/**
 * Regression: a "No <Party> will/shall/may" prohibition whose party head spans a
 * line break ("No Loan\nParty will ...") was filtered out as a standalone
 * "Loan" head, so the section classified as no covenant family at all.
 * The head-word guard (NOT_PARTY_HEAD, "Loan(?! Part)") must see normalized
 * spacing, not raw line breaks.
 */
describe("No <Party> prohibition with line break in the party head", () => {
  it("treats 'No Loan\\nParty will ...' as an obligor prohibition", () => {
    expect(
      isObligorProhibitionLead(
        "No Loan\nParty will, nor will it permit any Restricted Subsidiary to, make any investment.",
      ),
    ).toBe(true);
  });

  it("classifies a line-broken 'No Loan Party will' investments lead-in as INVESTMENTS", () => {
    const v = classifyCovenantFamily({
      title: "Investments, Loans, Advances, Guarantees and Acquisitions",
      parentTitle: null,
      leadIn:
        "No Loan\nParty will, nor will it permit any Restricted Subsidiary to, make or permit to exist any investment in any other Person, except:",
      covenantContext: true,
    });
    expect(v.families).toContain("INVESTMENTS");
  });

  it("treats a tab-split 'No Loan\\tParty will ...' as an obligor prohibition", () => {
    expect(
      isObligorProhibitionLead(
        "No Loan\tParty will, nor will it permit any Restricted Subsidiary to, make any investment.",
      ),
    ).toBe(true);
  });

  it("still excludes a standalone 'No Loan shall ...' head (the loan itself, not a party)", () => {
    expect(
      isObligorProhibitionLead("No Loan shall be made available to any Person other than the Borrower."),
    ).toBe(false);
    expect(
      isObligorProhibitionLead("No Loan\nshall be made available to any Person other than the Borrower."),
    ).toBe(false);
  });
});
