/**
 * PHASE 4D - the deterministic hypothetical transaction and state-transition model.
 *
 * This module answers one question: given THIS explicitly described hypothetical transaction and
 * THIS explicitly selected legal/capacity path, what would happen to the state?
 *
 * It does not answer which path to use, what the largest possible transaction is, how to split an
 * amount across capacities, or which capacity is preferable. Those are Phase 4E.
 *
 * It owns no arithmetic (Phase 4A), no financial facts (Phase 4B) and no capacity semantics
 * (Phase 4C). It composes them over a caller-supplied specification and nothing else.
 *
 * A transaction's `category` and `label` are metadata. No behavioural branch reads them: every
 * consequence comes from a typed effect, an explicitly selected path, an encoded legal rule, a
 * capacity node, a ledger instruction or a caller-supplied financial adjustment.
 */
import type { EntityClassTag } from "@prisma/client";
import type { EvaluationResult, SerializedRuntimeValue } from "../types";
import type { DependencyRecord } from "../input/types";
import type {
  CapacityAmount, CapacityGraph, CapacityState, LedgerUsageRecord, ReclassificationElection,
  ReclassificationOutcome, UsageStatus,
} from "../capacity/types";

// ---------------------------------------------------------------------------
// Quantities - the Phase-4A unit system, never a second one
// ---------------------------------------------------------------------------

/**
 * An exact quantity as the caller states it. Every numeric payload is an exact decimal STRING that
 * the Phase-4A rational parser consumes; no float, no formatted string, no unit system of our own.
 */
export type TransactionQuantity =
  | { type: "MONEY"; amount: string; currency: string }
  | { type: "NUMBER"; value: string }
  | { type: "PERCENT"; fraction: string }
  | { type: "RATIO"; value: string };

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/**
 * The typed effect vocabulary. A transaction is a set of these, never a named transaction form.
 *
 * Produced in this version:
 *   CONSUME_CAPACITY        draw an explicit amount against one explicitly selected capacity
 *   RESTORE_CAPACITY        release an identified existing usage, so the capacity it consumed returns
 *   SUPERSEDE_LEDGER_USAGE  replace an identified existing usage with a restated amount
 *   APPLY_RECLASSIFICATION  execute one caller-supplied election against an encoded Phase-3 edge
 *   CHANGE_METRIC           an explicit pro-forma adjustment to one financial input
 *   ACTIVATE_EVENT          state that a described event is active in the pro-forma view
 *   DEACTIVATE_EVENT        state that a described event is not active in the pro-forma view
 *
 * Reserved, never produced (see RESERVED_EFFECT_KINDS for the reason each one is refused):
 *   CREATE_LEDGER_USAGE, CHANGE_BALANCE, CHANGE_ENTITY_STATE
 */
export type TransactionEffectKind =
  | "CONSUME_CAPACITY"
  | "RESTORE_CAPACITY"
  | "SUPERSEDE_LEDGER_USAGE"
  | "APPLY_RECLASSIFICATION"
  | "CHANGE_METRIC"
  | "ACTIVATE_EVENT"
  | "DEACTIVATE_EVENT"
  | "CREATE_LEDGER_USAGE"
  | "CHANGE_BALANCE"
  | "CHANGE_ENTITY_STATE";

export const SUPPORTED_EFFECT_KINDS: readonly TransactionEffectKind[] = [
  "CONSUME_CAPACITY", "RESTORE_CAPACITY", "SUPERSEDE_LEDGER_USAGE", "APPLY_RECLASSIFICATION",
  "CHANGE_METRIC", "ACTIVATE_EVENT", "DEACTIVATE_EVENT",
];

/**
 * Effect kinds this version refuses, each with the contract reason. A refusal is an explicit
 * UNSUPPORTED_TRANSACTION_EFFECT limitation, never a silent no-op and never an approximation.
 */
export const RESERVED_EFFECT_KINDS: Record<string, string> = {
  CREATE_LEDGER_USAGE: "usage rows are produced only as the consequence of CONSUME_CAPACITY, SUPERSEDE_LEDGER_USAGE or APPLY_RECLASSIFICATION, so that every proposed row has passed an availability or conservation check; a bare ledger insert would bypass both",
  CHANGE_BALANCE: "Phase 4B models a financial fact as an identified input, not as a balance-sheet account; a balance movement must be stated as CHANGE_METRIC against the input the contract actually references, so the runtime never infers which account a transaction touches",
  CHANGE_ENTITY_STATE: "Phase 3 carries entity scope as a static tag set on the rule; no runtime entity-state store exists to transition, and inventing one would let Phase 4D widen scope",
};

export interface TransactionEffectBase {
  /** Unique within the transaction. Proposed ledger identity derives from it, so it is semantic. */
  effectId: string;
  kind: TransactionEffectKind;
  /** Free text for the reader. No behavioural branch reads it. */
  note?: string | null;
  /**
   * Other effects whose result this effect's own magnitude depends on. This is how a caller states
   * a circular specification honestly; Phase 4D detects the cycle and refuses rather than iterating.
   */
  dependsOnEffectIds?: string[];
}

export interface ConsumeCapacityEffect extends TransactionEffectBase {
  kind: "CONSUME_CAPACITY";
  /** A capacity node the caller selected. It must appear in selectedPath.capacityNodeIds. */
  capacityNodeId: string;
  amount: TransactionQuantity;
}

export interface RestoreCapacityEffect extends TransactionEffectBase {
  kind: "RESTORE_CAPACITY";
  /** An existing usage identity. It is superseded in the proposed view, never deleted. */
  usageId: string;
  reason: string;
}

export interface SupersedeLedgerUsageEffect extends TransactionEffectBase {
  kind: "SUPERSEDE_LEDGER_USAGE";
  usageId: string;
  /** The restated amount. Null restates nothing and is equivalent to a full release. */
  replacementAmount: TransactionQuantity | null;
  reason: string;
}

export interface ApplyReclassificationEffect extends TransactionEffectBase {
  kind: "APPLY_RECLASSIFICATION";
  election: ReclassificationElection;
}

export interface ChangeMetricEffect extends TransactionEffectBase {
  kind: "CHANGE_METRIC";
  /** The Phase-4B input key, exactly as the contract reference names it. Never matched fuzzily. */
  metricKey: string;
  period: string | null;
  asOf: string | null;
  /** DELTA adds to the base fact through the Phase-4A unit algebra; SET states a value outright. */
  adjustment: { kind: "DELTA" | "SET"; value: TransactionQuantity };
}

export interface EventStateEffect extends TransactionEffectBase {
  kind: "ACTIVATE_EVENT" | "DEACTIVATE_EVENT";
  eventDescription: string;
  asOf: string | null;
}

export interface ReservedEffect extends TransactionEffectBase {
  kind: "CREATE_LEDGER_USAGE" | "CHANGE_BALANCE" | "CHANGE_ENTITY_STATE";
}

export type TransactionEffect =
  | ConsumeCapacityEffect | RestoreCapacityEffect | SupersedeLedgerUsageEffect
  | ApplyReclassificationEffect | ChangeMetricEffect | EventStateEffect | ReservedEffect;

// ---------------------------------------------------------------------------
// The transaction and the selected path
// ---------------------------------------------------------------------------

export interface HypotheticalTransaction {
  transactionId: string;
  companyId: string;
  instrumentKey: string;
  /** The date the hypothetical transaction is effective. Proposed usage rows carry it. */
  effectiveAsOf: string;
  /**
   * Descriptive metadata only. Phase 4D branches on no part of either: a transaction described one
   * way and the same effects described another way produce the same consequences.
   */
  category?: string | null;
  label?: string | null;
  /** The entity classes the transaction is undertaken by, checked against Phase-3 scope, never widened. */
  entities?: EntityClassTag[];
  /**
   * The total the caller says this transaction is, when they state one. Supplied so an explicit
   * allocation across several capacities can be checked against it; never used to derive a split.
   */
  intendedAmount?: TransactionQuantity | null;
  /** An amount the caller deliberately leaves outside the selected capacities. */
  unallocatedAmount?: TransactionQuantity | null;
  /** Ordered. The sequence is part of the specification and is carried into identity. */
  effects: TransactionEffect[];
  provenance: { source: string; sourceVersion: string | null; approvalRef: string | null };
}

/**
 * The legal and capacity path the CALLER selected. Phase 4D validates exactly this path and never
 * looks for another one: no alternative is considered, compared, ordered or recommended.
 *
 * Every id collection here is ORDER-INSENSITIVE: the same set in a different order is the same
 * selection and hashes identically.
 */
export interface SelectedPath {
  capacityNodeIds: string[];
  ruleIds: string[];
  sharedCapacityIds: string[];
  reclassificationElectionIds: string[];
}

// ---------------------------------------------------------------------------
// Statuses - two independent dimensions
// ---------------------------------------------------------------------------

/** Whether the SIMULATION itself ran. Never whether the transaction is permitted. */
export type SimulationStatus = "SIMULATED" | "NEEDS_INPUT" | "UNSUPPORTED" | "AMBIGUOUS" | "REVIEW_REQUIRED" | "ERROR";

/** Whether the SELECTED PATH works for this transaction. Independent of whether simulation ran. */
export type SelectedPathResult = "SATISFIED" | "NOT_SATISFIED" | "INSUFFICIENT_CAPACITY" | "REVIEW_REQUIRED" | "INDETERMINATE" | "NOT_APPLICABLE";

export const SIMULATION_STATUS_PRECEDENCE: Record<SimulationStatus, number> = {
  SIMULATED: 0, NEEDS_INPUT: 1, AMBIGUOUS: 2, REVIEW_REQUIRED: 3, UNSUPPORTED: 4, ERROR: 5,
};

export const SELECTED_PATH_RESULT_PRECEDENCE: Record<SelectedPathResult, number> = {
  SATISFIED: 0, REVIEW_REQUIRED: 1, INDETERMINATE: 2, INSUFFICIENT_CAPACITY: 3, NOT_SATISFIED: 4, NOT_APPLICABLE: 5,
};

// ---------------------------------------------------------------------------
// Limitations
// ---------------------------------------------------------------------------

export type SimulationLimitationCode =
  | "SELECTED_PATH_NOT_FOUND"
  | "SELECTED_RULE_NOT_FOUND"
  | "SELECTED_SHARED_CAPACITY_NOT_FOUND"
  | "EFFECT_TARGET_NOT_IN_SELECTED_PATH"
  | "AMBIGUOUS_CAPACITY_ALLOCATION"
  | "INVALID_EXPLICIT_ALLOCATION"
  | "INSUFFICIENT_CAPACITY"
  | "SHARED_CAPACITY_NOT_QUANTIFIED"
  | "RECLASSIFICATION_NOT_EXECUTABLE"
  | "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"
  | "INCOMPATIBLE_UNIT"
  | "MISSING_FINANCIAL_INPUT"
  | "AMBIGUOUS_FINANCIAL_INPUT"
  | "PHASE3_RULE_NOT_SAFE_TO_RELY_ON"
  | "PHASE3_RULE_UNSUPPORTED"
  | "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON"
  | "ENTITY_SCOPE_UNSPECIFIED"
  | "TRANSACTION_ENTITY_EXCLUDED"
  | "TRANSACTION_ENTITY_NOT_IN_SCOPE"
  | "FIXED_POINT_REQUIRED"
  | "TRANSACTION_EFFECT_DEPENDENCY_CYCLE"
  | "UNSUPPORTED_TRANSACTION_EFFECT"
  | "LEDGER_USAGE_NOT_FOUND"
  | "DUPLICATE_PROPOSED_LEDGER_IDENTITY"
  | "DUPLICATE_EFFECT_IDENTITY"
  | "INVALID_RECLASSIFICATION_SOURCE"
  | "INVALID_RECLASSIFICATION_TARGET"
  | "CAPACITY_NOT_DETERMINED"
  | "CAPACITY_GATE_NOT_SATISFIED"
  | "OVERLAY_BASE_INPUT_MISSING"
  | "CONDITION_NOT_SATISFIED"
  | "TRANSACTION_SCOPE_MISMATCH"
  // --- composition safety (Phase-4D remediation) ---------------------------
  /** The COMBINED draws of this transaction exceed a capacity or a quantified shared resource. */
  | "INSUFFICIENT_AGGREGATE_CAPACITY"
  /** Two or more effects claim the same historical usage identity as their predecessor. */
  | "CONFLICTING_LEDGER_SUCCESSOR"
  /** Two or more effects assign incompatible states to the same event target. */
  | "CONFLICTING_EVENT_STATE"
  /** Two or more effects assign incompatible adjustments to the same financial input target. */
  | "CONFLICTING_METRIC_ADJUSTMENT"
  /** An effect declares a dependency on an effect id this transaction does not carry. */
  | "INVALID_EFFECT_DEPENDENCY"
  /** A declared dependency contradicts the stated effect order under sequential semantics. */
  | "EFFECT_DEPENDENCY_CONTRADICTS_ORDER"
  /** The recomputed post-state contradicts the transaction-level verdict and is not published. */
  | "POST_STATE_INCONSISTENT"
  /** The stated sequence cannot be honoured alongside an effect group that must apply atomically. */
  | "UNSUPPORTED_EFFECT_INTERLEAVING"
  /** The combined effects remove more usage from a resource than it carried: capacity from nothing. */
  | "USAGE_CONSERVATION_VIOLATED";

export interface SimulationLimitation {
  code: SimulationLimitationCode;
  message: string;
  /** Effects, capacity nodes, rules, usage records or input keys the limitation attaches to. */
  refs: string[];
}

// ---------------------------------------------------------------------------
// Financial overlay (pro-forma input view)
// ---------------------------------------------------------------------------

export type OverlayEntryState = "APPLIED" | "BASE_MISSING" | "BASE_NOT_RESOLVED" | "INCOMPATIBLE_UNIT";

/** One explicitly adjusted financial input, showing base, adjustment and result side by side. */
export interface OverlayEntry {
  effectId: string;
  transactionId: string;
  metricKey: string;
  period: string | null;
  asOf: string | null;
  adjustmentKind: "DELTA" | "SET";
  adjustment: TransactionQuantity;
  state: OverlayEntryState;
  baseValue: SerializedRuntimeValue | null;
  result: SerializedRuntimeValue | null;
  reason: string;
  /** The Phase-4B provenance of the base fact, preserved: an overlay adjusts a fact, it does not replace its source. */
  baseProvenance: { snapshotId: string | null; snapshotVersion: string | null; source: string | null } | null;
}

export interface EventOverlayEntry {
  effectId: string;
  transactionId: string;
  eventDescription: string;
  asOf: string | null;
  active: boolean;
}

/**
 * The pro-forma view the transaction is evaluated against: an immutable base snapshot set plus the
 * caller's explicit adjustments. The approved snapshot is never mutated.
 */
export interface SimulationInputView {
  inputContractVersion: string;
  baseSnapshotBinding: CapacityState["snapshotBinding"];
  adjustments: OverlayEntry[];
  eventAdjustments: EventOverlayEntry[];
  /** Inputs read with no adjustment applied keep the base value; only the listed keys differ. */
  unadjustedInputsUseBaseValues: true;
  inputViewHash: string;
}

// ---------------------------------------------------------------------------
// Per-effect results
// ---------------------------------------------------------------------------

export interface CapacityEffectResult {
  effectId: string;
  capacityNodeId: string;
  ruleId: string | null;
  sharedCapacityId: string | null;
  /** What the caller asked to draw. */
  attemptedAmount: TransactionQuantity;
  /** What the recertified Phase-4C state says is effectively available, pre-transaction. */
  availableAmount: CapacityAmount;
  /** available - attempted, when both are determined amounts. Negative means a shortfall. */
  shortfallAmount: SerializedRuntimeValue | null;
  outcome: SelectedPathResult;
  /** The pre-transaction capacity status this draw was measured against. */
  capacityStatus: CapacityState["capacities"][number]["status"];
  /**
   * The arithmetic computed against a capacity whose legal state is not safe to rely on. Kept apart
   * so an unsafe rule can never be read as an authoritative permission.
   */
  provisional: { availableAmount: CapacityAmount; shortfallAmount: SerializedRuntimeValue | null; outcome: SelectedPathResult } | null;
  sharedConstraintIds: string[];
  limitations: SimulationLimitation[];
}

export type ProposedLedgerEntryKind = "PROPOSED_USAGE" | "SUPERSEDED_USAGE" | "RECLASSIFIED_USAGE";

/** A ledger row the transaction WOULD create. Nothing here is written anywhere. */
export interface ProposedLedgerEffect {
  kind: ProposedLedgerEntryKind;
  effectId: string | null;
  transactionId: string;
  simulationId: string;
  record: LedgerUsageRecord;
  /** The identity of the existing row this one supersedes, when it supersedes one. */
  supersedesUsageId: string | null;
  /** The pre-transaction ledger identity this proposal was derived against. */
  preStateLedgerHash: string;
  origin: "CONSUME_CAPACITY" | "SUPERSEDE_LEDGER_USAGE" | "RESTORE_CAPACITY" | "RECLASSIFICATION_ELECTION";
}

/** An existing row restated in the proposed view. The original object is never mutated. */
export interface SupersededLedgerEffect {
  effectId: string;
  originalUsageId: string;
  /** The historical record, verbatim. History is preserved, never deleted. */
  original: LedgerUsageRecord;
  /** The same identity, restated in the proposed view with its explicit successor. */
  proposed: LedgerUsageRecord;
  supersededByUsageId: string;
  reason: string;
}

export interface ConditionResult {
  ruleId: string;
  conditionId: string;
  conditionType: string;
  description: string;
  result: "SATISFIED" | "NOT_SATISFIED" | "NEEDS_INPUT" | "UNSUPPORTED" | "AMBIGUOUS" | "REVIEW_REQUIRED";
  reason: string;
  evaluation: EvaluationResult | null;
}

export type EntityScopeOutcome =
  | "CONFIRMED_APPLICABLE"
  | "CONFIRMED_EXCLUDED"
  | "NOT_IN_DECLARED_SCOPE"
  | "SCOPE_UNSPECIFIED"
  | "SCOPE_NOT_SAFE_TO_RELY_ON"
  | "NO_TRANSACTION_ENTITIES_SUPPLIED";

export interface EntityScopeResult {
  ruleId: string;
  transactionEntities: EntityClassTag[];
  ruleEntityScope: EntityClassTag[];
  ruleEntityScopeExcluded: EntityClassTag[];
  auditStatus: string | null;
  safeToRely: boolean | null;
  outcome: EntityScopeOutcome;
  reason: string;
}

// ---------------------------------------------------------------------------
// Dependency manifest (known before substantive evaluation)
// ---------------------------------------------------------------------------

export interface SimulationDependencyManifest {
  transactionSimulationVersion: string;
  /** The Phase-4B financial requirements of every selected rule, unioned by full identity. */
  financialInputs: DependencyRecord[];
  requiredCapacityNodeIds: string[];
  requiredRuleIds: string[];
  requiredSharedCapacityIds: string[];
  requiredLedgerUsageIds: string[];
  requiredReclassificationElectionIds: string[];
  requiredReclassificationEdges: { sourceRuleId: string; destinationRuleId: string }[];
  adjustedInputKeys: string[];
  adjustedEventDescriptions: string[];
  entityScopeDependencies: string[];
  manifestHash: string;
}

// ---------------------------------------------------------------------------
// Trace and provenance
// ---------------------------------------------------------------------------

export type SimulationTraceStepName =
  | "TRANSACTION_VALIDATED"
  | "SELECTED_PATH_VALIDATED"
  | "DEPENDENCY_MANIFEST_GENERATED"
  | "PRE_STATE_LOADED"
  | "BASE_SNAPSHOT_LOADED"
  | "FINANCIAL_OVERLAY_APPLIED"
  | "SIMULATION_INPUT_VIEW_CREATED"
  | "CAPACITIES_EVALUATED"
  | "CONDITIONS_EVALUATED"
  | "CAPACITY_CONSUMPTION_CALCULATED"
  | "SHARED_CONSTRAINTS_EVALUATED"
  | "RECLASSIFICATION_APPLIED"
  | "PROPOSED_LEDGER_EFFECTS_CREATED"
  | "POST_STATE_DERIVED"
  | "STATUS_FINALIZED";

export interface SimulationTraceStep {
  step: number;
  name: SimulationTraceStepName;
  status: "OK" | "BLOCKED" | "SKIPPED";
  inputs: string[];
  outputs: string[];
  reason: string;
  provenance: string[];
}

export interface SimulationProvenanceLink {
  from: string;
  to: string;
  via: string;
}

export interface SimulationProvenance {
  transactionId: string;
  simulationId: string;
  preStateHash: string;
  postStateHash: string | null;
  capacityGraphHash: string;
  snapshotSetHash: string | null;
  inputViewHash: string;
  ledgerPreHash: string;
  ledgerPostHash: string | null;
  runtimeVersion: string;
  inputContractVersion: string;
  capacityGraphVersion: string;
  transactionSimulationVersion: string;
  /** The ordered chain from the transaction input through to the post-state. */
  chain: SimulationProvenanceLink[];
  /** Upstream limitations carried forward; a limited source stays limited downstream. */
  inheritedLimitations: { origin: string; code: string; message: string }[];
}

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

export interface SimulationComplexity {
  capacitiesEvaluated: number;
  conditionsEvaluated: number;
  ledgerEntriesExamined: number;
  effectsApplied: number;
  graphEdgesTraversed: number;
  maxDependencyDepth: number;
  simulationSteps: number;
  reclassificationEdgesExamined: number;
  sharedResourcesEvaluated: number;
  stateEvaluations: number;
  indexLookups: number;
}

// ---------------------------------------------------------------------------
// Commit plan - declarative only
// ---------------------------------------------------------------------------

export interface SimulationCommitPlan {
  /** True only when the simulation produced an authoritative, complete post-state. */
  committable: boolean;
  blockedBy: SimulationLimitationCode[];
  wouldAppendLedgerRecords: LedgerUsageRecord[];
  wouldSupersedeUsageIds: string[];
  wouldRecordElectionIds: string[];
  postStateHash: string | null;
  /** Phase 4D never persists, never executes and never schedules this plan. */
  executed: false;
  note: string;
}

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

export interface TransactionSimulationResult {
  transactionSimulationVersion: string;
  runtimeVersion: string;
  inputContractVersion: string;
  capacityGraphVersion: string;

  simulationStatus: SimulationStatus;
  selectedPathResult: SelectedPathResult;

  transactionIdentity: { transactionId: string; transactionHash: string; fields: Record<string, unknown> };
  simulationIdentity: { simulationId: string; simulationHash: string };
  selectedPath: SelectedPath;
  dependencyManifest: SimulationDependencyManifest;

  preStateIdentity: { stateHash: string; graphHash: string; ledgerHash: string; asOf: string | null };
  preTransactionState: CapacityState;
  simulationInputView: SimulationInputView;

  /** Every effect the caller supplied, with what it was understood to do. */
  effects: { effectId: string; kind: TransactionEffectKind; supported: boolean; applied: boolean; reason: string }[];
  capacityEffects: CapacityEffectResult[];
  ledgerEffects: { proposed: ProposedLedgerEffect[]; superseded: SupersededLedgerEffect[] };
  financialEffects: OverlayEntry[];
  reclassificationEffects: {
    outcomes: ReclassificationOutcome[];
    batchConservation: { sourceRuleId: string; sourceUsage: string | null; requested: string; holds: boolean }[];
    allExecuted: boolean;
  };

  /** Null whenever any required effect failed. A partial application is never published as a state. */
  postState: CapacityState | null;
  postStateIdentity: { postStateHash: string; boundTo: Record<string, string | null> } | null;

  conditions: ConditionResult[];
  entityScope: EntityScopeResult[];
  missingInputs: string[];
  limitations: SimulationLimitation[];
  diagnostics: { code: string; message: string; refs: string[] }[];
  trace: SimulationTraceStep[];
  provenance: SimulationProvenance;
  complexity: SimulationComplexity;
  commitPlan: SimulationCommitPlan;

  /** What this phase deliberately does not do, stated on every result. */
  notComputed: {
    pathSelection: "NOT_COMPUTED_IN_PHASE_4D";
    maximumTransactionAmount: "NOT_COMPUTED_IN_PHASE_4D";
    allocationAcrossCapacities: "NOT_COMPUTED_IN_PHASE_4D";
    alternativePathComparison: "NOT_COMPUTED_IN_PHASE_4D";
    accountingTreatment: "NOT_COMPUTED_IN_PHASE_4D";
    currencyConversion: "NOT_COMPUTED_IN_PHASE_4D";
  };
}

// ---------------------------------------------------------------------------
// Entry-point arguments
// ---------------------------------------------------------------------------

export interface SimulateTransactionArgs {
  transaction: HypotheticalTransaction;
  /** The immutable pre-transaction state. Never mutated. */
  currentState: CapacityState;
  capacityGraph: CapacityGraph;
  selectedPath: SelectedPath;
  /** The Phase-4B resolver over the approved snapshot set. Never mutated. */
  inputs: import("../types").InputResolver;
  context: {
    rules: readonly import("../../ir/types").IRRule[];
    sharedCapacities?: readonly import("../../ir/types").IRSharedCapacity[];
    definitions?: readonly import("../../ir/types").IRDefinition[];
    /** The ledger the pre-state was computed from. Never mutated. */
    ledger?: readonly LedgerUsageRecord[];
    ledgerPolicy?: { acceptableUsageStatuses: UsageStatus[] };
    asOf?: string | null;
  };
}
