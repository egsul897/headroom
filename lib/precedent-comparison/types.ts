/**
 * Precedent Comparison Intelligence — types (Phase 2).
 *
 * Sidecar analysis over public credit-agreement / indenture source text.
 * Does NOT modify the production legal engine, IR compiler, or Prisma schema.
 *
 * Epistemic discipline (mission invariant): similar drafting does not establish
 * identical legal effect. Every comparison claim carries an explicit standing
 * AND explicit evidence. maxStandingAmongClaims is a rollup only — it never
 * implies that every claim carries that standing.
 *
 * REVIEWER_VERIFIED_CONCLUSION requires a ClaimReviewRecord tied to the
 * specific claimId + sourceVersionHash — never mere document/provision approval.
 */
import type { CovenantFamily } from "@prisma/client";
import type { SemanticSignals } from "../contract-model/evaluation-v2/types";

export const PRECEDENT_COMPARISON_SCHEMA_VERSION = "precedent-comparison.v2";

/** Epistemic standing of a comparison claim. Ordered from weakest to strongest. */
export type ComparisonStanding =
  | "TEXTUAL_SIMILARITY"
  | "STRUCTURAL_SIMILARITY"
  | "SEMANTIC_HYPOTHESIS"
  | "SOURCE_SUPPORTED_LEGAL_DIFFERENCE"
  | "REVIEWER_VERIFIED_CONCLUSION";

/**
 * Whether a provision record has been human-reviewed as a corpus entry.
 * SOURCE_ONLY is the default. Provision-level APPROVED_PRECEDENT alone never
 * elevates individual claims — that requires ClaimReviewRecord.
 */
export type ProvisionReviewStatus = "SOURCE_ONLY" | "HYPOTHESIS" | "APPROVED_PRECEDENT";

export type DocumentRole = "ORIGINAL" | "AMENDMENT" | "RESTATEMENT" | "DEFINITION";

export type AgreementType =
  | "CREDIT_AGREEMENT"
  | "INDENTURE"
  | "ABL"
  | "AMENDMENT"
  | "GUARANTEE_SECURITY"
  | "DEFINITIONS_EXCERPT"
  | "OTHER";

/** Covenant families this system is required to compare. */
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

export interface PrecedentProvision {
  provisionId: string;
  covenantFamily: ComparableCovenantFamily | CovenantFamily;
  sourceText: string;
  /** sha256 of sourceText — binds claim reviews to a specific source version. */
  sourceVersionHash: string;
  locator: SourceLocator;
  documentRole: DocumentRole;
  agreementType: AgreementType;
  /** Distinct issuer key (ticker / package issuer), never inferred legal identity. */
  issuerId: string;
  amendsProvisionId: string | null;
  tags: string[];
  reviewStatus: ProvisionReviewStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  /** Optional financial-definition term names when this is a definition excerpt. */
  financialDefinitionTerms: string[];
}

export interface DraftingFeatureProfile {
  provisionId: string;
  features: DraftingFeature[];
  signals: SemanticSignals;
  featureEvidence: Partial<Record<DraftingFeature, string>>;
}

export type DiffAlgorithm = "token-lcs.v1" | "token-lcs-bounded.v1" | "myers-line.v1";

export interface ExactTextDiffHunk {
  kind: "EQUAL" | "INSERT" | "DELETE";
  text: string;
}

export interface ExactTextDiff {
  leftProvisionId: string;
  rightProvisionId: string;
  algorithm: DiffAlgorithm;
  leftNormalized: string;
  rightNormalized: string;
  hunks: ExactTextDiffHunk[];
  tokenJaccard: number;
  identical: boolean;
  /** Tokens actually compared (may be bounded). */
  comparedTokenCount: { left: number; right: number };
  bounded: boolean;
}

export type ClaimDimension =
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
  | "COUNTEREXAMPLE"
  | "DEPENDENCY";

/** Explicit evidence payload required for elevated standings. */
export interface ClaimEvidence {
  /** Verbatim source excerpts with provision ids. */
  sourceExcerpts: Array<{ provisionId: string; excerpt: string; sourceVersionHash: string }>;
  /** Optional feature / dependency keys cited. */
  structuralKeys: string[];
  /** Why this standing is justified — never empty for elevated standings. */
  justification: string;
}

export interface ComparisonClaim {
  claimId: string;
  standing: ComparisonStanding;
  dimension: ClaimDimension;
  summary: string;
  evidence: ClaimEvidence;
  /** @deprecated use evidence.sourceExcerpts — retained for Phase-1 readers. */
  sourceEvidence: Array<{ provisionId: string; excerpt: string }>;
  featuresOnlyIn: { left: DraftingFeature[]; right: DraftingFeature[] } | null;
  /**
   * When standing is REVIEWER_VERIFIED_CONCLUSION, the review record id.
   * Absent otherwise — never inferred from provision-level approval alone.
   */
  claimReviewId: string | null;
}

/**
 * Claim-level reviewer approval. Bound to claimId + both source version hashes.
 * Document-level or provision-level approval is insufficient.
 */
export interface ClaimReviewRecord {
  claimReviewId: string;
  claimId: string;
  comparisonId: string;
  leftProvisionId: string;
  rightProvisionId: string;
  leftSourceVersionHash: string;
  rightSourceVersionHash: string;
  reviewedBy: string;
  reviewedAt: string;
  disposition: "AFFIRM" | "REJECT" | "NARROW";
  note: string;
  /** The standing the reviewer affirms (must be a legal-difference or conclusion). */
  affirmedStanding: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" | "REVIEWER_VERIFIED_CONCLUSION";
}

export interface PrecedentComparisonRecord {
  comparisonId: string;
  schemaVersion: typeof PRECEDENT_COMPARISON_SCHEMA_VERSION;
  leftProvisionId: string;
  rightProvisionId: string;
  leftSourceVersionHash: string;
  rightSourceVersionHash: string;
  covenantFamily: CovenantFamily | ComparableCovenantFamily;
  textual: ExactTextDiff;
  leftFeatures: DraftingFeatureProfile;
  rightFeatures: DraftingFeatureProfile;
  structuralOverlap: DraftingFeature[];
  structuralDivergence: { leftOnly: DraftingFeature[]; rightOnly: DraftingFeature[] };
  claims: ComparisonClaim[];
  /**
   * Highest standing among claims. DOES NOT imply every claim has this standing.
   * Consumers must inspect claims[].standing individually.
   */
  maxStandingAmongClaims: ComparisonStanding;
  /** @deprecated alias of maxStandingAmongClaims — retained for Phase-1 callers. */
  maxStanding: ComparisonStanding;
  standingRollupNote: string;
  claimReviews: ClaimReviewRecord[];
  disclaimer: string;
  createdAt: string;
}

export interface PatternFrequency {
  feature: DraftingFeature;
  covenantFamily: CovenantFamily | ComparableCovenantFamily | "*";
  count: number;
  totalInFamily: number;
  /** Frequency within THIS corpus only. */
  corpusRate: number;
  /** @deprecated use corpusRate */
  rate: number;
  rarityInCorpus: "COMMON_IN_CORPUS" | "UNCOMMON_IN_CORPUS" | "RARE_IN_CORPUS" | "UNIQUE_IN_CORPUS";
  /** @deprecated use rarityInCorpus */
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "UNIQUE";
  exampleProvisionIds: string[];
  /** Market prevalence is never asserted from a small research corpus. */
  marketPrevalence: "NOT_ESTIMATED";
  sampleSize: number;
  distinctIssuersInSlice: number;
  samplingBiasNotes: string[];
}

export type DependencyLinkKind =
  | "CROSS_REFERENCE"
  | "DEFINED_TERM"
  | "AMENDS"
  | "SHARED_FEATURE"
  | "ATLAS_EDGE"
  | "ENCYCLOPEDIA_TERM"
  | "UNRESOLVED_CONTEXT";

export interface DependencyLink {
  kind: DependencyLinkKind;
  fromProvisionId: string;
  toProvisionId: string | null;
  label: string;
  evidence: string;
  resolution: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS" | "REGEX_HEURISTIC";
  source: "LOCAL_HEURISTIC" | "DEPENDENCY_ATLAS" | "DEFINITION_ENCYCLOPEDIA";
}

export interface DependencyAwareComparisonView {
  comparisonId: string;
  leftLinks: DependencyLink[];
  rightLinks: DependencyLink[];
  sharedDependencies: DependencyLink[];
  asymmetricDependencies: { leftOnly: DependencyLink[]; rightOnly: DependencyLink[] };
  missingOrAmbiguousContext: Array<{ provisionId: string; reason: string }>;
  closureComplete: boolean;
  note: string;
}

export interface RetrievalQuery {
  covenantFamily?: CovenantFamily | ComparableCovenantFamily;
  requiredFeatures?: DraftingFeature[];
  anyFeatures?: DraftingFeature[];
  packageIds?: string[];
  issuerIds?: string[];
  excludeProvisionIds?: string[];
  documentRole?: DocumentRole;
  agreementType?: AgreementType;
  amendmentStatus?: "ORIGINAL_ONLY" | "AMENDMENT_ONLY" | "ANY";
  /** Match financial-definition term names (definitions family). */
  financialDefinitionTerms?: string[];
  textContains?: string;
  reviewStatus?: ProvisionReviewStatus;
  limit?: number;
}

export interface RetrievalHit {
  provision: PrecedentProvision;
  features: DraftingFeatureProfile;
  score: number;
  matchedFeatures: DraftingFeature[];
  /** Ceiling from provision provenance only — not claim standing. */
  provenanceStatus: ProvisionReviewStatus;
  standingCeiling: ComparisonStanding;
}

export interface CounterexampleQuery {
  claimedNecessaryFeatures?: DraftingFeature[];
  claimedAbsentFeatures?: DraftingFeature[];
  covenantFamily?: CovenantFamily | ComparableCovenantFamily;
  proposedInterpretation?: string;
  limit?: number;
}

export interface CounterexampleHit {
  provision: PrecedentProvision;
  features: DraftingFeatureProfile;
  whyCounterexample: string;
  standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" | "STRUCTURAL_SIMILARITY";
}

export interface CorpusStatistics {
  provisionCount: number;
  distinctAgreements: number;
  distinctIssuers: number;
  distinctPackages: number;
  byAgreementType: Record<string, number>;
  byDocumentRole: Record<string, number>;
  byFamily: Record<string, number>;
  targetAgreements: number;
  targetIssuers: number;
  targetProvisions: number;
  targetsMet: { agreements: boolean; issuers: boolean; provisions: boolean };
  samplingBiasNotes: string[];
  marketPrevalenceClaim: "FORBIDDEN_WITHOUT_REPRESENTATIVE_SAMPLE";
}

export const STANDING_ROLLUP_NOTE =
  "maxStandingAmongClaims is the highest standing present on any single claim. " +
  "It does not imply that every claim in the record carries that standing. " +
  "Inspect claims[].standing and claims[].evidence individually.";

export const COMPARISON_DISCLAIMER =
  "Similar drafting does not establish identical legal effect. " +
  "Textual and structural similarity are not legal conclusions. " +
  "Semantic hypotheses are unverified. " +
  "Only claim-level reviewer-verified conclusions (ClaimReviewRecord bound to claimId + sourceVersionHash) may be treated as reviewed precedent. " +
  "Corpus frequency is not market prevalence.";
