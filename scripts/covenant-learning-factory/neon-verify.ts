/**
 * Print row counts per learning_* table over Neon HTTPS.
 * Never prints connection strings.
 *
 *   NEON_TRANSPORT=https npm run clf:neon-verify
 */

import { countLearningTables } from "../../lib/covenant-learning-factory/store/neon-migration-apply";
import {
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "../../lib/covenant-learning-factory/store/neon-transport";
import { probeNeonLive } from "../../lib/covenant-learning-factory/store/neon-store";

async function main(): Promise<void> {
  if (getNeonTransportMode() !== "https") {
    console.error(
      JSON.stringify({
        ok: false,
        detail: "Set NEON_TRANSPORT=https for clf:neon-verify",
      }),
    );
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, detail: "DATABASE_URL unset" }));
    process.exit(2);
  }

  try {
    const probe = await probeNeonLive();
    const executor = await createNeonHttpsExecutor(process.env.DATABASE_URL);
    const counts = await countLearningTables(executor);
    const payload = {
      ok: probe.live,
      transport: "https",
      probeClass: probe.class,
      probeDetail: redactConnectionSecrets(probe.detail),
      learningTableCounts: counts,
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(payload, null, 2));
    if (!probe.live) process.exit(1);
  } catch (err) {
    const detail = redactConnectionSecrets(
      err instanceof Error ? err.message : String(err),
    );
    console.error(JSON.stringify({ ok: false, detail: detail.slice(0, 500) }));
    process.exit(1);
  }
}

main();
