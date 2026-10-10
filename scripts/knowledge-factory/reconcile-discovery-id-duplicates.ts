/**
 * READ-ONLY: reconcile edges by metadata.discoveryId (true provision identity).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{ kind: string; discovery_id: string | null; n: bigint }>
  >`
    SELECT kind::text AS kind,
           metadata->>'discoveryId' AS discovery_id,
           COUNT(*)::bigint AS n
    FROM knowledge_relationship_edges
    GROUP BY 1, 2
  `;

  let total = 0;
  let withIdRows = 0;
  let withoutIdRows = 0;
  let uniqueNonNullDiscoveryIds = 0;
  let excessDuplicateDiscoveryRows = 0;
  const byKind: Record<
    string,
    { groups: number; rows: number; excess: number; nullDiscoveryRows: number; maxMultiplicity: number }
  > = {};

  for (const r of rows) {
    const n = Number(r.n);
    total += n;
    const slot = byKind[r.kind] ?? {
      groups: 0,
      rows: 0,
      excess: 0,
      nullDiscoveryRows: 0,
      maxMultiplicity: 0,
    };
    slot.rows += n;
    slot.groups += 1;
    slot.maxMultiplicity = Math.max(slot.maxMultiplicity, n);
    if (!r.discovery_id) {
      withoutIdRows += n;
      slot.nullDiscoveryRows += n;
    } else {
      withIdRows += n;
      uniqueNonNullDiscoveryIds += 1;
      excessDuplicateDiscoveryRows += n - 1;
      slot.excess += n - 1;
    }
    byKind[r.kind] = slot;
  }

  const agreementSelfLoops = await prisma.$queryRaw<Array<{ kind: string; n: bigint }>>`
    SELECT e.kind::text AS kind, COUNT(*)::bigint AS n
    FROM knowledge_relationship_edges e
    JOIN knowledge_sources s ON s.id = e."sourceRecordId"
    WHERE e."targetSourceId" = s."sourceId"
      AND (
        e.kind::text LIKE 'AGREEMENT_%'
        OR e.kind::text = 'INDENTURE_SUPPLEMENTAL'
      )
    GROUP BY 1
  `;

  const topDiscoveryDupes = await prisma.$queryRaw<
    Array<{ kind: string; discovery_id: string; n: bigint; first_at: Date; last_at: Date }>
  >`
    SELECT kind::text AS kind,
           metadata->>'discoveryId' AS discovery_id,
           COUNT(*)::bigint AS n,
           MIN("createdAt") AS first_at,
           MAX("createdAt") AS last_at
    FROM knowledge_relationship_edges
    WHERE metadata->>'discoveryId' IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 25
  `;

  const report = {
    schema: "kf-discovery-id-duplicate-reconcile.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    population: {
      totalRows: total,
      withIdRows,
      withoutIdRows,
      uniqueNonNullDiscoveryIds,
      excessDuplicateDiscoveryRows,
      byKind,
    },
    coarseTripleNote:
      "Unique (sourceRecordId,targetSourceId,kind) undercounts provision diversity because PROVISION_* edges intentionally share same-document endpoints; discoveryId is the correct provision identity.",
    agreementSelfLoops: agreementSelfLoops.map((r) => ({ kind: r.kind, n: Number(r.n) })),
    topDiscoveryIdDuplicates: topDiscoveryDupes.map((r) => ({
      kind: r.kind,
      discoveryId: r.discovery_id,
      count: Number(r.n),
      excess: Number(r.n) - 1,
      firstAt: r.first_at.toISOString(),
      lastAt: r.last_at.toISOString(),
    })),
  };

  const outDir = path.join(process.cwd(), "docs/knowledge-factory/quality-gate/remediation");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "discovery-id-reconcile.json"), JSON.stringify(report, null, 2) + "\n");
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
