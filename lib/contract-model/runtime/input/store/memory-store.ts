/**
 * NS-4 slice 1 — in-memory append-only approved snapshot store.
 *
 * Primary implementation for tests; API is durable-shaped (event log + materialization)
 * so a Prisma-backed store can share the same write helpers later.
 */
import type { FinancialSnapshot } from "../types";
import type { AppendSnapshotRequest, ApprovalTransition, StoreEvent, WriteResult } from "./types";
import {
  appendSnapshot as appendSnapshotWrite,
  approveSnapshot as approveSnapshotWrite,
  getSnapshot as getSnapshotWrite,
  getSnapshots as getSnapshotsWrite,
  type SnapshotStoreBackend,
} from "./write";

export class InMemoryApprovedSnapshotStore implements SnapshotStoreBackend {
  private readonly _events: StoreEvent[] = [];

  get events(): readonly StoreEvent[] {
    return this._events;
  }

  commit(events: StoreEvent[]): void {
    // Append only — never splice, rewrite, or delete prior events.
    for (const e of events) this._events.push(e);
  }

  /** Append DRAFT | REVIEW_REQUIRED only. */
  appendSnapshot(request: AppendSnapshotRequest): WriteResult {
    return appendSnapshotWrite(this, request);
  }

  /** Attributable DRAFT | REVIEW_REQUIRED → APPROVED. */
  approveSnapshot(approval: ApprovalTransition): WriteResult {
    return approveSnapshotWrite(this, approval);
  }

  getSnapshots(companyId: string): FinancialSnapshot[] {
    return getSnapshotsWrite(this, companyId);
  }

  getSnapshot(snapshotId: string): FinancialSnapshot | null {
    return getSnapshotWrite(this, snapshotId);
  }

  /** Test/inspection helper: full event log length (append-only growth). */
  eventCount(): number {
    return this._events.length;
  }
}
