/**
 * Rank undiscovered / discovered-but-not-queued exhibits by expected covenant
 * relevance and drafting diversity for the acquisition queue.
 */

import type { AcquisitionQueueItem, DebtDocumentKind, ExhibitRef, IssuerRef } from "./types";
import { createHash } from "node:crypto";

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
  // Prefer inline fetchable docs over unresolved IBR.
  const fetchable = exhibit.sourceUri && !exhibit.isIncorporatedByReference ? 15 : exhibit.ibr?.resolutionStatus === "RESOLVED" ? 10 : 0;
  return kind + exhibit.relevanceScore * 0.5 + recency + diversityBonus + fetchable;
}

export function buildAcquisitionQueue(params: {
  exhibits: ExhibitRef[];
  issuersByCik: Map<string, IssuerRef>;
  minRelevance?: number;
  limit?: number;
}): AcquisitionQueueItem[] {
  const minRelevance = params.minRelevance ?? 55;
  const candidates = params.exhibits.filter(
    (e) =>
      e.relevanceScore >= minRelevance &&
      e.discoveryStatus !== "SKIPPED_DUPLICATE" &&
      e.discoveryStatus !== "SKIPPED_LOW_RELEVANCE" &&
      Boolean(e.sourceUri || e.ibr?.resolvedSourceUri),
  );

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
    const queueId = createHash("sha256")
      .update(`${e.cik}|${e.accessionNumber}|${e.filename}|${sourceUri}`)
      .digest("hex")
      .slice(0, 24);
    return {
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
      reason: `kind=${e.documentKind}; relevance=${e.relevanceScore}; diversity=+${diversity}`,
      status: "QUEUED",
      enqueuedAt: new Date().toISOString(),
    };
  });

  items.sort((a, b) => b.priority - a.priority || b.filingDate.localeCompare(a.filingDate));
  return typeof params.limit === "number" ? items.slice(0, params.limit) : items;
}
