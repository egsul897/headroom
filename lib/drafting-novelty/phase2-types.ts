/**
 * Phase 2 validated-novelty types.
 * Discovery / research prioritization only — not production legal authority.
 */
import type {
  DraftingCategory,
  LexicalNeighbor,
  NoveltyFinding,
  ReviewerQueueItem,
  SignatureToken,
  SourceSpan,
  SuspectedFailureMode,
} from "./types";

export const DRAFTING_NOVELTY_PHASE2_VERSION = "rare-covenant-drafting-discovery.phase2.v1";

export type IndependentReviewLabel =
  | "GENUINELY_UNFAMILIAR_SHAPE"
  | "FAMILIAR_SHAPE_DIFFERENT_WORDING"
  | "DUPLICATE_OR_EXTRACTION_ARTIFACT"
  | "POTENTIALLY_MATERIAL_LEGAL_VARIATION"
  | "UNRESOLVED_MISSING_CONTEXT";

export type ContextCompleteness = "COMPLETE" | "PARTIAL" | "CONTEXT_INCOMPLETE";

export interface ControllingContext {
  findingId: string;
  completeness: ContextCompleteness;
  documentHash: string;
  windowHash: string;
  controllingSpan: SourceSpan;
  parentProhibition?: SourceSpan;
  chapeau?: SourceSpan;
  provisos: SourceSpan[];
  definedTerms: Array<{ term: string; span: SourceSpan }>;
  crossReferences: string[];
  amendmentHints: string[];
  relatedDocumentHints: string[];
  missingPieces: string[];
  notes: string[];
}

export interface BalancedSplitMetrics {
  splitId: string;
  seed: number;
  sampleSizePerRole: number;
  corpusUnits: number;
  probeUnits: number;
  corpusIssuers: number;
  probeIssuers: number;
  probeOnlySignatureRate: number;
  sharedSignatureRate: number;
  meanTopNoveltyScore: number;
  medianTopNoveltyScore: number;
  highRiskFindingCount: number;
}

export interface LeaveOneOutResult {
  heldOutId: string;
  heldOutKind: "ISSUER" | "INSTRUMENT";
  probeUnits: number;
  findings: number;
  meanNoveltyScore: number;
  probeOnlySignatureRate: number;
  topCategories: Array<{ category: DraftingCategory; count: number }>;
}

export interface BalancedNoveltyReport {
  version: string;
  generatedAt: string;
  disclaimer: string;
  equalSizedSplits: BalancedSplitMetrics[];
  equalSizedStability: {
    splitCount: number;
    probeOnlyRateMean: number;
    probeOnlyRateStd: number;
    meanTopScoreMean: number;
    meanTopScoreStd: number;
    sampleSizeSensitivity: Array<{ sampleSize: number; probeOnlyRateMean: number; meanTopScoreMean: number }>;
  };
  leaveOneIssuerOut: LeaveOneOutResult[];
  leaveOneInstrumentOut: LeaveOneOutResult[];
}

export interface IndependentReviewItem {
  queueRank: number;
  findingId: string;
  category: DraftingCategory;
  heuristicFailureMode: SuspectedFailureMode;
  independentLabel: IndependentReviewLabel;
  confirmedLegalDefect: boolean | null;
  defectUncertainty: string;
  contextCompleteness: ContextCompleteness;
  rationale: string;
  sourceSpan: SourceSpan;
  signatureKey: string;
}

export interface IndependentReviewReport {
  version: string;
  generatedAt: string;
  sampleSize: number;
  queueSize: number;
  stratification: string;
  countsByLabel: Record<IndependentReviewLabel, number>;
  confirmedLegalDefectCount: number;
  heuristicOnlyFailureModeCount: number;
  items: IndependentReviewItem[];
}

/** Canonical KF integration export — mirrors KnowledgeSourceRecord fields + novelty payload. */
export interface KnowledgeFactoryNoveltyImportRecord {
  /** Stable id for this novelty export row. */
  exportId: string;
  schema: "knowledge-factory.novelty-import.v1";
  /** Aligns with KF KnowledgeSourceRecord.sourceId when acquired via SEC; else fixture id. */
  sourceId: string;
  sourceIdentity: {
    issuerCik?: string;
    issuerTicker?: string;
    issuerName?: string;
    accessionNumber?: string;
    exhibitFilename?: string;
    sourceUrl?: string;
    filingDate?: string;
    formType?: string;
    documentTitle: string;
    packageId: string;
    path: string;
    originalBytesHash?: string;
    normalizedTextHash: string;
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL";
  };
  noveltySignature: {
    category: DraftingCategory;
    signatureKey: string;
    tokens: SignatureToken[];
    noveltyScore: number;
  };
  controllingSourceContext: ControllingContext;
  dependencyReferences: {
    definedTerms: string[];
    crossReferences: string[];
    amendmentHints: string[];
    relatedDocumentHints: string[];
  };
  riskHypothesis: {
    heuristicFailureMode: SuspectedFailureMode;
    rationale: string;
    highRiskFamily: string;
    uncertainty: string[];
  };
  reviewerStatus: {
    queueRank?: number;
    independentLabel?: IndependentReviewLabel;
    confirmedLegalDefect: boolean | null;
    disposition: "PENDING_REVIEW" | "CONTEXT_INCOMPLETE" | "ARTIFACT" | "PRIORITIZED";
  };
  precedentNeighbors: LexicalNeighbor[];
  unresolvedIssues: string[];
  representationLevel: "DISCOVERED_CANDIDATE" | "REVIEW_REQUIRED";
  paidCalls: 0;
  productionLegalRulesModified: false;
}

export interface HighRiskDraftingExample {
  exampleId: string;
  family:
    | "AUTOMATIC_RECLASSIFICATION"
    | "SHARED_BASKET_CAPACITY"
    | "ENTITY_SPECIFIC_SUBLIMIT"
    | "HANGING_PROVISO"
    | "CROSS_DOCUMENT_RESTRICTION"
    | "AMENDMENT_CONSENT"
    | "INTERCREDITOR_PAYMENT"
    | "COMPARATOR_THRESHOLD"
    | "FINANCIAL_DEFINITION_CHANGE"
    | "NONOBVIOUS_EXCEPTION_NESTING";
  findingId: string;
  sourceSpan: SourceSpan;
  controllingContextCompleteness: ContextCompleteness;
  counterexampleSpans: SourceSpan[];
  riskHypothesis: string;
  uncertainty: string[];
  independentLabel?: IndependentReviewLabel;
}

export interface AcquiredAgreementManifest {
  sourceId: string;
  issuerCik: string;
  issuerTicker: string;
  issuerName: string;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  filingDate: string;
  formType: string;
  documentTitle: string;
  originalBytesHash: string;
  normalizedTextHash: string;
  byteSize: number;
  textPath: string;
  acquisitionTimestamp: string;
  via: "EdgarConnector";
}

export interface Phase2RunResult {
  version: string;
  startingSha: string;
  generatedAt: string;
  paidCalls: 0;
  productionLegalRulesModified: false;
  acquiredAgreements: AcquiredAgreementManifest[];
  acquiredIssuerCount: number;
  balancedNovelty: BalancedNoveltyReport;
  independentReview: IndependentReviewReport;
  contextIncompleteFindingIds: string[];
  extractionArtifacts: string[];
  highRiskExamples: HighRiskDraftingExample[];
  knowledgeFactoryImportCount: number;
  reviewerQueue: ReviewerQueueItem[];
  findings: NoveltyFinding[];
}
