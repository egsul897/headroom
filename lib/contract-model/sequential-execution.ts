/**
 * SEQUENTIAL EXECUTION — composition over the verified-execution adapter.
 *
 * Owns:
 *   - financial overlay chaining across hypothetical steps (TE-D3), via
 *     verified-execution.chainFinancialViewWithScope
 *   - sequential simulate → advance → independently recompute under REQUIRE
 *   - utilization honesty (UNKNOWN ≠ zero)
 *   - hypothetical vs completed ledger posting
 *
 * Does NOT import raw Phase-4 capacity/simulation primitives. Every capacity
 * evaluation and transaction simulation goes through evaluateVerifiedCapacity /
 * simulateVerifiedTransaction (REQUIRE, restore authority, shared-cap checks).
 */
import type { SemanticVerificationResult } from "./compiler/semantic-verification/types";
import type { IRExpression, IRRule, IRSharedCapacity } from "./ir/types";
import {
  InMemoryContractLedgerStore,
  rationalFromString,
  snapshotInputResolver,
  type FinancialInput,
  type FinancialSnapshot,
  type InputResolver,
  type LedgerWriteResult,
} from "./north-star-bridge";
import {
  chainFinancialViewWithScope,
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  UNAUTHORIZED_RESTORE_CODE,
  type CapacityAmount,
  type CapacityGraph,
  type CapacityState,
  type CapacityStateEntry,
  type ChangeMetricEffect,
  type EventStateEffect,
  type HypotheticalTransaction,
  type LedgerUsageRecord,
  type ReclassificationElection,
  type SelectedPath,
  type TransactionEffect,
  type TransactionQuantity,
  type TransactionSimulationResult,
  type VerifiedExecutionPackage,
  type VerifiedUnitArtifact,
} from "./verified-execution";

export {
  assertRestoreAuthority,
  chainFinancialViewWithScope,
  formatRestoreReason,
  UNAUTHORIZED_RESTORE_CODE,
} from "./verified-execution";

export {
  collectUnauthorizedRestores,
  extractRestoreAuthority,
  RESTORE_AUTHORITY_PATTERN,
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
  CapacityAmount,
  CapacityGraph,
  CapacityState,
  LedgerUsageRecord,
  InputResolver,
  VerifiedExecutionPackage,
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
// Sequential world — always opened through verified capacity under REQUIRE
// ---------------------------------------------------------------------------

export interface SequentialWorld {
  package: VerifiedExecutionPackage;
  inputs: InputResolver;
  ledger: LedgerUsageRecord[];
  asOf: string | null;
  graph: CapacityGraph;
  state: CapacityState;
  companyId: string;
  instrumentKey: string;
}

export type RunnerMode = "HYPOTHETICAL" | "COMPLETED";

export interface LedgerAppendSurface {
  /**
   * Discriminated ledger write result (same as InMemoryContractLedgerStore).
   * Success has no `issues`; failure has `issues` — do not flatten to `{ok, issues}`.
   */
  appendUsage(request: { usage: LedgerUsageRecord }): LedgerWriteResult;
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

/** Open a sequential world by evaluating the verified package under REQUIRE. */
export function openVerifiedSequentialWorld(args: {
  package: VerifiedExecutionPackage;
  inputs: InputResolver;
  ledger?: readonly LedgerUsageRecord[];
  asOf?: string | null;
}): SequentialWorld {
  const ledger = cloneLedger(args.ledger ?? []);
  const capacity = evaluateVerifiedCapacity({
    package: args.package,
    inputs: args.inputs,
    ledger,
    asOf: args.asOf ?? null,
  });
  if (capacity.outcome !== "EXECUTED") {
    throw new Error(
      `openVerifiedSequentialWorld refused: ${capacity.refusals.map((r) => r.code).join(",")}`,
    );
  }
  return {
    package: args.package,
    inputs: args.inputs,
    ledger,
    asOf: args.asOf ?? null,
    graph: capacity.graph,
    state: capacity.state,
    companyId: args.package.companyId,
    instrumentKey: args.package.instrumentKey,
  };
}

export function advanceWorld(w: SequentialWorld, r: TransactionSimulationResult): SequentialWorld {
  if (!r.postState) throw new Error("cannot advance without postState");
  const supersededIds = new Map(r.ledgerEffects.superseded.map((s) => [s.originalUsageId, s.proposed]));
  const ledger: LedgerUsageRecord[] = [
    ...w.ledger.map((u) => supersededIds.get(u.usageId) ?? u),
    ...r.ledgerEffects.proposed.map((p) => p.record),
  ];
  const chained = chainFinancialViewWithScope(w.inputs, r, {
    companyId: w.companyId,
    instrumentKey: w.instrumentKey,
  });
  return openVerifiedSequentialWorld({
    package: w.package,
    inputs: chained.resolver,
    ledger,
    asOf: w.asOf,
  });
}

function independentRecompute(
  w: SequentialWorld,
  utilizationStatus: UtilizationHistoryStatus,
): CapacitySnapshotView[] {
  const capacity = evaluateVerifiedCapacity({
    package: w.package,
    inputs: w.inputs,
    ledger: w.ledger,
    asOf: w.asOf,
  });
  if (capacity.outcome !== "EXECUTED") {
    throw new Error(
      `independentRecompute refused: ${capacity.refusals.map((r) => r.code).join(",")}`,
    );
  }
  return viewState(capacity.state, utilizationStatus);
}

/** Phase-4C capacity figures only (honestRemaining is a product overlay, not compared). */
type CapacityCompareView = Omit<CapacitySnapshotView, "honestRemaining" | "honestRemainingKind">;

function forCompare(views: CapacitySnapshotView[]): CapacityCompareView[] {
  return views.map(({ honestRemaining: _h, honestRemainingKind: _hk, ...rest }) => rest);
}

function snapshotsEqual(a: CapacityCompareView[], b: CapacityCompareView[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function runSequentialTransactions(args: {
  world: SequentialWorld;
  steps: SequentialStepSpec[];
  mode: RunnerMode;
  utilizationAffirmedComplete?: boolean;
  ledgerBackend?: LedgerAppendSurface;
}): SequentialRunResult {
  const originalLedger = args.world.ledger;
  const originalLedgerClone = cloneLedger(originalLedger);
  const affirmed = args.utilizationAffirmedComplete ?? false;
  const initialUtilization = classifyUtilizationHistory({
    ledgerCount: originalLedger.length,
    utilizationAffirmedComplete: affirmed,
  });

  let world: SequentialWorld = {
    ...args.world,
    ledger: cloneLedger(originalLedger),
  };

  const stepsOut: SequentialStepResult[] = [];
  let abortedAtStepId: string | null = null;
  const notes: string[] = [
    "Each step executes via simulateVerifiedTransaction under REQUIRE.",
    "Financial overlays chain via SET of prior APPLIED results into the next base resolver.",
    "Restore authority enforced at the verified-execution boundary.",
  ];

  for (const step of args.steps) {
    const utilizationStatus = classifyUtilizationHistory({
      ledgerCount: world.ledger.length,
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

    const verified = simulateVerifiedTransaction({
      package: world.package,
      inputs: world.inputs,
      ledger: world.ledger,
      asOf: world.asOf,
      transaction: step.transaction,
      selectedPath: step.selectedPath,
    });

    if (verified.outcome === "REFUSED") {
      const unauthorized = verified.refusals.some((r) => r.code === UNAUTHORIZED_RESTORE_CODE);
      stepsOut.push({
        stepId: step.stepId,
        businessType: step.businessType,
        recipeOk: true,
        recipeLimitations: verified.refusals.map((r) => ({
          code: r.code,
          message: r.message,
          refs: r.refs,
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
        unauthorizedRestoreBlocked: unauthorized,
        chainedMetricKeysAfter: [],
        financialViewChained: false,
        stateKinds: [{ kind: "HYPOTHETICAL_VIEW", note: STATE_KIND_NOTES.HYPOTHETICAL_VIEW }],
        notes: [...stepNotes, ...verified.refusals.map((r) => r.message)],
      });
      abortedAtStepId = step.stepId;
      notes.push(
        `Aborted at ${step.stepId}: verified refusal (${verified.refusals.map((r) => r.code).join(",")})`,
      );
      break;
    }

    // Pre-state for the step is the verified capacity recomputed under REQUIRE.
    const verifiedPre = viewState(verified.capacity, utilizationStatus);
    const simulation = verified.simulation;
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
      match = snapshotsEqual(forCompare(postViews), forCompare(independent));
      world = advanced;

      if (args.mode === "COMPLETED") {
        if (!args.ledgerBackend) throw new Error("COMPLETED mode requires ledgerBackend");
        if (!simulation.commitPlan.committable) {
          stepNotes.push("COMPLETED mode skipped ledger post: commitPlan.committable=false");
        } else {
          for (const p of simulation.ledgerEffects.proposed) {
            const posted = args.ledgerBackend.appendUsage({ usage: p.record });
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
      preState: verifiedPre,
      postState: postViews,
      independentPostCheck: independent,
      independentPostMatchesSimulation: match,
      preStateHash: verified.capacity.stateHash,
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
      ledgerCount: world.ledger.length,
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

export function materializeBackendUsages(backend: InMemoryContractLedgerStore): LedgerUsageRecord[] {
  const companyIds = new Set(
    backend.events
      .filter((e): e is Extract<typeof e, { type: "USAGE_APPENDED" }> => e.type === "USAGE_APPENDED")
      .map((e) => e.usage.companyId),
  );
  const out: LedgerUsageRecord[] = [];
  for (const id of companyIds) out.push(...backend.getUsages(id));
  return out;
}

export function createMemoryLedgerBackend(): InMemoryContractLedgerStore {
  return new InMemoryContractLedgerStore();
}

// ---------------------------------------------------------------------------
// Demo verification artifacts (SYNTHETIC — not Phase-3 customer certification)
// ---------------------------------------------------------------------------

const DEMO_STRONG = {
  irSchemaVersion: "seq-demo-v1",
  compilerVersion: "seq-demo-compiler-v1",
  sourceContentVersion: "seq-demo-source-v1",
} as const;

function identityOf(u: {
  ruleId?: string;
  sharedCapId?: string;
  companyId: string;
  instrumentKey: string;
  irSchemaVersion?: string;
  compilerVersion?: string | null;
  sourceContentVersion?: string | null;
}): VerifiedUnitArtifact["verifiedIdentity"] {
  return {
    ruleOrDefinitionId: u.ruleId ?? u.sharedCapId!,
    companyId: u.companyId,
    instrumentKey: u.instrumentKey,
    irSchemaVersion: u.irSchemaVersion ?? "",
    compilerVersion: u.compilerVersion ?? null,
    sourceContentVersion: u.sourceContentVersion ?? null,
  };
}

function cleanResult(over: {
  irInventoryItems?: SemanticVerificationResult["irInventory"]["items"];
} = {}): SemanticVerificationResult {
  return {
    candidateRef: "seq-demo-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "seq-demo-cand",
      items: over.irInventoryItems ?? [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "seq-demo-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "SEQUENTIAL_DEMO — no live verifier",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "seq-demo-verifier-v1",
    verifiedAt: "2026-07-01T00:00:00.000Z",
    evidenceSetHash: "seq-demo-eh",
  } as unknown as SemanticVerificationResult;
}

function artifactForRule(u: IRRule): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: u.ruleId,
    kind: "RULE",
    verifiedIdentity: identityOf(u),
    result: cleanResult(),
  };
}

function artifactForShared(cap: IRSharedCapacity): VerifiedUnitArtifact {
  const items = [
    {
      itemId: `${cap.sharedCapId}:amount`,
      kind: "AMOUNT" as const,
      ruleOrDefinitionId: cap.sharedCapId,
      irPath: "sharedCapacities[0].capExpression",
      numericValue:
        cap.capExpression && "amount" in cap.capExpression
          ? (cap.capExpression as { amount: number }).amount
          : null,
      textValue: null,
      isAlternativeWithinSelection: false,
      sourceCitation: null,
      sourceExcerpt: null,
    },
    ...cap.memberRuleIds.map((m, i) => ({
      itemId: `${cap.sharedCapId}:member-${i}`,
      kind: "DEPENDENCY" as const,
      ruleOrDefinitionId: cap.sharedCapId,
      irPath: `sharedCapacities[0].memberRuleIds[${i}]`,
      numericValue: null,
      textValue: `SHARED_CAP_MEMBER:${m}`,
      isAlternativeWithinSelection: false,
      sourceCitation: null,
      sourceExcerpt: null,
    })),
  ];
  return {
    ruleOrDefinitionId: cap.sharedCapId,
    kind: "SHARED_CAPACITY",
    verifiedIdentity: identityOf(cap),
    result: cleanResult({ irInventoryItems: items }),
  };
}

function packageFrom(
  companyId: string,
  instrumentKey: string,
  rules: IRRule[],
  sharedCapacities: IRSharedCapacity[] = [],
): VerifiedExecutionPackage {
  return {
    companyId,
    instrumentKey,
    rules,
    definitions: [],
    sharedCapacities,
    verifications: [...rules.map(artifactForRule), ...sharedCapacities.map(artifactForShared)],
  };
}

// ---------------------------------------------------------------------------
// Ratio-gated independent demonstration world
// ---------------------------------------------------------------------------

export const RATIO_DEMO_ORG = "ratio-seq-org";
export const RATIO_DEMO_FACILITY = "ratio-seq-facility";
export const RATIO_DEMO_AS_OF = "2026-06-30";

const L = { exprId: null, inputKeys: [] as string[] };

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
    value: {
      type: "MONEY",
      amount: rationalFromString(amount),
      currency: "USD",
      lineage: L,
    },
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

function approvedSnapshot(
  snapshotId: string,
  source: string,
  inputs: FinancialInput[],
): FinancialSnapshot {
  return {
    snapshotId,
    version: "1",
    companyId: RATIO_DEMO_ORG,
    asOf: RATIO_DEMO_AS_OF,
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: { source, sourceVersion: "v1" },
    review: {
      reviewedBy: "demo-reviewer",
      reviewedAt: "2026-07-01T00:00:00Z",
      approvalRef: `${snapshotId}-approval`,
    },
    inputs,
  };
}

function stampRule(rule: IRRule): IRRule {
  return { ...rule, ...DEMO_STRONG };
}

function stampShared(cap: IRSharedCapacity): IRSharedCapacity {
  return { ...cap, ...DEMO_STRONG };
}

function worldFrom(
  rules: IRRule[],
  facts: FinancialInput[],
  sharedCapacities: IRSharedCapacity[] = [],
  ledger: LedgerUsageRecord[] = [],
  snapshotId = "seq-demo-snap",
  source = "sequential demo",
): SequentialWorld {
  const stampedRules = rules.map(stampRule);
  const stampedShared = sharedCapacities.map(stampShared);
  const pkg = packageFrom(RATIO_DEMO_ORG, RATIO_DEMO_FACILITY, stampedRules, stampedShared);
  const inputs = snapshotInputResolver({
    snapshots: [approvedSnapshot(snapshotId, source, facts)],
    definitions: [],
    rules: stampedRules,
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
  });
  return openVerifiedSequentialWorld({
    package: pkg,
    inputs,
    ledger,
    asOf: RATIO_DEMO_AS_OF,
  });
}

/** Flat multi-basket world (no leverage gate) for the five-step happy-path demo. */
export function buildFlatSequentialWorld(): SequentialWorld {
  const mk = (
    ruleId: string,
    amount: number,
    family: IRRule["covenantFamily"],
    action: NonNullable<IRRule["action"]>,
  ): IRRule => ({
    ruleId,
    irSchemaVersion: DEMO_STRONG.irSchemaVersion,
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
    compilerVersion: DEMO_STRONG.compilerVersion,
    sourceContentVersion: DEMO_STRONG.sourceContentVersion,
  });
  return worldFrom(
    [
      mk("debt-basket", 500, "INDEBTEDNESS", "INCUR_DEBT"),
      mk("rp-basket", 200, "RESTRICTED_PAYMENTS", "PAY_DIVIDEND"),
      mk("invest-basket", 150, "INVESTMENTS", "MAKE_INVESTMENT"),
    ],
    [
      figure("total-debt", "1000"),
      figure("equity-proceeds", "0"),
      figure("builder-available", "50"),
      figure("eligible-equity-proceeds", "0"),
      figure("ebitda", "100"),
    ],
    [],
    [],
    "flat-demo-snap",
    "flat sequential demo",
  );
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

export function buildRatioGatedSequentialWorld(_opts?: {
  utilizationAffirmedComplete?: boolean;
}): SequentialWorld {
  const debtRule: IRRule = {
    ruleId: "debt-basket",
    irSchemaVersion: DEMO_STRONG.irSchemaVersion,
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
    compilerVersion: DEMO_STRONG.compilerVersion,
    sourceContentVersion: DEMO_STRONG.sourceContentVersion,
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
    irSchemaVersion: DEMO_STRONG.irSchemaVersion,
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
    compilerVersion: DEMO_STRONG.compilerVersion,
    sourceContentVersion: DEMO_STRONG.sourceContentVersion,
  };

  const builderRule: IRRule = {
    ruleId: "builder-basket",
    irSchemaVersion: DEMO_STRONG.irSchemaVersion,
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
    compilerVersion: DEMO_STRONG.compilerVersion,
    sourceContentVersion: DEMO_STRONG.sourceContentVersion,
  };

  void _opts;
  return worldFrom(
    [debtRule, rpRule, builderRule],
    [
      figure("total-debt", RATIO_DEMO_INDEPENDENT_EXPECTATION.initialTotalDebt),
      figure("ebitda", RATIO_DEMO_INDEPENDENT_EXPECTATION.initialEbitda),
      figure("eligible-equity-proceeds", "0"),
      figure("ineligible-equity-proceeds", "0"),
    ],
    [],
    [],
    "ratio-demo-snap",
    "ratio sequential demo",
  );
}

/** Shared-capacity world: two members under one quantified pool. */
export function buildSharedCapacitySequentialWorld(): SequentialWorld {
  const member = (ruleId: string): IRRule => ({
    ruleId,
    irSchemaVersion: DEMO_STRONG.irSchemaVersion,
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
    compilerVersion: DEMO_STRONG.compilerVersion,
    sourceContentVersion: DEMO_STRONG.sourceContentVersion,
  });
  const pool: IRSharedCapacity = {
    sharedCapId: "pool-1",
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    description: "shared indebtedness pool $120",
    capExpression: flatMoney(120, "expr-pool"),
    memberRuleIds: ["prov-a", "prov-b"],
    provenance: null,
    ...DEMO_STRONG,
  };
  return worldFrom(
    [member("prov-a"), member("prov-b")],
    [],
    [pool],
    [],
    "shared-demo-snap",
    "shared demo",
  );
}

/**
 * Build a minimal verified sequential world from IR rules + ledger (tests).
 * Attaches SYNTHETIC clean verification artifacts — not customer certification.
 */
export function buildVerifiedSequentialWorldForRules(args: {
  rules: IRRule[];
  sharedCapacities?: IRSharedCapacity[];
  ledger?: LedgerUsageRecord[];
  companyId?: string;
  instrumentKey?: string;
  asOf?: string;
}): SequentialWorld {
  const companyId = args.companyId ?? RATIO_DEMO_ORG;
  const instrumentKey = args.instrumentKey ?? RATIO_DEMO_FACILITY;
  const asOf = args.asOf ?? RATIO_DEMO_AS_OF;
  const stampedRules = args.rules.map((r) =>
    stampRule({
      ...r,
      companyId,
      instrumentKey,
    }),
  );
  const stampedShared = (args.sharedCapacities ?? []).map((c) =>
    stampShared({ ...c, companyId, instrumentKey }),
  );
  const pkg = packageFrom(companyId, instrumentKey, stampedRules, stampedShared);
  const snap = approvedSnapshot("rules-world-snap", "verified sequential rules world", []);
  snap.companyId = companyId;
  const resolver = snapshotInputResolver({
    snapshots: [snap],
    definitions: [],
    rules: stampedRules,
    companyId,
    instrumentKey,
  });
  return openVerifiedSequentialWorld({
    package: pkg,
    inputs: resolver,
    ledger: args.ledger ?? [],
    asOf,
  });
}
