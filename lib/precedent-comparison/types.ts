/**
 * Precedent Comparison Intelligence — types.
 *
 * Sidecar analysis over public credit-agreement / indenture source text.
 * Does NOT modify the production legal engine, IR compiler, or Prisma schema.
 *
 * Epistemic discipline (mission invariant): similar drafting does not establish
 * identical legal effect. Every comparison claim carries an explicit standing:
 *
 *   TEXTUAL_SIMILARITY              — character/token overlap in source text
 *   STRUCTURAL_SIMILARITY           — shared drafting-feature fingerprint
 *   SEMANTIC_HYPOTHESIS            — model/heuristic reading, NOT reviewed
 *   SOURCE_SUPPORTED_LEGAL_DIFFERENCE — difference grounded in cited source text
 *   REVIEWER_VERIFIED_CONCLUSION   — only when a human review record exists
 *
 * Model-generated summaries are NEVER labeled REVIEWER_VERIFIED_CONCLUSION.
 */
import type { CovenantFamily } from "@prisma/client";
import type { SemanticSignals } from "../contract-model/evaluation-v2/types";

export const PRECEDENT_COMPARISON_SCHEMA_VERSION = "precedent-comparison.v1";

/** Epistemic standing of a comparison claim. Ordered from weakest to strongest. */
export type ComparisonStanding =
  | "TEXTUAL_SIMILARITY"
  | "STRUCTURAL_SIMILARITY"
  | "SEMANTIC_HYPOTHESIS"
  | "SOURCE_SUPPORTED_LEGAL_DIFFERENCE"
  | "REVIEWER_VERIFIED_CONCLUSION";

/**
 * Whether a provision record has been human-reviewed as precedent.
 * SOURCE_ONLY is the default for corpus excerpts; APPROVED_PRECEDENT is the
 * only status that may elevate a claim to REVIEWER_VERIFIED_CONCLUSION.
 */
export type ProvisionReviewStatus = "SOURCE_ONLY" | "HYPOTHESIS" | "APPROVED_PRECEDENT";

export type DocumentRole = "ORIGINAL" | "AMENDMENT" | "RESTATEMENT" | "DEFINITION";

/** Covenant families this system is required to compare (mission §3–4). */
export const COMPARABLE_COVENANT_FAMILIES = [
  "INDEBTEDNESS",
  "LIENS",
  "INVESTMENTS",
  "RESTRICTED_PAYMENTS",
  "ASSET_SALES",
  "AFFILIATE_TRANSACTIONS",
  "MANDATORY_PREPAYMENTS",
  "FINANCIAL_COVENANTS",
  "DEFINITIONS_CALCULATION_RULES",
] as const satisfies readonly CovenantFamily[];

export type ComparableCovenantFamily = (typeof COMPARABLE_COVENANT_FAMILIES)[number];

/**
 * Drafting features used for retrieval and pattern analysis.
 * Derived from existing evaluation-v2 SemanticSignals (knowledge interface),
 * plus a small set of comparison-specific flags detected from source text.
 */
export type DraftingFeature =
  | "GREATER_OF_BASKET"
  | "LESSER_OF_BASKET"
  | "RATIO_GATE"
  | "FLAT_DOLLAR_CAP"
  | "PERCENT_OF_METRIC"
  | "UNLIMITED_WHEN_RATIO_MET"
  | "SHARED_CAPACITY"
  | "RECLASSIFICATION_RIGHT"
  | "BUILDER_GROWER"
  | "PROVISO"
  | "NOTWITHSTANDING"
  | "EXCEPT_AS_PERMITTED"
  | "NO_DEFAULT_CONDITION"
  | "PRO_FORMA_COMPLIANCE"
  | "BORROWER_SCOPE"
  | "GUARANTOR_SCOPE"
  | "RESTRICTED_SUBSIDIARY_SCOPE"
  | "NON_GUARANTOR_SCOPE"
  | "EBITDA_METRIC"
  | "LEVERAGE_RATIO_METRIC"
  | "STEP_UP"
  | "STEP_DOWN"
  | "INTERCOMPANY_CARVEOUT"
  | "ORDINARY_COURSE_CARVEOUT"
  | "JUNIOR_DEBT_PREPAYMENT";

export interface SourceLocator {
  packageId: string;
  documentId: string;
  sourcePath: string;
  sourceSectionRef: string;
  charStart: number;
  charEnd: number;
}

/**
 * One source-backed provision available for comparison.
 * `sourceText` is the governing excerpt; summaries never replace it.
 */
export interface PrecedentProvision {
  provisionId: string;
  covenantFamily: ComparableCovenantFamily | CovenantFamily;
  sourceText: string;
  locator: SourceLocator;
  documentRole: DocumentRole;
  /** When this provision amends another, the target provisionId. */
  amendsProvisionId: string | null;
  tags: string[];
  reviewStatus: ProvisionReviewStatus;
  /** Optional attributable reviewer id — required for APPROVED_PRECEDENT elevation. */
  reviewedBy: string | null;
  reviewNote: string | null;
}

export interface DraftingFeatureProfile {
  provisionId: string;
  features: DraftingFeature[];
  /** Existing Headroom knowledge interface output — reused, not reimplemented. */
  signals: SemanticSignals;
  featureEvidence: Partial<Record<DraftingFeature, string>>;
}

export interface ExactTextDiffHunk {
  kind: "EQUAL" | "INSERT" | "DELETE";
  text: string;
}

export interface ExactTextDiff {
  leftProvisionId: string;
  rightProvisionId: string;
  algorithm: "token-lcs.v1";
  leftNormalized: string;
  rightNormalized: string;
  hunks: ExactTextDiffHunk[];
  /** Character-level Jaccard over whitespace-normalized tokens. */
  tokenJaccard: number;
  identical: boolean;
}

export interface ComparisonClaim {
  claimId: string;
  standing: ComparisonStanding;
  dimension:
    | "TEXT"
    | "STRUCTURE"
    | "CONDITIONS"
    | "EXCEPTIONS"
    | "PROVISOS"
    | "SCOPE"
    | "SHARED_CAPACITY"
    | "RECLASSIFICATION"
    | "ECONOMICS"
    | "DEFINITIONS"
    | "AMENDMENT"
    | "COUNTEREXAMPLE";
  summary: string;
  /** Verbatim snippets from source that support the claim (required for SOURCE_SUPPORTED_*). */
  sourceEvidence: Array<{ provisionId: string; excerpt: string }>;
  /** Features present on one side but not the other. */
  featuresOnlyIn: { left: DraftingFeature[]; right: DraftingFeature[] } | null;
}

/**
 * Source-backed comparison record — the durable unit of this system.
 * Never silently upgrades standing; REVIEWER_VERIFIED requires reviewStatus.
 */
export interface PrecedentComparisonRecord {
  comparisonId: string;
  schemaVersion: typeof PRECEDENT_COMPARISON_SCHEMA_VERSION;
  leftProvisionId: string;
  rightProvisionId: string;
  covenantFamily: CovenantFamily | ComparableCovenantFamily;
  textual: ExactTextDiff;
  leftFeatures: DraftingFeatureProfile;
  rightFeatures: DraftingFeatureProfile;
  structuralOverlap: DraftingFeature[];
  structuralDivergence: { leftOnly: DraftingFeature[]; rightOnly: DraftingFeature[] };
  claims: ComparisonClaim[];
  /**
   * Highest standing present among claims. Never REVIEWER_VERIFIED unless at
   * least one side carries APPROVED_PRECEDENT reviewStatus.
   */
  maxStanding: ComparisonStanding;
  disclaimer: string;
  createdAt: string;
}

export interface PatternFrequency {
  feature: DraftingFeature;
  covenantFamily: CovenantFamily | ComparableCovenantFamily | "*";
  count: number;
  totalInFamily: number;
  rate: number;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "UNIQUE";
  exampleProvisionIds: string[];
}

export interface DependencyLink {
  kind: "CROSS_REFERENCE" | "DEFINED_TERM" | "AMENDS" | "SHARED_FEATURE";
  fromProvisionId: string;
  toProvisionId: string | null;
  label: string;
  evidence: string;
}

export interface DependencyAwareComparisonView {
  comparisonId: string;
  leftLinks: DependencyLink[];
  rightLinks: DependencyLink[];
  sharedDependencies: DependencyLink[];
  asymmetricDependencies: { leftOnly: DependencyLink[]; rightOnly: DependencyLink[] };
  note: string;
}

export interface RetrievalQuery {
  covenantFamily?: CovenantFamily | ComparableCovenantFamily;
  requiredFeatures?: DraftingFeature[];
  anyFeatures?: DraftingFeature[];
  packageIds?: string[];
  excludeProvisionIds?: string[];
  documentRole?: DocumentRole;
  /** Free-text search over sourceText / section / tags. */
  textContains?: string;
  limit?: number;
}

export interface RetrievalHit {
  provision: PrecedentProvision;
  features: DraftingFeatureProfile;
  score: number;
  matchedFeatures: DraftingFeature[];
  standingCeiling: ComparisonStanding;
}

export interface CounterexampleQuery {
  /** Features the proposed interpretation claims are necessary / always present. */
  claimedNecessaryFeatures?: DraftingFeature[];
  /** Features the proposed interpretation claims are absent / never present. */
  claimedAbsentFeatures?: DraftingFeature[];
  covenantFamily?: CovenantFamily | ComparableCovenantFamily;
  /** Optional free-text interpretation under challenge — used only for search, never as authority. */
  proposedInterpretation?: string;
  limit?: number;
}

export interface CounterexampleHit {
  provision: PrecedentProvision;
  features: DraftingFeatureProfile;
  whyCounterexample: string;
  standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" | "STRUCTURAL_SIMILARITY";
}

export const COMPARISON_DISCLAIMER =
  "Similar drafting does not establish identical legal effect. " +
  "Textual and structural similarity are not legal conclusions. " +
  "Semantic hypotheses are unverified. " +
  "Only reviewer-verified conclusions may be treated as reviewed precedent.";
