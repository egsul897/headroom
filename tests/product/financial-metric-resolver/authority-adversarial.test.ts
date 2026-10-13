/**
 * Adversarial authority + approved-value provenance tests.
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
import { classifyApprovedSnapshotAuthority } from "@/lib/financial-certificate-engine/authority";
import { makeTestApprovedNs4SnapshotForPackage, moneyInput } from "./ns4-approved-fixture";

describe("production API surface — no forceEvidenceAuthority", () => {
  it("does not export forceEvidenceAuthority or a force-override helper", () => {
    expect("forceEvidenceAuthority" in resolverApi).toBe(false);
    const exported = Object.keys(resolverApi);
    expect(exported.some((k) => /forceEvidence/i.test(k))).toBe(false);
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
    expect(bundle!.facts.every((f) => f.approvedProvenance == null)).toBe(true);
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
  });
});

describe("approved-value provenance gate", () => {
  it("disagrees with package figures: publishes snapshot values, never labels package numbers APPROVED", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {}, {
      ebitda: 999,
      totalDebt: 1000,
      securedDebt: 900,
      cash: 50,
      interestExpense: 40,
    });
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });

    const ebitda = bundle!.facts.find((f) => f.key === "contractual_ebitda")!;
    expect(ebitda.valueMillions).toBe(999);
    expect(ebitda.valueMillions).not.toBeCloseTo(MATTHEWS_PKG.ebitdaEvidence.bindingContractualEbitdaMillions, 1);
    expect(ebitda.evidenceAuthority).toBe("APPROVED_SNAPSHOT");
    expect(ebitda.approvedProvenance?.metricKey).toBe("Consolidated EBITDA");
    expect(ebitda.approvedProvenance?.snapshotId).toBe(snap.snapshotId);
    expect(ebitda.approvedProvenance?.unit).toBe("USD_MILLIONS");

    expect(bundle!.legacyFinancialSnapshot?.ebitda).toBe(999);
    expect(bundle!.legacyFinancialSnapshot?.totalDebt).toBe(1000);
    expect(bundle!.notes.some((n) => /approved snapshot value 999/i.test(n))).toBe(true);
  });

  it("structural OK with missing approved inputs: unbound facts stay provisional", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    // Drop secured debt + interest — partial metric approval
    snap.inputs = snap.inputs.filter(
      (i) => !/secured|interest/i.test(i.identity.key),
    );

    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });

    const secured = bundle!.facts.find((f) => f.key === "secured_debt")!;
    const interest = bundle!.facts.find((f) => f.key === "interest_expense")!;
    const ebitda = bundle!.facts.find((f) => f.key === "contractual_ebitda")!;

    expect(ebitda.evidenceAuthority).toBe("APPROVED_SNAPSHOT");
    expect(secured.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
    expect(secured.valueMillions).toBe(MATTHEWS_PKG.securedDebt);
    expect(secured.approvedProvenance).toBeNull();
    expect(interest.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");

    // Bundle cannot claim GROSS_FROM_APPROVED_SNAPSHOT with mixed provisional figures
    expect(bundle!.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);
  });

  it("mismatched units refuse APPROVED binding and retain package provisional values", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    snap.inputs = snap.inputs.map((inp) =>
      inp.identity.key === "Consolidated EBITDA"
        ? moneyInput(MATTHEWS_PKG, "Consolidated EBITDA", 999, { valueType: "NUMBER", currency: "USD" })
        : inp,
    );

    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    const ebitda = bundle!.facts.find((f) => f.key === "contractual_ebitda")!;
    // Falls back to Phase-4A/package computed — provisional
    expect(ebitda.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
    expect(ebitda.approvedProvenance).toBeNull();
    expect(ebitda.valueMillions).toBeCloseTo(MATTHEWS_PKG.ebitdaEvidence.bindingContractualEbitdaMillions, 2);
    expect(bundle!.notes.some((n) => /unit\/type mismatch|not approved-bound/i.test(n))).toBe(true);
  });

  it("stale SUPERSEDED snapshot refuses all APPROVED bindings", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, { status: "SUPERSEDED" });
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    expect(bundle!.facts.every((f) => f.evidenceAuthority === "PROVISIONAL_RECONSTRUCTION")).toBe(true);
    expect(bundle!.facts.every((f) => f.approvedProvenance == null)).toBe(true);
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
  });

  it("missing sourceVersion on inputs refuses APPROVED binding", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    snap.inputs = snap.inputs.map((inp) => ({ ...inp, sourceVersion: null }));
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    expect(bundle!.facts.every((f) => f.approvedProvenance == null)).toBe(true);
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(bundle!.notes.some((n) => /sourceVersion missing/i.test(n))).toBe(true);
  });

  it("nonempty reviewedBy/approvalRef is not trusted-issuer proof", async () => {
    const label = classifyApprovedSnapshotAuthority({
      reviewedBy: "test-reviewer@test.local",
      approvalRef: "test-approval-ref-001",
      productionContext: false,
    });
    expect(label.realReviewerApproval).toBe(false);
    expect(label.kind).toBe("TEST_ATTRIBUTED_APPROVAL");

    const snap = makeTestApprovedNs4SnapshotForPackage(COHERENT_PKG);
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: COHERENT_PKG.packageKey,
      approvedNs4Snapshot: snap,
      productionContext: false,
    });
    expect(bundle!.notes.some((n) => /NOT trusted-issuer|TEST_ATTRIBUTED/i.test(n))).toBe(true);
    // Even when all facts bind, verified remaining stays refused
    expect(bundle!.capacityPublication).toBe("GROSS_FROM_APPROVED_SNAPSHOT");
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);
  });

  it("EUR currency mismatch refuses binding", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    snap.inputs = [
      moneyInput(MATTHEWS_PKG, "Consolidated EBITDA", 128.313, { currency: "EUR" }),
      ...snap.inputs.filter((i) => i.identity.key !== "Consolidated EBITDA"),
    ];
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    expect(bundle!.facts.find((f) => f.key === "contractual_ebitda")!.evidenceAuthority).toBe(
      "PROVISIONAL_RECONSTRUCTION",
    );
  });

  it("Matthews snap cannot approve synthetic package values", async () => {
    const matthewsSnap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: SYNTHETIC_PKG.packageKey,
      approvedNs4Snapshot: matthewsSnap,
    });
    expect(bundle!.evidenceAuthority).toBe("SYNTHETIC_LABELED");
    expect(bundle!.facts.every((f) => f.approvedProvenance == null)).toBe(true);
  });
});

describe("NS-4 structural gates still apply", () => {
  it("DRAFT snapshot does not promote", async () => {
    const draft = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, { status: "DRAFT" });
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: draft,
    });
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(bundle!.facts.every((f) => f.approvedProvenance == null)).toBe(true);
  });

  it("missing reviewer refuses structural gate", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {
      review: { reviewedBy: null, reviewedAt: "2024-12-31T12:00:00.000Z", approvalRef: "ref" },
    });
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
  });
});
