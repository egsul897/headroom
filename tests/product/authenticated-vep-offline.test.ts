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
  it("finds authentic CERTIFIED packets including §7.2(c) and §7.2(d) offline recomputes", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.paidProvidersCalled).toBe(false);
    expect(scan.fixtureIrInvented).toBe(false);
    expect(scan.authenticRoots).toEqual([...AUTHENTIC_EVIDENCE_ROOTS]);
    expect(scan.scannedCertificationFiles).toBeGreaterThan(0);
    expect(scan.certifiedCount).toBeGreaterThanOrEqual(2);
    expect(scan.statusCounts.CERTIFIED ?? 0).toBeGreaterThanOrEqual(2);
    expect(scan.records.some((r) => r.path.includes("7.2c-recompute-phase2-certified") && r.status === "CERTIFIED")).toBe(true);
    expect(scan.records.some((r) => r.path.includes("7.2d-recompute-phase2-certified") && r.status === "CERTIFIED")).toBe(true);
    expect(scan.records.some((r) => r.path.includes("7.2c-first-certified") && r.status === "REVIEW_REQUIRED")).toBe(true);
    expect(scan.records.some((r) => r.path.includes("7.5j-end-to-end-certification") && r.status === "REVIEW_REQUIRED")).toBe(true);
  });

  it("derives a VEP from authentic CERTIFIED artifacts (merged package may still fail capacity on §7.2(c) cross-rule gates)", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.adapter.outcome).toBe("DERIVED");
    if (scan.adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    expect(scan.adapter.included.length).toBeGreaterThanOrEqual(2);
    expect(scan.evaluateVerifiedCapacityInvoked).toBe(true);
    expect(scan.claimedScope).toBe("CANDIDATE_VEP_4E");
  });

  it("empty artifact list is the same refusal the production adapter uses", () => {
    const empty = certifiedMapToVerifiedExecutionPackage([]);
    expect(empty.outcome).toBe("REFUSED");
    if (empty.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(empty.refusals[0]!.code).toBe("NO_CERTIFIED_ARTIFACTS");
  });
});
