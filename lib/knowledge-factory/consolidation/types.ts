/**
 * Canonical knowledge consolidation — shared types.
 *
 * Labels stay honest:
 *   FIXTURE_AUTHENTIC_SEC ≠ live SEC re-fetch
 *   RESEARCH_ACQUISITION ≠ CERTIFIED
 *   METADATA_ONLY ≠ DURABLE_BYTES
 */

export const CONSOLIDATION_PLAN_SCHEMA = "knowledge-factory.consolidation-plan.v1" as const;
export const CONSOLIDATION_INVENTORY_SCHEMA = "knowledge-factory.asset-inventory.v1" as const;

export type AssetAvailability =
  | "READY"
  | "METADATA_ONLY"
  | "FIXTURE_ONLY"
  | "ADAPTER_NEEDED"
  | "RESEARCH_ONLY"
  | "UNAVAILABLE";

export type ByteSourceLabel =
  | "FIXTURE_AUTHENTIC_SEC"
  | "RESEARCH_ACQUISITION"
  | "MANIFEST_RECOVERABLE"
  | "BYTES_ABSENT";

export type ImportAction =
  | "INSERT_BYTES_AND_REGISTRY"
  | "INSERT_REGISTRY_METADATA_ONLY"
  | "REUSE_IDENTICAL"
  | "ALIAS_IDENTICAL_BYTES"
  | "CONFLICT_SOURCE_ID"
  | "SKIP_MISSING_BYTES"
  | "SKIP_INCOMPLETE_METADATA"
  | "SKIP_RESEARCH_ONLY";

export interface AssetFamilyInventory {
  family: string;
  authoritativePaths: string[];
  format: string;
  sourceIdentity: string;
  provenance: string;
  verificationStatus: string;
  approximateVolume: string;
  originalBytesPresent: boolean;
  availability: AssetAvailability;
  notes: string;
}

export interface OriginalByteCandidate {
  family: string;
  localPath: string;
  sourceId: string;
  aliasSourceIds: string[];
  originalBytesHash: string;
  byteSize: number;
  contentType: string;
  label: ByteSourceLabel;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  filingDate: string;
  formType: string;
  documentTitle: string;
  documentClass: string;
  provenance: string;
  usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL" | "UNREVIEWED";
  representationLevel: "SOURCE_ONLY" | "STRUCTURALLY_INDEXED" | "DISCOVERED_CANDIDATE";
}

export interface DryRunItemPlan {
  sourceId: string;
  action: ImportAction;
  originalBytesHash?: string;
  byteSize?: number;
  localPath?: string;
  existingSourceId?: string;
  existingHash?: string;
  reason: string;
}

export interface DryRunPlanSummary {
  schemaVersion: typeof CONSOLIDATION_PLAN_SCHEMA;
  generatedAt: string;
  neon: {
    database: string;
    hostFingerprint: string;
    migrationsApplied: number;
    documentByteObjectsTablePresent: boolean;
    existingCounts: Record<string, number>;
  };
  availableOriginalByteFiles: number;
  availableOriginalBytesTotal: number;
  proposed: {
    insertBytesAndRegistry: number;
    insertRegistryMetadataOnly: number;
    reuseIdentical: number;
    aliasIdenticalBytes: number;
    conflictSourceId: number;
    skipMissingBytes: number;
    skipIncompleteMetadata: number;
    skipResearchOnly: number;
  };
  estimatedStorageBytes: number;
  /** Footprint of all scanned original-byte candidates (post-migration authorization view). */
  estimatedStorageBytesIfMigrationApplied: number;
  proposedIfMigrationApplied: {
    insertBytesAndRegistry: number;
    note: string;
  };
  items: DryRunItemPlan[];
  blockers: string[];
  liveWriteAuthorized: false;
  approvalCheckpoint: string;
}
