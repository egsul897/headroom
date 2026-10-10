/**
 * Relationship-quality metrics on deduplicated unique edges (by discoveryId),
 * not raw row counts. Read-only. Preserves DISCOVERED ≠ CERTIFIED.
 */

import { prisma } from "../../prisma";

export interface UniqueEdgeKindStats {
  kind: string;
  rawRows: number;
  uniqueDiscoveryIds: number;
  excessDuplicateRows: number;
  meanConfidence: number | null;
  /** Wilson score interval on fraction of unique edges with confidence >= 0.6 */
  highConfidenceRate: number | null;
  highConfidenceWilson95: { low: number; high: number } | null;
  /** Unique edges whose evidenceStatus is DISCOVERED / INFERRED / AUTHENTICATED / REVIEWED */
  byEvidenceStatus: Record<string, number>;
  /** Distinct source documents supporting this kind (independent endpoint support) */
  distinctSourceRecords: number;
  distinctTargetSources: number;
}

export interface UniqueEdgeMetricsReport {
  schema: "kf-unique-edge-metrics.v1";
  generatedAt: string;
  readOnly: true;
  population: {
    totalRawRows: number;
    uniqueDiscoveryIds: number;
    excessDuplicateRows: number;
    agreementSelfLoops: number;
    provisionSameDocumentEndpoints: number;
  };
  byKind: UniqueEdgeKindStats[];
  stratifiedConfidence: {
    note: string;
    overallHighConfidenceRate: number | null;
    overallWilson95: { low: number; high: number } | null;
    byKind: Array<{
      kind: string;
      n: number;
      highConfidenceRate: number;
      wilson95: { low: number; high: number };
    }>;
  };
  authoritySeparation: {
    note: string;
    evidenceStatusOnUniqueEdges: Record<string, number>;
    neverTreatDiscoveredAsCertified: true;
  };
  diversityGapsStillVisible: {
    note: string;
    ablIntercreditorGuarantee: string;
  };
  limitations: string[];
}

/** Wilson score interval for a binomial proportion (z≈1.96 → ~95%). */
export function wilsonScoreInterval(
  successes: number,
  n: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  };
}

export async function computeUniqueEdgeMetrics(): Promise<UniqueEdgeMetricsReport> {
  const byKindRows = await prisma.$queryRaw<
    Array<{
      kind: string;
      raw_rows: bigint;
      unique_ids: bigint;
      excess: bigint;
      mean_confidence: number | null;
      high_conf: bigint;
      distinct_sources: bigint;
      distinct_targets: bigint;
    }>
  >`
    WITH unique_edges AS (
      SELECT DISTINCT ON (e.metadata->>'discoveryId')
        e.kind::text AS kind,
        e."evidenceStatus"::text AS evidence_status,
        e.confidence,
        e."sourceRecordId",
        e."targetSourceId",
        e.metadata->>'discoveryId' AS discovery_id
      FROM knowledge_relationship_edges e
      WHERE e.metadata->>'discoveryId' IS NOT NULL
      ORDER BY e.metadata->>'discoveryId', e."createdAt" ASC
    ),
    counts AS (
      SELECT
        e.kind::text AS kind,
        COUNT(*)::bigint AS raw_rows,
        COUNT(DISTINCT e.metadata->>'discoveryId')::bigint AS unique_ids,
        (COUNT(*) - COUNT(DISTINCT e.metadata->>'discoveryId'))::bigint AS excess,
        AVG(e.confidence) AS mean_confidence,
        COUNT(DISTINCT e."sourceRecordId")::bigint AS distinct_sources,
        COUNT(DISTINCT e."targetSourceId")::bigint AS distinct_targets
      FROM knowledge_relationship_edges e
      WHERE e.metadata->>'discoveryId' IS NOT NULL
      GROUP BY e.kind::text
    ),
    high AS (
      SELECT ue.kind, COUNT(*)::bigint AS high_conf
      FROM unique_edges ue
      WHERE ue.confidence >= 0.6
      GROUP BY ue.kind
    )
    SELECT
      c.kind,
      c.raw_rows,
      c.unique_ids,
      c.excess,
      c.mean_confidence,
      COALESCE(h.high_conf, 0)::bigint AS high_conf,
      c.distinct_sources,
      c.distinct_targets
    FROM counts c
    LEFT JOIN high h ON h.kind = c.kind
    ORDER BY c.raw_rows DESC
  `;

  const evidenceRows = await prisma.$queryRaw<
    Array<{ kind: string; evidence_status: string; n: bigint }>
  >`
    WITH unique_edges AS (
      SELECT DISTINCT ON (e.metadata->>'discoveryId')
        e.kind::text AS kind,
        e."evidenceStatus"::text AS evidence_status
      FROM knowledge_relationship_edges e
      WHERE e.metadata->>'discoveryId' IS NOT NULL
      ORDER BY e.metadata->>'discoveryId', e."createdAt" ASC
    )
    SELECT ue.kind, ue.evidence_status, COUNT(*)::bigint AS n
    FROM unique_edges ue
    GROUP BY ue.kind, ue.evidence_status
  `;

  const selfLoopRows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
    FROM knowledge_relationship_edges e
    JOIN knowledge_sources s ON s.id = e."sourceRecordId"
    WHERE e.kind::text LIKE 'AGREEMENT_%'
      AND s."sourceId" = e."targetSourceId"
  `;

  const provisionSameDoc = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(DISTINCT e.metadata->>'discoveryId')::bigint AS n
    FROM knowledge_relationship_edges e
    JOIN knowledge_sources s ON s.id = e."sourceRecordId"
    WHERE e.kind::text LIKE 'PROVISION_%'
      AND s."sourceId" = e."targetSourceId"
  `;

  const evidenceByKind = new Map<string, Record<string, number>>();
  const evidenceOverall: Record<string, number> = {};
  for (const r of evidenceRows) {
    const n = Number(r.n);
    const by = evidenceByKind.get(r.kind) ?? {};
    by[r.evidence_status] = n;
    evidenceByKind.set(r.kind, by);
    evidenceOverall[r.evidence_status] = (evidenceOverall[r.evidence_status] ?? 0) + n;
  }

  const byKind: UniqueEdgeKindStats[] = [];
  const stratified: UniqueEdgeMetricsReport["stratifiedConfidence"]["byKind"] = [];
  let totalUnique = 0;
  let totalHigh = 0;
  let totalRaw = 0;
  let totalExcess = 0;

  for (const r of byKindRows) {
    const unique = Number(r.unique_ids);
    const high = Number(r.high_conf);
    const raw = Number(r.raw_rows);
    const excess = Number(r.excess);
    totalUnique += unique;
    totalHigh += high;
    totalRaw += raw;
    totalExcess += excess;
    const rate = unique > 0 ? high / unique : null;
    const wilson = rate == null ? null : wilsonScoreInterval(high, unique);
    byKind.push({
      kind: r.kind,
      rawRows: raw,
      uniqueDiscoveryIds: unique,
      excessDuplicateRows: excess,
      meanConfidence: r.mean_confidence,
      highConfidenceRate: rate,
      highConfidenceWilson95: wilson,
      byEvidenceStatus: evidenceByKind.get(r.kind) ?? {},
      distinctSourceRecords: Number(r.distinct_sources),
      distinctTargetSources: Number(r.distinct_targets),
    });
    if (unique > 0 && rate != null && wilson) {
      stratified.push({
        kind: r.kind,
        n: unique,
        highConfidenceRate: rate,
        wilson95: wilson,
      });
    }
  }

  return {
    schema: "kf-unique-edge-metrics.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    population: {
      totalRawRows: totalRaw,
      uniqueDiscoveryIds: totalUnique,
      excessDuplicateRows: totalExcess,
      agreementSelfLoops: Number(selfLoopRows[0]?.n ?? 0),
      provisionSameDocumentEndpoints: Number(provisionSameDoc[0]?.n ?? 0),
    },
    byKind,
    stratifiedConfidence: {
      note: "Wilson 95% CI on unique-edge high-confidence rate (confidence >= 0.6). Stratified by relationship kind.",
      overallHighConfidenceRate: totalUnique > 0 ? totalHigh / totalUnique : null,
      overallWilson95: wilsonScoreInterval(totalHigh, totalUnique),
      byKind: stratified,
    },
    authoritySeparation: {
      note: "DISCOVERED / STRUCTURALLY_INDEXED edges are not CERTIFIED / REVIEWER_VERIFIED legal authority.",
      evidenceStatusOnUniqueEdges: evidenceOverall,
      neverTreatDiscoveredAsCertified: true,
    },
    diversityGapsStillVisible: {
      note: "ABL, intercreditor, and guarantee coverage remain incomplete — corpus must not be represented as complete.",
      ablIntercreditorGuarantee:
        "See diversity-dry-run.json — ABL / INTERCREDITOR / GUARANTEE families remain under-represented relative to credit agreements and amendments.",
    },
    limitations: [
      "Metrics are computed on DISTINCT discoveryId (earliest createdAt wins) — raw row quality overstates support.",
      "Confidence scores are discovery heuristics, not counsel-verified precision.",
      "Independent source support = distinct Neo sourceRecordId / targetSourceId endpoints, not independent counsel reviews.",
    ],
  };
}
