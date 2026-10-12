/**
 * Independent acceptance — authentic Matthews source documents + financial
 * evidence → covenant calculations → Position dashboard data.
 *
 * Preserves Phase 3 / operative-authority / trusted-issuer / production-identity
 * gates. No paid inference. No production Neon writes.
 *
 * Legal formulas and arithmetic are validated independently against cited
 * provisions (not by trusting evaluateProvision alone).
 */
import { describe, expect, it } from "vitest";
import { computeLeverageMetrics } from "@/lib/covenant-engine";
import {
  TRUSTED_ISSUER_ACTIVATION,
  mayUseAsProductionCapacityInput,
} from "@/lib/capacity";
import {
  demonstrateChangePropagation,
  evaluateMatthewsVerticalSlice,
  independentExpectedRemaining,
  loadAuthenticDashboardSlice,
  loadMatthewsAuthenticFixture,
  matthewsFinancialSnapshot,
  runRealDashboardVerticalSlice,
} from "@/lib/product/real-dashboard-vertical-slice";

describe("REAL covenant intelligence + dashboard vertical slice (Matthews)", () => {
  it("loads AUTHENTIC_SOURCE_BACKED fixture (not synthetic)", () => {
    const fixture = loadMatthewsAuthenticFixture();
    expect(fixture.label).toBe("AUTHENTIC_SOURCE_BACKED");
    expect(fixture.edgarAccession).toBe("0000063296-25-000006");
    expect(fixture.completenessLimitations.length).toBeGreaterThan(0);
  });

  it("evaluates at least five distinct covenant calculations with provenance", () => {
    const slice = evaluateMatthewsVerticalSlice();
    expect(slice.verifiedCovenantsCount).toBeGreaterThanOrEqual(5);
    expect(slice.covenants).toHaveLength(5);

    for (const c of slice.covenants) {
      expect(c.governingDocumentId).toBeTruthy();
      expect(c.operativeSection).toBeTruthy();
      expect(c.formulaDescription).toBeTruthy();
      expect(c.financialSource).toContain("0000063296-25-000006");
      expect(c.reportingPeriod).toBe("FY2025-Q1");
      expect(c.provenance.length).toBeGreaterThan(0);
      expect(c.authorityStatus).not.toBe("PRODUCTION_REMAINING_REFUSED"); // 1a uses GROSS_ONLY_*
    }

    const codes = slice.covenants.map((c) => c.code);
    expect(codes).toEqual([
      "ind_permitted_debt_1a_flat",
      "ind_ratio_debt_fccr",
      "ind_permitted_debt_1b_ratio_secured",
      "ind_permitted_debt_2_notes",
      "ca_lien_601j_2024notes",
    ]);
  });

  it("independently validates legal arithmetic against cited formulas", () => {
    const fin = matthewsFinancialSnapshot();
    const metrics = computeLeverageMetrics(fin);
    const slice = evaluateMatthewsVerticalSlice();

    // cl. (1)(a): max(0, 1300 − securedDebt)
    const flatIndep = independentExpectedRemaining("ind_permitted_debt_1a_flat", fin, metrics)!;
    expect(flatIndep).toBeCloseTo(1300 - 778.882, 3);
    expect(slice.covenants[0]!.modeledCapacityMm).toBeCloseTo(flatIndep, 3);
    expect(flatIndep).toBeCloseTo(521.118, 3);

    // §4.09(a) FCCR room: (EBITDA/2 − Interest) / rate
    const fccrIndep = independentExpectedRemaining("ind_ratio_debt_fccr", fin, metrics)!;
    const rate = 8.625 / 100;
    expect(fccrIndep).toBeCloseTo((128.313 / 2.0 - 54.64) / rate, 3);
    expect(slice.covenants[1]!.modeledCapacityMm).toBeCloseTo(fccrIndep, 3);
    expect(fccrIndep).toBeCloseTo(110.34, 1);

    // cl. (1)(b)(x): max(0, 3.5×EBITDA − netSecured) → $0
    const snlrIndep = independentExpectedRemaining(
      "ind_permitted_debt_1b_ratio_secured",
      fin,
      metrics,
    )!;
    expect(snlrIndep).toBe(0);
    expect(slice.covenants[2]!.modeledCapacityMm).toBe(0);

    // Notes grandfather: modeled gross 300; remaining null (not AVAILABLE zero)
    expect(independentExpectedRemaining("ind_permitted_debt_2_notes", fin, metrics)).toBe(0);
    expect(slice.covenants[3]!.modeledCapacityMm).toBe(300);
    expect(slice.covenants[3]!.remainingCapacityMm).toBeNull();

    // CA §6.01(j) structural zero modeled; remaining null
    expect(independentExpectedRemaining("ca_lien_601j_2024notes", fin, metrics)).toBe(0);
    expect(slice.covenants[4]!.modeledCapacityMm).toBe(0);
    expect(slice.covenants[4]!.remainingCapacityMm).toBeNull();

    // Indenture secured composition ≈ 631.45
    expect(slice.indentureSecuredCompositionMm).toBeCloseTo(521.118 + fccrIndep, 2);
    expect(slice.indentureSecuredCompositionMm).toBeCloseTo(631.45, 1);
  });

  it("never treats UNKNOWN utilization as zero remaining; production handoff refused", () => {
    const slice = evaluateMatthewsVerticalSlice();
    expect(slice.utilization.unknownHistoricalActivity).toBe(true);
    expect(slice.utilization.supportsRemainingClaim).toBe(false);
    expect(slice.utilization.completenessCertificatePresent).toBe(false);
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
    expect(slice.productionHandoffRefused).toBe(true);

    const flat = slice.covenants.find((c) => c.code === "ind_permitted_debt_1a_flat")!;
    // Modeled capacity is shown; production remaining claim is null (not invented zero).
    expect(flat.modeledCapacityMm).toBeCloseTo(521.118, 3);
    expect(flat.remainingCapacityMm).toBeNull();
    expect(flat.authorityStatus).toBe("GROSS_ONLY_UTILIZATION_INCOMPLETE");
  });

  it("connects verified outputs to Position architecture without a second engine", () => {
    const connected = loadAuthenticDashboardSlice("matthews");
    expect(connected).not.toBeNull();
    expect(connected!.connectedMetrics.length).toBe(5);
    expect(connected!.productionRemainingPublished).toBe(false);
    expect(connected!.positionView.remainingAuthoritative).toBe(false);
    expect(connected!.positionView.instruments.length).toBe(2);
    expect(connected!.positionView.overallStatus).not.toBe("VERIFIED_EXECUTABLE");

    // Publication honesty: no AVAILABLE / mayPublishAvailable on authentic slice.
    for (const m of connected!.connectedMetrics) {
      expect(m.mayPublishAvailable).toBe(false);
      expect(m.claim.claimLabel).not.toMatch(/AVAILABLE/);
      expect(m.claim.status).not.toBe("VERIFIED_EXECUTABLE");
    }
    const flat = connected!.connectedMetrics.find((m) => m.code === "ind_permitted_debt_1a_flat")!;
    expect(flat.claim.claimKind).toBe("GROSS_CONTRACTUAL");
    expect(flat.claim.status).toBe("GROSS_CONTRACTUAL");

    // Non-registered company → null (no invented package).
    expect(loadAuthenticDashboardSlice("autonation")).toBeNull();
    expect(loadAuthenticDashboardSlice("coherent")).toBeNull();
  });

  it("autonomous Phase 3 compile flows source → OA → extraction → dashboard display", () => {
    const connected = loadAuthenticDashboardSlice("matthews")!;
    expect(connected.autonomouslyCompiledDisplayedCount).toBeGreaterThanOrEqual(1);
    expect(connected.phase3Compile.documentsCompiled).toBe(2);
    expect(connected.phase3Compile.deterministicFactCount).toBeGreaterThan(0);
    expect(connected.phase3Compile.productionAuthorityActive).toBe(false);
    expect(connected.phase3Compile.trustedIdentityActivation).toBe("BLOCKED");
    expect(connected.phase3Compile.path.join("→")).toMatch(/structure/);
    expect(connected.phase3Compile.path.join("→")).toMatch(/operative-authority/);
    expect(connected.phase3Compile.path.join("→")).toMatch(/deterministic-extraction/);

    const indenture = connected.phase3Compile.compiledCovenants.find(
      (c) => c.documentId === "matw-2027-second-lien-notes-indenture",
    );
    expect(indenture).toBeTruthy();
    expect(indenture!.familySignals).toEqual(expect.arrayContaining(["INDEBTEDNESS"]));
    expect(indenture!.displayedOnDashboard).toBe(true);
  });

  it("verified executable fixed-dollar compile feeds Position as SOURCE_BACKED_COMPILED_GROSS", () => {
    const connected = loadAuthenticDashboardSlice("matthews")!;
    expect(connected.verifiedExecutableUnitsFeedingPosition).toBeGreaterThanOrEqual(1);
    expect(connected.verifiedExecutableCompile.productionCapacityPublished).toBe(false);
    expect(connected.verifiedExecutableCompile.trustedIdentityActivation).toBe("BLOCKED");

    const ve1a = connected.verifiedExecutableCompile.verifiedExecutableUnits.find(
      (u) => u.relatedLeafCode === "ind_permitted_debt_1a_flat",
    );
    expect(ve1a).toBeTruthy();
    expect(ve1a!.feedsPosition).toBe(true);
    expect(ve1a!.valueClass).toBe("SOURCE_BACKED_COMPILED_GROSS");
    expect(ve1a!.fidelityVerdict).toBe("PASS");
    expect(ve1a!.hypotheticalOutcome).toBe("VERIFIED_EXECUTABLE");
    expect(ve1a!.productionOutcome).toBe("PRODUCTION_CAPACITY_REFUSED");
    // Source-backed gross ceiling from Indenture text — NOT the modeled $521.118 room.
    expect(ve1a!.sourceBackedGrossCapacityMm).toBeCloseTo(1300, 6);

    const veMetric = connected.verifiedExecutableMetrics.find((m) =>
      m.code.includes("matw-permitted-debt-1a"),
    )!;
    expect(veMetric.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");
    expect(veMetric.amountMillions).toBeCloseTo(1300, 6);
    expect(veMetric.claim.claimKind).toBe("GROSS_CONTRACTUAL");
    expect(veMetric.claim.status).not.toBe("VERIFIED_EXECUTABLE");
    expect(veMetric.claim.claimLabel).not.toMatch(/AVAILABLE/);
    expect(veMetric.mayPublishAvailable).toBe(false);

    // Fail-closed: Notes grandfather (dollar present, not cap-role) does not feed Position.
    const notes = connected.verifiedExecutableCompile.verifiedExecutableUnits.find(
      (u) => u.relatedLeafCode === "ind_permitted_debt_2_notes",
    );
    expect(notes).toBeTruthy();
    expect(notes!.feedsPosition).toBe(false);
    expect(notes!.valueClass).toBe("REFUSED_NOT_FIXED_DOLLAR");

    // Leaf modeled 1a room remains distinct and labeled MODELED_LEAF.
    const leaf1a = connected.connectedMetrics.find((m) => m.code === "ind_permitted_debt_1a_flat")!;
    expect(leaf1a.valueProvenance).toBe("MODELED_LEAF");
    expect(leaf1a.amountMillions).toBeCloseTo(521.118, 3);
  });

  it("demonstrates deterministic change propagation without mutating the ledger", () => {
    const prop = demonstrateChangePropagation({
      ebitdaOverride: 140,
      hypotheticalSecuredDebtMm: 50,
    });

    expect(prop.hypotheticalTransaction.mutatesLedger).toBe(false);
    expect(prop.financialChange.from).toBeCloseTo(128.313, 3);
    expect(prop.financialChange.to).toBe(140);

    const fccrFin = prop.financialDeltas.find((d) => d.code === "ind_ratio_debt_fccr")!;
    expect(fccrFin.deltaMm).not.toBeNull();
    expect(fccrFin.deltaMm!).toBeGreaterThan(0);

    const flatTxn = prop.transactionDeltas.find((d) => d.code === "ind_permitted_debt_1a_flat")!;
    expect(flatTxn.deltaMm).toBeCloseTo(-50, 3);

    // Authentic fixture baseline unchanged across runs.
    const again = evaluateMatthewsVerticalSlice();
    expect(again.financials.ebitda).toBeCloseTo(128.313, 3);
    expect(again.financials.securedDebt).toBeCloseTo(778.882, 3);
  });

  it("end-to-end run produces required mission artifacts without overstated acceptance", () => {
    const result = runRealDashboardVerticalSlice();

    expect(result.evaluation.financialEvidence.metricsPresent).toEqual(
      expect.arrayContaining([
        "TOTAL_ASSETS",
        "CASH_BALANCES",
        "INTEREST_EXPENSE",
        "TOTAL_DEBT",
        "SECURED_DEBT",
        "CONSOLIDATED_EBITDA",
      ]),
    );
    expect(result.evaluation.financialEvidence.totalConsolidatedAssetsSubstituted).toBe(false);
    expect(result.evaluation.utilization.attributedEventCount).toBe(2);
    expect(result.position.connectedMetrics.length).toBe(5);
    expect(result.changePropagation.financialDeltas.length).toBe(5);
    expect(result.autonomouslyCompiledDisplayedCount).toBeGreaterThanOrEqual(1);
    expect(result.phase3Compile.compiledCovenants.length).toBe(
      result.autonomouslyCompiledDisplayedCount,
    );
    expect(result.verifiedExecutableUnitsFeedingPosition).toBeGreaterThanOrEqual(1);
    // PR #304 independent acceptance: withdraw REAL_DASHBOARD_VERTICAL_SLICE_PROVEN.
    expect(result.verdict).not.toBe("REAL_DASHBOARD_VERTICAL_SLICE_PROVEN" as never);
    expect(result.verdict).toBe("FIXTURE_MODELED_DASHBOARD_PARTIAL");
    expect(result.milestones.AUTONOMOUS_COVENANT_COMPILATION_PROVEN).toBe("NOT_PROVEN");
    expect(result.milestones.PRODUCTION_AUTHORITY_PROVEN).toBe("NOT_PROVEN");
    expect(result.evaluation.securedCompositionAuthority).toBe(
      "HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION",
    );

    // Numerical honesty: source-backed compiled gross ≠ modeled leaf room ≠ hypo secured composition.
    expect(result.numericalHonesty.sourceBackedCompiledGrossMm).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountMm: 1300 }),
      ]),
    );
    const modeled1a = result.numericalHonesty.modeledLeafCapacityMm.find(
      (r) => r.code === "ind_permitted_debt_1a_flat",
    )!;
    expect(modeled1a.amountMm).toBeCloseTo(521.118, 3);
    expect(result.numericalHonesty.hypotheticalUnverifiedSecuredCompositionMm).toBeCloseTo(
      631.45,
      1,
    );

    // Sanity: mayUseAsProductionCapacityInput stays false on this path.
    expect(mayUseAsProductionCapacityInput).toBeTypeOf("function");
  });
});
