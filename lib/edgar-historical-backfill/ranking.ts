/**
 * Rank undiscovered / discovered-but-not-queued exhibits by expected covenant
 * relevance and drafting diversity for the acquisition queue.
 */

import type {
  AcquisitionQueueItem,
  AcquisitionResolutionStatus,
  DebtDocumentKind,
  ExhibitRef,
  IssuerRef,
} from "./types";
import { createHash } from "node:crypto";
import { parentRelationshipCandidates } from "./relationships";
import { validateQueueItem } from "./queue-validate";

const KIND_WEIGHT: Record<DebtDocumentKind, number> = {
  CREDIT_AGREEMENT: 100,
  RESTATEMENT: 98,
  INDENTURE: 90,
  SUPPLEMENTAL_INDENTURE: 85,
  AMENDMENT: 80,
  INTERCREDITOR: 75,
  WAIVER: 70,
  CONSENT: 65,
  GUARANTEE: 60,
  SECURITY_AGREEMENT: 60,
  OTHER_DEBT_AGREEMENT: 45,
  UNKNOWN: 10,
};

/** Diversity bonus: reward kinds / title tokens not yet heavily represented. */
export function draftingDiversityBonus(
  exhibit: ExhibitRef,
  corpusKindCounts: Map<DebtDocumentKind, number>,
  corpusTitleTokens: Map<string, number>,
): number {
  const kindCount = corpusKindCounts.get(exhibit.documentKind) ?? 0;
  const kindBonus = Math.max(0, 25 - kindCount * 2);

  const tokens = exhibit.description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 4)
    .slice(0, 8);
  let rare = 0;
  for (const t of tokens) {
    const c = corpusTitleTokens.get(t) ?? 0;
    if (c <= 1) rare += 2;
  }
  return Math.min(40, kindBonus + rare);
}

export function relevancePriority(exhibit: ExhibitRef, diversityBonus: number): number {
  const kind = KIND_WEIGHT[exhibit.documentKind] ?? 0;
  const year = Number(exhibit.filingDate.slice(0, 4));
  const recency = Number.isFinite(year) ? Math.max(0, Math.min(20, year - 2005)) : 0;
  const fetchable =
    exhibit.sourceUri && !exhibit.isIncorporatedByReference
      ? 15
      : exhibit.ibr?.resolutionStatus === "RESOLVED"
        ? 10
        : exhibit.ibr?.resolvedAccessionNumber
          ? 4
          : 0;
  return kind + exhibit.relevanceScore * 0.5 + recency + diversityBonus + fetchable;
}

function resolutionStatusOf(e: ExhibitRef, sourceUri: string): AcquisitionResolutionStatus {
  if (!sourceUri) return "URL_MISSING";
  if (e.isIncorporatedByReference) {
    if (e.ibr?.resolutionStatus === "RESOLVED" && e.ibr.resolvedFilename) return "IBR_RESOLVED";
    if (e.ibr?.resolvedAccessionNumber || e.ibr?.resolutionStatus === "PARTIAL") return "IBR_PARTIAL";
    return "IBR_UNRESOLVED";
  }
  return "FETCHABLE_INLINE";
}

function isFetchableExhibitUri(uri: string): boolean {
  if (!uri) return false;
  if (/index\.htm/i.test(uri)) return false;
  return /^https:\/\/www\.sec\.gov\//i.test(uri) || /^https:\/\/data\.sec\.gov\//i.test(uri);
}

export function buildAcquisitionQueue(params: {
  exhibits: ExhibitRef[];
  issuersByCik: Map<string, IssuerRef>;
  minRelevance?: number;
  limit?: number;
  /** When true, include IBR_PARTIAL items that have accession but no exhibit file URL yet. */
  includePartialIbr?: boolean;
}): AcquisitionQueueItem[] {
  const minRelevance = params.minRelevance ?? 55;
  const includePartialIbr = params.includePartialIbr ?? true;
  const candidates = params.exhibits.filter((e) => {
    if (e.relevanceScore < minRelevance) return false;
    if (e.discoveryStatus === "SKIPPED_DUPLICATE" || e.discoveryStatus === "SKIPPED_LOW_RELEVANCE") return false;
    const uri = e.sourceUri || e.ibr?.resolvedSourceUri || "";
    if (isFetchableExhibitUri(uri)) return true;
    if (includePartialIbr && e.ibr?.resolvedAccessionNumber && e.ibr.resolvedExhibitType) return true;
    return false;
  });

  const kindCounts = new Map<DebtDocumentKind, number>();
  const titleTokens = new Map<string, number>();
  for (const e of candidates) {
    kindCounts.set(e.documentKind, (kindCounts.get(e.documentKind) ?? 0) + 1);
    for (const t of e.description.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 4)) {
      titleTokens.set(t, (titleTokens.get(t) ?? 0) + 1);
    }
  }

  const items: AcquisitionQueueItem[] = candidates.map((e) => {
    const diversity = draftingDiversityBonus(e, kindCounts, titleTokens);
    const priority = relevancePriority(e, diversity);
    const sourceUri = e.sourceUri || e.ibr?.resolvedSourceUri || "";
    const issuer = params.issuersByCik.get(e.cik);
    const dedupeIdentity = e.agreementIdentityKey;
    const queueId = createHash("sha256")
      .update(`${e.cik}|${e.accessionNumber}|${e.filename}|${sourceUri}|${dedupeIdentity}`)
      .digest("hex")
      .slice(0, 24);
    const resolutionStatus = resolutionStatusOf(e, sourceUri);
    const parents = parentRelationshipCandidates({
      documentKind: e.documentKind,
      description: e.description,
      agreementIdentityKey: e.agreementIdentityKey,
      ibrAccessionNumber: e.ibr?.resolvedAccessionNumber,
      ibrExhibitType: e.ibr?.resolvedExhibitType,
    });
    const item: AcquisitionQueueItem = {
      queueId,
      priority,
      cik: e.cik,
      ticker: issuer?.ticker,
      accessionNumber: e.accessionNumber,
      filingDate: e.filingDate,
      form: e.form,
      exhibitType: e.exhibitType,
      filename: e.filename,
      description: e.description,
      documentKind: e.documentKind,
      sourceUri,
      agreementIdentityKey: e.agreementIdentityKey,
      relevanceScore: e.relevanceScore,
      draftingDiversityBonus: diversity,
      reason: `kind=${e.documentKind}; relevance=${e.relevanceScore}; diversity=+${diversity}; resolution=${resolutionStatus}`,
      status: "QUEUED",
      enqueuedAt: new Date().toISOString(),
      resolutionStatus,
      parentRelationshipCandidates: parents,
      dedupeIdentity,
      isIncorporatedByReference: e.isIncorporatedByReference,
      ibrAccessionNumber: e.ibr?.resolvedAccessionNumber,
    };
    item.validation = validateQueueItem(item);
    return item;
  });

  items.sort((a, b) => b.priority - a.priority || b.filingDate.localeCompare(a.filingDate));
  return typeof params.limit === "number" ? items.slice(0, params.limit) : items;
}
