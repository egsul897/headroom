/**
 * SEQUENTIAL EXECUTION — product boundary beside verified-execution.
 *
 * Owns:
 *   - financial overlay chaining across hypothetical steps (TE-D3)
 *   - restore-authority enforcement before every step (TE-D2)
 *   - sequential simulate → advance → independently recompute
 *   - utilization honesty (UNKNOWN ≠ zero)
 *   - hypothetical vs completed ledger posting
 *
 * Does NOT reimplement Phase 4A–4D arithmetic. Calls simulateTransaction /
 * evaluateCapacityState / buildOverlay only.
 */
import { simulateTransaction } from "./runtime/transaction/simulate";
import { buildOverlay } from "./runtime/transaction/overlay";
import type {
  ChangeMetricEffect,
  EventStateEffect,
  HypotheticalTransaction,
  SelectedPath,
  TransactionEffect,
  TransactionQuantity,
  TransactionSimulationResult,
} from "./runtime/transaction/types";
import { evaluateCapacityState } from "./runtime/capacity/state";
import { buildCapacityGraph } from "./runtime/capacity/graph";
import type {
  CapacityAmount,
  CapacityGraph,
  CapacityState,
  CapacityStateEntry,
  LedgerUsageRecord,
  ReclassificationElection,
} from "./runtime/capacity/types";
import {
  appendUsage,
  materializeUsages,
  type LedgerStoreBackend,
} from "./runtime/capacity/store/write";
import type { LedgerWriteResult, LedgerStoreEvent } from "./runtime/capacity/store/types";
import type { InputResolver } from "./runtime/types";
import type { SerializedRuntimeValue } from "./runtime/types";
import { snapshotInputResolver } from "./runtime/input";
import type { FinancialInput, FinancialSnapshot } from "./runtime/input/types";
import { rationalFromString } from "./runtime/decimal";
import type { RuntimeValue } from "./runtime/types";
import type { IRExpression, IRRule, IRSharedCapacity } from "./ir/types";
import { assertRestoreAuthority, formatRestoreReason, UNAUTHORIZED_RESTORE_CODE } from "./restore-authority";

export {
  assertRestoreAuthority,
  collectUnauthorizedRestores,
  extractRestoreAuthority,
  formatRestoreReason,
  RESTORE_AUTHORITY_PATTERN,
  UNAUTHORIZED_RESTORE_CODE,
  type RestoreAuthorityIssue,
} from "./restore-authority";

export type {
  HypotheticalTransaction,
  SelectedPath,
  TransactionSimulationResult,
  TransactionQuantity,
  TransactionEffect,
  ChangeMetricEffect,
  EventStateEffect,
  ReclassificationElection,
};

export const SEQUENTIAL_EXECUTION_VERSION = "sequential-execution.v1" as const;

// ---------------------------------------------------------------------------
// State kind vocabulary (hypothetical vs actual vs proposed vs committed)
// ---------------------------------------------------------------------------

export type TransactionStateKind =
  | "HYPOTHETICAL_VIEW"
  | "APPROVED_ACTUAL"
  | "PROPOSED_LEDGER_EFFECT"
  | "COMMITTED_LEDGER_ENTRY"
  | "REVERSAL_OR_SUPERSESSION";

export interface StateKindDisclosure {
  kind: TransactionStateKind;
  note: string;
}

export const STATE_KIND_NOTES: Record<TransactionStateKind, string> = {
  HYPOTHETICAL_VIEW: "Pro-forma view only; commitPlan.executed is always false; actual ledger untouched",
  APPROVED_ACTUAL: "Approved financial snapshot / recorded ledger used as the evaluation base",
  PROPOSED_LEDGER_EFFECT: "Simulation-proposed usage row; not written until an explicit commit",
  COMMITTED_LEDGER_ENTRY: "Append-only store row after successful appendUsage",
  REVERSAL_OR_SUPERSESSION: "Explicit successor identity; history preserved, never deleted",
};

// ---------------------------------------------------------------------------
// Utilization honesty
// ---------------------------------------------------------------------------

export type UtilizationHistoryStatus = "CONFIRMED_EMPTY" | "RECORDED" | "UNKNOWN";

export const UTILIZATION_UNKNOWN_REASON =
  "utilization history is UNKNOWN; an empty ledger is not treated as zero consumption";

export function classifyUtilizationHistory(args: {
  ledgerCount: number;
  utilizationAffirmedComplete: boolean;
}): UtilizationHistoryStatus {
  if (args.ledgerCount > 0) return "RECORDED";
  if (args.utilizationAffirmedComplete) return "CONFIRMED_EMPTY";
  return "UNKNOWN";
}

export function honestRemaining(
  entry: Pick<CapacityStateEntry, "remaining" | "usage" | "appliedUsageIds" | "limitations">,
  utilizationStatus: UtilizationHistoryStatus,
): CapacityAmount {
  if (utilizationStatus !== "UNKNOWN") return entry.remaining;
  const hasApplied = entry.appliedUsageIds.length > 0;
  const usageBlocked = entry.limitations.some((l) =>
    l.code === "ALLOCATION_INFORMATION_MISSING" ||
    l.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION" ||
    l.code === "DUPLICATE_LEDGER_USAGE_IDENTITY" ||
    l.code === "LEDGER_SET_UNSAFE",
  );
  if (hasApplied || usageBlocked) return entry.remaining;
  if (entry.usage.kind === "NOT_DETERMINED" || entry.usage.kind === "AMOUNT") {
    return { kind: "NOT_DETERMINED", reason: UTILIZATION_UNKNOWN_REASON };
  }
  return entry.remaining;
}

// ---------------------------------------------------------------------------
// Financial overlay chaining (TE-D3)
// ---------------------------------------------------------------------------

function serializedToQuantity(v: SerializedRuntimeValue): TransactionQuantity | null {
  switch (v.type) {
    case "MONEY": return { type: "MONEY", amount: v.amount, currency: v.currency };
    case "NUMBER": return { type: "NUMBER", value: v.value };
    case "PERCENT": return { type: "PERCENT", fraction: v.fraction };
    case "RATIO": return { type: "RATIO", value: v.value };
    default: return null;
  }
}

/** Chain prior APPLIED overlay results into the next step's base resolver. */
export function chainFinancialViewWithScope(
  base: InputResolver,
  result: TransactionSimulationResult,
  scope: { companyId: string; instrumentKey: string },
): { resolver: InputResolver; chainedMetricKeys: string[]; chainedEvents: string[] } {
  const metricEffects: ChangeMetricEffect[] = [];
  const chainedMetricKeys: string[] = [];
  for (const e of result.financialEffects) {
    if (e.state !== "APPLIED" || !e.result) continue;
    const q = serializedToQuantity(e.result);
    if (!q) continue;
    metricEffects.push({
      effectId: `chain:${result.transactionIdentity.transactionId}:${e.effectId}`,
      kind: "CHANGE_METRIC",
      metricKey: e.metricKey,
      period: e.period,
      asOf: e.asOf,
      adjustment: { kind: "SET", value: q },
    });
    chainedMetricKeys.push(e.metricKey);
  }

  const eventEffects: EventStateEffect[] = result.simulationInputView.eventAdjustments.map((e) => ({
    effectId: `chain-evt:${e.effectId}`,
    kind: e.active ? "ACTIVATE_EVENT" as const : "DEACTIVATE_EVENT" as const,
    eventDescription: e.eventDescription,
    asOf: e.asOf,
  }));
  const chainedEvents = eventEffects.map((e) => e.eventDescription);

  if (metricEffects.length === 0 && eventEffects.length === 0) {
    return { resolver: base, chainedMetricKeys: [], chainedEvents: [] };
  }

  const overlay = buildOverlay({
    base,
    transactionId: `chain-of:${result.transactionIdentity.transactionId}`,
    companyId: scope.companyId,
    instrumentKey: scope.instrumentKey,
    metricEffects,
    eventEffects,
  });

  return { resolver: overlay.resolver, chainedMetricKeys: [...new Set(chainedMetricKeys)].sort(), chainedEvents: [...new Set(chainedEvents)].sort() };
}

// ---------------------------------------------------------------------------
// Sequential runner
// ---------------------------------------------------------------------------

export type RunnerMode = "HYPOTHETICAL" | "COMPLETED";

export interface LedgerAppendSurface {
  appendUsage(request: { usage: LedgerUsageRecord }): LedgerWriteResult;
}

export interface SequentialWorld {
  graph: CapacityGraph;
  state: CapacityState;
  inputs: InputResolver;
  context: Parameters<typeof simulateTransaction>[0]["context"];
  companyId: string;
  instrumentKey: string;
}

export interface SequentialStepSpec {
  stepId: string;
  businessType: string;
  transaction: HypotheticalTransaction;
  selectedPath: SelectedPath;
  recipeNotes?: string[];
  recipeOk?: boolean;
  recipeLimitations?: { code: string; message: string; refs: string[] }[];
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
  businessType: string;
  recipeOk: boolean;
  recipeLimitations: { code: string; message: string; refs: string[] }[];
  simulation: TransactionSimulationResult | null;
  preState: CapacitySnapshotView[];
  postState: CapacitySnapshotView[] | null;
  independentPostCheck: CapacitySnapshotView[] | null;
  independentPostMatchesSimulation: boolean | null;
  preStateHash: string;
  postStateHash: string | null;
  proposedLedgerUsageIds: string[];
  commitPostedUsageIds: string[];
  commitRefused: { usageId: string; codes: string[] }[];
  ledgerMutatedInHypothetical: boolean;
  unauthorizedRestoreBlocked: boolean;
  chainedMetricKeysAfter: string[];
  financialViewChained: boolean;
  stateKinds: StateKindDisclosure[];
  notes: string[];
}

export interface SequentialRunResult {
  runnerVersion: typeof SEQUENTIAL_EXECUTION_VERSION;
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

function viewState(state: CapacityState, utilizationStatus: UtilizationHistoryStatus): CapacitySnapshotView[] {
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

export function advanceWorld(w: SequentialWorld, r: TransactionSimulationResult): SequentialWorld {
  if (!r.postState) throw new Error("cannot advance without postState");
  const supersededIds = new Map(r.ledgerEffects.superseded.map((s) => [s.originalUsageId, s.proposed]));
  const ledger: LedgerUsageRecord[] = [
    ...(w.context.ledger ?? []).map((u) => supersededIds.get(u.usageId) ?? u),
    ...r.ledgerEffects.proposed.map((p) => p.record),
  ];
  const chained = chainFinancialViewWithScope(w.inputs, r, {
    companyId: w.companyId,
    instrumentKey: w.instrumentKey,
  });
  return {
    ...w,
    state: r.postState,
    inputs: chained.resolver,
    context: { ...w.context, ledger },
  };
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

export function runSequentialTransactions(args: {
  world: SequentialWorld;
  steps: SequentialStepSpec[];
  mode: RunnerMode;
  utilizationAffirmedComplete?: boolean;
  ledgerBackend?: LedgerAppendSurface | LedgerStoreBackend;
  /** When false, skip restore-authority gate (tests of Phase 4D primitive only). Default true. */
  enforceRestoreAuthority?: boolean;
}): SequentialRunResult {
  const enforceAuthority = args.enforceRestoreAuthority !== false;
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
    "Financial overlays chain via SET of prior APPLIED results into the next base resolver.",
    enforceAuthority
      ? "Restore authority enforced at sequential-execution boundary."
      : "Restore authority gate disabled for this run.",
  ];

  for (const step of args.steps) {
    const utilizationStatus = classifyUtilizationHistory({
      ledgerCount: (world.context.ledger ?? []).length,
      utilizationAffirmedComplete: affirmed,
    });
    const preViews = viewState(world.state, utilizationStatus);
    const preHash = world.state.stateHash;
    const stepNotes: string[] = [...(step.recipeNotes ?? [])];
    const recipeOk = step.recipeOk !== false;
    const recipeLimitations = step.recipeLimitations ?? [];

    if (!recipeOk) {
      stepsOut.push({
        stepId: step.stepId,
        businessType: step.businessType,
        recipeOk: false,
        recipeLimitations,
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
        unauthorizedRestoreBlocked: false,
        chainedMetricKeysAfter: [],
        financialViewChained: false,
        stateKinds: [{ kind: "HYPOTHETICAL_VIEW", note: STATE_KIND_NOTES.HYPOTHETICAL_VIEW }],
        notes: stepNotes,
      });
      abortedAtStepId = step.stepId;
      notes.push(`Aborted at ${step.stepId}: recipe not ok`);
      break;
    }

    if (enforceAuthority) {
      const auth = assertRestoreAuthority(step.transaction);
      if (!auth.ok) {
        stepsOut.push({
          stepId: step.stepId,
          businessType: step.businessType,
          recipeOk: true,
          recipeLimitations: auth.issues.map((i) => ({
            code: i.code,
            message: i.message,
            refs: [i.effectId, i.usageId],
          })),
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
          unauthorizedRestoreBlocked: true,
          chainedMetricKeysAfter: [],
          financialViewChained: false,
          stateKinds: [{ kind: "HYPOTHETICAL_VIEW", note: STATE_KIND_NOTES.HYPOTHETICAL_VIEW }],
          notes: [...stepNotes, ...auth.issues.map((i) => i.message)],
        });
        abortedAtStepId = step.stepId;
        notes.push(`Aborted at ${step.stepId}: ${UNAUTHORIZED_RESTORE_CODE}`);
        break;
      }
    }

    const simulation = simulateTransaction({
      transaction: step.transaction,
      currentState: world.state,
      capacityGraph: world.graph,
      selectedPath: step.selectedPath,
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
    let chainedMetricKeysAfter: string[] = [];
    let financialViewChained = false;

    const pathOk =
      simulation.selectedPathResult === "SATISFIED" ||
      simulation.selectedPathResult === "REVIEW_REQUIRED";

    if (simulation.postState && pathOk) {
      const advanced = advanceWorld(world, simulation);
      const chainInfo = chainFinancialViewWithScope(world.inputs, simulation, {
        companyId: world.companyId,
        instrumentKey: world.instrumentKey,
      });
      chainedMetricKeysAfter = chainInfo.chainedMetricKeys;
      financialViewChained = chainInfo.chainedMetricKeys.length > 0 || chainInfo.chainedEvents.length > 0;
      postViews = viewState(simulation.postState, utilizationStatus);
      postHash = simulation.postState.stateHash;
      independent = independentRecompute(advanced, utilizationStatus);
      match = snapshotsEqual(
        postViews.map(({ honestRemaining: _h, honestRemainingKind: _hk, ...rest }) => rest),
        independent.map(({ honestRemaining: _h, honestRemainingKind: _hk, ...rest }) => rest),
      );
      world = advanced;

      if (args.mode === "COMPLETED") {
        if (!args.ledgerBackend) throw new Error("COMPLETED mode requires ledgerBackend");
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

    const stateKinds: StateKindDisclosure[] = [
      { kind: "HYPOTHETICAL_VIEW", note: STATE_KIND_NOTES.HYPOTHETICAL_VIEW },
      { kind: "APPROVED_ACTUAL", note: STATE_KIND_NOTES.APPROVED_ACTUAL },
    ];
    if (proposedIds.length) {
      stateKinds.push({ kind: "PROPOSED_LEDGER_EFFECT", note: STATE_KIND_NOTES.PROPOSED_LEDGER_EFFECT });
    }
    if (commitPostedUsageIds.length) {
      stateKinds.push({ kind: "COMMITTED_LEDGER_ENTRY", note: STATE_KIND_NOTES.COMMITTED_LEDGER_ENTRY });
    }
    if ((simulation.ledgerEffects.superseded.length ?? 0) > 0) {
      stateKinds.push({ kind: "REVERSAL_OR_SUPERSESSION", note: STATE_KIND_NOTES.REVERSAL_OR_SUPERSESSION });
    }

    stepsOut.push({
      stepId: step.stepId,
      businessType: step.businessType,
      recipeOk: true,
      recipeLimitations,
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
      ledgerMutatedInHypothetical:
        args.mode === "HYPOTHETICAL" &&
        JSON.stringify(originalLedger) !== JSON.stringify(originalLedgerClone),
      unauthorizedRestoreBlocked: false,
      chainedMetricKeysAfter,
      financialViewChained,
      stateKinds,
      notes: stepNotes,
    });

    if (abortedAtStepId) {
      notes.push(`Aborted at ${step.stepId}: simulation did not publish post-state`);
      break;
    }
  }

  return {
    runnerVersion: SEQUENTIAL_EXECUTION_VERSION,
    mode: args.mode,
    utilizationStatus: classifyUtilizationHistory({
      ledgerCount: (world.context.ledger ?? []).length,
      utilizationAffirmedComplete: affirmed,
    }),
    steps: stepsOut,
    finalStateHash: world.state.stateHash,
    abortedAtStepId,
    originalLedgerUntouched: JSON.stringify(originalLedger) === JSON.stringify(originalLedgerClone),
    notes: [...notes, `initialUtilization=${initialUtilization}`],
  };
}

export function replaySequentialRun(args: Parameters<typeof runSequentialTransactions>[0]) {
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

export function materializeBackendUsages(backend: { events: readonly LedgerStoreEvent[] }): LedgerUsageRecord[] {
  return [...materializeUsages(backend.events).values()];
}

export function createMemoryLedgerBackend(): LedgerStoreBackend & { eventCount(): number } {
  const events: LedgerStoreEvent[] = [];
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

// ---------------------------------------------------------------------------
// Ratio-gated independent demonstration world
// ---------------------------------------------------------------------------

export const RATIO_DEMO_ORG = "ratio-seq-org";
export const RATIO_DEMO_FACILITY = "ratio-seq-facility";
export const RATIO_DEMO_AS_OF = "2026-06-30";

const L = { exprId: null, inputKeys: [] as string[] };
const money = (amount: string): RuntimeValue => ({
  type: "MONEY",
  amount: rationalFromString(amount),
  currency: "USD",
  lineage: L,
});

function figure(key: string, amount: string): FinancialInput {
  return {
    identity: {
      companyId: RATIO_DEMO_ORG,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: RATIO_DEMO_FACILITY },
      inputKind: "METRIC",
      key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "EXACT_DATE", isoDate: RATIO_DEMO_AS_OF },
      valueType: "MONEY",
      currency: "USD",
    },
    value: money(amount),
    sourceVersion: "ratio-demo-v1",
  };
}

function flatMoney(amount: number, exprId: string): IRExpression {
  return { kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId };
}

function metricRef(key: string, exprId: string): IRExpression {
  return {
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName: key,
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    resolvedDefinitionId: null,
    exprId,
  };
}

/** Flat multi-basket world (no leverage gate) for the five-step happy-path demo. */
export function buildFlatSequentialWorld(): SequentialWorld {
  const mk = (ruleId: string, amount: number, family: IRRule["covenantFamily"], action: NonNullable<IRRule["action"]>): IRRule => ({
    ruleId,
    irSchemaVersion: "flat-demo",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    sourceDocumentId: "flat-demo-doc",
    sourceSectionRef: `§${ruleId}`,
    covenantFamily: family,
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action,
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: flatMoney(amount, `expr-${ruleId}`),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "flat-demo-doc",
      sourceNodeKey: null,
      sourceCitation: `cite-${ruleId}`,
      excerpt: null,
    },
    compilerVersion: null,
    sourceContentVersion: null,
  });
  const rules = [
    mk("debt-basket", 500, "INDEBTEDNESS", "INCUR_DEBT"),
    mk("rp-basket", 200, "RESTRICTED_PAYMENTS", "PAY_DIVIDEND"),
    mk("invest-basket", 150, "INVESTMENTS", "MAKE_INVESTMENT"),
  ];
  const facts = [
    figure("total-debt", "1000"),
    figure("equity-proceeds", "0"),
    figure("builder-available", "50"),
    figure("eligible-equity-proceeds", "0"),
    figure("ebitda", "100"),
  ];
  const snapshot: FinancialSnapshot = {
    snapshotId: "flat-demo-snap",
    version: "1",
    companyId: RATIO_DEMO_ORG,
    asOf: RATIO_DEMO_AS_OF,
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: { source: "flat sequential demo", sourceVersion: "v1" },
    review: {
      reviewedBy: "demo-reviewer",
      reviewedAt: "2026-07-01T00:00:00Z",
      approvalRef: "flat-demo-approval",
    },
    inputs: facts,
  };
  const inputs = snapshotInputResolver({
    snapshots: [snapshot],
    definitions: [],
    rules,
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  });
  const graph = buildCapacityGraph({
    rules,
    sharedCapacities: [],
    definitions: [],
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    asOf: RATIO_DEMO_AS_OF,
  });
  const state = evaluateCapacityState({
    graph,
    rules,
    sharedCapacities: [],
    definitions: [],
    inputs,
    ledger: [],
    asOf: RATIO_DEMO_AS_OF,
  });
  return {
    graph,
    state,
    inputs,
    context: { rules, sharedCapacities: [], definitions: [], ledger: [], asOf: RATIO_DEMO_AS_OF },
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  };
}

/**
 * Independent expected arithmetic (established before Headroom runs):
 *   Initial: TotalDebt=300, EBITDA=100 → TNL = 3.00 ≤ 3.50 → RP gate open
 *   After +$100 debt: TotalDebt=400 → TNL = 4.00 > 3.50 → RP gate closed
 */
export const RATIO_DEMO_INDEPENDENT_EXPECTATION = {
  initialTotalDebt: "300",
  initialEbitda: "100",
  initialTnl: "3",
  leverageGate: "3.5",
  debtIncurrence: "100",
  postIncurTotalDebt: "400",
  postIncurTnl: "4",
  dividendAttempt: "40",
  expectedAfterIncur: "RP_GATE_FAILS_TNL_ABOVE_3_5",
  sourceAuthority: {
    debtBasket: "§debt-basket — Indebtedness permission (flat $500)",
    rpBasket: "§rp-basket — Restricted Payments (flat $200) subject to TNL ≤ 3.50x",
    leverageTest: "COMPARE(DIVIDE(total-debt, ebitda), LTE, RATIO(3.50))",
  },
} as const;

export function buildRatioGatedSequentialWorld(opts?: {
  utilizationAffirmedComplete?: boolean;
}): SequentialWorld {
  const debtRule: IRRule = {
    ruleId: "debt-basket",
    irSchemaVersion: "ratio-demo",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    sourceDocumentId: "ratio-demo-doc",
    sourceSectionRef: "§debt-basket",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: flatMoney(500, "expr-debt"),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "ratio-demo-doc",
      sourceNodeKey: null,
      sourceCitation: "cite-debt-basket",
      excerpt: "Indebtedness in an aggregate principal amount not to exceed $500",
    },
    compilerVersion: null,
    sourceContentVersion: null,
  };

  const leverageConditionExpr: IRExpression = {
    kind: "COMPARE",
    type: "BOOLEAN",
    operator: "LTE",
    left: {
      kind: "DIVIDE",
      type: "RATIO",
      numerator: metricRef("total-debt", "expr-td"),
      denominator: metricRef("ebitda", "expr-ebitda"),
      exprId: "expr-tnl",
    },
    right: { kind: "RATIO", type: "RATIO", value: 3.5, exprId: "expr-gate" },
    exprId: "expr-tnl-gate",
  };

  const rpRule: IRRule = {
    ruleId: "rp-basket",
    irSchemaVersion: "ratio-demo",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    sourceDocumentId: "ratio-demo-doc",
    sourceSectionRef: "§rp-basket",
    covenantFamily: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: flatMoney(200, "expr-rp"),
    conditions: [{
      conditionId: "tnl-gate",
      conditionType: "RATIO_SATISFIED",
      expression: leverageConditionExpr,
      referencesDefinitionId: null,
      description: "pro forma Total Net Leverage Ratio shall not exceed 3.50 to 1.00",
      provenance: null,
    }],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "ratio-demo-doc",
      sourceNodeKey: null,
      sourceCitation: "cite-rp-basket",
      excerpt: "Restricted Payments not to exceed $200 so long as TNL ≤ 3.50x",
    },
    compilerVersion: null,
    sourceContentVersion: null,
  };

  // Builder basket: base 50 + equity-proceeds (METRIC), for equity contribution demos.
  const builderRule: IRRule = {
    ruleId: "builder-basket",
    irSchemaVersion: "ratio-demo",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    sourceDocumentId: "ratio-demo-doc",
    sourceSectionRef: "§builder-basket",
    covenantFamily: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: {
      kind: "ADD",
      type: "MONEY",
      operands: [
        flatMoney(50, "expr-builder-base"),
        metricRef("eligible-equity-proceeds", "expr-equity"),
      ],
      exprId: "expr-builder",
    },
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "ratio-demo-doc",
      sourceNodeKey: null,
      sourceCitation: "cite-builder",
      excerpt: "Builder Amount = $50 + Eligible Equity Proceeds",
    },
    compilerVersion: null,
    sourceContentVersion: null,
  };

  const rules = [debtRule, rpRule, builderRule];
  const facts = [
    figure("total-debt", RATIO_DEMO_INDEPENDENT_EXPECTATION.initialTotalDebt),
    figure("ebitda", RATIO_DEMO_INDEPENDENT_EXPECTATION.initialEbitda),
    figure("eligible-equity-proceeds", "0"),
    figure("ineligible-equity-proceeds", "0"),
  ];
  const snapshot: FinancialSnapshot = {
    snapshotId: "ratio-demo-snap",
    version: "1",
    companyId: RATIO_DEMO_ORG,
    asOf: RATIO_DEMO_AS_OF,
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: { source: "ratio sequential demo", sourceVersion: "v1" },
    review: {
      reviewedBy: "demo-reviewer",
      reviewedAt: "2026-07-01T00:00:00Z",
      approvalRef: "ratio-demo-approval",
    },
    inputs: facts,
  };
  const inputs = snapshotInputResolver({
    snapshots: [snapshot],
    definitions: [],
    rules,
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  });
  const graph = buildCapacityGraph({
    rules,
    sharedCapacities: [],
    definitions: [],
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    asOf: RATIO_DEMO_AS_OF,
  });
  const ledger: LedgerUsageRecord[] = [];
  const state = evaluateCapacityState({
    graph,
    rules,
    sharedCapacities: [],
    definitions: [],
    inputs,
    ledger,
    asOf: RATIO_DEMO_AS_OF,
  });
  void opts;
  return {
    graph,
    state,
    inputs,
    context: { rules, sharedCapacities: [], definitions: [], ledger, asOf: RATIO_DEMO_AS_OF },
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  };
}

/** Shared-capacity world: two members under one quantified pool. */
export function buildSharedCapacitySequentialWorld(): SequentialWorld {
  const member = (ruleId: string): IRRule => ({
    ruleId,
    irSchemaVersion: "shared-demo",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    sourceDocumentId: "shared-demo-doc",
    sourceSectionRef: `§${ruleId}`,
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: flatMoney(100, `expr-${ruleId}`),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "shared-demo-doc",
      sourceNodeKey: null,
      sourceCitation: `cite-${ruleId}`,
      excerpt: null,
    },
    compilerVersion: null,
    sourceContentVersion: null,
  });
  const rules = [member("prov-a"), member("prov-b")];
  const pool: IRSharedCapacity = {
    sharedCapId: "pool-1",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    description: "shared indebtedness pool $120",
    capExpression: flatMoney(120, "expr-pool"),
    memberRuleIds: ["prov-a", "prov-b"],
    provenance: null,
  };
  const facts: FinancialInput[] = [];
  const snapshot: FinancialSnapshot = {
    snapshotId: "shared-demo-snap",
    version: "1",
    companyId: RATIO_DEMO_ORG,
    asOf: RATIO_DEMO_AS_OF,
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: { source: "shared demo", sourceVersion: "v1" },
    review: {
      reviewedBy: "demo-reviewer",
      reviewedAt: "2026-07-01T00:00:00Z",
      approvalRef: "shared-demo-approval",
    },
    inputs: facts,
  };
  const inputs = snapshotInputResolver({
    snapshots: [snapshot],
    definitions: [],
    rules,
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  });
  const graph = buildCapacityGraph({
    rules,
    sharedCapacities: [pool],
    definitions: [],
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    asOf: RATIO_DEMO_AS_OF,
  });
  const state = evaluateCapacityState({
    graph,
    rules,
    sharedCapacities: [pool],
    definitions: [],
    inputs,
    ledger: [],
    asOf: RATIO_DEMO_AS_OF,
  });
  return {
    graph,
    state,
    inputs,
    context: { rules, sharedCapacities: [pool], definitions: [], ledger: [], asOf: RATIO_DEMO_AS_OF },
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  };
}
