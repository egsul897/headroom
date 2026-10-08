/**
 * EDGAR historical backfill — discovery types.
 *
 * Discovery is metadata-first. Exhibit bodies are NOT downloaded here; this
 * workstream produces ranked acquisition-queue items for the Covenant
 * Knowledge Factory acquisition agent (WS-CKF).
 *
 * Does not create a second source registry — issuer identity reuses SEC CIK
 * and, when present, existing CompanySourceConnection EDGAR config.
 */

export const HISTORICAL_BACKFILL_CONTRACT_VERSION = 1 as const;

export type DebtDocumentKind =
  | "CREDIT_AGREEMENT"
  | "INDENTURE"
  | "AMENDMENT"
  | "RESTATEMENT"
  | "SUPPLEMENTAL_INDENTURE"
  | "WAIVER"
  | "CONSENT"
  | "INTERCREDITOR"
  | "GUARANTEE"
  | "SECURITY_AGREEMENT"
  | "OTHER_DEBT_AGREEMENT"
  | "UNKNOWN";

export type DiscoveryStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "DISCOVERED"
  | "QUEUED_FOR_ACQUISITION"
  | "SKIPPED_DUPLICATE"
  | "SKIPPED_LOW_RELEVANCE"
  | "FAILED"
  | "IBR_UNRESOLVED";

export interface IssuerRef {
  cik: string; // 10-digit zero-padded
  ticker?: string;
  title?: string;
}

export interface FilingRef {
  cik: string;
  accessionNumber: string; // dashed form
  form: string;
  filingDate: string; // YYYY-MM-DD
  primaryDocument?: string;
  primaryDocDescription?: string;
  items?: string;
  size?: number;
}

export interface ExhibitRef {
  cik: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  /** Absolute SEC URL when the exhibit is filed inline (not IBR). */
  sourceUri?: string;
  documentKind: DebtDocumentKind;
  relevanceScore: number;
  isIncorporatedByReference: boolean;
  ibr?: IncorporatedByReference;
  agreementIdentityKey: string;
  discoveryStatus: DiscoveryStatus;
}

export interface IncorporatedByReference {
  rawText: string;
  /** Resolved original accession when parseable. */
  resolvedAccessionNumber?: string;
  resolvedExhibitType?: string;
  resolvedFilename?: string;
  resolvedSourceUri?: string;
  resolutionStatus: "RESOLVED" | "PARTIAL" | "UNRESOLVED";
}

export interface IssuerManifest {
  issuer: IssuerRef;
  discoveredAt: string;
  filingsScanned: number;
  filingsWithDebtSignals: number;
  exhibitsDiscovered: number;
  distinctAgreementKeys: number;
  filings: FilingManifestEntry[];
  exhibits: ExhibitRef[];
}

export interface FilingManifestEntry extends FilingRef {
  debtSignalScore: number;
  indexFetched: boolean;
  exhibitCount: number;
  relevantExhibitCount: number;
}

export interface DuplicateGroup {
  agreementIdentityKey: string;
  reason: "SAME_ACCESSION_FILENAME" | "SAME_IBR_TARGET" | "SAME_NORM_DESCRIPTION";
  members: Array<{ accessionNumber: string; filename: string; filingDate: string; documentKind: DebtDocumentKind }>;
  /** Kept for acquisition (newest / richest). */
  keepId: string;
  discardedIds: string[];
}

export interface CoverageCell {
  year: number;
  documentKind: DebtDocumentKind | "ALL_RELEVANT" | "FILING_SCANNED";
  count: number;
}

export interface CoverageReport {
  generatedAt: string;
  issuerCount: number;
  filingsScanned: number;
  exhibitsDiscovered: number;
  distinctAgreements: number;
  byYear: CoverageCell[];
  byDocumentKind: Array<{ documentKind: DebtDocumentKind; count: number }>;
  gaps: CoverageGap[];
}

export interface CoverageGap {
  cik: string;
  ticker?: string;
  gapType: "NO_DEBT_EXHIBITS" | "NO_INDEX_FETCH" | "IBR_UNRESOLVED" | "YEAR_WITHOUT_CREDIT_OR_INDENTURE";
  detail: string;
  year?: number;
}

export interface AcquisitionQueueItem {
  queueId: string;
  priority: number;
  cik: string;
  ticker?: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: DebtDocumentKind;
  sourceUri: string;
  agreementIdentityKey: string;
  relevanceScore: number;
  draftingDiversityBonus: number;
  reason: string;
  status: "QUEUED" | "CLAIMED" | "DONE" | "FAILED";
  enqueuedAt: string;
}

export interface CheckpointState {
  version: typeof HISTORICAL_BACKFILL_CONTRACT_VERSION;
  runId: string;
  scale: "pilot-100" | "scale-1000" | "broad" | "custom";
  createdAt: string;
  updatedAt: string;
  issuerCursor: number;
  issuers: IssuerRef[];
  completedCiks: string[];
  failedCiks: Array<{ cik: string; error: string; attempts: number }>;
  stats: {
    filingsScanned: number;
    indexesFetched: number;
    exhibitsDiscovered: number;
    queuedForAcquisition: number;
    duplicatesCollapsed: number;
    ibrResolved: number;
    ibrUnresolved: number;
    secRequests: number;
  };
}

export interface DiscoveryRunResult {
  runId: string;
  checkpointPath: string;
  manifestsDir: string;
  coverage: CoverageReport;
  duplicateReport: DuplicateGroup[];
  acquisitionQueue: AcquisitionQueueItem[];
  checkpoint: CheckpointState;
}
