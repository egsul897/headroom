/**
 * Offline authentic VEP gate: certifiedMapToVerifiedExecutionPackage over on-disk
 * Phase-3 packets only. Provider-free. Does not invent FIXTURE_IR.
 *
 * Ground truth on main: CONMED §7.2(c) offline recompute is CERTIFIED and the
 * adapter DERIVES a VEP. Path enumeration remains UNSUPPORTED (cross-rule) —
 * CERTIFIED ≠ eligible executable capacity.
 */
import { describe, expect, it } from "vitest";
import {
  attemptAuthenticatedVep,
  AUTHENTIC_EVIDENCE_ROOTS,
  enumerateAuthenticPhase4e,
} from "../../scripts/product/attempt-authenticated-vep";
import { certifiedMapToVerifiedExecutionPackage } from "../../lib/contract-model/phase3-certification/phase4-adapter";

describe("authenticated VEP offline scan", () => {
  it("finds authentic CERTIFIED §7.2(c) and DERIVES a VEP without inventing fixtures", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.paidProvidersCalled).toBe(false);
    expect(scan.fixtureIrInvented).toBe(false);
    expect(scan.authenticRoots).toEqual([...AUTHENTIC_EVIDENCE_ROOTS]);
    expect(scan.scannedCertificationFiles).toBeGreaterThan(0);
    expect(scan.certifiedCount).toBeGreaterThanOrEqual(1);
    expect(scan.statusCounts.CERTIFIED ?? 0).toBeGreaterThanOrEqual(1);
    expect(
      scan.records.some(
        (r) =>
          r.path.includes("7.2c-recompute-phase2-certified") && r.status === "CERTIFIED",
      ),
    ).toBe(true);
    expect(scan.adapter.outcome).toBe("DERIVED");
    expect(scan.claimedScope).toBe("CANDIDATE_VEP_4E");
  });

  it("CERTIFIED_4E enumeration over DERIVED VEP marks §7.2(c) path UNSUPPORTED (cross-rule)", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.adapter.outcome).toBe("DERIVED");
    if (scan.adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    const enums = enumerateAuthenticPhase4e(scan.adapter.package);
    const unsecured = enums.find((e) => e.transactionKind === "UNSECURED_DEBT");
    expect(unsecured?.authority).toBe("CERTIFIED_4E");
    expect(unsecured?.paths.some((p) => p.status === "UNSUPPORTED")).toBe(true);
    expect(
      unsecured?.unsupportedReasons.some((r) => r.includes("CROSS_RULE_GATE_NOT_EXECUTABLE")),
    ).toBe(true);
  });

  it("empty artifact list is the same refusal the production adapter uses", () => {
    const empty = certifiedMapToVerifiedExecutionPackage([]);
    expect(empty.outcome).toBe("REFUSED");
    if (empty.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(empty.refusals[0]!.code).toBe("NO_CERTIFIED_ARTIFACTS");
  });
});
