/**
 * Compatibility mapper: WS-CCA handoff records → fields CKF consumers expect.
 *
 * Does not invent a second corpus registry. Maps content-addressed identity
 * into the dataset-delivery / knowledge-source shape CKF already uses.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */
import type { HandoffDocumentRecord } from "./handoff-contract";
import {
  assertCannotPromoteIncompleteStructure,
  assertComputeOutputRemainsSourceOnly,
  structureSuccessIsNotLegalVerification,
} from "../promotion-guards";

/** Minimal CKF-aligned source identity (no Prisma / registry write). */
export interface CkfCompatibleSourceView {
  sourceId: string;
  contentHash: string;
  normalizedTextHash: string;
  structuralOutputHash: string;
  sourceUri: string;
  cik: string;
  accessionNumber: string;
  filename: string;
  documentKind: string;
  filingDate: string;
  verificationStatus: "SOURCE_ONLY";
  representationLevel: "DISCOVERED_CANDIDATE";
  extractionStatus: string;
  legalPromotionBlocked: boolean;
  processingVersion: string;
  contractVersion: string;
  producer: "WS-CCA";
  consumers: Array<"WS-CKF" | "WS-EHB">;
  note: string;
}

export function toCkfCompatibleSourceView(record: HandoffDocumentRecord): CkfCompatibleSourceView {
  assertComputeOutputRemainsSourceOnly("SOURCE_ONLY");
  const legal = structureSuccessIsNotLegalVerification({
    nodeCount: record.metrics.nodeCount,
    extractionStatus: record.extractionStatus,
  });
  // Always SOURCE_ONLY; incomplete statuses are explicitly non-promotable.
  const legalPromotionBlocked = true;

  return {
    sourceId: `cca:${record.sourceIdentity.sourceDocumentId}`,
    contentHash: record.sourceHash,
    normalizedTextHash: record.normalizedTextHash,
    structuralOutputHash: record.structuralOutputHash,
    sourceUri: record.sourceIdentity.sourceUri,
    cik: record.sourceIdentity.cik,
    accessionNumber: record.sourceIdentity.accessionNumber,
    filename: record.sourceIdentity.filename,
    documentKind: record.sourceIdentity.documentKind,
    filingDate: record.sourceIdentity.filingDate,
    verificationStatus: "SOURCE_ONLY",
    representationLevel: "DISCOVERED_CANDIDATE",
    extractionStatus: record.extractionStatus,
    legalPromotionBlocked,
    processingVersion: record.processingVersion,
    contractVersion: record.contractVersion,
    producer: "WS-CCA",
    consumers: ["WS-CKF", "WS-EHB"],
    note: legal.note,
  };
}

/** Throws if a consumer attempts to promote a CCA handoff record into legal/capacity state. */
export function refuseIllegalPromotion(record: HandoffDocumentRecord, proposedLegalStatus: string): void {
  assertCannotPromoteIncompleteStructure({
    extractionStatus: record.extractionStatus,
    verificationStatus: "SOURCE_ONLY",
    proposedLegalStatus,
  });
}

export function summarizeHandoffForCkf(records: HandoffDocumentRecord[]): {
  documentCount: number;
  distinctSourceHashes: number;
  promotableToLegal: 0;
  structureEmpty: number;
  missingDefinitions: number;
  okSourceOnly: number;
  contractVersion: string | null;
} {
  return {
    documentCount: records.length,
    distinctSourceHashes: new Set(records.map((r) => r.sourceHash)).size,
    promotableToLegal: 0,
    structureEmpty: records.filter((r) => r.extractionStatus === "STRUCTURE_EMPTY").length,
    missingDefinitions: records.filter((r) => r.extractionStatus === "MISSING_DEFINITIONS").length,
    okSourceOnly: records.filter((r) => r.extractionStatus === "OK").length,
    contractVersion: records[0]?.contractVersion ?? null,
  };
}
