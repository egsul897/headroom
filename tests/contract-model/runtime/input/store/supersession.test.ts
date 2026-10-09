/**
 * NS-4 slice 1 — explicit supersession / restatement.
 * Proposing a restatement DRAFT must not invalidate an APPROVED predecessor;
 * SNAPSHOT_SUPERSEDED is emitted only when the successor is attributable-approved.
 */
import { describe, expect, it } from "vitest";
import { InMemoryApprovedSnapshotStore } from "@/lib/contract-model/runtime/input/store";
import type { FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { CO_A, identity, input, money, snapshot } from "../helpers";

function draft(over: Partial<FinancialSnapshot> & { snapshotId: string }): FinancialSnapshot {
  return snapshot({
    status: "DRAFT",
    review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
    inputs: [input({ identity: identity({ key: "metric-restatement" }), value: money("100") })],
    ...over,
  });
}

describe("explicit supersession", () => {
  it("proposing a restatement DRAFT keeps the APPROVED predecessor authoritative", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "old" }) });
    store.approveSnapshot({
      snapshotId: "old",
      reviewedBy: "rev",
      reviewedAt: "2026-09-01T00:00:00Z",
      approvalRef: "apr-old",
    });
    expect(store.getSnapshot("old")!.status).toBe("APPROVED");

    const r = store.appendSnapshot({
      snapshot: draft({
        snapshotId: "new",
        supersedesSnapshotId: "old",
        inputs: [input({ identity: identity({ key: "metric-restatement" }), value: money("110") })],
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events.some((e) => e.type === "SNAPSHOT_SUPERSEDED")).toBe(false);
      expect(r.snapshot.supersedesSnapshotId).toBe("old");
    }
    expect(store.getSnapshot("old")!.status).toBe("APPROVED");
    expect(store.getSnapshot("new")!.status).toBe("DRAFT");
    expect(store.getSnapshot("new")!.supersedesSnapshotId).toBe("old");
  });

  it("approving the restatement emits SNAPSHOT_SUPERSEDED and preserves predecessor bytes", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "v1" }) });
    store.approveSnapshot({
      snapshotId: "v1",
      reviewedBy: "rev",
      reviewedAt: "2026-09-01T00:00:00Z",
      approvalRef: "a1",
    });
    store.appendSnapshot({
      snapshot: draft({
        snapshotId: "v2",
        supersedesSnapshotId: "v1",
        version: "2",
        inputs: [input({ identity: identity({ key: "metric-restatement" }), value: money("200") })],
      }),
    });
    expect(store.getSnapshot("v1")!.status).toBe("APPROVED");

    const apr = store.approveSnapshot({
      snapshotId: "v2",
      reviewedBy: "rev",
      reviewedAt: "2026-10-01T00:00:00Z",
      approvalRef: "a2",
    });
    expect(apr.ok).toBe(true);
    if (apr.ok) {
      expect(apr.events.some((e) => e.type === "SNAPSHOT_APPROVED" && e.snapshotId === "v2")).toBe(true);
      expect(apr.events.some((e) => e.type === "SNAPSHOT_SUPERSEDED" && e.snapshotId === "v1")).toBe(true);
    }

    const all = store.getSnapshots(CO_A);
    expect(all).toHaveLength(2);
    const pred = store.getSnapshot("v1")!;
    expect(pred.status).toBe("SUPERSEDED");
    expect(pred.inputs[0]!.value).toMatchObject({ type: "MONEY" });
    expect(store.getSnapshot("v2")!.status).toBe("APPROVED");
    expect(store.events.filter((e) => e.type === "SNAPSHOT_APPROVED" && e.snapshotId === "v1")).toHaveLength(1);
    expect(store.events.filter((e) => e.type === "SNAPSHOT_SUPERSEDED" && e.snapshotId === "v1")).toHaveLength(1);
  });

  it("restatement chain: v3 supersedes v2; v1 and v2 both SUPERSEDED only after each successor approval", () => {
    const store = new InMemoryApprovedSnapshotStore();
    for (const id of ["v1", "v2", "v3"] as const) {
      const supersedes = id === "v1" ? null : id === "v2" ? "v1" : "v2";
      const r = store.appendSnapshot({
        snapshot: draft({
          snapshotId: id,
          supersedesSnapshotId: supersedes,
          version: id,
          inputs: [input({ identity: identity({ key: "metric-restatement" }), value: money(id === "v1" ? "1" : id === "v2" ? "2" : "3") })],
        }),
      });
      expect(r.ok, id).toBe(true);
      if (id !== "v1") {
        const predId = supersedes!;
        expect(store.getSnapshot(predId)!.status).toBe("APPROVED");
      }
      const apr = store.approveSnapshot({
        snapshotId: id,
        reviewedBy: "rev",
        reviewedAt: "2026-10-06T00:00:00Z",
        approvalRef: `apr-${id}`,
      });
      expect(apr.ok, `approve ${id}`).toBe(true);
      if (id !== "v1" && apr.ok) {
        expect(apr.events.some((e) => e.type === "SNAPSHOT_SUPERSEDED")).toBe(true);
      }
    }
    expect(store.getSnapshot("v1")!.status).toBe("SUPERSEDED");
    expect(store.getSnapshot("v2")!.status).toBe("SUPERSEDED");
    expect(store.getSnapshot("v3")!.status).toBe("APPROVED");
    expect(store.getSnapshot("v3")!.supersedesSnapshotId).toBe("v2");
  });
});
