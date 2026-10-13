/**
 * Adversarial: fixed-dollar caps must not assume indebtedness; FULL_DOCUMENT
 * attribution alone cannot authorize executable Position claims.
 */
import { describe, expect, it } from "vitest";
import {
  classifyProvisionLegalContext,
  isProvisionScopedAttribution,
} from "@/lib/product/real-dashboard-vertical-slice/provision-legal-context";
import { compileVerifiedFixedDollarBridge } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";

const CAP = "not to exceed $25,000,000";

function unit(
  section: string,
  text: string,
  id = "c1",
): Parameters<typeof compileVerifiedFixedDollarBridge>[0]["candidates"][number] {
  return {
    candidateId: id,
    documentId: "doc-a",
    sourceSectionRef: section,
    operativeSourceText: text,
    relatedLeafCode: null,
  };
}

describe("provision legal context — family/action", () => {
  it("resolves debt / lien / investment / RP / asset-sale distinctly", () => {
    expect(
      classifyProvisionLegalContext(
        `The Borrower shall not Incur Indebtedness in an aggregate principal amount outstanding ${CAP}.`,
      ),
    ).toMatchObject({ status: "RESOLVED", family: "INDEBTEDNESS", action: "INCUR_DEBT" });

    expect(
      classifyProvisionLegalContext(
        `The Borrower shall not create Liens on any Property in an aggregate amount ${CAP}.`,
      ),
    ).toMatchObject({ status: "RESOLVED", family: "LIENS", action: "CREATE_LIEN" });

    expect(
      classifyProvisionLegalContext(
        `Investments in any Person shall not exceed ${CAP} in the aggregate.`,
      ),
    ).toMatchObject({ status: "RESOLVED", family: "INVESTMENTS", action: "MAKE_INVESTMENT" });

    expect(
      classifyProvisionLegalContext(
        `Restricted Payments (including Dividends) shall not exceed ${CAP}.`,
      ),
    ).toMatchObject({
      status: "RESOLVED",
      family: "RESTRICTED_PAYMENTS",
      action: "MAKE_RESTRICTED_PAYMENT",
    });

    expect(
      classifyProvisionLegalContext(
        `Asset Sales of any Property shall not exceed ${CAP} in any fiscal year.`,
      ),
    ).toMatchObject({ status: "RESOLVED", family: "ASSET_SALES", action: "DISPOSE_ASSET" });
  });

  it("refuses ambiguous multi-family and unsupported bare dollar caps", () => {
    const ambiguous = classifyProvisionLegalContext(
      `Indebtedness and Liens and Restricted Payments shall not exceed ${CAP}.`,
    );
    expect(ambiguous.status).toBe("AMBIGUOUS");
    expect(ambiguous.family).toBeNull();

    const bare = classifyProvisionLegalContext(
      `The Company may enter into transactions ${CAP} with Affiliates.`,
    );
    expect(bare.status).toBe("UNSUPPORTED");
    expect(bare.family).toBeNull();
  });

  it("FULL_DOCUMENT attribution is never provision-scoped", () => {
    expect(isProvisionScopedAttribution("FULL_DOCUMENT")).toBe(false);
    expect(isProvisionScopedAttribution("WHOLE_AGREEMENT")).toBe(false);
    expect(isProvisionScopedAttribution("")).toBe(false);
    expect(isProvisionScopedAttribution("7.03(f)")).toBe(true);
  });
});

describe("VE bridge — adversarial family + attribution", () => {
  it("does not publish executable claims for FULL_DOCUMENT-only attribution", () => {
    const result = compileVerifiedFixedDollarBridge({
      companyId: "co",
      instrumentKey: "inst",
      asOfDate: "2024-12-31",
      candidates: [
        unit(
          "FULL_DOCUMENT",
          `Indebtedness under Debt Facilities in an aggregate principal amount outstanding ${CAP}.`,
          "fd-full",
        ),
      ],
    });
    const u = result.verifiedExecutableUnits[0]!;
    expect(u.feedsPosition).toBe(false);
    expect(u.sourceBackedGrossCapacityMm).toBeNull();
    expect(u.valueClass).toBe("UNSUPPORTED");
    expect(u.classificationClass).toBe("ATTRIBUTION_INCOMPLETE");
    expect(result.verifiedExecutableUnitsFeedingPosition).toBe(0);
  });

  it("lien / investment / RP / asset-sale caps do not compile as Indebtedness defaults", () => {
    const cases = [
      {
        id: "lien",
        text: `create or suffer to exist Liens securing obligations in an aggregate amount ${CAP}.`,
        familySignal: /lien/i,
      },
      {
        id: "inv",
        text: `Investments in Subsidiaries in an aggregate amount ${CAP}.`,
        familySignal: /investment/i,
      },
      {
        id: "rp",
        text: `Restricted Payments including Dividends in an aggregate amount ${CAP}.`,
        familySignal: /restricted|dividend/i,
      },
      {
        id: "sale",
        text: `Asset Sales of any Property in an aggregate amount ${CAP}.`,
        familySignal: /asset/i,
      },
    ] as const;

    for (const c of cases) {
      const legal = classifyProvisionLegalContext(c.text);
      expect(legal.status).toBe("RESOLVED");
      expect(legal.family).not.toBe("INDEBTEDNESS");

      const result = compileVerifiedFixedDollarBridge({
        companyId: "co",
        instrumentKey: "inst",
        asOfDate: "2024-12-31",
        candidates: [unit("7.05", c.text, c.id)],
      });
      const u = result.verifiedExecutableUnits[0]!;
      // May be VE gross for fixed-dollar sole caps, or refuse — but never silent debt default.
      if (u.feedsPosition) {
        expect(u.sourceBackedGrossCapacityMm).toBe(25);
        expect(legal.family).not.toBe("INDEBTEDNESS");
      } else {
        // Refusal is acceptable when fidelity/gates block; must not invent debt family.
        expect(u.valueClass).not.toBe("SOURCE_BACKED_COMPILED_GROSS");
      }
      expect(c.familySignal.test(c.text)).toBe(true);
    }
  });

  it("ambiguous family refuses Position feed", () => {
    const result = compileVerifiedFixedDollarBridge({
      companyId: "co",
      instrumentKey: "inst",
      asOfDate: "2024-12-31",
      candidates: [
        unit(
          "7.01",
          `Indebtedness and Liens shall not exceed ${CAP} in the aggregate.`,
          "amb",
        ),
      ],
    });
    const u = result.verifiedExecutableUnits[0]!;
    expect(u.feedsPosition).toBe(false);
    expect(u.classificationClass).toBe("AMBIGUOUS");
    expect(u.sourceBackedGrossCapacityMm).toBeNull();
  });

  it("debt fixed-dollar with provision section still feeds GROSS when fidelity passes", () => {
    const text =
      `Debt under Debt Facilities in an aggregate principal amount outstanding not to exceed $100,000,000.`;
    expect(classifyProvisionLegalContext(text).family).toBe("INDEBTEDNESS");
    const result = compileVerifiedFixedDollarBridge({
      companyId: "co",
      instrumentKey: "inst",
      asOfDate: "2024-12-31",
      candidates: [unit("7.03(f)", text, "debt")],
    });
    const u = result.verifiedExecutableUnits[0]!;
    expect(u.feedsPosition).toBe(true);
    expect(u.sourceBackedGrossCapacityMm).toBe(100);
    expect(u.valueClass).toBe("SOURCE_BACKED_COMPILED_GROSS");
  });
});
