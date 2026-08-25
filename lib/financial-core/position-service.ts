/**
 * Position service (architecture §Q), Phase 9.
 *
 * `getFinancialPosition` is the package's read-side entry point: pure
 * aggregation over the Phase 3-4 engines, given an already-loaded
 * FinancialState/Facility[]/DebtEvent[] (loaded by
 * lib/financial-core-db/adapter.ts, or hand-built by a test fixture) - this
 * file itself stays DB-free (architecture §U).
 */

import { buildCapitalStructureSummary } from "./capital-structure";
import { computeWeightedAverageRatePct, type RateAssumption, computeInterestResult } from "./interest";
import { computeLiquidityPosition } from "./liquidity";
import { computeMaturityAnalytics } from "./maturity";
import { computeGenericFinancialMetrics } from "./metrics";
import { isStale, stalenessDays } from "./provenance";
import type { DebtEvent, Facility, FinancialPosition, FinancialState, ProvenanceIndexEntry, ProvencancedFact } from "./types";

function indexEntry(f: ProvencancedFact<unknown> | undefined, asOfDate: Date): ProvenanceIndexEntry | undefined {
  if (!f) return undefined;
  const stale = isStale(f, asOfDate);
  return { fact: f, isStale: stale, stalenessDays: stale ? stalenessDays(f, asOfDate) : undefined };
}

export function getFinancialPosition(state: FinancialState, facilities: Facility[], events: DebtEvent[], asOfDate: Date, rateAssumptions: RateAssumption[] = []): FinancialPosition {
  const capitalStructureRaw = buildCapitalStructureSummary(state.companyId, asOfDate, facilities, events, state.balanceSheetFacts.cash.value);
  const interest = computeInterestResult(state.companyId, facilities, events, asOfDate, rateAssumptions);
  const capitalStructure = { ...capitalStructureRaw, weightedAverageInterestRatePct: computeWeightedAverageRatePct(interest) };
  const liquidity = computeLiquidityPosition(state, facilities, events, asOfDate);
  const maturities = computeMaturityAnalytics(state.companyId, facilities, events, asOfDate);
  const metrics = computeGenericFinancialMetrics(state, capitalStructure, interest);

  const warnings: FinancialPosition["warnings"] = [];
  if (liquidity.revolverAvailabilityStatus === "UNAVAILABLE_REVIEW_REQUIRED") {
    warnings.push({ category: "MISSING_ASSUMPTION", description: "Revolver/ABL availability is review-required: no certified borrowing-base value on record." });
  }
  if (interest.hasMissingBenchmarkAssumption) {
    warnings.push({ category: "MISSING_ASSUMPTION", description: "One or more floating-rate instruments has no matching benchmark rate assumption; their interest and the company-wide weighted-average rate are unavailable." });
  }
  for (const key of ["genericGrossLeverage", "genericNetLeverage", "genericSecuredLeverage", "genericInterestCoverage"] as const) {
    const m = metrics[key];
    if (m.status !== "OK") warnings.push({ category: "MISSING_ASSUMPTION", description: `${key}: ${m.detail ?? m.status}` });
  }

  const provenanceIndexRaw: Record<string, ProvenanceIndexEntry | undefined> = {
    "balanceSheetFacts.cash": indexEntry(state.balanceSheetFacts.cash, asOfDate),
    "balanceSheetFacts.restrictedCash": indexEntry(state.balanceSheetFacts.restrictedCash, asOfDate),
    "balanceSheetFacts.totalDebtPrincipal": indexEntry(state.balanceSheetFacts.totalDebtPrincipal, asOfDate),
    "balanceSheetFacts.securedDebtPrincipal": indexEntry(state.balanceSheetFacts.securedDebtPrincipal, asOfDate),
    "incomeStatementFacts.gaapEbitda": indexEntry(state.incomeStatementFacts.gaapEbitda, asOfDate),
    "incomeStatementFacts.interestExpense": indexEntry(state.incomeStatementFacts.interestExpense, asOfDate),
    "covenantMetricFacts.covenantEbitda": indexEntry(state.covenantMetricFacts.covenantEbitda?.provenance, asOfDate),
    "liquidityFacts.borrowingBaseValue": indexEntry(state.liquidityFacts?.borrowingBaseValue, asOfDate),
  };
  const provenanceIndex: Record<string, ProvenanceIndexEntry> = {};
  for (const [k, v] of Object.entries(provenanceIndexRaw)) if (v) provenanceIndex[k] = v;

  for (const [key, entry] of Object.entries(provenanceIndex)) {
    if (entry.isStale) warnings.push({ category: "STALE_INPUT", description: `${key} is stale (${entry.stalenessDays} days past its ${entry.fact.staleness!.maxAgeDays}-day window).` });
    if (entry.fact.reviewStatus === "DISPUTED") warnings.push({ category: "DISPUTED_FACT", description: `${key} is DISPUTED.` });
  }

  return {
    companyId: state.companyId,
    asOfDate,
    liquidity,
    capitalStructure,
    metrics,
    interest,
    maturities,
    warnings,
    provenanceIndex,
  };
}
