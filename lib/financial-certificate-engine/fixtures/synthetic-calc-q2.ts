/**
 * SYNTHETIC calculation-test fixtures — explicitly labeled.
 * Invented company and numbers for unit tests of reconciliation arithmetic,
 * stale-period detection, and missing-schedule findings.
 * Not authentic customer or public-filing data.
 */

export const SYNTHETIC_CALC_LABEL = "SYNTHETIC_CALCULATION_TEST";

export const SYNTHETIC_STATEMENT_Q2 = `
SYNTHETIC_CALCULATION_TEST Holdings LLC
Financial Statements
Period ended June 30, 2026
Currency: USD

GAAP EBITDA: $100 million
Total Debt: $400 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million
Cumulative Net Income: $10 million
Equity Proceeds: $5 million
`.trim();

/** Certificate with contractual EBITDA materially above GAAP + matching debt/cash. */
export const SYNTHETIC_CERTIFICATE_Q2 = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
Obligor group: Restricted Group
As of June 30, 2026
FY2026-Q2
Currency: USD

Consolidated EBITDA: $150 million
Total Debt: $400 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million
Cumulative Net Income: $10 million
Equity Proceeds: $5 million
Assumed new debt rate: 7.0%
Total Net Leverage Ratio: 2.33x

Plus add-back: Run-rate cost savings $30 million
Plus add-back: Non-cash charges $20 million

"Consolidated EBITDA" means Consolidated Net Income plus permitted add-backs.

II. Basket Usage Schedule
Basket usage: General Investments Basket $15 million
`.trim();

/** Certificate that disagrees on total debt — material difference test. */
export const SYNTHETIC_CERTIFICATE_Q2_DEBT_MISMATCH = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
As of June 30, 2026
Currency: USD

Consolidated EBITDA: $150 million
Total Debt: $480 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million
`.trim();

/** Stale period certificate (old as-of) for STALE_PERIOD finding. */
export const SYNTHETIC_CERTIFICATE_STALE = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
As of January 31, 2024
Currency: USD

Consolidated EBITDA: $150 million
Total Debt: $400 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million
`.trim();
