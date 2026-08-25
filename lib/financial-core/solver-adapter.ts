/**
 * Covenant-solver adapter (architecture §L), Phase 7.
 *
 * The ONLY file in lib/financial-core/** permitted to import
 * `SolverNativeCompanyContext`/`FinancialSnapshotInput` from
 * lib/covenant-engine.ts (architecture §U). Populates the solver's real,
 * already-wired live boundary - never rewrites the solver, never moves
 * generic financial calculations into it, never lets it reconstruct a
 * contradictory financial state (task §15).
 *
 * `projectToLegacySnapshot` is the literal mechanism by which "the solver
 * consumes a pro forma state" (architecture §K.3) is realized: it is applied
 * to `runScenario`'s pro forma `FinancialState` output exactly as it is
 * applied to an ACTUAL state - one function, either input (architecture
 * §L.1).
 */

import type { FinancialSnapshotInput, SolverNativeCompanyContext, SolverNativeStaticData } from "../covenant-engine";
import type { ActivationState, BasketUsageRecord, CollateralPoolRef, EntityClass, GuarantorStatus, HistoricalState, LedgerEventRef, Permission, PriorityTier } from "../solver/types";
import type { DebtEvent, FinancialState } from "./types";

export type LegacySnapshotProjection = { status: "OK"; snapshot: FinancialSnapshotInput } | { status: "NOT_COMPUTABLE"; reason: string };

/**
 * architecture §C.2/§L.1 - a pure, one-direction projection from the
 * canonical FinancialState to the legacy/solver-shared 8-field
 * FinancialSnapshotInput. `ebitda` prefers the covenant-defined build-up
 * over the bare GAAP figure (never the reverse - architecture §Y's "GAAP vs.
 * covenant EBITDA never conflated" acceptance case); if BOTH are absent,
 * this returns NOT_COMPUTABLE rather than silently defaulting to zero.
 */
export function projectToLegacySnapshot(state: FinancialState): LegacySnapshotProjection {
  const ebitda = state.covenantMetricFacts.covenantEbitda?.value ?? state.incomeStatementFacts.gaapEbitda?.value;
  if (ebitda === undefined) {
    return { status: "NOT_COMPUTABLE", reason: `FinancialState ${state.id} has neither covenantEbitda nor gaapEbitda - cannot project an ebitda figure for the legacy/solver boundary.` };
  }
  return {
    status: "OK",
    snapshot: {
      ebitda,
      cash: state.balanceSheetFacts.cash.value,
      interestExpense: state.incomeStatementFacts.interestExpense.value,
      cumulativeNetIncome: state.incomeStatementFacts.cumulativeNetIncomeSinceIssue.value,
      equityProceedsSinceIssue: state.incomeStatementFacts.equityProceedsSinceIssue.value,
      assumedNewDebtRatePct: state.covenantMetricFacts.assumedNewDebtRatePct.value,
      totalDebt: state.balanceSheetFacts.totalDebtPrincipal.value,
      securedDebt: state.balanceSheetFacts.securedDebtPrincipal.value,
    },
  };
}

export interface ToSolverNativeContextParams {
  /** NOT financial-core data - read straight from Permission/etc. tables by the caller (architecture §L.1's table), exactly as loadCompanySolverStaticData already does. */
  staticData: SolverNativeStaticData;
  activationState: ActivationState;
  asOfDate: Date;
  entityClasses: EntityClass[];
  incurringEntity: { id: string; name: string };
  guarantorStatus: GuarantorStatus;
  collateralPools: CollateralPoolRef[];
  requestedLienPriority: { poolId: string; priorityTier: PriorityTier; pariPassuWithGroupId?: string }[];
}

/**
 * architecture §L.1's table, realized: every non-static field is supplied by
 * the caller per-request (the proposed transaction's own entity/collateral
 * context - the natural origin, per the architecture, of a `ScenarioAction`
 * under test), never fabricated by this function.
 */
export function toSolverNativeCompanyContext(params: ToSolverNativeContextParams): SolverNativeCompanyContext {
  return {
    permissions: params.staticData.permissions,
    relationships: params.staticData.relationships,
    sharedConstraints: params.staticData.sharedConstraints,
    collateralScopes: params.staticData.collateralScopes,
    ruleActivationConditions: params.staticData.ruleActivationConditions,
    coverageDeclarations: params.staticData.coverageDeclarations,
    activationState: params.activationState,
    asOfDate: params.asOfDate,
    entityClasses: params.entityClasses,
    incurringEntity: params.incurringEntity,
    guarantorStatus: params.guarantorStatus,
    collateralPools: params.collateralPools,
    requestedLienPriority: params.requestedLienPriority,
  };
}

/**
 * architecture §E.3 - turns the financial core's own DebtEvent log into the
 * `HistoricalState` shape the solver's fuller `SolverRequest` vocabulary
 * expects, WITHOUT deciding what the numbers mean contractually (that
 * remains the solver's job). Per architecture §L.2, the live `runSolver`/
 * `RunSolverParams` boundary does not yet accept `historicalState` at all -
 * this function is built and tested so the financial core is ready the
 * moment that boundary closes (a solver-side follow-up), not to work around
 * the gap.
 *
 * Scope note (minimum safe adapter extension, task §15): only
 * `basketUsage`/`priorIncurrences`/`prepayments` are populated from real
 * DebtEvent data (`ISSUANCE`/`REPAYMENT` events carrying `relatedPermissionIds`).
 * `reclassifications`/`redesignations`/`elections`/`stepUpCooldownHistory`
 * are returned empty - no synthetic fixture in this slice exercises
 * RECLASSIFICATION/REDESIGNATION DebtEvents, and inventing that mapping
 * without a real test case to prove it correct would be scope creep beyond
 * "minimum safe adapter/boundary extension."
 */
export function toHistoricalState(events: DebtEvent[], permissions: Permission[]): HistoricalState {
  const basketUsage: BasketUsageRecord[] = permissions
    .map((p): BasketUsageRecord => {
      const relevant = events.filter((e) => (e.relatedPermissionIds ?? []).includes(p.id));
      const cumulativeIncurred = relevant.filter((e) => e.eventType === "ISSUANCE").reduce((s, e) => s + e.amount, 0);
      const repaid = relevant.filter((e) => e.eventType === "REPAYMENT").reduce((s, e) => s + e.amount, 0);
      return { permissionId: p.id, cumulativeIncurred, currentlyOutstanding: Math.max(0, cumulativeIncurred - repaid), prepaymentCredit: 0 };
    })
    .filter((r) => r.cumulativeIncurred > 0 || r.currentlyOutstanding > 0)
    .sort((a, b) => (a.permissionId ?? "").localeCompare(b.permissionId ?? ""));

  const toLedgerRef = (e: DebtEvent): LedgerEventRef => ({ id: e.id, date: e.date, amount: e.amount, description: `${e.eventType} on facility ${e.facilityId}` });

  return {
    basketUsage,
    priorIncurrences: events
      .filter((e) => e.eventType === "ISSUANCE")
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id))
      .map(toLedgerRef),
    prepayments: events
      .filter((e) => e.eventType === "REPAYMENT")
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id))
      .map(toLedgerRef),
    reclassifications: [],
    redesignations: [],
    elections: [],
    stepUpCooldownHistory: [],
  };
}
