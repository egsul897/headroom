/** NS-4 slice 2 — synthetic certificate → fact-proposal → APPROVED path (public exports). */
export type {
  ApproveCertificateProposalRequest,
  BasketUsageScheduleLine,
  CertificateFactLocator,
  CertificateFactProposal,
  CertificateFactValue,
  CertificateProposalIssue,
  CertificateProposalIssueCode,
  CertificateProposer,
  CertificateProposerKind,
  LedgerProposal,
  LedgerProposalStatus,
  ProposeFromCertificateOk,
  ProposeFromCertificateRejected,
  ProposeFromCertificateResult,
  SyntheticCertificate,
} from "./types";
export { LedgerProposalRecorder } from "./ledger-proposals";
export { proposeFromCertificate, proposeFromCertificateAsync } from "./propose";
export { approveCertificateProposal, approveCertificateProposalAsync } from "./approve";
export { certificateIdentityKey, factToFinancialInput, factToIdentity } from "./map-fact";
