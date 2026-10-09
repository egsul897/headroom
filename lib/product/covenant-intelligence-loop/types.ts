/**
 * Continuous Covenant Intelligence Loop — shared types.
 * Stages: INGEST → STRUCTURE → INTERPRET → COMPILE → EXERCISE → DIAGNOSE → IMPROVE → REEXERCISE → PUBLISH
 */

export const LOOP_STAGES = [
  "INGEST",
  "STRUCTURE",
  "INTERPRET",
  "COMPILE",
  "EXERCISE",
  "DIAGNOSE",
  "IMPROVE",
  "REEXERCISE",
  "PUBLISH",
] as const;

export type LoopStage = (typeof LOOP_STAGES)[number];

export type StageStatus = "PENDING" | "RUNNING" | "OK" | "SKIPPED" | "FAILED" | "CONDITIONAL";

export type GapCategory =
  | "DOCUMENT_PARSE_FAILURE"
  | "SECTION_BOUNDARY_FAILURE"
  | "MISSING_COVENANT"
  | "DEFINITION_NOT_RESOLVED"
  | "CROSS_REFERENCE_NOT_RESOLVED"
  | "BASKET_NOT_EXTRACTED"
  | "FORMULA_NOT_COMPILED"
  | "ENTITY_SCOPE_UNRESOLVED"
  | "AMENDMENT_PRECEDENCE_UNRESOLVED"
  | "FINANCIAL_INPUT_MISSING"
  | "SHARED_CAPACITY_NOT_MODELED"
  | "RETRIEVAL_MISS"
  | "CITATION_MISMATCH"
  | "CALCULATION_UNSUPPORTED"
  | "CONFLICTING_INTERPRETATIONS"
  | "SOFTWARE_DEFECT"
  | "INFORMATION_ABSENT";

export type GapOrigin = "SOFTWARE" | "DOCUMENT_ABSENT" | "CUSTOMER_INPUT_ABSENT" | "AMBIGUITY";

export interface StageRecord {
  stage: LoopStage;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  outputs?: Record<string, unknown>;
  retryCount: number;
}

export interface AnalyticalGap {
  category: GapCategory;
  origin: GapOrigin;
  message: string;
  exerciseId?: string;
  sourceId?: string;
  sectionRef?: string;
  evidence?: string;
}

export interface ExerciseDefinition {
  exerciseId: string;
  version: string;
  family:
    | "DEBT_INCURRENCE"
    | "LIENS"
    | "RESTRICTED_PAYMENTS"
    | "INVESTMENTS"
    | "FINANCIAL_RATIOS"
    | "ASSET_SALES"
    | "AMENDMENTS_REFINANCING"
    | "MULTI_STEP";
  title: string;
  question: string;
  /** Amount in millions when applicable */
  amountMillions?: number;
  tags: string[];
  requiredCategories: string[];
  requiredFinancialInputs: string[];
}

export interface ExerciseExecutionResult {
  exerciseId: string;
  sourceId: string;
  runId: string;
  executedAt: string;
  outcome: "SUBSTANTIVE" | "CONDITIONAL" | "UNSUPPORTED" | "FAILED";
  headline: string;
  analysis: string;
  citations: Array<{ sectionRef: string; excerpt: string; posture?: string }>;
  restrictions: string[];
  permissions: string[];
  baskets: string[];
  definitions: string[];
  conditions: string[];
  assumptions: string[];
  alternatives: string[];
  requiredInputs: string[];
  missingInputs: string[];
  conditionalFormula?: string;
  supportedAmountNote?: string;
  gaps: AnalyticalGap[];
  itemCountMatched: number;
}

export interface DraftingPattern {
  patternId: string;
  name: string;
  family: string;
  structuralSummary: string;
  calculationMethod?: string;
  conditions: string[];
  variations: string[];
  associatedExerciseIds: string[];
  sourceExamples: string[];
  priorFailurePatterns: GapCategory[];
}

export interface EngineeringTask {
  taskId: string;
  category: GapCategory;
  priority: number;
  title: string;
  affectedSourceIds: string[];
  affectedExerciseIds: string[];
  occurrenceCount: number;
  expectedImprovement: string;
  relevantModules: string[];
  reproductionNotes: string;
  status: "OPEN" | "IN_PROGRESS" | "FIXED" | "WONTFIX";
  createdAt: string;
  updatedAt: string;
}

export interface LoopRunRecord {
  runId: string;
  createdAt: string;
  updatedAt: string;
  scope: "PUBLIC_CORPUS" | "CUSTOMER" | "SINGLE_SOURCE";
  companyId?: string;
  sourceIds: string[];
  stages: StageRecord[];
  exerciseResults: ExerciseExecutionResult[];
  gaps: AnalyticalGap[];
  patternsCaptured: string[];
  engineeringTasks: EngineeringTask[];
  publishSummary?: {
    documentsProcessed: number;
    exerciseTypes: number;
    executions: number;
    substantive: number;
    conditional: number;
    unsupported: number;
    failed: number;
    gapHistogram: Record<string, number>;
  };
}
