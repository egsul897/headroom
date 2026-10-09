/**
 * Mass precedent — inventory + batch-100 dry-run (read-only Neon).
 * Never migrates. Never bulk-writes. Never prints DATABASE_URL.
 *
 *   npm run kf:mass-precedent-dry-run
 *   npm run kf:mass-precedent-dry-run -- --include-network
 *   npm run kf:mass-precedent-dry-run -- --batch-size=100
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildMassPrecedentInventory,
  buildMassPrecedentBatchPlan,
} from "../../lib/knowledge-factory/mass-precedent";
import { buildMassPrecedentCostAssessment } from "../../lib/knowledge-factory/mass-precedent/cost-model";
import { verifyGibraltarFixture } from "../../lib/knowledge-factory/consolidation";

const OUT_DIR = "docs/knowledge-factory/mass-precedent";

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const startingSha = execSync("git rev-parse HEAD").toString().trim();
  const includeNetwork = argFlag("--include-network");
  const batchSize = argValue("--batch-size", 100);

  const inventory = buildMassPrecedentInventory();
  const plan = await buildMassPrecedentBatchPlan({
    batchSize,
    includeNetworkFetch: includeNetwork,
    milestone: batchSize <= 100 ? "batch-100" : batchSize <= 500 ? "batch-500" : "batch-1000",
  });
  const cost = buildMassPrecedentCostAssessment({
    committedBytesTotal: inventory.summary.committedBytesTotal,
    committedDocCount: inventory.summary.committedBytesAvailable,
  });
  const gibraltar = verifyGibraltarFixture();

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "batch-plan.json"), JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "cost-assessment.json"), JSON.stringify(cost, null, 2) + "\n");

  const report = {
    schemaVersion: "knowledge-factory.mass-precedent-status.v1",
    generatedAt: new Date().toISOString(),
    startingSha,
    verdict: "MASS_PRECEDENT_DRY_RUN_READY_AWAITING_APPROVAL",
    liveWriteAuthorized: false as const,
    approvalCheckpoint: plan.approvalCheckpoint,
    neon: plan.neon,
    gibraltarFixture: gibraltar,
    inventory: inventory.summary,
    batch: {
      milestone: plan.milestone,
      batchSize: plan.batchSize,
      includeNetwork,
      proposed: plan.proposed,
      estimatedStorageBytes: plan.estimatedStorageBytes,
      estimatedSecRequests: plan.estimatedSecRequests,
      itemCount: plan.items.length,
    },
    costMilestones: cost.milestones.map((m) => ({
      name: m.name,
      documents: m.documents,
      estimatedNeonFootprintGiB: m.estimatedNeonFootprintGiB,
      estimatedSecRequests: m.estimatedSecRequests,
    })),
    tablesAffectedAfterApproval: [
      "document_byte_objects",
      "KnowledgeSource",
      "knowledge_import_batches",
    ],
    tablesNotTouched: ["Company", "FinancialSnapshot", "Document (product demo rows)"],
    blockers: plan.blockers,
    nextCommandsAfterApproval: [
      "npx prisma migrate deploy  # document_byte_objects + knowledge_import_batches",
      "KF_CONSOLIDATION_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npm run kf:consolidation-import",
      "KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npm run kf:mass-precedent-import -- --batch-size=100",
      "npm run kf:mass-precedent-analyze -- --limit=5",
    ],
    metricsSeparations: {
      authenticSourceDocumentsDiscovered: inventory.summary.financingLocators + inventory.summary.committedBytesAvailable,
      authenticOriginalDocumentsAcquiredOnDisk: inventory.summary.committedBytesAvailable,
      originalBytesDurablyPersistedInNeon: plan.neon.documentByteObjectsTablePresent ? "see document_byte_objects count after import" : 0,
      distinctIssuersInManifest: inventory.summary.distinctIssuersInManifest,
      executableVerifiedRecords: 0,
      note: "Do not treat total KnowledgeSource row count as legal coverage",
    },
  };
  writeFileSync(path.join(OUT_DIR, "status-board.json"), JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        startingSha,
        neon: plan.neon,
        inventory: inventory.summary,
        proposed: plan.proposed,
        estimatedStorageBytes: plan.estimatedStorageBytes,
        blockers: plan.blockers,
        approvalCheckpoint: plan.approvalCheckpoint,
        artifacts: [
          `${OUT_DIR}/inventory.json`,
          `${OUT_DIR}/batch-plan.json`,
          `${OUT_DIR}/cost-assessment.json`,
          `${OUT_DIR}/status-board.json`,
        ],
      },
      null,
      2,
    ),
  );

  await import("../../lib/prisma").then(({ prisma }) => prisma.$disconnect());
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    await import("../../lib/prisma").then(({ prisma }) => prisma.$disconnect());
  } catch {
    /* ignore */
  }
  process.exit(1);
});
