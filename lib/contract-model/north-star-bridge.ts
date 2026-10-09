/**
 * North-Star product bridge — the ONLY surface product code may use to reach
 * Phase 4B snapshot store, NS-6 selector, and Phase 4C contract ledger.
 *
 * Mirrors the verified-execution boundary pattern: raw `runtime/*` imports stay
 * inside contract-model; app/lib/product never import `contract-model/runtime`.
 *
 * Does not execute capacity/transaction simulation (that remains verified-execution).
 * Does not auto-approve certificates or invent latest-quarter cutoffs.
 */

export {
  PrismaApprovedSnapshotStore,
  loadApprovedSnapshotsFromPrisma,
  InMemoryApprovedSnapshotStore,
  LedgerProposalRecorder,
  proposeFromCertificate,
  proposeFromCertificateAsync,
  approveCertificateProposal,
  approveCertificateProposalAsync,
} from "./runtime/input/store";

export type {
  SyntheticCertificate,
  ProposeFromCertificateResult,
  ApproveCertificateProposalRequest,
} from "./runtime/input/store";

export {
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
  DEFAULT_SELECTOR_RESOLUTION_POLICY,
} from "./runtime/input/selector";

export type {
  DeliveryRecord,
  FiscalCalendar,
  NamedContractualSelector,
  ResolveSelectorRequest,
  SelectorResolutionResult,
} from "./runtime/input/selector";

export {
  PrismaContractLedgerStore,
  InMemoryContractLedgerStore,
  loadLedgerUsagesFromPrisma,
} from "./runtime/capacity/store";

export type { LedgerUsageRecord } from "./runtime/capacity/types";

/** Synthetic certificate fixtures — engineering only; not authentic customer data. */
export { CONMED_FORM_INSPIRED_CERT, CHEWY_FORM_INSPIRED_CERT, INVENTED_TABULAR_CERT } from "./runtime/input/store/certificate/fixtures";
