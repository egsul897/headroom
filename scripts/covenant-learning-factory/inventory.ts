/**
 * Emit baseline capability inventory (Workstream A).
 *
 *   npx tsx scripts/covenant-learning-factory/inventory.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  BASELINE_CAPABILITY_INVENTORY,
  renderInventoryMarkdown,
  listLearningPackages,
  probeNeonLive,
} from "../../lib/covenant-learning-factory";

async function main() {
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, "docs/covenant-learning-factory");
  mkdirSync(outDir, { recursive: true });

  const md = renderInventoryMarkdown();
  writeFileSync(path.join(outDir, "BASELINE-INVENTORY.md"), md);

  const packages = listLearningPackages(repoRoot);
  const neon = await probeNeonLive();
  const json = {
    schemaVersion: "covenant-learning-factory.inventory.v1",
    generatedAt: new Date().toISOString(),
    neon,
    capabilityCounts: {
      reusable: BASELINE_CAPABILITY_INVENTORY.filter((i) => i.status === "reusable").length,
      incomplete: BASELINE_CAPABILITY_INVENTORY.filter((i) => i.status === "incomplete").length,
      fixtureSpecific: BASELINE_CAPABILITY_INVENTORY.filter((i) => i.status === "fixture-specific").length,
      missing: BASELINE_CAPABILITY_INVENTORY.filter((i) => i.status === "missing").length,
    },
    registeredPackages: packages.map((p) => ({
      packageKey: p.packageKey,
      issuerCik: p.issuerCik,
      issuerTicker: p.issuerTicker,
      cohort: p.cohort,
      documentCount: p.documents.length,
      evaluationOnly: p.evaluationOnly,
    })),
  };
  writeFileSync(path.join(outDir, "inventory-status.json"), JSON.stringify(json, null, 2) + "\n");
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
