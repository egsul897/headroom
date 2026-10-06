/**
 * Invented tabular compliance-certificate layout (not inspired by a named issuer).
 * Used for PUBLIC_FILING_RECONSTRUCTION proposer path + restatement supersession demos.
 * Synthetic numbers only.
 */
import type { SyntheticCertificate } from "../types";

const CO = "synthetic-invented-tabular-co";
const INST = "synthetic-notes-2028";
const PERIOD = "FY2025-FY";
const AS_OF = "2025-12-31";

export const INVENTED_TABULAR_CERT: SyntheticCertificate = {
  documentId: "synth-cert-invented-tabular-fy2025",
  versionHash: "sha256:synth-invented-tabular-v1-cccccccc",
  companyId: CO,
  reportingPeriod: PERIOD,
  asOf: AS_OF,
  layoutId: "invented-tabular",
  proposer: {
    kind: "PUBLIC_FILING_RECONSTRUCTION",
    id: "recon-job-synth-7",
    note: "Reconstructed from public filing tables; marked for approval path",
  },
  proposalStatus: "REVIEW_REQUIRED",
  snapshotId: "snap-synth-invented-tabular-fy2025",
  version: "1",
  supersedesSnapshotId: null,
  note: "Invented tabular layout; PUBLIC_FILING_RECONSTRUCTION",
  facts: [
    {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key: "Adjusted EBITDA",
      identityStrength: "STABLE_KEY",
      period: { kind: "EXACT_PERIOD_ID", periodId: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "MONEY",
      currency: "USD",
      value: { type: "MONEY", amount: "64000000", currency: "USD" },
      locator: { page: 1, section: null, table: "Table 1 — Covenant Inputs", row: "R1" },
      displayName: "Adjusted EBITDA",
    },
    {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key: "Secured Leverage Ratio",
      identityStrength: "STABLE_KEY",
      period: { kind: "EXACT_PERIOD_ID", periodId: PERIOD },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "RATIO",
      currency: null,
      value: { type: "RATIO", value: "2.1" },
      locator: { page: 1, section: null, table: "Table 1 — Covenant Inputs", row: "R2" },
      displayName: "Secured Leverage Ratio",
    },
    {
      companyId: CO,
      scope: { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "LISTED", instrumentKeys: [INST] } },
      inputKind: "TERM_VALUE",
      key: "Minimum Liquidity",
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
      valueType: "MONEY",
      currency: "USD",
      value: { type: "MONEY", amount: "50000000", currency: "USD" },
      locator: { page: 2, section: null, table: "Table 2 — Liquidity", row: "R1" },
      displayName: "Minimum Liquidity",
    },
  ],
  basketUsageLines: [],
};

/** Restatement of invented-tabular FY2025 with corrected EBITDA (explicit supersession). */
export const INVENTED_TABULAR_RESTATEMENT: SyntheticCertificate = {
  ...INVENTED_TABULAR_CERT,
  documentId: "synth-cert-invented-tabular-fy2025-restated",
  versionHash: "sha256:synth-invented-tabular-v2-dddddddd",
  snapshotId: "snap-synth-invented-tabular-fy2025-v2",
  version: "2",
  supersedesSnapshotId: "snap-synth-invented-tabular-fy2025",
  proposer: { kind: "human", id: "reviewer-restatement-1", note: "restatement after correction" },
  proposalStatus: "DRAFT",
  note: "Restatement — explicit supersession of v1",
  facts: INVENTED_TABULAR_CERT.facts.map((f) =>
    f.key === "Adjusted EBITDA"
      ? {
          ...f,
          value: { type: "MONEY" as const, amount: "65500000", currency: "USD" },
          note: "restated amount",
        }
      : f,
  ),
  basketUsageLines: [],
};
