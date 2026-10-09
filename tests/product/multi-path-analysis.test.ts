import { describe, expect, it } from "vitest";
import { analyzeMultiPathTransaction } from "../../lib/product/customer-intelligence/multi-path-analysis";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(
  partial: Partial<CovenantSummaryItem> & Pick<CovenantSummaryItem, "sectionRef" | "heading" | "plainEnglish">,
): CovenantSummaryItem {
  return {
    sourceId: "fixture",
    category: "NEGATIVE_COVENANTS",
    sourceCitation: `§${partial.sectionRef}`,
    families: [],
    materialBasketsThresholds: [],
    conditions: [],
    permissions: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: null,
    operativeLanguageExcerpt: null,
    ...partial,
  } as CovenantSummaryItem;
}

describe("multi-path transaction analysis", () => {
  const fin = {
    ebitda: 420,
    cash: 80,
    interestExpense: 55,
    cumulativeNetIncome: 200,
    equityProceedsSinceIssue: 50,
    assumedNewDebtRatePct: 6.5,
    totalDebt: 1100,
    securedDebt: 750,
    totalAssets: 2800,
  };

  it("enumerates debt and lien pathways and does not assume stacking", () => {
    const analysis = analyzeMultiPathTransaction({
      amountMillions: 100,
      kind: "SECURED_DEBT",
      secured: true,
      label: "$100M secured",
      items: [
        item({
          sectionRef: "7.2",
          heading: "Limitation on Indebtedness",
          plainEnglish: "General debt basket greater of $50M and 3% of Consolidated Total Assets",
          materialBasketsThresholds: ["Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets"],
        }),
        item({
          sectionRef: "7.2b",
          heading: "Ratio debt",
          plainEnglish: "Ratio indebtedness so long as Total Net Leverage does not exceed 5.0 to 1.00",
          materialBasketsThresholds: ["5.0 to 1.00 Total Net Leverage"],
        }),
        item({
          sectionRef: "7.13",
          heading: "Limitation on Liens",
          plainEnglish: "General lien basket",
          materialBasketsThresholds: ["Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets"],
        }),
      ],
      approvals: [
        {
          sourceId: "fixture",
          sectionRef: "7.2",
          category: "NEGATIVE_COVENANTS",
          decision: "ACCEPTED",
          reviewedAt: new Date().toISOString(),
          reviewerLabel: "counsel",
          version: 1,
        },
      ],
      permissions: [
        {
          id: "p1",
          code: "counsel:fixture:7.2:DEBT_INCURRENCE",
          grantType: "DEBT_INCURRENCE",
          sectionRef: "7.2",
          formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          thresholdValue: 50,
          params: { pctTotalAssets: 0.03 },
          action: "General debt",
          modelingStatus: "MODELED",
        },
        {
          id: "p2",
          code: "counsel:fixture:7.2:LIEN",
          grantType: "LIEN",
          sectionRef: "7.2",
          formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          thresholdValue: 50,
          params: { pctTotalAssets: 0.03 },
          action: "General lien",
          modelingStatus: "MODELED",
        },
      ],
      financials: fin,
    });

    expect(analysis.paths.length).toBeGreaterThanOrEqual(2);
    expect(analysis.combination.stackingAssumed).toBe(false);
    expect(analysis.narrative).toMatch(/not assume|Do not assume|Stacking/i);
    const general = analysis.paths.find((p) => p.sectionRef === "7.2" && p.family === "GENERAL_DEBT");
    expect(general).toBeTruthy();
    expect(general!.capacityMillions).toBe(84);
    expect(general!.status).toBe("INSUFFICIENT"); // 84 < 100
    expect(analysis.partialPaths.length).toBeGreaterThan(0);
    expect(analysis.paths.some((p) => p.status === "AI_PROPOSED")).toBe(true);
  });

  it("allows expressly shared RP pool allocation without inventing debt stacking", () => {
    const analysis = analyzeMultiPathTransaction({
      amountMillions: 75,
      kind: "RESTRICTED_PAYMENT",
      secured: false,
      label: "$75M RP",
      items: [
        item({
          sectionRef: "7.6",
          heading: "Restricted Payments",
          plainEnglish: "General RP basket $25M and builder Available Amount",
          materialBasketsThresholds: ["Amount/threshold: $25,000,000", "Available Amount builder basket"],
        }),
      ],
      approvals: [
        {
          sourceId: "fixture",
          sectionRef: "7.6",
          category: "NEGATIVE_COVENANTS",
          decision: "ACCEPTED",
          reviewedAt: new Date().toISOString(),
          reviewerLabel: "counsel",
          version: 1,
        },
      ],
      permissions: [
        {
          id: "rp1",
          code: "counsel:fixture:7.6:RESTRICTED_PAYMENT",
          grantType: "RESTRICTED_PAYMENT",
          sectionRef: "7.6",
          formulaType: "FLAT_AMOUNT",
          thresholdValue: 25,
          params: null,
          action: "General RP",
          modelingStatus: "MODELED",
        },
      ],
      financials: fin,
    });

    expect(analysis.paths.some((p) => p.family === "FIXED_RP" || p.family === "BUILDER_RP")).toBe(true);
    expect(analysis.combination.stackingAssumed).toBe(false);
  });
});
