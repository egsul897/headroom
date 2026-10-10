/**
 * READ-ONLY reconciliation of KnowledgeRelationshipEdge duplicates.
 * Does not mutate Neon.
 *
 *   npx tsx scripts/knowledge-factory/reconcile-relationship-duplicates.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";

async function main() {
  const total = await prisma.knowledgeRelationshipEdge.count();
  const byKind = await prisma.knowledgeRelationshipEdge.groupBy({
    by: ["kind"],
    _count: true,
  });

  // Unique identity = (sourceRecordId, targetSourceId, kind)
  const rows = await prisma.knowledgeRelationshipEdge.findMany({
    select: {
      id: true,
      sourceRecordId: true,
      targetSourceId: true,
      kind: true,
      createdAt: true,
      evidenceStatus: true,
    },
  });

  type Agg = {
    kind: string;
    sourceRecordId: string;
    targetSourceId: string;
    count: number;
    firstAt: string;
    lastAt: string;
    ids: string[];
  };
  const map = new Map<string, Agg>();
  let selfLoops = 0;
  const selfLoopsByKind: Record<string, number> = {};

  for (const r of rows) {
    const key = `${r.sourceRecordId}\0${r.targetSourceId}\0${r.kind}`;
    const created = r.createdAt.toISOString();
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        kind: r.kind,
        sourceRecordId: r.sourceRecordId,
        targetSourceId: r.targetSourceId,
        count: 1,
        firstAt: created,
        lastAt: created,
        ids: [r.id],
      });
    } else {
      cur.count += 1;
      cur.ids.push(r.id);
      if (created < cur.firstAt) cur.firstAt = created;
      if (created > cur.lastAt) cur.lastAt = created;
    }
  }

  // Resolve sourceId for self-loop detection (sourceRecordId is PK; target is sourceId string)
  const sources = await prisma.knowledgeSource.findMany({
    select: { id: true, sourceId: true, provenance: true, issuerTicker: true },
  });
  const pkToSourceId = new Map(sources.map((s) => [s.id, s.sourceId]));
  const sourceIdToProv = new Map(sources.map((s) => [s.sourceId, s.provenance]));

  for (const agg of map.values()) {
    const fromSourceId = pkToSourceId.get(agg.sourceRecordId);
    if (fromSourceId && fromSourceId === agg.targetSourceId) {
      selfLoops += agg.count;
      selfLoopsByKind[agg.kind] = (selfLoopsByKind[agg.kind] ?? 0) + agg.count;
    }
  }

  const uniqueIdentities = map.size;
  const excessRows = total - uniqueIdentities;
  const duplicatedIdentities = [...map.values()].filter((a) => a.count > 1);

  const excessByKind: Record<string, { unique: number; rows: number; excess: number }> = {};
  for (const [kind, count] of byKind.map((k) => [k.kind, k._count] as const)) {
    excessByKind[kind] = { unique: 0, rows: count, excess: 0 };
  }
  for (const agg of map.values()) {
    const slot = excessByKind[agg.kind] ?? { unique: 0, rows: 0, excess: 0 };
    slot.unique += 1;
    slot.excess += agg.count - 1;
    excessByKind[agg.kind] = slot;
  }

  // Approximate "source batch" via createdAt day buckets for excess only
  const excessByDay: Record<string, number> = {};
  for (const agg of duplicatedIdentities) {
    // count excess rows attributed to lastAt day (when amplification likely landed)
    const day = agg.lastAt.slice(0, 10);
    excessByDay[day] = (excessByDay[day] ?? 0) + (agg.count - 1);
  }

  // Top duplicated document pairs
  const topPairs = duplicatedIdentities
    .map((a) => ({
      kind: a.kind,
      sourceRecordId: a.sourceRecordId,
      targetSourceId: a.targetSourceId,
      fromSourceId: pkToSourceId.get(a.sourceRecordId) ?? null,
      count: a.count,
      excess: a.count - 1,
      firstAt: a.firstAt,
      lastAt: a.lastAt,
      fromProvenance: sourceIdToProv.get(pkToSourceId.get(a.sourceRecordId) ?? "") ?? null,
      toProvenance: sourceIdToProv.get(a.targetSourceId) ?? null,
      isSelfLoop: (pkToSourceId.get(a.sourceRecordId) ?? "") === a.targetSourceId,
    }))
    .sort((a, b) => b.excess - a.excess)
    .slice(0, 40);

  const multiplicityHistogram: Record<string, number> = {};
  for (const agg of map.values()) {
    const bucket = agg.count >= 10 ? "10+" : String(agg.count);
    multiplicityHistogram[bucket] = (multiplicityHistogram[bucket] ?? 0) + 1;
  }

  const report = {
    schema: "kf-relationship-duplicate-reconcile.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    population: {
      totalRows: total,
      uniqueIdentities,
      excessRows,
      duplicateIdentityCount: duplicatedIdentities.length,
      byKindRaw: Object.fromEntries(byKind.map((k) => [k.kind, k._count])),
      excessByKind,
      multiplicityHistogram,
      excessByCreatedDayApprox: excessByDay,
    },
    selfLoops: {
      totalRows: selfLoops,
      byKind: selfLoopsByKind,
      note: "Self-loop = sourceRecord.sourceId === targetSourceId. AGREEMENT_* self-loops are invalid; PROVISION_* same-document refs may be intentional metadata.",
    },
    topDuplicatedPairs: topPairs,
    identityDefinition: "(sourceRecordId, targetSourceId, kind)",
    amplificationHypothesis:
      "persistProvisionGraph caps existing discoveryId scan at 20k and has no UNIQUE(sourceRecordId,targetSourceId,kind); neon-massive-expand re-invoked persistProvisionGraph/persistAmendmentGraph each batch (~8k createMany cap).",
  };

  const outDir = path.join(process.cwd(), "docs/knowledge-factory/quality-gate/remediation");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "duplicate-reconcile.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
