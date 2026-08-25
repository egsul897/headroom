/**
 * Generic financial-metrics engine (architecture §G), Phase 3.
 *
 * Explicitly NOT `computeLeverageMetrics` (lib/covenant-engine.ts), which
 * stays untouched and covenant-metric-shaped. These are ordinary CFO-
 * dashboard ratios, independent of whether any covenant references them
 * (architecture §G.1). Missing/invalid denominators return an explicit
 * status - never zero, never a manufactured Infinity (task §8).
 */

import type { CapitalStructureSummary, FinancialState, GenericFinancialMetrics, InterestResult, MetricResult } from "./types";

function ratio(numerator: number, denominator: number | undefined, missingDetail: string): MetricResult {
  if (denominator === undefined) return { status: "UNAVAILABLE_MISSING_INPUT", value: null, detail: missingDetail };
  if (denominator === 0) return { status: "UNAVAILABLE_INVALID_DENOMINATOR", value: null, detail: `${missingDetail.replace("Missing", "Zero")} (denominator is zero).` };
  return { status: "OK", value: numerator / denominator };
}

function resolveEbitda(state: FinancialState): number | undefined {
  return state.covenantMetricFacts.covenantEbitda?.value ?? state.incomeStatementFacts.gaapEbitda?.value;
}

export function computeGenericFinancialMetrics(state: FinancialState, capitalStructure: CapitalStructureSummary, interest: InterestResult): GenericFinancialMetrics {
  const ebitda = resolveEbitda(state);
  const revenue = state.incomeStatementFacts.revenue?.value;

  return {
    companyId: state.companyId,
    asOfDate: state.asOfDate,
    genericGrossLeverage: ratio(capitalStructure.grossDebt, ebitda, "Missing EBITDA input for generic gross leverage."),
    genericNetLeverage: ratio(capitalStructure.netDebt, ebitda, "Missing EBITDA input for generic net leverage."),
    genericSecuredLeverage: ratio(capitalStructure.securedDebt, ebitda, "Missing EBITDA input for generic secured leverage."),
    genericInterestCoverage:
      ebitda === undefined
        ? { status: "UNAVAILABLE_MISSING_INPUT", value: null, detail: "Missing EBITDA input for generic interest coverage." }
        : ratio(ebitda, interest.totalAnnualizedCashInterest, "Missing annualized cash interest for generic interest coverage."),
    ebitdaMarginPct: (() => {
      if (ebitda === undefined) return { status: "UNAVAILABLE_MISSING_INPUT", value: null, detail: "Missing EBITDA input for EBITDA margin." } as MetricResult;
      const r = ratio(ebitda, revenue, "Missing revenue input for EBITDA margin.");
      return r.status === "OK" ? { status: "OK", value: r.value! * 100 } : r;
    })(),
  };
}
