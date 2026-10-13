/**
 * Adversarial authority tests: provisional/synthetic evidence cannot be promoted
 * to AVAILABLE_VERIFIED or GROSS_FROM_APPROVED_SNAPSHOT through caller arguments.
 */
import { describe, expect, it } from "vitest";
import * as resolverApi from "@/lib/product/financial-metric-resolver";
import {
  resolveCanonicalFinancialInputs,
  mayClaimVerifiedRemaining,
  MATTHEWS_PKG,
  SYNTHETIC_PKG,
  COHERENT_PKG,
} from "@/lib/product/financial-metric-resolver";
import { makeTestApprovedNs4SnapshotForPackage } from "./ns4-approved-fixture";

describe("production API surface — no forceEvidenceAuthority", () => {
  it("does not export forceEvidenceAuthority or a force-override helper", () => {
    expect("forceEvidenceAuthority" in resolverApi).toBe(false);
    const exported = Object.keys(resolverApi);
    expect(exported.some((k) => /force/i.test(k))).toBe(false);
    // resolveCanonicalFinancialInputs args type must not accept force override at runtime
    const fn = resolveCanonicalFinancialInputs;
    expect(fn.length).toBeLessThanOrEqual(1);
  });

  it("extra caller fields cannot promote provisional Matthews to APPROVED", async () => {
    const sneaky = {
      packageKey: "matthews:indenture-2027-second-lien",
      forceEvidenceAuthority: "APPROVED_SNAPSHOT",
      evidenceAuthority: "APPROVED_SNAPSHOT",
      capacityPublication: "GROSS_FROM_APPROVED_SNAPSHOT",
    } as Parameters<typeof resolveCanonicalFinancialInputs>[0] & Record<string, string>;

    const bundle = await resolveCanonicalFinancialInputs(sneaky);
    expect(bundle!.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(bundle!.facts.every((f) => f.evidenceAuthority === "PROVISIONAL_RECONSTRUCTION")).toBe(true);
    expect(bundle!.facts.every((f) => f.readiness !== "AVAILABLE_VERIFIED")).toBe(true);
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);
  });

  it("synthetic package cannot be promoted via caller arguments", async () => {
    const sneaky = {
      packageKey: "synthetic:demo-credit-facility",
      forceEvidenceAuthority: "APPROVED_SNAPSHOT",
      approvedNs4Snapshot: null,
    } as Parameters<typeof resolveCanonicalFinancialInputs>[0] & { forceEvidenceAuthority: string };

    const bundle = await resolveCanonicalFinancialInputs(sneaky);
    expect(bundle!.evidenceAuthority).toBe("SYNTHETIC_LABELED");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(bundle!.facts.every((f) => f.readiness !== "AVAILABLE_VERIFIED")).toBe(true);
  });
});

describe("NS-4 snapshot validation gates APPROVED_SNAPSHOT", () => {
  it("DRAFT snapshot does not promote provisional evidence", async () => {
    const draft = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, { status: "DRAFT" });
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: draft,
    });
    expect(bundle!.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(bundle!.notes.some((n) => /failed validation|not APPROVED/i.test(n))).toBe(true);
  });

  it("APPROVED with wrong company/instrument/period/as-of does not promote", async () => {
    const badCompany = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {
      companyId: "wrong-company",
    });
    const badPeriod = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {
      reportingPeriod: "wrong-period",
    });
    const badAsOf = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, { asOf: "2099-01-01" });
    const badInstrument = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    // Mutate inputs to a different instrument
    badInstrument.inputs = badInstrument.inputs.map((inp) => ({
      ...inp,
      identity: {
        ...inp.identity,
        scope: { kind: "INSTRUMENT_LEVEL" as const, instrumentKey: "other-instrument" },
      },
    }));

    for (const snap of [badCompany, badPeriod, badAsOf, badInstrument]) {
      const bundle = await resolveCanonicalFinancialInputs({
        packageKey: MATTHEWS_PKG.packageKey,
        approvedNs4Snapshot: snap,
      });
      expect(bundle!.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
      expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
      expect(bundle!.facts.every((f) => f.readiness !== "AVAILABLE_VERIFIED")).toBe(true);
    }
  });

  it("APPROVED missing reviewer or approvalRef does not promote", async () => {
    const noReviewer = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {
      review: { reviewedBy: null, reviewedAt: "2024-12-31T12:00:00.000Z", approvalRef: "ref" },
    });
    const noRef = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {
      review: {
        reviewedBy: "test-reviewer@test.local",
        reviewedAt: "2024-12-31T12:00:00.000Z",
        approvalRef: null,
      },
    });
    for (const snap of [noReviewer, noRef]) {
      const bundle = await resolveCanonicalFinancialInputs({
        packageKey: MATTHEWS_PKG.packageKey,
        approvedNs4Snapshot: snap,
      });
      expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
      expect(bundle!.evidenceAuthority).not.toBe("APPROVED_SNAPSHOT");
    }
  });

  it("validated APPROVED aligns bundle publication and fact readiness from same source", async () => {
    const approved = makeTestApprovedNs4SnapshotForPackage(COHERENT_PKG);
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: COHERENT_PKG.packageKey,
      approvedNs4Snapshot: approved,
    });
    expect(bundle!.evidenceAuthority).toBe("APPROVED_SNAPSHOT");
    expect(bundle!.capacityPublication).toBe("GROSS_FROM_APPROVED_SNAPSHOT");
    for (const fact of bundle!.facts) {
      expect(fact.evidenceAuthority).toBe(bundle!.evidenceAuthority);
      if (fact.valueMillions != null) {
        expect(fact.readiness).toBe("AVAILABLE_VERIFIED");
      }
    }
    // Still no verified remaining without utilization completeness
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);
    expect(bundle!.notes.some((n) => /UNKNOWN utilization/i.test(n))).toBe(true);
  });

  it("synthetic package with mismatched APPROVED snapshot stays SYNTHETIC_LABELED", async () => {
    // Snapshot built for Matthews identity cannot approve synthetic package
    const matthewsSnap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: SYNTHETIC_PKG.packageKey,
      approvedNs4Snapshot: matthewsSnap,
    });
    expect(bundle!.evidenceAuthority).toBe("SYNTHETIC_LABELED");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
  });
});
