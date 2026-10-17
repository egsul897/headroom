import { describe, expect, it } from "vitest";
import { familyEvidence } from "@/lib/contract-model/section-tree/semantics";

const toc = "TABLE OF CONTENTS\n\nARTICLE VII NEGATIVE COVENANTS\n59\n\nSection 7.01\nLiens\n59\n\nSection 7.02\nInvestments\n59 60\n\n7.04\n\nFundamental Changes\n\n152 146\n\n";
const amendment = "AMENDMENT NO. 4 TO CREDIT AGREEMENT\n\n1. Amendments. Section 1.01 of the Credit Agreement is hereby amended by restating the definition of Applicable Margin.\n\n2. Conditions Precedent. This Amendment shall become effective on the date hereof.\n";

describe("index-only family evidence", () => {
  it("a table-of-contents entry whose section body is not in the document is not evidence", () => {
    const text = toc + amendment;
    expect(familyEvidence(text, "LIENS")).toEqual([]);
    expect(familyEvidence(text, "INVESTMENTS")).toEqual([]);
    expect(familyEvidence(text, "FUNDAMENTAL_CHANGES")).toEqual([]);
  });
  it("the same index entry still counts when the section body appears later", () => {
    const text = toc + amendment + "\nSection 7.01 Liens. The Borrower shall not create, incur, assume or suffer to exist any Lien upon any of its property, except Permitted Liens.\n";
    expect(familyEvidence(text, "LIENS").length).toBeGreaterThan(0);
    // a later body whose own heading is not a numbered line still counts through its lead-in
    const text2 = toc + amendment + "\nThe Borrower will not, and will not permit any Subsidiary to, create, incur or suffer to exist any Lien on its assets.\n";
    expect(familyEvidence(text2, "LIENS").length).toBeGreaterThan(0);
  });
});
