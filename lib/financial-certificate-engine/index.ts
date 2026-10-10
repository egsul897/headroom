/**
 * Financial and compliance certificate engine.
 *
 * Reuses NS-4 propose/approve, FINANCIAL_FACT promotion vocabulary, and
 * financial-core solver adapter. Does not auto-approve extractions or
 * substitute GAAP for contractual EBITDA.
 */

export { identifyDocument } from "./identity";
export { extractFromDocumentText } from "./extract";
export { reconcileStatementAgainstCertificate, DEFAULT_RECONCILE_TOLERANCE } from "./reconcile";
export {
  buildCertificateProposalFromEngine,
  proposeNs4SnapshotFromEngine,
  approveNs4SnapshotAttributable,
} from "./snapshot";
export {
  projectEngineRunToCapacitySnapshot,
  projectEngineRunToCapacitySnapshotStrict,
  buildFinancialStateFromEngineRun,
  positionLeverageInputsFromEngine,
} from "./capacity-bridge";
export {
  runFinancialCertificateEngine,
  runFinancialCertificateEngineWithDerivedMetrics,
  runEngineWithCapacityProjection,
} from "./pipeline";
export {
  assertSnapshotAuthoritative,
  isAuthoritativeSnapshotStatus,
  NonAuthoritativeSnapshotError,
  proposeFinancialSnapshotLifecycle,
  approveProposedFinancialSnapshot,
  loadVerifiedFinancialCapacityInput,
  resolveApprovedSnapshotInputs,
  runApprovalToCapacityBridge,
} from "./approval-bridge";
export {
  computeContractualRatios,
  runSequentialFinancialEffects,
  netDebtIncreasingBorrowActions,
  cashOutflowActions,
  debtRepaymentActions,
  equityContributionCashActions,
  applyEquityProceedsBump,
  expectedCashDebtDeltas,
  tagStateAsOf,
} from "./sequential-financial";
export { deriveContractualMetrics } from "./derived-metrics";
export {
  SHARED_FINANCIAL_SURFACES,
  buildSharedFinancialViewFromEngineRun,
  buildSharedFinancialViewFromVerified,
  loadSharedFinancialCertificationView,
  financialStateForSurfaces,
} from "./financial-view";
export {
  evaluateAuthenticCapacityWithApprovedFinancials,
  toAuthenticCapacityRow,
} from "./authentic-capacity-bridge";
export {
  labelAuthority,
  classifyApprovedSnapshotAuthority,
  isTestOrNonProductionReviewerIdentity,
  FIXTURE_AUTHORITY,
} from "./authority";
export { publishRemainingCapacity } from "./utilization-honesty";
export {
  evaluateVerifiedCapacityWithApprovedFinancials,
  runVerifiedSequentialTransactions,
  VERIFIED_EXECUTION_POLICY,
} from "./verified-path";
export type {
  DocumentRole,
  MetricFamily,
  CapacityMetricName,
  SourceLocator,
  DocumentIdentity,
  ExtractedAdjustment,
  ExtractedDefinitionRef,
  ExtractedMetric,
  CertificateCalculation,
  DocumentExtraction,
  ReconcileFindingCode,
  ReconcileFinding,
  SnapshotDisposition,
  ReconciliationReport,
  EngineRunResult,
} from "./types";
export type { PipelineDocumentInput, RunFinancialCertificateEngineParams } from "./pipeline";
export type { CapacityProjection } from "./capacity-bridge";
export type { ProposeNs4Result } from "./snapshot";
export type {
  SnapshotAuthorityStatus,
  VerifiedFinancialCapacityInput,
  ApprovalBridgeProposeResult,
  ApprovalBridgeApproveResult,
} from "./approval-bridge";
export type {
  SequentialFinancialRun,
  SequentialFinancialStep,
  ContractualRatioView,
  SequentialUncertaintyCode,
  SequentialStepSpec,
} from "./sequential-financial";
export type { DerivedContractualMetric, DerivedMetricStatus } from "./derived-metrics";
export type {
  SharedFinancialCertificationView,
  CustomerSurface,
} from "./financial-view";
export type {
  AuthenticCapacityWithApprovedFinancials,
  AuthenticProvisionCapacityRow,
  AuthenticCapacityBridgeResult,
  AuthenticCapacityBlockReason,
} from "./authentic-capacity-bridge";
export type {
  FinancialInputAuthorityKind,
  FinancialInputAuthorityLabel,
} from "./authority";
export type {
  UtilizationCompletenessCertificate,
  TrustedCompletenessCertificate,
  AttributedUtilizationRecord,
  RemainingPublication,
} from "./utilization-honesty";
export type {
  VerifiedPathFinancialBase,
  VerifiedPathCapacityEval,
  VerifiedSequentialStepResult,
  VerifiedSequentialRunResult,
  VerifiedSequentialSimulationView,
} from "./verified-path";
export * from "./fixtures";
