/**
 * Rebuild dashboard from on-disk package manifests.
 *
 *   npx tsx scripts/covenant-learning-factory/dashboard.ts
 */
import path from "node:path";
import {
  LearningFileStore,
  buildDashboardReport,
  probeNeonLive,
} from "../../lib/covenant-learning-factory";

async function main() {
  const store = new LearningFileStore();
  const neon = await probeNeonLive();
  const report = buildDashboardReport({
    manifests: store.listPackageManifests(),
    neonLive: neon.live,
  });
  const docsPath = path.join(process.cwd(), "docs/covenant-learning-factory/dashboard.json");
  store.writeDashboard(report, docsPath);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
