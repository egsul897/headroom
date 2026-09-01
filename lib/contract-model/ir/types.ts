/**
 * Phase 3A - General Covenant Intermediate Representation V1
 * (docs/HEADROOM-ROADMAP.md §2/§3, docs/HEADROOM-NORTH-STAR.md §6).
 *
 * Central objective: represent unfamiliar covenant drafting WITHOUT a new
 * enum value or a new code path per drafting variation. "Greater of $75m
 * and 12.5% of Consolidated EBITDA" and "greater of $100m and 7.5% of
 * Consolidated Total Assets" are the SAME shape - MAX(MONEY, MULTIPLY(
 * PERCENT, METRIC_REFERENCE)) - differing only in which METRIC_REFERENCE
 * they close over. A metric name change must never require new code
 * (invariant 8, docs/HEADROOM-ARCHITECTURE-INVARIANTS.md).
 *
 * REPRESENTATION FORM - hybrid AST + graph references (task §3), chosen
 * over two rejected alternatives:
 *   - Pure flat per-shape object (today's FormulaType/CalculationRuleKind):
 *     rejected - not compositional, a new metric or a new nesting shape
 *     needs a new kind, exactly the anti-enumeration principle this phase
 *     exists to end.
 *   - Pure graph (every literal/operator its own graph node with edges):
 *     rejected - the arithmetic INSIDE one rule's own capacity expression
 *     is acyclic and single-owner (nothing else ever needs to point INTO
 *     the middle of one basket's own MAX/MULTIPLY nest), so a tree is the
 *     natural, simpler shape there; forcing a graph adds real complexity
 *     (referential node stores, cycle-safety code) for zero real benefit
 *     inside a single expression's scope.
 * The genuine graph need is at the RULE level: shared caps (task §18),
 * builder-basket feeding (task §16), reclassification (task §20), and
 * "this permission requires that ratio test to pass first" (task §22) all
 * involve MULTIPLE rules referencing the SAME resource or each other -
 * exactly what the real, pre-existing ContractRuleRelationshipType enum
 * (prisma/schema.prisma) already models (SHARES_CAPACITY_WITH,
 * BASKET_FEEDING, RECLASSIFIABLE_TO, REDESIGNATES_TO, REQUIRES, LIMITED_BY,
 * PARAMETER_ADJUSTMENT_TRIGGER, ...). This IR REUSES that real enum as its
 * own rule-to-rule edge type rather than inventing a second one - see
 * IRRuleDependency below.
 *
 * REUSE, NOT REINVENTION - task §1's own audit requirement, applied
 * throughout: covenantFamily/ruleType/posture reuse the real Prisma
 * CovenantFamily/ContractRuleType/ContractRulePosture enums exactly as
 * Phase B's own ContractRule row does; action reuses the real, already-
 * extensible ContractAction union (lib/contract-model/types.ts);
 * entityScope reuses the real EntityClassTag enum; condition "type" reuses
 * the real ContractConditionType enum. None of these are duplicated here.
 * What this module adds is the thing that did NOT exist before Phase 3A:
 * a compositional EXPRESSION language an amount/ratio/boolean can be built
 * from, so a rule's economics are represented in structure, not prose.
 *
 * PERSISTENCE (task §41) - none in V1, by design. This module is a pure,
 * in-memory TypeScript library, matching the exact convention every other
 * Phase 2 compiler module already established (discovery/, package-graph/,
 * context-retrieval/, coverage-audit/, amendment/ are all pure in-memory
 * libraries with deterministic content-hash identity, none directly
 * persisted). ContractRule.formulaRef/conditions/exceptions are already
 * schema-agnostic Json-capable slots that a future Phase 3B could persist
 * a serialized IR rule into with ZERO Prisma migration - see
 * docs/HEADROOM-ROADMAP.md §3's own migration table. This phase does not
 * wire that persistence up (task §54 - "do not wire it into production
 * calculations yet"), so no migration is needed or included.
 *
 * SEMANTIC UNDERSTANDING != EXECUTABILITY (task §2F, invariant 14) - an
 * IRRule/IRExpression is fully valid and useful with NO evaluator behind
 * any of its operators. `sufficiency` (task §25) is this IR's own
 * representation-completeness axis; a future Phase 4 evaluator registry
 * (modeled on the existing lib/contract-model/compiler/evaluator-registry.ts
 * predicate-based pattern) is a SEPARATE, later question this module makes
 * no claim about.
 */
import type { CovenantFamily, ContractRuleType, ContractRulePosture, ContractRuleRelationshipType, EntityClassTag } from "@prisma/client";
import type { ContractAction, ContractConditionType } from "../types";
import type { OperativeStateStatus } from "../compiler/amendment/types";

export const IR_SCHEMA_VERSION = "headroom-covenant-ir.v1";

// ---------------------------------------------------------------------------
// Dimensional / type model (task §31/§32). Deliberately small - enough to
// reject mathematically nonsensical combinations (ADD(MONEY, BOOLEAN)),
// not a full unit-algebra system. CAPACITY is distinct from MONEY: the
// top-level result of a permission/basket amount expression, because it
// may be UNLIMITED (task §7's own real ground-truth cases -
// lsb-6.01-general-ratio-gated, lsb-6.11's Payment-Conditions clause -
// have no dollar ceiling at all, only a ratio/liquidity gate) rather than
// a plain money value.
// ---------------------------------------------------------------------------

export type IRValueType = "MONEY" | "NUMBER" | "PERCENT" | "RATIO" | "BOOLEAN" | "DATE" | "DURATION" | "PERIOD" | "ENTITY_SET" | "CAPACITY";

/** Returned by type inference when a subtree contains an UnsupportedExpression - propagates upward so a caller never mistakes "could not type-check" for a real type. */
export const UNSUPPORTED_TYPE = "UNSUPPORTED" as const;
export type InferredType = IRValueType | typeof UNSUPPORTED_TYPE;

// ---------------------------------------------------------------------------
// Provenance (task §23) - every materially meaningful IR element CAN carry
// this; nothing here makes it mandatory on a purely-derived node (e.g. the
// ADD wrapping two already-provenanced literals), matching task §23's own
// "do not require one citation for the entire rule if components come
// from different source spans."
// ---------------------------------------------------------------------------

export interface SourceProvenance {
  documentId: string;
  /** Phase 2A structural-index node key, when the citation is a real structural node - null for a citation that is a definition/proviso span without its own StructuralNode. */
  sourceNodeKey: string | null;
  sourceCitation: string;
  /** Bounded excerpt of the actual source text this element was derived from - never a synthesized paraphrase (mirrors context-retrieval's own ContextItem.excerptText discipline). */
  excerpt: string | null;
}

// ---------------------------------------------------------------------------
// Operative-contract-state lineage (task §24) - the IR consumes Phase 2G's
// OperativeContractState, never reaches around it. Reuses the real
// OperativeStateStatus type directly (never a parallel one) so a
// REVIEW_REQUIRED/CONFLICTED operative state is mechanically impossible to
// silently drop when a rule is compiled from it.
// ---------------------------------------------------------------------------

export interface OperativeLineageRef {
  instrumentKey: string;
  provisionKey: string;
  asOfDate: string;
  operativeStatus: OperativeStateStatus;
  currentSourceDocumentId: string;
}

// ---------------------------------------------------------------------------
// Representation sufficiency (task §25/§26) - a rule's own honesty signal,
// independent of (and computed before) any future execution-capability
// question. UNSUPPORTED components are preserved via IRUnsupportedExpression
// (below) rather than dropped - a rule can be COMPLETE, PARTIAL (some real
// subexpression is an UnsupportedExpression node), AMBIGUOUS, UNSUPPORTED
// (the whole rule), MISSING_CONTEXT (a real dependency could not be
// resolved), or CONFLICTED (its own OperativeLineageRef status is
// OPERATIVE_STATE_CONFLICTED - task §24's "the semantic system must not
// reach around Phase 2G and treat superseded base text as authoritative").
// ---------------------------------------------------------------------------

export type RepresentationSufficiency = "COMPLETE" | "PARTIAL" | "AMBIGUOUS" | "UNSUPPORTED" | "MISSING_CONTEXT" | "CONFLICTED";

// ---------------------------------------------------------------------------
// Entity / transaction scope (task §12/§13) - entityScope reuses the real
// EntityClassTag enum (already shared by the solver-native Permission model
// and Phase B's ContractRule); transactionScope reuses the real,
// already-extensible ContractAction union (lib/contract-model/types.ts) -
// no new taxonomy for either.
// ---------------------------------------------------------------------------

export type IREntityScope = { include: EntityClassTag[]; exclude: EntityClassTag[] };

// ---------------------------------------------------------------------------
// Expression primitives (task §6). Every node carries a stable exprId
// (identity.ts derives it deterministically from content + provenance
// anchor - never array position or a fresh random id, task §27) and an
// IRValueType so type-check.ts can validate composition.
// ---------------------------------------------------------------------------

interface IRExprBase {
  exprId: string;
  provenance?: SourceProvenance;
  /**
   * SEMANTIC ACCOUNTABILITY lineage (additive, optional): the Pass A
   * inventoryItemIds this node consumes (docs/semantic-accountability/
   * 04-composition-lineage-design.json). Metadata about accountability, not
   * computational content - identity.ts excludes it from exprId exactly as
   * it excludes provenance. Absent on nodes produced before this layer
   * existed or by hand-authored fixtures.
   */
  inventoryItemIds?: string[];
}

// --- literals ---------------------------------------------------------------

/** Currency preserved, never assumed USD (task §33) - full FX conversion is explicitly out of scope for this phase; the field exists so a non-USD agreement is not silently mis-typed as USD later. */
export interface IRMoneyLiteral extends IRExprBase {
  kind: "MONEY";
  type: "MONEY";
  amount: number;
  currency: string;
}
export interface IRNumberLiteral extends IRExprBase {
  kind: "NUMBER";
  type: "NUMBER";
  value: number;
}
/** Stored as a fraction (0.125 for 12.5%), never as a bare "12.5" that could be misread as 1250%. */
export interface IRPercentLiteral extends IRExprBase {
  kind: "PERCENT";
  type: "PERCENT";
  value: number;
}
/** A leverage/coverage-style ratio literal, e.g. 4.50 for "4.50x" - kept distinct from a plain NUMBER or PERCENT so COMPARE(METRIC, LTE, RATIO(4.50)) type-checks meaningfully and a ratio can never silently be added to a dollar amount (task §31's own COMPARE(RATIO, LTE, RATIO) example). */
export interface IRRatioLiteral extends IRExprBase {
  kind: "RATIO";
  type: "RATIO";
  value: number;
}
export interface IRBooleanLiteral extends IRExprBase {
  kind: "BOOLEAN_LITERAL";
  type: "BOOLEAN";
  value: boolean;
}
/** ISO 8601 date string, or an AS_OF/period-relative expression elsewhere in the tree - this node is only the concrete-date-known case. */
export interface IRDateLiteral extends IRExprBase {
  kind: "DATE_LITERAL";
  type: "DATE";
  isoDate: string;
}

// --- references (task §15/§16/§17/§19/§20 - stable identity, never a raw string alone) ---

/**
 * A reference to an arbitrary contractual metric BY NAME (task §15) - the
 * anti-enumeration mechanism made concrete. Whether the metric is
 * "Consolidated EBITDA," "Consolidated Total Assets," or a metric no one
 * has seen yet, this is the SAME node kind; only metricName changes, never
 * application code. `resolvedDefinitionId` links to an IRDefinition
 * (below) once one exists for this term in this instrument - null is a
 * legitimate, honest "not yet resolved" state, not an error.
 * instrumentKey/companyId scope the reference so a same-named metric in a
 * different instrument can never be silently matched (task §49 - cross-
 * instrument isolation).
 */
export interface IRMetricReference extends IRExprBase {
  kind: "METRIC_REFERENCE";
  /** The metric's own natural type - most contractual metrics are MONEY (EBITDA, Total Assets); a small number are already RATIO (e.g. a metric that IS itself a leverage ratio). Declared explicitly, never inferred from the metric name string. */
  type: "MONEY" | "RATIO" | "NUMBER";
  metricName: string;
  companyId: string;
  instrumentKey: string;
  resolvedDefinitionId: string | null;
}

export interface IRDefinedTermReference extends IRExprBase {
  kind: "DEFINED_TERM_REFERENCE";
  type: IRValueType;
  termName: string;
  companyId: string;
  instrumentKey: string;
  resolvedDefinitionId: string | null;
}

/** Points at another rule's OWN capacity/amount as an operand (e.g. "capacity remaining under Rule X") - distinct from the rule-to-rule dependency graph (IRRuleDependency), which records the RELATIONSHIP; this records USING that other rule's VALUE inside an expression. */
export interface IRRuleReference extends IRExprBase {
  kind: "RULE_REFERENCE";
  type: "CAPACITY";
  ruleId: string;
  companyId: string;
  instrumentKey: string;
}

/**
 * Historical/shared-cap usage (task §19) - deliberately NOT coupled to the
 * existing LedgerEntry Prisma model (task's own explicit instruction: "do
 * not tightly couple IR nodes to the existing LedgerEntry schema if that
 * schema is transitional" - and docs/HEADROOM-ROADMAP.md §5 confirms
 * LedgerEntry/DebtEvent are exactly that, an unreconciled fork). Resolves
 * later, at Phase 6, against whatever the unified transaction/capacity-
 * truth ledger becomes - this reference only needs a stable
 * sharedCapId/ruleId to point at.
 */
export interface IRLedgerUsageReference extends IRExprBase {
  kind: "LEDGER_USAGE_REFERENCE";
  type: "MONEY";
  /** Exactly one of sharedCapId/ruleId is set - usage against a shared pool, or usage under one specific rule's own basket. */
  sharedCapId: string | null;
  ruleId: string | null;
}

/** A hypothetical/proposed transaction's own attribute (e.g. "the amount of the proposed investment") - the bridge point a future Simulation feature (North Star §18's own "Ask Headroom"/simulation architecture) will bind to; not implemented here. */
export interface IRTransactionInputReference extends IRExprBase {
  kind: "TRANSACTION_INPUT_REFERENCE";
  type: IRValueType;
  inputName: string;
}

export interface IREntityScopeReference extends IRExprBase {
  kind: "ENTITY_SCOPE_REFERENCE";
  type: "ENTITY_SET";
  scope: IREntityScope;
}

// --- arithmetic / aggregation / comparison / boolean (task §6) --------------

export interface IRAdd extends IRExprBase {
  kind: "ADD";
  // RATIO included alongside MONEY/NUMBER (matching MAX/MIN below) so a
  // stepped ratio threshold plus a ratio step-up offset (e.g. 5.00x +
  // 0.50x acquisition step-up, task §9) is a well-typed ADD rather than
  // forcing a special-cased ratio-addition node.
  type: "MONEY" | "NUMBER" | "RATIO";
  operands: IRExpression[];
}
export interface IRSubtract extends IRExprBase {
  kind: "SUBTRACT";
  type: "MONEY" | "NUMBER";
  left: IRExpression;
  right: IRExpression;
}
export interface IRMultiply extends IRExprBase {
  kind: "MULTIPLY";
  type: "MONEY" | "NUMBER" | "RATIO";
  operands: IRExpression[];
}
export interface IRDivide extends IRExprBase {
  kind: "DIVIDE";
  type: "NUMBER" | "RATIO";
  numerator: IRExpression;
  denominator: IRExpression;
}
export interface IRMax extends IRExprBase {
  kind: "MAX";
  type: "MONEY" | "NUMBER" | "RATIO";
  operands: IRExpression[];
}
export interface IRMin extends IRExprBase {
  kind: "MIN";
  type: "MONEY" | "NUMBER" | "RATIO";
  operands: IRExpression[];
}
export interface IRSum extends IRExprBase {
  kind: "SUM";
  type: "MONEY" | "NUMBER" | "RATIO";
  operands: IRExpression[];
}
export type CompareOperator = "GT" | "GTE" | "LT" | "LTE" | "EQ";
export interface IRCompare extends IRExprBase {
  kind: "COMPARE";
  type: "BOOLEAN";
  left: IRExpression;
  operator: CompareOperator;
  right: IRExpression;
}
export interface IRAnd extends IRExprBase {
  kind: "AND";
  type: "BOOLEAN";
  operands: IRExpression[];
}
export interface IROr extends IRExprBase {
  kind: "OR";
  type: "BOOLEAN";
  operands: IRExpression[];
}
export interface IRNot extends IRExprBase {
  kind: "NOT";
  type: "BOOLEAN";
  operand: IRExpression;
}
export interface IRIf extends IRExprBase {
  kind: "IF";
  type: IRValueType;
  condition: IRExpression;
  then: IRExpression;
  else: IRExpression | null;
}

// --- time (task §9/§34) ------------------------------------------------------

export interface IRAsOf extends IRExprBase {
  kind: "AS_OF";
  type: IRValueType;
  value: IRExpression;
  asOfDate: IRExpression | string;
}
export interface IRDuringPeriod extends IRExprBase {
  kind: "DURING_PERIOD";
  type: IRValueType;
  value: IRExpression;
  /** "TTM" | "TRAILING_4_QUARTERS" | "FISCAL_QUARTER" | "FISCAL_YEAR" | a named Test Period defined term - free text scoped by a real testing-period defined-term reference where possible, never a hardcoded closed enum of period shapes (anti-enumeration principle applies to time semantics too). */
  periodDescription: string;
}
/** A stepped/scheduled threshold (task §9) - an ordered list of date-range cases with a fallback, generalized enough to cover any calendar-driven threshold change without a STEPPED_LEVERAGE_WITH_ACQUISITION_STEPUP-shaped special type. */
export interface IRScheduleCase {
  /** ISO date (inclusive) or null for "from the beginning." */
  from: string | null;
  /** ISO date (exclusive) or null for "through the end / no stated expiry." */
  to: string | null;
  value: IRExpression;
  description: string;
}
export interface IRSchedule extends IRExprBase {
  kind: "SCHEDULE";
  type: IRValueType;
  cases: IRScheduleCase[];
  /** Value when no case's date range matches - the pre-effectiveness or post-expiry fallback, when the source states one. */
  defaultValue: IRExpression | null;
}
/** An event-triggered temporary adjustment (task §9's own acquisition step-up example) - conceptually a conditional override of a base value for a bounded duration once an event condition is satisfied, generalized past "acquisition" specifically. */
export interface IREventActive extends IRExprBase {
  kind: "EVENT_ACTIVE";
  type: "BOOLEAN";
  /** Free-text event name/description backed by provenance - not a closed enum of event types (a new event shape is a new instance of this same node, never new code). */
  eventDescription: string;
  triggerCondition: IRExpression | null;
  /** How long the event stays "active" once triggered, when the source states a bounded duration (e.g. "for four consecutive fiscal quarters"). */
  activeDuration: string | null;
}

// --- the escape hatch (task §26) ---------------------------------------------

/**
 * The controlled escape hatch task §26 requires: preferable to
 * formulaRef: OTHER with no faithful structured meaning. Can appear
 * ANYWHERE an IRExpression is expected, including nested inside an
 * otherwise-represented tree (task §25's "preserve represented
 * components... do not discard the whole rule if partial representation
 * remains useful"). Mechanically NEVER executable (type-check.ts treats
 * its type as UNSUPPORTED, which cannot satisfy any operator's real
 * operand-type requirement) - see validate.ts's own dedicated test.
 */
export interface IRUnsupportedExpression extends IRExprBase {
  kind: "UNSUPPORTED";
  type: null;
  sourceEvidence: string;
  semanticDescription: string;
  reason: string;
  requiredReview: true;
  /**
   * Diagnostic-only sidecar: when this node exists because a COMPOSITE
   * expression's own top-level type could not be inferred (e.g. one of
   * several ADD operands was itself unsupported), this carries the fully
   * assembled composite exactly as it would have been emitted had it
   * type-checked - preserving every sibling operand that DID successfully
   * normalize/type-check, rather than discarding the whole attempted
   * structure. Never read by type-check.ts or by any executability path
   * (this node's own `type` stays `null` regardless of what this field
   * holds, so nothing can mistake a partially-typed attempt for a real
   * value) - it exists purely so completeness-checking/verification/human
   * review can see WHICH parts of a dense definition were actually
   * captured instead of one opaque "UNSUPPORTED" blob. Absent when this
   * node was never a discarded composite (e.g. a genuinely atomic
   * UNSUPPORTED leaf, or the model itself emitted kind="UNSUPPORTED").
   */
  attemptedStructure?: IRExpression;
}

export type IRExpression =
  | IRMoneyLiteral
  | IRNumberLiteral
  | IRPercentLiteral
  | IRRatioLiteral
  | IRBooleanLiteral
  | IRDateLiteral
  | IRMetricReference
  | IRDefinedTermReference
  | IRRuleReference
  | IRLedgerUsageReference
  | IRTransactionInputReference
  | IREntityScopeReference
  | IRAdd
  | IRSubtract
  | IRMultiply
  | IRDivide
  | IRMax
  | IRMin
  | IRSum
  | IRCompare
  | IRAnd
  | IROr
  | IRNot
  | IRIf
  | IRAsOf
  | IRDuringPeriod
  | IRSchedule
  | IREventActive
  | IRUnsupportedExpression;

/** An uncapped/unlimited capacity (task §7's real ground-truth cases - lsb-6.01/lsb-6.11's Payment-Conditions clauses) - a legitimate capacityExpression alternative to a MONEY-typed tree, never represented as "MONEY(Infinity)" or a missing/null threshold that could be confused with "not yet determined." */
export interface UnlimitedCapacity {
  kind: "UNLIMITED_CAPACITY";
  type: "CAPACITY";
  /** The condition(s) that gate this unlimited capacity, if any (e.g. a ratio test) - most real unlimited baskets are still conditional, never a bare "no limit at all." */
  gatedBy: IRExpression | null;
  provenance?: SourceProvenance;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional) - see IRExprBase.inventoryItemIds. */
  inventoryItemIds?: string[];
}

export type IRCapacityExpression = IRExpression | UnlimitedCapacity;

// ---------------------------------------------------------------------------
// Conditions and exceptions (task §10/§11) - first-class, never folded
// into unstructured notes. conditionType reuses the real
// ContractConditionType enum exactly as CandidateContractRule already does.
// ---------------------------------------------------------------------------

export interface IRCondition {
  conditionId: string;
  conditionType: ContractConditionType;
  /** Formalized boolean expression where the condition can be (e.g. RATIO_SATISFIED -> COMPARE(...)); null for a condition that is real and material but not yet reducible to a boolean expression (e.g. a compound named condition like "Payment Conditions" whose own sub-conditions are represented on ITS OWN rule/definition rather than restated here - task §10's real "reused named condition" lesson from lsb-def-payment-conditions). */
  expression: IRExpression | null;
  /** Set when this condition is itself a reference to a separately-modeled reused named condition (an IRDefinition or another IRRule) rather than an inline expression - the mechanism that prevents restating "Payment Conditions" four times across four citing rules. */
  referencesDefinitionId: string | null;
  description: string;
  provenance: SourceProvenance | null;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional) - see IRExprBase.inventoryItemIds. */
  inventoryItemIds?: string[];
}

export interface IRException {
  exceptionId: string;
  /** The prohibition/restriction rule this exception carves out from. */
  appliesToRuleId: string;
  description: string;
  /** The permission rule representing what IS allowed under this exception, when it is itself a full quantitative/conditional permission worth modeling as its own IRRule (task §11 - "avoid flattening the exception into the prohibition in a way that loses provenance or independent capacity mechanics"). Null when the exception is a bare qualitative carve-out with no separate capacity mechanics of its own. */
  permissionRuleId: string | null;
  conditions: IRCondition[];
  provenance: SourceProvenance | null;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional) - see IRExprBase.inventoryItemIds. */
  inventoryItemIds?: string[];
}

// ---------------------------------------------------------------------------
// Rule-to-rule / rule-to-definition dependency (task §22) - REUSES the
// real, pre-existing ContractRuleRelationshipType enum (SHARES_CAPACITY_WITH,
// BASKET_FEEDING, RECLASSIFIABLE_TO, REDESIGNATES_TO, REQUIRES, LIMITED_BY,
// PARAMETER_ADJUSTMENT_TRIGGER, ...) rather than inventing a parallel edge
// vocabulary - this IS the graph layer task §3 asks for, and it already
// existed in the schema before this phase; Phase 3A's own job is only to
// make sure IRRule actually carries these edges.
// ---------------------------------------------------------------------------

export interface IRRuleDependency {
  relationshipType: ContractRuleRelationshipType;
  targetRuleId: string;
  description: string;
}

/**
 * SEMANTIC ACCOUNTABILITY (additive; docs/semantic-accountability/06-shared-
 * cap-root-cause.json R-4): a dependency the source text REALLY states but
 * whose target lives outside this compilation unit (another section compiled
 * separately, or a reference that could not be resolved to a unique node).
 * Before this field existed, normalize.ts silently DROPPED such edges
 * ("dependency dropped rather than left dangling"), which is how the real
 * §6.04(b) -> §6.01(b)(iii)/(c)(iii) shared-cap linkage vanished. Kept here
 * as an explicit, never-resolved edge: it satisfies validate.ts's dangling-
 * reference rule (no fake targetRuleId), feeds Pass C as an AMBIGUOUS
 * (review) disposition, never a REPRESENTED one, and is never "guessed"
 * into a real IRRuleDependency (mission §15).
 */
export interface IRUnresolvedDependency {
  relationshipType: ContractRuleRelationshipType;
  /** The exact reference text the composition emitted ("Section 6.01(b)(iii)", "clause (x) of this Section"). */
  targetRef: string;
  description: string;
  /** Why it could not be resolved within this unit. */
  reason: string;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional). */
  inventoryItemIds?: string[];
}

// ---------------------------------------------------------------------------
// Shared capacity resource (task §18) - a SEPARATE resource object, never
// duplicated into each member rule's own capacityExpression (which would
// allow double counting). Each member rule instead includes an
// IRLedgerUsageReference(sharedCapId) inside its own capacityExpression
// where the source text ties its own basket to the shared pool.
// ---------------------------------------------------------------------------

export interface IRSharedCapacity {
  sharedCapId: string;
  companyId: string;
  instrumentKey: string;
  description: string;
  capExpression: IRCapacityExpression;
  memberRuleIds: string[];
  provenance: SourceProvenance | null;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional) - the SHARED_CAP inventory item(s) this resource represents. */
  inventoryItemIds?: string[];
}

// ---------------------------------------------------------------------------
// The rule itself (task §4). High-level semantic category is NOT a new
// 8-value enum invented for this phase - it is the real, existing
// ContractRulePosture (PERMISSION | PROHIBITION | OBLIGATION | N_A) plus
// the real, existing, already-fine-grained ContractRuleType (17 values,
// including DEFINITION and CALCULATION_RULE for the two non-posture-bearing
// shapes task §4 calls out) - both reused directly from Phase B's own
// schema rather than duplicated (task §1's "do not create a parallel
// abstraction without understanding existing ones").
// ---------------------------------------------------------------------------

export interface IRRule {
  /** Stable, deterministic (identity.ts) - derived from companyId+instrumentKey+sourceSectionRef+a discriminator, never array position or a fresh random id (task §27). */
  ruleId: string;
  irSchemaVersion: string;
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  sourceSectionRef: string | null;

  covenantFamily: CovenantFamily;
  ruleType: ContractRuleType;
  posture: ContractRulePosture;
  /** The specific activity this rule governs (task §5) - independent of formula shape (task §4's own "a lien basket and an investment basket may share the same amount-expression primitives while differing in action/scope"). Null for DEFINITION/CALCULATION_RULE rows, which govern no action directly. */
  action: ContractAction | null;

  entityScope: EntityClassTag[];
  entityScopeExcluded: EntityClassTag[];
  /** Narrower than `action` when the source specifically scopes to a sub-activity `action` alone doesn't capture (task §13) - most rules leave this null and rely on `action` alone. */
  transactionScope: ContractAction[] | null;

  /** Null for a rule type that carries no amount/ratio mechanics at all (a bare qualitative PROHIBITION, an ENTITY_SCOPE_RULE, ...). */
  capacityExpression: IRCapacityExpression | null;

  conditions: IRCondition[];
  exceptions: IRException[];
  dependsOn: IRRuleDependency[];
  /** SEMANTIC ACCOUNTABILITY (additive, optional) - see IRUnresolvedDependency. Absent (not empty) on rules produced before this layer existed. */
  unresolvedDependencies?: IRUnresolvedDependency[];

  operativeLineage: OperativeLineageRef | null;

  sufficiency: RepresentationSufficiency;
  sufficiencyReasons: string[];

  provenance: SourceProvenance | null;

  /** Set once a real Phase 3B compiler run produces this rule - null for a hand-authored V1 fixture or an adapter-produced rule (task §57's own "the adapter should not be authoritative"). */
  compilerVersion: string | null;
  /** Content-hash of the source text/operative state this rule was derived from - the invalidation identity a future incremental-recompilation pass would key on (North Star §3), never wired up this phase. */
  sourceContentVersion: string | null;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional) - the inventory items this rule as a whole consumes (its posture/action/scope proposition); expression-level lineage lives on the nodes themselves. */
  inventoryItemIds?: string[];
}

// ---------------------------------------------------------------------------
// Definitions / contractual metrics (task §14/§15/§20) - a defined term or
// contractual metric is its own semantic unit, referenced by stable id from
// IRMetricReference/IRDefinedTermReference, never inlined as duplicated
// text into every citing rule.
// ---------------------------------------------------------------------------

export interface IRDefinition {
  definitionId: string;
  irSchemaVersion: string;
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  termName: string;
  /** Almost always DEFINITIONS_CALCULATION_RULES; kept as a real field (not hardcoded) since a defined term can occasionally be classified under a more specific family by the source itself. */
  covenantFamily: CovenantFamily;
  /** Formalized where the definition's own mechanics can be expressed compositionally (a builder-basket SUM/MAX tree - task §16); null + sufficiency UNSUPPORTED/PARTIAL for an itemized-addback-stack prose definition (real ground-truth example: Consolidated Adjusted EBITDA) that this V1 does not attempt to fully formalize line-by-line. */
  calculationExpression: IRExpression | null;
  /** Other defined term names this one depends on - kept as plain names for now (task §14 - "Phase 3A only needs the representation architecture," a full dependency-edge graph for definitions already exists at the Phase 2A/Phase B DefinedTermDependencyEdge layer and this field is meant to line up with it, not replace it). */
  dependsOnTerms: string[];
  sufficiency: RepresentationSufficiency;
  sufficiencyReasons: string[];
  provenance: SourceProvenance | null;
  compilerVersion: string | null;
  sourceContentVersion: string | null;
  /** SEMANTIC ACCOUNTABILITY lineage (additive, optional) - see IRRule.inventoryItemIds. */
  inventoryItemIds?: string[];
}

// ---------------------------------------------------------------------------
// One compiled unit - everything Phase 3A produces for one instrument at
// one point in time. Not persisted (see module header); this is the
// in-memory output contract a future Phase 3B compiler run would produce
// and a future Phase 3C verifier would consume.
// ---------------------------------------------------------------------------

export interface IRCompilationUnit {
  irSchemaVersion: string;
  companyId: string;
  instrumentKey: string;
  rules: IRRule[];
  definitions: IRDefinition[];
  sharedCapacities: IRSharedCapacity[];
}
