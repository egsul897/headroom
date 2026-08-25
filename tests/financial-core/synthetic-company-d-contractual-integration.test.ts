/**
 * Synthetic Company D - contractual integration (task §22).
 *
 * Deliberately simple, isolated solver-native contractual fixture - NOT
 * copied from Coherent's permission structure. Executes the full pipeline:
 * persisted financial facts -> FinancialState -> Scenario -> ProFormaState
 * -> financial analytics -> covenant adapter -> EXISTING solver -> unified
 * ScenarioResult, and proves the solver consumed values derived from the
 * SAME pro forma FinancialState the financial engines analyzed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { fact } from "../../lib/financial-core/types";
import type { Scenario } from "../../lib/financial-core/types";
import { loadCompanyFinancialCoreData } from "../../lib/financial-core-db/adapter";
import { runScenarioAgainstCovenants } from "../../lib/financial-core/scenario-service";
import { evaluateContractualCapacity, projectToLegacySnapshot, toSolverNativeCompanyContext } from "../../lib/financial-core/solver-adapter";
import type { CompanyCovenantData, CovenantPosition } from "../../lib/covenant-engine";
import { computeCovenantPosition } from "../../lib/covenant-engine";
import type { ActivationState, Permission, RuleActivationCondition } from "../../lib/solver/types";

const COMPANY_ID = "northgate-synthetic-manufacturing-d";
const AS_OF = new Date("2027-02-01T00:00:00.000Z");

const DOC_CLEAR = "ngsm-d-doc-clear";
const DOC_BLOCKED = "ngsm-d-doc-blocked";
const DOC_REVIEW = "ngsm-d-doc-review";

const PERM_CLEAR = "ngsm-d-perm-clear";
const PERM_BLOCKED = "ngsm-d-perm-blocked";
const PERM_REVIEW = "ngsm-d-perm-review";
const RULE_REVIEW = "ngsm-d-rule-review-gate";
const FAC_BASE = "ngsm-d-existing-term-loan";

async function insertFixture() {
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Northgate Synthetic Manufacturing (synthetic, Company D)" } });

  await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      balanceSheetFacts: { cash: fact(50, "REPORTED", AS_OF), totalDebtPrincipal: fact(100, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF) },
      incomeStatementFacts: { gaapEbitda: fact(200, "REPORTED", AS_OF), cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF), equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF), interestExpense: fact(10, "REPORTED", AS_OF) },
      covenantMetricFacts: { assumedNewDebtRatePct: fact(6.0, "ASSUMED", AS_OF) },
    } as any,
  });

  // A base facility reconciling with balanceSheetFacts.totalDebtPrincipal
  // (100) above - Facility/DebtEvent, not the FinancialState scalar fact, is
  // the source of truth capital-structure.ts's event replay reads from
  // (architecture §D.1's "not a stored current balance" design).
  await prisma.facility.create({
    data: { id: FAC_BASE, companyId: COMPANY_ID, name: "Existing Term Loan", facilityType: "TERM_LOAN", originalPrincipal: 100, secured: false, couponType: "FIXED", couponPct: 6.0, maturityDate: new Date("2030-06-01"), issuedDate: new Date("2026-01-01") },
  });
  await prisma.debtEvent.create({ data: { companyId: COMPANY_ID, facilityId: FAC_BASE, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 100, provenance: fact(100, "REPORTED", AS_OF) as any } });
}

async function teardownFixture() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

function buildCompanyCovenantData(): CompanyCovenantData {
  return {
    companyId: COMPANY_ID,
    documents: [
      { id: DOC_CLEAR, name: "Document (solver-native, clear case)", type: "OTHER", governs: null },
      { id: DOC_BLOCKED, name: "Document (solver-native, blocked case)", type: "OTHER", governs: null },
      { id: DOC_REVIEW, name: "Document (solver-native, review-required case)", type: "OTHER", governs: null },
    ],
    provisions: [],
    // Placeholder - overwritten by the projected pro forma snapshot inside
    // evaluateContractualCapacity via projectToLegacySnapshot (the whole
    // point of this test).
    financials: { ebitda: 1, cash: 1, interestExpense: 1, cumulativeNetIncome: 0, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 0, totalDebt: 1, securedDebt: 0 },
    ledger: [],
  };
}

function buildPermissions(): Permission[] {
  return [
    {
      id: PERM_CLEAR,
      documentId: DOC_CLEAR,
      companyId: COMPANY_ID,
      code: "perm-clear",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 150,
      eligibilityConditions: [],
      termConditions: [],
      measurementBasis: "CUMULATIVE_INCURRED",
      sourceProvision: { documentId: DOC_CLEAR, sectionRef: "§D.1" },
      modelingStatus: "MODELED",
    },
    {
      id: PERM_BLOCKED,
      documentId: DOC_BLOCKED,
      companyId: COMPANY_ID,
      code: "perm-blocked",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt (small basket)",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 50,
      eligibilityConditions: [],
      termConditions: [],
      measurementBasis: "CUMULATIVE_INCURRED",
      sourceProvision: { documentId: DOC_BLOCKED, sectionRef: "§D.2" },
      modelingStatus: "MODELED",
    },
    {
      id: PERM_REVIEW,
      documentId: DOC_REVIEW,
      companyId: COMPANY_ID,
      code: "perm-review",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt (large basket, gated on an unresolved activation predicate)",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500, // would easily CLEAR on amount alone - the point is the gate, not the threshold
      eligibilityConditions: [{ id: "review-gate", description: "Requires a certified covenant-compliance status this fixture deliberately never supplies", kind: "CUSTOM_STATE_PREDICATE", ruleActivationConditionId: RULE_REVIEW }],
      termConditions: [],
      measurementBasis: "CUMULATIVE_INCURRED",
      sourceProvision: { documentId: DOC_REVIEW, sectionRef: "§D.3" },
      modelingStatus: "MODELED",
    },
  ];
}

function buildRuleActivationConditions(): RuleActivationCondition[] {
  return [
    {
      id: RULE_REVIEW,
      companyId: COMPANY_ID,
      appliesTo: { permissionId: PERM_REVIEW },
      predicate: { kind: "POINT_IN_TIME", description: "Certified compliance status on record", seriesKey: "certified_compliance_status", comparator: "gte", threshold: 0 },
      effect: "APPLICABILITY",
      sourceProvision: { documentId: DOC_REVIEW, sectionRef: "§D.3" },
    },
  ];
}

function buildActivationState(): ActivationState {
  // certified_compliance_status is deliberately never supplied - explicit
  // unknown, not absent-because-zero (fail-closed, architecture §I).
  return { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set(["certified_compliance_status"]) };
}

describe("Synthetic Company D - contractual integration (task §22)", () => {
  beforeAll(async () => {
    await teardownFixture();
    await insertFixture();
  });
  afterAll(async () => {
    await teardownFixture();
  });

  it("runs the full pipeline and produces CLEAR / BLOCKED / REVIEW_REQUIRED using the SAME pro forma financial state", async () => {
    const base = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
    const data = buildCompanyCovenantData();
    const position: CovenantPosition = computeCovenantPosition(data);

    const solverContext = toSolverNativeCompanyContext({
      staticData: {
        permissions: buildPermissions(),
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: buildRuleActivationConditions(),
        coverageDeclarations: [
          { documentId: DOC_CLEAR, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true },
          { documentId: DOC_BLOCKED, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true },
          { documentId: DOC_REVIEW, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true },
        ],
      },
      activationState: buildActivationState(),
      asOfDate: AS_OF,
      entityClasses: ["BORROWER"],
      incurringEntity: { id: "borrower", name: "Borrower" },
      guarantorStatus: "GUARANTOR",
      collateralPools: [],
      requestedLienPriority: [],
    });

    // Scenario: a single $80M unsecured debt issuance - the SAME pro forma
    // state (cash 50->130, debt 100->180, EBITDA unchanged at 200) is what
    // financial analytics AND the solver both evaluate below.
    const scenario: Scenario = {
      id: "ngsm-d-scenario",
      companyId: COMPANY_ID,
      baseFinancialStateId: base.state.id,
      actions: [{ kind: "DEBT_ISSUANCE", amount: 80, useOfProceeds: "GENERAL_CORPORATE", facilityDraft: { name: "New Term Loan", facilityType: "TERM_LOAN", secured: false, couponType: "FIXED", couponPct: 6.5, maturityDate: new Date("2031-01-01") } }],
    };

    // --- Case A: CLEAR (document D1, $150M capacity >= $80M requested) ---
    const clearResult = runScenarioAgainstCovenants({
      scenario,
      baseState: base.state,
      baseFacilities: base.facilities,
      baseEvents: base.events,
      asOfDate: AS_OF,
      contractualTest: { data: { ...data, documents: data.documents.filter((d) => d.id === DOC_CLEAR) }, position: { ...position, documents: position.documents.filter((d) => d.documentId === DOC_CLEAR) }, amount: 80, secured: false, solverContext },
    });
    expect(clearResult.contractualImpact?.overallStatus).toBe("clear");
    const clearDoc = (clearResult.contractualImpact!.perDocument as any[])[0];
    expect(clearDoc.solverResult.overall.status).toBe("CLEAR");

    // Financial-analytics side of the pro forma state: cash 50->130,
    // gross debt 100->180 (existing $100M term loan + $80M new issuance).
    expect(clearResult.after.position.liquidity.cash.value).toBe(130);
    expect(clearResult.after.position.capitalStructure.grossDebt).toBe(180);

    // Proves the solver evaluated the SAME pro forma FinancialState the
    // financial engines analyzed above (not a re-derived one): projecting
    // that exact returned state and calling evaluateContractualCapacity
    // directly with it reproduces the identical solver result
    // scenario-service produced internally.
    const projection = projectToLegacySnapshot(clearResult.after.state);
    expect(projection.status).toBe("OK");
    if (projection.status === "OK") {
      expect(projection.snapshot.cash).toBe(130);
      expect(projection.snapshot.totalDebt).toBe(180);
      expect(projection.snapshot.ebitda).toBe(200);
      const crossCheck = evaluateContractualCapacity(
        { ...data, documents: data.documents.filter((d) => d.id === DOC_CLEAR), financials: projection.snapshot },
        { ...position, documents: position.documents.filter((d) => d.documentId === DOC_CLEAR) },
        80,
        false,
        solverContext
      );
      expect(crossCheck.status).toBe(clearResult.contractualImpact?.overallStatus);
      expect(crossCheck.perDocument[0]?.solverResult?.overall.status).toBe(clearDoc.solverResult.overall.status);
      expect(crossCheck.perDocument[0]?.solverResult?.overall.amountTested).toBe(80);
    }

    // --- Case B: BLOCKED (document D2, only $50M capacity < $80M requested) ---
    const blockedResult = runScenarioAgainstCovenants({
      scenario,
      baseState: base.state,
      baseFacilities: base.facilities,
      baseEvents: base.events,
      asOfDate: AS_OF,
      contractualTest: { data: { ...data, documents: data.documents.filter((d) => d.id === DOC_BLOCKED) }, position: { ...position, documents: position.documents.filter((d) => d.documentId === DOC_BLOCKED) }, amount: 80, secured: false, solverContext },
    });
    expect(blockedResult.contractualImpact?.overallStatus).toBe("blocked");

    // --- Case C: financial analytics valid, contractual REVIEW_REQUIRED - never suppresses the valid financial analytics ---
    const reviewResult = runScenarioAgainstCovenants({
      scenario,
      baseState: base.state,
      baseFacilities: base.facilities,
      baseEvents: base.events,
      asOfDate: AS_OF,
      contractualTest: { data: { ...data, documents: data.documents.filter((d) => d.id === DOC_REVIEW) }, position: { ...position, documents: position.documents.filter((d) => d.documentId === DOC_REVIEW) }, amount: 80, secured: false, solverContext },
    });
    expect(reviewResult.contractualImpact?.overallStatus).toBe("review_required");
    expect(reviewResult.contractualImpact?.reviewRequired).toBe(true);
    // The financial analytics themselves are fully valid and NOT suppressed:
    expect(reviewResult.after.position.liquidity.cash.value).toBe(130);
    expect(reviewResult.after.position.capitalStructure.grossDebt).toBe(180);
    expect(reviewResult.after.position.metrics.genericGrossLeverage.status).toBe("OK");
    expect(reviewResult.after.position.metrics.genericGrossLeverage.value).toBeCloseTo(180 / 200, 6);
  });

  it("contractual solver unavailable (no contractualTest) still yields fully valid financial analytics (task §23)", async () => {
    const base = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
    const scenario: Scenario = {
      id: "ngsm-d-no-solver-scenario",
      companyId: COMPANY_ID,
      baseFinancialStateId: base.state.id,
      actions: [{ kind: "CHANGE_EBITDA", ebitdaDelta: 25 }],
    };
    const result = runScenarioAgainstCovenants({ scenario, baseState: base.state, baseFacilities: base.facilities, baseEvents: base.events, asOfDate: AS_OF });
    expect(result.contractualImpact).toBeUndefined();
    expect(result.after.position.metrics.genericGrossLeverage.value).toBeCloseTo(100 / 225, 6);
  });
});
