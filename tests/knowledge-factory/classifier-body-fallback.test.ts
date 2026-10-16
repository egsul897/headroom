/**
 * General rule from precedent evidence (run 1): 28% of the public corpus
 * sat at UNKNOWN document class because the classifier only reads
 * titles/metadata. A document with a generic exhibit title ("Exhibit
 * 10.1") but an unmistakable covenant body must classify from the body
 * at capped confidence — with the fallback recorded in signals — rather
 * than storing a bare UNKNOWN.
 *
 * Fail-closed guards: single-heading bodies, mixed party-role signals,
 * and governance exhibits stay UNKNOWN.
 */
import { describe, expect, it } from "vitest";
import { classifyDebtDocument } from "../../lib/knowledge-factory/classify/debt-document";

const INDENTURE_BODY = `
Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.
Section 6.03 Limitation on Liens. The Issuer shall not create any Lien upon any of its assets except Permitted Liens.
Section 8.01 Events of Default. If an Event of Default occurs, the Trustee may declare the Notes due and payable.
The Notes are issued under this Indenture. The Trustee shall hold the funds.
`;

const CREDIT_BODY = `
ARTICLE VII NEGATIVE COVENANTS
Section 7.01 Indebtedness. The Borrower shall not incur Indebtedness except Permitted Indebtedness.
Section 7.02 Liens. The Borrower shall not create any Lien upon any of its property except Permitted Liens.
Section 7.06 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted herein.
The Lenders commit to the facility. The Administrative Agent shall administer the loans.
`;

describe("classifier body-structure fallback", () => {
  it("generic title + indenture body classifies INDENTURE at capped confidence", () => {
    const r = classifyDebtDocument({ title: "Exhibit 10.1", textSample: INDENTURE_BODY });
    expect(r.documentClass).toBe("INDENTURE");
    expect(r.confidence).toBeLessThanOrEqual(0.65);
    expect(r.signals).toContain("body_covenant_structure_fallback");
  });

  it("generic title + credit-agreement body classifies CREDIT_AGREEMENT", () => {
    const r = classifyDebtDocument({ title: "Exhibit 10.1", textSample: CREDIT_BODY });
    expect(r.documentClass).toBe("CREDIT_AGREEMENT");
    expect(r.confidence).toBeLessThanOrEqual(0.65);
    expect(r.signals).toContain("body_covenant_structure_fallback");
  });

  it("single covenant heading is not enough structure — stays UNKNOWN", () => {
    const r = classifyDebtDocument({
      title: "Exhibit 10.1",
      textSample:
        "Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness. The Trustee shall hold the funds.",
    });
    expect(r.documentClass).toBe("UNKNOWN");
    expect(r.signals).not.toContain("body_covenant_structure_fallback");
  });

  it("mixed party-role signals stay UNKNOWN (ambiguous, fail-closed)", () => {
    const r = classifyDebtDocument({
      title: "Exhibit 10.1",
      textSample: `${INDENTURE_BODY}\nThe Borrower and the Lenders agree the Administrative Agent shall act.`,
    });
    expect(r.documentClass).toBe("UNKNOWN");
  });

  it("covenant-free generic exhibit stays UNKNOWN", () => {
    const r = classifyDebtDocument({
      title: "Exhibit 10.1",
      textSample: "This exhibit contains the form of officer certificate.",
    });
    expect(r.documentClass).toBe("UNKNOWN");
  });
});
