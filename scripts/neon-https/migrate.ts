/**
 * Apply ALL prisma/migrations over Neon HTTPS (idempotent).
 *
 *   NEON_TRANSPORT=https npm run neon:https-migrate
 */

import {
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "../../lib/covenant-learning-factory/store/neon-transport";
import { applyAllPrismaMigrationsOverHttps } from "../../lib/neon-https/migrate-all";

async function main(): Promise<void> {
  if (getNeonTransportMode() !== "https") {
    console.error(
      JSON.stringify({
        ok: false,
        detail: "Set NEON_TRANSPORT=https for neon:https-migrate",
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
    const result = await applyAllPrismaMigrationsOverHttps(executor);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
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
