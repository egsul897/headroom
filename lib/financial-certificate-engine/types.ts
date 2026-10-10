/**
 * Financial + compliance certificate engine types.
 *
 * Distinguishes GAAP / reported metrics from contractual (covenant-defined)
 * metrics. Extraction never auto-approves; reconciliation never invents
 * missing numbers or silently substitutes GAAP for covenant EBITDA.
 */

import type { FinancialUnit } from "@/lib/connectors/units";

export type DocumentRole = "FINANCIAL_STATEMENT" | "COMPLIANCE_CERTIFICATE" | "OFFICER_CERTIFICATE" | "UNKNOWN";

export type MetricFamily =
  | "GAAP_EBITDA"
  | "CONTRACTUAL_EBITDA"
  | "TOTAL_DEBT"
  | "SECURED_DEBT"
  | "FIRST_LIEN_DEBT"
  | "CASH"
  | "TOTAL_ASSETS"
  | "INTEREST_EXPENSE"
  | "FIXED_CHARGES"
  | "CUMULATIVE_NET_INCOME"
  | "EQUITY_PROCEEDS"
  | "LEVERAGE_RATIO"
  | "INTEREST_COVERAGE"
  | "OTHER";

/** Promotable capacity-engine metric names (subset of FINANCIAL_METRIC_FIELD_MAP). */
export type CapacityMetricName =
  | "covenant_ebitda"
  | "total_debt"
  | "secured_debt"
  | "cash"
  | "interest_expense"
  | "cumulative_net_income"
  | "equity_proceeds"
  | "assumed_new_debt_rate_pct";

export interface SourceLocator {
  documentId: string;
  documentRole: DocumentRole;
  versionHash?: string | null;
  lineIndex?: number | null;
  excerpt: string;
  section?: string | null;
  table?: string | null;
  row?: string | null;
}

export interface DocumentIdentity {
  documentId: string;
  documentRole: DocumentRole;
  issuerName: string | null;
  obligorGroup: string | null;
  reportingPeriod: string | null;
  fiscalDate: string | null;
  currency: string | null;
  documentTitle: string | null;
  versionHash: string | null;
  confidenceNotes: string[];
  missingIdentityFields: string[];
}

export interface ExtractedAdjustment {
  kind: "ADDBACK" | "EXCLUSION" | "PRO_FORMA" | "FOOTNOTE";
  label: string;
  amountMillions: number | null;
  /** True when amount could not be parsed — label preserved, value not invented. */
  amountMissing: boolean;
  source: SourceLocator;
}

export interface ExtractedDefinitionRef {
  term: string;
  family: MetricFamily;
  excerpt: string;
  source: SourceLocator;
}

export interface ExtractedMetric {
  family: MetricFamily;
  /** Contractual display name when present (e.g. "Consolidated EBITDA"). */
  contractualName: string | null;
  /** Capacity-engine metricName when this metric may promote; null for GAAP-only / ratio / other. */
  capacityMetricName: CapacityMetricName | null;
  value: number;
  unit: FinancialUnit;
  /** Canonical USD_MILLIONS / PERCENT / RATIO after normalize when applicable. */
  canonicalValue: number;
  canonicalUnit: FinancialUnit;
  asOfDate: string;
  reportingPeriod: string | null;
  isContractual: boolean;
  source: SourceLocator;
}

export interface CertificateCalculation {
  name: string;
  family: MetricFamily;
  reportedValue: number;
  unit: FinancialUnit;
  components: ExtractedAdjustment[];
  source: SourceLocator;
  asOfDate: string;
}

export interface DocumentExtraction {
  identity: DocumentIdentity;
  metrics: ExtractedMetric[];
  adjustments: ExtractedAdjustment[];
  definitions: ExtractedDefinitionRef[];
  certificateCalculations: CertificateCalculation[];
  basketSchedulePresent: boolean;
  missingSchedules: string[];
}

export type ReconcileFindingCode =
  | "MATCH"
  | "MATERIAL_DIFFERENCE"
  | "GAAP_VS_CONTRACTUAL_EBITDA"
  | "STALE_PERIOD"
  | "MISSING_SCHEDULE"
  | "INCONSISTENT_DEFINITION"
  | "MISSING_COUNTERPART"
  | "MISSING_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "UNIT_MISMATCH"
  | "OBLIGOR_SCOPE_MISMATCH"
  | "PRO_FORMA_ACQUISITION"
  | "ADDBACK_WITHOUT_AMOUNT"
  | "PERIOD_MISMATCH"
  | "UNAPPROVED_EXTRACTION";

export interface ReconcileFinding {
  code: ReconcileFindingCode;
  metricFamily: MetricFamily | "PERIOD" | "SCHEDULE" | "DEFINITION" | "PROCESS";
  message: string;
  statementValue: number | null;
  certificateValue: number | null;
  relativeDifference: number | null;
  statementSource: SourceLocator | null;
  certificateSource: SourceLocator | null;
}

export type SnapshotDisposition = "REVIEW_REQUIRED" | "APPROVED_ELIGIBLE" | "BLOCKED";

export interface ReconciliationReport {
  companyId: string;
  statementDocumentId: string | null;
  certificateDocumentId: string | null;
  asOfDate: string | null;
  reportingPeriod: string | null;
  findings: ReconcileFinding[];
  matchedMetricCount: number;
  discrepancyCount: number;
  missingInputKeys: string[];
  /** Never APPROVED merely because figures were extracted. */
  disposition: SnapshotDisposition;
  dispositionReason: string;
}

export interface EngineRunResult {
  statement: DocumentExtraction | null;
  certificate: DocumentExtraction | null;
  reconciliation: ReconciliationReport;
  /** Capacity-bound metrics only — contractual EBITDA preferred; GAAP never substituted. */
  capacityMetrics: Array<{
    metricName: CapacityMetricName;
    value: number;
    asOfDate: string;
    sourceDocumentId: string;
    isContractual: boolean;
  }>;
  /** True when contractual EBITDA is present and distinct from GAAP EBITDA. */
  contractualEbitdaDistinctFromGaap: boolean | null;
}
