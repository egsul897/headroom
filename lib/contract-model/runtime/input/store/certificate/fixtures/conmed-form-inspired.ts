/**
 * Synthetic compliance-certificate fixture inspired by CONMED-style certificate *forms*
 * (sectioned ratio + leverage block). Invented company and numbers only — no customer secrets.
 */
import type { SyntheticCertificate } from "../types";

const CO = "synthetic-conmed-form-co";
const INST = "synthetic-term-loan-a";
const PERIOD = "FY2026-Q2";
const AS_OF = "2026-06-30";

export const CONMED_FORM_INSPIRED_CERT: SyntheticCertificate = {
  documentId: "synth-cert-conmed-form-q2-2026",
  versionHash: "sha256:synth-conmed-form-v1-aaaaaaaa",
  companyId: CO,
  reportingPeriod: PERIOD,
  asOf: AS_OF,
  layoutId: "conmed-form-inspired",
  proposer: { kind: "human", id: "reviewer-synth-1", note: "hand-keyed from synthetic form" },
  proposalStatus: "DRAFT",
  snapshotId: "snap-synth-conmed-form-q2",
  version: "1",
  supersedesSnapshotId: null,
  note: "Synthetic CONMED-form-inspired layout; invented metrics only",
  facts: [
    {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key: "Consolidated EBITDA",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "MONEY",
      currency: "USD",
      value: { type: "MONEY", amount: "125000000", currency: "USD" },
      locator: { page: 2, section: "I. Financial Covenants", table: "Leverage Metrics", row: "Consolidated EBITDA" },
      displayName: "Consolidated EBITDA",
    },
    {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key: "Consolidated Total Net Debt",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "MONEY",
      currency: "USD",
      value: { type: "MONEY", amount: "412500000", currency: "USD" },
      locator: { page: 2, section: "I. Financial Covenants", table: "Leverage Metrics", row: "Consolidated Total Net Debt" },
      displayName: "Consolidated Total Net Debt",
    },
    {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key: "Total Net Leverage Ratio",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "RATIO",
      currency: null,
      value: { type: "RATIO", value: "3.3" },
      locator: { page: 2, section: "I. Financial Covenants", table: "Leverage Metrics", row: "Total Net Leverage Ratio" },
      displayName: "Total Net Leverage Ratio",
    },
  ],
  basketUsageLines: [
    {
      basketKey: "General Investments Basket",
      instrumentKey: INST,
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      amount: "15000000",
      currency: "USD",
      direction: "USAGE",
      locator: { page: 4, section: "II. Basket Usage Schedule", table: "Usage", row: "General Investments" },
      note: "YTD usage — ledger proposal only",
    },
  ],
};
