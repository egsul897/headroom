/**
 * Versioned manifests + checksums for resumability / replay safety.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeJson } from "./checkpoint";

export interface ArtifactChecksum {
  path: string;
  sha256: string;
  bytes: number;
}

export interface RunIntegrityManifest {
  version: 1;
  runDir: string;
  generatedAt: string;
  storageStatus: "EPHEMERAL_WORKSPACE" | "COMMITTED_DOCS_SUMMARY";
  artifacts: ArtifactChecksum[];
  queueSha256?: string;
  checkpointSha256?: string;
  notes: string[];
}

function fileChecksum(absPath: string, relPath: string): ArtifactChecksum {
  const buf = readFileSync(absPath);
  return {
    path: relPath,
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.length,
  };
}

export function buildRunIntegrityManifest(runDir: string): RunIntegrityManifest {
  const artifacts: ArtifactChecksum[] = [];
  const candidates = ["checkpoint.json", "coverage.json", "acquisition-queue.json", "duplicate-report.json"];
  for (const name of candidates) {
    const abs = join(runDir, name);
    if (existsSync(abs)) artifacts.push(fileChecksum(abs, name));
  }
  const manifestsDir = join(runDir, "manifests");
  if (existsSync(manifestsDir)) {
    for (const name of readdirSync(manifestsDir).sort()) {
      if (!name.endsWith(".json")) continue;
      artifacts.push(fileChecksum(join(manifestsDir, name), `manifests/${name}`));
    }
  }
  const queue = artifacts.find((a) => a.path === "acquisition-queue.json");
  const checkpoint = artifacts.find((a) => a.path === "checkpoint.json");
  return {
    version: 1,
    runDir,
    generatedAt: new Date().toISOString(),
    storageStatus: "EPHEMERAL_WORKSPACE",
    artifacts,
    queueSha256: queue?.sha256,
    checkpointSha256: checkpoint?.sha256,
    notes: [
      "Checksums enable idempotent queue regeneration checks and resume verification.",
      "This integrity file itself is workspace-local unless copied into docs/.",
    ],
  };
}

export function writeRunIntegrityManifest(runDir: string): RunIntegrityManifest {
  const manifest = buildRunIntegrityManifest(runDir);
  writeJson(join(runDir, "integrity.json"), manifest);
  return manifest;
}

/** Idempotent queue regeneration: same exhibits → same queueId set. */
export function queueIdSet(queuePath: string): string[] {
  if (!existsSync(queuePath)) return [];
  const items = JSON.parse(readFileSync(queuePath, "utf8")) as Array<{ queueId: string }>;
  return items.map((i) => i.queueId).sort();
}
