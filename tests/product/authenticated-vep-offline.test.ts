/**
 * Offline authentic VEP gate: certifiedMapToVerifiedExecutionPackage over on-disk
 * Phase-3 packets only. Must refuse when no authentic CERTIFIED artifacts exist.
 * Provider-free. Does not invent FIXTURE_IR.
 */
import { describe, expect, it } from "vitest";
import {
  attemptAuthenticatedVep,
  AUTHENTIC_EVIDENCE_ROOTS,
} from "../../scripts/product/attempt-authenticated-vep";
import { certifiedMapToVerifiedExecutionPackage } from "../../lib/contract-model/phase3-certification/phase4-adapter";

describe("authenticated VEP offline scan", () => {
  it("finds authentic 10-certification.json packets and none are CERTIFIED", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.paidProvidersCalled).toBe(false);
    expect(scan.fixtureIrInvented).toBe(false);
    expect(scan.authenticRoots).toEqual([...AUTHENTIC_EVIDENCE_ROOTS]);
    expect(scan.scannedCertificationFiles).toBeGreaterThan(0);
    expect(scan.certifiedCount).toBe(0);
    expect(scan.statusCounts.CERTIFIED ?? 0).toBe(0);
    expect(scan.statusCounts.REVIEW_REQUIRED).toBeGreaterThan(0);
    expect(scan.records.some((r) => r.path.includes("7.2c-first-certified") && r.status === "REVIEW_REQUIRED")).toBe(true);
    expect(scan.records.some((r) => r.path.includes("7.5j-end-to-end-certification") && r.status === "REVIEW_REQUIRED")).toBe(true);
  });

  it("refuses certifiedMapToVerifiedExecutionPackage with NO_CERTIFIED_ARTIFACTS", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.adapter.outcome).toBe("REFUSED");
    if (scan.adapter.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(scan.adapter.refusals.map((r) => r.code)).toEqual(["NO_CERTIFIED_ARTIFACTS"]);
    expect(scan.adapter.included).toEqual([]);
    expect(scan.evaluateVerifiedCapacityInvoked).toBe(false);
    expect(scan.claimedScope).toBe("NONE");
  });

  it("empty artifact list is the same refusal the production adapter uses", () => {
    const empty = certifiedMapToVerifiedExecutionPackage([]);
    expect(empty.outcome).toBe("REFUSED");
    if (empty.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(empty.refusals[0]!.code).toBe("NO_CERTIFIED_ARTIFACTS");
  });
});
