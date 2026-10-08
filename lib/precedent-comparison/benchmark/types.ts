/**
 * Independent comparison benchmark types (Phase 3).
 *
 * Ground truth is authored offline — never produced by compareProvisions().
 */
import type { ClaimDimension, ComparableCovenantFamily, PrecedentProvision } from "../types";

export type BenchmarkSplit = "DEV" | "HELD_OUT";

export type BenchmarkCategory =
  | "MATERIALLY_DIFFERENT"
  | "TEXTUALLY_DIFFERENT_LEGALLY_EQUIVALENT"
  | "IDENTICAL_TEXT_DIFFERENT_DEFINITIONS"
  | "DIFFERENT_PROVISO_ATTACHMENT"
  | "DIFFERENT_ENTITY_SCOPE"
  | "DIFFERENT_AMENDMENT_STATUS"
  | "DIFFERENT_FINANCIAL_THRESHOLDS"
  | "CROSS_DOCUMENT_RESTRICTION"
  | "MISSING_CONTROLLING_DEFINITIONS"
  | "SHARED_CAPACITY_DIFFERENCE";

export interface BenchmarkGroundTruth {
  /** Whether normalized source texts differ. */
  textualDifference: boolean;
  /** Whether the difference (or identical text + defs) creates a material legal difference. */
  materialLegalDifference: boolean;
  /** Text differs but mechanics are equivalent for the compared permission. */
  legallyEquivalentDespiteText: boolean;
  /** Same operative wording; defined-term meanings diverge. */
  identicalTextDifferentDefinitions: boolean;
  expectedMaterialDimensions: ClaimDimension[];
  controllingContextComplete: boolean;
  amendmentVersionMatters: boolean;
  /** Engine must not emit REVIEWER_VERIFIED without an external ClaimReviewRecord. */
  mustRefuseUnsupportedConclusion: boolean;
  authorNote: string;
}

export interface BenchmarkScenario {
  id: string;
  split: BenchmarkSplit;
  category: BenchmarkCategory;
  covenantFamily: ComparableCovenantFamily | "QUALITATIVE_NEGATIVE_COVENANTS";
  left: PrecedentProvision;
  right: PrecedentProvision;
  /** Optional definition overlays for IDENTICAL_TEXT_DIFFERENT_DEFINITIONS. */
  leftDefinitionOverlay?: string;
  rightDefinitionOverlay?: string;
  groundTruth: BenchmarkGroundTruth;
}

export interface ScenarioEvaluation {
  scenarioId: string;
  split: BenchmarkSplit;
  category: BenchmarkCategory;
  textualOk: boolean;
  materialPredicted: boolean;
  materialExpected: boolean;
  falseMaterialDifference: boolean;
  missedMaterialDifference: boolean;
  citationOk: boolean;
  dependencyClosureReported: boolean;
  amendmentVersionOk: boolean;
  unsupportedConclusionRefused: boolean;
  qualifiedWhenIncomplete: boolean;
  notes: string[];
}

export interface BenchmarkMetrics {
  split: BenchmarkSplit | "ALL";
  n: number;
  textualAccuracy: number;
  materialPrecision: number;
  materialRecall: number;
  materialPrecisionDenominator: number;
  materialRecallDenominator: number;
  falseMaterialDifferenceCount: number;
  missedMaterialDifferenceCount: number;
  citationCorrectRate: number;
  citationDenominator: number;
  dependencyClosureReportedRate: number;
  amendmentVersionCorrectRate: number;
  unsupportedConclusionRefusalRate: number;
  qualifiedIncompleteRate: number;
}
