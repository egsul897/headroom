/**
 * Regression test for a bug discovered during Phase 10 (lib/dashboard-service.ts's
 * own test suite exercising every ScenarioAction kind against real company
 * data first surfaced this): `runScenario`'s REFINANCING action
 * (lib/financial-core/scenario.ts) recorded the NEW facility's funding
 * DebtEvent with `eventType: "REFINANCING"` instead of `"ISSUANCE"`.
 * `computeOutstandingPrincipal` (lib/financial-core/capital-structure.ts)
 * treats a "REFINANCING"-typed event as a RETIREMENT (a positive-magnitude
 * reduction, its own documented convention, the same bucket as REPAYMENT) -
 * so the brand-new facility's balance was floored to zero and the refinanced
 * amount silently vanished from `capitalStructure.grossDebt` entirely. Every
 * other "new facility" action (DEBT_ISSUANCE, DRAW_REVOLVER, ACQUISITION's
 * newDebtFunding) already used "ISSUANCE" correctly - REFINANCING was the
 * one inconsistent case. Fixed by using "ISSUANCE" for the new facility's
 * funding event (keeping `refinancesFacilityId` for provenance).
 */
import { describe, expect, it } from "vitest";
import { runScenario } from "../../lib/financial-core/scenario";
import { computeOutstandingPrincipal } from "../../lib/financial-core/capital-structure";
import { fact } from "../../lib/financial-core/types";
import type { DebtEvent, Facility, FinancialState, Scenario } from "../../lib/financial-core/types";

const COMPANY_ID = "refi-fixture-co";
const AS_OF = new Date("2027-01-01T00:00:00.000Z");

const baseState: FinancialState = {
  id: "refi-state-1",
  companyId: COMPANY_ID,
  asOfDate: AS_OF,
  periodType: "ACTUAL",
  scope: { kind: "CONSOLIDATED" },
  effectiveFrom: null,
  effectiveTo: null,
  balanceSheetFacts: { cash: fact(50, "REPORTED", AS_OF), totalDebtPrincipal: fact(300, "REPORTED", AS_OF), securedDebtPrincipal: fact(300, "REPORTED", AS_OF) },
  incomeStatementFacts: { gaapEbitda: fact(200, "REPORTED", AS_OF), cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF), equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF), interestExpense: fact(20, "REPORTED", AS_OF) },
  covenantMetricFacts: { assumedNewDebtRatePct: fact(7, "ASSUMED", AS_OF) },
};

const oldNotes: Facility = {
  id: "refi-old-notes",
  companyId: COMPANY_ID,
  name: "Old Notes",
  facilityType: "NOTES",
  currency: { code: "USD" },
  originalPrincipal: 300,
  secured: true,
  couponType: "FIXED",
  couponPct: 9,
  issuedDate: new Date("2020-01-01"),
  obligorEntityClasses: [],
  guarantorEntityClasses: [],
  collateralPoolIds: [],
  originatingPermissionIds: [],
  effectiveFrom: null,
  effectiveTo: null,
};

const issuanceEvent: DebtEvent = {
  id: "refi-old-issuance",
  companyId: COMPANY_ID,
  facilityId: oldNotes.id,
  eventType: "ISSUANCE",
  date: new Date("2020-01-01"),
  amount: 300,
  provenance: fact(300, "REPORTED", AS_OF),
};

describe("REFINANCING action - new facility funding correctly counted (regression)", () => {
  it("the new facility's outstanding principal equals the newAmount funded, not zero", () => {
    const scenario: Scenario = {
      id: "refi-scenario",
      companyId: COMPANY_ID,
      baseFinancialStateId: baseState.id,
      actions: [{ kind: "REFINANCING", retiresFacilityId: oldNotes.id, newFacilityDraft: { name: "New Notes", facilityType: "NOTES", secured: true, couponType: "FIXED", couponPct: 8 }, newAmount: 400 }],
    };
    const result = runScenario(scenario, baseState, [oldNotes], [issuanceEvent], AS_OF);
    const newFacility = result.proFormaFacilities.find((f) => f.name === "New Notes");
    expect(newFacility).toBeDefined();
    const outstanding = computeOutstandingPrincipal(newFacility!, result.proFormaEvents, AS_OF);
    expect(outstanding).toBe(400);
  });

  it("gross debt after = newAmount - old outstanding + unrelated pre-existing debt (a clean 300 -> 400 swap here, so grossDebt is unchanged since retiring 300 and issuing 400 nets to +100 on a starting 300 base -> 400)", () => {
    const scenario: Scenario = {
      id: "refi-scenario-2",
      companyId: COMPANY_ID,
      baseFinancialStateId: baseState.id,
      actions: [{ kind: "REFINANCING", retiresFacilityId: oldNotes.id, newFacilityDraft: { name: "New Notes 2", facilityType: "NOTES", secured: true, couponType: "FIXED", couponPct: 8 }, newAmount: 400 }],
    };
    const result = runScenario(scenario, baseState, [oldNotes], [issuanceEvent], AS_OF);
    const totalOutstanding = result.proFormaFacilities.reduce((sum, f) => sum + computeOutstandingPrincipal(f, result.proFormaEvents, AS_OF), 0);
    expect(totalOutstanding).toBe(400); // old (300) retired, new (400) issued - old facility contributes 0, new contributes 400
  });

  it("never mutates the input facilities/events arrays", () => {
    const facilitiesCopy = [oldNotes];
    const eventsCopy = [issuanceEvent];
    const scenario: Scenario = {
      id: "refi-scenario-3",
      companyId: COMPANY_ID,
      baseFinancialStateId: baseState.id,
      actions: [{ kind: "REFINANCING", retiresFacilityId: oldNotes.id, newFacilityDraft: { name: "New Notes 3", facilityType: "NOTES", secured: false, couponType: "FIXED", couponPct: 6 }, newAmount: 250 }],
    };
    runScenario(scenario, baseState, facilitiesCopy, eventsCopy, AS_OF);
    expect(facilitiesCopy).toHaveLength(1);
    expect(eventsCopy).toHaveLength(1);
  });
});
