/** vitest globalSetup (gate only): clone the seeded template into one database per worker. */
import { createWorkerDatabases, dropWorkerDatabases } from "./pg-workers.mjs";

export default async function setup() {
  const templateUrl = process.env.HEADROOM_TEST_PG_TEMPLATE_URL?.trim();
  if (!templateUrl) return undefined;
  const workers = Number(process.env.HEADROOM_TEST_PG_WORKERS ?? "0");
  if (!Number.isInteger(workers) || workers < 1) throw new Error("HEADROOM_TEST_PG_WORKERS must be the vitest --maxWorkers value (>= 1)");
  const names = await createWorkerDatabases(templateUrl, workers);
  console.log(`pg-workers: created ${names.length} worker databases from the seeded template`);
  return async () => {
    if (process.env.HEADROOM_TEST_PG_KEEP === "1") return;
    await dropWorkerDatabases(templateUrl, names);
  };
}
