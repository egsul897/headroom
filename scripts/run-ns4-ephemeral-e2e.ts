/**
 * Run NS-4 capacity/simulation/acquisition e2e suites against an isolated
 * ephemeral Postgres database (headroom_test_*). Product prisma singleton
 * binds DATABASE_URL at import — child process is required.
 *
 * Usage (local Postgres admin URL, never Neon production):
 *   DATABASE_URL=postgresql://headroom:headroom@localhost:5432/headroom \
 *     npx tsx scripts/run-ns4-ephemeral-e2e.ts
 *
 * Refuses Neon/RDS hosts. Exit code mirrors vitest.
 */
import { spawnSync } from "node:child_process";
import {
  createEphemeralDatabase,
  destroyEphemeralDatabase,
} from "../lib/testing/ephemeral-db";

async function main() {
  const BASE = process.env.DATABASE_URL ?? "";
  if (!BASE) {
    console.error("DATABASE_URL required (local Postgres admin URL).");
    process.exit(2);
  }
  if (/neon\.tech|amazonaws\.com|supabase\.co/i.test(BASE)) {
    console.error("Refusing ephemeral e2e against Neon/RDS production hosts.");
    process.exit(2);
  }

  const suites = [
    "tests/product/ns4-approved-capacity-simulation.e2e.test.ts",
    "tests/product/ns4-secured-acquisition-scenario.e2e.test.ts",
    "tests/product/ns4-vertical-slice-fce-dashboard.test.tsx",
  ];

  const ephemeral = await createEphemeralDatabase(BASE);
  console.log(JSON.stringify({ ephemeralDatabase: ephemeral.name, suites }, null, 2));

  try {
    const result = spawnSync("npx", ["vitest", "run", ...suites], {
      env: { ...process.env, DATABASE_URL: ephemeral.databaseUrl },
      stdio: "inherit",
      cwd: process.cwd(),
    });
    const code = result.status ?? 1;
    await destroyEphemeralDatabase(ephemeral);
    process.exit(code);
  } catch (e) {
    try {
      await destroyEphemeralDatabase(ephemeral);
    } catch {
      /* ignore */
    }
    console.error(e);
    process.exit(1);
  }
}

main();
