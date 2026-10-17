/**
 * Probe Neon with the configured DATABASE_URL and write a status artifact.
 * Does not print secrets. Exit 0 even when blocked (status is the deliverable).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { probeNeonLive } from "../../lib/covenant-learning-factory/store/neon-store";

async function main(): Promise<void> {
  const probe = await probeNeonLive();
  const outDir = path.join(process.cwd(), "docs/covenant-learning-factory");
  await mkdir(outDir, { recursive: true });

  const status = {
    schemaVersion: "covenant-learning-factory.neon-connect.v1",
    generatedAt: new Date().toISOString(),
    live: probe.live,
    class: probe.class,
    detail: probe.detail,
    originalHost: probe.originalHost ?? null,
    ipv4: probe.ipv4 ?? null,
    migrationReady: "prisma/migrations/20261013180000_covenant_learning_factory/",
    nextWhenLive: [
      "npx prisma migrate deploy",
      "npm run clf:batch -- --persist-neon --max=2",
      "npm run clf:dashboard",
    ],
    secretRefreshRequired: probe.class === "auth_failed" || probe.class === "unset",
  };

  const outPath = path.join(outDir, "neon-connect-status.json");
  await writeFile(outPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(status, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
