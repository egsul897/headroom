/**
 * Package/instrument-driven registry for provisional financial evidence packages.
 *
 * Production resolution keys on packageKey / instrumentKey.
 * CompanyId is only a convenience index for fixture lookup — never a formula branch.
 * Issuer packages here are EXPLICIT PROVISIONAL ADAPTERS / test fixtures, not certified rulebooks.
 */

import type { ContractualEbitdaEvidencePackage } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  MATTHEWS_AS_OF,
  MATTHEWS_COMPANY_ID,
  MATTHEWS_EBITDA_COMPONENTS,
  MATTHEWS_EXPECTED_EBITDA_MILLIONS,
  MATTHEWS_INDENTURE_DOC,
  MATTHEWS_INDENTURE_INSTRUMENT,
  MATTHEWS_PERIOD,
  MATTHEWS_UNSUPPORTED_MECHANICS,
} from "@/lib/product/contractual-metrics/packages/matthews-indenture";
import {
  COHERENT_AS_OF,
  COHERENT_CERTIFICATE_EBITDA_MILLIONS,
  COHERENT_COMPANY_ID,
  COHERENT_DOC,
  COHERENT_INSTRUMENT,
  COHERENT_PERIOD,
  COHERENT_UNSUPPORTED_MECHANICS,
} from "@/lib/product/contractual-metrics/packages/coherent-credit";
import type { FinancialEvidenceAuthority } from "./types";

export interface RegisteredFinancialPackage {
  packageKey: string;
  instrumentKey: string;
  sourceDocumentId: string;
  operativeVersionLabel: string;
  companyId: string;
  entityScope: string;
  asOf: string;
  measurementPeriod: string;
  evidenceAuthority: FinancialEvidenceAuthority;
  /** Contractual-metrics company id used by Phase 4A package executor (fixture bridge). */
  contractualMetricsCompanyId: string;
  ebitdaEvidence: ContractualEbitdaEvidencePackage;
  unsupportedMechanics: readonly string[];
  /** Assumed new-debt rate % for coverage-room formulas (disclosed assumption). */
  assumedNewDebtRatePct: number;
  equityProceedsSinceIssue: number;
  cumulativeNetIncome: number;
  totalAssets?: number;
  totalDebt: number;
  securedDebt: number;
  cash: number;
  interestExpense: number;
}

const MATTHEWS_PKG: RegisteredFinancialPackage = {
  packageKey: "matthews:indenture-2027-second-lien",
  instrumentKey: MATTHEWS_INDENTURE_INSTRUMENT,
  sourceDocumentId: MATTHEWS_INDENTURE_DOC,
  operativeVersionLabel: "Indenture dated ~2024-09-27 (Second Lien Notes)",
  companyId: MATTHEWS_COMPANY_ID,
  entityScope: "Issuer and Restricted Subsidiaries",
  asOf: MATTHEWS_AS_OF,
  measurementPeriod: MATTHEWS_PERIOD,
  evidenceAuthority: "PROVISIONAL_RECONSTRUCTION",
  contractualMetricsCompanyId: MATTHEWS_COMPANY_ID,
  assumedNewDebtRatePct: 8.625,
  equityProceedsSinceIssue: 0,
  cumulativeNetIncome: MATTHEWS_EBITDA_COMPONENTS.consolidatedNetIncome,
  totalAssets: 1791.719,
  totalDebt: 809.211,
  securedDebt: 778.882,
  cash: 33.513,
  interestExpense: MATTHEWS_EBITDA_COMPONENTS.interestExpense,
  unsupportedMechanics: MATTHEWS_UNSUPPORTED_MECHANICS,
  ebitdaEvidence: {
    bindingContractualEbitdaMillions: MATTHEWS_EXPECTED_EBITDA_MILLIONS,
    asOfDate: MATTHEWS_AS_OF,
    measurementPeriod: MATTHEWS_PERIOD,
    definitionTerm: "Consolidated EBITDA",
    definitionExcerpt:
      "Consolidated Net Income plus interest, taxes (net of benefits), D&A and non-cash charges per Indenture §1.01",
    definitionCitation: "Indenture §1.01 Consolidated EBITDA",
    bindingApprovalStatus: "PUBLIC_FILING_RECONSTRUCTION / UNVERIFIED",
    methodologyIndependent: true,
    components: [
      { label: "Consolidated Net Income", amountMillions: MATTHEWS_EBITDA_COMPONENTS.consolidatedNetIncome, amountMissing: false, sign: "plus", documentCitation: "TTM CNI", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "RECONSTRUCTED" },
      { label: "Interest Expense", amountMillions: MATTHEWS_EBITDA_COMPONENTS.interestExpense, amountMissing: false, sign: "plus", documentCitation: "TTM interest", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "RECONSTRUCTED" },
      { label: "Income tax benefit (cl.2)", amountMillions: MATTHEWS_EBITDA_COMPONENTS.incomeTaxBenefit, amountMissing: false, sign: "minus", documentCitation: "Indenture cl.(2)", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "RECONSTRUCTED" },
      { label: "D&A", amountMillions: MATTHEWS_EBITDA_COMPONENTS.depreciationAndAmortization, amountMissing: false, sign: "plus", documentCitation: "TTM D&A", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "RECONSTRUCTED" },
      { label: "Goodwill write-downs", amountMillions: MATTHEWS_EBITDA_COMPONENTS.goodwillWriteDowns, amountMissing: false, sign: "plus", documentCitation: "FY2024 10-K SCF", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "REPORTED" },
      { label: "Asset write-downs", amountMillions: MATTHEWS_EBITDA_COMPONENTS.assetWriteDowns, amountMissing: false, sign: "plus", documentCitation: "FY2024 10-K SCF", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "REPORTED" },
      { label: "Stock-based compensation", amountMillions: MATTHEWS_EBITDA_COMPONENTS.stockBasedCompensation, amountMissing: false, sign: "plus", documentCitation: "TTM SBC", measurementPeriod: MATTHEWS_PERIOD, approvalStatus: "RECONSTRUCTED" },
    ],
    unresolvedAdjustments: [...MATTHEWS_UNSUPPORTED_MECHANICS],
    methodologyDisclosure:
      "Definition-first Indenture §1.01 schedule; optional cl.(1)(f)/(1)(g) not invoked. Not a compliance-certificate APPROVED snapshot.",
  },
};

const COHERENT_PKG: RegisteredFinancialPackage = {
  packageKey: "coherent:credit-agreement",
  instrumentKey: COHERENT_INSTRUMENT,
  sourceDocumentId: COHERENT_DOC,
  operativeVersionLabel: "Credit Agreement (evaluation seed)",
  companyId: COHERENT_COMPANY_ID,
  entityScope: "Borrower and Restricted Subsidiaries",
  asOf: COHERENT_AS_OF,
  measurementPeriod: COHERENT_PERIOD,
  evidenceAuthority: "PROVISIONAL_RECONSTRUCTION",
  contractualMetricsCompanyId: COHERENT_COMPANY_ID,
  assumedNewDebtRatePct: 6.5,
  equityProceedsSinceIssue: 2150,
  cumulativeNetIncome: 520,
  totalDebt: 3258,
  securedDebt: 2221,
  cash: 1162,
  interestExpense: 190,
  unsupportedMechanics: COHERENT_UNSUPPORTED_MECHANICS,
  ebitdaEvidence: {
    bindingContractualEbitdaMillions: COHERENT_CERTIFICATE_EBITDA_MILLIONS,
    asOfDate: COHERENT_AS_OF,
    measurementPeriod: COHERENT_PERIOD,
    definitionTerm: "Consolidated EBITDA",
    definitionExcerpt: "Consolidated Net Income plus interest, taxes, D&A and permitted add-backs",
    definitionCitation: "CA §1.01 / Compliance Certificate FY2026",
    bindingApprovalStatus: "SEED_ALIGNED_MODELED — not reviewer APPROVED",
    methodologyIndependent: false,
    components: [],
    unresolvedAdjustments: [...COHERENT_UNSUPPORTED_MECHANICS],
    methodologyDisclosure:
      "Binding value is certificate/seed reported Consolidated EBITDA; add-back unpacking unsupported.",
  },
};

/** Heterogeneous synthetic package — lab only. */
const SYNTHETIC_PKG: RegisteredFinancialPackage = {
  packageKey: "synthetic:demo-credit-facility",
  instrumentKey: "synthetic-term-loan-a",
  sourceDocumentId: "synthetic-credit-agreement",
  operativeVersionLabel: "Synthetic Credit Agreement v1 (lab)",
  companyId: "synthetic-lab",
  entityScope: "Borrower only (lab)",
  asOf: "2026-03-31",
  measurementPeriod: "LTM ending 2026-03-31",
  evidenceAuthority: "SYNTHETIC_LABELED",
  contractualMetricsCompanyId: "synthetic-lab",
  assumedNewDebtRatePct: 7.0,
  equityProceedsSinceIssue: 0,
  cumulativeNetIncome: 40,
  totalDebt: 250,
  securedDebt: 200,
  cash: 50,
  interestExpense: 25,
  unsupportedMechanics: ["Synthetic package — no real operative document"],
  ebitdaEvidence: {
    bindingContractualEbitdaMillions: 100,
    asOfDate: "2026-03-31",
    measurementPeriod: "LTM ending 2026-03-31",
    definitionTerm: "Consolidated EBITDA",
    definitionExcerpt: "Synthetic: CNI + Interest + D&A",
    definitionCitation: "Synthetic CA §1.01",
    bindingApprovalStatus: "SYNTHETIC_LABELED",
    methodologyIndependent: true,
    components: [
      { label: "CNI", amountMillions: 40, amountMissing: false, sign: "plus", documentCitation: "synthetic", measurementPeriod: "LTM", approvalStatus: "UNVERIFIED" },
      { label: "Interest", amountMillions: 25, amountMissing: false, sign: "plus", documentCitation: "synthetic", measurementPeriod: "LTM", approvalStatus: "UNVERIFIED" },
      { label: "D&A", amountMillions: 35, amountMissing: false, sign: "plus", documentCitation: "synthetic", measurementPeriod: "LTM", approvalStatus: "UNVERIFIED" },
    ],
    unresolvedAdjustments: [],
    methodologyDisclosure: "Lab fixture only — never production authority.",
  },
};

const BY_PACKAGE = new Map<string, RegisteredFinancialPackage>(
  [MATTHEWS_PKG, COHERENT_PKG, SYNTHETIC_PKG].map((p) => [p.packageKey, p]),
);

const BY_INSTRUMENT = new Map<string, RegisteredFinancialPackage>(
  [MATTHEWS_PKG, COHERENT_PKG, SYNTHETIC_PKG].map((p) => [p.instrumentKey, p]),
);

/** Convenience index — fixtures only; production code should prefer packageKey. */
const BY_COMPANY = new Map<string, RegisteredFinancialPackage>(
  [MATTHEWS_PKG, COHERENT_PKG, SYNTHETIC_PKG].map((p) => [p.companyId, p]),
);

export function resolveRegisteredPackage(args: {
  packageKey?: string | null;
  instrumentKey?: string | null;
  companyId?: string | null;
}): RegisteredFinancialPackage | null {
  if (args.packageKey && BY_PACKAGE.has(args.packageKey)) return BY_PACKAGE.get(args.packageKey)!;
  if (args.instrumentKey && BY_INSTRUMENT.has(args.instrumentKey)) return BY_INSTRUMENT.get(args.instrumentKey)!;
  if (args.companyId && BY_COMPANY.has(args.companyId)) return BY_COMPANY.get(args.companyId)!;
  return null;
}

export function listRegisteredPackageKeys(): string[] {
  return [...BY_PACKAGE.keys()].sort();
}

export { MATTHEWS_PKG, COHERENT_PKG, SYNTHETIC_PKG };
