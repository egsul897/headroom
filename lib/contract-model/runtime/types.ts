/**
 * PHASE 4A - runtime type model: values, result states, traces, inputs.
 *
 * Boundary (mission §1): the runtime consumes the trusted Phase-3 IR and
 * evaluates it deterministically. It never reinterprets source text, never
 * calls a model, never repairs semantics, never turns UNSUPPORTED or a missing
 * input into zero, never resolves AMBIGUOUS by assumption, never widens
 * entity scope.
 *
 * Numbers: every numeric payload is an exact Rational (decimal.ts) internally
 * and a canonical decimal/fraction STRING in the serialized public value, so
 * no naked JS number crosses the public boundary without type metadata.
 */
import type { EntityClassTag } from "@prisma/client";
import type { IRDefinition, IRRule, IRValueType, SourceProvenance } from "../ir/types";
import type { Rational } from "./decimal";
import type { ResolutionResult, TermResolutionOutcome } from "./input/types";
import type { RuntimeVerificationEnvelope, RuntimeVerificationIdentity, VerificationBlock, VerificationGatePolicy } from "./verification-envelope";

// ---------------------------------------------------------------------------
// Runtime values
// ---------------------------------------------------------------------------

export type RuntimeValueType = "MONEY" | "NUMBER" | "PERCENT" | "RATIO" | "BOOLEAN" | "DATE" | "ENTITY_SET" | "CAPACITY";

/** Where a value came from: the IR node that produced it and every runtime input it depends on. */
export interface ValueLineage {
  exprId: string | null;
  /** Keys of the runtime inputs (metrics, terms, transaction inputs, ...) this value depends on, in first-use order. */
  inputKeys: string[];
  /** Original literal as written in the IR (number/string), when the value is a literal. */
  rawSource?: number | string | boolean | null;
}

export interface MoneyValue { type: "MONEY"; amount: Rational; currency: string; lineage: ValueLineage }
export interface NumberValue { type: "NUMBER"; value: Rational; lineage: ValueLineage }
/** Normalized fraction: 0.125 means 12.5%. */
export interface PercentValue { type: "PERCENT"; fraction: Rational; lineage: ValueLineage }
/** Dimensionless numeric ratio kept distinct from NUMBER (a 2.50x leverage ratio is never added to a dollar amount). */
export interface RatioValue { type: "RATIO"; value: Rational; lineage: ValueLineage }
export interface BooleanValue { type: "BOOLEAN"; value: boolean; lineage: ValueLineage }
/** Calendar date as an ISO-8601 YYYY-MM-DD string; comparisons are lexicographic on the normalized form. */
export interface DateValue { type: "DATE"; isoDate: string; lineage: ValueLineage }
/** Symbolic value of an ENTITY_SCOPE_REFERENCE node - carried, never resolved to concrete entities here. */
export interface EntitySetValue { type: "ENTITY_SET"; include: EntityClassTag[]; exclude: EntityClassTag[]; lineage: ValueLineage }
/**
 * A rule's capacity as an operand (RULE_REFERENCE / UNLIMITED_CAPACITY): either a MONEY amount, an unlimited
 * capacity whose gate is satisfied or absent, or a gated unlimited capacity whose gate evaluated false (the basket
 * yields nothing under it - this is what the IR states, not a legal conclusion added by the runtime).
 */
export interface CapacityValue { type: "CAPACITY"; capacity: { kind: "AMOUNT"; amount: Rational; currency: string } | { kind: "UNLIMITED"; gate: "NONE" | "SATISFIED" } | { kind: "GATE_NOT_SATISFIED" }; lineage: ValueLineage }

export type RuntimeValue = MoneyValue | NumberValue | PercentValue | RatioValue | BooleanValue | DateValue | EntitySetValue | CapacityValue;

/** Serialized public form of a value - exact strings, no BigInt, no float. */
export type SerializedRuntimeValue =
  | { type: "MONEY"; amount: string; currency: string; lineage: ValueLineage }
  | { type: "NUMBER"; value: string; lineage: ValueLineage }
  | { type: "PERCENT"; fraction: string; lineage: ValueLineage }
  | { type: "RATIO"; value: string; lineage: ValueLineage }
  | { type: "BOOLEAN"; value: boolean; lineage: ValueLineage }
  | { type: "DATE"; isoDate: string; lineage: ValueLineage }
  | { type: "ENTITY_SET"; include: EntityClassTag[]; exclude: EntityClassTag[]; lineage: ValueLineage }
  | { type: "CAPACITY"; capacity: { kind: "AMOUNT"; amount: string; currency: string } | { kind: "UNLIMITED"; gate: "NONE" | "SATISFIED" } | { kind: "GATE_NOT_SATISFIED" }; lineage: ValueLineage };

// ---------------------------------------------------------------------------
// Result states (mission §5). Precedence when operands disagree:
// ERROR > UNSUPPORTED > AMBIGUOUS > NEEDS_INPUT > EXECUTABLE, except where a
// documented safe partial rule applies (AND/OR short-circuit over NEEDS_INPUT
// only; MAX/MIN known bounds as metadata).
// ---------------------------------------------------------------------------

export type RuntimeStatus = "EXECUTABLE" | "NEEDS_INPUT" | "UNSUPPORTED" | "AMBIGUOUS" | "ERROR";

export const STATUS_PRECEDENCE: Record<RuntimeStatus, number> = { EXECUTABLE: 0, NEEDS_INPUT: 1, AMBIGUOUS: 2, UNSUPPORTED: 3, ERROR: 4 };

export type RuntimeDiagnosticCode =
  | "MISSING_INPUT"
  | "UNSUPPORTED_NODE"
  | "AMBIGUOUS_SEMANTICS"
  | "UNIT_MISMATCH"
  | "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"
  | "TYPE_CONTRACT_VIOLATION"
  | "DIVISION_BY_ZERO"
  | "CYCLE"
  | "MALFORMED_NODE"
  | "TEMPORAL_SEMANTICS_NOT_MODELED"
  | "SCHEDULE_NO_MATCHING_CASE"
  | "SCHEDULE_OVERLAPPING_CASES"
  | "IF_WITHOUT_ELSE_NOT_TAKEN"
  | "INPUT_TYPE_MISMATCH"
  | "REFERENCE_UNRESOLVED"
  // ---- PHASE 4B ----
  /** More than one supplied fact matches the requested identity exactly and nothing distinguishes them. */
  | "AMBIGUOUS_INPUT"
  /** The fact exists but only in a snapshot whose review status this evaluation does not accept. */
  | "INPUT_NOT_APPROVED"
  /** Candidates sharing one identity disagree on value type, or the only candidates have the wrong type. */
  | "INPUT_TYPE_CONFLICT"
  /** A supplied term value competes with an evaluable Phase-3 definition without declaring itself an override. */
  | "TERM_RESOLUTION_CONFLICT"
  /** The snapshot set itself is not safe to resolve against (duplicate ids, supersession cycle, competing successors). */
  | "SNAPSHOT_SET_UNSAFE"
  // ---- PHASE-4 VERIFICATION GATE (migration step 3) ----
  /** The verification gate refused this node: a MATERIAL finding names it, or its whole unit is blocked. The diagnostic's `verification` says which. */
  | "MATERIAL_VERIFICATION_FINDING"
  /** Informational (status EXECUTABLE): the unit entered was verified incompletely. Not a defect claim; kept distinct from MATERIAL_VERIFICATION_FINDING on purpose. */
  | "VERIFICATION_INCOMPLETE";

export interface RuntimeDiagnostic {
  code: RuntimeDiagnosticCode;
  status: RuntimeStatus;
  message: string;
  exprId: string | null;
  /** Phase-3 legal provenance of the node the diagnostic is about, when the IR carries it. */
  provenance: SourceProvenance | null;
  /** Reason text carried from Phase 3 (UNSUPPORTED reason, sufficiency reasons, ...). */
  phase3Reason?: string;
  /** Present on MATERIAL_VERIFICATION_FINDING only: the structured refusal from the verification gate. */
  verification?: VerificationBlock;
}

export type MissingInputKind = "METRIC" | "TERM" | "RULE" | "LEDGER_USAGE" | "TRANSACTION_INPUT" | "EVENT" | "AS_OF_DATE";

export interface MissingInput {
  kind: MissingInputKind;
  /** The key a Phase-5 supplier must satisfy: metric name, term name/definition id, rule id, ledger key, transaction input name, event description. */
  key: string;
  exprId: string | null;
  asOf: string | null;
  period: string | null;
  expectedType: IRValueType | "CAPACITY" | null;
}

// ---------------------------------------------------------------------------
// Evaluation trace (mission §16) - one node per evaluated IR node, in
// evaluation order, with the operation, operand results, chosen branch and
// the reason evaluation stopped.
// ---------------------------------------------------------------------------

export interface TraceNode {
  exprId: string | null;
  kind: string;
  status: RuntimeStatus;
  value: SerializedRuntimeValue | null;
  provenance: SourceProvenance | null;
  /** For MAX/MIN/IF/SCHEDULE/AND/OR: which operand or branch determined the result. */
  selected?: { index: number; exprId: string | null; reason: string } | null;
  /** For reference nodes: the runtime input that satisfied them. */
  input?: ResolvedInputRecord | null;
  /** Safe partial-evaluation metadata (mission §19) - never a final value. */
  bounds?: { knownLowerBound?: SerializedRuntimeValue; knownUpperBound?: SerializedRuntimeValue } | null;
  note?: string;
  children: TraceNode[];
  cacheHit?: boolean;
}

// ---------------------------------------------------------------------------
// Financial / runtime input contract (mission §7-§8) - interface only. Phase 5
// implements suppliers; Phase 4A tests inject deterministic fixtures.
// ---------------------------------------------------------------------------

export interface InputProvenance {
  /** e.g. "FinancialSnapshot V3", a statement id, a user-entered assumption id. */
  source: string;
  sourceVersion: string | null;
  note?: string;
  // ---- PHASE 4B (additive, present when the value came through the financial-input contract) ----
  /** The immutable snapshot and version that supplied the fact. */
  snapshotId?: string;
  snapshotVersion?: string;
  snapshotStatus?: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "SUPERSEDED";
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvalRef?: string | null;
  /** How the input was selected - never "first match". */
  selectionMethod?: string;
  inputContractVersion?: string;
  /** True when the caller explicitly widened policy beyond APPROVED and relied on the result anyway. */
  reliedOnNonApprovedSnapshot?: boolean;
  /** Whether the contract reference was matched by a stable key or only by the name the contract used. */
  identityStrength?: "STABLE_KEY" | "CONTRACT_NAME_ONLY";
  currency?: string | null;
}

export interface MetricInput {
  metricKey: string;
  /** The period the value is stated for (verbatim period description from the IR, e.g. "the most recently ended Test Period", or an explicit label). Null when the value is not period-specific. */
  period: string | null;
  asOf: string | null;
  value: RuntimeValue;
  provenance: InputProvenance;
}

export interface ResolvedInputRecord {
  kind: MissingInputKind;
  key: string;
  period: string | null;
  asOf: string | null;
  provenance: InputProvenance;
  value: SerializedRuntimeValue;
}

export interface MetricQuery { metricName: string; companyId: string; instrumentKey: string; asOf: string | null; period: string | null; expectedType: IRValueType }

/** A term may resolve to a Phase-3 definition (evaluated recursively) or to a directly supplied value. */
export type TermResolution = { kind: "DEFINITION"; definition: IRDefinition } | { kind: "VALUE"; input: MetricInput } | null;

/**
 * PHASE 4B - the strict resolution surface. A resolver that implements it loses no information:
 * the evaluator maps each state to an explicit runtime state instead of collapsing everything into
 * "no value". A resolver without it keeps the Phase-4A behaviour unchanged.
 */
export interface StrictInputResolver {
  contractVersion: string;
  resolveMetricStrict(query: MetricQuery): ResolutionResult;
  resolveTermStrict(termName: string, resolvedDefinitionId: string | null, companyId: string, instrumentKey: string | null, expectedType: IRValueType | "CAPACITY", period: string | null, asOf: string | null): TermResolutionOutcome;
  resolveLedgerUsageStrict(key: string, companyId: string, instrumentKey: string | null): ResolutionResult;
  resolveTransactionInputStrict(inputName: string, expectedType: IRValueType, companyId: string, instrumentKey: string | null): ResolutionResult;
  resolveEventActiveStrict(eventDescription: string, asOf: string | null, companyId: string, instrumentKey: string | null): ResolutionResult;
}

export interface InputResolver {
  /** PHASE 4B (optional): when present, the evaluator uses it and reports explicit resolution states. */
  strict?: StrictInputResolver;
  resolveMetric(query: MetricQuery): MetricInput | null;
  resolveTerm(termName: string, resolvedDefinitionId: string | null, companyId: string, instrumentKey: string): TermResolution;
  resolveRule(ruleId: string): IRRule | null;
  resolveLedgerUsage(key: { sharedCapId: string | null; ruleId: string | null }): MetricInput | null;
  resolveTransactionInput(inputName: string, expectedType: IRValueType): MetricInput | null;
  /** Whether a described event is active as of a date; null when the fact is not supplied. */
  resolveEventActive(eventDescription: string, asOf: string | null): { active: boolean; provenance: InputProvenance } | null;
}

// ---------------------------------------------------------------------------
// Evaluation context and result
// ---------------------------------------------------------------------------

export interface EvaluationContext {
  companyId?: string;
  instrumentKey?: string;
  /** ISO date the evaluation is performed as of (SCHEDULE selection, default metric as-of). */
  asOf?: string | null;
  /** The Phase-3 object the expression belongs to, for provenance. */
  ruleId?: string | null;
  definitionId?: string | null;
  /**
   * The stable id of the compiled unit that OWNS the expression being evaluated - rule.ruleId or
   * definition.definitionId, never an array position. The verification gate looks the unit's record
   * up by it. Not serialized into any result.
   */
  unitId?: string | null;
  /**
   * What the caller knows about the owning unit's identity (the version trio, company, instrument),
   * for the gate's identity check. evaluateRule / 4C / 4D supply the full trio from the IR object; a
   * bare call may omit it, in which case only the fields it does know are compared.
   */
  unitIdentity?: Partial<RuntimeVerificationIdentity> | null;
  /** PHASE-4 VERIFICATION GATE: the envelope to gate against. Absent = legacy behaviour. */
  verification?: RuntimeVerificationEnvelope;
  /** PHASE-4 VERIFICATION GATE: ALLOW_MISSING (default) or REQUIRE. */
  policy?: VerificationGatePolicy;
}

export interface EvaluationStats {
  nodesEvaluated: number;
  cacheHits: number;
  dependencyCount: number;
  maxDepth: number;
  missingInputCount: number;
  unsupportedCount: number;
  evaluationStatus: RuntimeStatus;
}

export interface EvaluationProvenance {
  runtimeVersion: string;
  /** PHASE 4B: the financial-input contract version in force, when a strict resolver supplied the inputs. */
  inputContractVersion?: string;
  ruleId: string | null;
  definitionId: string | null;
  rootExprId: string | null;
  /** Distinct Phase-3 source citations touched, in first-use order. */
  sourceCitations: string[];
  /** Every runtime input actually used. */
  inputsUsed: ResolvedInputRecord[];
  /** Phase-3 objects (definitions/rules) expanded during evaluation. */
  expandedObjects: { kind: "DEFINITION" | "RULE"; id: string }[];
}

export interface EvaluationResult {
  runtimeVersion: string;
  status: RuntimeStatus;
  value: SerializedRuntimeValue | null;
  missingInputs: MissingInput[];
  /** Flat convenience list of missing input keys (e.g. ["Consolidated EBITDA"]). */
  missingInputKeys: string[];
  diagnostics: RuntimeDiagnostic[];
  /** Safe partial-evaluation metadata at the root (mission §19) - never the answer. */
  bounds: { knownLowerBound?: SerializedRuntimeValue; knownUpperBound?: SerializedRuntimeValue } | null;
  trace: TraceNode;
  provenance: EvaluationProvenance;
  stats: EvaluationStats;
}
