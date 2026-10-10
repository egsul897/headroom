/**
 * READ-ONLY double-run of quality-gate core audits against the connected Neon DB.
 * Demonstrates: (1) re-reading does not mutate edge counts (2) metrics are stable.
 *
 * Does NOT write KnowledgeSource / BYTEA / relationship edges.
 * Does NOT apply the dedupe migration.
 *
 *   npx tsx scripts/knowledge-factory/remediation-quality-gate-double-run.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runRelationshipAudit } from "../../lib/knowledge-factory/quality-gate/relationship-audit";
import { runOperativeAudit } from "../../lib/knowledge-factory/quality-gate/operative-audit";
import { reportDatabaseEffects } from "../../lib/knowledge-factory/quality-gate/database-effects";
import { computeUniqueEdgeMetrics } from "../../lib/knowledge-factory/quality-gate/unique-edge-metrics";
import { prisma } from "../../lib/prisma";

async function snapshotCounts() {
  const [edges, sources, unique] = await Promise.all([
    prisma.knowledgeRelationshipEdge.count(),
    prisma.knowledgeSource.count(),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(DISTINCT metadata->>'discoveryId')::bigint AS n
      FROM knowledge_relationship_edges
      WHERE metadata->>'discoveryId' IS NOT NULL
    `,
  ]);
  return {
    edges,
    sources,
    uniqueDiscoveryIds: Number(unique[0]?.n ?? 0),
  };
}

async function onePass(label: string) {
  const before = await snapshotCounts();
  const relationships = await runRelationshipAudit({ perKind: 10 });
  const operative = await runOperativeAudit();
  const uniqueEdges = await computeUniqueEdgeMetrics();
  const dbEffects = await reportDatabaseEffects();
  const after = await snapshotCounts();
  return {
    label,
    before,
    after,
    countsUnchanged:
      before.edges === after.edges &&
      before.sources === after.sources &&
      before.uniqueDiscoveryIds === after.uniqueDiscoveryIds,
    relationship: {
      totalEdges: relationships.population.totalEdges,
      exactTripleDuplicates: relationships.duplicateAmplification.exactTripleDuplicates,
      supportedOrWeakRate: relationships.precisionEstimate.supportedOrWeakRate,
    },
    operative: {
      passRate: operative.passRate,
      cases: operative.cases.map((c) => ({
        caseId: c.caseId,
        pass: c.pass,
        engineStatus: c.engineStatus,
        engineOperativeTitle: c.engineOperativeTitle,
      })),
    },
    uniqueEdges: uniqueEdges.population,
    representationLevels: dbEffects.representationLevels,
    certifiedCount: dbEffects.representationLevels["CERTIFIED"] ?? 0,
    reviewerVerifiedCount: dbEffects.representationLevels["REVIEWER_VERIFIED"] ?? 0,
  };
}

async function main() {
  const outDir = path.join(process.cwd(), "docs/knowledge-factory/quality-gate/remediation");
  mkdirSync(outDir, { recursive: true });

  console.error("double-run: pass 1…");
  const pass1 = await onePass("pass1");
  console.error("double-run: pass 2…");
  const pass2 = await onePass("pass2");

  const noDuplicateGrowth =
    pass1.after.edges === pass2.after.edges &&
    pass1.after.uniqueDiscoveryIds === pass2.after.uniqueDiscoveryIds &&
    pass1.uniqueEdges.excessDuplicateRows === pass2.uniqueEdges.excessDuplicateRows;

  const report = {
    schema: "kf-quality-gate-double-run.v1",
    generatedAt: new Date().toISOString(),
    neonMutations: false,
    paidInferenceUsd: 0,
    isolatedSnapshotNote:
      "Read-only double-run against the connected database. No migration applied. Graph persist idempotence is covered by unit tests + persistProvisionGraph full discoveryId scan (see REMEDIATION-PLAN.md). A disposable Neon branch apply of the pending migration remains OWNER-AUTHORIZED only.",
    pass1,
    pass2,
    idempotence: {
      eachPassCountsUnchanged: pass1.countsUnchanged && pass2.countsUnchanged,
      noDuplicateGrowthAcrossPasses: noDuplicateGrowth,
      uniqueDiscoveryIdsStable:
        pass1.uniqueEdges.uniqueDiscoveryIds === pass2.uniqueEdges.uniqueDiscoveryIds,
      authorityLabelsPreserved:
        pass1.certifiedCount === pass2.certifiedCount &&
        pass1.reviewerVerifiedCount === pass2.reviewerVerifiedCount,
    },
    diversityGapsStillVisible: true,
    blockers: [
      ...(noDuplicateGrowth ? [] : ["Duplicate growth detected across read-only passes — investigate"]),
      "Pending discoveryKey unique-index migration not applied (requires explicit authorization)",
      "Historical excess duplicate rows (~18,984 by discoveryId) remain until authorized dedupe migration",
      "ABL / intercreditor / guarantee diversity gaps remain — corpus incomplete",
    ],
  };

  writeFileSync(path.join(outDir, "quality-gate-double-run.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.idempotence, null, 2));
  console.log(JSON.stringify({ blockers: report.blockers, pass1Unique: pass1.uniqueEdges, pass2Unique: pass2.uniqueEdges }, null, 2));

  if (!report.idempotence.eachPassCountsUnchanged || !report.idempotence.noDuplicateGrowthAcrossPasses) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
