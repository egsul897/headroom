/**
 * Covenant Knowledge Generalization (CKG) Benchmark — shared types.
 *
 * Independent of Claude-owned acceptance fixtures and of production
 * certification gates. Labels are never model-generated "verified" truth.
 */

export type LabelAuthority =
  | "SOURCE_VERIFIED" // adjudicator read the public source text and cited it
  | "REVIEWER_APPROVED" // human/reviewer-approved synthetic or prior independent GT
  | "UNLABELED"; // present in the dataset but not scored as success/failure

export type CaseOutcome = "SUCCESS" | "FAILURE" | "UNLABELED" | "NOT_EVALUATED";

export type MetricId =
  | "covenant_family_discovery_recall"
  | "definition_extraction_accuracy"
  | "cross_reference_accuracy"
  | "condition_recall"
  | "exception_recall"
  | "entity_scope_accuracy"
  | "amendment_reconstruction"
  | "shared_capacity_recognition"
  | "comparator_correctness"
  | "false_permission_rate"
  | "unsupported_semantic_refusal"
  | "provenance_accuracy"
  | "unseen_document_performance"
  | "cost_per_source_verified_representation";

export type AgreementType =
  | "CREDIT_AGREEMENT"
  | "AMENDED_AND_RESTATED_AGREEMENT"
  | "AMENDMENT"
  | "SYNTHETIC_MICRO";

export type DraftingComplexity = "LOW" | "MEDIUM" | "HIGH";

export type CovenantFamilyId =
  | "INDEBTEDNESS"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "ASSET_SALES"
  | "FUNDAMENTAL_CHANGES"
  | "FINANCIAL_COVENANTS"
  | "QUALITATIVE_NEGATIVE_COVENANTS"
  | "DEFINITIONS"
  | "OTHER";

export interface Stratification {
  agreementType: AgreementType;
  issuer: string;
  covenantFamily: CovenantFamilyId;
  draftingComplexity: DraftingComplexity;
}

export interface SourceProvenance {
  packageId: string;
  documentId: string;
  sectionRef: string;
  excerpt: string;
  sourcePath: string;
  charStart?: number;
  charEnd?: number;
}

export interface ExpectedValue {
  /** Canonical expected value; shape depends on metric. */
  value: unknown;
  authority: LabelAuthority;
  notes?: string;
}

export interface CkgCase {
  caseId: string;
  metric: MetricId;
  strata: Stratification;
  provenance: SourceProvenance;
  expected: ExpectedValue;
  /** When true, a system "PERMITTED"/affirmative answer against expected denial is a false permission. */
  falsePermissionSensitive?: boolean;
  /** When true, correct behavior is explicit unsupported/refusal, not a coerced representation. */
  unsupportedSemantic?: boolean;
  /** Optional USD cost attributed to producing the system output for this case (0 for offline). */
  attributedCostUsd?: number;
}

export interface SystemCandidate {
  caseId: string;
  /** Free-form structured answer the system under test produced. */
  prediction: unknown;
  /** How the prediction was obtained — never treated as ground truth. */
  predictionSource:
    | "DETERMINISTIC_PASS_A"
    | "FROZEN_PIPELINE_ARTIFACT"
    | "SYNTHETIC_ADVERSARIAL_OUTPUT"
    | "ABSENT";
  notes?: string;
}

export interface MetricScore {
  metric: MetricId;
  evaluated: number;
  success: number;
  failure: number;
  unlabeled: number;
  notEvaluated: number;
  /** Primary rate: success / (success + failure). null if no labeled evaluations. */
  rate: number | null;
  /** For rate metrics where lower is better (false_permission_rate). */
  lowerIsBetter: boolean;
  /** Cost dollars attributed to SOURCE_VERIFIED successes only. */
  costUsdOnSourceVerifiedSuccesses: number;
  sourceVerifiedSuccesses: number;
}

export interface CaseResult {
  caseId: string;
  metric: MetricId;
  outcome: CaseOutcome;
  authority: LabelAuthority;
  strata: Stratification;
  detail: string;
  attributedCostUsd: number;
}

export interface StratifiedSlice {
  key: string;
  dimension: "agreementType" | "issuer" | "covenantFamily" | "draftingComplexity";
  value: string;
  cases: number;
  success: number;
  failure: number;
  unlabeled: number;
  rate: number | null;
}

export interface BenchmarkReport {
  schemaVersion: "ckg-benchmark.v1";
  generatedAt: string;
  headSha: string;
  branch: string;
  paidCalls: 0;
  dataset: {
    packageCount: number;
    caseCount: number;
    labeledCaseCount: number;
    unlabeledCaseCount: number;
  };
  metrics: MetricScore[];
  stratified: StratifiedSlice[];
  caseResults: CaseResult[];
  costPerSourceVerifiedRepresentationUsd: number | null;
  outstandingGaps: string[];
  reproducibleCommands: string[];
}
