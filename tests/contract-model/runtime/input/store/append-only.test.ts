/**
 * NS-4 slice 1 — append-only write API: no in-place mutation, no raw APPROVED,
 * attributable approve path with required approvalRef.
 */
import { describe, expect, it } from "vitest";
import { InMemoryApprovedSnapshotStore } from "@/lib/contract-model/runtime/input/store";
import { materializeFromEvents } from "@/lib/contract-model/runtime/input/store/write";
import type { FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { CO_A, identity, input, money, snapshot } from "../helpers";

function draft(over: Partial<FinancialSnapshot> & { snapshotId: string }): FinancialSnapshot {
  return snapshot({
    status: "DRAFT",
    review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
    inputs: [input({ identity: identity({ key: "metric-store" }), value: money("10") })],
    ...over,
  });
}

describe("append-only: cannot mutate in place", () => {
  it("rejects a second append with the same snapshotId", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const first = store.appendSnapshot({ snapshot: draft({ snapshotId: "s-1" }) });
    expect(first.ok).toBe(true);
    const before = store.eventCount();
    const second = store.appendSnapshot({ snapshot: draft({ snapshotId: "s-1", version: "2" }) });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.issues.some((i) => i.code === "DUPLICATE_SNAPSHOT_ID")).toBe(true);
    expect(store.eventCount()).toBe(before);
    expect(store.getSnapshot("s-1")!.version).toBe("1");
  });

  it("returned snapshots are clones — mutating them does not change the store", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "s-clone" }) });
    const got = store.getSnapshot("s-clone")!;
    got.status = "APPROVED";
    got.review.approvalRef = "hacked";
    expect(store.getSnapshot("s-clone")!.status).toBe("DRAFT");
    expect(store.getSnapshot("s-clone")!.review.approvalRef).toBeNull();
  });

  it("event log only grows; prior event payloads are unchanged after approve", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "s-ev" }) });
    const firstEvent = structuredClone(store.events[0]);
    store.approveSnapshot({
      snapshotId: "s-ev",
      reviewedBy: "rev-1",
      reviewedAt: "2026-10-06T12:00:00Z",
      approvalRef: "apr-1",
    });
    expect(store.events[0]).toEqual(firstEvent);
    expect(store.eventCount()).toBe(2);
    expect(store.events[1]!.type).toBe("SNAPSHOT_APPROVED");
  });
});

describe("append-only: cannot append APPROVED (or SUPERSEDED) directly", () => {
  it("refuses status APPROVED on raw append", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.appendSnapshot({
      snapshot: snapshot({
        snapshotId: "s-bad-appr",
        status: "APPROVED",
        inputs: [input({ identity: identity({ key: "m" }), value: money("1") })],
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "APPEND_STATUS_NOT_ALLOWED")).toBe(true);
    expect(store.getSnapshot("s-bad-appr")).toBeNull();
  });

  it("refuses status SUPERSEDED on raw append", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.appendSnapshot({
      snapshot: draft({ snapshotId: "s-bad-sup", status: "SUPERSEDED" }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "APPEND_STATUS_NOT_ALLOWED")).toBe(true);
  });

  it("refuses a DRAFT that already carries approvalRef", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.appendSnapshot({
      snapshot: draft({
        snapshotId: "s-sneak",
        review: { reviewedBy: "x", reviewedAt: "2026-01-01T00:00:00Z", approvalRef: "sneak" },
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "APPEND_STATUS_NOT_ALLOWED")).toBe(true);
  });

  it("accepts REVIEW_REQUIRED as a proposal status", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.appendSnapshot({ snapshot: draft({ snapshotId: "s-rr", status: "REVIEW_REQUIRED" }) });
    expect(r.ok).toBe(true);
    expect(store.getSnapshot("s-rr")!.status).toBe("REVIEW_REQUIRED");
  });
});

describe("approve path", () => {
  it("transitions DRAFT → APPROVED with review fields set", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "s-appr" }) });
    const r = store.approveSnapshot({
      snapshotId: "s-appr",
      reviewedBy: "alice",
      reviewedAt: "2026-10-06T18:00:00Z",
      approvalRef: "APPR-42",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshot.status).toBe("APPROVED");
      expect(r.snapshot.review).toEqual({
        reviewedBy: "alice",
        reviewedAt: "2026-10-06T18:00:00Z",
        approvalRef: "APPR-42",
      });
    }
    expect(store.getSnapshot("s-appr")!.status).toBe("APPROVED");
  });

  it("requires approvalRef (and reviewedBy / reviewedAt)", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "s-need-ref" }) });
    const r = store.approveSnapshot({
      snapshotId: "s-need-ref",
      reviewedBy: "alice",
      reviewedAt: "2026-10-06T18:00:00Z",
      approvalRef: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "APPROVAL_FIELDS_REQUIRED")).toBe(true);
    expect(store.getSnapshot("s-need-ref")!.status).toBe("DRAFT");
  });

  it("refuses approve when snapshot is missing", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.approveSnapshot({
      snapshotId: "nope",
      reviewedBy: "a",
      reviewedAt: "2026-10-06T00:00:00Z",
      approvalRef: "r",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "SNAPSHOT_NOT_FOUND")).toBe(true);
  });

  it("refuses re-approve of an already APPROVED snapshot", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "s-once" }) });
    store.approveSnapshot({
      snapshotId: "s-once",
      reviewedBy: "a",
      reviewedAt: "2026-10-06T00:00:00Z",
      approvalRef: "r1",
    });
    const r = store.approveSnapshot({
      snapshotId: "s-once",
      reviewedBy: "b",
      reviewedAt: "2026-10-07T00:00:00Z",
      approvalRef: "r2",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "SNAPSHOT_NOT_APPROVABLE")).toBe(true);
    expect(store.getSnapshot("s-once")!.review.approvalRef).toBe("r1");
  });

  it("getSnapshots returns company-scoped materialization including APPROVED", () => {
    const store = new InMemoryApprovedSnapshotStore();
    store.appendSnapshot({ snapshot: draft({ snapshotId: "s-a", companyId: CO_A }) });
    store.appendSnapshot({
      snapshot: draft({
        snapshotId: "s-b",
        companyId: "company-beta",
        inputs: [input({ identity: identity({ key: "metric-store", companyId: "company-beta" }), value: money("1") })],
      }),
    });
    store.approveSnapshot({
      snapshotId: "s-a",
      reviewedBy: "a",
      reviewedAt: "2026-10-06T00:00:00Z",
      approvalRef: "r",
    });
    const list = store.getSnapshots(CO_A);
    expect(list.map((s) => s.snapshotId)).toEqual(["s-a"]);
    expect(list[0]!.status).toBe("APPROVED");
    expect(materializeFromEvents(store.events).size).toBe(2);
  });
});
