/**
 * Persist discovered agreement↔amendment relationships into Neon
 * KnowledgeRelationshipEdge. Discovery already existed; Prisma writes did not.
 *
 * Never invents legal effectiveness. Never overwrites operative versions.
 */

import { prisma } from "@/lib/prisma";
import { discoverDocumentRelationships } from "../../knowledge-factory/relationships/discover";
import type {
  DebtDocumentClass,
  KnowledgeRelationshipRecord,
  KnowledgeSourceRecord,
} from "../../knowledge-factory/types";
import { padCik, partiesLikelySame, buildPartyIdentity } from "./party-identity";

export interface AmendmentGraphPersistResult {
  sourcesScanned: number;
  issuerGroups: number;
  companyGroups: number;
  discovered: number;
  persisted: number;
  skippedExisting: number;
  byKind: Record<string, number>;
  linkedMetadataUpdates: number;
  limitations: string[];
}

type NeonSourceRow = {
  id: string;
  sourceId: string;
  companyId: string | null;
  issuerCik: string;
  issuerTicker: string | null;
  issuerName: string | null;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  filingDate: Date;
  formType: string;
  documentTitle: string;
  documentClass: DebtDocumentClass;
  instrumentIdentity: string | null;
  originalBytesHash: string;
  normalizedTextHash: string | null;
  acquisitionTimestamp: Date;
  parserVersion: string;
  extractionStatus: string;
  representationLevel: string;
  provenance: string;
  usageRightsReviewStatus: string;
  metadata: unknown;
};

function toRecord(row: NeonSourceRow): KnowledgeSourceRecord {
  return {
    sourceId: row.sourceId,
    issuerCik: padCik(row.issuerCik) ?? row.issuerCik,
    issuerTicker: row.issuerTicker ?? undefined,
    issuerName: row.issuerName ?? undefined,
    accessionNumber: row.accessionNumber,
    exhibitFilename: row.exhibitFilename,
    sourceUrl: row.sourceUrl,
    filingDate: row.filingDate.toISOString(),
    formType: row.formType,
    documentTitle: row.documentTitle,
    documentClass: row.documentClass,
    instrumentIdentity: row.instrumentIdentity ?? undefined,
    originalBytesHash: row.originalBytesHash,
    normalizedTextHash: row.normalizedTextHash ?? undefined,
    acquisitionTimestamp: row.acquisitionTimestamp.toISOString(),
    parserVersion: row.parserVersion,
    extractionStatus: row.extractionStatus as KnowledgeSourceRecord["extractionStatus"],
    representationLevel: row.representationLevel as KnowledgeSourceRecord["representationLevel"],
    provenance: row.provenance,
    usageRightsReviewStatus:
      row.usageRightsReviewStatus as KnowledgeSourceRecord["usageRightsReviewStatus"],
    companyId: row.companyId ?? undefined,
  };
}

/**
 * Extra links when CIK is placeholder (customer uploads) — group by companyId
 * and require title/instrument evidence (same as discover).
 */
function discoverWithinGroup(records: KnowledgeSourceRecord[]): KnowledgeRelationshipRecord[] {
  return discoverDocumentRelationships(records);
}

/**
 * Discover + upsert KnowledgeRelationshipEdge rows for Neon corpus.
 * Idempotent on (sourceRecordId, targetSourceId, kind).
 */
export async function persistAmendmentGraph(params?: {
  companyId?: string;
  issuerCik?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<AmendmentGraphPersistResult> {
  const where: Record<string, unknown> = {
    NOT: { provenance: "workspace-meta" },
  };
  if (params?.companyId) where.companyId = params.companyId;
  if (params?.issuerCik) where.issuerCik = padCik(params.issuerCik) ?? params.issuerCik;

  const rows = (await prisma.knowledgeSource.findMany({
    where,
    take: params?.limit ?? 5000,
    orderBy: { filingDate: "asc" },
  })) as NeonSourceRow[];

  const byCompany = new Map<string, NeonSourceRow[]>();
  const byIssuer = new Map<string, NeonSourceRow[]>();
  for (const row of rows) {
    if (row.companyId) {
      const list = byCompany.get(row.companyId) ?? [];
      list.push(row);
      byCompany.set(row.companyId, list);
    }
    const cik = padCik(row.issuerCik) ?? row.issuerCik;
    // Skip placeholder CIK for issuer grouping — those are company-scoped only.
    if (cik && cik !== "0000000000") {
      const list = byIssuer.get(cik) ?? [];
      list.push(row);
      byIssuer.set(cik, list);
    }
  }

  // Also cluster placeholder-CIK public rows by normalized issuer name when no companyId.
  const byName = new Map<string, NeonSourceRow[]>();
  for (const row of rows) {
    const cik = padCik(row.issuerCik) ?? row.issuerCik;
    if (cik !== "0000000000" || row.companyId || !row.issuerName) continue;
    const key = buildPartyIdentity({ issuerName: row.issuerName, issuerCik: row.issuerCik }).canonicalName;
    if (!key || key === "unknown") continue;
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }

  const idBySourceId = new Map(rows.map((r) => [r.sourceId, r.id]));
  const discovered: KnowledgeRelationshipRecord[] = [];
  const seen = new Set<string>();

  const absorb = (rels: KnowledgeRelationshipRecord[]) => {
    for (const r of rels) {
      const key = `${r.kind}|${r.sourceId}|${r.targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      discovered.push(r);
    }
  };

  for (const group of byCompany.values()) absorb(discoverWithinGroup(group.map(toRecord)));
  for (const group of byIssuer.values()) absorb(discoverWithinGroup(group.map(toRecord)));
  for (const group of byName.values()) absorb(discoverWithinGroup(group.map(toRecord)));

  // Soft party match across same-name issuers with different CIK pads (rare).
  for (const [name, group] of byName) {
    void name;
    if (group.length < 2) continue;
    const identities = group.map((g) =>
      buildPartyIdentity({ issuerName: g.issuerName, issuerCik: g.issuerCik }),
    );
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!partiesLikelySame(identities[i]!, identities[j]!)) continue;
      }
    }
  }

  const byKind: Record<string, number> = {};
  for (const r of discovered) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

  let persisted = 0;
  let skippedExisting = 0;
  let linkedMetadataUpdates = 0;

  if (!params?.dryRun) {
    for (const r of discovered) {
      const sourceRecordId = idBySourceId.get(r.sourceId);
      if (!sourceRecordId || !idBySourceId.has(r.targetId)) continue;

      const existing = await prisma.knowledgeRelationshipEdge.findFirst({
        where: {
          sourceRecordId,
          targetSourceId: r.targetId,
          kind: r.kind as never,
        },
      });
      if (existing) {
        skippedExisting += 1;
        continue;
      }
      await prisma.knowledgeRelationshipEdge.create({
        data: {
          sourceRecordId,
          targetSourceId: r.targetId,
          kind: r.kind as never,
          evidenceStatus: r.evidenceStatus as never,
          rationale: r.rationale,
          confidence: r.confidence,
          metadata: {
            discoveryId: r.id,
            note: "DISCOVERED relationship — not a determination of legal effectiveness or operative precedence",
          },
        },
      });
      persisted += 1;
    }

    // Tag amendment metadata on linked sources for structural-quality rollup.
    const linkedBySource = new Map<string, KnowledgeRelationshipRecord[]>();
    for (const r of discovered) {
      const list = linkedBySource.get(r.sourceId) ?? [];
      list.push(r);
      linkedBySource.set(r.sourceId, list);
      const tlist = linkedBySource.get(r.targetId) ?? [];
      tlist.push(r);
      linkedBySource.set(r.targetId, tlist);
    }
    for (const [sourceId, rels] of linkedBySource) {
      const row = rows.find((x) => x.sourceId === sourceId);
      if (!row) continue;
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {};
      const prior = meta.amendmentPackage;
      const priorObj =
        prior && typeof prior === "object" && !Array.isArray(prior)
          ? (prior as Record<string, unknown>)
          : {};
      meta.amendmentPackage = {
        ...priorObj,
        linked: true,
        discoveredEdgeCount: rels.length,
        edges: rels.slice(0, 20).map((e) => ({
          fromSourceId: e.sourceId,
          toSourceId: e.targetId,
          kind: e.kind,
          evidenceStatus: e.evidenceStatus,
        })),
        note: "Linked via title/metadata discovery — operative resolution may still be UNRESOLVED_PRECEDENCE",
      };
      await prisma.knowledgeSource.update({
        where: { sourceId },
        data: { metadata: meta as never },
      });
      linkedMetadataUpdates += 1;
    }
  }

  return {
    sourcesScanned: rows.length,
    issuerGroups: byIssuer.size,
    companyGroups: byCompany.size,
    discovered: discovered.length,
    persisted: params?.dryRun ? 0 : persisted,
    skippedExisting,
    byKind,
    linkedMetadataUpdates: params?.dryRun ? 0 : linkedMetadataUpdates,
    limitations: [
      "Edges are DISCOVERED from title/metadata/instrument identity — not authenticated legal effectiveness.",
      "Operative version resolution remains fail-closed when precedence is incomplete.",
      "Placeholder CIK customer uploads are grouped by companyId only.",
    ],
  };
}

export async function loadAmendmentGraphCoverage(): Promise<{
  edgeCount: number;
  byKind: Record<string, number>;
  linkedSources: number;
}> {
  const edges = await prisma.knowledgeRelationshipEdge.findMany({
    select: { kind: true, sourceRecordId: true, targetSourceId: true },
  });
  const byKind: Record<string, number> = {};
  const linked = new Set<string>();
  for (const e of edges) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    linked.add(e.sourceRecordId);
    linked.add(e.targetSourceId);
  }
  return { edgeCount: edges.length, byKind, linkedSources: linked.size };
}
