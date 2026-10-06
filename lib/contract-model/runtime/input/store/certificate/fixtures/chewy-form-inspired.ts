/**
 * Synthetic compliance-certificate fixture inspired by Chewy-style certificate *forms*
 * (cover + schedule exhibits, company-level metrics). Invented company and numbers only.
 */
import type { SyntheticCertificate } from "../types";

const CO = "synthetic-chewy-form-co";
const PERIOD = "FY2026-Q1";
const AS_OF = "2026-03-31";

export const CHEWY_FORM_INSPIRED_CERT: SyntheticCertificate = {
  documentId: "synth-cert-chewy-form-q1-2026",
  versionHash: "sha256:synth-chewy-form-v1-bbbbbbbb",
  companyId: CO,
  reportingPeriod: PERIOD,
  asOf: AS_OF,
  layoutId: "chewy-form-inspired",
  proposer: {
    kind: "extractor",
    id: "extractor-run-synth-42",
    note: "LLM-extracted synthetic form; requires human approval",
  },
  // Extractor proposals stay REVIEW_REQUIRED until explicit approve.
  proposalStatus: "REVIEW_REQUIRED",
  snapshotId: "snap-synth-chewy-form-q1",
  version: "1",
  supersedesSnapshotId: null,
  note: "Synthetic Chewy-form-inspired layout; extractor-proposed",
  facts: [
    {
      companyId: CO,
      scope: { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
      inputKind: "METRIC",
      key: "Consolidated Net Income",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "MONEY",
      currency: "USD",
      value: { type: "MONEY", amount: "87500000", currency: "USD" },
      locator: { page: 1, section: "Cover — Financial Summary", table: null, row: "Consolidated Net Income" },
      displayName: "Consolidated Net Income",
    },
    {
      companyId: CO,
      scope: { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
      inputKind: "METRIC",
      key: "Interest Coverage Ratio",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "RATIO",
      currency: null,
      value: { type: "RATIO", value: "4.25" },
      locator: { page: 3, section: "Exhibit A — Covenant Calculations", table: "Coverage", row: "Interest Coverage Ratio" },
      displayName: "Interest Coverage Ratio",
    },
    {
      companyId: CO,
      scope: { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
      inputKind: "METRIC",
      key: "Cash and Cash Equivalents",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "MONEY",
      currency: "USD",
      value: { type: "MONEY", amount: "210000000", currency: "USD" },
      locator: { page: 1, section: "Cover — Financial Summary", table: null, row: "Cash and Cash Equivalents" },
      displayName: "Cash and Cash Equivalents",
    },
  ],
  basketUsageLines: [
    {
      basketKey: "Restricted Payments — General Basket",
      instrumentKey: null,
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      amount: "5000000",
      currency: "USD",
      direction: "USAGE",
      locator: { page: 5, section: "Exhibit B — Basket Schedule", table: "RP", row: "General Basket YTD" },
    },
    {
      basketKey: "Indebtedness — Incremental Facility",
      instrumentKey: "synthetic-revolver-1",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      amount: "25000000",
      currency: "USD",
      direction: "CAPACITY_DRAW",
      locator: { page: 5, section: "Exhibit B — Basket Schedule", table: "Debt", row: "Incremental Facility" },
    },
  ],
};
