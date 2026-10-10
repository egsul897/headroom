/**
 * Offline authentic VEP gate: scan Phase-3 packets → certifiedMapToVerifiedExecutionPackage.
 * Provider-free. Does not invent FIXTURE_IR.
 *
 * Current authentic state (post 7.2c recompute): one CERTIFIED packet → DERIVED VEP.
 * Affirmative numeric capacity remains blocked (cross-rule / financials) — refuse, do not invent.
 */
import { describe, expect, it } from "vitest";
import {
  attemptAuthenticatedVep,
  AUTHENTIC_EVIDENCE_ROOTS,
  evaluateAuthenticVerifiedCapacity,
} from "../../scripts/product/attempt-authenticated-vep";
import { certifiedMapToVerifiedExecutionPackage } from "../../lib/contract-model/phase3-certification/phase4-adapter";

describe("authenticated VEP offline scan", () => {
  it("finds authentic CERTIFIED §7.2(c) recompute and still surfaces REVIEW_REQUIRED packets", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.paidProvidersCalled).toBe(false);
    expect(scan.fixtureIrInvented).toBe(false);
    expect(scan.authenticRoots).toEqual([...AUTHENTIC_EVIDENCE_ROOTS]);
    expect(scan.scannedCertificationFiles).toBeGreaterThan(0);
    expect(scan.certifiedCount).toBe(1);
    expect(scan.statusCounts.CERTIFIED).toBe(1);
    expect(scan.statusCounts.REVIEW_REQUIRED).toBeGreaterThan(0);
    expect(
      scan.records.some(
        (r) => r.path.includes("7.2c-recompute-phase2-certified") && r.status === "CERTIFIED",
      ),
    ).toBe(true);
    expect(
      scan.records.some((r) => r.path.includes("7.2c-first-certified") && r.status === "REVIEW_REQUIRED"),
    ).toBe(true);
  });

  it("derives VerifiedExecutionPackage from authentic CERTIFIED artifacts (not invented)", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.adapter.outcome).toBe("DERIVED");
    if (scan.adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    expect(scan.adapter.included.length).toBeGreaterThan(0);
    expect(scan.claimedScope).toBe("CANDIDATE_VEP_4E");
    expect(scan.fixtureIrInvented).toBe(false);
  });

  it("REQUIRE capacity over authentic VEP refuses without inventing headroom", () => {
    const scan = attemptAuthenticatedVep();
    expect(scan.adapter.outcome).toBe("DERIVED");
    if (scan.adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    const capacity = evaluateAuthenticVerifiedCapacity(scan.adapter.package);
    // Cross-rule / unbound companions → honest REFUSED (not a favorable remaining figure).
    expect(capacity.outcome).toBe("REFUSED");
    if (capacity.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(capacity.refusals.length).toBeGreaterThan(0);
  });

  it("empty artifact list is the same refusal the production adapter uses", () => {
    const empty = certifiedMapToVerifiedExecutionPackage([]);
    expect(empty.outcome).toBe("REFUSED");
    if (empty.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(empty.refusals[0]!.code).toBe("NO_CERTIFIED_ARTIFACTS");
  });
});
