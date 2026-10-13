/**
 * North-Star product bridge — the ONLY surface product code may use to reach
 * Phase 4B snapshot store, NS-6 selector, Phase 4C contract ledger, and the
 * Phase 4B snapshot input resolver.
 *
 * Mirrors the verified-execution boundary pattern: raw `runtime/*` imports stay
 * inside contract-model; app/lib/product never import `contract-model/runtime`.
 *
 * Capacity/transaction execution under REQUIRE remains `verified-execution.ts`
 * (product may import that module directly). This bridge does not auto-approve
 * certificates or invent latest-quarter cutoffs.
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
  BasketUsageScheduleLine,
  LedgerProposal,
  CertificateFactProposal,
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

/** Phase 4B resolver over APPROVED snapshots — product must not import runtime/* for this. */
export { snapshotInputResolver } from "./runtime/input/snapshot-resolver";
export type { SnapshotResolverArgs, SnapshotInputResolver } from "./runtime/input/snapshot-resolver";

/** Exact decimal constructor for APPROVED metric figures — product must not import runtime/decimal. */
export { rational, rationalFromNumber, rationalFromString, toApproximateNumber } from "./runtime/decimal";
export type { InputResolver, InputProvenance } from "./runtime/types";
export type { FinancialInput, FinancialSnapshot, SnapshotStatus } from "./runtime/input/types";

/** Phase 4A expression evaluation — product must not import runtime/evaluate-expression. */
export { evaluateExpression } from "./runtime/evaluate-expression";
export type { EvaluationResult } from "./runtime/types";

/** Fixture/reference InputResolver builders — product must not import runtime/input-resolver. */
export { fixtureInputResolver, metricInput, EMPTY_RESOLVER } from "./runtime/input-resolver";

/** Runtime money values — product must not import runtime/values. */
export { money } from "./runtime/values";

/** Phase 4B identity resolver — product must not import runtime/input/resolve. */
export { resolveInput } from "./runtime/input/resolve";
export type { ResolveArgs } from "./runtime/input/resolve";
export type { ResolutionResult } from "./runtime/input/types";

/** Synthetic certificate fixtures — engineering only; not authentic customer data. */
export { CONMED_FORM_INSPIRED_CERT, CHEWY_FORM_INSPIRED_CERT, INVENTED_TABULAR_CERT } from "./runtime/input/store/certificate/fixtures";
