/**
 * Build provision-level KnowledgeRelationshipEdge candidates from persisted
 * covenant summaries (definitions, cross-refs, exceptions, conditions, shared capacity).
 * Persists as DISCOVERED — never certified authority.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { summarizeFromStoredMetadata, type CovenantSummaryItem } from "../covenant-intelligence/summarize";
import type { RelationshipKind } from "../../knowledge-factory/types";
import { detectPatternsInText } from "../../knowledge-factory/patterns/library";

export interface ProvisionGraphEdge {
  fromSourceId: string;
  fromSectionRef: string;
  toSourceId: string;
  toSectionRef: string | null;
  toTerm: string | null;
  kind: Extract<
    RelationshipKind,
    | "PROVISION_DEFINITION"
    | "PROVISION_CROSS_REFERENCE"
    | "PROVISION_EXCEPTION"
    | "PROVISION_CONDITION"
    | "PROVISION_SHARED_CAPACITY"
  >;
  rationale: string;
  confidence: number;
}

/** Stable provision-edge identity — also used as discoveryKey when uniqueness is authorized. */
export function provisionEdgeDiscoveryId(e: ProvisionGraphEdge): string {
  return createHash("sha256")
    .update(`${e.kind}|${e.fromSourceId}|${e.fromSectionRef}|${e.toSourceId}|${e.toSectionRef ?? e.toTerm ?? ""}`)
    .digest("hex")
    .slice(0, 24);
}

/** @deprecated Prefer provisionEdgeDiscoveryId */
function edgeId(e: ProvisionGraphEdge): string {
  return provisionEdgeDiscoveryId(e);
}

/**
 * Load every existing provision discoveryId without the prior take:20000 cap
 * that silently re-inserted duplicates on batch rebuilds.
 */
export async function loadExistingProvisionDiscoveryIds(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ discovery_id: string | null }>>`
    SELECT DISTINCT metadata->>'discoveryId' AS discovery_id
    FROM knowledge_relationship_edges
    WHERE kind::text LIKE 'PROVISION_%'
      AND metadata->>'discoveryId' IS NOT NULL
  `;
  const existingIds = new Set<string>();
  for (const row of rows) {
    if (row.discovery_id) existingIds.add(row.discovery_id);
  }
  return existingIds;
}

function parseSectionRef(raw: string): string | null {
  const m = raw.match(/\b(?:Section|§)\s*(\d+(?:\.\d+)*)/i) || raw.match(/\b(\d+\.\d+(?:\.\d+)*)\b/);
  return m?.[1] ?? null;
}

export function discoverProvisionEdgesFromItems(
  items: Array<CovenantSummaryItem & { sourceId: string }>,
): ProvisionGraphEdge[] {
  const out: ProvisionGraphEdge[] = [];
  const bySection = new Map<string, CovenantSummaryItem & { sourceId: string }>();
  for (const item of items) {
    bySection.set(`${item.sourceId}::${item.sectionRef}`.toLowerCase(), item);
    bySection.set(item.sectionRef.toLowerCase(), item);
  }

  for (const item of items) {
    for (const d of item.applicableDefinitions ?? []) {
      out.push({
        fromSourceId: item.sourceId,
        fromSectionRef: item.sectionRef,
        toSourceId: item.sourceId,
        toSectionRef: null,
        toTerm: d.term,
        kind: "PROVISION_DEFINITION",
        rationale: d.resolved === false
          ? `Definition of "${d.term}" referenced but unresolved in excerpt`
          : `Meaning controlled by definition of "${d.term}"`,
        confidence: d.resolved === false ? 0.4 : 0.7,
      });
    }
    for (const xref of item.crossReferences ?? []) {
      const ref = parseSectionRef(xref);
      const target = ref
        ? bySection.get(`${item.sourceId}::${ref}`.toLowerCase()) ?? bySection.get(ref.toLowerCase())
        : undefined;
      out.push({
        fromSourceId: item.sourceId,
        fromSectionRef: item.sectionRef,
        toSourceId: target?.sourceId ?? item.sourceId,
        toSectionRef: ref,
        toTerm: null,
        kind: "PROVISION_CROSS_REFERENCE",
        rationale: `Cross-reference: ${xref.slice(0, 160)}`,
        confidence: target ? 0.75 : 0.45,
      });
    }
    for (const ex of item.exceptions ?? []) {
      out.push({
        fromSourceId: item.sourceId,
        fromSectionRef: item.sectionRef,
        toSourceId: item.sourceId,
        toSectionRef: item.sectionRef,
        toTerm: null,
        kind: "PROVISION_EXCEPTION",
        rationale: `Exception/carve-out: ${ex.slice(0, 160)}`,
        confidence: 0.65,
      });
    }
    for (const cond of item.conditions ?? []) {
      out.push({
        fromSourceId: item.sourceId,
        fromSectionRef: item.sectionRef,
        toSourceId: item.sourceId,
        toSectionRef: item.sectionRef,
        toTerm: null,
        kind: "PROVISION_CONDITION",
        rationale: `Condition/proviso: ${cond.slice(0, 160)}`,
        confidence: 0.65,
      });
    }
    const hay = `${item.plainEnglish} ${(item.materialBasketsThresholds ?? []).join(" ")}`;
    if (detectPatternsInText(hay).includes("shared-capacity")) {
      out.push({
        fromSourceId: item.sourceId,
        fromSectionRef: item.sectionRef,
        toSourceId: item.sourceId,
        toSectionRef: item.sectionRef,
        toTerm: null,
        kind: "PROVISION_SHARED_CAPACITY",
        rationale: "Shared-capacity structural pattern detected in provision text",
        confidence: 0.55,
      });
    }
  }

  // Dedupe
  const seen = new Set<string>();
  return out.filter((e) => {
    const id = edgeId(e);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export interface ProvisionGraphPersistResult {
  sources: number;
  items: number;
  discovered: number;
  persisted: number;
  skippedExisting: number;
  byKind: Record<string, number>;
  definitionResolved: number;
  definitionUnresolved: number;
}

export async function persistProvisionGraph(params?: {
  companyId?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<ProvisionGraphPersistResult> {
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      NOT: { provenance: "workspace-meta" },
      ...(params?.companyId ? { companyId: params.companyId } : {}),
    },
    select: { id: true, sourceId: true, metadata: true },
    take: params?.limit ?? 5000,
  });

  const items: Array<CovenantSummaryItem & { sourceId: string }> = [];
  for (const row of rows) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary?.items?.length) continue;
    for (const item of summary.items) {
      items.push({ ...item, sourceId: row.sourceId });
    }
  }

  const edges = discoverProvisionEdgesFromItems(items);
  const byKind: Record<string, number> = {};
  let definitionResolved = 0;
  let definitionUnresolved = 0;
  for (const e of edges) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (e.kind === "PROVISION_DEFINITION") {
      if (/unresolved/i.test(e.rationale)) definitionUnresolved += 1;
      else definitionResolved += 1;
    }
  }

  const idBySourceId = new Map(rows.map((r) => [r.sourceId, r.id]));
  let persisted = 0;
  let skippedExisting = 0;

  if (!params?.dryRun) {
    // Full scan — never cap existing IDs (prior take:20000 caused duplicate amplification).
    const existingIds = await loadExistingProvisionDiscoveryIds();

    const toCreate = [];
    for (const e of edges) {
      const sourceRecordId = idBySourceId.get(e.fromSourceId);
      if (!sourceRecordId) continue;
      const discoveryId = provisionEdgeDiscoveryId(e);
      if (existingIds.has(discoveryId)) {
        skippedExisting += 1;
        continue;
      }
      // Cap writes — prefer coverage over unbounded exception/condition fan-out
      if (toCreate.length >= 8000) break;
      existingIds.add(discoveryId);
      toCreate.push({
        sourceRecordId,
        targetSourceId: e.toSourceId,
        kind: e.kind as never,
        evidenceStatus: "DISCOVERED" as const,
        rationale: e.rationale.slice(0, 500),
        confidence: e.confidence,
        metadata: {
          fromSectionRef: e.fromSectionRef,
          toSectionRef: e.toSectionRef,
          toTerm: e.toTerm,
          discoveryId,
          note: "Provision-level DISCOVERED edge from covenant summary — not certified IR",
        },
      });
    }
    const chunk = 200;
    for (let i = 0; i < toCreate.length; i += chunk) {
      const slice = toCreate.slice(i, i + chunk);
      // skipDuplicates is a belt-and-suspenders guard; uniqueness on discoveryKey
      // requires an authorized schema migration before it is fully enforced.
      const res = await prisma.knowledgeRelationshipEdge.createMany({
        data: slice as never,
        skipDuplicates: true,
      });
      persisted += res.count;
    }
  }

  return {
    sources: rows.length,
    items: items.length,
    discovered: edges.length,
    persisted: params?.dryRun ? 0 : persisted,
    skippedExisting,
    byKind,
    definitionResolved,
    definitionUnresolved,
  };
}
