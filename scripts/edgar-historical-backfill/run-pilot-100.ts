#!/usr/bin/env npx tsx
/**
 * 100-issuer pilot entrypoint (metadata-first historical discovery).
 *
 *   npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts
 *   npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts --resume
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const resume = process.argv.includes("--resume");
const script = join(__dirname, "run-discovery.ts");
const args = [script, "--scale", "pilot-100", "--max-indexes", "6", ...(resume ? ["--resume"] : [])];
const r = spawnSync("npx", ["tsx", ...args], { stdio: "inherit", cwd: join(__dirname, "..", "..") });
process.exit(r.status ?? 1);
