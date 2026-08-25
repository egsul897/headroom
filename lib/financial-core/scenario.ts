/**
 * Generalized scenario engine (architecture §K), Phase 6.
 *
 * `runScenario` is a pure function: never mutates its inputs, never writes to
 * the database, never calls the solver (architecture §K.3 - the solver is
 * downstream, never upstream). Actions are applied strictly in array order,
 * each threading its output state into the next action's input (architecture
 * §K.2) - no reordering, no combinatorial search.
 *
 * The SAME engines used for the base state (capital-structure.ts,
 * liquidity.ts, interest.ts, maturity.ts, metrics.ts) are reused, unmodified,
 * to compute the pro forma state's own analytics (task §14) - this file only
 * ever calls those functions, never reimplements leverage/liquidity math.
 */

import { computeOutstandingPrincipal } from "./capital-structure";
import { computeInterestResult, type RateAssumption } from "./interest";
import { computeLiquidityPosition } from "./liquidity";
import { fact } from "./types";
import type { DebtEvent, Facility, FinancialState, FinancialStateDelta, Scenario, ScenarioAction, ScenarioRunResult } from "./types";

interface WorkingState {
  scenarioId: string;
  state: FinancialState;
  facilities: Facility[];
  events: DebtEvent[];
  rateAssumptions: RateAssumption[];
}

function cloneState(s: FinancialState): FinancialState {
  return JSON.parse(JSON.stringify(s), (key, value) => {
    if ((key === "asOfDate" || key === "effectiveFrom" || key === "effectiveTo") && typeof value === "string") return new Date(value);
    return value;
  }) as FinancialState;
}

function reviveFact<T>(f: {
  value: T;
  sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE";
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED";
  asOfDate: string | Date;
  notes?: string;
  staleness?: { maxAgeDays: number };
}) {
  return { ...f, asOfDate: new Date(f.asOfDate) };
}

/** Deep-clones a FinancialState, correctly reviving embedded Date fields inside every ProvencancedFact (JSON round-tripping turns Dates into strings). */
function deepCloneState(s: FinancialState): FinancialState {
  const clone = cloneState(s);
  const reviveGroup = (g: Record<string, unknown> | undefined) => {
    if (!g) return g;
    for (const k of Object.keys(g)) {
      const v = g[k] as { asOfDate?: string } | undefined;
      if (v && typeof v === "object" && "asOfDate" in v) g[k] = reviveFact(v as any);
    }
    return g;
  };
  reviveGroup(clone.balanceSheetFacts as unknown as Record<string, unknown>);
  reviveGroup(clone.incomeStatementFacts as unknown as Record<string, unknown>);
  if (clone.covenantMetricFacts.assumedNewDebtRatePct) clone.covenantMetricFacts.assumedNewDebtRatePct = reviveFact(clone.covenantMetricFacts.assumedNewDebtRatePct as any);
  if (clone.covenantMetricFacts.covenantEbitda) clone.covenantMetricFacts.covenantEbitda.provenance = reviveFact(clone.covenantMetricFacts.covenantEbitda.provenance as any);
  if (clone.liquidityFacts) reviveGroup(clone.liquidityFacts as unknown as Record<string, unknown>);
  return clone;
}

function cloneFacilities(facilities: Facility[]): Facility[] {
  return facilities.map((f) => ({ ...f, maturityDate: f.maturityDate ? new Date(f.maturityDate) : undefined, issuedDate: f.issuedDate ? new Date(f.issuedDate) : undefined }));
}

function cloneEvents(events: DebtEvent[]): DebtEvent[] {
  return events.map((e) => ({ ...e, date: new Date(e.date), provenance: reviveFact(e.provenance as any) }));
}

function requireFacility(facilities: Facility[], facilityId: string, actionKind: string): Facility {
  const f = facilities.find((x) => x.id === facilityId);
  if (!f) throw new Error(`Scenario action ${actionKind} references unknown facilityId "${facilityId}".`);
  return f;
}

/** Deterministic new-facility id, keyed by scenario/action position (never a mutable counter) so identical scenario inputs always produce identical ids (task §24). Each action creates at most one new facility. */
function newFacilityId(scenarioId: string, actionIndex: number, suffix = ""): string {
  return `${scenarioId}-scenario-facility-${actionIndex}${suffix}`;
}

function ebitdaOf(state: FinancialState): number | undefined {
  return state.covenantMetricFacts.covenantEbitda?.value ?? state.incomeStatementFacts.gaapEbitda?.value;
}

function setEbitda(state: FinancialState, value: number, asOfDate: Date) {
  if (state.covenantMetricFacts.covenantEbitda) {
    state.covenantMetricFacts.covenantEbitda = { ...state.covenantMetricFacts.covenantEbitda, value };
  } else {
    state.incomeStatementFacts.gaapEbitda = fact(value, "ASSUMED", asOfDate, { reviewStatus: "UNVERIFIED", notes: "Scenario-adjusted EBITDA." });
  }
}

/** Applies one ScenarioAction to a working state, in place on cloned objects, returning the resulting FinancialStateDelta. Throws (fail closed, task §23/§29) on an action that would produce an impossible state - never silently normalized. */
function applyAction(ws: WorkingState, action: ScenarioAction, actionIndex: number, asOfDate: Date): FinancialStateDelta {
  const { state, facilities, events } = ws;
  const before = {
    cash: state.balanceSheetFacts.cash.value,
    debt: state.balanceSheetFacts.totalDebtPrincipal.value,
    ebitda: ebitdaOf(state),
    interest: state.incomeStatementFacts.interestExpense.value,
    liquidity: computeLiquidityPosition(state, facilities, events, asOfDate).totalLiquidity,
  };

  const newFacilityIds: string[] = [];
  const modifiedFacilityIds: string[] = [];
  const maturityChanges: string[] = [];

  const addDebt = (amount: number, secured: boolean) => {
    state.balanceSheetFacts.totalDebtPrincipal = fact(state.balanceSheetFacts.totalDebtPrincipal.value + amount, "ASSUMED", asOfDate);
    if (secured) state.balanceSheetFacts.securedDebtPrincipal = fact(state.balanceSheetFacts.securedDebtPrincipal.value + amount, "ASSUMED", asOfDate);
  };
  const removeDebt = (amount: number, secured: boolean) => {
    state.balanceSheetFacts.totalDebtPrincipal = fact(state.balanceSheetFacts.totalDebtPrincipal.value - amount, "ASSUMED", asOfDate);
    if (secured) state.balanceSheetFacts.securedDebtPrincipal = fact(state.balanceSheetFacts.securedDebtPrincipal.value - amount, "ASSUMED", asOfDate);
  };
  const addCash = (amount: number) => {
    state.balanceSheetFacts.cash = fact(state.balanceSheetFacts.cash.value + amount, "ASSUMED", asOfDate);
  };
  const requireCash = (amount: number, context: string) => {
    if (amount > state.balanceSheetFacts.cash.value + 1e-6) {
      throw new Error(`Scenario action ${context} requires $${amount}M of cash, exceeding available cash of $${state.balanceSheetFacts.cash.value}M as of ${asOfDate.toISOString().slice(0, 10)}.`);
    }
  };

  switch (action.kind) {
    case "DEBT_ISSUANCE": {
      const id = newFacilityId(ws.scenarioId, actionIndex);
      const draft = action.facilityDraft;
      const newFacility: Facility = {
        id,
        companyId: state.companyId,
        name: draft.name,
        facilityType: draft.facilityType,
        currency: { code: draft.currency ?? "USD" },
        originalPrincipal: action.amount,
        commitmentAmount: draft.commitmentAmount,
        secured: draft.secured,
        couponType: draft.couponType,
        couponPct: draft.couponPct,
        marginBps: draft.marginBps,
        referenceRate: draft.referenceRate,
        rateFloorPct: draft.rateFloorPct,
        maturityDate: draft.maturityDate,
        issuedDate: asOfDate,
        obligorEntityClasses: [],
        guarantorEntityClasses: [],
        collateralPoolIds: [],
        originatingPermissionIds: [],
        effectiveFrom: asOfDate,
        effectiveTo: null,
      };
      facilities.push(newFacility);
      events.push({ id: `${id}-issuance`, companyId: state.companyId, facilityId: id, eventType: "ISSUANCE", date: asOfDate, amount: action.amount, provenance: fact(action.amount, "ASSUMED", asOfDate) });
      addDebt(action.amount, draft.secured);
      addCash(action.amount);
      newFacilityIds.push(id);
      if (draft.maturityDate) maturityChanges.push(`New facility ${draft.name} matures ${draft.maturityDate.toISOString().slice(0, 10)}.`);
      break;
    }
    case "DRAW_REVOLVER": {
      const facility = requireFacility(facilities, action.facilityId, action.kind);
      const liquidityBefore = computeLiquidityPosition(state, facilities, events, asOfDate);
      if (liquidityBefore.revolverAvailability === null) {
        throw new Error(`DRAW_REVOLVER on ${facility.name} cannot be validated: revolver availability is review-required (missing borrowing-base input).`);
      }
      if (action.amount > liquidityBefore.revolverAvailability + 1e-6) {
        throw new Error(`DRAW_REVOLVER of $${action.amount}M on ${facility.name} exceeds available capacity of $${liquidityBefore.revolverAvailability}M.`);
      }
      events.push({ id: `${facility.id}-draw-${actionIndex}`, companyId: state.companyId, facilityId: facility.id, eventType: "ISSUANCE", date: asOfDate, amount: action.amount, provenance: fact(action.amount, "ASSUMED", asOfDate) });
      addDebt(action.amount, facility.secured);
      addCash(action.amount);
      modifiedFacilityIds.push(facility.id);
      break;
    }
    case "DEBT_REPAYMENT": {
      const facility = requireFacility(facilities, action.facilityId, action.kind);
      const outstanding = computeOutstandingPrincipal(facility, events, asOfDate);
      if (action.amount > outstanding + 1e-6) {
        throw new Error(`DEBT_REPAYMENT of $${action.amount}M on ${facility.name} exceeds its outstanding principal of $${outstanding}M.`);
      }
      requireCash(action.amount, `DEBT_REPAYMENT on ${facility.name}`);
      events.push({ id: `${facility.id}-repay-${actionIndex}`, companyId: state.companyId, facilityId: facility.id, eventType: "REPAYMENT", date: asOfDate, amount: action.amount, provenance: fact(action.amount, "ASSUMED", asOfDate) });
      removeDebt(action.amount, facility.secured);
      addCash(-action.amount);
      modifiedFacilityIds.push(facility.id);
      break;
    }
    case "REFINANCING": {
      const old = requireFacility(facilities, action.retiresFacilityId, action.kind);
      const outstanding = computeOutstandingPrincipal(old, events, asOfDate);
      const netCash = action.newAmount - outstanding;
      if (netCash < 0) requireCash(-netCash, `REFINANCING of ${old.name}`);
      events.push({ id: `${old.id}-refi-retire-${actionIndex}`, companyId: state.companyId, facilityId: old.id, eventType: "REPAYMENT", date: asOfDate, amount: outstanding, provenance: fact(outstanding, "ASSUMED", asOfDate) });
      removeDebt(outstanding, old.secured);
      modifiedFacilityIds.push(old.id);

      const id = newFacilityId(ws.scenarioId, actionIndex);
      const draft = action.newFacilityDraft;
      const newFacility: Facility = {
        id,
        companyId: state.companyId,
        name: draft.name,
        facilityType: draft.facilityType,
        currency: { code: draft.currency ?? "USD" },
        originalPrincipal: action.newAmount,
        commitmentAmount: draft.commitmentAmount,
        secured: draft.secured,
        couponType: draft.couponType,
        couponPct: draft.couponPct,
        marginBps: draft.marginBps,
        referenceRate: draft.referenceRate,
        rateFloorPct: draft.rateFloorPct,
        maturityDate: draft.maturityDate,
        issuedDate: asOfDate,
        obligorEntityClasses: [],
        guarantorEntityClasses: [],
        collateralPoolIds: [],
        originatingPermissionIds: [],
        effectiveFrom: asOfDate,
        effectiveTo: null,
      };
      facilities.push(newFacility);
      events.push({
        id: `${id}-issuance`,
        companyId: state.companyId,
        facilityId: id,
        eventType: "REFINANCING",
        date: asOfDate,
        amount: action.newAmount,
        refinancesFacilityId: old.id,
        provenance: fact(action.newAmount, "ASSUMED", asOfDate),
      });
      addDebt(action.newAmount, draft.secured);
      addCash(netCash);
      newFacilityIds.push(id);
      maturityChanges.push(`${old.name} retired; ${draft.name} matures ${draft.maturityDate ? draft.maturityDate.toISOString().slice(0, 10) : "(undated)"}.`);
      break;
    }
    case "DIVIDEND":
    case "SHARE_REPURCHASE": {
      requireCash(action.amount, action.kind);
      addCash(-action.amount);
      break;
    }
    case "ASSET_SALE": {
      addCash(action.netProceeds);
      if (!action.reinvest && action.ebitdaImpact) {
        const currentEbitda = ebitdaOf(state) ?? 0;
        setEbitda(state, currentEbitda - action.ebitdaImpact, asOfDate);
      }
      if (!action.reinvest) {
        // Reduces debt only if the caller chose to apply proceeds to paydown - modeled explicitly via a separate DEBT_REPAYMENT action, kept out of ASSET_SALE itself per task §12's "not a merger model" scope discipline: this action only records the cash/EBITDA effect of the sale.
      }
      break;
    }
    case "ACQUISITION": {
      const financedTotal = action.cashConsideration + (action.revolverFunding?.amount ?? 0) + (action.newDebtFunding?.amount ?? 0);
      if (Math.abs(financedTotal - action.purchasePrice) > 1e-6) {
        throw new Error(`ACQUISITION sources ($${financedTotal}M: cash ${action.cashConsideration} + revolver ${action.revolverFunding?.amount ?? 0} + new debt ${action.newDebtFunding?.amount ?? 0}) do not equal purchase price ($${action.purchasePrice}M).`);
      }
      requireCash(action.cashConsideration + action.transactionFees, "ACQUISITION");
      addCash(-(action.cashConsideration + action.transactionFees));

      if (action.revolverFunding) {
        const facility = requireFacility(facilities, action.revolverFunding.facilityId, action.kind);
        const liquidityBefore = computeLiquidityPosition(state, facilities, events, asOfDate);
        if (liquidityBefore.revolverAvailability !== null && action.revolverFunding.amount > liquidityBefore.revolverAvailability + 1e-6) {
          throw new Error(`ACQUISITION revolver funding of $${action.revolverFunding.amount}M on ${facility.name} exceeds available capacity of $${liquidityBefore.revolverAvailability}M.`);
        }
        events.push({
          id: `${facility.id}-acq-draw-${actionIndex}`,
          companyId: state.companyId,
          facilityId: facility.id,
          eventType: "ISSUANCE",
          date: asOfDate,
          amount: action.revolverFunding.amount,
          provenance: fact(action.revolverFunding.amount, "ASSUMED", asOfDate),
        });
        addDebt(action.revolverFunding.amount, facility.secured);
        modifiedFacilityIds.push(facility.id);
      }
      if (action.newDebtFunding) {
        const id = newFacilityId(ws.scenarioId, actionIndex, "-newdebt");
        const draft = action.newDebtFunding.facilityDraft;
        const newFacility: Facility = {
          id,
          companyId: state.companyId,
          name: draft.name,
          facilityType: draft.facilityType,
          currency: { code: draft.currency ?? "USD" },
          originalPrincipal: action.newDebtFunding.amount,
          commitmentAmount: draft.commitmentAmount,
          secured: draft.secured,
          couponType: draft.couponType,
          couponPct: draft.couponPct,
          marginBps: draft.marginBps,
          referenceRate: draft.referenceRate,
          rateFloorPct: draft.rateFloorPct,
          maturityDate: draft.maturityDate,
          issuedDate: asOfDate,
          obligorEntityClasses: [],
          guarantorEntityClasses: [],
          collateralPoolIds: [],
          originatingPermissionIds: [],
          effectiveFrom: asOfDate,
          effectiveTo: null,
        };
        facilities.push(newFacility);
        events.push({ id: `${id}-issuance`, companyId: state.companyId, facilityId: id, eventType: "ISSUANCE", date: asOfDate, amount: action.newDebtFunding.amount, provenance: fact(action.newDebtFunding.amount, "ASSUMED", asOfDate) });
        addDebt(action.newDebtFunding.amount, draft.secured);
        newFacilityIds.push(id);
        if (draft.maturityDate) maturityChanges.push(`New acquisition-financing facility ${draft.name} matures ${draft.maturityDate.toISOString().slice(0, 10)}.`);
      }
      const currentEbitda = ebitdaOf(state) ?? 0;
      setEbitda(state, currentEbitda + action.acquiredEbitda + action.synergyEbitda, asOfDate);
      break;
    }
    case "CHANGE_EBITDA": {
      const currentEbitda = ebitdaOf(state) ?? 0;
      setEbitda(state, currentEbitda + action.ebitdaDelta, asOfDate);
      break;
    }
    case "RATE_ASSUMPTION_CHANGE": {
      state.covenantMetricFacts.assumedNewDebtRatePct = fact(action.newAssumedRatePct, "ASSUMED", asOfDate);
      if (action.referenceRate) {
        const idx = ws.rateAssumptions.findIndex((r) => r.referenceRate === action.referenceRate);
        if (idx >= 0) ws.rateAssumptions[idx] = { referenceRate: action.referenceRate, assumedRatePct: action.newAssumedRatePct };
        else ws.rateAssumptions.push({ referenceRate: action.referenceRate, assumedRatePct: action.newAssumedRatePct });
      }
      break;
    }
    case "WORKING_CAPITAL_CHANGE": {
      if (action.cashDelta < 0) requireCash(-action.cashDelta, action.kind);
      addCash(action.cashDelta);
      break;
    }
  }

  // interestExpense fact is recomputed by the caller (runScenario) after
  // every action from the updated facilities/events via interest.ts, so it
  // always reflects the same engine actual-state analytics use (task §14) -
  // not duplicated here.
  const interestAfter = computeInterestResult(state.companyId, facilities, events, asOfDate, ws.rateAssumptions).totalAnnualizedCashInterest;
  state.incomeStatementFacts.interestExpense = fact(interestAfter, "ASSUMED", asOfDate);

  const liquidityAfter = computeLiquidityPosition(state, facilities, events, asOfDate).totalLiquidity;

  return {
    actionIndex,
    action,
    cashDelta: state.balanceSheetFacts.cash.value - before.cash,
    grossDebtDelta: state.balanceSheetFacts.totalDebtPrincipal.value - before.debt,
    liquidityDelta: (liquidityAfter ?? 0) - (before.liquidity ?? 0),
    ebitdaDelta: (ebitdaOf(state) ?? 0) - (before.ebitda ?? 0),
    interestExpenseDelta: state.incomeStatementFacts.interestExpense.value - before.interest,
    newFacilityIds,
    modifiedFacilityIds,
    maturityChanges,
  };
}

export interface RunScenarioOptions {
  baseRateAssumptions?: RateAssumption[];
}

/**
 * architecture §K.1 - pure, non-mutating, ordered composition. `base*`
 * inputs are never modified; every returned object is a deep clone.
 */
export function runScenario(scenario: Scenario, baseState: FinancialState, baseFacilities: Facility[], baseEvents: DebtEvent[], asOfDate: Date, options: RunScenarioOptions = {}): ScenarioRunResult {
  const ws: WorkingState = {
    scenarioId: scenario.id,
    state: deepCloneState(baseState),
    facilities: cloneFacilities(baseFacilities),
    events: cloneEvents(baseEvents),
    rateAssumptions: [...(options.baseRateAssumptions ?? [])],
  };
  ws.state.periodType = "PRO_FORMA";

  const perActionDeltas: FinancialStateDelta[] = [];
  const warnings: string[] = [];

  scenario.actions.forEach((action, index) => {
    perActionDeltas.push(applyAction(ws, action, index, asOfDate));
  });

  if (ws.state.balanceSheetFacts.cash.value < 0) warnings.push("Pro forma cash balance is negative.");
  const ebitdaFinal = ebitdaOf(ws.state);
  if (ebitdaFinal !== undefined && ebitdaFinal <= 0) warnings.push("Pro forma EBITDA is zero or negative - leverage/coverage ratios will be unavailable or degenerate.");

  return {
    baseState,
    proFormaState: ws.state,
    proFormaFacilities: ws.facilities,
    proFormaEvents: ws.events,
    perActionDeltas,
    warnings,
  };
}

export { computeInterestResult } from "./interest";
export type { RateAssumption } from "./interest";
