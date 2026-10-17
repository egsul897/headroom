/**
 * Rule 76 — the cutoff-bound snapshot is not necessarily APPROVED.
 *
 * resolveAuthoritativeCutoff binds to the delivered snapshot for
 * the period, and the eligible pool is APPROVED ∪ SUPERSEDED.
 * loadAuthoritativeCapacity surfaced that bound id as
 * cutoff.approvedSnapshotId, and the capacity page displayed it
 * under "Certified path uses APPROVED NS-4 snapshots" — so a
 * SUPERSEDED snapshot was presented as the approved cutoff
 * snapshot. approvedSnapshotId is now null unless the bound
 * snapshot is actually APPROVED; cutoffSnapshotId/Status carry
 * the honest bound identity.
 */
import { describe, expect, it } from "vitest";
import { labelCutoffSnapshot } from "../../lib/product/north-star-workflow/cutoff-snapshot-label";

describe("labelCutoffSnapshot", () => {
  it("labels an APPROVED bound snapshot as approved", () => {
    expect(labelCutoffSnapshot("snap-1", ["snap-1", "snap-2"])).toEqual({
      approvedSnapshotId: "snap-1",
      cutoffSnapshotId: "snap-1",
      cutoffSnapshotStatus: "APPROVED",
    });
  });

  it("never labels a SUPERSEDED bound snapshot as approved", () => {
    expect(labelCutoffSnapshot("snap-old", ["snap-1", "snap-2"])).toEqual({
      approvedSnapshotId: null,
      cutoffSnapshotId: "snap-old",
      cutoffSnapshotStatus: "SUPERSEDED",
    });
  });

  it("returns nulls when no snapshot is bound", () => {
    expect(labelCutoffSnapshot(null, ["snap-1"])).toEqual({
      approvedSnapshotId: null,
      cutoffSnapshotId: null,
      cutoffSnapshotStatus: null,
    });
  });
});
