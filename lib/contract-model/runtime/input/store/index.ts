/** NS-4 slice 1 — append-only approved financial snapshot store (public exports). */
export type {
  AppendSnapshotRequest,
  ApprovalTransition,
  SnapshotAppendedEvent,
  SnapshotApprovedEvent,
  SnapshotSupersededEvent,
  StoreEvent,
  StoreEventType,
  StoreWriteIssue,
  StoreWriteIssueCode,
  WriteOk,
  WriteRejected,
  WriteResult,
} from "./types";
export { APPENDABLE_STATUSES, APPEND_REFUSED_STATUSES, graphIssuesToStoreIssues } from "./types";
export { InMemoryApprovedSnapshotStore } from "./memory-store";
export { PrismaApprovedSnapshotStore, loadApprovedSnapshotsFromPrisma } from "./prisma-store";
export type { SyncApprovedSnapshotStore, AsyncApprovedSnapshotStore } from "./store-api";
export {
  appendSnapshot,
  approveSnapshot,
  cloneSnapshot,
  freezeSnapshot,
  cloneStoreEvent,
  freezeStoreEvent,
  publicEventLog,
  getSnapshot,
  getSnapshots,
  materializeFromEvents,
} from "./write";

/** NS-4 slice 2 — synthetic certificate → proposal → APPROVED (re-export). */
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
} from "./certificate";
export {
  LedgerProposalRecorder,
  proposeFromCertificate,
  proposeFromCertificateAsync,
  approveCertificateProposal,
  approveCertificateProposalAsync,
  certificateIdentityKey,
  factToFinancialInput,
  factToIdentity,
} from "./certificate";
