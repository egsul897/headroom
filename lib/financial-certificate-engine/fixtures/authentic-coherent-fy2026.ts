/**
 * SEED-ALIGNED modeled figures — Coherent Corp. (Headroom evaluation company).
 *
 * Authority: SEED_ALIGNED_MODELED (see authority.ts FIXTURE_AUTHORITY).
 * Figures match prisma/seed-data.ts COHERENT_DATA.financials and the
 * PUBLIC_FILING_RECONSTRUCTION ExternalInputRecord for covenant EBITDA.
 * GAAP EBITDA is deliberately omitted in coherent financial-core population
 * — this fixture preserves that honesty (no invented GAAP number).
 * NOT a real reviewer APPROVED snapshot.
 */

import { FIXTURE_AUTHORITY } from "../authority";

export const COHERENT_FIXTURE_AUTHORITY = FIXTURE_AUTHORITY.coherent_fy2026;

export const COHERENT_AS_OF = "2026-06-30";

export const COHERENT_FINANCIAL_STATEMENT_FY2026 = `
Coherent Corp.
Form 10-K
Consolidated Statements of Operations
Year ended June 30, 2026
Currency: USD

Total Debt: $3,258 million
Secured Debt: $2,221 million
Unrestricted Cash: $1,162 million
Interest Expense: $190 million
Cumulative Net Income: $520 million
Equity Proceeds: $2,150 million

Note 1: GAAP EBITDA is not separately stated in this reconstruction (matches coherent financial-core population, which omits gaapEbitda).
Footnote 2: Figures align with prisma/seed-data.ts COHERENT_DATA.financials.
`.trim();

export const COHERENT_COMPLIANCE_CERTIFICATE_FY2026 = `
COMPLIANCE CERTIFICATE
Borrower: Coherent Corp.
Obligor group: Restricted Subsidiaries
As of June 30, 2026
FY2026-Q4
Currency: USD

I. Financial Covenants
Consolidated EBITDA: $1,700 million
Total Debt: $3,258 million
Secured Debt: $2,221 million
Unrestricted Cash: $1,162 million
Interest Expense: $190 million
Cumulative Net Income: $520 million
Equity Proceeds: $2,150 million
Assumed new debt rate: 6.5%
Consolidated Fixed Charges: $210 million
Total Net Leverage Ratio: 1.23x
Interest Coverage Ratio: 8.95x

Plus add-back: Non-recurring charges (per Credit Agreement Consolidated EBITDA)
Plus add-back: Stock-based compensation (non-cash)

"Consolidated EBITDA" means Consolidated Net Income plus interest, taxes, depreciation, amortization and permitted add-backs under the Credit Agreement.

II. Basket Usage Schedule
Basket usage: General Debt Basket YTD $25 million
`.trim();
