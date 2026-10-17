/**
 * Shared-capacity handling (residual issue 4).
 * - A retrieval failure must not silently remove an operative
 *   aggregate cap: the legacy formula sync fails loudly instead
 *   of publishing independent-basket formulas.
 * - A group with ONE compiled member still binds: the aggregate
 *   cap limits the member (MIN(cap, member)).
 *
 * The fake Prisma client lives in vi.hoisted: vi.mock factories are
 * hoisted above module-level const declarations, so closing over a
 * plain top-level `fakePrisma` throws "Cannot access 'fakePrisma'
 * before initialization" and the suite loads ZERO tests. Hoisting
 * the fake keeps one mutable object the mock returns and the tests
 * below can reprogram per case.
 */
import { describe, expect, it, vi } from "vitest";

const { calls, fakePrisma } = vi.hoisted(() => {
  const calls = { documentUpdate: [] as unknown[] };
  const fakePrisma = {
    permission: { findMany: async () => [] as unknown[] },
    sharedCapacityConstraint: { findMany: async () => [] as unknown[] },
    sharedCapacityConstraintMember: { findMany: async () => [] as unknown[] },
    document: { update: async (args: unknown) => { calls.documentUpdate.push(args); return {}; } },
  };
  return { calls, fakePrisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

import { syncDocumentCapacityFormulas } from "../../lib/product/customer-intelligence/compile-accepted";

const DEBT_CODE = "counsel:src:6.01_e:INDEBTEDNESS:DEBT_INCURRENCE";
const debtPerm = { id: "perm-1", code: DEBT_CODE, grantType: "DEBT_INCURRENCE", thresholdValue: 25 };

describe("syncDocumentCapacityFormulas shared-cap failure + single member", () => {
  it("a shared-cap retrieval failure fails the sync loudly (no formulas published)", async () => {
    fakePrisma.permission.findMany = async () => [debtPerm] as unknown as never[];
    fakePrisma.sharedCapacityConstraint.findMany = async () => { throw new Error("db unavailable"); };
    calls.documentUpdate = [];
    await expect(syncDocumentCapacityFormulas("co-1", "doc-1")).rejects.toThrow("Shared-capacity grouping failed");
    expect(calls.documentUpdate).toHaveLength(0);
  });

  it("a single compiled member's legacy formula carries the aggregate-cap MIN node", async () => {
    fakePrisma.permission.findMany = async () => [debtPerm] as unknown as never[];
    fakePrisma.sharedCapacityConstraint.findMany = async () => [
      { id: "c-1", capAmount: 20, sourceSectionRef: "6.01" },
    ] as unknown as never[];
    fakePrisma.sharedCapacityConstraintMember.findMany = async () => [
      { constraintId: "c-1", permissionId: "perm-1" },
    ] as unknown as never[];
    calls.documentUpdate = [];
    await syncDocumentCapacityFormulas("co-1", "doc-1");
    expect(calls.documentUpdate).toHaveLength(1);
    const data = (calls.documentUpdate[0] as { data: { capacityFormulas: { unsecured: { items: Array<{ op: string; items?: Array<{ value?: number }> }> } } } }).data.capacityFormulas;
    expect(data.unsecured.items[0]!.op).toBe("MIN");
    expect(data.unsecured.items[0]!.items![0]!.value).toBe(20);
  });
});
