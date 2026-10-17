import type { CompanyCovenantData } from "@/lib/covenant-engine";

/**
 * SAMPLE DATA shaped like a company the engine already accepts.
 * Figures on the simulate screen are whatever simulateDebtIncurrence returns for this input.
 */
export const SAMPLE_COVENANT_DATA: CompanyCovenantData = {
  companyId: "sample",
  ledger: [],
  financials: {
    ebitda: 500,
    cash: 80,
    interestExpense: 40,
    cumulativeNetIncome: 90,
    equityProceedsSinceIssue: 0,
    assumedNewDebtRatePct: 7.25,
    totalDebt: 900,
    securedDebt: 600,
  },
  documents: [
    {
      id: "sample-credit",
      name: "Sample credit agreement",
      type: "CREDIT_AGREEMENT",
      capacityFormulas: {
        secured: { op: "MIN", items: [{ op: "REF", code: "leverage" }, { op: "REF", code: "coverage" }] },
        unsecured: { op: "MIN", items: [{ op: "REF", code: "leverage" }, { op: "REF", code: "coverage" }] },
      },
    },
    {
      id: "sample-notes",
      name: "Sample secured notes",
      type: "INDENTURE",
      capacityFormulas: {
        secured: {
          op: "MIN",
          items: [
            { op: "SUM", items: [{ op: "REF", code: "flat" }, { op: "REF", code: "general" }], label: "General debt baskets" },
            { op: "REF", code: "secured-prong" },
          ],
        },
        unsecured: { op: "REF", code: "unsecured-prong" },
      },
    },
    {
      id: "sample-side-letter",
      name: "Sample side letter",
      type: "SIDE_LETTER",
    },
  ],
  provisions: [
    { id: "s1", documentId: "sample-credit", code: "leverage", basketName: "Sample total leverage", sectionRef: "§5.1(a)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4, params: { debtBasis: "total" } },
    { id: "s2", documentId: "sample-credit", code: "coverage", basketName: "Sample coverage", sectionRef: "§5.1(b)", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2 },
    { id: "s3", documentId: "sample-notes", code: "flat", basketName: "Sample credit facilities basket", sectionRef: "§2.1(a)", formulaType: "FLAT_NET_OF_DEBT", thresholdValue: 1500, params: { netOfBasis: "secured" } },
    { id: "s4", documentId: "sample-notes", code: "general", basketName: "Sample general debt basket", sectionRef: "§2.1(b)", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 300, params: { pctEbitda: 0.5 } },
    { id: "s5", documentId: "sample-notes", code: "secured-prong", basketName: "Sample ratio debt", sectionRef: "§2.1(c)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.5, params: { debtBasis: "secured" } },
    { id: "s7", documentId: "sample-notes", code: "incremental", basketName: "Sample incremental facility", sectionRef: "§2.1(e)", formulaType: "FLAT_AMOUNT", thresholdValue: 400 },
    { id: "s6", documentId: "sample-notes", code: "unsecured-prong", basketName: "Sample unsecured prong", sectionRef: "§2.1(d)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.5, params: { debtBasis: "total" } },
  ],
};
