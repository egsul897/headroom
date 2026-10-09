import { describe, expect, it } from "vitest";
import { classifyDebtDocument, stripIdentityTokens } from "../../lib/knowledge-factory/classify/debt-document";
import { scoreDiscoveryPotential } from "../../lib/knowledge-factory/rank/discovery-score";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";

describe("anti-overfitting: identity independence", () => {
  it("classification ignores company names and accession numbers", () => {
    const titled = "Credit Agreement among Chewy, Inc. and JPMorgan Chase Bank, N.A.";
    const stripped = stripIdentityTokens("Credit Agreement among Chewy, Inc. and JPMorgan Chase Bank, N.A. Accession 0001766502-26-000123");
    expect(classifyDebtDocument({ title: titled }).documentClass).toBe("CREDIT_AGREEMENT");
    expect(classifyDebtDocument({ title: stripped }).documentClass).toBe("CREDIT_AGREEMENT");
  });

  it("discovery score depends on covenant language, not fixture IDs", () => {
    const body = "Section 6.01 Indebtedness. Restricted Payments. Available Amount. Liens. EBITDA.";
    const withIds = `${body} fixture:fwrg-2021-credit-agreement companyId=conmed`;
    expect(scoreDiscoveryPotential(body).score).toBe(scoreDiscoveryPotential(withIds).score);
  });

  it("family classification does not require issuer-specific headings", () => {
    const families = classifyFamiliesFromText(
      "The Borrower shall not make any Restricted Payment except as permitted hereunder using the Available Amount.",
      "Section 7.06 Restricted Payments",
    );
    expect(families).toContain("RESTRICTED_PAYMENTS");
  });
});
