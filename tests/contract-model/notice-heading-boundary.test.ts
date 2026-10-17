import { describe, expect, it } from "vitest";
import { familyEvidence } from "@/lib/contract-model/section-tree/semantics";

describe("notice-duty headings stop at the next heading", () => {
  it("a notice duty under 'Debt and Liens' followed by '5.18 No Distributions ... shall not' is not liens or debt evidence", () => {
    const t = "5.17\nDebt and Liens\n\nCorporation will in reasonable\ntime and due manner inform the Purchaser of any new liens and debts incurred by the Corporation.\n\n16\n\n5.18\nNo Distributions\nThe Corporation shall not declare any dividend.\n";
    expect(familyEvidence(t, "LIENS")).toEqual([]);
    expect(familyEvidence(t, "DEBT")).toEqual([]);
  });
});
