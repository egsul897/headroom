/**
 * Shared-capacity formula building (residual issue 4): a group
 * with ONE compiled member still binds — the aggregate cap limits
 * the member (MIN(cap, member)), even when its twins have not
 * compiled yet.
 */
import { describe, expect, it } from "vitest";
import { buildCapacityFormulas } from "../../lib/product/customer-intelligence/capacity-formulas";

const DEBT_CODE = "counsel:src:6.01_e:INDEBTEDNESS:DEBT_INCURRENCE";
const TWIN_CODE = "counsel:src:6.01_j:INDEBTEDNESS:DEBT_INCURRENCE";

describe("buildCapacityFormulas shared groups", () => {
  it("caps a single compiled member at the aggregate cap (MIN(cap, member))", () => {
    const out = buildCapacityFormulas([DEBT_CODE], [], [
      { capMillions: 20, memberCodes: [DEBT_CODE, TWIN_CODE], label: "Shared aggregate cap" },
    ]);
    // The uncompiled twin drops out; the compiled member is capped at 20, not its own 25.
    const unsecured = out.unsecured as { op: string; items: Array<{ op: string; items?: Array<{ op: string; value?: number }> }> };
    expect(unsecured.op).toBe("SUM");
    expect(unsecured.items).toHaveLength(1);
    expect(unsecured.items[0]!.op).toBe("MIN");
    expect(unsecured.items[0]!.items![0]).toMatchObject({ op: "CONST", value: 20 });
  });

  it("a 2-member group still emits MIN(cap, SUM(members))", () => {
    const out = buildCapacityFormulas([DEBT_CODE, TWIN_CODE], [], [
      { capMillions: 20, memberCodes: [DEBT_CODE, TWIN_CODE], label: "Shared aggregate cap" },
    ]);
    const unsecured = out.unsecured as { op: string; items: Array<{ op: string }> };
    expect(unsecured.items).toHaveLength(1);
    expect(unsecured.items[0]!.op).toBe("MIN");
  });
});
