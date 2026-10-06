/**
 * NS-4 slice 1 — each of the nine unsafe-graph issue codes is refused at write.
 * Store is stricter than 4B resolve: all nine block commit.
 */
import { describe, expect, it } from "vitest";
import { InMemoryApprovedSnapshotStore } from "@/lib/contract-model/runtime/input/store";
import type { SnapshotIssueCode } from "@/lib/contract-model/runtime/input/snapshot";
import type { FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { CO_A, CO_B, identity, input, money, snapshot } from "../helpers";

function draft(over: Partial<FinancialSnapshot> & { snapshotId: string }): FinancialSnapshot {
  return snapshot({
    status: "DRAFT",
    review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
    inputs: [input({ identity: identity({ key: "metric-u" }), value: money("1") })],
    ...over,
  });
}

function expectRefuse(store: InMemoryApprovedSnapshotStore, snap: FinancialSnapshot, code: SnapshotIssueCode, opts?: { alreadyPresent?: boolean }) {
  const before = store.eventCount();
  const r = store.appendSnapshot({ snapshot: snap });
  expect(r.ok, `expected refuse ${code}`).toBe(false);
  if (!r.ok) {
    expect(r.issues.map((i) => i.code), JSON.stringify(r.issues)).toContain(code);
  }
  expect(store.eventCount()).toBe(before);
  if (!opts?.alreadyPresent) expect(store.getSnapshot(snap.snapshotId)).toBeNull();
}

describe("nine unsafe-graph codes refused at write", () => {
  it("SELF_SUPERSESSION", () => {
    expectRefuse(new InMemoryApprovedSnapshotStore(), draft({ snapshotId: "s1", supersedesSnapshotId: "s1" }), "SELF_SUPERSESSION");
  });

  it("SUPERSESSION_CYCLE", () => {
    // Self-edge is also walked as a cycle by buildSnapshotGraph.
    const store = new InMemoryApprovedSnapshotStore();
    const r = store.appendSnapshot({ snapshot: draft({ snapshotId: "loop", supersedesSnapshotId: "loop" }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("SUPERSESSION_CYCLE");
    expect(store.eventCount()).toBe(0);
  });

  it("COMPETING_SUCCESSORS", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect(store.appendSnapshot({ snapshot: draft({ snapshotId: "s0" }) }).ok).toBe(true);
    expect(store.appendSnapshot({ snapshot: draft({ snapshotId: "s1", supersedesSnapshotId: "s0" }) }).ok).toBe(true);
    expectRefuse(store, draft({ snapshotId: "s2", supersedesSnapshotId: "s0" }), "COMPETING_SUCCESSORS");
  });

  it("DUPLICATE_SNAPSHOT_ID", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect(store.appendSnapshot({ snapshot: draft({ snapshotId: "dup" }) }).ok).toBe(true);
    expectRefuse(store, draft({ snapshotId: "dup", version: "2" }), "DUPLICATE_SNAPSHOT_ID", { alreadyPresent: true });
  });

  it("SUPERSEDES_UNKNOWN_SNAPSHOT", () => {
    expectRefuse(
      new InMemoryApprovedSnapshotStore(),
      draft({ snapshotId: "s1", supersedesSnapshotId: "missing" }),
      "SUPERSEDES_UNKNOWN_SNAPSHOT",
    );
  });

  it("SUPERSEDED_STATUS_WITHOUT_SUCCESSOR", () => {
    expectRefuse(
      new InMemoryApprovedSnapshotStore(),
      draft({ snapshotId: "orphan", status: "SUPERSEDED" }),
      "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR",
    );
  });

  it("SUCCESSOR_OF_ANOTHER_COMPANY", () => {
    const store = new InMemoryApprovedSnapshotStore();
    expect(
      store.appendSnapshot({
        snapshot: draft({
          snapshotId: "s0",
          companyId: CO_B,
          inputs: [input({ identity: identity({ key: "metric-u", companyId: CO_B }), value: money("1") })],
        }),
      }).ok,
    ).toBe(true);
    expectRefuse(
      store,
      draft({ snapshotId: "s1", companyId: CO_A, supersedesSnapshotId: "s0" }),
      "SUCCESSOR_OF_ANOTHER_COMPANY",
    );
  });

  it("MONEY_INPUT_WITHOUT_CURRENCY", () => {
    expectRefuse(
      new InMemoryApprovedSnapshotStore(),
      draft({
        snapshotId: "s-money",
        inputs: [input({ identity: identity({ key: "m", currency: null }), value: money("1") })],
      }),
      "MONEY_INPUT_WITHOUT_CURRENCY",
    );
  });

  it("DUPLICATE_IDENTITY_WITHIN_SNAPSHOT", () => {
    expectRefuse(
      new InMemoryApprovedSnapshotStore(),
      draft({
        snapshotId: "s-dup-id",
        inputs: [
          input({ identity: identity({ key: "m" }), value: money("1") }),
          input({ identity: identity({ key: "m" }), value: money("2") }),
        ],
      }),
      "DUPLICATE_IDENTITY_WITHIN_SNAPSHOT",
    );
  });
});
