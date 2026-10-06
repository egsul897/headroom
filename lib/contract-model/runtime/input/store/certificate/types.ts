/**
 * NS-4 slice 2 — certificate fact-proposal types (synthetic → DRAFT/REVIEW_REQUIRED → APPROVED).
 *
 * Model-agnostic proposal records for heterogeneous certificate layouts.
 * Consumes frozen Phase 4B identity; does not change 4B resolver/identity/snapshot semantics.
 * Basket-usage schedule lines become 4C ledger PROPOSALS only (recorded, never applied, never snapshot facts).
 */
import type { RuntimeValueType } from "../../../types";
import type {
  AsOfSelector,
  IdentityStrength,
  InputKind,
  InputScope,
  PeriodSelector,
  SnapshotStatus,
} from "../../types";
import type { StoreWriteIssue, WriteResult } from "../types";

/** Who proposed the certificate facts. */
export type CertificateProposerKind = "human" | "extractor" | "PUBLIC_FILING_RECONSTRUCTION";

export interface CertificateProposer {
  kind: CertificateProposerKind;
  /** Human id, extractor run id, or reconstruction job id. */
  id: string;
  note?: string;
}

/** Page / section / table / row locator inside the source document. */
export interface CertificateFactLocator {
  page?: number | null;
  section?: string | null;
  table?: string | null;
  row?: string | null;
  note?: string;
}

/**
 * Proposed numeric/boolean/date payload. Amounts are decimal strings (exact Rational at map time).
 * MONEY always carries currency here; proposal pipeline refuses MONEY without currency.
 */
export type CertificateFactValue =
  | { type: "MONEY"; amount: string; currency: string }
  | { type: "NUMBER"; value: string }
  | { type: "RATIO"; value: string }
  | { type: "PERCENT"; fraction: string }
  | { type: "BOOLEAN"; value: boolean }
  | { type: "DATE"; isoDate: string };

/**
 * One proposed fact from a certificate. Maps 1:1 onto Phase 4B `FinancialInput` identity.
 * Does not include LEDGER_USAGE / basket-usage — those go to `BasketUsageScheduleLine`.
 */
export interface CertificateFactProposal {
  companyId: string;
  scope: InputScope;
  inputKind: InputKind;
  key: string;
  identityStrength: IdentityStrength;
  period: PeriodSelector;
  asOf: AsOfSelector;
  valueType: RuntimeValueType;
  /** Required when valueType is MONEY; part of 4B identity. */
  currency: string | null;
  /** Optional non-currency unit (e.g. shares); never substitutes for MONEY currency. */
  unit?: string | null;
  value: CertificateFactValue;
  locator: CertificateFactLocator;
  displayName?: string;
  note?: string;
}

/**
 * Basket-usage schedule line from a certificate.
 * Becomes a 4C `LedgerProposal` only — never a snapshot fact, never applied in slice 2.
 */
export interface BasketUsageScheduleLine {
  basketKey: string;
  instrumentKey: string | null;
  period: PeriodSelector;
  asOf: AsOfSelector;
  amount: string;
  currency: string;
  direction: "USAGE" | "CAPACITY_DRAW" | "REPAYMENT";
  locator: CertificateFactLocator;
  note?: string;
}

/** Recorded (not applied) 4C ledger proposal. */
export type LedgerProposalStatus = "RECORDED";

export interface LedgerProposal {
  proposalId: string;
  recordedAt: string;
  sourceDocumentId: string;
  sourceVersionHash: string;
  companyId: string;
  line: BasketUsageScheduleLine;
  /** Always RECORDED in slice 2 — never APPLIED. */
  status: LedgerProposalStatus;
  proposer: CertificateProposer;
}

/**
 * Synthetic compliance-certificate fixture (no customer secrets; invented numbers).
 * Layout ids name form inspiration only — store code never hardcodes CONMED/Chewy sectionRefs.
 */
export interface SyntheticCertificate {
  documentId: string;
  /** Content/version hash of the source document bytes (synthetic for fixtures). */
  versionHash: string;
  companyId: string;
  reportingPeriod: string | null;
  asOf: string | null;
  /** Heterogeneous layout tag (e.g. conmed-form-inspired, chewy-form-inspired, invented-tabular). */
  layoutId: string;
  proposer: CertificateProposer;
  /** Proposal append status — DRAFT | REVIEW_REQUIRED only. APPROVED requires explicit approve. */
  proposalStatus: Extract<SnapshotStatus, "DRAFT" | "REVIEW_REQUIRED">;
  snapshotId: string;
  version: string;
  supersedesSnapshotId?: string | null;
  facts: CertificateFactProposal[];
  basketUsageLines: BasketUsageScheduleLine[];
  note?: string;
}

/** Proposal-local issue codes (plus store unsafe-graph codes via WriteResult). */
export type CertificateProposalIssueCode =
  | "MONEY_WITHOUT_CURRENCY"
  | "DUPLICATE_IDENTITY_IN_CERTIFICATE"
  | "BASKET_LINE_MUST_NOT_BE_SNAPSHOT_FACT"
  | "INVALID_PROPOSAL_STATUS"
  | "VALUE_TYPE_MISMATCH"
  | "STORE_WRITE_REJECTED";

export interface CertificateProposalIssue {
  code: CertificateProposalIssueCode;
  message: string;
  /** Fact keys / basket keys / snapshot ids involved. */
  refs: string[];
  storeIssues?: StoreWriteIssue[];
}

export type ProposeFromCertificateOk = {
  ok: true;
  write: Extract<WriteResult, { ok: true }>;
  /** Ledger proposals recorded (never applied) from basket-usage lines. */
  ledgerProposals: LedgerProposal[];
};

export type ProposeFromCertificateRejected = {
  ok: false;
  issues: CertificateProposalIssue[];
};

export type ProposeFromCertificateResult = ProposeFromCertificateOk | ProposeFromCertificateRejected;

export interface ApproveCertificateProposalRequest {
  snapshotId: string;
  reviewedBy: string;
  reviewedAt: string;
  approvalRef: string;
  /** Optional provenance note linking back to the certificate document. */
  sourceDocumentId?: string;
  sourceVersionHash?: string;
  proposerKind?: CertificateProposerKind;
}
