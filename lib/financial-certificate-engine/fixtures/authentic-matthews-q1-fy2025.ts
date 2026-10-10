/**
 * AUTHENTIC public-company figures — Matthews International (NASDAQ: MATW).
 *
 * Authority: AUTHENTIC_SOURCE_DERIVED (see authority.ts FIXTURE_AUTHORITY).
 * Numbers and methodology are taken from in-repo provenance already derived
 * from EDGAR filings (see scripts/populate-matthews-financial-provenance.ts
 * and docs/matthews-international-onboarding.md):
 * - Anchor 10-Q period ended 2024-12-31 (accession 0000063296-25-000006)
 * - Indenture §1.01 Consolidated EBITDA build-up (TTM)
 *
 * These texts are labeled reconstructions for deterministic extraction tests.
 * They are not fabricated capacity figures and are NOT a reviewer APPROVED snapshot.
 */

import { FIXTURE_AUTHORITY } from "../authority";

export const MATTHEWS_FIXTURE_AUTHORITY = FIXTURE_AUTHORITY.matthews_q1_fy2025;

/** Indenture Consolidated EBITDA TTM build-up components (authentic provenance). */
export const MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP = {
  asOf: "2024-12-31",
  accession: "0000063296-25-000006",
  /** Components that sum to contractual EBITDA (ex-CNI base handled in provenance script). */
  addbacksMillions: {
    depreciationAndAmortization: 93.751,
    goodwillWriteDowns: 16.727,
    assetWriteDowns: 16.847,
    stockBasedCompensation: 18.806,
  },
  consolidatedEbitdaMillions: 128.313,
  gaapEbitdaMillions: 77.675,
  totalDebtMillions: 809.211,
  securedDebtMillions: 778.882,
  cashMillions: 33.513,
  interestExpenseMillions: 54.64,
} as const;

export const MATTHEWS_ISSUER = "Matthews International Corporation";
export const MATTHEWS_AS_OF_Q1 = "2024-12-31";

/** Condensed financial-statement style excerpt (authentic TTM / BS figures). */
export const MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025 = `
Matthews International Corporation
Form 10-Q
Condensed Consolidated Statements of Operations
Period ended December 31, 2024
Currency: USD

GAAP EBITDA: $77.675 million
Total Debt: $809.211 million
Secured Debt: $778.882 million
Unrestricted Cash: $33.513 million
Interest Expense: $54.640 million
Total Assets: $1,791.719 million
Cumulative Net Income: $-3.472 million
Equity Proceeds: $0 million

Note 1: GAAP EBITDA is Operating profit + D&A (simple), deliberately distinct from Indenture Consolidated EBITDA.
Footnote 2: Debt figures are GAAP carrying values from Note 7 of the 10-Q (accession 0000063296-25-000006).
`.trim();

/**
 * Officer / compliance certificate style excerpt using Indenture-defined
 * Consolidated EBITDA (authentic $128.313M TTM) — not GAAP EBITDA.
 */
export const MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025 = `
COMPLIANCE CERTIFICATE
Borrower: Matthews International Corporation
Obligor group: Restricted Group
As of December 31, 2024
FY2025-Q1
Currency: USD

I. Financial Covenants
Consolidated EBITDA: $128.313 million
Total Debt: $809.211 million
Secured Debt: $778.882 million
Unrestricted Cash: $33.513 million
Interest Expense: $54.640 million
Cumulative Net Income: $-3.472 million
Equity Proceeds: $0 million
Assumed new debt rate: 8.625%
Total Assets: $1,791.719 million
Consolidated Fixed Charges: $54.640 million
Total Net Leverage Ratio: 6.05x

Plus add-back: Depreciation and amortization $93.751 million
Plus add-back: Goodwill write-downs (non-cash) $16.727 million
Plus add-back: Asset write-downs (non-cash) $16.847 million
Plus add-back: Stock-based compensation (non-cash) $18.806 million
Pro forma adjustment: Material Acquisition synergies (capped)

"Consolidated EBITDA" means Consolidated Net Income for such period plus, without duplication, income tax expense, Consolidated Interest Expense, depreciation and amortization, and other add-backs as defined in the Indenture.

II. Basket Usage Schedule
Basket usage: General Liens Basket YTD $0 million
`.trim();
