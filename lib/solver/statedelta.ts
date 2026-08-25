/**
 * Phase 7 - structured hypothetical state output (design doc §L).
 *
 * `buildStateDelta` is a pure function: given a winning election's legs and
 * the pre-transaction financial state, it returns a `StateDelta` describing
 * hypothetical post-transaction state. It never writes to a database, never
 * mutates its inputs, and is called exactly the same way whether the caller
 * ultimately persists the transaction or not - simulation and execution stay
 * structurally separated (task §15), mirroring the existing engine's own
 * posture (`simulateDebtIncurrence` in lib/covenant-engine.ts is already a
 * pure function with no write side effects).
 */

import { computeLeverageMetrics, type FinancialSnapshotInput } from "../covenant-engine";
import { withProFormaDebt } from "./election";
import type { ParameterAdjustment, PermissionPathLeg, SharedConstraintConsumption, StateDelta } from "./types";

export interface BuildStateDeltaParams {
  legs: PermissionPathLeg[];
  financials: FinancialSnapshotInput;
  /** How much of the newly-incurred debt is secured - drives the pro forma senior-secured-net-leverage figure. Defaults to the sum of LIEN-grantType legs' allocations. */
  securedIncrease?: number;
  cashDelta?: number;
  parameterAdjustments?: ParameterAdjustment[];
  sharedConstraintConsumption?: SharedConstraintConsumption[];
}

export function buildStateDelta(params: BuildStateDeltaParams): StateDelta {
  const debtLegs = params.legs.filter((l) => l.grantType === "DEBT_INCURRENCE");
  const debtOutstandingDelta = debtLegs.map((l) => ({ permissionId: l.permissionId, amount: l.amountAllocated }));
  const totalDebtIncrease = debtOutstandingDelta.reduce((sum, d) => sum + d.amount, 0);

  const securedIncrease = params.securedIncrease ?? params.legs.filter((l) => l.grantType === "LIEN").reduce((sum, l) => sum + l.amountAllocated, 0);
  const cashDelta = params.cashDelta ?? 0;

  const adjustedFin: FinancialSnapshotInput = {
    ...withProFormaDebt(params.financials, totalDebtIncrease, securedIncrease),
    cash: params.financials.cash + cashDelta,
  };
  const leverageMetricsProForma = computeLeverageMetrics(adjustedFin);

  const basketUsageDelta = params.legs.map((l) => ({ permissionId: l.permissionId, amount: l.amountAllocated, measurementBasis: l.measurementBasis }));

  const sharedConstraintUsageDelta = (params.sharedConstraintConsumption ?? []).map((c) => ({ constraintId: c.constraintId, amount: c.amountConsumed }));

  const parameterAdjustmentsApplied = (params.parameterAdjustments ?? []).map((p) => ({ affectedPermissionId: p.affectedPermissionId, parameter: p.parameter, before: p.before, after: p.after }));

  return {
    debtOutstandingDelta,
    cashDelta,
    leverageMetricsProForma,
    basketUsageDelta,
    sharedConstraintUsageDelta,
    parameterAdjustmentsApplied: parameterAdjustmentsApplied.length > 0 ? parameterAdjustmentsApplied : undefined,
  };
}
