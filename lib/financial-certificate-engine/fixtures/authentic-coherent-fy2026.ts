/**
 * SEED-ALIGNED modeled figures — Coherent Corp. (Headroom evaluation company).
 *
 * Authority: SEED_ALIGNED_MODELED (see authority.ts FIXTURE_AUTHORITY).
 * Figures match prisma/seed-data.ts COHERENT_DATA.financials and the
 * PUBLIC_FILING_RECONSTRUCTION ExternalInputRecord for covenant EBITDA.
 * GAAP EBITDA is deliberately omitted in coherent financial-core population
 * — this fixture preserves that honesty (no invented GAAP number).
 * NOT a real reviewer APPROVED snapshot.
 *
 * Contractual EBITDA honesty: the binding $1,700M is a reported/seeded
 * covenant EBITDA value. The 10-K line-item reconstruction (~$1,694M) is
 * supporting evidence only — methodology-order disclosure in
 * scripts/populate-coherent-ebitda-provenance.ts forbids treating it as an
 * independent definition-first derivation of $1,700M.
 */

import { FIXTURE_AUTHORITY } from "../authority";
import type { ContractualEbitdaEvidencePackage } from "../contractual-ebitda-buildup";

export const COHERENT_FIXTURE_AUTHORITY = FIXTURE_AUTHORITY.coherent_fy2026;

export const COHERENT_AS_OF = "2026-06-30";

/** Binding reported covenant EBITDA ($M) — seed / certificate reported value. */
export const COHERENT_REPORTED_COVENANT_EBITDA_MILLIONS = 1700;

/**
 * Public-filing reconstruction components ($M) from FY2026 10-K line items
 * (thousand-dollar figures ÷ 1000). Sum ≈ 1694.140 — supporting only.
 */
export const COHERENT_EBITDA_EVIDENCE_SOURCE_VERSION =
  "fixture:coherent-ebitda-evidence.v1" as const;

export const COHERENT_EBITDA_EVIDENCE: ContractualEbitdaEvidencePackage = {
  bindingContractualEbitdaMillions: COHERENT_REPORTED_COVENANT_EBITDA_MILLIONS,
  asOfDate: COHERENT_AS_OF,
  measurementPeriod: "FY2026 (year ended 2026-06-30)",
  bindingIdentity: {
    companyId: "coherent",
    documentIds: ["coherent-credit-agreement-2022", "coherent-2029-notes-indenture"],
    measurementPeriod: "FY2026 (year ended 2026-06-30)",
    asOfDate: COHERENT_AS_OF,
    sourceVersionId: COHERENT_EBITDA_EVIDENCE_SOURCE_VERSION,
    financialSnapshotId: null,
  },
  definitionTerm: "Consolidated EBITDA",
  definitionExcerpt:
    '"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in determining such Consolidated Net Income, (a) income tax expense, (b) Consolidated Interest Expense, (c) depreciation and amortization expense, (d) non-cash stock-based compensation expense, (e) restructuring, integration, and transaction costs, and (f) other non-recurring or non-cash charges reasonably identified by the Issuer, minus non-cash items increasing Consolidated Net Income for such period.',
  definitionCitation: "Indenture §1.01 / Credit Agreement defined terms (seed DefinedTerm rows)",
  bindingApprovalStatus:
    "PUBLIC_FILING_RECONSTRUCTION · ExternalInputRecord coh-eir-covenant-ebitda-public-filing-reconstruction · reviewStatus VERIFIED for cited 10-K line items only · NOT CERTIFIED_EXTERNAL_INPUT · NOT capacity APPROVED",
  methodologyIndependent: false,
  methodologyDisclosure:
    "The $1,700M target was known throughout construction of the reconstruction. It was NOT derived independently from Coherent's own covenant EBITDA defined-term text and only afterward compared. The addback combination was selected, among legitimate generic choices, because it landed closest to the already-known $1,700M. The ~0.3% agreement is NOT independent confirmatory evidence. See scripts/populate-coherent-ebitda-provenance.ts.",
  components: [
    {
      label: "Net Earnings Attributable to Coherent Corp.",
      amountMillions: 804.998,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Earnings (Loss) · filed 2026-08-14",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Income Tax Expense",
      amountMillions: 60.849,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Earnings (Loss)",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Interest expense",
      amountMillions: 190.267,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Earnings (Loss)",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Depreciation",
      amountMillions: 241.561,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Amortization",
      amountMillions: 280.334,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Restructuring charges",
      amountMillions: 63.39,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Impairment of assets held-for-sale",
      amountMillions: 64.404,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Share-based compensation expense",
      amountMillions: 186.468,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Gain on sale of business",
      amountMillions: 124.133,
      amountMissing: false,
      sign: "minus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
    {
      label: "Gain on sale of equity investment",
      amountMillions: 73.998,
      amountMissing: false,
      sign: "minus",
      documentCitation: "FY2026 Form 10-K · Consolidated Statements of Cash Flows",
      measurementPeriod: "FY2026",
      approvalStatus: "VERIFIED_LINE_ITEM",
    },
  ],
  unresolvedAdjustments: [
    "Certificate addbacks ('Non-recurring charges', 'Stock-based compensation') have no dollar amounts in the compliance-certificate fixture — amounts not invented.",
    "Credit Agreement Consolidated EBITDA 15% cap on certain addbacks not applied to this generic reconstruction.",
    "Reconstruction is not a definition-first walk of every Indenture/Credit Agreement addback limb against Coherent's operative text.",
    "Gap between reconstruction (~$1,694.140M) and binding reported/seeded $1,700M remains unresolved — not silently closed.",
  ],
  notes: [
    "Capacity and ratio math bind to reported/seeded $1,700M covenant EBITDA, not the ~$1,694M reconstruction.",
  ],
};

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
