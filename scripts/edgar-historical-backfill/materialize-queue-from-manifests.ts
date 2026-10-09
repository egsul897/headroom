/**
 * Build acquisition-queue.json from existing issuer manifests (no SEC calls).
 * Used to consume mid-run scale discovery without inventing a new crawler.
 *
 *   npx tsx scripts/edgar-historical-backfill/materialize-queue-from-manifests.ts \
 *     --run-dir data/edgar-historical-backfill/scale-1000
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildAcquisitionQueue } from "../../lib/edgar-historical-backfill/ranking";
import { validateAcquisitionQueue } from "../../lib/edgar-historical-backfill/queue-validate";
import { writeJson } from "../../lib/edgar-historical-backfill/checkpoint";
import { toCkfHandoffPackage } from "../../lib/edgar-historical-backfill/ckf-handoff";
import type { ExhibitRef, IssuerManifest, IssuerRef } from "../../lib/edgar-historical-backfill/types";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function main(): void {
  const runDir = arg("run-dir");
  if (!runDir || !existsSync(runDir)) {
    console.error("Provide --run-dir pointing at an EHB run with manifests/");
    process.exit(1);
  }
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const manifestsDir = join(runDir, "manifests");
  const files = readdirSync(manifestsDir).filter(
    (n) => n.endsWith(".json") && !n.includes("dup"),
  );
  const allExhibits: ExhibitRef[] = [];
  const issuersByCik = new Map<string, IssuerRef>();
  for (const f of files) {
    const m = JSON.parse(readFileSync(join(manifestsDir, f), "utf8")) as IssuerManifest;
    issuersByCik.set(m.issuer.cik, m.issuer);
    allExhibits.push(...m.exhibits);
  }
  const queue = buildAcquisitionQueue({ exhibits: allExhibits, issuersByCik, limit });
  const validation = validateAcquisitionQueue(queue);
  const validQueue = queue.filter((item) => item.validation?.ok !== false);
  writeJson(join(runDir, "acquisition-queue.json"), validQueue);
  writeJson(join(runDir, "queue-validation.json"), validation);
  writeJson(
    join(runDir, "ckf-handoff.json"),
    toCkfHandoffPackage(validQueue, { storageStatus: "EPHEMERAL_WORKSPACE" }),
  );
  console.log(
    JSON.stringify(
      {
        runDir,
        manifests: files.length,
        exhibits: allExhibits.length,
        queuedRaw: queue.length,
        queuedValid: validQueue.length,
        droppedInvalid: queue.length - validQueue.length,
        okCount: validation.okCount,
        errorCount: validation.errorCount,
      },
      null,
      2,
    ),
  );
}

main();
