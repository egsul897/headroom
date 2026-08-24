/**
 * Phase 7 - explainability / result object (design doc §N).
 *
 * `assembleSolverResult` is the single place a `SolverResult` is built - it
 * consumes only already-computed `PermissionPath`s (from
 * lib/solver/election.ts + lib/solver/status.ts), never re-derives numeric
 * or status logic itself. This keeps the result assembly layer a pure
 * serialization/aggregation step, exactly as design doc §V Phase 5
 * describes it ("no new numeric logic introduced here").
 */

import { aggregateOverallStatus, rejectedAlternatives, selectWinningPath } from "./status";
import type { MaxCapacityResult, PermissionPath, ReviewReasonCategory, SearchStats, SharedConstraint, SolverResult, SourceCitation } from "./types";

function dedupeSources(sources: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  const out: SourceCitation[] = [];
  for (const s of sources) {
    const key = JSON.stringify(s);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

export interface AssembleSolverResultParams {
  paths: PermissionPath[];
  amountTested: number;
  sharedConstraints: SharedConstraint[];
  searchStats: SearchStats;
  maximumCapacity?: MaxCapacityResult;
}

export function assembleSolverResult(params: AssembleSolverResultParams): SolverResult {
  const { paths, amountTested, sharedConstraints, searchStats, maximumCapacity } = params;
  const winner = selectWinningPath(paths);
  const overallStatus = aggregateOverallStatus(paths.map((p) => p.status));
  const alternatives = rejectedAlternatives(paths, winner);

  const allConditions = paths.flatMap((p) => p.conditionsTested);
  const sources = dedupeSources([...paths.flatMap((p) => p.sourceProvisions), ...allConditions.flatMap((c) => (c.sourceProvision ? [c.sourceProvision] : []))]);

  const reviewItems = allConditions
    .filter((c) => c.status === "UNKNOWN" && c.reasonCategory)
    .map((c) => ({ reasonCategory: c.reasonCategory as ReviewReasonCategory, description: c.detail, affectedPermissions: c.scope.permissionId ? [c.scope.permissionId] : [] }));

  return {
    overall: { status: overallStatus, amountTested, maximumCapacity },
    permissionPathUsed: winner,
    constraintsEvaluated: {
      sharedConstraints,
      ratioTests: [],
      eligibilityConditions: allConditions,
      entityCollateralPriorityRequirements: allConditions.filter((c) => c.class === "PRIORITY_CONDITION" || c.class === "COLLATERAL_SCOPE"),
    },
    dynamicRules: { activated: [], parameterChanges: [], predicatesEvaluated: [] },
    inputs: { financialFactsUsed: [], historicalStateUsed: [], externalInputsUsed: [], assumptionsUsed: winner?.assumptionsUsed ?? [] },
    alternatives,
    sources,
    uncertainty: { reviewItems, missingInputs: [], legalJudgmentRequired: [] },
    searchStats,
  };
}

/** design doc §M.1 fail-closed guardrail (task §14): a search-limit-exceeded enumeration is reported as REVIEW_REQUIRED with an explicit reason code, never a silent partial answer. */
export function searchLimitExceededResult(amountTested: number, sharedConstraints: SharedConstraint[], searchStats: SearchStats): SolverResult {
  return {
    overall: { status: "REVIEW_REQUIRED", amountTested },
    constraintsEvaluated: { sharedConstraints, ratioTests: [], eligibilityConditions: [], entityCollateralPriorityRequirements: [] },
    dynamicRules: { activated: [], parameterChanges: [], predicatesEvaluated: [] },
    inputs: { financialFactsUsed: [], historicalStateUsed: [], externalInputsUsed: [], assumptionsUsed: [] },
    alternatives: [],
    sources: [],
    uncertainty: {
      reviewItems: [{ reasonCategory: "SEARCH_LIMIT_EXCEEDED", description: "The number of eligible permissions exceeded the configured election-enumeration cap; the solver did not attempt an unbounded search.", affectedPermissions: [] }],
      missingInputs: [],
      legalJudgmentRequired: [],
    },
    searchStats,
  };
}
