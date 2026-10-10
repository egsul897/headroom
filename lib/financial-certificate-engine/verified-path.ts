/**
 * Canonical verified-execution path for FCE-approved financial inputs (gate §7).
 *
 * Product capacity / sequential IR evaluation enters Phase 4 only through
 * `evaluateVerifiedCapacity` / `simulateVerifiedTransaction`.
 * This module does not import `contract-model/runtime/*` and does not
 * reimplement capacity arithmetic.
 *
 * Financial-core sequential chaining (cash/debt pro forma) remains in
 * `sequential-financial.ts` and coordinates with Agent 4 TE-D3 (#223) for
 * IR overlay composition. Here we demonstrate step-2 consumption of
 * step-1's complete post-state (capacity + proposed ledger usages + financial
 * inputs) via the verified boundary alone.
 */

import { snapshotInputResolver } from "@/lib/contract-model/north-star-bridge";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  VERIFIED_EXECUTION_POLICY,
  type HypotheticalTransaction,
  type SelectedPath,
  type VerifiedCapacityResult,
  type VerifiedExecutionPackage,
  type VerifiedTransactionResult,
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
    productionContext: false,
  });
}

/**
 * Evaluate verified IR capacity using APPROVED FCE/NS-4 financial snapshots.
 * Remaining capacity is never claimed from financials alone.
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
        // CapacityAmount carries serialized MONEY (amount string in dollars).
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

export interface VerifiedSequentialStepResult {
  stepIndex: number;
  label: string;
  simulation: VerifiedTransactionResult;
  /** Ledger after applying this step's proposed usages (hypothetical). */
  postLedger: LedgerUsageRecord[];
  /** Capacity node ids present after independent re-evaluation on post-ledger. */
  postCapacityNodeIds: string[];
  /** Applied usage ids visible on post capacity state. */
  postAppliedUsageIds: string[];
  financialMetricsConsumedFromPrior: boolean;
  ledgerConsumedFromPrior: boolean;
  capacityConstraintsReevaluated: boolean;
}

/**
 * Run verified transactions where each step's ledger is the prior step's
 * complete post-ledger (proposed usages appended). Optional per-step snapshot
 * replacements prove financial-metric chaining. Hypothetical only — no durable writes.
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
  }>;
}): {
  authority: FinancialInputAuthorityLabel;
  steps: VerifiedSequentialStepResult[];
  /** True when step N>0 used prior ledger + re-evaluated capacity constraints. */
  sequentialPostStateConsumed: boolean;
} {
  const authority = assertSnapshotsApproved(args.financial.snapshots);
  let ledger: LedgerUsageRecord[] = [...(args.financial.ledger ?? [])];
  let snapshots = args.financial.snapshots;
  const out: VerifiedSequentialStepResult[] = [];

  for (let i = 0; i < args.steps.length; i++) {
    const spec = args.steps[i]!;
    if (spec.snapshots) {
      assertSnapshotsApproved(spec.snapshots);
      snapshots = spec.snapshots;
    }
    const inputs = snapshotInputResolver({
      snapshots,
      definitions: [...(args.package.definitions ?? [])],
      rules: [...args.package.rules],
      companyId: args.financial.companyId,
      instrumentKey: args.financial.instrumentKey,
    });

    const priorLedgerIds = new Set(ledger.map((u) => u.usageId));
    const simulation = simulateVerifiedTransaction({
      package: args.package,
      inputs,
      ledger,
      asOf: args.financial.asOf,
      transaction: spec.transaction,
      selectedPath: spec.selectedPath,
    });

    let postLedger = ledger;
    let postCapacityNodeIds: string[] = [];
    let postAppliedUsageIds: string[] = [];

    if (simulation.outcome === "EXECUTED") {
      const proposed = simulation.simulation.ledgerEffects.proposed.map((p) => p.record);
      const superseded = new Map(
        simulation.simulation.ledgerEffects.superseded.map((s) => [s.originalUsageId, s.proposed]),
      );
      postLedger = [...ledger.map((u) => superseded.get(u.usageId) ?? u), ...proposed];
      const reeval = evaluateVerifiedCapacity({
        package: args.package,
        inputs,
        ledger: postLedger,
        asOf: args.financial.asOf,
      });
      if (reeval.outcome === "EXECUTED") {
        postCapacityNodeIds = reeval.state.capacities.map((c) => c.capacityNodeId).sort();
        postAppliedUsageIds = reeval.state.capacities.flatMap((c) => [...c.appliedUsageIds]).sort();
      }
    }

    out.push({
      stepIndex: i,
      label: spec.label,
      simulation,
      postLedger,
      postCapacityNodeIds,
      postAppliedUsageIds,
      financialMetricsConsumedFromPrior: i === 0 || spec.snapshots != null,
      ledgerConsumedFromPrior:
        i === 0 || [...priorLedgerIds].every((id) => postLedger.some((u) => u.usageId === id)),
      capacityConstraintsReevaluated: simulation.outcome === "EXECUTED",
    });

    ledger = postLedger;
  }

  const sequentialPostStateConsumed =
    out.length >= 2 &&
    out.slice(1).every(
      (s) =>
        s.ledgerConsumedFromPrior &&
        s.capacityConstraintsReevaluated &&
        s.simulation.outcome === "EXECUTED",
    );

  return { authority, steps: out, sequentialPostStateConsumed };
}
