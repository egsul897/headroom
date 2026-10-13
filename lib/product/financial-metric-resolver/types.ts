/**
 * Canonical typed financial-input interface for Phase 4C capacity / 4D simulation.
 *
 * Consumed by legacy covenant-engine projections and (where a verified IR package
 * exists) by Phase 4A InputResolver. Never invents values. Authority is explicit.
 */

import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import type { ContractualMetricsBundle } from "@/lib/product/contractual-metrics/types";
import type { MetricInput } from "@/lib/contract-model/definition-execution";

/** How trustworthy the bound financial facts are for product authority. */
export type FinancialEvidenceAuthority =
  /** Reviewer-APPROVED NS-4 / compliance-certificate snapshot. */
  | "APPROVED_SNAPSHOT"
  /** Public-filing reconstruction or seed-aligned modeled certificate — usable for provisional math only. */
  | "PROVISIONAL_RECONSTRUCTION"
  /** Synthetic / lab fixture — never product authority. */
  | "SYNTHETIC_LABELED"
  /** No usable evidence. */
  | "NONE";

/**
 * What product surfaces may publish from this bundle.
 * Provisional evidence NEVER yields CERTIFIED capacity or verified remaining.
 */
export type CapacityPublicationAuthority =
  | "GROSS_PROVISIONAL_ONLY"
  | "GROSS_FROM_APPROVED_SNAPSHOT"
  | "VERIFIED_REMAINING_ELIGIBLE"
  | "REFUSED";

export interface FinancialMetricIdentity {
  /** Package / instrument identity — production resolution key (not companyId). */
  packageKey: string;
  instrumentKey: string;
  sourceDocumentId: string;
  operativeVersionLabel: string;
  companyId: string;
  entityScope: string;
  measurementPeriod: string;
  asOf: string;
  currency: "USD";
  unit: "USD_MILLIONS";
}

export interface TypedFinancialFact {
  key: string;
  label: string;
  valueMillions: number | null;
  readiness: "AVAILABLE_VERIFIED" | "AVAILABLE_UNVERIFIED" | "MISSING" | "UNSUPPORTED" | "STALE" | "AMBIGUOUS";
  sourceCitation: string;
  evidenceAuthority: FinancialEvidenceAuthority;
}

export interface CanonicalFinancialInputBundle {
  identity: FinancialMetricIdentity;
  evidenceAuthority: FinancialEvidenceAuthority;
  capacityPublication: CapacityPublicationAuthority;
  /** Contractual metrics from Phase 4A definition execution (when package present). */
  contractualMetrics: ContractualMetricsBundle | null;
  /** #324-style EBITDA derivation classification. */
  ebitdaDerivation: ContractualEbitdaDerivation | null;
  facts: TypedFinancialFact[];
  unsupportedMechanics: string[];
  missingInputs: string[];
  /**
   * Projection for legacy covenant-engine / solver leaf math.
   * Null when contractual EBITDA or required debt/cash facts are missing.
   */
  legacyFinancialSnapshot: FinancialSnapshotInput | null;
  /** Phase 4A MetricInput[] for evaluateExpression / capacity graph resolvers. */
  runtimeMetrics: MetricInput[];
  /**
   * Content fingerprint of (instrument, definition ids, fact values, ledger fingerprint).
   * Changing any input changes this — used for dependency invalidation.
   */
  dependencyFingerprint: string;
  notes: string[];
}

export interface TransactionScenarioRequest {
  packageKey: string;
  /** Contemplated amount in $M. */
  amountMillions: number;
  secured: boolean;
  /** Cross-domain action for RP / investment baskets. */
  action: "SECURED_DEBT_INCURRENCE" | "RESTRICTED_PAYMENT" | "INVESTMENT";
  label: string;
}

export interface BasketEvaluationRow {
  family: "INDEBTEDNESS" | "LIEN" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "FINANCIAL_COVENANT";
  code: string;
  sectionRef: string;
  basketName: string;
  formulaType: string;
  status: "modeled" | "not_tested" | "review_required";
  capacityMillions: number | null;
  reason: string | null;
  /** Never true when evidenceAuthority is provisional/synthetic. */
  mayClaimVerifiedRemaining: boolean;
}

export interface TransactionScenarioResult {
  request: TransactionScenarioRequest;
  bundle: CanonicalFinancialInputBundle;
  pre: {
    totalNetLeverage: number | null;
    securedNetLeverage: number | null;
    interestCoverage: number | null;
    contractualEbitda: number | null;
  };
  post: {
    totalNetLeverage: number | null;
    securedNetLeverage: number | null;
    interestCoverage: number | null;
    totalDebt: number | null;
    securedDebt: number | null;
  };
  debtIncurrence: {
    status: string;
    overallCapacity: number | null;
    reason: string | null;
    publicationAuthority: CapacityPublicationAuthority;
  } | null;
  baskets: BasketEvaluationRow[];
  ledgerEffectsProposed: Array<{
    kind: string;
    amountMillions: number;
    basket: string;
    note: string;
  }>;
  blockersToAuthoritativeAnswer: string[];
  dependencyFingerprint: string;
}
