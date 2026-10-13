/**
 * UCD-1a — Contractual financial definition identity (company-agnostic).
 *
 * Reuses Phase 3A IR shapes (IRDefinition / METRIC_REFERENCE / DEFINED_TERM_REFERENCE /
 * UNSUPPORTED). Does not compile from documents, does not invent values, and does not
 * claim dashboard authority. Purpose: a generalized representation for recursive
 * defined-term dependencies, explicit unsupported adjustments, and input readiness
 * (UCD-4 vocabulary) before ratio/capacity engines bind facts.
 *
 * Same metric *names* across instruments are never treated as equivalent definitions.
 */

import type { IRDefinition, IRExpression, RepresentationSufficiency, SourceProvenance } from "../ir/types";

/** Well-known contractual metric families — labels only; definitions remain instrument-scoped. */
export type ContractualMetricKind =
  | "CONSOLIDATED_EBITDA"
  | "ADJUSTED_EBITDA"
  | "CONSOLIDATED_NET_INCOME"
  | "CONSOLIDATED_TOTAL_DEBT"
  | "CONSOLIDATED_SECURED_DEBT"
  | "FIRST_LIEN_DEBT"
  | "CONSOLIDATED_NET_DEBT"
  | "CASH_AND_PERMITTED_CASH_NETTING"
  | "FIXED_CHARGES"
  | "INTEREST_EXPENSE"
  | "TOTAL_ASSETS"
  | "CONSOLIDATED_TOTAL_ASSETS"
  | "AVAILABLE_AMOUNT"
  | "CUMULATIVE_CREDIT"
  | "OTHER_DEFINED_TERM";

/** How an adjustment/exclusion/addback is represented in the definition program. */
export type AdjustmentRepresentation =
  | { kind: "SUPPORTED_EXPRESSION"; expression: IRExpression }
  | {
      kind: "UNSUPPORTED";
      reason: string;
      sourceEvidence: string;
      semanticDescription: string;
    };

export type MeasurementPeriodSpec =
  | { kind: "UNSPECIFIED" }
  | { kind: "VERBATIM_CONTRACT_TEXT"; text: string }
  | { kind: "TRAILING_PERIOD"; spec: string }
  | { kind: "AS_OF"; isoDate: string | null; verbatim: string | null };

/**
 * UCD-4 input readiness — never invent missing values; never treat UNKNOWN as zero.
 */
export type FinancialInputReadiness =
  | "AVAILABLE_VERIFIED"
  | "AVAILABLE_UNVERIFIED"
  | "MISSING"
  | "AMBIGUOUS"
  | "STALE"
  | "UNSUPPORTED";

export interface FinancialInputRequirement {
  /** Stable key within the instrument (often the term or metric name). */
  key: string;
  metricKind: ContractualMetricKind | "RAW_FINANCIAL_FACT" | "LEDGER_USAGE" | "REVIEWER_DECISION";
  readiness: FinancialInputReadiness;
  /** What would resolve MISSING / AMBIGUOUS / STALE / UNSUPPORTED. */
  requiredEvidence: string;
  /** Whether a public filing could supply a candidate (still needs verification for APPROVED use). */
  publicFilingCandidate: boolean;
  /** Whether company-provided or reviewer-verified material is required. */
  companyOrReviewerRequired: boolean;
  notes?: string;
}

/**
 * Instrument-scoped contractual financial definition — not a global EBITDA type.
 */
export interface ContractualFinancialDefinition {
  definitionId: string;
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  termName: string;
  metricKind: ContractualMetricKind;
  /** Formal calculation when compositional; null when only prose / unsupported. */
  calculationExpression: IRExpression | null;
  dependsOnTerms: string[];
  adjustments: AdjustmentRepresentation[];
  measurementPeriod: MeasurementPeriodSpec;
  proFormaTreatment: "NONE" | "CONTRACTUAL_PRO_FORMA" | "UNSUPPORTED" | "REVIEW_REQUIRED";
  sufficiency: RepresentationSufficiency;
  sufficiencyReasons: string[];
  provenance: SourceProvenance | null;
  /** Backing IR definition when one exists. */
  irDefinition: IRDefinition | null;
}

export interface DefinitionDependencyNode {
  termName: string;
  definitionId: string | null;
  metricKind: ContractualMetricKind | null;
  depth: number;
  status: "RESOLVED" | "UNRESOLVED" | "CYCLE" | "UNSUPPORTED";
  reason?: string;
}

export interface DefinitionDependencyClosure {
  rootDefinitionId: string;
  rootTermName: string;
  nodes: DefinitionDependencyNode[];
  unresolvedTerms: string[];
  cycles: string[][];
  executable: boolean;
}

export interface DefinitionInputManifest {
  definitionId: string;
  termName: string;
  companyId: string;
  instrumentKey: string;
  requirements: FinancialInputRequirement[];
  blockingReadiness: FinancialInputReadiness[];
  mayEvaluateAuthoritatively: boolean;
}
