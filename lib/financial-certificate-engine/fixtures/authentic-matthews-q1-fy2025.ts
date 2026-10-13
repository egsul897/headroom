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
 *
 * Unlike Coherent's seeded $1,700M, Matthews' $128.313M is a definition-first
 * Indenture §1.01 build-up (methodology-independent of a pre-known target).
 */

import { FIXTURE_AUTHORITY } from "../authority";
import type { ContractualEbitdaEvidencePackage } from "../contractual-ebitda-buildup";

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
  /** Full Indenture build-up including CNI base and tax benefit subtraction. */
  buildupMillions: {
    consolidatedNetIncome: -60.829,
    interestExpense: 54.64,
    incomeTaxBenefitSubtracted: -11.629,
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

export const MATTHEWS_EBITDA_EVIDENCE_SOURCE_VERSION =
  "fixture:matthews-ebitda-evidence.v1" as const;

export const MATTHEWS_EBITDA_EVIDENCE: ContractualEbitdaEvidencePackage = {
  bindingContractualEbitdaMillions: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.consolidatedEbitdaMillions,
  asOfDate: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.asOf,
  measurementPeriod: "TTM through 2024-12-31 (FY2024 + Q1FY25 − Q1FY24)",
  bindingIdentity: {
    companyId: "matthews",
    documentIds: ["matw-indenture"],
    measurementPeriod: "TTM through 2024-12-31 (FY2024 + Q1FY25 − Q1FY24)",
    asOfDate: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.asOf,
    sourceVersionId: MATTHEWS_EBITDA_EVIDENCE_SOURCE_VERSION,
    financialSnapshotId: null,
  },
  definitionTerm: "Consolidated EBITDA",
  definitionExcerpt:
    '"Consolidated EBITDA" means Consolidated Net Income for such period plus, without duplication, income tax expense, Consolidated Interest Expense, depreciation and amortization, and other add-backs as defined in the Indenture.',
  definitionCitation: "Indenture §1.01 Consolidated EBITDA · accession 0000063296-25-000006 (period anchor)",
  bindingApprovalStatus:
    "PUBLIC_FILING_RECONSTRUCTION · UNVERIFIED · definition-first Indenture build-up · NOT CERTIFIED_EXTERNAL_INPUT · NOT capacity APPROVED",
  methodologyIndependent: true,
  methodologyDisclosure:
    "Build-up fixed from Indenture §1.01 Consolidated EBITDA defined-term text first (clauses (1)(a)-(c)/(i) and tax benefit clause (2)) before any TTM dollar figure was computed. Extraordinary/non-recurring and run-rate synergy prongs not invoked. See scripts/populate-matthews-financial-provenance.ts header.",
  components: [
    {
      label: "Consolidated Net Income (TTM)",
      amountMillions: -60.829,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2024 10-K 0000063296-24-000094 + Q1 FY2025 10-Q 0000063296-25-000006 (− Q1 FY2024 comparative)",
      measurementPeriod: "TTM through 2024-12-31",
      approvalStatus: "RECONSTRUCTED",
    },
    {
      label: "Consolidated Interest Expense (TTM)",
      amountMillions: 54.64,
      amountMissing: false,
      sign: "plus",
      documentCitation: "Same TTM stack · Interest expense",
      measurementPeriod: "TTM through 2024-12-31",
      approvalStatus: "RECONSTRUCTED",
    },
    {
      label: "Income tax benefit (clause (2) — subtracted)",
      amountMillions: 11.629,
      amountMissing: false,
      sign: "minus",
      documentCitation: "Indenture §1.01 cl.(2) · TTM tax benefit",
      measurementPeriod: "TTM through 2024-12-31",
      approvalStatus: "RECONSTRUCTED",
    },
    {
      label: "Depreciation and amortization (TTM)",
      amountMillions: 93.751,
      amountMissing: false,
      sign: "plus",
      documentCitation: "Same TTM stack · D&A",
      measurementPeriod: "TTM through 2024-12-31",
      approvalStatus: "RECONSTRUCTED",
    },
    {
      label: "Goodwill write-downs (non-cash)",
      amountMillions: 16.727,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2024 10-K Consolidated Statement of Cash Flows",
      measurementPeriod: "FY2024 (none in Q1s)",
      approvalStatus: "REPORTED",
    },
    {
      label: "Asset write-downs (non-cash)",
      amountMillions: 16.847,
      amountMissing: false,
      sign: "plus",
      documentCitation: "FY2024 10-K Consolidated Statement of Cash Flows",
      measurementPeriod: "FY2024 (none in Q1s)",
      approvalStatus: "REPORTED",
    },
    {
      label: "Stock-based compensation (non-cash, TTM)",
      amountMillions: 18.806,
      amountMissing: false,
      sign: "plus",
      documentCitation: "Same TTM stack · stock-based compensation",
      measurementPeriod: "TTM through 2024-12-31",
      approvalStatus: "RECONSTRUCTED",
    },
  ],
  unresolvedAdjustments: [
    "Indenture cl.(1)(f) extraordinary/non-recurring prong not invoked (conservative).",
    "Indenture cl.(1)(g) run-rate synergy addback not invoked (not disclosed as discrete GAAP line).",
    "No compliance certificate in source set — reconstruction remains UNVERIFIED / not CERTIFIED_EXTERNAL_INPUT.",
  ],
};

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
