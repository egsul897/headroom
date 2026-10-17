/**
 * Fail-closed distributed lock in Neon (no overlapping flywheel runs).
 */

import { randomUUID } from "node:crypto";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import { FLYWHEEL_LOCK_NAME } from "./types";

export interface LockHandle {
  lockName: string;
  holderId: string;
  expiresAt: Date;
}

export async function tryAcquireFlywheelLock(
  executor: NeonHttpsExecutor,
  opts?: { ttlMs?: number; holderId?: string; now?: Date },
): Promise<LockHandle | null> {
  const now = opts?.now ?? new Date();
  const ttlMs = opts?.ttlMs ?? 4 * 60 * 1000; // under typical Vercel hobby/pro limits
  const expiresAt = new Date(now.getTime() + ttlMs);
  const holderId = opts?.holderId ?? randomUUID();

  // Clear expired lock first (idempotent).
  await executor.execute(
    `DELETE FROM flywheel_locks WHERE "lockName" = $1 AND "expiresAt" < $2`,
    [FLYWHEEL_LOCK_NAME, now],
  );

  try {
    await executor.execute(
      `INSERT INTO flywheel_locks ("lockName", "holderId", "acquiredAt", "expiresAt", "heartbeatAt", "metaJson")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        FLYWHEEL_LOCK_NAME,
        holderId,
        now,
        expiresAt,
        now,
        JSON.stringify({ authorityStatus: "COMPUTED_NOT_CERTIFIED" }),
      ],
    );
    return { lockName: FLYWHEEL_LOCK_NAME, holderId, expiresAt };
  } catch {
    return null;
  }
}

export async function releaseFlywheelLock(
  executor: NeonHttpsExecutor,
  handle: LockHandle,
): Promise<void> {
  await executor.execute(
    `DELETE FROM flywheel_locks WHERE "lockName" = $1 AND "holderId" = $2`,
    [handle.lockName, handle.holderId],
  );
}

export async function readFlywheelLock(
  executor: NeonHttpsExecutor,
): Promise<{ held: boolean; holderId: string | null; expiresAt: string | null }> {
  const rows = await executor.execute(
    `SELECT "holderId", "expiresAt" FROM flywheel_locks WHERE "lockName" = $1 LIMIT 1`,
    [FLYWHEEL_LOCK_NAME],
  );
  const row = rows[0];
  if (!row) return { held: false, holderId: null, expiresAt: null };
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt ?? "");
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return { held: false, holderId: null, expiresAt: null };
  }
  return {
    held: true,
    holderId: typeof row.holderId === "string" ? row.holderId : String(row.holderId ?? ""),
    expiresAt: expiresAt || null,
  };
}
