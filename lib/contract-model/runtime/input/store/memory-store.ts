/**
 * NS-4 slice 1 — in-memory append-only approved snapshot store.
 *
 * Public façade exposes only validated write/read APIs. The unvalidated
 * event-log `commit` lives on a private composed backend and is never
 * reachable from the public surface. Public event/history reads return
 * deep-frozen copies so callers cannot mutate or delete prior appends.
 */
import type { FinancialSnapshot } from "../types";
import type { AppendSnapshotRequest, ApprovalTransition, StoreEvent, WriteResult } from "./types";
import {
  appendSnapshot as appendSnapshotWrite,
  approveSnapshot as approveSnapshotWrite,
  cloneStoreEvent,
  freezeSnapshot,
  freezeStoreEvent,
  getSnapshot as getSnapshotWrite,
  getSnapshots as getSnapshotsWrite,
  publicEventLog,
  type SnapshotStoreBackend,
} from "./write";

/** Private append-only log — not exported; holds the only `commit`. */
class PrivateEventLog implements SnapshotStoreBackend {
  private readonly _events: StoreEvent[] = [];

  get events(): readonly StoreEvent[] {
    return this._events;
  }

  commit(events: StoreEvent[]): void {
    // Append-only: clone each event so caller-held refs cannot rewrite the log.
    for (const e of events) this._events.push(cloneStoreEvent(e));
  }

  get length(): number {
    return this._events.length;
  }
}

function sealWriteResult(result: WriteResult): WriteResult {
  if (!result.ok) return result;
  return {
    ok: true,
    snapshot: freezeSnapshot(result.snapshot),
    events: Object.freeze(result.events.map((e) => freezeStoreEvent(e))) as StoreEvent[],
  };
}

/**
 * Validated public store. Does **not** implement SnapshotStoreBackend and does
 * **not** expose `commit` — APPROVED and unsafe-graph rows can only enter via
 * `appendSnapshot` / `approveSnapshot` (which reuse `buildSnapshotGraph`).
 */
export class InMemoryApprovedSnapshotStore {
  readonly #log = new PrivateEventLog();

  /** Deep-frozen copy of the event log — `pop` / mutate does not affect the store. */
  get events(): readonly StoreEvent[] {
    return publicEventLog(this.#log.events);
  }

  /** Append DRAFT | REVIEW_REQUIRED only (nine-code graph check at write). */
  appendSnapshot(request: AppendSnapshotRequest): WriteResult {
    return sealWriteResult(appendSnapshotWrite(this.#log, request));
  }

  /** Attributable DRAFT | REVIEW_REQUIRED → APPROVED. */
  approveSnapshot(approval: ApprovalTransition): WriteResult {
    return sealWriteResult(approveSnapshotWrite(this.#log, approval));
  }

  getSnapshots(companyId: string): FinancialSnapshot[] {
    return Object.freeze(
      getSnapshotsWrite(this.#log, companyId).map((s) => freezeSnapshot(s)),
    ) as FinancialSnapshot[];
  }

  getSnapshot(snapshotId: string): FinancialSnapshot | null {
    const s = getSnapshotWrite(this.#log, snapshotId);
    return s ? freezeSnapshot(s) : null;
  }

  /** Test/inspection helper: full event log length (append-only growth). */
  eventCount(): number {
    return this.#log.length;
  }
}
