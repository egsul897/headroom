/**
 * Phase D — dry-run consolidation plan (read-only against Neon).
 * Never migrates. Never bulk-writes. Never prints DATABASE_URL.
 *
 *   npm run kf:consolidation-dry-run
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildAssetInventory,
  buildDryRunPlan,
  verifyGibraltarFixture,
} from "../../lib/knowledge-factory/consolidation";
import { importExportSourcesMetadataOnly } from "../../lib/knowledge-factory/consolidation/import-derived-export";

const OUT_DIR = "docs/knowledge-factory/consolidation";

async function main() {
  const startingSha = execSync("git rev-parse HEAD").toString().trim();
  const inventory = buildAssetInventory();
  const plan = await buildDryRunPlan();
  const metadataPlan = await importExportSourcesMetadataOnly({ live: false });
  const gibraltar = verifyGibraltarFixture();

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "asset-inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "dry-run-plan.json"), JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(
    path.join(OUT_DIR, "metadata-only-dry-run.json"),
    JSON.stringify(metadataPlan, null, 2) + "\n",
  );

  const dashboard = {
    schemaVersion: "knowledge-factory.corpus-coverage-dashboard.v1",
    generatedAt: new Date().toISOString(),
    startingSha,
    verdict: "CONSOLIDATION_IMPLEMENTED_AWAITING_LIVE_WRITE_APPROVAL",
    neon: plan.neon,
    gibraltarFixture: gibraltar,
    originalBytes: {
      availableFiles: plan.availableOriginalByteFiles,
      totalBytes: plan.availableOriginalBytesTotal,
      proposedDurableInserts: plan.proposed.insertBytesAndRegistry,
      estimatedInsertStorageBytes: plan.estimatedStorageBytes,
      estimatedStorageBytesIfMigrationApplied: plan.estimatedStorageBytesIfMigrationApplied,
      proposedIfMigrationApplied: plan.proposedIfMigrationApplied,
    },
    derivedKnowledge: {
      exportSourcesConsidered: metadataPlan.sourcesConsidered,
      metadataWouldInsert: metadataPlan.wouldInsert,
      metadataWouldReuse: metadataPlan.wouldReuse,
      metadataWouldConflict: metadataPlan.wouldConflict,
      note: "Metadata-only rows are NOT durability claims (storageRef null)",
    },
    existingDbCounts: plan.neon.existingCounts,
    blockers: plan.blockers,
    approvalCheckpoint: plan.approvalCheckpoint,
    families: inventory.families.map((f) => ({
      family: f.family,
      availability: f.availability,
      originalBytesPresent: f.originalBytesPresent,
      volume: f.approximateVolume,
    })),
  };
  writeFileSync(
    path.join(OUT_DIR, "corpus-coverage-dashboard.json"),
    JSON.stringify(dashboard, null, 2) + "\n",
  );

  console.log(
    JSON.stringify(
      {
        verdict: dashboard.verdict,
        startingSha,
        neon: plan.neon,
        proposed: plan.proposed,
        estimatedStorageBytes: plan.estimatedStorageBytes,
        metadataPlan: {
          sourcesConsidered: metadataPlan.sourcesConsidered,
          wouldInsert: metadataPlan.wouldInsert,
          wouldReuse: metadataPlan.wouldReuse,
          wouldConflict: metadataPlan.wouldConflict,
        },
        gibraltarOk: gibraltar.ok,
        wrote: [
          `${OUT_DIR}/asset-inventory.json`,
          `${OUT_DIR}/dry-run-plan.json`,
          `${OUT_DIR}/metadata-only-dry-run.json`,
          `${OUT_DIR}/corpus-coverage-dashboard.json`,
        ],
        approvalCheckpoint: plan.approvalCheckpoint,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
