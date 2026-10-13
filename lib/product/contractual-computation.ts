/**
 * Company-agnostic contractual EBITDA, leverage ratios, and ratio-based debt capacity.
 *
 * Pure computation over verified financial inputs + CovenantProvision rows.
 * Does not branch on company, document, or basket identity.
 * Never invents missing inputs; never substitutes GAAP for contractual EBITDA
 * (callers must supply the contractual/covenant EBITDA figure in `financials.ebitda`).
 */

import {
  computeLeverageMetrics,
  evaluateProvision,
  leverageMetricName,
  type CovenantProvisionInput,
  type EvaluationStatus,
  type FinancialSnapshotInput,
  type LeverageMetrics,
} from "@/lib/covenant-engine";

export type ContractualComputationStatus = "OK" | "MISSING_FINANCIALS";

export interface ContractualRatioTestRow {
  provisionCode: string;
  sectionRef: string;
  basketName: string;
  formulaType: "LEVERAGE_RATIO_ROOM" | "COVERAGE_RATIO_ROOM";
  debtBasis: "total" | "secured" | null;
  metricName: string;
  threshold: number;
  currentRatio: number | null;
  /** Leverage: threshold − current; coverage: current − threshold. Null when not computable. */
  headroom: number | null;
  comparisonDirection: "at_or_below" | "at_or_above";
  /** Gross ratio-room debt capacity ($M). Null when evaluation is not modeled. */
  ratioDebtCapacityMillions: number | null;
  evaluationStatus: EvaluationStatus;
  reason: string | null;
}

export interface ContractualComputationResult {
  status: ContractualComputationStatus;
  missingInputs: string[];
  contractualEbitda: number | null;
  leverage: {
    netDebt: number | null;
    netSecured: number | null;
    totalNetLeverage: number | null;
    seniorSecuredNetLeverage: number | null;
    interestCoverage: number | null;
  };
  ratioTests: ContractualRatioTestRow[];
  notes: string[];
}

function requiredFinancialGaps(fin: FinancialSnapshotInput | null): string[] {
  if (fin == null) {
    return [
      "contractual_ebitda",
      "cash",
      "total_debt",
      "secured_debt",
      "interest_expense",
    ];
  }
  const missing: string[] = [];
  if (!Number.isFinite(fin.ebitda) || fin.ebitda <= 0) missing.push("contractual_ebitda");
  if (!Number.isFinite(fin.cash)) missing.push("cash");
  if (!Number.isFinite(fin.totalDebt)) missing.push("total_debt");
  if (!Number.isFinite(fin.securedDebt)) missing.push("secured_debt");
  if (!Number.isFinite(fin.interestExpense) || fin.interestExpense <= 0) {
    missing.push("interest_expense");
  }
  return missing;
}

/**
 * Compute contractual EBITDA-bound leverage and ratio-based debt capacity.
 * `financials.ebitda` must already be contractual Consolidated EBITDA — never GAAP.
 */
export function computeContractualCovenantMetrics(params: {
  financials: FinancialSnapshotInput | null;
  provisions: CovenantProvisionInput[];
}): ContractualComputationResult {
  const notes: string[] = [
    "EBITDA input is treated as contractual Consolidated EBITDA; GAAP is never substituted here.",
  ];
  const missingInputs = requiredFinancialGaps(params.financials);

  if (params.financials == null || missingInputs.includes("contractual_ebitda")) {
    return {
      status: "MISSING_FINANCIALS",
      missingInputs,
      contractualEbitda: params.financials?.ebitda ?? null,
      leverage: {
        netDebt: null,
        netSecured: null,
        totalNetLeverage: null,
        seniorSecuredNetLeverage: null,
        interestCoverage: null,
      },
      ratioTests: [],
      notes: [
        ...notes,
        "Missing contractual EBITDA or financial snapshot — leverage and ratio capacity not computed.",
      ],
    };
  }

  const fin = params.financials;
  const canLeverage =
    !missingInputs.includes("cash") &&
    !missingInputs.includes("total_debt") &&
    !missingInputs.includes("secured_debt");

  let metrics: LeverageMetrics | null = null;
  let leverage: ContractualComputationResult["leverage"] = {
    netDebt: null,
    netSecured: null,
    totalNetLeverage: null,
    seniorSecuredNetLeverage: null,
    interestCoverage: null,
  };

  if (canLeverage) {
    metrics = computeLeverageMetrics(fin);
    const interestOk = !missingInputs.includes("interest_expense");
    leverage = {
      netDebt: metrics.netDebt,
      netSecured: metrics.netSecured,
      totalNetLeverage: metrics.totalNetLeverage,
      seniorSecuredNetLeverage: metrics.seniorSecuredNetLeverage,
      interestCoverage:
        interestOk && Number.isFinite(metrics.fixedChargeCoverage)
          ? metrics.fixedChargeCoverage
          : null,
    };
  } else {
    notes.push("Leverage ratios require cash, total debt, and secured debt — not invented.");
  }

  const ratioTests: ContractualRatioTestRow[] = [];

  if (metrics == null) {
    return {
      status: "MISSING_FINANCIALS",
      missingInputs,
      contractualEbitda: fin.ebitda,
      leverage,
      ratioTests,
      notes,
    };
  }

  for (const p of params.provisions) {
    if (p.formulaType !== "LEVERAGE_RATIO_ROOM" && p.formulaType !== "COVERAGE_RATIO_ROOM") {
      continue;
    }
    const evaluated = evaluateProvision(p, fin, metrics);
    const debtBasis = p.params?.debtBasis ?? (p.formulaType === "LEVERAGE_RATIO_ROOM" ? "total" : null);
    const currentRatio =
      p.formulaType === "LEVERAGE_RATIO_ROOM"
        ? debtBasis === "secured"
          ? metrics.seniorSecuredNetLeverage
          : metrics.totalNetLeverage
        : !missingInputs.includes("interest_expense")
          ? metrics.fixedChargeCoverage
          : null;

    let headroom: number | null = null;
    if (currentRatio != null && Number.isFinite(currentRatio)) {
      headroom =
        p.formulaType === "LEVERAGE_RATIO_ROOM"
          ? p.thresholdValue - currentRatio
          : currentRatio - p.thresholdValue;
    }

    ratioTests.push({
      provisionCode: p.code,
      sectionRef: p.sectionRef,
      basketName: p.basketName,
      formulaType: p.formulaType,
      debtBasis: debtBasis === "secured" || debtBasis === "total" ? debtBasis : null,
      metricName:
        p.formulaType === "LEVERAGE_RATIO_ROOM"
          ? leverageMetricName(debtBasis === "secured" ? "secured" : "total")
          : "Interest / Fixed Charge Coverage",
      threshold: p.thresholdValue,
      currentRatio,
      headroom,
      comparisonDirection: p.formulaType === "LEVERAGE_RATIO_ROOM" ? "at_or_below" : "at_or_above",
      ratioDebtCapacityMillions:
        evaluated.status === "modeled" &&
        evaluated.capacity != null &&
        Number.isFinite(evaluated.capacity)
          ? evaluated.capacity
          : null,
      evaluationStatus: evaluated.status,
      reason: evaluated.reason ?? null,
    });
  }

  return {
    status: "OK",
    missingInputs: missingInputs.filter((k) => k === "interest_expense"),
    contractualEbitda: fin.ebitda,
    leverage,
    ratioTests,
    notes,
  };
}

/** Build a FinancialSnapshotInput only when all capacity-critical fields are present (fail-closed). */
export function financialSnapshotForContractualComputation(fields: {
  ebitda: number | null;
  cash: number | null;
  interestExpense: number | null;
  cumulativeNetIncome: number | null;
  equityProceedsSinceIssue: number | null;
  assumedNewDebtRatePct: number | null;
  totalDebt: number | null;
  securedDebt: number | null;
  totalAssets?: number | null;
}): FinancialSnapshotInput | null {
  const {
    ebitda,
    cash,
    interestExpense,
    cumulativeNetIncome,
    equityProceedsSinceIssue,
    assumedNewDebtRatePct,
    totalDebt,
    securedDebt,
    totalAssets,
  } = fields;
  if (
    ebitda == null ||
    ebitda <= 0 ||
    cash == null ||
    interestExpense == null ||
    cumulativeNetIncome == null ||
    equityProceedsSinceIssue == null ||
    assumedNewDebtRatePct == null ||
    totalDebt == null ||
    securedDebt == null
  ) {
    return null;
  }
  return {
    ebitda,
    cash,
    interestExpense,
    cumulativeNetIncome,
    equityProceedsSinceIssue,
    assumedNewDebtRatePct,
    totalDebt,
    securedDebt,
    ...(totalAssets != null && totalAssets >= 0 ? { totalAssets } : {}),
  };
}
