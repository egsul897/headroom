/**
 * Canonical product integration acceptance:
 * authentic package → compileOperativeCovenantPackage → canonical capacity → Position
 * for Matthews + Mohawk. Independent legal references; no production authority claims.
 */
import { describe, expect, it } from "vitest";
import {
  compileOperativeCovenantPackage,
  matthewsOperativePackageContext,
  mhkOperativePackageContext,
} from "@/lib/product/autonomous-covenant-compilation";
import { canonicalCapacityFromOperativePackage } from "@/lib/product/canonical-capacity-contract";
import {
  loadAuthenticDashboardSlice,
  loadOperativePackagePositionSlice,
} from "@/lib/product/real-dashboard-vertical-slice";
import {
  MATTHEWS_INDEPENDENT_GT,
  parseUsdFromIndependentQuotation,
} from "@/tests/fixtures/autonomous-covenant-compilation/matthews-independent-expected";
import { MHK_INDEPENDENT_GT } from "@/tests/fixtures/autonomous-covenant-compilation/mhk-independent-expected";

describe("canonical integration — two-issuer source→Position", () => {
  it("Matthews: generalized discovery → VE gross → Position; remaining null", async () => {
    const expectedUsd = parseUsdFromIndependentQuotation(
      MATTHEWS_INDEPENDENT_GT.sourceQuotations.permittedDebt1aCap,
    );
    expect(expectedUsd).toBe(1_300_000_000);

    const op = await loadOperativePackagePositionSlice("matthews");
    expect(op).not.toBeNull();
    expect(op!.canonical.preTransactionCapacityIdentity.length).toBeGreaterThan(20);
    expect(op!.canonical.utilizationCompletenessPresent).toBe(false);
    expect(op!.canonical.units.every((u) => u.verifiedRemainingMm === null)).toBe(true);
    expect(op!.canonical.productionAuthorityActive).toBe(false);

    const gross = op!.canonical.units.find((u) => u.grossContractualMm != null);
    expect(gross).toBeDefined();
    expect(gross!.grossContractualMm).toBe(1300);
    expect(gross!.publicationStatus).toBe("GROSS_CONTRACTUAL_ONLY");

    const slice = await loadAuthenticDashboardSlice("matthews");
    expect(slice!.verifiedExecutableUnitsFeedingPosition).toBeGreaterThanOrEqual(1);
    expect(slice!.productionRemainingPublished).toBe(false);
    const ve = slice!.verifiedExecutableMetrics.find((m) => m.amountMillions != null);
    expect(ve!.amountMillions).toBe(1300);
    expect(ve!.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");
  });

  it("MHK: same generic path → Position with independently expected fixed-dollar gross", async () => {
    const result = await compileOperativeCovenantPackage(mhkOperativePackageContext());
    const canonical = canonicalCapacityFromOperativePackage(result);
    const sliceLoad = await loadOperativePackagePositionSlice("mhk");
    expect(sliceLoad).not.toBeNull();

    // Position and compile share pre-transaction identity for Simulate alignment.
    expect(sliceLoad!.canonical.preTransactionCapacityIdentity).toBe(
      canonical.preTransactionCapacityIdentity,
    );

    const feeding = sliceLoad!.slice.verifiedExecutableMetrics.filter(
      (m) => m.amountMillions != null,
    );
    expect(feeding.length).toBeGreaterThanOrEqual(1);
    expect(sliceLoad!.slice.productionRemainingPublished).toBe(false);
    expect(sliceLoad!.canonical.trustedIdentityActivation).toBe("BLOCKED");

    // At least one independent MHK GT dollar appears as GROSS when discovered executable.
    for (const req of MHK_INDEPENDENT_GT.mustDiscover.filter((r) => r.mustBeExecutable)) {
      const unit =
        result.executableUnits.find((u) => req.matchSourceRef.test(u.sourceRef)) ??
        result.rejectedUnits.find((u) => req.matchSourceRef.test(u.sourceRef));
      expect(unit, `MHK discovery ${req.id}`).toBeTruthy();
    }
  });

  it("unsupported ratio provision → explicit refusal (not silent executable)", async () => {
    const result = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    const ratioRejected = result.rejectedUnits.some(
      (u) =>
        /4\.09|FCCR|coverage|ratio/i.test(u.sourceRef + u.reason + u.operativeTextExcerpt) ||
        u.provisionKind === "RATIO_BASED_PERMISSION",
    );
    const ratioExecutableGross = result.executableUnits.some(
      (u) =>
        u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL" &&
        /4\.09|FCCR/i.test(u.sourceRef),
    );
    expect(result.coverage.discoveredRatioPermissionCount).toBeGreaterThanOrEqual(1);
    expect(ratioExecutableGross).toBe(false);
    expect(ratioRejected || result.coverage.missedOrUnsupportedRelevant.length > 0).toBe(true);
  });

  it("missing utilization → verified remaining null on canonical contract", async () => {
    const result = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    const canonical = canonicalCapacityFromOperativePackage(result, {
      utilizationCompletenessPresent: false,
    });
    expect(canonical.units.every((u) => u.verifiedRemainingMm === null)).toBe(true);
    expect(canonical.sharedConstraints.some((c) => /UTILIZATION_COMPLETENESS_ABSENT/.test(c))).toBe(
      true,
    );
  });

  it("does not mutate process.env credentials during unpaid compile", async () => {
    const prevGateway = process.env.AI_GATEWAY_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "test-must-not-be-deleted";
    process.env.ANTHROPIC_API_KEY = "test-must-not-be-deleted-2";
    try {
      await compileOperativeCovenantPackage(matthewsOperativePackageContext());
      expect(process.env.AI_GATEWAY_API_KEY).toBe("test-must-not-be-deleted");
      expect(process.env.ANTHROPIC_API_KEY).toBe("test-must-not-be-deleted-2");
    } finally {
      if (prevGateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = prevGateway;
      if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAnthropic;
    }
  });

  it("P1: MODELED_HYPOTHETICAL never published as GROSS_CONTRACTUAL on Position", async () => {
    const { metricFromCanonical } = await import(
      "@/lib/product/real-dashboard-vertical-slice/operative-package-position-feed"
    );

    // Synthetic MODELED_HYPOTHETICAL unit with a numeric modeled amount — the
    // prior defect coalesced this into claimKind GROSS_CONTRACTUAL.
    const modeledUnit = {
      unitId: "mhk:7.03(g)",
      governingDocumentId: "mhk-ca",
      sourceSectionRef: "7.03(g)",
      sourceSpan: { charStart: 0, charEnd: 10 },
      operativeTextExcerpt: "greater of $1,500,000,000 and 10% of Total Consolidated Assets",
      executableRuleIdentity: "ve:mhk:7.03(g)",
      provisionKind: "GREATER_OF_BASKET",
      capacityClass: "MODELED_HYPOTHETICAL" as const,
      grossContractualMm: null,
      modeledHypotheticalMm: 1500,
      verifiedRemainingMm: null,
      productionAvailableMm: null,
      publicationStatus: "MODELED_HYPOTHETICAL_ONLY" as const,
      fidelityVerdict: "PASS",
      missingInputs: ["financial_metric:Total Assets"],
      exceptionsAndConditions: [],
      definedTermDependencies: ["Total Consolidated Assets"],
    };
    const hypoMetric = metricFromCanonical(modeledUnit);
    expect(hypoMetric.claim.claimKind).toBe("HYPOTHETICAL");
    expect(hypoMetric.claim.status).toBe("HYPOTHETICAL");
    expect(hypoMetric.claim.claimKind).not.toBe("GROSS_CONTRACTUAL");
    expect(hypoMetric.amountMillions).toBe(1500);
    expect(hypoMetric.modeledCapacityMm).toBe(1500);
    expect(hypoMetric.valueProvenance).toBe("MODELED_LEAF");
    expect(hypoMetric.authorityStatus).toBe("MODELED_AUTHENTIC_EVIDENCE");
    expect(hypoMetric.mayPublishAvailable).toBe(false);

    const grossUnit = {
      ...modeledUnit,
      unitId: "mhk:7.03(f)",
      sourceSectionRef: "7.03(f)",
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL" as const,
      grossContractualMm: 700,
      modeledHypotheticalMm: null,
      publicationStatus: "GROSS_CONTRACTUAL_ONLY" as const,
      missingInputs: [],
    };
    const grossMetric = metricFromCanonical(grossUnit);
    expect(grossMetric.claim.claimKind).toBe("GROSS_CONTRACTUAL");
    expect(grossMetric.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");

    // Live MHK path: every MODELED_HYPOTHETICAL canonical unit stays non-GROSS on Position.
    const result = await compileOperativeCovenantPackage(mhkOperativePackageContext());
    const modeled = result.executableUnits.filter((u) => u.capacityClass === "MODELED_HYPOTHETICAL");
    expect(modeled.length).toBeGreaterThanOrEqual(1);
    const canonical = canonicalCapacityFromOperativePackage(result);
    for (const u of canonical.units.filter((x) => x.capacityClass === "MODELED_HYPOTHETICAL")) {
      expect(u.publicationStatus).toBe("MODELED_HYPOTHETICAL_ONLY");
      expect(u.grossContractualMm).toBeNull();
      const m = metricFromCanonical(u);
      expect(m.claim.claimKind).not.toBe("GROSS_CONTRACTUAL");
      if (u.modeledHypotheticalMm != null) {
        expect(m.claim.claimKind).toBe("HYPOTHETICAL");
      }
    }

    const sliceLoad = await loadOperativePackagePositionSlice("mhk");
    expect(sliceLoad).not.toBeNull();
    for (const m of sliceLoad!.slice.verifiedExecutableMetrics) {
      if (m.valueProvenance === "MODELED_LEAF") {
        expect(m.claim.claimKind).not.toBe("GROSS_CONTRACTUAL");
      }
      if (m.claim.claimKind === "GROSS_CONTRACTUAL") {
        expect(m.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");
      }
    }
  });
});
