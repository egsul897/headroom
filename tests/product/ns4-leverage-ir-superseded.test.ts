/**
 * Rule 80 — leverage IR must not compute from a non-APPROVED
 * bound snapshot while labeling the result "from APPROVED facts".
 *
 * computeNs4ContractualNetLeverage took any bound snapshot and
 * labeled its output "from APPROVED NS-4 money facts". The bundle
 * and panel can bind a SUPERSEDED snapshot (historical delivery
 * binding), so the dashboard could publish a leverage ratio
 * computed from superseded facts as APPROVED. Non-APPROVED
 * bound snapshots are now refused (NOT_BOUND), like the null case.
 */
import { describe, expect, it } from "vitest";
import { computeNs4ContractualNetLeverage } from "../../lib/dashboard/ns4-leverage-ir";
import {
  makeTestApprovedNs4SnapshotForPackage,
} from "./financial-metric-resolver/ns4-approved-fixture";
import { MATTHEWS_PKG } from "../../lib/product/financial-metric-resolver/registry";

function snapshotWithMoney(status: "APPROVED" | "SUPERSEDED") {
  // The package fixture already carries Consolidated EBITDA /
  // Consolidated Total Debt / Unrestricted Cash money inputs.
  return makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, { status });
}

describe("computeNs4ContractualNetLeverage snapshot status", () => {
  it("refuses a SUPERSEDED bound snapshot instead of labeling it APPROVED", () => {
    const result = computeNs4ContractualNetLeverage({
      companyId: MATTHEWS_PKG.companyId,
      boundSnapshot: snapshotWithMoney("SUPERSEDED"),
    });
    expect(result.status).toBe("NOT_BOUND");
    expect(result.computedRatio).toBeNull();
    expect(result.evidence.join(" ")).toMatch(/SUPERSEDED/);
  });

  it("still evaluates an APPROVED bound snapshot (passes the status gate)", () => {
    const result = computeNs4ContractualNetLeverage({
      companyId: MATTHEWS_PKG.companyId,
      boundSnapshot: snapshotWithMoney("APPROVED"),
    });
    // The package fixture's instrument-scoped inputs cannot drive
    // the company-level IR to EXECUTABLE, but the snapshot must
    // pass the APPROVED gate and reach evaluation (NEEDS_INPUT),
    // never the NOT_BOUND refusal.
    expect(result.status).not.toBe("NOT_BOUND");
    expect(result.evidence.join(" ")).not.toMatch(/not APPROVED/);
  });
});
