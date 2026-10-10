/**
 * Canonical verified-execution path for FCE-approved financial inputs.
 *
 * Production financial-capacity execution enters Phase 4 only through the
 * #243 certified sequential-execution boundary:
 *   openVerifiedSequentialWorld → runSequentialTransactions
 *     → evaluateVerifiedCapacity / simulateVerifiedTransaction (REQUIRE)
 *
 * TE-D3 financial overlay composition (#223) advances with ledger utilization
 * and covenant capacity on each step. This module does not import
 * `contract-model/runtime/*` and does not reimplement capacity arithmetic.
 *
 * Financial-core cash/debt pro forma chaining remains in `sequential-financial.ts`.
 */

import { snapshotInputResolver } from "@/lib/contract-model/north-star-bridge";
import {
  openVerifiedSequentialWorld,
  runSequentialTransactions,
  type SequentialRunResult,
  type SequentialStepResult,
  type SequentialStepSpec,
  type SequentialWorld,
} from "@/lib/contract-model/sequential-execution";
import {
  evaluateVerifiedCapacity,
  VERIFIED_EXECUTION_POLICY,
  type HypotheticalTransaction,
  type SelectedPath,
  type TransactionSimulationResult,
  type VerifiedCapacityResult,
  type VerifiedExecutionPackage,
} from "@/lib/contract-model/verified-execution";
import { classifyApprovedSnapshotAuthority, type FinancialInputAuthorityLabel } from "./authority";
import { publishRemainingCapacity } from "./utilization-honesty";

export { VERIFIED_EXECUTION_POLICY };

type SnapshotArg = Parameters<typeof snapshotInputResolver>[0]["snapshots"][number];
type LedgerUsageRecord = NonNullable<Parameters<typeof evaluateVerifiedCapacity>[0]["ledger"]>[number];

export interface VerifiedPathFinancialBase {
  /** APPROVED NS-4 snapshot(s) — status alone is not enough; authority classified. */
  snapshots: SnapshotArg[];
  companyId: string;
  instrumentKey: string;
  asOf: string;
  ledger?: readonly LedgerUsageRecord[];
}

export interface VerifiedPathCapacityEval {
  policy: typeof VERIFIED_EXECUTION_POLICY;
  capacity: VerifiedCapacityResult;
  authority: FinancialInputAuthorityLabel;
  /** Per-rule remaining publication — never remaining without utilization completeness. */
  remainingByRule: Record<
    string,
    {
      grossKind: string;
      remainingMillions: number | null;
      supportsRemainingClaim: boolean;
      reason: string;
    }
  >;
}

function assertSnapshotsApproved(snapshots: readonly SnapshotArg[]): FinancialInputAuthorityLabel {
  if (snapshots.length === 0) {
    throw new Error("Verified path requires at least one APPROVED financial snapshot.");
  }
  for (const s of snapshots) {
    if (s.status !== "APPROVED") {
      throw new Error(`Snapshot ${s.snapshotId} status ${s.status} is not APPROVED — verified path refuses.`);
    }
  }
  const first = snapshots[0]!;
  return classifyApprovedSnapshotAuthority({
    reviewedBy: first.review.reviewedBy,
    approvalRef: first.review.approvalRef,
    // Verified-path callers supply snapshots; production approval channel is
    // never inferred from fixture reviewedBy strings.
    productionContext: false,
    trustedProductionApprovalChannel: false,
  });
}

/**
 * Evaluate verified IR capacity using APPROVED FCE/NS-4 financial snapshots.
 * Remaining capacity is never claimed from financials alone (#237).
 */
export function evaluateVerifiedCapacityWithApprovedFinancials(args: {
  package: VerifiedExecutionPackage;
  financial: VerifiedPathFinancialBase;
}): VerifiedPathCapacityEval {
  const authority = assertSnapshotsApproved(args.financial.snapshots);
  const inputs = snapshotInputResolver({
    snapshots: args.financial.snapshots,
    definitions: [...(args.package.definitions ?? [])],
    rules: [...args.package.rules],
    companyId: args.financial.companyId,
    instrumentKey: args.financial.instrumentKey,
  });
  const capacity = evaluateVerifiedCapacity({
    package: args.package,
    inputs,
    ledger: args.financial.ledger,
    asOf: args.financial.asOf,
  });

  const remainingByRule: VerifiedPathCapacityEval["remainingByRule"] = {};
  if (capacity.outcome === "EXECUTED") {
    for (const entry of capacity.state.capacities) {
      const ruleId = entry.ruleId ?? entry.capacityNodeId;
      let grossMillions: number | null = null;
      if (entry.grossCapacity.kind === "AMOUNT" && entry.grossCapacity.value.type === "MONEY") {
        const dollars = Number(entry.grossCapacity.value.amount);
        if (Number.isFinite(dollars)) grossMillions = dollars / 1_000_000;
      }
      const pub = publishRemainingCapacity({
        capacityRuleId: ruleId,
        asOf: args.financial.asOf,
        grossCapacityMillions: grossMillions,
        unlimited: entry.grossCapacity.kind === "UNLIMITED",
        records: [],
        completenessCertificate: null,
        unattributedLegacyBasketPresent: (args.financial.ledger?.length ?? 0) > 0,
      });
      remainingByRule[ruleId] = {
        grossKind: entry.grossCapacity.kind,
        remainingMillions: pub.remainingCapacityMillions,
        supportsRemainingClaim: pub.supportsRemainingClaim,
        reason: pub.reason,
      };
    }
  }

  return { policy: VERIFIED_EXECUTION_POLICY, capacity, authority, remainingByRule };
}

/** Compact simulation outcome for FCE surfaces (full detail on sequentialRun). */
export type VerifiedSequentialSimulationView =
  | {
      outcome: "EXECUTED";
      policy: typeof VERIFIED_EXECUTION_POLICY;
      simulation: TransactionSimulationResult;
      selectedPathResult: TransactionSimulationResult["selectedPathResult"];
      proposedUsageIds: string[];
    }
  | {
      outcome: "REFUSED" | "ABORTED";
      policy: typeof VERIFIED_EXECUTION_POLICY;
      reason: string;
    };

export interface VerifiedSequentialStepResult {
  stepIndex: number;
  label: string;
  simulation: VerifiedSequentialSimulationView;
  /** Ledger after applying this step's proposed usages (hypothetical). */
  postLedger: LedgerUsageRecord[];
  /** Capacity node ids from independent post-check views. */
  postCapacityNodeIds: string[];
  /** Applied usage ids from independent post-check. */
  postAppliedUsageIds: string[];
  financialMetricsConsumedFromPrior: boolean;
  ledgerConsumedFromPrior: boolean;
  capacityConstraintsReevaluated: boolean;
  /** TE-D3: prior CHANGE_METRIC overlays chained into this step's base. */
  financialViewChained: boolean;
  chainedMetricKeysAfter: string[];
  runnerStep: SequentialStepResult;
}

export interface VerifiedSequentialRunResult {
  authority: FinancialInputAuthorityLabel;
  policy: typeof VERIFIED_EXECUTION_POLICY;
  steps: VerifiedSequentialStepResult[];
  /** True when step N>0 used prior ledger + re-evaluated capacity constraints. */
  sequentialPostStateConsumed: boolean;
  /** Canonical #243 runner result (REQUIRE, TE-D3 overlays). */
  sequentialRun: SequentialRunResult;
  world: SequentialWorld;
}

function viewFromRunnerStep(
  step: SequentialStepResult | undefined,
  label: string,
): VerifiedSequentialSimulationView {
  if (!step) {
    return {
      outcome: "ABORTED",
      policy: VERIFIED_EXECUTION_POLICY,
      reason: `Sequential step missing for ${label}`,
    };
  }
  if (!step.simulation) {
    return {
      outcome: "REFUSED",
      policy: VERIFIED_EXECUTION_POLICY,
      reason: step.notes.join("; ") || `Sequential step ${step.stepId} produced no simulation`,
    };
  }
  return {
    outcome: "EXECUTED",
    policy: VERIFIED_EXECUTION_POLICY,
    simulation: step.simulation,
    selectedPathResult: step.simulation.selectedPathResult,
    proposedUsageIds: step.proposedLedgerUsageIds,
  };
}

/**
 * Run verified transactions through the #243 canonical sequential adapter
 * (`runSequentialTransactions` → `simulateVerifiedTransaction` under REQUIRE).
 *
 * Each step's post-state carries forward ledger utilization, TE-D3 financial
 * overlays, and independently recomputed covenant capacity together.
 */
export function runVerifiedSequentialTransactions(args: {
  package: VerifiedExecutionPackage;
  financial: VerifiedPathFinancialBase;
  steps: Array<{
    label: string;
    transaction: HypotheticalTransaction;
    selectedPath: SelectedPath;
    /** Optional replacement snapshots for this step (post-txn financial facts). */
    snapshots?: SnapshotArg[];
    businessType?: string;
  }>;
  mode?: "HYPOTHETICAL" | "COMPLETED";
  utilizationAffirmedComplete?: boolean;
}): VerifiedSequentialRunResult {
  const authority = assertSnapshotsApproved(args.financial.snapshots);
  const snapshots = args.steps[0]?.snapshots ?? args.financial.snapshots;
  assertSnapshotsApproved(snapshots);

  const inputs = snapshotInputResolver({
    snapshots,
    definitions: [...(args.package.definitions ?? [])],
    rules: [...args.package.rules],
    companyId: args.financial.companyId,
    instrumentKey: args.financial.instrumentKey,
  });

  const world = openVerifiedSequentialWorld({
    package: args.package,
    inputs,
    ledger: args.financial.ledger ?? [],
    asOf: args.financial.asOf,
  });

  const stepSpecs: SequentialStepSpec[] = args.steps.map((s, i) => ({
    stepId: `fce-seq-${i}-${s.transaction.transactionId}`,
    businessType: s.businessType ?? s.label,
    transaction: s.transaction,
    selectedPath: s.selectedPath,
    recipeOk: true,
    recipeNotes: s.snapshots
      ? ["step supplies replacement APPROVED financial snapshots (FCE post-txn facts)"]
      : [],
  }));

  const sequentialRun = runSequentialTransactions({
    world,
    steps: stepSpecs,
    mode: args.mode ?? "HYPOTHETICAL",
    utilizationAffirmedComplete: args.utilizationAffirmedComplete ?? false,
  });

  // Reconstruct cumulative hypothetical post-ledgers from runner proposed ids
  // by replaying proposed records from each EXECUTED simulation.
  let ledger: LedgerUsageRecord[] = [...(args.financial.ledger ?? [])];
  const out: VerifiedSequentialStepResult[] = [];

  for (let i = 0; i < args.steps.length; i++) {
    const spec = args.steps[i]!;
    const runnerStep = sequentialRun.steps[i];
    const simulation = viewFromRunnerStep(runnerStep, spec.label);
    const priorLedgerIds = new Set(ledger.map((u) => u.usageId));

    let postLedger = ledger;
    if (simulation.outcome === "EXECUTED") {
      const proposed = simulation.simulation.ledgerEffects.proposed.map((p) => p.record);
      const superseded = new Map(
        simulation.simulation.ledgerEffects.superseded.map((s) => [s.originalUsageId, s.proposed]),
      );
      postLedger = [...ledger.map((u) => superseded.get(u.usageId) ?? u), ...proposed];
    }

    const postCapacityNodeIds = (runnerStep?.independentPostCheck ?? runnerStep?.postState ?? [])
      .map((c) => c.capacityNodeId)
      .sort();
    const postAppliedUsageIds = (runnerStep?.independentPostCheck ?? runnerStep?.postState ?? [])
      .flatMap((c) => c.appliedUsageIds)
      .sort();

    out.push({
      stepIndex: i,
      label: spec.label,
      simulation,
      postLedger,
      postCapacityNodeIds,
      postAppliedUsageIds,
      financialMetricsConsumedFromPrior:
        i === 0 || spec.snapshots != null || !!(runnerStep?.financialViewChained),
      ledgerConsumedFromPrior:
        i === 0 || [...priorLedgerIds].every((id) => postLedger.some((u) => u.usageId === id)),
      capacityConstraintsReevaluated:
        simulation.outcome === "EXECUTED" &&
        (runnerStep?.independentPostMatchesSimulation === true ||
          runnerStep?.independentPostCheck != null),
      financialViewChained: runnerStep?.financialViewChained ?? false,
      chainedMetricKeysAfter: runnerStep?.chainedMetricKeysAfter ?? [],
      runnerStep: runnerStep!,
    });

    ledger = postLedger;
  }

  const sequentialPostStateConsumed =
    out.length >= 2 &&
    sequentialRun.abortedAtStepId == null &&
    out.slice(1).every(
      (s) =>
        s.ledgerConsumedFromPrior &&
        s.capacityConstraintsReevaluated &&
        s.simulation.outcome === "EXECUTED",
    );

  return {
    authority,
    policy: VERIFIED_EXECUTION_POLICY,
    steps: out,
    sequentialPostStateConsumed,
    sequentialRun,
    world,
  };
}
