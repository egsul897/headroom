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
  /**
   * D12: structural-index health ERROR count computed by
   * extractStructure for this document, persisted at process time
   * so run outputs and the corpus manifest can surface it without
   * recomputation. Absent on records processed before the field
   * existed (aggregates treat absent as 0).
   */
  structuralHealthErrors?: number;
  /**
   * P1 (PR #428): count of redline-ambiguous spans in this document
   * (unmatched struck-through elements — see RedlineAmbiguityRecord),
   * persisted at process time like structuralHealthErrors. Absent on
   * records processed before the field existed (treated as 0).
   */
  redlineAmbiguousSpanCount?: number;
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
  // P0 correction: null is a valid value (the parser emits null
  // for roots; StructuralNode.parentNodeId is string | null).
  // The old string-only type could not represent a root and
  // forced null-carrying records into a lie. Both null and
  // undefined mean "no parent" (unresolved).
  parentNodeId?: string | null;
  ambiguous?: boolean;
  /**
   * Phase B structural-integrity violations (see
   * structural-integrity.ts). Present when the node's parentage,
   * span, ref, or ordering failed validation — the relationship
   * is unresolved, not repaired. Downstream consumers must
   * treat such a node as structurally unresolved.
   */
  structuralViolations?: string[];
}

/**
 * P1 (PR #428): a span of the document's normalized text whose
 * operative status is ambiguous because it follows an unmatched
 * struck-through (redline deletion) element — the element's close
 * tag never appears, so the span may be text the parties deleted.
 * The text is preserved in the document as evidence; this record
 * propagates the uncertainty so provisions intersecting the span
 * are flagged and no authoritative conclusion (compiled formula,
 * capacity) rests on them. charStart/charEnd are offsets into the
 * pipeline's normalized text; -1 when the span text could not be
 * located verbatim (consumers then match by text containment).
 */
export interface RedlineAmbiguityRecord {
  sourceId: string;
  charStart: number;
  charEnd: number;
  /** Tag name of the unmatched element ("strike" | "s" | "del" | styled element's tag). */
  tagName: string;
  reason: "UNMATCHED_REDLINE_ELEMENT";
  /** The ambiguous span's text, preserved as evidence. */
  text: string;
}

export interface CovenantCandidateRecord {
  candidateId: string;
  sourceId: string;
  nodeId?: string;
  families: KnowledgeTaxonomyFamily[];
  signals: string[];
  excerpt: string;
  /** Rule 192: the operative span exceeded the 4000-char excerpt
   * cap, so this excerpt is a PREFIX of the section — clauses
   * beyond the cap are not in this summary. The compiler must
   * not mint a formula from a truncated excerpt (it would
   * attribute an early clause's amount to the whole section). */
  excerptTruncated?: boolean;
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
  /** Normalized legal target ref when Phase 2 structural detection ran. */
  targetSectionRef?: string | null;
  /** Unique target nodeId when resolution is UNIQUE; null if unresolved/ambiguous. */
  targetNodeId?: string | null;
  resolved?: boolean;
  targetAmbiguous?: boolean;
  unresolvedReason?: string | null;
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
  /** Extraction-level cross-reference resolution (Stage 0 instrumentation):
   * resolved = unique same-document target identified; ambiguous = more
   * than one physical occurrence matched (never guessed); notFound = no
   * matching node (incl. schedule/exhibit refs, unresolved by design).
   * The three counts always sum to crossReferences. These are structural
   * facts only — they assert nothing about legal applicability or
   * executable authority. */
  resolvedCrossReferences: number;
  ambiguousCrossReferences: number;
  notFoundCrossReferences: number;
  unsupportedFormats: number;
  duplicateRate: number;
  errors: number;
  /** D12: total structural-index health ERRORs across sources. */
  structuralHealthErrors: number;
  /** D12: stored structural nodes carrying ≥1 integrity violation. */
  structuralViolationNodes: number;
  measuredProcessingMs: number;
  actualPaidSpendUsd: number;
}
