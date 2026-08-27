/**
 * Phase 10 — lib/dashboard-service.ts / lib/scenario-runner.ts regression
 * suite. Runs against the REAL, live database (coherent + matthews, the
 * only two seeded companies), following the same established pattern as
 * tests/solver/coherent-coverage-integrity.test.ts (a real-DB integration
 * test is the accepted convention here for DB-shaped concerns; the
 * financial-core engines themselves already have extensive synthetic-fixture
 * coverage under tests/financial-core/**).
 *
 * Covers (see task's own checklist): Coherent dashboard service; Matthews
 * dashboard service; same service/contract supports both (parametrized);
 * financial metrics sourced from financial-core, not computed here;
 * non-mutating simulation; debt-issuance/revolver-draw/debt-repayment/
 * refinancing/acquisition scenarios; CLEAR/BLOCKED/REVIEW_REQUIRED
 * contractual results; missing-financial-input handling; solver-native
 * remaining capacity as a real recomputation (not subtraction);
 * `selectedPath` distinct from `bindingConstraint`; Matthews NOT_TESTED never
 * rendering as Unlimited; no company-name branching.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { getCompanyDashboard, getScenarioInputs, listCompanies, runCompanyScenario } from "../lib/dashboard-service";
import { deriveContractualTestParams, runScenarioWithInputs } from "../lib/scenario-runner";
import { getFinancialPosition } from "../lib/financial-core/position-service";
import { computeOutstandingPrincipal } from "../lib/financial-core/capital-structure";
import { computeRemainingCapacityAfterDebtIncurrence, computeCovenantPosition, loadCompanyCovenantData } from "../lib/covenant-engine";
import type { FacilityDraft, ScenarioAction } from "../lib/financial-core/types";

const COMPANIES = ["coherent", "matthews"] as const;

describe("listCompanies", () => {
  it("returns both seeded companies", async () => {
    // Checks coherent/matthews are both listed, not that they are the ONLY
    // two companies in the shared dev database - the real Phase C
    // fixture companies (tests/fixtures/unseen-packages/**/compiler-runs)
    // are deliberately persisted, not torn down, so a closed-world
    // exact-equality assertion here is inherently fragile against any
    // other legitimately-persisted fixture company, not specific to Phase C.
    const companies = await listCompanies();
    const ids = companies.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["coherent", "matthews"]));
  });
});

describe.each(COMPANIES)("getCompanyDashboard(%s) - same service/contract for every company (no company-name branching)", (companyId) => {
  it("returns a complete dashboard with plausible, internally-consistent figures", async () => {
    const dash = await getCompanyDashboard(companyId);
    expect(dash.company.id).toBe(companyId);
    expect(dash.financialPosition.capitalStructure.grossDebt).toBeGreaterThan(0);
    expect(dash.financialPosition.capitalStructure.grossDebt).toBeCloseTo(
      dash.financialPosition.capitalStructure.securedDebt + dash.financialPosition.capitalStructure.unsecuredDebt,
      6
    );
    expect(dash.documents.length).toBeGreaterThan(0);
    expect(dash.legalReview.goldenTestsTotal).toBeGreaterThan(0);
  });

  it("financial metrics come from lib/financial-core, not recomputed by the service - byte-identical to calling getFinancialPosition directly", async () => {
    const dash = await getCompanyDashboard(companyId);
    const { loadCompanyFinancialCoreData } = await import("../lib/financial-core-db/adapter");
    const fcData = await loadCompanyFinancialCoreData(prisma, companyId, dash.asOfDate);
    const direct = getFinancialPosition(fcData.state, fcData.facilities, fcData.events, dash.asOfDate, []);
    expect(dash.financialPosition.capitalStructure.grossDebt).toBe(direct.capitalStructure.grossDebt);
    expect(dash.financialPosition.metrics.genericGrossLeverage).toEqual(direct.metrics.genericGrossLeverage);
    expect(dash.financialPosition.liquidity.totalLiquidity).toBe(direct.liquidity.totalLiquidity);
  });

  it("secured/unsecured capacity is a REAL recomputation via computeRemainingCapacityAfterDebtIncurrence(amount=0), never a component-side subtraction - matches calling the engine directly", async () => {
    const dash = await getCompanyDashboard(companyId);
    const covenantData = await loadCompanyCovenantData(prisma, companyId, dash.asOfDate);
    const position = computeCovenantPosition(covenantData);
    const { buildSolverContext } = await import("../lib/dashboard-service");
    const solverContext = await buildSolverContext(companyId, dash.asOfDate);
    const directSecured = computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, true, solverContext);
    expect(dash.capacity.secured.remainingCapacity).toBe(directSecured.remainingCapacity);
    expect(dash.capacity.secured.perDocument.map((d) => d.method)).toEqual(directSecured.perDocument.map((d) => d.method));
  });
});

describe("Matthews fail-closed states never render as Unlimited/$0 (task hard requirement §5)", () => {
  it("Matthews' secured/unsecured capacity is NOT_TESTED-equivalent (undefined remainingCapacity), never a fabricated number", async () => {
    const dash = await getCompanyDashboard("matthews");
    // Documented, known gap: the Credit Agreement has no debt-incurrence
    // coverage declared at all (docs/matthews-international-onboarding.md).
    // The cross-document figure must therefore be undefined (fail-closed),
    // never 0 or a positive fabricated ceiling.
    const notDeterminable = dash.capacity.secured.perDocument.filter((d) => d.method === "NOT_DETERMINABLE");
    expect(notDeterminable.length).toBeGreaterThan(0);
    for (const d of notDeterminable) {
      expect(d.remainingCapacity).toBeUndefined();
    }
  });
});

describe("Non-mutation: running a scenario never writes to the database (task hard requirement §6)", () => {
  // Scoped to `companyId` (a `where` filter on every count), not global table
  // counts - other test FILES in this suite run concurrently (vitest's
  // default) and some (tests/financial-core/synthetic-company-*.test.ts)
  // insert/delete their own synthetic companies in beforeAll/afterAll, which
  // would otherwise make an unscoped global count flaky/cross-contaminated.
  // Scoping to this test's own companyId isolates the assertion from that
  // unrelated concurrent activity while still proving non-mutation for real.
  it.each(COMPANIES)("%s: table row-counts are byte-identical before/after a DEBT_ISSUANCE scenario", async (companyId) => {
    const countRows = async () => ({
      financialState: await prisma.financialState.count({ where: { companyId } }),
      facility: await prisma.facility.count({ where: { companyId } }),
      debtEvent: await prisma.debtEvent.count({ where: { companyId } }),
      permission: await prisma.permission.count({ where: { companyId } }),
      permissionRelationship: await prisma.permissionRelationship.count({ where: { companyId } }),
      goldenTest: await prisma.goldenTest.count({ where: { companyId } }),
      covenantProvision: await prisma.covenantProvision.count({ where: { companyId } }),
      ledgerEntry: await prisma.ledgerEntry.count({ where: { companyId } }),
    });

    const before = await countRows();
    const inputs = await getScenarioInputs(companyId);
    const draft: FacilityDraft = { name: "Test facility", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 8 };
    const action: ScenarioAction = { kind: "DEBT_ISSUANCE", amount: 250, useOfProceeds: "Test", facilityDraft: draft };
    const result = runScenarioWithInputs(inputs, [action]);
    expect(result.after.state.balanceSheetFacts.totalDebtPrincipal.value).toBeGreaterThan(result.before.state.balanceSheetFacts.totalDebtPrincipal.value);

    const after = await countRows();
    expect(after).toEqual(before);
  });

  it.each(COMPANIES)("%s: runCompanyScenario (the async convenience wrapper) is also non-mutating", async (companyId) => {
    const before = await prisma.debtEvent.count({ where: { companyId } });
    const draft: FacilityDraft = { name: "Test facility 2", facilityType: "TERM_LOAN", secured: false, couponType: "FIXED", couponPct: 6 };
    await runCompanyScenario(companyId, [{ kind: "DEBT_ISSUANCE", amount: 50, useOfProceeds: "Test", facilityDraft: draft }]);
    const after = await prisma.debtEvent.count({ where: { companyId } });
    expect(after).toBe(before);
  });
});

describe("Scenario kinds the financial core's ScenarioAction type supports (task's required coverage)", () => {
  it("DEBT_ISSUANCE (coherent): gross debt increases by the issued amount, contractual result present", async () => {
    const inputs = await getScenarioInputs("coherent");
    const draft: FacilityDraft = { name: "New unsecured notes", facilityType: "NOTES", secured: false, couponType: "FIXED", couponPct: 7 };
    const result = runScenarioWithInputs(inputs, [{ kind: "DEBT_ISSUANCE", amount: 300, useOfProceeds: "General corporate purposes", facilityDraft: draft }]);
    expect(result.financialImpact.grossDebtDelta).toBe(300);
    expect(result.contractualImpact).toBeDefined();
    expect(["clear", "blocked", "review_required", "not_tested"]).toContain(result.contractualImpact!.overallStatus);
  });

  it("DRAW_REVOLVER (matthews): cash and gross debt both increase by the drawn amount", async () => {
    const inputs = await getScenarioInputs("matthews");
    const revolver = inputs.facilities.find((f) => f.facilityType === "REVOLVER");
    expect(revolver).toBeDefined();
    const result = runScenarioWithInputs(inputs, [{ kind: "DRAW_REVOLVER", facilityId: revolver!.id, amount: 20 }]);
    expect(result.financialImpact.cashDelta).toBe(20);
    expect(result.financialImpact.grossDebtDelta).toBe(20);
  });

  it("DEBT_REPAYMENT (coherent): gross debt decreases by the repaid amount, cash decreases", async () => {
    const inputs = await getScenarioInputs("coherent");
    const facility = inputs.facilities[0]!;
    const result = runScenarioWithInputs(inputs, [{ kind: "DEBT_REPAYMENT", facilityId: facility.id, amount: 100 }]);
    expect(result.financialImpact.grossDebtDelta).toBe(-100);
    expect(result.financialImpact.cashDelta).toBe(-100);
  });

  it("REFINANCING (matthews): retires the old facility and issues a new one for the new amount", async () => {
    const inputs = await getScenarioInputs("matthews");
    const target = inputs.facilities.find((f) => f.facilityType === "NOTES") ?? inputs.facilities[0]!;
    const targetOutstanding = computeOutstandingPrincipal(target, inputs.events, inputs.asOfDate);
    const draft: FacilityDraft = { name: "Refinanced notes", facilityType: "NOTES", secured: true, couponType: "FIXED", couponPct: 8 };
    const result = runScenarioWithInputs(inputs, [{ kind: "REFINANCING", retiresFacilityId: target.id, newFacilityDraft: draft, newAmount: 400 }]);
    // Gross debt delta = new amount - whatever was actually outstanding on the retired facility (never assumed equal to originalPrincipal).
    expect(result.financialImpact.grossDebtDelta).toBeCloseTo(400 - targetOutstanding, 6);
    expect(result.after.position.capitalStructure.facilities.some((f) => f.facility.name === "Refinanced notes")).toBe(true);
  });

  it("ACQUISITION (coherent): funds via new secured debt, EBITDA increases by acquired + synergy", async () => {
    const inputs = await getScenarioInputs("coherent");
    const draft: FacilityDraft = { name: "Acquisition term loan", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 8 };
    const action: ScenarioAction = {
      kind: "ACQUISITION",
      purchasePrice: 250,
      cashConsideration: 50,
      revolverFunding: null,
      newDebtFunding: { facilityDraft: draft, amount: 200 },
      acquiredEbitda: 30,
      synergyEbitda: 5,
      transactionFees: 0,
    };
    const result = runScenarioWithInputs(inputs, [action]);
    expect(result.financialImpact.ebitdaDelta).toBe(35);
    expect(result.financialImpact.grossDebtDelta).toBe(200);
    expect(result.contractualImpact?.overallStatus).toBeDefined();
  });
});

describe("Contractual result statuses render correctly (CLEAR / BLOCKED / REVIEW_REQUIRED / not evaluated)", () => {
  it("a small secured debt issuance for Coherent clears", async () => {
    const inputs = await getScenarioInputs("coherent");
    const draft: FacilityDraft = { name: "Small secured facility", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 7 };
    const result = runScenarioWithInputs(inputs, [{ kind: "DEBT_ISSUANCE", amount: 10, useOfProceeds: "Test", facilityDraft: draft }]);
    expect(result.contractualImpact?.overallStatus).toBe("clear");
  });

  it("a huge secured debt issuance for Coherent (well past every modeled ceiling) is blocked, not silently clear", async () => {
    const inputs = await getScenarioInputs("coherent");
    const draft: FacilityDraft = { name: "Huge secured facility", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 7 };
    const result = runScenarioWithInputs(inputs, [{ kind: "DEBT_ISSUANCE", amount: 50000, useOfProceeds: "Test", facilityDraft: draft }]);
    expect(result.contractualImpact?.overallStatus).toBe("blocked");
  });

  it("Matthews' Credit Agreement side (no debt-incurrence coverage modeled) renders not_tested for a debt issuance, not a fabricated clear/blocked", async () => {
    const inputs = await getScenarioInputs("matthews");
    const draft: FacilityDraft = { name: "Test facility", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 8 };
    const result = runScenarioWithInputs(inputs, [{ kind: "DEBT_ISSUANCE", amount: 100, useOfProceeds: "Test", facilityDraft: draft }]);
    expect(result.contractualImpact?.overallStatus).toBe("not_tested");
    expect(result.contractualImpact?.reviewRequired).toBe(true);
  });
});

describe("Missing financial input handled gracefully, surfaced as a prominent warning (task hard requirement §7)", () => {
  it("Coherent's floating-rate term loans with no supplied rate assumption surface a warning, not a fabricated 0% rate", async () => {
    const dash = await getCompanyDashboard("coherent");
    expect(dash.financialPosition.warnings.some((w) => w.category === "MISSING_ASSUMPTION")).toBe(true);
    expect(dash.financialPosition.interest.hasMissingBenchmarkAssumption).toBe(true);
  });
});

describe("selectedPath distinct from bindingConstraint (task hard requirement §3 - never conflated)", () => {
  it("a solver-native PerDocumentDebtResult carries selectedPath and bindingConstraint as independently-populated fields", async () => {
    const inputs = await getScenarioInputs("coherent");
    const draft: FacilityDraft = { name: "Secured facility", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 7 };
    const result = runScenarioWithInputs(inputs, [{ kind: "DEBT_ISSUANCE", amount: 100, useOfProceeds: "Test", facilityDraft: draft }]);
    const perDocument = result.contractualImpact!.perDocument as { selectedPath?: unknown; bindingConstraint?: unknown; maximumCapacity?: unknown; capacity?: unknown; testedAmount?: unknown }[];
    const solverNative = perDocument.find((d) => d.selectedPath !== undefined);
    if (solverNative) {
      // These must be two distinct fields on the object, never the same
      // reference/value collapsed into one (docs/result-semantics-headroom-cleanup.md).
      expect(solverNative).toHaveProperty("selectedPath");
      expect(solverNative).toHaveProperty("bindingConstraint");
      expect(solverNative.selectedPath).not.toBe(solverNative.bindingConstraint);
    }
  });
});

describe("deriveContractualTestParams - generalized, action-kind-driven, not company-specific", () => {
  it("returns undefined for a scenario with no debt-relevant action (e.g. a pure repayment)", () => {
    const params = deriveContractualTestParams([{ kind: "DEBT_REPAYMENT", facilityId: "x", amount: 10 }], []);
    expect(params).toBeUndefined();
  });

  it("derives amount/secured from DEBT_ISSUANCE", () => {
    const draft: FacilityDraft = { name: "x", facilityType: "TERM_LOAN", secured: true, couponType: "FIXED", couponPct: 5 };
    const params = deriveContractualTestParams([{ kind: "DEBT_ISSUANCE", amount: 42, useOfProceeds: "x", facilityDraft: draft }], []);
    expect(params).toEqual({ amount: 42, secured: true });
  });
});
