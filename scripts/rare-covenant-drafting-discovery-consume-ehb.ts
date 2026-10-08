/**
 * Consume WS-EHB acquisition queue → local extracted text + manifests.
 * Run: npx tsx scripts/rare-covenant-drafting-discovery-consume-ehb.ts <queue.json> [target]
 */
import { consumeEhbAcquisitionQueue, loadExistingAcquired } from "../lib/drafting-novelty/consume-ehb-queue";

async function main(): Promise<void> {
  const queuePath = process.argv[2];
  if (!queuePath) throw new Error("Usage: consume-ehb.ts <queue.json> [target]");
  const target = Number(process.argv[3] ?? "100");
  const existing = loadExistingAcquired();
  const r = await consumeEhbAcquisitionQueue({ queuePath, targetCount: target, existing, delayMs: 900 });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        acquired: r.manifests.length,
        issuers: new Set(r.manifests.map((m) => m.issuerCik)).size,
        errors: r.errors.length,
        sampleErrors: r.errors.slice(0, 15),
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
