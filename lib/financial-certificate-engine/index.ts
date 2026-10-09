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
  runEngineWithCapacityProjection,
} from "./pipeline";
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
export * from "./fixtures";
