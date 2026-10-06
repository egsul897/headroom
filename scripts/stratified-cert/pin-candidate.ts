#!/usr/bin/env tsx
/**
 * Offline stratified-cert pinCandidate CLI.
 * Soft gate: sealed discovery only. Refuses --live / paid / provider paths.
 *
 *   pnpm exec tsx scripts/stratified-cert/pin-candidate.ts \
 *     --package chwy-2026-credit-agreement \
 *     --discoveryId discovery-candidate:cf3d8d9492aeca04392b5172 \
 *     --asOf 2026-10-06 \
 *     --out docs/phase-3-reliability-stratified-certification/pins/.../v1
 */
import { execSync } from "node:child_process";
import { pinCandidate } from "./lib/emit-pin-packet";
import type { PackageKey } from "./lib/package-registry";

function usage(): never {
  console.error(`Usage: tsx scripts/stratified-cert/pin-candidate.ts \\
  --package <chwy-2026-credit-agreement|conmed-2025-credit-facility> \\
  --discoveryId <discovery-candidate:...> \\
  --asOf <YYYY-MM-DD> \\
  [--out <dir>] [--headSha <sha>] [--startedAt <ISO>]`);
  process.exit(2);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function resolveHeadSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function main(): void {
  if (hasFlag("--live") || hasFlag("--paid") || hasFlag("--provider")) {
    console.error("refusing --live/--paid/--provider: offline pin emitter only (soft gate)");
    process.exit(1);
  }
  if (hasFlag("--help") || hasFlag("-h")) usage();

  const packageKey = arg("--package") as PackageKey | undefined;
  const discoveryId = arg("--discoveryId");
  const asOfDate = arg("--asOf");
  if (!packageKey || !discoveryId || !asOfDate) usage();
  if (packageKey !== "chwy-2026-credit-agreement" && packageKey !== "conmed-2025-credit-facility") {
    console.error(`unsupported --package: ${packageKey}`);
    process.exit(1);
  }

  const result = pinCandidate({
    packageKey,
    discoveryId,
    asOfDate,
    headSha: arg("--headSha") ?? resolveHeadSha(),
    outDir: arg("--out"),
    startedAt: arg("--startedAt"),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: result.outDir,
        files: result.files,
        eligible: result.eligible,
        stratum: result.stratum,
        crossCuts: result.crossCuts,
        operativeSourceSha256: result.operativeSourceSha256,
        operativeSourceChars: result.operativeSourceChars,
        note: "Offline pin only. No credential loaded. No provider contacted.",
      },
      null,
      2,
    ),
  );
  if (!result.eligible) process.exit(3);
}

main();
