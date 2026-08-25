/**
 * Scenario service (architecture §R), Phase 9.
 *
 * `runScenarioAgainstCovenants` is the package's write-side (in the sense of
 * "produces a transaction analysis", never actually persists anything)
 * entry point, mirroring lib/solver/service.ts's own `runSolver` single-
 * entry-point pattern: financial engines (Phase 3-6) -> optional covenant-
 * solver adapter (Phase 7, via solver-adapter.ts's `evaluateContractualCapacity`,
 * the only function anywhere in this package permitted to touch
 * `simulateDebtIncurrence`/`runSolver`) -> one combined `ScenarioResult`.
 *
 * The contractual leg is OPTIONAL: a caller with no `CompanyCovenantData`/
 * `CovenantPosition` to test against still gets a complete financial
 * analysis (task §22.C - financial analytics valid even when contractual
 * evaluation is unresolved/unavailable never suppresses them).
 */

import { getFinancialPosition } from "./position-service";
import type { RateAssumption } from "./interest";
import { evaluateContractualCapacity, projectToLegacySnapshot } from "./solver-adapter";
import type { CompanyCovenantData, CovenantPosition, SolverNativeCompanyContext } from "../covenant-engine";
import { runScenario } from "./scenario";
import type { DebtEvent, Facility, FinancialState, Scenario, ScenarioResult, ScenarioWarning } from "./types";
import type { PerDocumentDebtResult } from "../covenant-engine";
import type { SourceCitation } from "../solver/types";

/** architecture §R - deduplicated across the solver's own per-document `sources` (financial-core itself has no independent citation-worthy sources in this slice - its facts are provenance-wrapped, not document-cited). */
function collectSourceTrace(perDocument: PerDocumentDebtResult[]): SourceCitation[] {
  const seen = new Map<string, SourceCitation>();
  for (const doc of perDocument) {
    for (const s of doc.solverResult?.sources ?? []) {
      const key = `${s.documentId}|${s.sectionRef}|${s.permissionId ?? ""}`;
      if (!seen.has(key)) seen.set(key, s);
    }
  }
  return [...seen.values()].sort((a, b) => (a.documentId + a.sectionRef).localeCompare(b.documentId + b.sectionRef));
}

export interface ContractualTestRequest {
  data: CompanyCovenantData;
  position: CovenantPosition;
  amount: number;
  secured: boolean;
  solverContext?: SolverNativeCompanyContext;
}

export interface RunScenarioAgainstCovenantsParams {
  scenario: Scenario;
  baseState: FinancialState;
  baseFacilities: Facility[];
  baseEvents: DebtEvent[];
  asOfDate: Date;
  rateAssumptions?: RateAssumption[];
  /** When supplied, the pro forma state feeds the EXISTING contractual solver via the SAME projection function used for the actual state (architecture §K.3/§L.1) - proving the solver consumed values derived from this scenario's own pro forma output, never a re-derived one. */
  contractualTest?: ContractualTestRequest;
}

export function runScenarioAgainstCovenants(params: RunScenarioAgainstCovenantsParams): ScenarioResult {
  const { scenario, baseState, baseFacilities, baseEvents, asOfDate, rateAssumptions = [], contractualTest } = params;

  const beforePosition = getFinancialPosition(baseState, baseFacilities, baseEvents, asOfDate, rateAssumptions);
  const runResult = runScenario(scenario, baseState, baseFacilities, baseEvents, asOfDate, { baseRateAssumptions: rateAssumptions });
  const afterPosition = getFinancialPosition(runResult.proFormaState, runResult.proFormaFacilities, runResult.proFormaEvents, asOfDate, rateAssumptions);

  const warnings: ScenarioWarning[] = runResult.warnings.map((w) => ({ category: "MISSING_ASSUMPTION", description: w }));
  for (const w of [...beforePosition.warnings, ...afterPosition.warnings]) {
    const category = w.category === "STALE_INPUT" || w.category === "DISPUTED_FACT" ? w.category : "MISSING_ASSUMPTION";
    warnings.push({ category, description: w.description });
  }

  const grossLeverageBefore = beforePosition.metrics.genericGrossLeverage.value;
  const grossLeverageAfter = afterPosition.metrics.genericGrossLeverage.value;
  const netLeverageBefore = beforePosition.metrics.genericNetLeverage.value;
  const netLeverageAfter = afterPosition.metrics.genericNetLeverage.value;

  let contractualImpact: ScenarioResult["contractualImpact"];
  if (contractualTest) {
    const projection = projectToLegacySnapshot(runResult.proFormaState);
    if (projection.status === "NOT_COMPUTABLE") {
      warnings.push({ category: "MISSING_ASSUMPTION", description: `Contractual evaluation skipped: ${projection.reason}` });
      contractualImpact = { overallStatus: "not_tested", perDocument: [], reviewRequired: true };
    } else {
      // The SAME projectToLegacySnapshot function used for the actual state
      // (position-service's interest/metrics engines don't touch it - it is
      // solver-adapter-only) is applied here to the scenario engine's own
      // pro forma output - this is the literal proof point task §21/§22
      // requires: the solver consumes values derived from the SAME pro
      // forma FinancialState the financial engines just analyzed above.
      const sim = evaluateContractualCapacity(
        { ...contractualTest.data, financials: projection.snapshot },
        contractualTest.position,
        contractualTest.amount,
        contractualTest.secured,
        contractualTest.solverContext
      );
      contractualImpact = { overallStatus: sim.status, perDocument: sim.perDocument, reviewRequired: sim.status === "review_required" || sim.status === "not_tested" };
    }
  }

  return {
    scenarioId: scenario.id,
    companyId: scenario.companyId,
    asOfDate,
    actionsApplied: scenario.actions,
    before: { state: baseState, position: beforePosition },
    transaction: { actions: scenario.actions, assumptions: { rateAssumptions } },
    after: { state: runResult.proFormaState, position: afterPosition },
    financialImpact: {
      cashDelta: afterPosition.liquidity.cash.value - beforePosition.liquidity.cash.value,
      grossDebtDelta: afterPosition.capitalStructure.grossDebt - beforePosition.capitalStructure.grossDebt,
      netDebtDelta: afterPosition.capitalStructure.netDebt - beforePosition.capitalStructure.netDebt,
      liquidityDelta: (afterPosition.liquidity.totalLiquidity ?? 0) - (beforePosition.liquidity.totalLiquidity ?? 0),
      ebitdaDelta: runResult.perActionDeltas.reduce((s, d) => s + d.ebitdaDelta, 0),
      interestDelta: afterPosition.interest.totalAnnualizedCashInterest - beforePosition.interest.totalAnnualizedCashInterest,
      leverageDelta: {
        grossLeverageDelta: grossLeverageBefore !== null && grossLeverageAfter !== null ? grossLeverageAfter - grossLeverageBefore : null,
        netLeverageDelta: netLeverageBefore !== null && netLeverageAfter !== null ? netLeverageAfter - netLeverageBefore : null,
      },
      maturityChanges: runResult.perActionDeltas.flatMap((d) => d.maturityChanges),
      perActionDeltas: runResult.perActionDeltas,
    },
    contractualImpact,
    warnings,
    sourceTrace: contractualImpact ? collectSourceTrace(contractualImpact.perDocument as PerDocumentDebtResult[]) : [],
  };
}
