/**
 * Rare-covenant drafting novelty types.
 *
 * Discovery-only: does not feed production legal rules, certification pins,
 * or solver IR. Structural signatures describe drafting shape; lexical
 * similarity is a retrieval aid and never proof of semantic equivalence.
 */

export const DRAFTING_NOVELTY_VERSION = "rare-covenant-drafting-discovery.v1";

export type DraftingCategory =
  | "COVENANT_STRUCTURE"
  | "DEFINITION_FORMULATION"
  | "BASKET_FORMULA"
  | "PROVISO_PLACEMENT"
  | "ENTITY_SCOPE"
  | "AMENDMENT_MECHANISM"
  | "SHARED_CAPACITY"
  | "RECLASSIFICATION"
  | "CROSS_DOCUMENT_RESTRICTION"
  | "INTERCREDITOR_LIMITATION";

export type SuspectedFailureMode =
  | "FALSE_PERMISSION"
  | "MISSING_RESTRICTION"
  | "CAPACITY_OVERSTATEMENT"
  | "CAPACITY_UNDERSTATEMENT"
  | "SCOPE_MISBIND"
  | "AMENDMENT_BYPASS"
  | "CROSS_INSTRUMENT_SILENCE"
  | "PRIORITY_MISORDER";

export type DocumentRole = "CORPUS" | "PROBE";

export interface DocumentSource {
  documentId: string;
  packageId: string;
  role: DocumentRole;
  path: string;
  label: string;
  publicSourceNote: string;
}

export interface SourceSpan {
  documentId: string;
  path: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
}

export type SignatureToken =
  | "PROVISO_AFTER_PERMISSION"
  | "PROVISO_AFTER_PROHIBITION"
  | "NOTWITHSTANDING_OVERRIDE"
  | "GREATER_OF_FLAT_OR_EBITDA"
  | "LESSER_OF_FLAT_OR_EBITDA"
  | "RATIO_GATE"
  | "BUILDER_BASKET"
  | "SHARED_AGGREGATE"
  | "IN_THE_AGGREGATE_WITH"
  | "TOGETHER_WITH_SECTIONS"
  | "RECLASSIFY_SOLE_DISCRETION"
  | "RECLASSIFY_AUTOMATIC"
  | "FIXED_VS_INCURRENCE"
  | "ENTITY_RESTRICTED_SUB"
  | "ENTITY_UNRESTRICTED_SUB"
  | "ENTITY_LOAN_PARTY"
  | "ENTITY_NON_LOAN_PARTY"
  | "ENTITY_FOREIGN_SUB"
  | "ENTITY_GUARANTOR_ONLY"
  | "DEFINITION_MEANS"
  | "DEFINITION_INCLUDES"
  | "DEFINITION_FOR_PURPOSES"
  | "AMENDMENT_REQUIRED_LENDERS"
  | "AMENDMENT_SACRED_RIGHT"
  | "AMENDMENT_YANK_A_BANK"
  | "AMENDMENT_AFFECTED_LENDER"
  | "CROSS_DOC_SUBJECT_TO"
  | "CROSS_DOC_CAP_REFERENCE"
  | "CROSS_DOC_REFINANCING_LINEAGE"
  | "INTERCREDITOR_STANDSTILL"
  | "INTERCREDITOR_TURNOVER"
  | "INTERCREDITOR_PRIORITY_COLLATERAL"
  | "INTERCREDITOR_JOINDER"
  | "INTERCREDITOR_DIP"
  | "EXCEPTION_LIST_ITEM"
  | "GENERAL_PROHIBITION"
  | "DESIGNATION_RULE"
  | "STEP_UP_WITH_LIMITS";

export interface StructuralSignature {
  category: DraftingCategory;
  tokens: SignatureToken[];
  /** Compact deterministic key: category|sorted-tokens */
  key: string;
}

export interface DraftingUnit {
  unitId: string;
  documentId: string;
  packageId: string;
  role: DocumentRole;
  category: DraftingCategory;
  span: SourceSpan;
  normalizedText: string;
  signature: StructuralSignature;
  /** Lexical shingles for similarity only — never treat as semantic identity. */
  shingles: string[];
}

export interface LexicalNeighbor {
  unitId: string;
  documentId: string;
  packageId: string;
  role: DocumentRole;
  jaccard: number;
  signatureKey: string;
  excerpt: string;
  /** Explicit disclaimer attached wherever neighbors are shown. */
  equivalenceClaim: "NONE_LEXICAL_ONLY";
}

export interface NoveltyFinding {
  findingId: string;
  unitId: string;
  category: DraftingCategory;
  noveltyScore: number;
  rarityRank: number;
  corpusSupport: number;
  probeSupport: number;
  clusterSize: number;
  signatureKey: string;
  signatureTokens: SignatureToken[];
  suspectedFailureMode: SuspectedFailureMode;
  failureRationale: string;
  span: SourceSpan;
  comparisonExamples: LexicalNeighbor[];
  nearestCorpusSignatureDistance: number;
  notes: string[];
}

export interface ReviewerQueueItem {
  queueRank: number;
  findingId: string;
  category: DraftingCategory;
  noveltyScore: number;
  suspectedFailureMode: SuspectedFailureMode;
  sourceSpan: SourceSpan;
  signatureKey: string;
  comparisonExamples: LexicalNeighbor[];
  reviewerPrompt: string;
}

export interface AcquisitionRecommendation {
  recommendationId: string;
  priority: number;
  category: DraftingCategory;
  rationale: string;
  targetDraftingShape: string;
  suggestedPublicSearchHints: string[];
  diversifiesAwayFrom: string[];
  relatedFindingIds: string[];
}

export interface ClusterSummary {
  signatureKey: string;
  category: DraftingCategory;
  size: number;
  corpusCount: number;
  probeCount: number;
  packages: string[];
  representativeUnitId: string;
}

export interface CorpusCoverageReport {
  corpusDocuments: number;
  probeDocuments: number;
  corpusUnits: number;
  probeUnits: number;
  unitsByCategory: Record<DraftingCategory, { corpus: number; probe: number }>;
  signatureKeysTotal: number;
  signatureKeysCorpusOnly: number;
  signatureKeysProbeOnly: number;
  signatureKeysShared: number;
  packages: Array<{ packageId: string; role: DocumentRole; documents: number; units: number }>;
}

export interface NoveltyRunResult {
  version: string;
  generatedAt: string;
  paidCalls: 0;
  productionLegalRulesModified: false;
  corpusCoverage: CorpusCoverageReport;
  clusters: ClusterSummary[];
  findings: NoveltyFinding[];
  reviewerQueue: ReviewerQueueItem[];
  acquisitionRecommendations: AcquisitionRecommendation[];
}
