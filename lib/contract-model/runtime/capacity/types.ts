/**
 * PHASE 4C - the deterministic capacity state over an already-specified legal and financial state.
 *
 * This module answers: what capacity exists now, what is shared, what has been used, what remains.
 * It does NOT choose which permission a transaction should use, does not solve for a maximum
 * amount, does not optimize an allocation, and does not simulate a hypothetical transaction. Those
 * are Phase 4D (hypothetical state transitions) and Phase 4E (the solver).
 *
 * It owns no arithmetic. Every number comes from the Phase-4A evaluator and the Phase-4A unit
 * algebra; every financial fact comes through the Phase-4B strict resolver.
 */
import type { EntityClassTag } from "@prisma/client";
import type { IRRule, IRSharedCapacity, RepresentationSufficiency } from "../../ir/types";
import type { EvaluationResult, SerializedRuntimeValue } from "../types";
import type { FinancialDependencyManifest } from "../input/types";

// ---------------------------------------------------------------------------
// Nodes and edges
// ---------------------------------------------------------------------------

/**
 * Node kinds are structural, never covenant forms. A node is a thing that BEARS or CONSUMES
 * capacity, or a labelled component of a capacity expression - nothing here names a basket type.
 */
export type CapacityNodeKind =
  | "RULE_CAPACITY"
  | "SHARED_CAPACITY"
  | "LEDGER_USAGE"
  | "BUILDER_COMPONENT"
  | "GROWER_COMPONENT";

/**
 * The role an expression subtree plays inside a capacity. This is descriptive metadata derived from
 * the tree's own SHAPE, never from a metric name or a covenant form: a BUILDER_COMPONENT is an
 * additive operand that needs a runtime fact, a GROWER_COMPONENT is a percentage applied to one.
 */
export type ComponentRole = "BASE_COMPONENT" | "BUILDER_COMPONENT" | "GROWER_COMPONENT" | "OTHER_COMPONENT";

export type CapacityEdgeKind =
  | "DEPENDS_ON"
  | "CONSUMES"
  | "MEMBER_OF_SHARED_CAP"
  | "CONSTRAINED_BY"
  | "BUILT_FROM"
  | "RECLASSIFIABLE_TO";

export interface CapacityEdge {
  from: string;
  to: string;
  kind: CapacityEdgeKind;
  /** The Phase-3 relationship this edge was read from, when it came from one. Never inferred from names. */
  sourceRelationship: string | null;
  description: string | null;
}

/** How confidently the computed capacity may be attached to an entity set - taken from Phase 3, never widened. */
export type EntityScopeApplicability = "SCOPE_CONFIRMED_BY_SOURCE" | "SCOPE_UNSPECIFIED" | "SCOPE_NOT_SAFE_TO_RELY_ON" | "SCOPE_UNAUDITED";

export interface CapacityEntityScope {
  entityScope: EntityClassTag[];
  entityScopeExcluded: EntityClassTag[];
  auditStatus: string | null;
  safeToRely: boolean | null;
  applicability: EntityScopeApplicability;
}

export interface CapacityNode {
  capacityNodeId: string;
  kind: CapacityNodeKind;
  companyId: string;
  instrumentKey: string;
  /** Set on RULE_CAPACITY. */
  ruleId: string | null;
  /** Set on SHARED_CAPACITY. */
  sharedCapacityId: string | null;
  /** The Phase-3 object this node was built from. */
  sourceIdentity: { kind: "RULE" | "SHARED_CAPACITY"; id: string; sourceSectionRef: string | null; sourceCitation: string | null };
  /** The root expression this node evaluates, when it has one. */
  expressionId: string | null;
  /** Descriptive role, present on component nodes only. */
  componentRole: ComponentRole | null;
  entityScope: CapacityEntityScope | null;
  phase3: { sufficiency: RepresentationSufficiency; sufficiencyReasons: string[] } | null;
  dependsOnNodeIds: string[];
}

// ---------------------------------------------------------------------------
// Statuses and amounts
// ---------------------------------------------------------------------------

/**
 * Every distinguishable reason a capacity is not a plain available number stays distinguishable.
 * A missing fact, an unsupported expression, an ambiguous legal state, a legal state that needs
 * review, and a runtime error never collapse into one null.
 */
export type CapacityStatus = "AVAILABLE" | "NEEDS_INPUT" | "UNSUPPORTED" | "AMBIGUOUS" | "REVIEW_REQUIRED" | "ERROR";

export const CAPACITY_STATUS_PRECEDENCE: Record<CapacityStatus, number> = {
  AVAILABLE: 0,
  NEEDS_INPUT: 1,
  AMBIGUOUS: 2,
  REVIEW_REQUIRED: 3,
  UNSUPPORTED: 4,
  ERROR: 5,
};

/**
 * Capacity is never a bare number. Unlimited is its own kind, so it can never be confused with a
 * very large amount, and NOT_DETERMINED is its own kind, so a missing fact never becomes zero.
 */
export type CapacityAmount =
  | { kind: "AMOUNT"; value: SerializedRuntimeValue }
  | { kind: "UNLIMITED"; gate: "NONE" | "SATISFIED" }
  | { kind: "GATE_NOT_SATISFIED" }
  | { kind: "NOT_DETERMINED"; reason: string };

/** A bound is metadata about what is already known; it is never presented as the available capacity. */
export interface CapacityBounds {
  knownLowerBound?: SerializedRuntimeValue;
  knownUpperBound?: SerializedRuntimeValue;
}

export type CapacityLimitationCode =
  | "PHASE3_RULE_NOT_SAFE_TO_RELY_ON"
  | "PHASE3_RULE_AMBIGUOUS"
  | "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON"
  | "ENTITY_SCOPE_UNSPECIFIED"
  | "MISSING_FINANCIAL_INPUT"
  | "UNSUPPORTED_EXPRESSION"
  | "AMBIGUOUS_CONSUMPTION_ALLOCATION"
  | "OVER_CONSUMPTION"
  | "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"
  | "SHARED_CAPACITY_NOT_QUANTIFIED"
  | "SHARED_CAPACITY_CYCLE"
  | "CAPACITY_GRAPH_CYCLE"
  | "LEDGER_SET_UNSAFE"
  | "DUPLICATE_USAGE_ID"
  | "RECLASSIFICATION_NOT_EXECUTABLE"
  | "SNAPSHOT_BINDING_AMBIGUOUS";

export interface CapacityLimitation {
  code: CapacityLimitationCode;
  message: string;
  /** Nodes, usage records or edges the limitation attaches to. */
  refs: string[];
}

// ---------------------------------------------------------------------------
// The consumption ledger (structured truth supplied to Phase 4C, never ingested here)
// ---------------------------------------------------------------------------

/**
 * Which capacity a recorded usage consumed. UNRESOLVED is the honest answer when the historical
 * record does not establish which of several permissions was used: Phase 4C never chooses.
 */
export type CapacityPathRef =
  | { kind: "RULE"; ruleId: string }
  | { kind: "SHARED_CAPACITY"; sharedCapacityId: string }
  | { kind: "UNRESOLVED"; candidateRuleIds: string[]; reason: string };

export type UsageStatus = "RECORDED" | "PENDING" | "REVERSED" | "SUPERSEDED";

export interface LedgerUsageRecord {
  usageId: string;
  companyId: string;
  instrumentKey: string;
  /** ISO date the usage became effective. A usage effective after the evaluation as-of does not participate. */
  effectiveAsOf: string;
  amount: { amount: string; currency: string };
  capacityPath: CapacityPathRef;
  /** The transaction or instrument this usage arose from, for provenance and de-duplication. */
  transactionRef: string | null;
  status: UsageStatus;
  /** Explicit only. A record is superseded because another names it, never because it looks older. */
  supersededByUsageId: string | null;
  provenance: { source: string; sourceVersion: string | null; approvalRef: string | null; approvalState: string | null };
}

/** What the caller is willing to count. The default counts only recorded usage. */
export interface LedgerPolicy {
  acceptableUsageStatuses: UsageStatus[];
}

export const DEFAULT_LEDGER_POLICY: LedgerPolicy = { acceptableUsageStatuses: ["RECORDED"] };

export type LedgerIssueCode =
  | "DUPLICATE_USAGE_ID"
  | "SUPERSEDES_UNKNOWN_USAGE"
  | "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR"
  | "SELF_SUPERSESSION"
  | "SUPERSESSION_CYCLE"
  | "UNRESOLVED_CAPACITY_PATH"
  | "USAGE_WITHOUT_CURRENCY";

export interface LedgerIssue {
  code: LedgerIssueCode;
  message: string;
  usageIds: string[];
}

export type UsageRejectionReason =
  | "COMPANY_MISMATCH"
  | "INSTRUMENT_MISMATCH"
  | "EFFECTIVE_AFTER_AS_OF"
  | "STATUS_NOT_ACCEPTABLE"
  | "SUPERSEDED_BY_ANOTHER_USAGE"
  | "PATH_NOT_THIS_CAPACITY"
  | "PATH_UNRESOLVED"
  | "CURRENCY_MISMATCH";

export interface UsageSelection {
  usageId: string;
  rejectedBecause: UsageRejectionReason | null;
}

// ---------------------------------------------------------------------------
// Shared capacity
// ---------------------------------------------------------------------------

export interface SharedConstraintState {
  sharedCapacityId: string;
  capacityNodeId: string;
  status: CapacityStatus;
  grossCapacity: CapacityAmount;
  usage: CapacityAmount;
  remaining: CapacityAmount;
  memberRuleIds: string[];
  /** Usage counted against the pool, per member, so a shared result traces to member consumption. */
  memberUsage: { ruleId: string; usage: CapacityAmount; usageIds: string[] }[];
  /** Usage recorded directly against the pool rather than a named member. */
  directUsageIds: string[];
  limitations: CapacityLimitation[];
  evaluation: EvaluationResult | null;
}

// ---------------------------------------------------------------------------
// Per-capacity state and the whole state result
// ---------------------------------------------------------------------------

export interface OverConsumption {
  gross: CapacityAmount;
  usage: CapacityAmount;
  deficit: SerializedRuntimeValue;
  usageIds: string[];
}

export interface CapacityStateEntry {
  capacityNodeId: string;
  ruleId: string;
  status: CapacityStatus;
  /** Contractual capacity before any consumption. */
  grossCapacity: CapacityAmount;
  /** Consumption counted against this capacity under the stated as-of and policy. */
  usage: CapacityAmount;
  /** Gross minus usage, computed through the Phase-4A unit algebra. Never clamped. */
  remaining: CapacityAmount;
  /**
   * Remaining after the applicable shared constraints bound it. This is CURRENT state, not an
   * allocation decision: it says what the pool leaves available, not how a transaction should use it.
   */
  effectiveRemaining: CapacityAmount;
  bounds: CapacityBounds | null;
  overConsumption: OverConsumption | null;
  sharedConstraintIds: string[];
  entityScope: CapacityEntityScope | null;
  phase3: { sufficiency: RepresentationSufficiency; sufficiencyReasons: string[] };
  /**
   * The arithmetic the runtime computed even when the legal state is not safe to rely on. Kept
   * separate so a REVIEW_REQUIRED rule can never be read as authoritative headroom.
   */
  provisional: { grossCapacity: CapacityAmount; remaining: CapacityAmount } | null;
  limitations: CapacityLimitation[];
  usageSelection: UsageSelection[];
  appliedUsageIds: string[];
  missingInputKeys: string[];
  evaluation: EvaluationResult | null;
  componentRoles: { capacityNodeId: string; exprId: string | null; role: ComponentRole }[];
}

export interface CapacityGraphCycle {
  nodePath: string[];
  edgePath: { from: string; to: string; kind: CapacityEdgeKind }[];
  provenance: string[];
}

export interface CapacityComplexity {
  nodesVisited: number;
  edgesVisited: number;
  expressionsEvaluated: number;
  ledgerEntriesApplied: number;
  ledgerEntriesConsidered: number;
  sharedConstraintsEvaluated: number;
  maxDepth: number;
  cacheHits: number;
}

export interface SnapshotBinding {
  snapshotIds: string[];
  snapshotVersions: string[];
  snapshotSetHash: string | null;
  inputContractVersion: string | null;
  /** True when two incompatible snapshot states both supplied inputs to this state. */
  ambiguous: boolean;
}

export interface CapacityGraph {
  capacityGraphVersion: string;
  runtimeVersion: string;
  inputContractVersion: string;
  companyId: string;
  instrumentKey: string;
  nodes: CapacityNode[];
  edges: CapacityEdge[];
  cycles: CapacityGraphCycle[];
  /** The union of every Phase-4B manifest the graph needs, known before anything is evaluated. */
  dependencyManifest: FinancialDependencyManifest;
  limitations: CapacityLimitation[];
  graphHash: string;
}

/** Structured, UI-agnostic explanation of one capacity. Data only, never prose generation. */
export interface CapacityExplanation {
  capacityNodeId: string;
  ruleId: string;
  grossCapacity: CapacityAmount;
  lessUsage: CapacityAmount;
  sharedConstraints: { sharedCapacityId: string; remaining: CapacityAmount }[];
  effectiveRemaining: CapacityAmount;
  limitations: CapacityLimitation[];
  inputsUsed: EvaluationResult["provenance"]["inputsUsed"];
  sourceRules: { ruleId: string; sourceSectionRef: string | null; sourceCitation: string | null }[];
  ledgerEntries: LedgerUsageRecord[];
  calculationTrace: EvaluationResult["trace"] | null;
}

export interface CapacityState {
  capacityGraphVersion: string;
  runtimeVersion: string;
  inputContractVersion: string;
  companyId: string;
  instrumentKey: string;
  asOf: string | null;
  graphHash: string;
  /** Independent capacities, each on its own. They are never summed into one total. */
  capacities: CapacityStateEntry[];
  sharedConstraints: SharedConstraintState[];
  explanations: CapacityExplanation[];
  ledgerIssues: LedgerIssue[];
  snapshotBinding: SnapshotBinding;
  limitations: CapacityLimitation[];
  cycles: CapacityGraphCycle[];
  complexity: CapacityComplexity;
  /** Deterministic over the same IR, snapshots, ledger, policy and as-of. */
  stateHash: string;
  /** What this phase deliberately does not do, stated on every result. */
  notComputed: {
    permissionSelection: "NOT_COMPUTED_IN_PHASE_4C";
    maximumTransactionAmount: "NOT_COMPUTED_IN_PHASE_4C";
    allocationAcrossCapacities: "NOT_COMPUTED_IN_PHASE_4C";
    transactionSimulation: "NOT_COMPUTED_IN_PHASE_4C";
    totalCombinedHeadroom: "NOT_COMPUTED_IN_PHASE_4C";
  };
}

// ---------------------------------------------------------------------------
// Reclassification (an explicit election, validated against an explicit Phase-3 edge)
// ---------------------------------------------------------------------------

/**
 * Phase 3 records a reclassification RIGHT as an IRRuleDependency with relationshipType
 * RECLASSIFIABLE_TO, carrying only a target rule id and a description. It carries no amount and no
 * effective date, so a transition can never be derived from the IR alone. Phase 4C therefore
 * executes an election supplied by the caller, and only where the authorizing edge exists.
 */
export interface ReclassificationElection {
  electionId: string;
  sourceRuleId: string;
  destinationRuleId: string;
  amount: { amount: string; currency: string };
  effectiveAsOf: string;
  /** The usage records being moved, when the election names them. */
  movesUsageIds?: string[];
  provenance: { source: string; sourceVersion: string | null; approvalRef: string | null };
}

export type ReclassificationOutcomeState = "EXECUTED" | "RECLASSIFICATION_NOT_EXECUTABLE";

export type ReclassificationBlockCode =
  | "NO_EXPLICIT_RECLASSIFICATION_EDGE"
  | "SOURCE_CAPACITY_NOT_IN_GRAPH"
  | "DESTINATION_CAPACITY_NOT_IN_GRAPH"
  | "CROSS_INSTRUMENT_NOT_REPRESENTED"
  | "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"
  | "EFFECTIVE_AFTER_AS_OF"
  | "SOURCE_USAGE_INSUFFICIENT"
  | "MISSING_SEMANTIC_FIELDS"
  | "RECLASSIFICATION_CYCLE"
  | "CONSERVATION_VIOLATED";

export interface ReclassificationOutcome {
  electionId: string;
  state: ReclassificationOutcomeState;
  blockedBy: { code: ReclassificationBlockCode; message: string; missingSemanticFields: string[] }[];
  authorizingEdge: { from: string; to: string; sourceRelationship: string | null; description: string | null } | null;
  /** The usage rows the transition added, one removing from the source and one adding to the destination. */
  generatedUsage: LedgerUsageRecord[];
  conservation: { sourceDelta: string; destinationDelta: string; net: string; holds: boolean } | null;
}

export interface CapacityStateTransitionResult {
  capacityGraphVersion: string;
  /** The state before, untouched. Applying a transition never mutates its input. */
  before: CapacityState;
  /** A new state computed from the original ledger plus the generated usage. */
  after: CapacityState | null;
  outcomes: ReclassificationOutcome[];
  /** True only when every election executed. */
  allExecuted: boolean;
  transitionHash: string;
}

// ---------------------------------------------------------------------------
// Entry-point arguments
// ---------------------------------------------------------------------------

export interface BuildCapacityGraphArgs {
  rules: readonly IRRule[];
  sharedCapacities?: readonly IRSharedCapacity[];
  definitions?: readonly import("../../ir/types").IRDefinition[];
  companyId: string;
  instrumentKey: string;
  asOf?: string | null;
}
