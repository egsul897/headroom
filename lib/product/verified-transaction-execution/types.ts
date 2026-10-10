/**
 * Canonical verified-transaction execution contract (Agent #10).
 *
 * One server-side orchestration pathway from a selected verified covenant
 * permission + authenticated inputs → a traceable hypothetical or
 * production-authority-classified result.
 *
 * This module does NOT implement capacity/simulate arithmetic. Engines live in
 * `lib/contract-model/verified-execution.ts` (REQUIRE) and `lib/capacity/*`.
 */

import type {
  HypotheticalTransaction,
  LedgerUsageRecord,
  SelectedPath,
  VerifiedCapacityResult,
  VerifiedExecutionPackage,
  VerifiedTransactionResult,
} from "@/lib/contract-model/verified-execution";
import type { InputResolver } from "@/lib/contract-model/verified-execution";
import type {
  TrustedIssuerAuthorizationContext,
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
  UtilizationResolution,
} from "@/lib/capacity";
import type {
  FinancialEvidenceBundle,
  FinancialEvidenceValidationResult,
} from "./adapters/financial-evidence";
import type {
  OperativeSourceAuthority,
  OperativeAuthorityEvaluation,
} from "./adapters/operative-authority";

export const UNIFIED_TRANSACTION_EXECUTION_VERSION =
  "unified-transaction-execution.v1" as const;

/** Rule lifecycle claim — DISCOVERED never promotes to VERIFIED_EXECUTABLE here. */
export type ExecutableRuleLifecycle =
  | "DISCOVERED"
  | "VERIFIED_EXECUTABLE"
  | "REVIEW_REQUIRED"
  | "REJECTED";

export type TransactionType =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ACQUISITION"
  | "FINANCE_LEASE"
  | "OTHER";

export type ExecutionMode = "HYPOTHETICAL" | "PRODUCTION_AUTHORITY";

export type ExecutionStatus =
  | "EXECUTED_HYPOTHETICAL"
  | "EXECUTED_SATISFIED"
  | "REFUSED"
  | "INSUFFICIENT"
  | "NEEDS_INPUT"
  | "UNSUPPORTED";

/**
 * Production-authority classification. May remain BLOCKED even when a
 * hypothetical simulation EXECUTED under REQUIRE.
 */
export type ProductionAuthorityClassification =
  | "PRODUCTION_AUTHORITY_ACTIVE"
  | "PRODUCTION_AUTHORITY_BLOCKED"
  | "HYPOTHETICAL_ONLY";

export interface VerifiedExecutableRuleIdentity {
  ruleId: string;
  /** Claimed lifecycle. Only VERIFIED_EXECUTABLE may proceed favorably. */
  lifecycle: ExecutableRuleLifecycle;
  /** Phase-3 / package verification artifact identity hash or evidence id. */
  verificationArtifactId: string;
  sourceSectionRef: string;
  sourceCitation: string;
  /** IR schema / compiler / source versions the verifier claimed. */
  irSchemaVersion: string;
  compilerVersion: string;
  sourceContentVersion: string;
}

export interface SelectedLegalPath {
  pathId: string;
  ruleIds: string[];
  capacityNodeIds: string[];
  sharedCapacityIds: string[];
  label: string;
  /** Explicit selection — never auto-ranked as "best". */
  selectionMode: "EXPLICIT";
}

export interface ReviewerAuthorization {
  required: boolean;
  actorId: string | null;
  role: "COUNSEL_REVIEWER" | "LEDGER_CUSTODIAN" | "SYSTEM_FIXTURE" | null;
  /**
   * Host-supplied trusted issuer context. Never derived from the request's
   * claimed role alone.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
}

export interface UtilizationCompletenessInput {
  capacityRuleId: string;
  records: readonly UtilizationEvidenceRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  sharedCapacityId?: string | null;
  /**
   * Demo hatch only — never set by production loaders.
   * Allows SYNTHETIC_LABELED completeness for hypothetical runs.
   */
  allowSyntheticRemaining?: boolean;
}

/**
 * Canonical server-side execution request.
 * All authority inputs are explicit; nothing is inferred from ambient state.
 */
export interface UnifiedTransactionExecutionRequest {
  companyId: string;
  instrumentKey: string;
  transaction: {
    type: TransactionType;
    amount: number;
    currency: string;
    date: string;
    label?: string;
    /** Stable id for replay determinism. */
    transactionId?: string;
  };
  selectedLegalPath: SelectedLegalPath;
  verifiedExecutableRule: VerifiedExecutableRuleIdentity;
  operativeSourceAuthority: OperativeSourceAuthority;
  financialEvidence: FinancialEvidenceBundle;
  utilization: UtilizationCompletenessInput;
  ledger: readonly LedgerUsageRecord[];
  reviewerAuthorization: ReviewerAuthorization;
  /** Caller-supplied VerifiedExecutionPackage — never fabricated here. */
  verifiedPackage: VerifiedExecutionPackage;
  /** Phase-4B input resolver over the bound financial snapshot set. */
  inputs: InputResolver;
  /**
   * Requested mode. PRODUCTION_AUTHORITY is refused unless every gate passes
   * and host trusted-issuer activation is ACTIVE. Default HYPOTHETICAL.
   */
  mode?: ExecutionMode;
  /**
   * Demo hatch: allow CALLER_STIPULATED / SYNTHETIC financials for hypothetical
   * simulation only. Never upgrades production authority.
   */
  allowHypotheticalFinancials?: boolean;
}

export interface BindingConstraint {
  kind:
    | "FIXED_DOLLAR"
    | "GREATER_OF"
    | "SHARED_POOL"
    | "RATIO_GATE"
    | "UTILIZATION"
    | "OPERATIVE_AUTHORITY"
    | "FINANCIAL_EVIDENCE"
    | "VERIFICATION"
    | "PATH"
    | "OTHER";
  description: string;
  refs: string[];
}

export interface CapacityEffectsSummary {
  preStatus: string | null;
  postSelectedPathResult: string | null;
  simulationStatus: string | null;
  sharedPoolIds: string[];
  consumedNodeIds: string[];
  grossCapacityLabel: string | null;
  remainingPublicationAllowed: boolean;
  utilizationKnowledge: string | null;
}

export interface ExecutionTraceStep {
  step: string;
  outcome: "PASS" | "REFUSE" | "INFO";
  detail: string;
  refs?: string[];
}

export interface UnifiedTransactionExecutionResult {
  contractVersion: typeof UNIFIED_TRANSACTION_EXECUTION_VERSION;
  executionStatus: ExecutionStatus;
  mode: ExecutionMode;
  productionAuthority: ProductionAuthorityClassification;
  legalPath: {
    pathId: string;
    ruleIds: string[];
    label: string;
    selected: boolean;
  };
  sourceCitations: string[];
  financialInputs: {
    validation: FinancialEvidenceValidationResult;
    metrics: Array<{
      metricKey: string;
      value: number;
      currency: string;
      authenticity: string;
      verificationStatus: string;
      provenanceId: string;
    }>;
  };
  bindingConstraints: BindingConstraint[];
  capacityEffects: CapacityEffectsSummary;
  missingInputs: string[];
  conditions: string[];
  utilizationAuthority: {
    supportsRemainingClaim: boolean;
    productionAuthoritative: boolean;
    knowledge: string | null;
    blockers: string[];
    resolution: UtilizationResolution | null;
  };
  operativeAuthority: OperativeAuthorityEvaluation;
  postStateIdentity: {
    packageHash: string | null;
    transactionId: string | null;
    evaluationDate: string;
    stateHash: string | null;
  };
  trace: ExecutionTraceStep[];
  blockers: string[];
  /** Underlying verified-execution outcomes (not re-computed). */
  verified: {
    capacity: VerifiedCapacityResult | null;
    simulation: VerifiedTransactionResult | null;
    selectedPath: SelectedPath | null;
    transaction: HypotheticalTransaction | null;
  };
  limitations: string[];
  note: string;
}

/** Additive product-surface handoff (Position / Ask / Simulate). */
export interface ProductExecutionHandoff {
  contractVersion: typeof UNIFIED_TRANSACTION_EXECUTION_VERSION;
  surface: "POSITION" | "ASK" | "SIMULATE";
  executionStatus: ExecutionStatus;
  productionAuthority: ProductionAuthorityClassification;
  executable: boolean;
  blockers: string[];
  authorityNote: string;
  selectedPathId: string | null;
  sourceCitations: string[];
  utilizationSupportsRemaining: boolean;
  remainingPublicationAllowed: boolean;
  traceId: string;
}
