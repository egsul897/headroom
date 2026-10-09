/**
 * NS-4 slice 3 — loader parity (offline):
 * Hand-built Phase 4B fixtures, after append→approve through the sealed store,
 * resolve identically via snapshotInputResolver / resolveInput (unchanged).
 *
 * Soft gates: zero provider calls; no Ask UI; no Phase-3 edits; synthetic only.
 */
import { describe, expect, it } from "vitest";
import { InMemoryApprovedSnapshotStore } from "@/lib/contract-model/runtime/input/store";
import { resolveInput } from "@/lib/contract-model/runtime/input/resolve";
import { serializeValue } from "@/lib/contract-model/runtime/values";
import { toCanonicalString } from "@/lib/contract-model/runtime/decimal";
import type { FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import {
  CO_A,
  INST_1,
  exactAsOf,
  identity,
  input,
  money,
  snapshot,
  verbatimPeriod,
} from "../helpers";

function canonicalizeSnapshot(s: FinancialSnapshot) {
  return {
    snapshotId: s.snapshotId,
    version: s.version,
    companyId: s.companyId,
    asOf: s.asOf,
    reportingPeriod: s.reportingPeriod,
    status: s.status,
    supersedesSnapshotId: s.supersedesSnapshotId,
    provenance: s.provenance,
    review: s.review,
    inputs: s.inputs.map((inp) => ({
      identity: inp.identity,
      value: serializeValue(inp.value),
      displayName: inp.displayName ?? null,
      sourceVersion: inp.sourceVersion ?? null,
      overridesDefinitionId: inp.overridesDefinitionId ?? null,
      note: inp.note ?? null,
    })),
  };
}

describe("NS-4 loader parity vs hand-built 4B fixtures", () => {
  it("store materialization matches hand-built APPROVED fixture shape + resolve parity", () => {
    const ebitdaId = identity({
      key: "Consolidated EBITDA",
      period: verbatimPeriod("FY2026-Q2"),
      asOf: exactAsOf("2026-06-30"),
    });
    const handBuilt = snapshot({
      snapshotId: "loader-parity-snap-1",
      status: "DRAFT",
      review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
      inputs: [input({ identity: ebitdaId, value: money("125000000") })],
    });

    const store = new InMemoryApprovedSnapshotStore();
    const appended = store.appendSnapshot({ snapshot: handBuilt });
    expect(appended.ok).toBe(true);

    const approved = store.approveSnapshot({
      snapshotId: handBuilt.snapshotId,
      reviewedBy: "loader-parity-reviewer",
      reviewedAt: "2026-07-15T00:00:00Z",
      approvalRef: "approval-loader-parity-1",
    });
    expect(approved.ok).toBe(true);

    const fromStore = store.getSnapshot(handBuilt.snapshotId)!;
    expect(fromStore.status).toBe("APPROVED");

    const expectedApproved: FinancialSnapshot = {
      ...handBuilt,
      status: "APPROVED",
      review: {
        reviewedBy: "loader-parity-reviewer",
        reviewedAt: "2026-07-15T00:00:00Z",
        approvalRef: "approval-loader-parity-1",
      },
    };

    expect(canonicalizeSnapshot(fromStore)).toEqual(canonicalizeSnapshot(expectedApproved));

    const query = {
      companyId: CO_A,
      instrumentKey: INST_1,
      inputKind: "METRIC" as const,
      key: "Consolidated EBITDA",
      period: verbatimPeriod("FY2026-Q2"),
      asOf: exactAsOf("2026-06-30"),
      expectedType: "MONEY" as const,
      currency: "USD",
    };

    const fromHand = resolveInput({ query, snapshots: [expectedApproved] });
    const fromLoaded = resolveInput({ query, snapshots: [fromStore] });

    expect(fromHand.state).toBe("RESOLVED");
    expect(fromLoaded.state).toBe("RESOLVED");
    expect(fromLoaded.provenance!.snapshotId).toBe(fromHand.provenance!.snapshotId);
    expect(fromLoaded.provenance!.snapshotStatus).toBe("APPROVED");
    expect(fromLoaded.provenance!.reliedOnNonApprovedSnapshot).toBe(false);

    if (fromHand.input!.value.type === "MONEY" && fromLoaded.input!.value.type === "MONEY") {
      expect(toCanonicalString(fromLoaded.input!.value.amount)).toBe(
        toCanonicalString(fromHand.input!.value.amount),
      );
      expect(fromLoaded.input!.value.currency).toBe(fromHand.input!.value.currency);
    } else {
      expect.fail("expected MONEY values");
    }
  });

  it("DRAFT proposals never feed APPROVED-only loader consumers", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const draft = snapshot({
      snapshotId: "loader-parity-draft",
      status: "DRAFT",
      review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
      inputs: [input({ identity: identity({ key: "Cash" }), value: money("1") })],
    });
    expect(store.appendSnapshot({ snapshot: draft }).ok).toBe(true);
    const approvedOnly = store.getSnapshots(CO_A).filter((s) => s.status === "APPROVED");
    expect(approvedOnly).toHaveLength(0);
  });
});
