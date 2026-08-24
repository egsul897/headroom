/**
 * Phase 7 - service layer entry point.
 *
 * `runSolver` is the single function a caller (a route, a test fixture) uses
 * to go from a bounded permission graph + a specific transaction to a full
 * `SolverResult` - election enumeration (Phase 6) -> per-election
 * feasibility (Phase 6) -> path status (Phase 5) -> StateDelta (this file's
 * sibling, lib/solver/statedelta.ts) -> result assembly (lib/solver/result.ts).
 * `computeMaximumCapacity` answers the "how much could this transaction be"
 * question (design doc §O) using the same underlying election set.
 *
 * This module intentionally does NOT import anything from
 * lib/covenant-engine.ts's composition layer (`computeCovenantPosition`,
 * `combineCrossDocument`, `evalExpr`) and is never called from it - the
 * "zero Permission rows -> zero behavior change" guarantee holds because
 * this file is purely additive and nothing existing calls it (design doc
 * §Q.4 step 3: "Build the election-enumeration solver as new, additive
 * functions... Nothing existing calls them yet"). Wiring a live coverage-gate
 * branch into `computeCovenantPosition`'s per-document loop is design doc §V
 * Phase 6 (DB adapter + coverage-gate wiring) - out of this task's Phase
 * 0-7 scope; lib/solver/coverage.ts (Phase 3) already proves the gate
 * predicate itself is correct and safe in isolation.
 */

import { computeLeverageMetrics, type FinancialSnapshotInput } from "../covenant-engine";
import { buildPermissionGraph } from "./graph";
import { buildPermissionPaths, computeElectionMaxCapacityBisected, enumerateElections, evaluateElection, permissionAsProvision, type EligibilityContext } from "./election";
import { evaluateProvision } from "../covenant-engine";
import { assembleSolverResult, searchLimitExceededResult } from "./result";
import { buildStateDelta } from "./statedelta";
import type {
  ActivationState,
  EntityClass,
  MaxCapacityResult,
  Permission,
  PermissionCollateralScope,
  PermissionRelationship,
  RuleActivationCondition,
  SearchStats,
  SharedConstraint,
  SolverResult,
  Transaction,
} from "./types";

export interface RunSolverParams {
  eligiblePermissions: Permission[];
  relationships: PermissionRelationship[];
  sharedConstraints: SharedConstraint[];
  collateralScopes: PermissionCollateralScope[];
  ruleActivationConditions: RuleActivationCondition[];
  financials: FinancialSnapshotInput;
  transaction: Transaction;
  entityClasses: EntityClass[];
  activationState: ActivationState;
  asOfDate: Date;
  maxPermissionsPerSide?: number;
}

export function runSolver(params: RunSolverParams): SolverResult {
  const start = Date.now();
  const graph = buildPermissionGraph(params.eligiblePermissions, params.relationships);
  const enumeration = enumerateElections(params.eligiblePermissions, graph, params.maxPermissionsPerSide);

  if (enumeration.limitExceeded) {
    const searchStats: SearchStats = { candidateElections: 0, prunedElections: 0, evaluatedElections: 0, durationMs: Date.now() - start, limitExceeded: true };
    return searchLimitExceededResult(params.transaction.amount, params.sharedConstraints, searchStats);
  }

  const eligibilityContext: EligibilityContext = {
    transaction: params.transaction,
    entityClasses: params.entityClasses,
    ruleActivationConditions: params.ruleActivationConditions,
    activationState: params.activationState,
    asOfDate: params.asOfDate,
  };
  const permissionsById = new Map(params.eligiblePermissions.map((p) => [p.id, p]));

  const evaluations = enumeration.elections.map((election) =>
    evaluateElection({
      election,
      permissionsById,
      graph,
      financials: params.financials,
      requestedAmount: params.transaction.amount,
      eligibilityContext,
      sharedConstraints: params.sharedConstraints,
      collateralScopes: params.collateralScopes,
    })
  );

  const paths = buildPermissionPaths(evaluations).map((path) => ({
    ...path,
    stateEffects: buildStateDelta({ legs: path.legs, financials: params.financials, parameterAdjustments: path.parameterAdjustmentsTriggered, sharedConstraintConsumption: path.sharedConstraintsConsumed }),
  }));

  const searchStats: SearchStats = {
    candidateElections: enumeration.candidateElections,
    prunedElections: enumeration.prunedElections,
    evaluatedElections: evaluations.length,
    durationMs: Date.now() - start,
    limitExceeded: false,
  };

  const maximumCapacity = computeMaximumCapacityFromEvaluations(evaluations, params, graph);

  return assembleSolverResult({ paths, amountTested: params.transaction.amount, sharedConstraints: params.sharedConstraints, searchStats, maximumCapacity });
}

/**
 * design doc §O - the tagged-union maximum-capacity answer. Uses each
 * evaluated election's own closed-form/bisected maximum (never a single
 * fabricated number): the highest maximum among elections whose
 * requirements are not FAILED wins as `EXACT`; if every election is either
 * NOT_EVALUABLE-for-the-requested-amount or blocked, this degrades to
 * `REVIEW_REQUIRED` rather than reporting a fabricated ceiling (design doc
 * §O.4's governing rule).
 */
function computeMaximumCapacityFromEvaluations(
  evaluations: ReturnType<typeof evaluateElection>[],
  params: RunSolverParams,
  graph: ReturnType<typeof buildPermissionGraph>
): MaxCapacityResult | undefined {
  const permissionsById = new Map(params.eligiblePermissions.map((p) => [p.id, p]));
  let best: { amount: number; evaluation: (typeof evaluations)[number] } | undefined;

  for (const evalResult of evaluations) {
    const hasFailure = evalResult.requirements.some((r) => r.status === "FAILED");
    if (hasFailure) continue;

    let amount: number | undefined = evalResult.maxCapacity;
    if (evalResult.status === "NOT_EVALUABLE") {
      const members = evalResult.election.memberPermissionIds.map((id) => permissionsById.get(id)!);
      const fixedTotal = members
        .filter((m) => m.amountKind === "FIXED")
        .reduce((sum, m) => {
          const evaluated = evaluateProvision(permissionAsProvision(m), params.financials, computeLeverageMetrics(params.financials));
          return sum + (evaluated.status === "modeled" ? (evaluated.capacity ?? 0) : 0);
        }, 0);
      amount = computeElectionMaxCapacityBisected(members, fixedTotal, params.financials);
    }
    if (amount === undefined) continue;
    if (!best || amount > best.amount) best = { amount, evaluation: evalResult };
  }

  if (!best) return undefined;

  const hasUnknown = best.evaluation.requirements.some((r) => r.status === "UNKNOWN");
  if (hasUnknown) {
    const assumptionOnly = best.evaluation.requirements.filter((r) => r.status === "UNKNOWN").every((r) => r.class === "TRANSACTION_ASSUMPTION" || r.reasonCategory === "MISSING_ASSUMPTION");
    return assumptionOnly
      ? { kind: "ASSUMPTION_REQUIRED", missingFields: best.evaluation.requirements.filter((r) => r.status === "UNKNOWN").map((r) => r.detail) }
      : { kind: "REVIEW_REQUIRED", reason: "At least one requirement on the best-capacity election is unresolved." };
  }

  return {
    kind: "EXACT",
    amount: best.amount,
    path: {
      id: best.evaluation.election.id,
      status: "CLEAR",
      legs: best.evaluation.legs,
      linkedPermissions: best.evaluation.linkedPermissions,
      conditionsTested: best.evaluation.requirements,
      sharedConstraintsConsumed: best.evaluation.sharedConstraintsConsumed,
      assumptionsUsed: [],
      parameterAdjustmentsTriggered: best.evaluation.parameterAdjustmentsTriggered,
      sourceProvisions: [],
      stateEffects: buildStateDelta({ legs: best.evaluation.legs, financials: params.financials, sharedConstraintConsumption: best.evaluation.sharedConstraintsConsumed }),
    },
  };
}

// Re-exports for convenient single-import use by callers/fixtures.
export { buildStateDelta } from "./statedelta";
export { assembleSolverResult, searchLimitExceededResult } from "./result";
