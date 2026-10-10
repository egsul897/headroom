/**
 * Continuous Verification Factory — shared types.
 *
 * The factory does NOT implement production legal/capacity semantics.
 * Adapters call existing engines; expected outcomes are frozen ground truth.
 */

import type { CVF_GROUND_TRUTH_CONTRACT_VERSION, CVF_METRICS_VERSION, CVF_VERSION } from "./version";

export type VerificationLane =
  | "STRUCTURAL_DOCUMENT"
  | "COVENANT_EXTRACTION"
  | "DEFINED_TERM_RESOLUTION"
  | "OPERATIVE_AMENDMENT_SELECTION"
  | "DEBT_BASKET"
  | "LIEN_BASKET"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "BUILDER_BASKET"
  | "RATIO_DEBT"
  | "SHARED_CAPACITY"
  | "RECLASSIFICATION"
  | "FINANCIAL_DEFINITION"
  | "FINANCIAL_CALCULATION"
  | "LEDGER_UTILIZATION"
  | "CROSS_DOCUMENT"
  | "INTERCREDITOR"
  | "SEQUENTIAL_TRANSACTION"
  | "POSITION_SIMULATE_ASK"
  | "ADVERSARIAL_METAMORPHIC"
  | "CAPACITY_GATE_STATUS";

export type FixtureClass =
  | "PUBLIC_DEVELOPMENT"
  | "FROZEN_REGRESSION"
  | "BLIND_AUTHENTIC_HOLDOUT"
  | "NEWLY_ACQUIRED_UNSEEN";

export type GroundTruthConfidence = "HIGH" | "MEDIUM" | "LOW" | "AMBIGUOUS";

export type ExpectedLegalOutcome =
  | "PERMITTED"
  | "PROHIBITED"
  | "CONDITIONALLY_PERMITTED"
  | "UNDETERMINED"
  | "MULTIPLE_PATHWAYS"
  | "NOT_APPLICABLE"
  | "REFUSED"
  | "AVAILABLE_FORBIDDEN" // A8-style: status must not be AVAILABLE
  | "MATCH_BASELINE"; // metamorphic: must not improve vs baseline

export type CaseGrade =
  | "CORRECT_FAVORABLE"
  | "CORRECT_REFUSAL"
  | "INCORRECT_FAVORABLE"
  | "INCORRECT_REFUSAL"
  | "MATERIAL_OMISSION"
  | "INCORRECT_FINANCIAL"
  | "UNSUPPORTED_SEMANTIC"
  | "UNRESOLVED"
  | "PASS_NEUTRAL"
  | "ERROR";

export interface SourceDocumentRef {
  documentId: string;
  path: string;
  /** Immutable content hash when available; null until hashed. */
  sha256: string | null;
  role?: string;
}

export interface IndependentRestriction {
  sectionRef: string;
  family: string;
  whyApplicable: string;
}

/**
 * Ground-truth provenance contract — required on every authentic benchmark.
 * Expected outcomes MUST be authored before the SUT runs and never silently rewritten.
 */
export interface GroundTruthProvenance {
  contractVersion: typeof CVF_GROUND_TRUTH_CONTRACT_VERSION;
  issuerId: string;
  financingPackageId: string;
  sourceDocuments: SourceDocumentRef[];
  operativeAsOf: string;
  relevantSections: string[];
  relevantDefinitions: string[];
  independentlyEnumeratedRestrictions: IndependentRestriction[];
  expectedLegalOutcome: ExpectedLegalOutcome;
  expectedFinancialNotes?: string[];
  reviewerIdentity: string;
  reviewProvenance: string;
  confidence: GroundTruthConfidence;
  unresolvedAmbiguities: string[];
  /** ISO timestamp when expectations were frozen (before SUT execution). */
  frozenAt: string;
  /** Explicit claim that expectations were not derived from engine predictions. */
  notDerivedFromEngine: true;
}

export interface VerificationCaseMeta {
  caseId: string;
  title: string;
  lane: VerificationLane;
  fixtureClass: FixtureClass;
  mechanics: VerificationLane[];
  /** Structure family tags for diversity accounting (not test-count inflation). */
  structureFamilies: string[];
  sourcePackageIds: string[];
  adapter: VerificationAdapterId;
  /**
   * Public cases embed provenance; sealed entries store only a seal id.
   * In-repo readable seals MUST use FROZEN_REGRESSION (not BLIND_AUTHENTIC_HOLDOUT).
   * BLIND_AUTHENTIC_HOLDOUT is reserved for answer keys outside the agent workspace.
   */
  provenance:
    | GroundTruthProvenance
    | {
        holdoutSealId: string;
        fixtureClass: "BLIND_AUTHENTIC_HOLDOUT" | "FROZEN_REGRESSION";
        isolationNote?: string;
      };
  tags: string[];
}

export type VerificationAdapterId =
  | "cross-document"
  | "capacity-a8"
  | "sequential-conmed"
  | "metamorphic-cross-document"
  | "suite-pointer"
  | "grounded-boundary";

export interface AdapterExecutionResult {
  adapter: VerificationAdapterId;
  actualLegalOutcome: string;
  falseFavorable: boolean;
  materialOmissions: string[];
  notes: string[];
  details?: Record<string, unknown>;
}

export interface CaseExecutionResult {
  caseId: string;
  lane: VerificationLane;
  fixtureClass: FixtureClass;
  grade: CaseGrade;
  expected: ExpectedLegalOutcome | "SEALED";
  actual: string;
  falseFavorable: boolean;
  materialOmissions: string[];
  structureFamilies: string[];
  durationMs: number;
  notes: string[];
}

export interface CvfMetrics {
  version: typeof CVF_METRICS_VERSION;
  factoryVersion: typeof CVF_VERSION;
  totalExecutions: number;
  uniqueAuthenticScenarios: number;
  uniqueFinancingPackages: number;
  independentGroundTruthCases: number;
  correctFavorable: number;
  correctRefusals: number;
  incorrectFavorable: number;
  incorrectRefusals: number;
  materialRestrictionOmissions: number;
  incorrectFinancialCalculations: number;
  unsupportedSemanticClaims: number;
  unresolvedCases: number;
  /** Diversity denominators — zero false-favorable is meaningless without these. */
  denominators: {
    casesWithIndependentGt: number;
    structureFamilies: number;
    fixtureClasses: Record<FixtureClass, number>;
    lanes: Partial<Record<VerificationLane, number>>;
  };
  byMechanic: Partial<Record<VerificationLane, { executions: number; incorrectFavorable: number }>>;
  note: string;
}

export type CiTier = "PR_FAST" | "INTEGRATION_BATCH" | "SCHEDULED_EXTENSIVE" | "RELEASE_HOLDOUT";
