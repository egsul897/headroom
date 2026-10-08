/**
 * Validate acquisition-queue items against the WS-EHB → WS-CKF handoff contract.
 */

import type { AcquisitionQueueItem, QueueItemValidation } from "./types";

const ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;
const CIK_RE = /^\d{10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateQueueItem(item: AcquisitionQueueItem): QueueItemValidation {
  const checks: Record<string, boolean> = {
    hasQueueId: Boolean(item.queueId),
    hasCik: CIK_RE.test(item.cik ?? ""),
    hasIssuerHint: Boolean(item.ticker || item.cik),
    hasAccession: ACCESSION_RE.test(item.accessionNumber ?? ""),
    hasFilingDate: DATE_RE.test(item.filingDate ?? ""),
    hasExhibitIdentity: Boolean(item.exhibitType && item.filename),
    hasSourceUriOrPartialIbr:
      Boolean(item.sourceUri) ||
      (item.resolutionStatus === "IBR_PARTIAL" && Boolean(item.ibrAccessionNumber)),
    hasAgreementType: Boolean(item.documentKind && item.documentKind !== "UNKNOWN"),
    hasDedupeIdentity: Boolean(item.dedupeIdentity || item.agreementIdentityKey),
    hasPriority: typeof item.priority === "number" && Number.isFinite(item.priority),
    hasResolutionStatus: Boolean(item.resolutionStatus),
    parentCandidatesArray: Array.isArray(item.parentRelationshipCandidates),
    statusQueued: item.status === "QUEUED" || item.status === "CLAIMED" || item.status === "DONE" || item.status === "FAILED",
  };

  const errors: string[] = [];
  for (const [k, ok] of Object.entries(checks)) {
    if (!ok) errors.push(k);
  }

  // Fetchable items must have a non-index SEC URL.
  if (
    (item.resolutionStatus === "FETCHABLE_INLINE" || item.resolutionStatus === "IBR_RESOLVED") &&
    (!item.sourceUri || /index\.htm/i.test(item.sourceUri))
  ) {
    checks.fetchableUri = false;
    errors.push("fetchableUri");
  } else {
    checks.fetchableUri = true;
  }

  return { ok: errors.length === 0, checks, errors };
}

export interface QueueValidationReport {
  generatedAt: string;
  total: number;
  okCount: number;
  errorCount: number;
  byResolutionStatus: Record<string, number>;
  byDocumentKind: Record<string, number>;
  fetchableCount: number;
  partialIbrCount: number;
  fieldErrorCounts: Record<string, number>;
  sampleErrors: Array<{ queueId: string; errors: string[]; description: string }>;
}

export function validateAcquisitionQueue(items: AcquisitionQueueItem[]): QueueValidationReport {
  const fieldErrorCounts: Record<string, number> = {};
  const byResolutionStatus: Record<string, number> = {};
  const byDocumentKind: Record<string, number> = {};
  const sampleErrors: QueueValidationReport["sampleErrors"] = [];
  let okCount = 0;
  let fetchableCount = 0;
  let partialIbrCount = 0;

  for (const item of items) {
    const v = item.validation ?? validateQueueItem(item);
    item.validation = v;
    if (v.ok) okCount++;
    else {
      for (const e of v.errors) fieldErrorCounts[e] = (fieldErrorCounts[e] ?? 0) + 1;
      if (sampleErrors.length < 20) {
        sampleErrors.push({ queueId: item.queueId, errors: v.errors, description: item.description.slice(0, 80) });
      }
    }
    byResolutionStatus[item.resolutionStatus] = (byResolutionStatus[item.resolutionStatus] ?? 0) + 1;
    byDocumentKind[item.documentKind] = (byDocumentKind[item.documentKind] ?? 0) + 1;
    if (item.resolutionStatus === "FETCHABLE_INLINE" || item.resolutionStatus === "IBR_RESOLVED") fetchableCount++;
    if (item.resolutionStatus === "IBR_PARTIAL") partialIbrCount++;
  }

  return {
    generatedAt: new Date().toISOString(),
    total: items.length,
    okCount,
    errorCount: items.length - okCount,
    byResolutionStatus,
    byDocumentKind,
    fetchableCount,
    partialIbrCount,
    fieldErrorCounts,
    sampleErrors,
  };
}
