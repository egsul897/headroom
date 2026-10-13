/**
 * Apply ONLY the additive CLF migration over Neon HTTPS (NEON_TRANSPORT=https).
 * Idempotent. Refuses DROP/TRUNCATE/DELETE. Never prints connection strings.
 *
 *   NEON_TRANSPORT=https npm run clf:neon-apply
 */

import { applyClfMigrationOverHttps } from "../../lib/covenant-learning-factory/store/neon-migration-apply";
import {
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "../../lib/covenant-learning-factory/store/neon-transport";

async function main(): Promise<void> {
  if (getNeonTransportMode() !== "https") {
    console.error(
      JSON.stringify({
        ok: false,
        detail: "Refuse TCP apply path: set NEON_TRANSPORT=https for clf:neon-apply",
      }),
    );
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, detail: "DATABASE_URL unset" }));
    process.exit(2);
  }

  try {
    const executor = await createNeonHttpsExecutor(process.env.DATABASE_URL);
    const result = await applyClfMigrationOverHttps(executor);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } catch (err) {
    const detail = redactConnectionSecrets(
      err instanceof Error ? err.message : String(err),
    );
    console.error(JSON.stringify({ ok: false, detail: detail.slice(0, 500) }));
    process.exit(1);
  }
}

main();
