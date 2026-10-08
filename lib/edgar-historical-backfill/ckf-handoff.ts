/**
 * Map WS-EHB acquisition queue → WS-CKF consumable discovery records.
 *
 * Does NOT create a second source registry. CKF remains the canonical
 * acquisition/downloader owner (lib/knowledge-factory). This export is the
 * handoff surface only.
 *
 * Shape mirrors CKF `DiscoveredFilingDocument` (lib/knowledge-factory/types.ts)
 * without importing CKF modules (peer exclusive tree).
 */

import type { AcquisitionQueueItem } from "./types";

export const CKF_HANDOFF_CONTRACT_VERSION = 1 as const;

/** CKF DebtDocumentClass-compatible labels (subset mapping). */
export type CkfDocumentClass =
  | "CREDIT_AGREEMENT"
  | "INDENTURE"
  | "SUPPLEMENTAL_INDENTURE"
  | "AMENDMENT"
  | "RESTATEMENT"
  | "WAIVER"
  | "CONSENT"
  | "INTERCREDITOR_AGREEMENT"
  | "SECURITY_AGREEMENT"
  | "GUARANTEE_AGREEMENT"
  | "OTHER_DEBT_RELATED"
  | "UNKNOWN";

export interface CkfDiscoveredFilingDocument {
  sourceId: string;
  filing: {
    accessionNumber: string;
    formType: string;
    filingDate: string;
    issuer: { cik: string; ticker?: string };
  };
  exhibit: {
    filename: string;
    description: string;
    exhibitType: string;
    sourceUrl: string;
  };
  discoverySignals: string[];
  documentClass: CkfDocumentClass;
  ehbQueueId: string;
  ehbPriority: number;
  ehbResolutionStatus: string;
  ehbDedupeIdentity: string;
  parentRelationshipCandidates: AcquisitionQueueItem["parentRelationshipCandidates"];
  /** Explicit: IBR citation is not operative amendment authority. */
  ibrAuthorityNote: "DISCOVERY_HINT_ONLY";
}

export interface CkfHandoffPackage {
  contractVersion: typeof CKF_HANDOFF_CONTRACT_VERSION;
  generatedAt: string;
  producer: "WS-EHB";
  consumer: "WS-CKF";
  storageStatus: "EPHEMERAL_WORKSPACE" | "COMMITTED_DOCS_SUMMARY" | "EXTERNAL_DURABLE";
  storageNote: string;
  fetchableCount: number;
  deferredPartialIbrCount: number;
  documents: CkfDiscoveredFilingDocument[];
}

function mapKind(kind: AcquisitionQueueItem["documentKind"]): CkfDocumentClass {
  switch (kind) {
    case "CREDIT_AGREEMENT":
      return "CREDIT_AGREEMENT";
    case "INDENTURE":
      return "INDENTURE";
    case "SUPPLEMENTAL_INDENTURE":
      return "SUPPLEMENTAL_INDENTURE";
    case "AMENDMENT":
      return "AMENDMENT";
    case "RESTATEMENT":
      return "RESTATEMENT";
    case "WAIVER":
      return "WAIVER";
    case "CONSENT":
      return "CONSENT";
    case "INTERCREDITOR":
      return "INTERCREDITOR_AGREEMENT";
    case "SECURITY_AGREEMENT":
      return "SECURITY_AGREEMENT";
    case "GUARANTEE":
      return "GUARANTEE_AGREEMENT";
    case "OTHER_DEBT_AGREEMENT":
      return "OTHER_DEBT_RELATED";
    default:
      return "UNKNOWN";
  }
}

export function toCkfHandoffPackage(
  items: AcquisitionQueueItem[],
  opts?: { storageStatus?: CkfHandoffPackage["storageStatus"]; storageNote?: string },
): CkfHandoffPackage {
  const fetchable = items.filter(
    (i) =>
      (i.resolutionStatus === "FETCHABLE_INLINE" || i.resolutionStatus === "IBR_RESOLVED") &&
      i.sourceUri &&
      !/index\.htm/i.test(i.sourceUri),
  );
  const deferred = items.filter((i) => i.resolutionStatus === "IBR_PARTIAL");

  const documents: CkfDiscoveredFilingDocument[] = fetchable.map((i) => ({
    sourceId: `ehb:${i.queueId}`,
    filing: {
      accessionNumber: i.accessionNumber,
      formType: i.form,
      filingDate: i.filingDate,
      issuer: { cik: i.cik, ticker: i.ticker },
    },
    exhibit: {
      filename: i.filename,
      description: i.description,
      exhibitType: i.exhibitType,
      sourceUrl: i.sourceUri,
    },
    discoverySignals: [i.reason, `priority=${i.priority}`, `kind=${i.documentKind}`],
    documentClass: mapKind(i.documentKind),
    ehbQueueId: i.queueId,
    ehbPriority: i.priority,
    ehbResolutionStatus: i.resolutionStatus,
    ehbDedupeIdentity: i.dedupeIdentity,
    parentRelationshipCandidates: i.parentRelationshipCandidates,
    ibrAuthorityNote: "DISCOVERY_HINT_ONLY",
  }));

  return {
    contractVersion: CKF_HANDOFF_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    producer: "WS-EHB",
    consumer: "WS-CKF",
    storageStatus: opts?.storageStatus ?? "EPHEMERAL_WORKSPACE",
    storageNote:
      opts?.storageNote ??
      "Runtime queue/manifest bytes under data/edgar-historical-backfill/ are workspace-local unless exported. Summaries under docs/edgar-historical-backfill/ are committed; do not claim cross-agent durability from VM-only paths.",
    fetchableCount: documents.length,
    deferredPartialIbrCount: deferred.length,
    documents,
  };
}
