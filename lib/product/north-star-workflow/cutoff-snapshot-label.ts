/**
 * Rule 76 — the cutoff-bound snapshot is not necessarily APPROVED.
 *
 * resolveAuthoritativeCutoff binds to the delivered snapshot for
 * the period, and the eligible pool is APPROVED ∪ SUPERSEDED
 * (historical superseded certificates remain attributable after
 * restatement). loadAuthoritativeCapacity surfaced that bound id
 * as `cutoff.approvedSnapshotId`, and the capacity page displayed
 * it under "Certified path uses APPROVED NS-4 snapshots" — so a
 * SUPERSEDED snapshot was presented as the approved cutoff
 * snapshot. The label now distinguishes the two.
 *
 * Prisma-free: pure function over ids, so it is unit-testable
 * without a generated Prisma client.
 */
export type CutoffSnapshotStatus = "APPROVED" | "SUPERSEDED" | null;

export interface CutoffSnapshotLabel {
  /** Bound snapshot id, only when it is actually APPROVED. */
  approvedSnapshotId: string | null;
  /** Raw cutoff-bound snapshot id (APPROVED or SUPERSEDED). */
  cutoffSnapshotId: string | null;
  cutoffSnapshotStatus: CutoffSnapshotStatus;
}

export function labelCutoffSnapshot(
  boundId: string | null,
  approvedIds: readonly string[],
): CutoffSnapshotLabel {
  if (!boundId) {
    return { approvedSnapshotId: null, cutoffSnapshotId: null, cutoffSnapshotStatus: null };
  }
  // Cutoff binds only to the eligible pool (APPROVED ∪ SUPERSEDED);
  // a bound id absent from APPROVED must be SUPERSEDED.
  const isApproved = approvedIds.includes(boundId);
  return {
    approvedSnapshotId: isApproved ? boundId : null,
    cutoffSnapshotId: boundId,
    cutoffSnapshotStatus: isApproved ? "APPROVED" : "SUPERSEDED",
  };
}
