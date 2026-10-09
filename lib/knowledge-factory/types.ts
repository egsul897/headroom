/**
 * Covenant Knowledge Factory — shared types.
 *
 * Representation levels are explicit and never silently promote a discovery
 * label into operative legal authority. DETERMINISTICALLY_VALIDATED ≠ CERTIFIED.
 */

export const KNOWLEDGE_FACTORY_VERSION = "knowledge-factory.v1";

export type KnowledgeRepresentationLevel =
  | "SOURCE_ONLY"
  | "STRUCTURALLY_INDEXED"
  | "DISCOVERED_CANDIDATE"
  | "SEMANTIC_HYPOTHESIS"
  | "DETERMINISTICALLY_VALIDATED"
  | "REVIEW_REQUIRED"
  | "REVIEWER_VERIFIED"
  | "CERTIFIED";

export type DebtDocumentClass =
  | "CREDIT_AGREEMENT"
  | "REVOLVING_CREDIT_AGREEMENT"
  | "TERM_LOAN_AGREEMENT"
  | "ABL_AGREEMENT"
  | "INDENTURE"
  | "SUPPLEMENTAL_INDENTURE"
  | "AMENDMENT"
  | "RESTATEMENT"
  | "WAIVER"
  | "CONSENT"
  | "SIDE_LETTER"
  | "INTERCREDITOR_AGREEMENT"
  | "SECURITY_AGREEMENT"
  | "GUARANTEE_AGREEMENT"
  | "OTHER_DEBT_RELATED"
  | "UNKNOWN";

export type RelationshipKind =
  | "AGREEMENT_AMENDMENT"
  | "AGREEMENT_RESTATEMENT"
  | "INDENTURE_SUPPLEMENTAL"
  | "AGREEMENT_WAIVER"
  | "AGREEMENT_CONSENT"
  | "AGREEMENT_SIDE_LETTER"
  | "AGREEMENT_INTERCREDITOR"
  | "PROVISION_DEFINITION"
  | "PROVISION_CROSS_REFERENCE"
  | "PROVISION_EXCEPTION"
  | "PROVISION_CONDITION"
  | "PROVISION_SHARED_CAPACITY";

export type RelationshipEvidenceStatus = "DISCOVERED" | "INFERRED" | "AUTHENTICATED" | "REVIEWED";

export type ExtractionStatus =
  | "PENDING"
  | "ACQUIRED"
  | "TEXT_EXTRACTED"
  | "STRUCTURALLY_INDEXED"
  | "CLASSIFIED"
  | "CANDIDATES_DISCOVERED"
  | "FAILED"
  | "UNSUPPORTED_FORMAT";

export type UsageRightsReviewStatus = "UNREVIEWED" | "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL" | "RESTRICTED" | "CLEARED";

export type KnowledgeTaxonomyFamily =
  | "INDEBTEDNESS"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "ASSET_SALES"
  | "AFFILIATE_TRANSACTIONS"
  | "FUNDAMENTAL_CHANGES"
  | "JUNIOR_DEBT_PREPAYMENTS"
  | "FINANCIAL_MAINTENANCE_COVENANTS"
  | "GUARANTEES"
  | "RESTRICTED_SUBSIDIARIES"
  | "UNRESTRICTED_SUBSIDIARIES"
  | "DESIGNATIONS"
  | "EVENTS_OF_DEFAULT"
  | "MANDATORY_PREPAYMENTS"
  | "INCREMENTAL_DEBT_AND_FACILITIES"
  | "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS"
  | "RATIO_BASED_PERMISSIONS"
  | "SHARED_CAPACITY_PROVISIONS"
  | "GENERAL_CONDITIONS_AND_EXCEPTIONS"
  | "UNKNOWN";

export interface IssuerIdentity {
  cik: string;
  ticker?: string;
  name?: string;
}

export interface FilingMetadata {
  accessionNumber: string;
  formType: string;
  filingDate: string;
  primaryDocument?: string;
  issuer: IssuerIdentity;
}

export interface ExhibitMetadata {
  filename: string;
  description: string;
  exhibitType: string;
  sourceUrl: string;
  sequence?: string;
  sizeBytes?: number;
}

export interface DiscoveredFilingDocument {
  sourceId: string;
  filing: FilingMetadata;
  exhibit: ExhibitMetadata;
  discoverySignals: string[];
}

export interface ClassificationResult {
  documentClass: DebtDocumentClass;
  confidence: number;
  signals: string[];
  rationale: string;
}

export interface DiscoveryRankResult {
  score: number;
  signals: string[];
  families: KnowledgeTaxonomyFamily[];
}

export interface KnowledgeSourceRecord {
  sourceId: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  filingDate: string;
  formType: string;
  documentTitle: string;
  documentClass: DebtDocumentClass;
  instrumentIdentity?: string;
  originalBytesHash: string;
  normalizedTextHash?: string;
  acquisitionTimestamp: string;
  parserVersion: string;
  extractionStatus: ExtractionStatus;
  representationLevel: KnowledgeRepresentationLevel;
  provenance: string;
  usageRightsReviewStatus: UsageRightsReviewStatus;
  discoveryScore?: number;
  byteSize?: number;
  storagePath?: string;
  companyId?: string;
  documentId?: string;
  sourceArtifactId?: string;
}

export interface KnowledgeRelationshipRecord {
  id: string;
  sourceId: string;
  targetId: string;
  kind: RelationshipKind;
  evidenceStatus: RelationshipEvidenceStatus;
  rationale: string;
  confidence: number;
}

export interface StructuralNodeRecord {
  nodeId: string;
  sourceId: string;
  nodeType: string;
  sectionRef: string;
  heading: string;
  charStart: number;
  charEnd: number;
  parentNodeId?: string;
  ambiguous?: boolean;
}

export interface CovenantCandidateRecord {
  candidateId: string;
  sourceId: string;
  nodeId?: string;
  families: KnowledgeTaxonomyFamily[];
  signals: string[];
  excerpt: string;
  representationLevel: KnowledgeRepresentationLevel;
  discoveryScore: number;
}

export interface DefinitionRecord {
  term: string;
  sourceId: string;
  nodeId?: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
}

export interface CrossReferenceRecord {
  sourceId: string;
  fromNodeId?: string;
  rawReference: string;
  charStart: number;
  charEnd: number;
}

export interface PatternLibraryEntry {
  patternId: string;
  name: string;
  structuralCharacteristics: string[];
  supportedSemanticHypotheses: string[];
  counterexamples: string[];
  knownFailureModes: string[];
  verificationStatus: "UNVERIFIED" | "STRUCTURALLY_OBSERVED" | "REVIEW_REQUIRED" | "REVIEWER_VERIFIED";
  sourceExampleIds: string[];
}

export interface CostLedgerEntry {
  id: string;
  timestamp: string;
  category:
    | "SEC_REQUEST"
    | "DOWNLOAD_BYTES"
    | "STORAGE_BYTES"
    | "PARSING_MS"
    | "DATABASE_WRITES"
    | "ESTIMATED_MODEL_TOKENS"
    | "ESTIMATED_MODEL_COST_USD"
    | "ACTUAL_PROVIDER_COST_USD"
    | "REVIEWER_TIME_MS";
  amount: number;
  unit: string;
  estimated: boolean;
  note?: string;
}

export interface CorpusManifestStats {
  issuersDiscovered: number;
  relevantFilings: number;
  documentsDownloaded: number;
  distinctAgreements: number;
  amendments: number;
  indentures: number;
  extractableDocuments: number;
  structuralNodes: number;
  covenantCandidates: number;
  definitions: number;
  crossReferences: number;
  unsupportedFormats: number;
  duplicateRate: number;
  errors: number;
  measuredProcessingMs: number;
  actualPaidSpendUsd: number;
}
