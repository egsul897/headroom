#!/usr/bin/env tsx
/**
 * npm run flywheel:slice — local/ops runner for one bounded flywheel slice.
 * Same code path as /api/flywheel/cron (Neon HTTPS, lock, Neon rulesets).
 */

import {
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "../../lib/covenant-learning-factory/store/neon-transport";
import { runFlywheelSlice } from "../../lib/flywheel/slice-runner";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL unset");
    process.exit(2);
  }
  if (!process.env.NEON_TRANSPORT) process.env.NEON_TRANSPORT = "https";

  const forced = process.argv.find((a) => a.startsWith("--slice="))?.slice("--slice=".length);

  try {
    const executor = await createNeonHttpsExecutor(url);
    const result = await runFlywheelSlice({ executor, slice: forced });
    console.log(
      JSON.stringify(
        {
          event: "flywheel.slice",
          transport: getNeonTransportMode(),
          result,
        },
        null,
        2,
      ),
    );
    if (result.status === "FAILED") process.exit(1);
  } catch (err) {
    console.error(
      "flywheel:slice failed:",
      redactConnectionSecrets(err instanceof Error ? err.message : String(err)),
    );
    process.exit(1);
  }
}

main();
