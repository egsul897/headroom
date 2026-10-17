import type { OverviewLike } from "@/lib/reports/build";

export const overview: OverviewLike = {
  company: { id: "co_1", name: "Acme Corp" },
  asOfDate: new Date("2026-06-30T00:00:00Z"),
  warnings: [{ category: "STALE_INPUT", description: "Cash is 120 days old" }],
  covenantFamilies: [
    {
      family: "DEBT",
      rows: [
        { kind: "CAPACITY", stableKey: "d1:GEN", name: "General debt basket", documentName: "Credit Agreement", sectionRef: "§7.03(o)", formulaDisplay: "greater of $50,000,000 and 25% of Consolidated EBITDA", currentCapacity: 62_500_000, capacityUnlimited: false, used: null, remaining: null, publicationLabel: "GROSS_CONTRACTUAL", bindingState: "AVAILABLE", status: "MODELED", reviewState: "UNVERIFIED" },
        { kind: "CAPACITY", stableKey: "d1:RATIO", name: "Ratio debt", documentName: "Credit Agreement", sectionRef: "§7.03(p)", formulaDisplay: null, currentCapacity: null, capacityUnlimited: false, used: null, remaining: null, bindingState: "NOT_EVALUABLE", status: "REVIEW_REQUIRED", reviewState: "UNVERIFIED", reason: "Pro forma EBITDA input missing" },
        { kind: "CAPACITY", stableKey: "d1:UNM", name: "Unmodeled basket", documentName: "Credit Agreement", sectionRef: "§7.03(z)", formulaDisplay: "counsel note text (not a formula)", currentCapacity: null, capacityUnlimited: false, used: null, remaining: null, bindingState: "UNMODELED", status: "UNMODELED", reviewState: "NOT_TRACKED" },
        { kind: "CAPACITY", stableKey: "d1:SUP", name: "Tracked basket", documentName: "Credit Agreement", sectionRef: "§7.03(b)", formulaDisplay: "$10,000,000", currentCapacity: 10_000_000, capacityUnlimited: false, used: 4_000_000, remaining: 6_000_000, publicationLabel: "SUPPORTED_REMAINING", bindingState: "AVAILABLE", status: "MODELED", reviewState: "UNVERIFIED" },
        { kind: "CAPACITY", stableKey: "d1:NOCITE", name: "Uncited", documentName: "Credit Agreement", sectionRef: "", formulaDisplay: "$5", currentCapacity: 5, capacityUnlimited: false, used: null, remaining: null, bindingState: "AVAILABLE", status: "MODELED", reviewState: "UNVERIFIED" },
      ],
    },
    {
      family: "FINANCIAL_RATIOS",
      rows: [
        { kind: "RATIO", stableKey: "d1:LEV", name: "Max total net leverage", documentName: "Credit Agreement", sectionRef: "§7.11(a)", currentRatio: 3.1, ratioLimit: 4.5, ratioHeadroom: 1.4, comparisonDirection: "at_or_below", bindingState: "AVAILABLE", status: "MODELED", reviewState: "UNVERIFIED" },
        { kind: "RATIO", stableKey: "d1:ICR", name: "Min interest coverage", documentName: "Credit Agreement", sectionRef: "§7.11(b)", currentRatio: 2.0, ratioLimit: 2.5, ratioHeadroom: -0.5, comparisonDirection: "at_or_above", bindingState: "BINDING", status: "MODELED", reviewState: "UNVERIFIED" },
        { kind: "RATIO", stableKey: "d1:FCCR", name: "Springing FCCR", documentName: "Credit Agreement", sectionRef: "§7.11(c)", currentRatio: null, ratioLimit: 1.0, ratioHeadroom: null, comparisonDirection: "at_or_above", bindingState: "NOT_EVALUABLE", status: "REVIEW_REQUIRED", reviewState: "UNVERIFIED", reason: "Fixed charges not on file" },
      ],
    },
  ],
};
