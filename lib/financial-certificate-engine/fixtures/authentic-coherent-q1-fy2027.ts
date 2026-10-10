/**
 * AUTHENTIC sequential-period figures — Coherent Corp. FY2027 Q1 feed-queue
 * payload from prisma/seed-data.ts COHERENT_FEED_QUEUE_ITEMS.
 *
 * Incomplete SNAPSHOT_UPDATE: EBITDA/cash/interest/CNI only.
 * Debt / secured / equity / rate omitted — approval path must refuse silent
 * copy-forward. Used for different-reporting-period + missing-input tests.
 */

export const COHERENT_Q1_FY2027_AS_OF = "2026-09-30";

export const COHERENT_FINANCIAL_STATEMENT_Q1_FY2027 = `
Coherent Corp.
Form 10-Q
Consolidated Statements of Operations
Period ended September 30, 2026
FY2027-Q1
Currency: USD

Unrestricted Cash: $1,240 million
Interest Expense: $186 million
Cumulative Net Income: $560 million

Note 1: Total debt, secured debt, equity proceeds, and assumed new-debt rate
are omitted from this quarter's SNAPSHOT_UPDATE payload (seed feed-queue).
Footnote 2: Figures align with prisma/seed-data.ts COHERENT_FEED_QUEUE_ITEMS[0].
`.trim();

export const COHERENT_COMPLIANCE_CERTIFICATE_Q1_FY2027 = `
COMPLIANCE CERTIFICATE
Borrower: Coherent Corp.
Obligor group: Restricted Subsidiaries
As of September 30, 2026
FY2027-Q1
Currency: USD

I. Financial Covenants
Consolidated EBITDA: $1,740 million
Unrestricted Cash: $1,240 million
Interest Expense: $186 million
Cumulative Net Income: $560 million

"Consolidated EBITDA" means Consolidated Net Income plus interest, taxes, depreciation, amortization and permitted add-backs under the Credit Agreement.

Note: Incomplete certificate — total debt / secured debt / equity proceeds /
assumed new-debt rate not restated this period (matches feed-queue refusal semantics).
`.trim();
