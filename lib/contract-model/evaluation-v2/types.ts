/**
 * Evaluation Methodology V2 — canonical evaluation input/output model.
 *
 * Phase 3F.1.5. Central principle, restated here because every type below
 * exists to enforce it:
 *
 *   COVERAGE CREDIT REQUIRES SEMANTIC CORRESPONDENCE.
 *   STRUCTURAL PROXIMITY IS NAVIGATION EVIDENCE, NEVER PROOF.
 *
 * A ground-truth unit never receives credit because a candidate sits in the
 * same section, is a descendant or ancestor of it, sits near a similar dollar
 * figure, sits near a higher-materiality unit, or shares a legal citation.
 * Those facts may only cause a candidate to be *evaluated* (see
 * candidate-generation.ts); they can never, by themselves, cause it to be
 * credited.
 *
 * Both sides preserve RAW SOURCE EVIDENCE (actual excerpt text), not just
 * normalized labels, so a future reviewer can audit any match without
 * re-running the pipeline.
 */
import type { EvaluationV2Versions } from "./identity";
import type { ProvisionBreadth } from "./signals";

// ---------------------------------------------------------------------------
// Materiality (shared vocabulary with the frozen ground truth files)
// ---------------------------------------------------------------------------

export type EvaluationMateriality = "CRITICAL" | "MATERIAL" | "REVIEW_UNCERTAIN" | "INFORMATIONAL";

export const HIGH_MATERIALITY: ReadonlySet<EvaluationMateriality> = new Set<EvaluationMateriality>(["CRITICAL", "MATERIAL"]);

// ---------------------------------------------------------------------------
// Ground-truth adjudication provenance
//
// The "human vs AI adjudication distinction" is a first-class field, never an
// assumption. The frozen DSGR ground truth files declare
// `authoredFromSourceOnly: true` and carry no external-lawyer review record;
// that is recorded honestly as AI_ADJUDICATED_FROM_SOURCE_ONLY rather than
// being presented as a human answer key.
// ---------------------------------------------------------------------------

export type GroundTruthAdjudicationKind =
  | "AI_ADJUDICATED_FROM_SOURCE_ONLY"
  | "AI_ADJUDICATED_REVIEWED_BY_NON_LAWYER"
  | "HUMAN_AUTHORED_NOT_EXTERNALLY_REVIEWED"
  | "EXTERNAL_HUMAN_LAWYER_REVIEWED"
  | "UNKNOWN_PROVENANCE";

export interface GroundTruthAdjudicationProvenance {
  kind: GroundTruthAdjudicationKind;
  /** Verbatim from the frozen artifact where available (e.g. `authoredFromSourceOnly`, `methodologyNotes`). */
  sourceStatement: string;
  authoredAt: string | null;
  sourceArtifactPath: string;
  /** True only when an external human lawyer is recorded as having reviewed this unit. Never inferred. */
  externallyHumanReviewed: boolean;
}

// ---------------------------------------------------------------------------
// Ground-truth semantic unit
// ---------------------------------------------------------------------------

export interface NumericFigure {
  kind: "MONEY" | "PERCENT" | "RATIO" | "COUNT" | "DURATION_DAYS";
  value: number;
  /** "USD", "CAD", ... for MONEY; null otherwise. */
  currency: string | null;
  /** For PERCENT: the metric the percentage is taken *of* (e.g. "EBITDA"). For RATIO: the ratio metric (e.g. "TOTAL_NET_LEVERAGE"). */
  basis: string | null;
  /** Verbatim substring the figure was read from — raw evidence, never a re-rendered number. */
  raw: string;
}

export interface GroundTruthSemanticUnit {
  gtUnitId: string;
  datasetKey: string;
  packageKey: string;
  documentId: string;
  /** Structural address as the ground truth itself states it. USED ONLY FOR CANDIDATE GENERATION AND EVIDENCE DISPLAY — never for credit. */
  sectionRef: string;
  articleRef: string | null;
  /** Verbatim raw source text for this unit, resolved independently of the production structural index where possible. */
  sourceExcerpt: string;
  sourceExcerptResolution: "RESOLVED_FROM_RAW_SOURCE" | "UNRESOLVED_DESCRIPTION_ONLY" | "PROVIDED_BY_GROUND_TRUTH";
  /** The adjudicated semantic description of the legal/economic claim. This is the CLAIM the evaluator tests for. */
  semanticDescription: string;
  materiality: EvaluationMateriality;
  /** Ground truth's own type vocabulary (COVENANT / BASKET / EXCEPTION / DEFINITION / ...). */
  unitType: string;
  semanticFamily: string;
  provisionRole: ProvisionRole;
  /** Universal restriction vs narrow carve-out. The dimension the historical scorers had no concept of. */
  provisionBreadth: ProvisionBreadth;
  action: ActionTag[];
  legalPosture: LegalPosture;
  objectResource: string[];
  scope: EntityScopeTag[];
  instrument: InstrumentTag[];
  figures: NumericFigure[];
  conditions: ConditionTag[];
  exceptions: ExceptionTag[];
  referencedDefinedTerms: string[];
  crossReferences: string[];
  /** Cross-section / cross-document dependencies the ground truth itself flags as material. */
  materialDependencies: string[];
  /** What operative version this claim is asserted as of (which document/amendment). */
  operativeStateAssumption: string;
  adjudication: GroundTruthAdjudicationProvenance;
  /** Free-form notes carried from the frozen artifact. */
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Candidate semantic representation
// ---------------------------------------------------------------------------

export type CandidateRepresentationType =
  | "DISCOVERY_CANDIDATE"
  | "SEMANTIC_COVERAGE_UNIT"
  | "COMPILED_IR_RULE"
  | "COMPILED_IR_DEFINITION"
  | "VERIFICATION_FINDING"
  | "AMENDMENT_EFFECT"
  | "ANALYZER_RULE"
  | "ANALYZER_DEFINED_TERM"
  | "SYNTHETIC_TEST_CANDIDATE";

/**
 * What this candidate can, at most, do for a ground-truth claim. Kept strictly
 * separate from whether it *semantically corresponds*: a candidate can be a
 * perfect semantic match and still only be INVENTORY_ONLY (the system noticed
 * the provision but produced no representation of it).
 */
export type CandidateAccountingRole =
  | "SUBSTANTIVE_REPRESENTATION"
  | "HONEST_UNSUPPORTED"
  | "HONEST_UNRESOLVED"
  | "SAFETY_FLAG"
  | "INVENTORY_ONLY";

export interface CandidateSemanticRepresentation {
  candidateId: string;
  datasetKey: string;
  packageKey: string;
  documentId: string;
  /** Structural address the candidate itself claims. NAVIGATION EVIDENCE ONLY. */
  sectionRef: string | null;
  representationType: CandidateRepresentationType;
  accountingRole: CandidateAccountingRole;
  /** Raw source excerpt(s) the candidate was derived from. Preserved verbatim. */
  excerpts: string[];
  /** The candidate's own normalized/summarised semantics as the system stated them. */
  normalizedSemantics: string;
  provisionRole: ProvisionRole;
  provisionBreadth: ProvisionBreadth;
  /** The producing system's own role/type label verbatim (e.g. discovery's `role`), kept for audit; never authoritative. */
  provisionRoleDeclared: string | null;
  legalPosture: LegalPosture;
  action: ActionTag[];
  objectResource: string[];
  scope: EntityScopeTag[];
  instrument: InstrumentTag[];
  figures: NumericFigure[];
  conditions: ConditionTag[];
  exceptions: ExceptionTag[];
  /** Expression-tree / formula semantics where the candidate carries them (compiled IR). */
  formulaSemantics: string | null;
  dependencyRefs: string[];
  crossReferences: string[];
  referencedDefinedTerms: string[];
  /** Family as THIS evaluator classifies the candidate's own text — computed independently, never copied from the producing system. */
  semanticFamily: string;
  /** The producing system's own family label verbatim, kept for audit only. */
  declaredFamily: string | null;
  /** The system's own honest self-report about this representation. */
  selfReportedState: {
    sufficiency: string | null;
    coverageState: string | null;
    reviewStatus: string | null;
    unresolvedReasons: string[];
    verifierFindings: string[];
    flaggedDangerousUnaccounted: boolean;
  };
  operativeProvenance: {
    documentId: string;
    operativeVersionRef: string | null;
    sourceCitation: string | null;
  };
  /** Where in the frozen artifacts this candidate came from — auditability. */
  provenancePath: string;
}

// ---------------------------------------------------------------------------
// Signal vocabularies (extracted deterministically — see signals.ts)
// ---------------------------------------------------------------------------

export type LegalPosture =
  | "PROHIBITION"
  | "PERMISSION"
  | "OBLIGATION"
  | "CONDITION"
  | "DEFINITION"
  | "REPRESENTATION"
  | "EVENT_OF_DEFAULT"
  | "MECHANICAL"
  | "UNDETERMINED";

/**
 * The breadth/role of the provision inside its own covenant architecture.
 * This is the dimension the historical scorers had no concept of at all, and
 * it is the general reason a chapeau can never be satisfied by a descendant
 * basket: a universal prohibition and a narrow enumerated carve-out are
 * different legal claims even when they share a section number.
 */
export type ProvisionRole =
  | "GENERAL_PROHIBITION_CHAPEAU"
  | "ENUMERATED_EXCEPTION"
  | "FLUSH_OVERRIDE"
  | "PROVISO_QUALIFIER"
  | "FINANCIAL_MAINTENANCE_TEST"
  | "AFFIRMATIVE_OBLIGATION"
  | "CONDITION_PRECEDENT"
  | "DEFINITION_OR_CALCULATION"
  | "EVENT_OF_DEFAULT_CLAUSE"
  | "REPRESENTATION_CLAUSE"
  | "AMENDMENT_MECHANIC"
  | "CROSS_REFERENCE_ONLY"
  | "MECHANICAL_BOILERPLATE"
  | "UNDETERMINED_ROLE";

export type ActionTag =
  | "INCUR_DEBT"
  | "GUARANTEE_OBLIGATION"
  | "CREATE_LIEN"
  | "MAKE_INVESTMENT"
  | "ACQUIRE_BUSINESS"
  | "DISPOSE_ASSET"
  | "SALE_LEASEBACK"
  | "RESTRICTED_PAYMENT"
  | "PREPAY_JUNIOR_DEBT"
  | "PREPAY_LOANS"
  | "MERGE_CONSOLIDATE"
  | "CHANGE_BUSINESS"
  | "TRANSACT_WITH_AFFILIATE"
  | "ENTER_RESTRICTIVE_AGREEMENT"
  | "AMEND_MATERIAL_DOCUMENT"
  | "ENTER_SWAP"
  | "DESIGNATE_UNRESTRICTED_SUBSIDIARY"
  | "MAINTAIN_FINANCIAL_RATIO"
  | "DELIVER_FINANCIAL_REPORT"
  | "GIVE_NOTICE"
  | "MAINTAIN_INSURANCE"
  | "PAY_TAXES"
  | "GRANT_COLLATERAL"
  | "BORROW_OR_COMMIT"
  | "ASSIGN_TRANSFER_RIGHTS"
  | "USE_PROCEEDS"
  | "MAINTAIN_EXISTENCE"
  | "PAY_FEES_OR_INTEREST"
  | "EXERCISE_REMEDIES"
  | "ISSUE_EQUITY"
  | "CHANGE_FISCAL_PERIOD"
  | "COMPLY_WITH_LAW";

export type EntityScopeTag =
  | "BORROWER"
  | "COMPANY_PARENT"
  | "LOAN_PARTY"
  | "RESTRICTED_SUBSIDIARY"
  | "UNRESTRICTED_SUBSIDIARY"
  | "NON_LOAN_PARTY_SUBSIDIARY"
  | "US_ENTITY_ONLY"
  | "CANADIAN_ENTITY"
  | "FOREIGN_SUBSIDIARY"
  | "ANY_SUBSIDIARY"
  | "LENDER_OR_AGENT"
  | "THIRD_PARTY";

export type InstrumentTag =
  | "SECURED"
  | "UNSECURED"
  | "FIRST_LIEN"
  | "SECOND_LIEN"
  | "SUBORDINATED"
  | "JUNIOR"
  | "SENIOR"
  | "REVOLVING"
  | "TERM_LOAN"
  | "LETTER_OF_CREDIT"
  | "SWINGLINE"
  | "CAPITAL_LEASE"
  | "EQUITY";

export type ConditionTag =
  | "NO_DEFAULT"
  | "PAYMENT_CONDITIONS"
  | "PRO_FORMA_COMPLIANCE"
  | "RATIO_SATISFIED"
  | "NOTICE_REQUIRED"
  | "CONSENT_REQUIRED"
  | "CERTIFICATE_DELIVERY"
  | "SOLVENCY"
  | "ORDINARY_COURSE_REQUIRED"
  | "FAIR_MARKET_VALUE"
  | "CASH_CONSIDERATION_MINIMUM"
  | "SUBORDINATION_REQUIRED"
  | "AVAILABILITY_TEST";

export type ExceptionTag =
  | "ORDINARY_COURSE"
  | "EXCEPT_AS_PERMITTED_ELSEWHERE"
  | "NOTWITHSTANDING_OVERRIDE"
  | "GRANDFATHERED_EXISTING"
  | "DE_MINIMIS"
  | "PERMITTED_ACQUISITION_CARVEOUT"
  | "INTERCOMPANY_CARVEOUT";

export type MetricTag =
  | "EBITDA"
  | "TOTAL_ASSETS"
  | "CONSOLIDATED_NET_INCOME"
  | "NET_TANGIBLE_ASSETS"
  | "TOTAL_REVENUE"
  | "CONSOLIDATED_TOTAL_DEBT"
  | "AVAILABLE_AMOUNT"
  | "BORROWING_BASE"
  | "AVAILABILITY"
  | "TOTAL_NET_LEVERAGE_RATIO"
  | "SECURED_NET_LEVERAGE_RATIO"
  | "FIRST_LIEN_LEVERAGE_RATIO"
  | "INTEREST_COVERAGE_RATIO"
  | "FIXED_CHARGE_COVERAGE_RATIO"
  | "SENIOR_SECURED_LEVERAGE_RATIO";

export type ComparisonDirection = "NOT_EXCEED" | "AT_LEAST" | "EXCEED" | "EQUAL" | "UNDETERMINED";

export interface SemanticSignals {
  amounts: NumericFigure[];
  percentages: NumericFigure[];
  ratios: NumericFigure[];
  /** "greater of"/"lesser of" cap structures, which change the economics even when one operand matches. */
  capStructure: "GREATER_OF" | "LESSER_OF" | "SINGLE" | "NONE";
  comparisonDirections: ComparisonDirection[];
  metrics: MetricTag[];
  definedTerms: string[];
  actions: ActionTag[];
  posture: LegalPosture;
  provisionRole: ProvisionRole;
  provisionBreadth: ProvisionBreadth;
  scope: EntityScopeTag[];
  instruments: InstrumentTag[];
  timePeriods: string[];
  conditions: ConditionTag[];
  exceptions: ExceptionTag[];
  crossReferences: string[];
  capSharing: boolean;
  builderGrower: boolean;
  reclassification: boolean;
  stepChange: "STEP_UP" | "STEP_DOWN" | null;
  paymentConditionsLanguage: boolean;
  /** Substantive content lemmas, used only as *supporting* evidence for the object/resource dimension. */
  contentTerms: string[];
}

// ---------------------------------------------------------------------------
// Correspondence dimensions
// ---------------------------------------------------------------------------

export type CorrespondenceDimension =
  | "A_SUBJECT_ACTION"
  | "B_LEGAL_POSTURE"
  | "C_OBJECT_RESOURCE"
  | "D_SCOPE_ENTITY"
  | "E_ECONOMICS"
  | "F_CONDITIONS_EXCEPTIONS"
  | "G_OPERATIVE_PROVENANCE"
  | "H_PROVISION_ROLE_BREADTH";

export const ALL_DIMENSIONS: readonly CorrespondenceDimension[] = [
  "A_SUBJECT_ACTION",
  "B_LEGAL_POSTURE",
  "C_OBJECT_RESOURCE",
  "D_SCOPE_ENTITY",
  "E_ECONOMICS",
  "F_CONDITIONS_EXCEPTIONS",
  "G_OPERATIVE_PROVENANCE",
  "H_PROVISION_ROLE_BREADTH",
];

/**
 * The three dimensions that must AFFIRMATIVELY correspond before any credit is
 * possible. Deliberately categorical (action, posture, object) — none of it can
 * be satisfied by proximity, and an INDETERMINATE reading of any of them
 * withholds credit rather than granting it.
 */
export const CORE_CREDIT_DIMENSIONS: readonly CorrespondenceDimension[] = ["A_SUBJECT_ACTION", "B_LEGAL_POSTURE", "C_OBJECT_RESOURCE"];

/**
 * Dimensions that cannot, on their own, EARN credit but can BLOCK it: a
 * material conflict on any of them defeats a match no matter how well the core
 * dimensions line up. H (breadth) is the one that makes a chapeau-versus-
 * descendant substitution structurally impossible.
 */
export const BLOCKING_DIMENSIONS: readonly CorrespondenceDimension[] = [
  "D_SCOPE_ENTITY",
  "E_ECONOMICS",
  "F_CONDITIONS_EXCEPTIONS",
  "G_OPERATIVE_PROVENANCE",
  "H_PROVISION_ROLE_BREADTH",
];

export type DimensionOutcome =
  | "CORRESPONDS"
  | "NON_MATERIAL_VARIANCE"
  | "MATERIAL_CONFLICT"
  | "MISSING_REQUIRED_DIMENSION"
  | "NOT_APPLICABLE"
  | "INDETERMINATE";

export interface DimensionAssessment {
  dimension: CorrespondenceDimension;
  outcome: DimensionOutcome;
  /** Whether the ground truth actually asserts anything on this dimension. */
  requiredByGroundTruth: boolean;
  groundTruthEvidence: string[];
  candidateEvidence: string[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// Conflicts (Layer 3)
// ---------------------------------------------------------------------------

export type ConflictCode =
  | "WRONG_ACTION"
  | "INVERTED_LEGAL_POSTURE"
  | "WRONG_OBJECT_RESOURCE"
  | "WRONG_ENTITY_SCOPE"
  | "WRONG_AMOUNT"
  | "WRONG_PERCENT_BASIS"
  | "WRONG_METRIC"
  | "WRONG_RATIO"
  | "WRONG_COMPARISON_DIRECTION"
  | "WRONG_CAP_STRUCTURE"
  | "WRONG_TIME_PERIOD"
  | "WRONG_INSTRUMENT"
  | "SCOPE_BREADTH_MISMATCH"
  | "MISSING_CONDITION"
  | "MISSING_EXCEPTION"
  | "MISSING_BASKET"
  | "MISSING_DEPENDENCY"
  | "MISSING_ECONOMICS"
  | "WRONG_OPERATIVE_VERSION"
  | "INCORRECT_SHARED_CAP_RELATIONSHIP"
  | "MISSING_REVIEW_FLAG"
  | "UNSUPPORTED_SEMANTICS_PRESENTED_AS_COMPLETE";

export type ConflictSeverity = "MATERIAL_CONFLICT" | "NON_MATERIAL_VARIANCE" | "MISSING_REQUIRED_DIMENSION";

export interface ConflictFinding {
  code: ConflictCode;
  severity: ConflictSeverity;
  dimension: CorrespondenceDimension;
  groundTruthEvidence: string;
  candidateEvidence: string;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Pair-level correspondence result
// ---------------------------------------------------------------------------

export type PairCorrespondence = "CORRESPONDS_FULLY" | "CORRESPONDS_PARTIALLY" | "CONTRADICTS" | "NO_CORRESPONDENCE" | "INDETERMINATE";

export interface SemanticJudgeOutput {
  corresponds: "YES" | "PARTIAL" | "NO" | "AMBIGUOUS";
  supportingEvidence: string[];
  conflictingEvidence: string[];
  missingDimensions: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
  /** Raw, unedited model output preserved verbatim. Null in deterministic-only mode. */
  rawModelOutput: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  cacheKey: string;
  cached: boolean;
}

export interface PairAssessment {
  gtUnitId: string;
  candidateId: string;
  /** Why this pair was generated at all. Recorded explicitly so a reader can see credit never flowed from it. */
  generationReasons: CandidateGenerationReason[];
  dimensions: DimensionAssessment[];
  conflicts: ConflictFinding[];
  correspondence: PairCorrespondence;
  /** 0..1. Never used on its own to grant credit; it only orders candidates within an already-qualified set. */
  correspondenceStrength: number;
  deterministicOnly: boolean;
  judge: SemanticJudgeOutput | null;
  reason: string;
}

export type CandidateGenerationReason =
  | "SAME_DOCUMENT"
  | "SECTION_REF_EXACT"
  | "SECTION_REF_ANCESTOR"
  | "SECTION_REF_DESCENDANT"
  | "SECTION_REF_SIBLING"
  | "SHARED_SEMANTIC_FAMILY"
  | "SHARED_ACTION_TAG"
  | "SHARED_NUMERIC_FIGURE"
  | "SHARED_DEFINED_TERM"
  | "SHARED_CONTENT_TERMS"
  | "DEPENDENCY_LINK"
  | "EXPLICIT_TEST_PAIRING";

// ---------------------------------------------------------------------------
// Unit-level result taxonomy
// ---------------------------------------------------------------------------

export type MatchStatus =
  | "EXACT_SINGLE"
  | "EXACT_COMPOSITE"
  | "PARTIAL"
  | "AMBIGUOUS"
  | "CONTRADICTORY"
  | "UNREPRESENTED"
  | "HONESTLY_UNRESOLVED"
  | "HONESTLY_UNSUPPORTED";

export type RepresentationStatus =
  | "REPRESENTED"
  | "PARTIALLY_REPRESENTED"
  | "UNREPRESENTED"
  | "HONESTLY_UNSUPPORTED"
  | "HONESTLY_UNRESOLVED"
  | "AMBIGUOUS";

export type SemanticCorrectness = "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT" | "NOT_APPLICABLE" | "NOT_VERIFIABLE";

export interface UnitEvaluationResult {
  gtUnitId: string;
  datasetKey: string;
  documentId: string;
  sectionRef: string;
  materiality: EvaluationMateriality;
  semanticFamily: string;
  unitType: string;
  provisionRole: ProvisionRole;

  matchStatus: MatchStatus;
  representationStatus: RepresentationStatus;
  semanticCorrectness: SemanticCorrectness;

  /** Candidate ids that carried the match (empty for UNREPRESENTED). */
  matchedCandidateIds: string[];
  /** Candidate ids evaluated but rejected, with the reason preserved in `pairAssessments`. */
  rejectedCandidateIds: string[];
  /** Present when the resolution is AMBIGUOUS: the competing, non-reconcilable candidate clusters. */
  ambiguousClusters: string[][];

  pairAssessments: PairAssessment[];

  /** Materially-conflicting findings aggregated across the winning candidate set. */
  conflicts: ConflictFinding[];

  /** True when the system explicitly surfaced this claim as unsafe/unresolved/needing review — via a candidate that actually corresponds to it. */
  explicitlySurfacedAsUnsafe: boolean;
  surfacedAsUnsafeBy: string[];
  /** Corresponding candidates proving only that the system NOTICED the provision (inventory), which is never credit. */
  surfacedByInventoryOnly: string[];

  dangerousUnaccountedV2: boolean;
  dangerousUnaccountedReason: string | null;

  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasonForCredit: string | null;
  reasonForPartialCredit: string | null;
  reasonForNoCredit: string | null;

  groundTruthQuality: GroundTruthQualityVerdict;

  versions: EvaluationV2Versions;
}

// ---------------------------------------------------------------------------
// Ground-truth quality audit
// ---------------------------------------------------------------------------

export type GroundTruthQualityVerdict =
  | "GT_CONFIRMED"
  | "GT_AMBIGUOUS"
  | "GT_INCOMPLETE"
  | "GT_CONFLICT_WITH_SOURCE"
  | "GT_REQUIRES_DOMAIN_REVIEW";

export interface GroundTruthQualityFinding {
  gtUnitId: string;
  verdict: GroundTruthQualityVerdict;
  evidence: string;
  /** Set only when a unit is excluded from clean aggregates; must always carry a written reason. */
  excludedFromCleanAggregates: boolean;
  exclusionReason: string | null;
}

/**
 * An adjudication OVERLAY. The frozen ground-truth files are NEVER edited;
 * a defect is recorded here and applied at load time, with the original
 * always preserved on the unit.
 */
export interface GroundTruthOverlayEntry {
  gtUnitId: string;
  verdict: GroundTruthQualityVerdict;
  rationale: string;
  excludeFromCleanAggregates: boolean;
  authoredBy: string;
  authoredAt: string;
}

// ---------------------------------------------------------------------------
// Evidence packet (evidence.ts)
// ---------------------------------------------------------------------------

export interface EvidencePacketCandidateView {
  candidateId: string;
  representationType: CandidateRepresentationType;
  accountingRole: CandidateAccountingRole;
  sectionRef: string | null;
  excerpts: string[];
  normalizedSemantics: string;
  selfReportedState: CandidateSemanticRepresentation["selfReportedState"];
  provenancePath: string;
}

export interface EvidencePacket {
  packetId: string;
  gtUnitId: string;
  datasetKey: string;
  documentId: string;
  sectionRef: string;
  materiality: EvaluationMateriality;
  groundTruthExcerpt: string;
  groundTruthExcerptResolution: GroundTruthSemanticUnit["sourceExcerptResolution"];
  groundTruthSemanticDescription: string;
  groundTruthAdjudication: GroundTruthAdjudicationProvenance;
  candidates: EvidencePacketCandidateView[];
  deterministicSignalComparison: {
    candidateId: string;
    dimensions: DimensionAssessment[];
    conflicts: ConflictFinding[];
    numericComparison: NumericComparisonRecord[];
  }[];
  semanticJudgeOutputs: SemanticJudgeOutput[];
  versions: EvaluationV2Versions;
}

export interface NumericComparisonRecord {
  dimension: "AMOUNT" | "PERCENT" | "RATIO" | "TIME_PERIOD" | "CAP_STRUCTURE";
  groundTruthFigure: NumericFigure | null;
  candidateFigure: NumericFigure | null;
  matched: boolean;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Aggregate metrics (aggregate.ts)
// ---------------------------------------------------------------------------

export interface AggregateMetrics {
  datasetKey: string;
  versions: EvaluationV2Versions;
  totalGroundTruthUnits: number;
  excludedByOverlay: number;
  cleanDenominator: number;

  criticalSemanticRecall: RatioWithUnits;
  materialSemanticRecall: RatioWithUnits;
  combinedCriticalMaterialRecall: RatioWithUnits;
  exactSemanticCorrectnessRate: RatioWithUnits;
  partialRepresentationRate: RatioWithUnits;
  honestUnresolvedOrUnsupportedRate: RatioWithUnits;
  ambiguousMatchRate: RatioWithUnits;
  falseCreditRate: RatioWithUnits;
  /** Of all candidate pairs the semantic layers actually evaluated, the share that established correspondence. Measures how wasteful candidate generation was. */
  candidateGenerationPrecision: RatioWithUnits;
  /** Of all candidates offered to the evaluator, the share that ended up carrying a credited match. */
  creditedCandidateShare: RatioWithUnits;
  /**
   * Claims the system at least NOTICED (a semantically-corresponding inventory
   * finding exists) even though it produced no representation. Reported so the
   * gap between "found it" and "represented it" is visible rather than hidden
   * inside a single recall number.
   */
  inventoryOnlySurfacedRate: RatioWithUnits;
  /** Claims for which NO candidate established semantic correspondence at all — neither a representation, nor a flag, nor an inventory finding. */
  noCorrespondingCandidateRate: RatioWithUnits;

  dangerousUnaccountedCount: number;
  dangerousUnaccountedUnitIds: string[];

  byMatchStatus: Record<string, number>;
  byRepresentationStatus: Record<string, number>;
  bySemanticCorrectness: Record<string, number>;
}

/** Every published percentage links back to the exact unit ids behind it. */
export interface RatioWithUnits {
  numerator: number;
  denominator: number;
  rate: number;
  numeratorUnitIds: string[];
  denominatorUnitIds: string[];
}

// ---------------------------------------------------------------------------
// Run-level result
// ---------------------------------------------------------------------------

export interface EvaluationRunResult {
  runIdentity: string;
  datasetKey: string;
  versions: EvaluationV2Versions;
  units: UnitEvaluationResult[];
  metrics: AggregateMetrics;
  groundTruthQuality: GroundTruthQualityFinding[];
  performance: {
    groundTruthUnitCount: number;
    candidateCount: number;
    generatedPairCount: number;
    evaluatedPairCount: number;
    aiCallCount: number;
    aiCacheHitCount: number;
    estimatedCostUsd: number;
    runtimeMs: number;
  };
}
