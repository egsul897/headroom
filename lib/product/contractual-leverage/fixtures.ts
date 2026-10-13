/**
 * Source-backed definition + financial fixtures for focused tests.
 *
 * Coherent: Credit Agreement Total Net Leverage Ratio (seed definition text +
 * seed FinancialSnapshot figures).
 * Matthews: Indenture Secured Net Leverage Ratio drafting shape documented in
 * docs/matthews-international-onboarding.md + AUTHENTIC_SOURCE_BACKED Q1 FY2025
 * figures from scripts/populate-matthews-solver-native.ts.
 *
 * Not production company branches — test/demo data only.
 */

import type {
  DefinitionText,
  EbitdaComponentInputs,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "./types";

/** Coherent CA §6.11(a) — seed FinancialSnapshot ($M): 1141+1080+990+47 total; 1141+1080 secured. */
export const COHERENT_FINANCIALS: LeverageFinancialInputs = {
  ebitda: 1700,
  totalDebt: 3258,
  securedDebt: 2221,
  cash: 1162,
};

// Seed total/secured from prisma/seed-data.ts (TOTAL_DEBT / SECURED_DEBT).
// Re-read exact constants below when building the request.
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

/**
 * Secured Net Leverage Ratio drafting consistent with Matthews Indenture
 * Permitted Debt cl. (1)(b)(x) / defined-term structure described in
 * docs/matthews-international-onboarding.md (ratio of secured indebtedness
 * less unrestricted cash to Consolidated EBITDA).
 */
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
  };
}

/**
 * SYNTHETIC_LABELED component pack for Coherent build-up tests.
 * B = 1500, A = 200 → uncapped E = 1700 (A ≤ 0.15×1700), matching COHERENT_FINANCIALS.ebitda.
 * Not certificate-reported EBITDA; not production Neon facts.
 */
export const COHERENT_EBITDA_COMPONENTS: EbitdaComponentInputs = {
  "Consolidated Net Income": 1000,
  "Income Tax Expense": 100,
  "Consolidated Interest Expense": 200,
  "Depreciation and Amortization": 150,
  "Non-Cash Stock-Based Compensation": 50,
  "Restructuring Integration Transaction Costs": 200,
};

/**
 * SYNTHETIC_LABELED components summing to MATTHEWS_FINANCIALS.ebitda (128.313).
 */
export const MATTHEWS_EBITDA_COMPONENTS: EbitdaComponentInputs = {
  "Consolidated Net Income": 80,
  "Consolidated Interest Expense": 15,
  "Income Tax Expense": 10,
  "Depreciation and Amortization": 18,
  "Non-Cash Expenses Excluding DA": 5.313,
};

/** Coherent leverage driven by FIXED_POINT EBITDA build-up (not black-box certificate EBITDA). */
export function coherentEbitdaBuildupLeverageRequest(
  components: EbitdaComponentInputs = COHERENT_EBITDA_COMPONENTS,
  financials: LeverageFinancialInputs = { ...COHERENT_FINANCIALS, ebitda: null },
): LeverageCalculationRequest {
  return {
    ...coherentTotalNetLeverageRequest(financials),
    ebitdaBuildup: "COHERENT_CAPPED_ADDBACK",
    ebitdaComponents: components,
  };
}

/** Matthews leverage driven by uncapped SUM build-up (second definition shape). */
export function matthewsEbitdaBuildupLeverageRequest(
  components: EbitdaComponentInputs = MATTHEWS_EBITDA_COMPONENTS,
  financials: LeverageFinancialInputs = { ...MATTHEWS_FINANCIALS, ebitda: null },
): LeverageCalculationRequest {
  return {
    ...matthewsSecuredNetLeverageRequest(financials),
    ebitdaBuildup: "MATTHEWS_UNCAPPED_SUM",
    ebitdaComponents: components,
  };
}
