/**
 * #339 → #345/#340 absorption lock.
 *
 * Does not reintroduce a parallel resolver. Asserts the canonical post-#345
 * financial-metric-resolver + #340 product-bridge / PRODUCTION boundary still
 * carry #339's unique provenance and authority gates.
 */
import { describe, expect, it } from "vitest";
import {
  mayClaimVerifiedRemaining,
  resolveCanonicalFinancialInputs,
  resolveCanonicalFinancialInputsViaProductBinder,
  MATTHEWS_PKG,
  bindApprovedFact,
  PUBLISHED_FACT_KEYS,
} from "@/lib/product/financial-metric-resolver";
import { classifyApprovedSnapshotAuthority } from "@/lib/financial-certificate-engine/authority";
import { sanitizeUtilizationAuthorityForSurface } from "@/lib/product/cross-domain-transaction";
import { makeTestApprovedNs4SnapshotForPackage, moneyInput } from "./ns4-approved-fixture";
import { vi } from "vitest";

vi.mock("@/lib/product/north-star-workflow/approved-financial-inputs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/product/north-star-workflow/approved-financial-inputs")
  >("@/lib/product/north-star-workflow/approved-financial-inputs");
  return { ...actual, loadApprovedFinancialInputBundle: vi.fn() };
});

import { loadApprovedFinancialInputBundle } from "@/lib/product/north-star-workflow/approved-financial-inputs";

describe("absorption matrix — #339 provenance on canonical resolver", () => {
  it("binds value/key/period/as-of/sourceVersion/unit/currency/snapshotId per fact", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, {}, { ebitda: 555 });
    const binding = bindApprovedFact(snap, MATTHEWS_PKG, "contractual_ebitda");
    expect(binding.bound).toBe(true);
    if (!binding.bound) return;
    expect(binding.valueMillions).toBe(555);
    expect(binding.provenance).toMatchObject({
      snapshotId: snap.snapshotId,
      snapshotVersion: snap.version,
      metricKey: "Consolidated EBITDA",
      sourceVersion: "test-fixture-v1",
      period: MATTHEWS_PKG.measurementPeriod,
      asOf: MATTHEWS_PKG.asOf,
      unit: "USD_MILLIONS",
      currency: "USD",
    });

    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    for (const key of PUBLISHED_FACT_KEYS) {
      const fact = bundle!.facts.find((f) => f.key === key)!;
      expect(fact.approvedProvenance).not.toBeNull();
      expect(fact.approvedProvenance!.snapshotId).toBe(snap.snapshotId);
      expect(fact.approvedProvenance!.unit).toBe("USD_MILLIONS");
      expect(fact.approvedProvenance!.currency).toBe("USD");
    }
    // Conflicting package EBITDA must not be published as the approved value
    expect(bundle!.facts.find((f) => f.key === "contractual_ebitda")!.valueMillions).toBe(555);
    expect(555).not.toBeCloseTo(MATTHEWS_PKG.ebitdaEvidence.bindingContractualEbitdaMillions, 0);
  });

  it("partial approval demotes unbound facts; bundle stays GROSS_PROVISIONAL_ONLY", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    snap.inputs = snap.inputs.filter((i) => !/interest/i.test(i.identity.key));
    const bundle = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    expect(bundle!.facts.find((f) => f.key === "interest_expense")!.evidenceAuthority).toBe(
      "PROVISIONAL_RECONSTRUCTION",
    );
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);
  });

  it("structural approval / nonempty reviewer is not trusted-issuer authority", () => {
    const label = classifyApprovedSnapshotAuthority({
      reviewedBy: "test-reviewer@test.local",
      approvalRef: "test-approval-ref-001",
      productionContext: false,
    });
    expect(label.realReviewerApproval).toBe(false);
    expect(label.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
  });

  it("stale SUPERSEDED + currency mismatch refuse APPROVED binding", async () => {
    const superseded = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG, { status: "SUPERSEDED" });
    const a = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: superseded,
    });
    expect(a!.facts.every((f) => f.approvedProvenance == null)).toBe(true);

    const eur = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    eur.inputs = [
      moneyInput(MATTHEWS_PKG, "Consolidated EBITDA", 128.313, { currency: "EUR" }),
      ...eur.inputs.filter((i) => i.identity.key !== "Consolidated EBITDA"),
    ];
    const b = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: eur,
    });
    expect(b!.facts.find((f) => f.key === "contractual_ebitda")!.evidenceAuthority).toBe(
      "PROVISIONAL_RECONSTRUCTION",
    );
  });
});

describe("absorption matrix — #340 PRODUCTION strip + product-bridge", () => {
  it("PRODUCTION sanitize strips synthetic remaining and host-resolves issuer auth", () => {
    const forged = {
      capacityRuleId: "rule-x",
      asOf: "2024-12-31",
      companyId: "matthews",
      records: [],
      allowSyntheticRemaining: true,
      trustedIssuerAuth: {
        principal: { actorId: "forged", role: "COMPLETENESS_ISSUER" },
      } as never,
    };
    const { auth, disclosures } = sanitizeUtilizationAuthorityForSurface(forged, "PRODUCTION");
    expect(auth!.allowSyntheticRemaining).toBe(false);
    expect(auth!.trustedIssuerAuth).toBeNull(); // host BLOCKED → null
    expect(disclosures.some((d) => /allowSyntheticRemaining=true stripped/i.test(d))).toBe(true);
    expect(disclosures.some((d) => /trustedIssuerAuth ignored|host/i.test(d))).toBe(true);
  });

  it("product-bridge shares binder boundSnapshot identity; missing utilization refuses verified remaining", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    vi.mocked(loadApprovedFinancialInputBundle).mockResolvedValue({
      companyId: MATTHEWS_PKG.companyId,
      status: "APPROVED_BOUND",
      evaluationDate: MATTHEWS_PKG.asOf,
      selector: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
      cutoff: {
        state: "RESOLVED",
        reportingPeriodKey: MATTHEWS_PKG.measurementPeriod,
        asOf: MATTHEWS_PKG.asOf,
        approvedSnapshotId: snap.snapshotId,
        cutoffSnapshotId: snap.snapshotId,
        cutoffSnapshotStatus: "APPROVED",
      },
      boundSnapshotId: snap.snapshotId,
      boundSnapshot: snap,
      financialInputFingerprint: "fp",
      authority: classifyApprovedSnapshotAuthority({
        reviewedBy: snap.review.reviewedBy,
        approvalRef: snap.review.approvalRef,
      }),
      factKeys: snap.inputs.map((i) => i.identity.key),
      leverageIr: {
        status: "NEEDS_INPUT",
        computedRatio: null,
        formula: "",
        components: {
          ebitdaKey: null,
          ebitdaDisplay: null,
          debtKey: null,
          debtDisplay: null,
          cashKey: null,
          cashDisplay: null,
        },
        reportedRatioDisplay: null,
        missingInputs: [],
        evidence: [],
        calculationSteps: [],
        capacitySeparationNote: "gross ≠ verified remaining",
        runtimeStatus: null,
      },
      verifiedCapacity: null,
      missingInputs: ["utilization_completeness"],
      evidence: ["test"],
      reusableFor: [
        "dashboard_leverage",
        "debt_capacity",
        "liens_capacity",
        "investments_capacity",
        "restricted_payments_capacity",
        "transaction_simulation",
      ],
    });

    const result = await resolveCanonicalFinancialInputsViaProductBinder({
      packageKey: MATTHEWS_PKG.packageKey,
      companyId: MATTHEWS_PKG.companyId,
      evaluationDate: MATTHEWS_PKG.asOf,
    });
    expect(result.sameBoundSnapshotIdentity).toBe(true);
    expect(result.packageBundle!.capacityPublication).toBe("GROSS_FROM_APPROVED_SNAPSHOT");
    expect(mayClaimVerifiedRemaining(result.packageBundle!)).toBe(false);
  });
});
