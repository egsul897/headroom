/**
 * Acquire up to N public financing agreements via existing EdgarConnector.
 * Run: npx tsx scripts/rare-covenant-drafting-discovery-acquire.ts [target]
 */
import { acquireAgreementsViaEdgarConnector } from "../lib/drafting-novelty/acquire";

async function main(): Promise<void> {
  const target = Number(process.argv[2] ?? "100");
  const r = await acquireAgreementsViaEdgarConnector({
    targetCount: target,
    delayMs: 900,
    maxPerTicker: 1,
    filingsPerTicker: 8,
  });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        acquired: r.manifests.length,
        issuers: new Set(r.manifests.map((m) => m.issuerCik)).size,
        errors: r.errors.length,
        sampleErrors: r.errors.slice(0, 10),
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
