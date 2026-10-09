/**
 * Sequential hypothetical / completed transaction runner over Phase 4D.
 *
 * - Hypothetical mode never mutates the caller's ledger array or store backend.
 * - Completed mode posts commit-plan rows through appendUsage; duplicate usageIds refuse.
 * - Each step records independently checked pre/post capacity snapshots.
 */
import { simulateTransaction } from "@/lib/contract-model/runtime/transaction";
import { evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import type { CapacityState, LedgerUsageRecord } from "@/lib/contract-model/runtime/capacity/types";
import type {
  HypotheticalTransaction,
  SelectedPath,
  TransactionSimulationResult,
} from "@/lib/contract-model/runtime/transaction/types";
import {
  appendUsage,
  materializeUsages,
  type LedgerStoreBackend,
} from "@/lib/contract-model/runtime/capacity/store/write";
import type { LedgerWriteResult } from "@/lib/contract-model/runtime/capacity/store/types";
import type { RecipeBuildResult } from "./transaction-effect-recipes";
import {
  classifyUtilizationHistory,
  honestRemaining,
  type UtilizationHistoryStatus,
} from "./utilization-history";

export const SEQUENTIAL_TRANSACTION_RUNNER_VERSION = "sequential-transaction-runner.v1" as const;

export type RunnerMode = "HYPOTHETICAL" | "COMPLETED";

/** Minimal write surface for COMPLETED mode (InMemoryContractLedgerStore or raw backend). */
export interface LedgerAppendSurface {
  appendUsage(request: { usage: LedgerUsageRecord }): LedgerWriteResult;
}

export interface SequentialWorld {
  graph: Parameters<typeof simulateTransaction>[0]["capacityGraph"];
  state: CapacityState;
  inputs: Parameters<typeof simulateTransaction>[0]["inputs"];
  context: Parameters<typeof simulateTransaction>[0]["context"];
}

export interface SequentialStepInput {
  stepId: string;
  businessType: RecipeBuildResult["businessType"];
  recipe: RecipeBuildResult;
  /** Overrides recipe.selectedPath when supplied. */
  selectedPath?: SelectedPath;
}

export interface CapacitySnapshotView {
  capacityNodeId: string;
  ruleId: string | null;
  usage: string | null;
  remaining: string | null;
  honestRemaining: string | null;
  remainingKind: string;
  honestRemainingKind: string;
  appliedUsageIds: string[];
}

export interface SequentialStepResult {
  stepId: string;
  businessType: RecipeBuildResult["businessType"];
  recipeOk: boolean;
  recipeLimitations: RecipeBuildResult["limitations"];
  simulation: TransactionSimulationResult | null;
  preState: CapacitySnapshotView[];
  postState: CapacitySnapshotView[] | null;
  /** Independent recompute of capacity from advanced ledger (null when no post-state). */
  independentPostCheck: CapacitySnapshotView[] | null;
  independentPostMatchesSimulation: boolean | null;
  preStateHash: string;
  postStateHash: string | null;
  proposedLedgerUsageIds: string[];
  commitPostedUsageIds: string[];
  commitRefused: { usageId: string; codes: string[] }[];
  ledgerMutatedInHypothetical: boolean;
  notes: string[];
}

export interface SequentialRunResult {
  runnerVersion: typeof SEQUENTIAL_TRANSACTION_RUNNER_VERSION;
  mode: RunnerMode;
  utilizationStatus: UtilizationHistoryStatus;
  steps: SequentialStepResult[];
  finalStateHash: string | null;
  abortedAtStepId: string | null;
  originalLedgerUntouched: boolean;
  notes: string[];
}

function amountKind(a: { kind: string; value?: { type?: string; amount?: string } }): {
  kind: string;
  amount: string | null;
} {
  if (a.kind === "AMOUNT" && a.value?.type === "MONEY") {
    return { kind: "AMOUNT", amount: a.value.amount ?? null };
  }
  return { kind: a.kind, amount: null };
}

function viewState(
  state: CapacityState,
  utilizationStatus: UtilizationHistoryStatus,
): CapacitySnapshotView[] {
  return state.capacities.map((c) => {
    const rem = amountKind(c.remaining);
    const honest = amountKind(honestRemaining(c, utilizationStatus));
    const usage = amountKind(c.usage);
    return {
      capacityNodeId: c.capacityNodeId,
      ruleId: c.ruleId,
      usage: usage.amount,
      remaining: rem.amount,
      honestRemaining: honest.amount,
      remainingKind: rem.kind,
      honestRemainingKind: honest.kind,
      appliedUsageIds: [...c.appliedUsageIds].sort(),
    };
  });
}

function cloneLedger(ledger: readonly LedgerUsageRecord[]): LedgerUsageRecord[] {
  return ledger.map((u) => ({
    ...u,
    amount: { ...u.amount },
    capacityPath: structuredClone(u.capacityPath),
    provenance: { ...u.provenance },
  }));
}

function advanceWorld(w: SequentialWorld, r: TransactionSimulationResult): SequentialWorld {
  if (!r.postState) throw new Error("cannot advance without postState");
  const supersededIds = new Map(r.ledgerEffects.superseded.map((s) => [s.originalUsageId, s.proposed]));
  const ledger: LedgerUsageRecord[] = [
    ...(w.context.ledger ?? []).map((u) => supersededIds.get(u.usageId) ?? u),
    ...r.ledgerEffects.proposed.map((p) => p.record),
  ];
  return { ...w, state: r.postState, context: { ...w.context, ledger } };
}

function independentRecompute(
  w: SequentialWorld,
  utilizationStatus: UtilizationHistoryStatus,
): CapacitySnapshotView[] {
  const state = evaluateCapacityState({
    graph: w.graph,
    rules: w.context.rules,
    sharedCapacities: w.context.sharedCapacities,
    definitions: w.context.definitions,
    inputs: w.inputs,
    ledger: w.context.ledger ?? [],
    asOf: w.context.asOf ?? null,
  });
  return viewState(state, utilizationStatus);
}

function snapshotsEqual(a: CapacitySnapshotView[], b: CapacitySnapshotView[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Run an ordered sequence of recipe-built transactions.
 * Hypothetical mode: pure; caller's ledger reference is never written.
 * Completed mode: posts proposed rows via appendUsage (idempotent refuse on duplicates).
 */
export function runSequentialTransactions(args: {
  world: SequentialWorld;
  steps: SequentialStepInput[];
  mode: RunnerMode;
  /** Affirm utilization history is complete when the ledger is empty. Default false → UNKNOWN. */
  utilizationAffirmedComplete?: boolean;
  /** Required in COMPLETED mode. */
  ledgerBackend?: LedgerAppendSurface | LedgerStoreBackend;
}): SequentialRunResult {
  const originalLedger = args.world.context.ledger ?? [];
  const originalLedgerClone = cloneLedger(originalLedger);
  const affirmed = args.utilizationAffirmedComplete ?? false;
  const initialUtilization = classifyUtilizationHistory({
    ledgerCount: originalLedger.length,
    utilizationAffirmedComplete: affirmed,
  });

  let world: SequentialWorld = {
    ...args.world,
    context: { ...args.world.context, ledger: cloneLedger(originalLedger) },
  };

  const stepsOut: SequentialStepResult[] = [];
  let abortedAtStepId: string | null = null;
  const notes: string[] = [
    "Phase 4D simulateTransaction is pure; commit is separate and opt-in.",
    "Recipe category/label are metadata only.",
  ];

  for (const step of args.steps) {
    const utilizationStatus = classifyUtilizationHistory({
      ledgerCount: (world.context.ledger ?? []).length,
      utilizationAffirmedComplete: affirmed,
    });
    const preViews = viewState(world.state, utilizationStatus);
    const preHash = world.state.stateHash;
    const stepNotes: string[] = [...step.recipe.notes];

    if (!step.recipe.ok || !step.recipe.transaction) {
      stepsOut.push({
        stepId: step.stepId,
        businessType: step.businessType,
        recipeOk: false,
        recipeLimitations: step.recipe.limitations,
        simulation: null,
        preState: preViews,
        postState: null,
        independentPostCheck: null,
        independentPostMatchesSimulation: null,
        preStateHash: preHash,
        postStateHash: null,
        proposedLedgerUsageIds: [],
        commitPostedUsageIds: [],
        commitRefused: [],
        ledgerMutatedInHypothetical: false,
        notes: stepNotes,
      });
      abortedAtStepId = step.stepId;
      notes.push(`Aborted at ${step.stepId}: recipe not ok`);
      break;
    }

    const selectedPath = step.selectedPath ?? step.recipe.selectedPath;
    const simulation = simulateTransaction({
      transaction: step.recipe.transaction,
      currentState: world.state,
      capacityGraph: world.graph,
      selectedPath,
      inputs: world.inputs,
      context: world.context,
    });

    const proposedIds = simulation.ledgerEffects.proposed.map((p) => p.record.usageId);
    const commitPostedUsageIds: string[] = [];
    const commitRefused: { usageId: string; codes: string[] }[] = [];

    let postViews: CapacitySnapshotView[] | null = null;
    let independent: CapacitySnapshotView[] | null = null;
    let match: boolean | null = null;
    let postHash: string | null = null;

    const pathOk =
      simulation.selectedPathResult === "SATISFIED" ||
      simulation.selectedPathResult === "REVIEW_REQUIRED";
    if (simulation.postState && pathOk) {
      const advanced = advanceWorld(world, simulation);
      postViews = viewState(simulation.postState, utilizationStatus);
      postHash = simulation.postState.stateHash;
      independent = independentRecompute(advanced, utilizationStatus);
      // Compare Phase-4C capacity figures (honestRemaining is a product overlay).
      match = snapshotsEqual(
        postViews.map(({ honestRemaining: _h, honestRemainingKind: _hk, ...rest }) => rest),
        independent.map(({ honestRemaining: _h, honestRemainingKind: _hk, ...rest }) => rest),
      );
      world = advanced;

      if (args.mode === "COMPLETED") {
        if (!args.ledgerBackend) {
          throw new Error("COMPLETED mode requires ledgerBackend");
        }
        if (!simulation.commitPlan.committable) {
          stepNotes.push("COMPLETED mode skipped ledger post: commitPlan.committable=false");
        } else {
          for (const p of simulation.ledgerEffects.proposed) {
            const posted =
              "commit" in args.ledgerBackend
                ? appendUsage(args.ledgerBackend as LedgerStoreBackend, { usage: p.record })
                : (args.ledgerBackend as LedgerAppendSurface).appendUsage({ usage: p.record });
            if (posted.ok) commitPostedUsageIds.push(p.record.usageId);
            else commitRefused.push({ usageId: p.record.usageId, codes: posted.issues.map((i) => i.code) });
          }
        }
      }
    } else {
      abortedAtStepId = step.stepId;
      stepNotes.push(
        `No post-state published (simulationStatus=${simulation.simulationStatus}, path=${simulation.selectedPathResult})`,
      );
    }

    const ledgerMutatedInHypothetical =
      args.mode === "HYPOTHETICAL" &&
      JSON.stringify(originalLedger) !== JSON.stringify(originalLedgerClone);

    stepsOut.push({
      stepId: step.stepId,
      businessType: step.businessType,
      recipeOk: true,
      recipeLimitations: step.recipe.limitations,
      simulation,
      preState: preViews,
      postState: postViews,
      independentPostCheck: independent,
      independentPostMatchesSimulation: match,
      preStateHash: preHash,
      postStateHash: postHash,
      proposedLedgerUsageIds: proposedIds,
      commitPostedUsageIds,
      commitRefused,
      ledgerMutatedInHypothetical,
      notes: stepNotes,
    });

    if (abortedAtStepId) {
      notes.push(`Aborted at ${step.stepId}: simulation did not publish post-state`);
      break;
    }
  }

  const originalLedgerUntouched =
    JSON.stringify(originalLedger) === JSON.stringify(originalLedgerClone);

  return {
    runnerVersion: SEQUENTIAL_TRANSACTION_RUNNER_VERSION,
    mode: args.mode,
    utilizationStatus: classifyUtilizationHistory({
      ledgerCount: (world.context.ledger ?? []).length,
      utilizationAffirmedComplete: affirmed,
    }),
    steps: stepsOut,
    finalStateHash: world.state.stateHash,
    abortedAtStepId,
    originalLedgerUntouched,
    notes: [
      ...notes,
      `initialUtilization=${initialUtilization}`,
    ],
  };
}

/** Replay the same steps twice; simulation identities must match when inputs match. */
export function replaySequentialRun(
  args: Parameters<typeof runSequentialTransactions>[0],
): { first: SequentialRunResult; second: SequentialRunResult; identicalSimulationIds: boolean } {
  const first = runSequentialTransactions(args);
  const second = runSequentialTransactions(args);
  const ids = (r: SequentialRunResult) =>
    r.steps.map((s) => s.simulation?.simulationIdentity.simulationId ?? null);
  return {
    first,
    second,
    identicalSimulationIds: JSON.stringify(ids(first)) === JSON.stringify(ids(second)),
  };
}

/** Attempt to post the same completed transaction twice; second must refuse duplicates. */
export function assertCompletedNotDoublePosted(args: {
  backend: LedgerAppendSurface;
  usage: LedgerUsageRecord;
}): { firstOk: boolean; secondOk: boolean; secondCodes: string[] } {
  const first = args.backend.appendUsage({ usage: args.usage });
  const second = args.backend.appendUsage({ usage: args.usage });
  return {
    firstOk: first.ok,
    secondOk: second.ok,
    secondCodes: second.ok ? [] : second.issues.map((i) => i.code),
  };
}

export function materializeBackendUsages(backend: { events: readonly import("@/lib/contract-model/runtime/capacity/store/types").LedgerStoreEvent[] }): LedgerUsageRecord[] {
  return [...materializeUsages(backend.events).values()];
}

/** Simple in-memory backend for tests / demos that need raw LedgerStoreBackend. */
export function createMemoryLedgerBackend(): LedgerStoreBackend & { eventCount(): number } {
  const events: import("@/lib/contract-model/runtime/capacity/store/types").LedgerStoreEvent[] = [];
  return {
    get events() {
      return events;
    },
    commit(newEvents) {
      for (const e of newEvents) events.push(structuredClone(e));
    },
    eventCount() {
      return events.length;
    },
  };
}

export type { HypotheticalTransaction, SelectedPath };
