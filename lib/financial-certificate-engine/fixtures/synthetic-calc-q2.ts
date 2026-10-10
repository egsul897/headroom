/**
 * SYNTHETIC calculation-test fixtures — explicitly labeled.
 * Authority: SYNTHETIC_CALCULATION_TEST (see authority.ts FIXTURE_AUTHORITY).
 * Invented company and numbers for unit tests of reconciliation arithmetic,
 * stale-period detection, and missing-schedule findings.
 * Not authentic customer or public-filing data. Never APPROVED authority.
 */

import { FIXTURE_AUTHORITY } from "../authority";

export const SYNTHETIC_FIXTURE_AUTHORITY = FIXTURE_AUTHORITY.synthetic_calc_q2;
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

/** EUR certificate vs USD statement — CURRENCY_MISMATCH. */
export const SYNTHETIC_CERTIFICATE_EUR = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
Obligor group: Restricted Group
As of June 30, 2026
Currency: EUR

Consolidated EBITDA: €150 million
Total Debt: €400 million
Secured Debt: €300 million
Unrestricted Cash: €50 million
Interest Expense: €40 million
`.trim();

/** Different obligor scope on certificate. */
export const SYNTHETIC_CERTIFICATE_OBLIGOR_MISMATCH = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
Obligor group: Unrestricted Subsidiaries Only
As of June 30, 2026
Currency: USD

Consolidated EBITDA: $150 million
Total Debt: $400 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million
Cumulative Net Income: $10 million
Equity Proceeds: $5 million
Assumed new debt rate: 7.0%
`.trim();

/** Statement with obligor group for OBLIGOR_SCOPE_MISMATCH pair. */
export const SYNTHETIC_STATEMENT_WITH_OBLIGOR = `
SYNTHETIC_CALCULATION_TEST Holdings LLC
Financial Statements
Obligor group: Restricted Group
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

/** Different reporting period (Q1 vs Q2) for PERIOD_MISMATCH. */
export const SYNTHETIC_CERTIFICATE_PERIOD_Q1 = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
As of March 31, 2026
FY2026-Q1
Currency: USD

Consolidated EBITDA: $150 million
Total Debt: $400 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million
`.trim();

/** Certificate referencing baskets without a usage schedule. */
export const SYNTHETIC_CERTIFICATE_MISSING_SCHEDULE = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
As of June 30, 2026
Currency: USD

Consolidated EBITDA: $150 million
Total Debt: $400 million
Secured Debt: $300 million
Unrestricted Cash: $50 million
Interest Expense: $40 million

I. Financial Covenants
General Investments Basket capacity remains available subject to the Credit Agreement.
`.trim();

/** Unit-style conflict: certificate amounts in thousands vs statement millions (label). */
export const SYNTHETIC_CERTIFICATE_UNIT_THOUSANDS = `
COMPLIANCE CERTIFICATE
SYNTHETIC_CALCULATION_TEST
Borrower: SYNTHETIC_CALCULATION_TEST Holdings LLC
As of June 30, 2026
Currency: USD

Consolidated EBITDA: $150000 thousand
Total Debt: $400000 thousand
Secured Debt: $300000 thousand
Unrestricted Cash: $50000 thousand
Interest Expense: $40000 thousand
`.trim();
