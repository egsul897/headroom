/**
 * Cross-domain debt / lien / investment / RP / asset-sale GROSS selection
 * for Position → Simulate. Fail-closed on AMBIGUOUS; never first-match.
 */

import { describe, expect, it } from "vitest";
import {
  CROSS_DOMAIN_PRIMARY_FAMILY,
  selectCrossDomainSourceBackedGross,
} from "@/lib/customer-workflow/cross-domain-capacity";
import { compileVerifiedFixedDollarBridge } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";

const INSTRUMENT = "demo-credit-facility";
const GOVERNING = "amended-restated-credit-agreement-2022";

function compileMultiDomain() {
  return compileVerifiedFixedDollarBridge({
    companyId: "co",
    instrumentKey: INSTRUMENT,
    asOfDate: "2024-12-31",
    candidates: [
      {
        candidateId: "debt-1300",
        documentId: GOVERNING,
        sourceSectionRef: "7.03(a)",
        operativeSourceText:
          "Indebtedness of the Company and its Restricted Subsidiaries not to exceed $1,300,000,000.",
        relatedLeafCode: null,
      },
      {
        candidateId: "lien-50",
        documentId: GOVERNING,
        sourceSectionRef: "7.01(b)",
        operativeSourceText:
          "Liens on property of the Company and its Restricted Subsidiaries not to exceed $50,000,000.",
        relatedLeafCode: null,
      },
      {
        candidateId: "inv-25",
        documentId: GOVERNING,
        sourceSectionRef: "7.05(c)",
        operativeSourceText:
          "Investments by the Company and its Restricted Subsidiaries not to exceed $25,000,000.",
        relatedLeafCode: null,
      },
      {
        candidateId: "rp-10",
        documentId: GOVERNING,
        sourceSectionRef: "7.06(a)",
        operativeSourceText:
          "Restricted Payments by the Company and its Restricted Subsidiaries not to exceed $10,000,000.",
        relatedLeafCode: null,
      },
      {
        candidateId: "asset-75",
        documentId: GOVERNING,
        sourceSectionRef: "7.05(a)",
        operativeSourceText:
          "Asset Sales of the Company and its Restricted Subsidiaries not to exceed $75,000,000.",
        relatedLeafCode: null,
      },
    ],
  });
}

describe("cross-domain capacity — transaction → family GROSS", () => {
  it("maps each transaction kind to the correct primary family", () => {
    expect(CROSS_DOMAIN_PRIMARY_FAMILY.SECURED_DEBT).toBe("INDEBTEDNESS");
    expect(CROSS_DOMAIN_PRIMARY_FAMILY.LIEN).toBe("LIENS");
    expect(CROSS_DOMAIN_PRIMARY_FAMILY.INVESTMENT).toBe("INVESTMENTS");
    expect(CROSS_DOMAIN_PRIMARY_FAMILY.RESTRICTED_PAYMENT).toBe("RESTRICTED_PAYMENTS");
    expect(CROSS_DOMAIN_PRIMARY_FAMILY.ASSET_SALE).toBe("ASSET_SALES");
  });

  it("resolves debt / lien / investment / RP / asset-sale GROSS independently", () => {
    const compile = compileMultiDomain();

    const debt = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "UNSECURED_DEBT",
      governingDocumentId: GOVERNING,
    });
    expect(debt.overallStatus).toBe("RESOLVED");
    expect(debt.primaryGrossMm).toBe(1300);

    const lien = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "LIEN",
      governingDocumentId: GOVERNING,
    });
    expect(lien.overallStatus).toBe("RESOLVED");
    expect(lien.primaryGrossMm).toBe(50);

    const inv = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "INVESTMENT",
      governingDocumentId: GOVERNING,
    });
    expect(inv.overallStatus).toBe("RESOLVED");
    expect(inv.primaryGrossMm).toBe(25);

    const rp = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "RESTRICTED_PAYMENT",
      governingDocumentId: GOVERNING,
    });
    expect(rp.overallStatus).toBe("RESOLVED");
    expect(rp.primaryGrossMm).toBe(10);

    const asset = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "ASSET_SALE",
      governingDocumentId: GOVERNING,
    });
    expect(asset.overallStatus).toBe("RESOLVED");
    expect(asset.primaryGrossMm).toBe(75);
  });

  it("does not let lien GROSS masquerade as indebtedness for unsecured debt", () => {
    const compile = compileVerifiedFixedDollarBridge({
      companyId: "co",
      instrumentKey: INSTRUMENT,
      asOfDate: "2024-12-31",
      candidates: [
        {
          candidateId: "lien-only",
          documentId: GOVERNING,
          sourceSectionRef: "7.01(b)",
          operativeSourceText:
            "Liens on property of the Company and its Restricted Subsidiaries not to exceed $50,000,000.",
          relatedLeafCode: null,
        },
      ],
    });
    const debt = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "UNSECURED_DEBT",
      governingDocumentId: GOVERNING,
    });
    expect(debt.overallStatus).toBe("NONE");
    expect(debt.primaryGrossMm).toBeNull();
  });

  it("SECURED_DEBT refuses when related LIENS GROSS is AMBIGUOUS", () => {
    const compile = compileVerifiedFixedDollarBridge({
      companyId: "co",
      instrumentKey: INSTRUMENT,
      asOfDate: "2024-12-31",
      candidates: [
        {
          candidateId: "debt-1300",
          documentId: GOVERNING,
          sourceSectionRef: "7.03(a)",
          operativeSourceText:
            "Indebtedness of the Company and its Restricted Subsidiaries not to exceed $1,300,000,000.",
          relatedLeafCode: null,
        },
        {
          candidateId: "lien-50",
          documentId: GOVERNING,
          sourceSectionRef: "7.01(b)",
          operativeSourceText:
            "Liens on property of the Company and its Restricted Subsidiaries not to exceed $50,000,000.",
          relatedLeafCode: null,
        },
        {
          candidateId: "lien-80",
          documentId: GOVERNING,
          sourceSectionRef: "7.01(c)",
          operativeSourceText:
            "Liens on property of the Company and its Restricted Subsidiaries not to exceed $80,000,000.",
          relatedLeafCode: null,
        },
      ],
    });
    const secured = selectCrossDomainSourceBackedGross({
      compile,
      transactionKind: "SECURED_DEBT",
      governingDocumentId: GOVERNING,
    });
    expect(secured.byFamily.LIENS?.status).toBe("AMBIGUOUS");
    expect(secured.overallStatus).toBe("AMBIGUOUS");
    expect(secured.primaryGrossMm).toBeNull();
  });
});
