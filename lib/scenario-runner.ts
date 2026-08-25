/**
 * Pure (no DB, no I/O, no `@prisma/client` import - safe to import into a
 * "use client" component) scenario-running logic, split out of
 * lib/dashboard-service.ts specifically so the Simulate page's client
 * component can call it directly against already-loaded `ScenarioInputs`
 * without pulling the Prisma client into the browser bundle and without any
 * further network/DB round-trip per run (task hard requirement §6 - running
 * a scenario must never create real DebtEvent/FinancialState/ledger/
 * Permission/configuration rows; a function with no DB access at all cannot
 * possibly write anything).
 */
import type { CompanyCovenantData, CovenantPosition, SolverNativeCompanyContext } from "./covenant-engine";
import { runScenarioAgainstCovenants, type ContractualTestRequest } from "./financial-core/scenario-service";
import type { DebtEvent, Facility, FinancialState, Scenario, ScenarioAction, ScenarioResult } from "./financial-core/types";

export interface ScenarioInputs {
  companyId: string;
  asOfDate: Date;
  financialState: FinancialState;
  facilities: Facility[];
  events: DebtEvent[];
  covenantData: CompanyCovenantData;
  covenantPosition: CovenantPosition;
  solverContext: SolverNativeCompanyContext;
}

/**
 * Derives the (amount, secured) pair `evaluateContractualCapacity` needs
 * from a scenario's own actions - a generalized, action-kind-driven mapping
 * (not company-specific), covering every debt-relevant `ScenarioAction` kind
 * (task's "support whatever scenario types the financial core's
 * ScenarioAction type already implements"). Returns undefined when no action
 * in the scenario represents a new debt incurrence to contractually test
 * (e.g. a pure-cash ACQUISITION, a DEBT_REPAYMENT, a DIVIDEND) - the
 * contractual leg is optional (lib/financial-core/scenario-service.ts's own
 * design), and the financial analysis still runs in full either way.
 */
export function deriveContractualTestParams(actions: ScenarioAction[], facilities: Facility[]): { amount: number; secured: boolean } | undefined {
  for (const action of actions) {
    switch (action.kind) {
      case "DEBT_ISSUANCE":
        return { amount: action.amount, secured: action.facilityDraft.secured };
      case "DRAW_REVOLVER": {
        const f = facilities.find((f) => f.id === action.facilityId);
        return { amount: action.amount, secured: f?.secured ?? false };
      }
      case "REFINANCING":
        return { amount: action.newAmount, secured: action.newFacilityDraft.secured };
      case "ACQUISITION": {
        if (action.newDebtFunding) return { amount: action.newDebtFunding.amount, secured: action.newDebtFunding.facilityDraft.secured };
        if (action.revolverFunding) {
          const f = facilities.find((f) => f.id === action.revolverFunding!.facilityId);
          return { amount: action.revolverFunding.amount, secured: f?.secured ?? false };
        }
        return undefined;
      }
      default:
        continue;
    }
  }
  return undefined;
}

/**
 * PURE (no DB, no I/O) scenario runner - the function the Simulate page's
 * client component calls directly against already-loaded `ScenarioInputs`,
 * so running a hypothetical transaction never issues a further network/DB
 * call and cannot possibly write anything. Wraps `runScenarioAgainstCovenants`
 * (lib/financial-core/scenario-service.ts) unmodified - this function adds
 * only the contractual-test parameter derivation above, never re-implements
 * the financial or contractual calculation itself.
 */
export function runScenarioWithInputs(inputs: ScenarioInputs, actions: ScenarioAction[]): ScenarioResult {
  const scenario: Scenario = { id: `scenario:${inputs.companyId}:${Date.now()}`, companyId: inputs.companyId, baseFinancialStateId: inputs.financialState.id, actions };
  const contractualParams = deriveContractualTestParams(actions, inputs.facilities);
  const contractualTest: ContractualTestRequest | undefined = contractualParams
    ? { data: inputs.covenantData, position: inputs.covenantPosition, amount: contractualParams.amount, secured: contractualParams.secured, solverContext: inputs.solverContext }
    : undefined;

  return runScenarioAgainstCovenants({
    scenario,
    baseState: inputs.financialState,
    baseFacilities: inputs.facilities,
    baseEvents: inputs.events,
    asOfDate: inputs.asOfDate,
    rateAssumptions: [],
    contractualTest,
  });
}
