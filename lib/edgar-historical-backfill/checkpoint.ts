/**
 * Durable resume checkpoints — JSON files under the run directory.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CheckpointState, HISTORICAL_BACKFILL_CONTRACT_VERSION } from "./types";
import { HISTORICAL_BACKFILL_CONTRACT_VERSION as VERSION } from "./types";

export function newCheckpoint(params: {
  runId: string;
  scale: CheckpointState["scale"];
  issuers: CheckpointState["issuers"];
}): CheckpointState {
  const now = new Date().toISOString();
  return {
    version: VERSION,
    runId: params.runId,
    scale: params.scale,
    createdAt: now,
    updatedAt: now,
    issuerCursor: 0,
    issuers: params.issuers,
    completedCiks: [],
    failedCiks: [],
    stats: {
      filingsScanned: 0,
      indexesFetched: 0,
      exhibitsDiscovered: 0,
      queuedForAcquisition: 0,
      duplicatesCollapsed: 0,
      ibrResolved: 0,
      ibrUnresolved: 0,
      secRequests: 0,
    },
  };
}

export function checkpointPath(runDir: string): string {
  return join(runDir, "checkpoint.json");
}

export function loadCheckpoint(path: string): CheckpointState | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as CheckpointState;
  if (raw.version !== VERSION) {
    throw new Error(`Checkpoint version mismatch: got ${raw.version}, expected ${VERSION}`);
  }
  return raw;
}

/** Atomic-ish write: temp file + rename. */
export function saveCheckpoint(path: string, state: CheckpointState): void {
  mkdirSync(dirname(path), { recursive: true });
  const next: CheckpointState = { ...state, updatedAt: new Date().toISOString() };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, path);
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// Re-export for callers that type against the const.
export type { HISTORICAL_BACKFILL_CONTRACT_VERSION };
