/**
 * Import mass-precedent bytes + export/v1 shards over Neon HTTPS.
 * Dry-run by default.
 *
 *   NEON_TRANSPORT=https npm run neon:https-precedent-import
 *   NEON_TRANSPORT=https KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
 *     npm run neon:https-precedent-import
 */

import {
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "../../lib/covenant-learning-factory/store/neon-transport";
import {
  importPrecedentsOverHttps,
  isLiveAuthorized,
  MASS_LIVE_ENV,
  MASS_LIVE_TOKEN,
} from "../../lib/neon-https/precedent-import";

function argNum(name: string): number | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return undefined;
  const n = Number(hit.slice(name.length + 1));
  return Number.isFinite(n) ? n : undefined;
}

async function main(): Promise<void> {
  if (getNeonTransportMode() !== "https") {
    console.error(
      JSON.stringify({
        ok: false,
        detail: "Set NEON_TRANSPORT=https for neon:https-precedent-import",
      }),
    );
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, detail: "DATABASE_URL unset" }));
    process.exit(2);
  }

  const liveFlag = process.argv.includes("--live") || isLiveAuthorized();
  if (liveFlag && !isLiveAuthorized()) {
    console.error(
      JSON.stringify({
        ok: false,
        detail: `Live refused: set ${MASS_LIVE_ENV}=${MASS_LIVE_TOKEN}`,
      }),
    );
    process.exit(2);
  }

  try {
    const executor = await createNeonHttpsExecutor(process.env.DATABASE_URL);
    const result = await importPrecedentsOverHttps(executor, {
      live: liveFlag,
      batchSize: argNum("--batch-size") ?? 100,
      limitBytes: argNum("--limit-bytes"),
      limitExportRows: argNum("--limit-export-rows"),
      skipBytes: process.argv.includes("--skip-bytes"),
      skipExport: process.argv.includes("--skip-export"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok && result.live) process.exit(1);
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        detail: redactConnectionSecrets(
          err instanceof Error ? err.message : String(err),
        ).slice(0, 500),
      }),
    );
    process.exit(1);
  }
}

main();
