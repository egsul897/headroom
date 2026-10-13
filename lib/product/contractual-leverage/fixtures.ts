/**
 * Source-backed definition + financial fixtures for focused tests.
 *
 * Coherent: CA Total Net Leverage (seed definition text + seed snapshot figures).
 * Matthews: Indenture Secured Net Leverage + Indenture Consolidated EBITDA
 * build-up line items from PUBLIC_FILING_RECONSTRUCTION provenance
 * (scripts/populate-matthews-financial-provenance.ts).
 *
 * Test/demo data only — authority labeled honestly (not APPROVED by default).
 */

import type {
  ApprovedFinancialLineItem,
  DefinitionText,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "./types";

/** Coherent CA §6.11(a) — seed FinancialSnapshot ($M). */
export const COHERENT_FINANCIALS: LeverageFinancialInputs = {
  ebitda: 1700,
  totalDebt: 3258,
  securedDebt: 2221,
  cash: 1162,
};

export const COHERENT_CA_DEFINITIONS: DefinitionText[] = [
  {
    termName: "Consolidated EBITDA",
    sectionRef: "§1.01",
    documentId: "coherent-credit-agreement",
    documentName: "Credit Agreement",
    fullText:
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, (a) income tax expense, (b) Consolidated Interest Expense, (c) depreciation and amortization expense, (d) non-cash stock-based compensation expense, and (e) restructuring, integration, and transaction costs subject to a cap of 15% of Consolidated EBITDA (calculated before giving effect to such add-back) in any period, in each case determined on a consolidated basis for the Borrower and its Restricted Subsidiaries in accordance with GAAP.`,
  },
  {
    termName: "Total Net Leverage Ratio",
    sectionRef: "§6.11(a)",
    documentId: "coherent-credit-agreement",
    documentName: "Credit Agreement",
    fullText:
      `"Total Net Leverage Ratio" means, as of the last day of any fiscal quarter, the ratio of (a) Consolidated Total Debt as of such date, less unrestricted cash and Cash Equivalents of the Borrower and its Restricted Subsidiaries as of such date, to (b) Consolidated EBITDA for the four fiscal quarters then ended. Section 6.11(a) requires this ratio not to exceed 4.25:1.00, tested quarterly on a maintenance basis (not merely as a condition to incurrence).`,
  },
];

/** Matthews Indenture — authentic Q1 FY2025 financials ($M). */
export const MATTHEWS_FINANCIALS: LeverageFinancialInputs = {
  ebitda: 128.313,
  totalDebt: 809.211,
  securedDebt: 778.882,
  cash: 33.513,
};

export const MATTHEWS_INDENTURE_DEFINITIONS: DefinitionText[] = [
  {
    termName: "Consolidated EBITDA",
    sectionRef: "§1.01",
    documentId: "matthews-indenture-2027-notes",
    documentName: "Indenture — 8.625% Senior Secured Notes due 2027",
    fullText:
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in determining such Consolidated Net Income, (a) Consolidated Interest Expense, (b) income tax expense (or minus any income tax benefit), (c) depreciation and amortization expense, and (d) non-cash expenses and losses (excluding depreciation and amortization), in each case determined on a consolidated basis for the Issuer and its Restricted Subsidiaries.`,
  },
  {
    termName: "Secured Net Leverage Ratio",
    sectionRef: "§1.01",
    documentId: "matthews-indenture-2027-notes",
    documentName: "Indenture — 8.625% Senior Secured Notes due 2027",
    fullText:
      `"Secured Net Leverage Ratio" means, as of any date of determination, the ratio of (a) Consolidated Total Indebtedness that is secured by a Lien as of such date, less unrestricted cash and Cash Equivalents of the Issuer and its Restricted Subsidiaries as of such date, to (b) Consolidated EBITDA for the most recently ended four fiscal quarters for which internal financial statements are available.`,
  },
];

/**
 * Matthews Indenture Consolidated EBITDA TTM line items
 * (PUBLIC_FILING_RECONSTRUCTION — not a reviewer-APPROVED certificate).
 * Sum: -60.829 + 54.640 - 11.629 + 93.751 + 16.727 + 16.847 + 18.806 = 128.313
 */
export const MATTHEWS_EBITDA_LINE_ITEMS: ApprovedFinancialLineItem[] = [
  {
    key: "cni",
    label: "Consolidated Net Income",
    amountMillions: -60.829,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2024 10-K + Q1 FY2025 10-Q TTM net income",
  },
  {
    key: "interest",
    label: "Consolidated Interest Expense",
    amountMillions: 54.64,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
  },
  {
    key: "tax_benefit",
    label: "Income tax benefit",
    amountMillions: 11.629,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
  },
  {
    key: "da",
    label: "Depreciation and amortization",
    amountMillions: 93.751,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
  },
  {
    key: "goodwill",
    label: "Goodwill write-downs (non-cash)",
    amountMillions: 16.727,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
  },
  {
    key: "asset_wd",
    label: "Asset write-downs (non-cash)",
    amountMillions: 16.847,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
  },
  {
    key: "sbc",
    label: "Stock-based compensation (non-cash)",
    amountMillions: 18.806,
    period: "TTM-2024-12-31",
    asOf: "2024-12-31",
    authority: "SEEDED_SNAPSHOT",
  },
];

/** Same line items labeled APPROVED_PERIOD_MATCHED for authority-gate tests. */
export const MATTHEWS_EBITDA_LINE_ITEMS_APPROVED: ApprovedFinancialLineItem[] = MATTHEWS_EBITDA_LINE_ITEMS.map(
  (i) => ({ ...i, authority: "APPROVED_PERIOD_MATCHED" as const }),
);

export function coherentTotalNetLeverageRequest(
  financials: LeverageFinancialInputs = COHERENT_FINANCIALS,
): LeverageCalculationRequest {
  return {
    name: "Financial Covenants — Total Net Leverage",
    sectionRef: "§6.11 — TNL ≤ 4.25x",
    documentName: "Credit Agreement",
    companyId: "coherent",
    instrumentKey: "coherent-credit-agreement",
    definitions: COHERENT_CA_DEFINITIONS,
    leverageTermCandidates: ["Total Net Leverage Ratio"],
    ebitdaTermCandidates: ["Consolidated EBITDA"],
    threshold: 4.25,
    debtBasisHint: "total",
    financials,
    financialAuthority: "SEEDED_SNAPSHOT",
  };
}

export function matthewsSecuredNetLeverageRequest(
  financials: LeverageFinancialInputs = MATTHEWS_FINANCIALS,
): LeverageCalculationRequest {
  return {
    name: "Permitted Debt — Secured Net Leverage Ratio",
    sectionRef: "Permitted Debt def., cl. (1)(b)(x)",
    documentName: "Indenture — 8.625% Senior Secured Notes due 2027",
    companyId: "matthews",
    instrumentKey: "matthews-indenture-2027-notes",
    definitions: MATTHEWS_INDENTURE_DEFINITIONS,
    leverageTermCandidates: ["Secured Net Leverage Ratio"],
    ebitdaTermCandidates: ["Consolidated EBITDA"],
    threshold: 3.5,
    debtBasisHint: "secured",
    financials,
    financialAuthority: "SEEDED_SNAPSHOT",
    ebitdaLineItems: MATTHEWS_EBITDA_LINE_ITEMS,
    expectedPeriod: "TTM-2024-12-31",
  };
}
