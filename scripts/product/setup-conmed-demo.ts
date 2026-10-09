/**
 * Idempotent CONMED demo setup.
 *
 *   npm run product:setup-conmed-demo
 *   HEADROOM_DEMO_LIVE_WRITE=I_AUTHORIZE_CONMED_DEMO_SETUP npm run product:setup-conmed-demo -- --live
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEMO_LIVE_WRITE_ENV,
  DEMO_LIVE_WRITE_TOKEN,
  setupConmedDemo,
} from "../../lib/product/conmed-demo/setup";
import { listConmedCovenantExplorerRows } from "../../lib/product/conmed-demo/covenant-catalog";
import { CONMED_DEMO_DOCUMENTS } from "../../lib/product/conmed-demo/package";

async function main() {
  const live = process.argv.includes("--live");
  if (live && process.env[DEMO_LIVE_WRITE_ENV] !== DEMO_LIVE_WRITE_TOKEN) {
    console.error(
      JSON.stringify(
        {
          refused: true,
          reason: `Set ${DEMO_LIVE_WRITE_ENV}=${DEMO_LIVE_WRITE_TOKEN} after explicit approval`,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const result = await setupConmedDemo({ live });
  const covenants = listConmedCovenantExplorerRows();
  const outDir = "docs/product/conmed-demo";
  mkdirSync(outDir, { recursive: true });
  const report = {
    ...result,
    packageDocuments: CONMED_DEMO_DOCUMENTS.length,
    covenantExplorerRows: covenants.length,
    approvalCheckpoint: live
      ? "LIVE_WRITE_EXECUTED"
      : "AWAITING_HEADROOM_DEMO_LIVE_WRITE_AUTHORIZATION",
  };
  writeFileSync(path.join(outDir, "setup-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (result.documents.some((d) => d.action === "skipped-missing-bytes")) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
