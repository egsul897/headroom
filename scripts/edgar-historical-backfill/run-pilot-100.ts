#!/usr/bin/env npx tsx
/**
 * 100-issuer pilot entrypoint (metadata-first historical discovery).
 *
 * Requires SEC identity + fetch owner (see run-discovery.ts header).
 *
 *   export SEC_EDGAR_CONTACT_EMAIL='authorized@domain'
 *   export HEADROOM_SEC_FETCH_OWNER=WS-EHB
 *   npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts
 *   npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts --resume
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const resume = process.argv.includes("--resume");
const runDir = join("data", "edgar-historical-backfill", "pilot-100-v2");
const script = join(__dirname, "run-discovery.ts");
const args = [
  script,
  "--scale",
  "pilot-100",
  "--max-indexes",
  "8",
  "--run-dir",
  runDir,
  ...(resume ? ["--resume"] : []),
];
const r = spawnSync("npx", ["tsx", ...args], { stdio: "inherit", cwd: join(__dirname, "..", ".."), env: process.env });
process.exit(r.status ?? 1);
