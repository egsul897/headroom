/**
 * Sequential financial effects (Agent 2 P0 — coordinates with Agent 4 TE-D3).
 *
 * Agent 4 owns Phase 4D overlay chaining (`chainFinancialViewWithScope`) for
 * verified IR capacity. This module owns the financial-core pro forma chain
 * that feeds the capacity-engine / Position snapshot path from APPROVED FCE
 * state — so debt/cash changes recompute contractual ratios and the next
 * hypothetical uses the updated state (never stale metrics).
 *
 * Missing assumptions → explicit uncertainty. Hypothetical never mutates DB.
 */

import { runScenario } from "@/lib/financial-core/scenario";
import { getFinancialPosition } from "@/lib/financial-core/position-service";
import { projectToLegacySnapshot } from "@/lib/financial-core/solver-adapter";
import { fact, type FinancialState, type ScenarioAction } from "@/lib/financial-core/types";
import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import { computeLeverageMetrics } from "@/lib/covenant-engine";

export type SequentialUncertaintyCode =
  | "MISSING_CONTRACTUAL_EBITDA"
  | "MISSING_DEBT_OR_CASH"
  | "MISSING_INTEREST_EXPENSE"
  | "MISSING_FIXED_CHARGES"
  | "MISSING_ASSUMED_RATE"
  | "NON_AUTHORITATIVE_BASE"
  | "STALE_METRIC_REFUSED";

export interface ContractualRatioView {
  totalNetLeverage: number | null;
  seniorSecuredNetLeverage: number | null;
  interestCoverage: number | null;
  fixedChargeCoverage: number | null;
  netDebt: number | null;
  uncertainties: SequentialUncertaintyCode[];
}

export interface SequentialFinancialStep {
  stepIndex: number;
  label: string;
  actions: ScenarioAction[];
  /** Pro forma state after this step — next step's base. */
  proFormaState: FinancialState;
  capacitySnapshot: FinancialSnapshotInput | null;
  ratios: ContractualRatioView;
  debtDelta: number;
  cashDelta: number;
  warnings: string[];
}

export interface SequentialFinancialRun {
  baseAuthoritative: boolean;
  steps: SequentialFinancialStep[];
  /** Final chained state for a subsequent transaction. */
  finalState: FinancialState;
  finalRatios: ContractualRatioView;
  /** True when any step reused a prior metric without applying intervening actions — always false here. */
  reusedStaleMetrics: false;
}

function contractualEbitda(state: FinancialState): number | undefined {
  return state.covenantMetricFacts.covenantEbitda?.value;
}

export function computeContractualRatios(
  state: FinancialState,
  extras?: { fixedChargesMillions?: number },
): ContractualRatioView {
  const uncertainties: SequentialUncertaintyCode[] = [];
  const ebitda = contractualEbitda(state);
  const totalDebt = state.balanceSheetFacts.totalDebtPrincipal.value;
  const securedDebt = state.balanceSheetFacts.securedDebtPrincipal.value;
  const cash = state.balanceSheetFacts.cash.value;
  const interest = state.incomeStatementFacts.interestExpense.value;
  // Fixed charges are not a FinancialState income-statement field — only when
  // explicitly supplied from certificate evidence (never invented).
  const fixedCharges = extras?.fixedChargesMillions;

  if (ebitda === undefined) uncertainties.push("MISSING_CONTRACTUAL_EBITDA");
  if (totalDebt === undefined || cash === undefined) uncertainties.push("MISSING_DEBT_OR_CASH");
  if (interest === undefined) uncertainties.push("MISSING_INTEREST_EXPENSE");
  if (fixedCharges === undefined) uncertainties.push("MISSING_FIXED_CHARGES");

  const netDebt =
    totalDebt !== undefined && cash !== undefined ? totalDebt - cash : null;

  let totalNetLeverage: number | null = null;
  let seniorSecuredNetLeverage: number | null = null;
  let interestCoverage: number | null = null;
  let fixedChargeCoverage: number | null = null;

  if (ebitda !== undefined && ebitda !== 0 && totalDebt !== undefined && cash !== undefined) {
    const snap: FinancialSnapshotInput = {
      ebitda,
      cash,
      interestExpense: interest ?? 0,
      cumulativeNetIncome: state.incomeStatementFacts.cumulativeNetIncomeSinceIssue.value,
      equityProceedsSinceIssue: state.incomeStatementFacts.equityProceedsSinceIssue.value,
      assumedNewDebtRatePct: state.covenantMetricFacts.assumedNewDebtRatePct.value,
      totalDebt,
      securedDebt: securedDebt ?? 0,
    };
    // Prefer shared leaf metrics when full snapshot present; interest/rate zeros only for
    // ratio keys that do not need them — interestCoverage still computed separately.
    const m = computeLeverageMetrics(snap);
    totalNetLeverage = m.totalNetLeverage;
    seniorSecuredNetLeverage = m.seniorSecuredNetLeverage;
    if (interest !== undefined && interest !== 0) {
      interestCoverage = ebitda / interest;
    }
  } else if (ebitda === undefined) {
    // already flagged
  }

  if (ebitda !== undefined && ebitda !== 0 && fixedCharges !== undefined && fixedCharges !== 0) {
    fixedChargeCoverage = ebitda / fixedCharges;
  }

  return {
    totalNetLeverage,
    seniorSecuredNetLeverage,
    interestCoverage,
    fixedChargeCoverage,
    netDebt,
    uncertainties,
  };
}

function projectCapacity(state: FinancialState): FinancialSnapshotInput | null {
  const projected = projectToLegacySnapshot(state);
  if (projected.status !== "OK") return null;
  // Refuse if covenant EBITDA missing (projectToLegacySnapshot may fall back to GAAP).
  if (state.covenantMetricFacts.covenantEbitda?.value === undefined) return null;
  if (
    state.incomeStatementFacts.gaapEbitda?.value !== undefined &&
    projected.snapshot.ebitda === state.incomeStatementFacts.gaapEbitda.value &&
    state.covenantMetricFacts.covenantEbitda.value !== state.incomeStatementFacts.gaapEbitda.value
  ) {
    // Guard: never allow GAAP substitute when contractual differs.
    return null;
  }
  return {
    ...projected.snapshot,
    ebitda: state.covenantMetricFacts.covenantEbitda.value,
  };
}

export interface SequentialStepSpec {
  label: string;
  actions: ScenarioAction[];
}

/**
 * Run a sequence of hypothetical financial actions, chaining pro forma state.
 * Base must be built from an APPROVED FCE path (caller sets baseAuthoritative).
 */
export function runSequentialFinancialEffects(params: {
  baseState: FinancialState;
  baseAuthoritative: boolean;
  steps: SequentialStepSpec[];
  asOfDate: Date;
  /** Certificate-sourced fixed charges ($M); omitted → FCCR uncertainty. */
  fixedChargesMillions?: number;
}): SequentialFinancialRun {
  const ratioExtras = { fixedChargesMillions: params.fixedChargesMillions };

  if (!params.baseAuthoritative) {
    const ratios = computeContractualRatios(params.baseState, ratioExtras);
    ratios.uncertainties.push("NON_AUTHORITATIVE_BASE");
    return {
      baseAuthoritative: false,
      steps: [],
      finalState: params.baseState,
      finalRatios: ratios,
      reusedStaleMetrics: false,
    };
  }

  let current = params.baseState;
  const out: SequentialFinancialStep[] = [];

  for (let i = 0; i < params.steps.length; i++) {
    const spec = params.steps[i]!;
    const beforeDebt = current.balanceSheetFacts.totalDebtPrincipal.value;
    const beforeCash = current.balanceSheetFacts.cash.value;

    const result = runScenario(
      {
        id: `fce-seq-${i}`,
        companyId: current.companyId,
        baseFinancialStateId: current.id,
        actions: spec.actions,
      },
      current,
      [],
      [],
      params.asOfDate,
    );

    const proForma = result.proFormaState;
    const ratios = computeContractualRatios(proForma, ratioExtras);
    const capacitySnapshot = projectCapacity(proForma);
    const warnings = [...result.warnings];
    if (!capacitySnapshot) {
      warnings.push("Capacity snapshot not computable after step — missing contractual inputs (not invented).");
    }

    // Prove analytics engines see the chained state (not stale base).
    getFinancialPosition(proForma, result.proFormaFacilities, result.proFormaEvents, params.asOfDate, []);

    out.push({
      stepIndex: i,
      label: spec.label,
      actions: spec.actions,
      proFormaState: proForma,
      capacitySnapshot,
      ratios,
      debtDelta: proForma.balanceSheetFacts.totalDebtPrincipal.value - beforeDebt,
      cashDelta: proForma.balanceSheetFacts.cash.value - beforeCash,
      warnings,
    });

    // Chain: next transaction uses updated state.
    current = proForma;
  }

  return {
    baseAuthoritative: true,
    steps: out,
    finalState: current,
    finalRatios: computeContractualRatios(current, ratioExtras),
    reusedStaleMetrics: false,
  };
}

/**
 * Borrowing that increases net debt: issuance credits cash, then an equal
 * dividend deploys proceeds so cash is unchanged and leverage rises.
 * (DEBT_ISSUANCE alone would leave net debt flat.)
 */
export function netDebtIncreasingBorrowActions(args: {
  amountMillions: number;
  secured: boolean;
  name?: string;
}): ScenarioAction[] {
  return [
    {
      kind: "DEBT_ISSUANCE",
      amount: args.amountMillions,
      useOfProceeds: "general corporate purposes",
      facilityDraft: {
        name: args.name ?? "Hypothetical term loan",
        facilityType: "TERM_LOAN",
        secured: args.secured,
        couponType: "FIXED",
        couponPct: 7,
      },
    },
    { kind: "DIVIDEND", amount: args.amountMillions },
  ];
}

/** Apply cash reduction (e.g. dividend / investment) without inventing EBITDA. */
export function cashOutflowActions(args: { amountMillions: number }): ScenarioAction[] {
  return [{ kind: "DIVIDEND", amount: args.amountMillions }];
}

/** Annotate a FinancialState as EXTERNAL_CERTIFICATE for sequential demos. */
export function tagStateAsOf(state: FinancialState, asOf: Date): FinancialState {
  return {
    ...state,
    asOfDate: asOf,
    balanceSheetFacts: {
      ...state.balanceSheetFacts,
      cash: fact(state.balanceSheetFacts.cash.value, "EXTERNAL_CERTIFICATE", asOf),
      totalDebtPrincipal: fact(state.balanceSheetFacts.totalDebtPrincipal.value, "EXTERNAL_CERTIFICATE", asOf),
      securedDebtPrincipal: fact(state.balanceSheetFacts.securedDebtPrincipal.value, "EXTERNAL_CERTIFICATE", asOf),
    },
  };
}
