/**
 * Offline authentic VEP gate: certifiedMapToVerifiedExecutionPackage over on-disk
 * Phase-3 packets only. Provider-free. Does not invent FIXTURE_IR.
 *
 * Disk currently includes one CERTIFIED candidate (§7.2(c) recompute). Adapter
 * DERIVES a VEP; evaluateVerifiedCapacity under REQUIRE still REFUSES
 * (CROSS_RULE_GATE_NOT_EXECUTABLE). Candidate CERTIFIED ≠ package CERTIFIED.
 */
import { describe, expect, it } from "vitest";
import {
  attemptAuthenticatedVep,
  AUTHENTIC_EVIDENCE_ROOTS,
  evaluateAuthenticVerifiedCapacity,
} from "../../scripts/product/attempt-authenticated-vep";
import { certifiedMapToVerifiedExecutionPackage } from "../../lib/contract-model/phase3-certification/phase4-adapter";

describe("authenticated VEP offline scan", () => {
  it("finds authentic packets including one CERTIFIED candidate with sibling verified-units", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.paidProvidersCalled).toBe(false);
    expect(scan.fixtureIrInvented).toBe(false);
    expect(scan.authenticRoots).toEqual([...AUTHENTIC_EVIDENCE_ROOTS]);
    expect(scan.scannedCertificationFiles).toBeGreaterThan(0);
    expect(scan.certifiedCount).toBe(1);
    expect(scan.statusCounts.CERTIFIED).toBe(1);
    expect(scan.statusCounts.REVIEW_REQUIRED).toBeGreaterThan(0);
    expect(scan.records.some((r) => r.path.includes("7.2c-first-certified") && r.status === "REVIEW_REQUIRED")).toBe(true);
    expect(scan.records.some((r) => r.path.includes("7.5j-end-to-end-certification") && r.status === "REVIEW_REQUIRED")).toBe(true);
    expect(
      scan.records.some(
        (r) => r.path.includes("7.2c-recompute-phase2-certified") && r.status === "CERTIFIED" && r.hasSiblingVerifiedUnits,
      ),
    ).toBe(true);
  });

  it("DERIVES VerifiedExecutionPackage from authentic CERTIFIED candidate; capacity REFUSES under REQUIRE", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.adapter.outcome).toBe("DERIVED");
    if (scan.adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    expect(scan.evaluateVerifiedCapacityInvoked).toBe(true);
    expect(scan.claimedScope).toBe("CANDIDATE_VEP_4E");
    expect(scan.adapter.package.rules.length).toBeGreaterThanOrEqual(1);

    const capacity = evaluateAuthenticVerifiedCapacity(scan.adapter.package);
    expect(capacity.outcome).toBe("REFUSED");
    if (capacity.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(capacity.refusals.some((r) => r.code === "CROSS_RULE_GATE_NOT_EXECUTABLE")).toBe(true);
  });

  it("empty artifact list is the same refusal the production adapter uses", () => {
    const empty = certifiedMapToVerifiedExecutionPackage([]);
    expect(empty.outcome).toBe("REFUSED");
    if (empty.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(empty.refusals[0]!.code).toBe("NO_CERTIFIED_ARTIFACTS");
  });
});
