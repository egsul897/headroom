/**
 * NS-4 slice 1 — public façade seal: no unvalidated commit, no live mutable events.
 * Regression for Audit Peer FAIL on PR #72.
 */
import { describe, expect, it } from "vitest";
import { InMemoryApprovedSnapshotStore } from "@/lib/contract-model/runtime/input/store";
import type { StoreEvent } from "@/lib/contract-model/runtime/input/store";
import type { FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { identity, input, money, snapshot } from "../helpers";

function draft(over: Partial<FinancialSnapshot> & { snapshotId: string }): FinancialSnapshot {
  return snapshot({
    status: "DRAFT",
    review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
    inputs: [input({ identity: identity({ key: "metric-seal" }), value: money("10") })],
    ...over,
  });
}

describe("public surface seal", () => {
  it("does not expose unvalidated commit on the public façade", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect("commit" in store).toBe(false);
    expect((store as unknown as { commit?: unknown }).commit).toBeUndefined();
    // Private composed backend is not enumerable / reachable on the instance.
    expect((store as unknown as { log?: unknown }).log).toBeUndefined();
    expect((store as unknown as { backend?: unknown }).backend).toBeUndefined();
    expect((store as unknown as { _events?: unknown })._events).toBeUndefined();
  });

  it("clear/reset/truncate/empty/wipe absent on instance and prototype (append-only façade)", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const proto = InMemoryApprovedSnapshotStore.prototype as unknown as Record<string, unknown>;
    const instance = store as unknown as Record<string, unknown>;
    for (const name of ["clear", "reset", "truncate", "empty", "wipe"] as const) {
      expect(typeof instance[name]).toBe("undefined");
      expect(typeof proto[name]).toBe("undefined");
      expect(Object.prototype.hasOwnProperty.call(proto, name)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(instance, name)).toBe(false);
      expect(name in store).toBe(false);
    }
  });

  it("cannot plant APPROVED without approveSnapshot", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect(store.appendSnapshot({ snapshot: draft({ snapshotId: "s-plant" }) }).ok).toBe(true);
    expect(store.getSnapshot("s-plant")!.status).toBe("DRAFT");

    // No public commit to plant an APPROVED transition / row.
    const forged: StoreEvent = {
      type: "SNAPSHOT_APPROVED",
      eventId: "evt-forged",
      at: "2026-10-06T00:00:00Z",
      snapshotId: "s-plant",
      companyId: "company-alpha",
      reviewedBy: "attacker",
      reviewedAt: "2026-10-06T00:00:00Z",
      approvalRef: "forged",
    };
    expect(() => {
      (store.events as StoreEvent[]).push(forged);
    }).toThrow();
    expect(store.eventCount()).toBe(1);
    expect(store.getSnapshot("s-plant")!.status).toBe("DRAFT");
    expect(store.getSnapshot("s-plant")!.review.approvalRef).toBeNull();

    // Valid path still works.
    const ok = store.approveSnapshot({
      snapshotId: "s-plant",
      reviewedBy: "alice",
      reviewedAt: "2026-10-06T12:00:00Z",
      approvalRef: "apr-real",
    });
    expect(ok.ok).toBe(true);
    expect(store.getSnapshot("s-plant")!.status).toBe("APPROVED");
  });

  it("cannot plant unsafe-graph rows bypassing write checks", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect(store.appendSnapshot({ snapshot: draft({ snapshotId: "s0" }) }).ok).toBe(true);

    // Competing successor would be refused by appendSnapshot.
    const refused = store.appendSnapshot({
      snapshot: draft({ snapshotId: "s1", supersedesSnapshotId: "s0" }),
    });
    expect(refused.ok).toBe(true);
    const competing = store.appendSnapshot({
      snapshot: draft({ snapshotId: "s2", supersedesSnapshotId: "s0" }),
    });
    expect(competing.ok).toBe(false);
    if (!competing.ok) {
      expect(competing.issues.map((i) => i.code)).toContain("COMPETING_SUCCESSORS");
    }

    // Forged APPENDED event with self-supersession cannot be pushed onto public events.
    const forged: StoreEvent = {
      type: "SNAPSHOT_APPENDED",
      eventId: "evt-unsafe",
      at: "2026-10-06T00:00:00Z",
      snapshot: draft({ snapshotId: "loop", supersedesSnapshotId: "loop" }),
    };
    const before = store.eventCount();
    expect(() => {
      (store.events as StoreEvent[]).push(forged);
    }).toThrow();
    expect(store.eventCount()).toBe(before);
    expect(store.getSnapshot("loop")).toBeNull();

    // Self-supersession still refused on the validated API.
    const self = store.appendSnapshot({
      snapshot: draft({ snapshotId: "loop", supersedesSnapshotId: "loop" }),
    });
    expect(self.ok).toBe(false);
    expect(store.getSnapshot("loop")).toBeNull();
  });

  it("returned events are frozen copies — pop/mutate does not delete or rewrite prior appends", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect(store.appendSnapshot({ snapshot: draft({ snapshotId: "s-ev" }) }).ok).toBe(true);
    expect(store.eventCount()).toBe(1);

    const returned = store.events;
    expect(Object.isFrozen(returned)).toBe(true);
    expect(() => {
      (returned as StoreEvent[]).pop();
    }).toThrow();
    expect(() => {
      (returned as StoreEvent[]).push({
        type: "SNAPSHOT_APPROVED",
        eventId: "x",
        at: "2026-10-06T00:00:00Z",
        snapshotId: "s-ev",
        companyId: "company-alpha",
        reviewedBy: "x",
        reviewedAt: "2026-10-06T00:00:00Z",
        approvalRef: "x",
      });
    }).toThrow();

    const first = returned[0]!;
    expect(Object.isFrozen(first)).toBe(true);
    if (first.type === "SNAPSHOT_APPENDED") {
      expect(Object.isFrozen(first.snapshot)).toBe(true);
      expect(() => {
        (first.snapshot as FinancialSnapshot).status = "APPROVED";
      }).toThrow();
      expect(() => {
        (first.snapshot.review as { approvalRef: string | null }).approvalRef = "hacked";
      }).toThrow();
    }

    expect(store.eventCount()).toBe(1);
    expect(store.events).toHaveLength(1);
    expect(store.getSnapshot("s-ev")!.status).toBe("DRAFT");
    expect(store.getSnapshot("s-ev")!.review.approvalRef).toBeNull();
  });

  it("WriteOk.events and getSnapshot materialization are frozen copies", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.appendSnapshot({ snapshot: draft({ snapshotId: "s-wo" }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.isFrozen(r.events)).toBe(true);
    expect(Object.isFrozen(r.snapshot)).toBe(true);
    expect(() => {
      (r.snapshot as FinancialSnapshot).status = "APPROVED";
    }).toThrow();
    expect(store.getSnapshot("s-wo")!.status).toBe("DRAFT");

    const got = store.getSnapshot("s-wo")!;
    expect(Object.isFrozen(got)).toBe(true);
    expect(() => {
      (got as FinancialSnapshot).status = "APPROVED";
    }).toThrow();
    expect(store.getSnapshot("s-wo")!.status).toBe("DRAFT");
  });
});
