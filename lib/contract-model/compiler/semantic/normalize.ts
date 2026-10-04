/**
 * Phase 3B - deterministic normalization (task §9's own prescribed
 * pipeline step 3: tolerant wire output -> canonical Phase 3A IR). This is
 * the ONLY place a raw model string becomes a real, closed enum value or
 * an honest UNSUPPORTED/degraded fallback - the model itself never invents
 * IR structure past this boundary (task §10). Every enum match uses the
 * SAME tolerant "exact, then upper-snake-case" matching convention already
 * established by amendment/semantic-interpreter.ts's own normalizeOperation
 * (task §9's own explicit reuse of that lesson), never a z.enum() that
 * would crash the client-side schema check on an out-of-vocabulary value.
 *
 * Deliberately loosely typed at internal composite-node-construction
 * boundaries (see buildComposite below) - identity.ts's own
 * computeExpressionId already documents doing exactly this ("rather than
 * fighting the type system for a guarantee the function body already
 * enforces at runtime"); every externally-visible function in this module
 * still returns a real, precisely-typed IRExpression/IRRule/IRDefinition.
 */
import { CovenantFamily, ContractRuleType, ContractRulePosture, ContractRuleRelationshipType, EntityClassTag } from "@prisma/client";
import { CONTRACT_ACTIONS, CONTRACT_CONDITION_TYPES } from "../../types";
import { withExpressionId, computeRuleId, computeDefinitionId, computeSharedCapId } from "../../ir/identity";
import { analyzeType, inferType } from "../../ir/type-check";
import { UNSUPPORTED_TYPE, type IRCapacityExpression, type IRCondition, type IRConditionEvaluationBasis, type IRDefinition, type IRException, type IRExpression, type IRInheritedAttribute, type IRRule, type IRRuleDependency, type IRSharedCapacity, type IRSourceDependency, type IRSourceTargetRef, type IRUnresolvedDependency, type IRValueType, type OperativeLineageRef, type RepresentationSufficiency, type SourceProvenance, type UnlimitedCapacity } from "../../ir/types";
import { describeSourceDependency, figureStatedInText, numericFiguresInProse, resolveSourceTarget, type OwnershipIndexCandidate } from "./source-reference";
import { classifyDefinitionOwnership, classifyUnitOwnership, type ContextOnlyUnitEmission, type OwnershipScope } from "./unit-ownership";
import type { StructuralIndex } from "../structural-index";
import type { SubmitCompilationInput, WireCondition, WireDefinition, WireException, WireExpression, WireRule, WireSharedCapacity } from "./wire-schema";
import type { IRExtensionCandidate, SemanticCompilerInput } from "./types";
import { applyEntityScopeGuard, classifyEntityTag, entityScopeWitnessFor, normalizeEntityTags } from "./entity-scope-guard";
import type { IREntityTagNormalization } from "../../ir/types";

const IR_VALUE_TYPES: readonly IRValueType[] = ["MONEY", "NUMBER", "PERCENT", "RATIO", "BOOLEAN", "DATE", "DURATION", "PERIOD", "ENTITY_SET", "CAPACITY"];
const SUFFICIENCY_VALUES: readonly RepresentationSufficiency[] = ["COMPLETE", "PARTIAL", "AMBIGUOUS", "UNSUPPORTED", "MISSING_CONTEXT", "CONFLICTED"];

function matchEnum<T extends string>(raw: string | null | undefined, validValues: readonly T[]): T | null {
  if (!raw) return null;
  const exact = validValues.find((v) => v === raw);
  if (exact) return exact;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return validValues.find((v) => v === upper) ?? null;
}

export interface NormalizationWarning {
  scope: string; // e.g. "rule[localRef=r1].covenantFamily"
  message: string;
}

/** SEMANTIC FIDELITY: what the model wrote about a dependency, kept beside (never inside) the unit. Figures it restates that the operative source does not state are flagged as target economics. */
export interface DependencyProseDiagnostic {
  scope: string;
  /** The dependency's reference when the prose belongs to a dependency; null for other model prose (sufficiency reasons, descriptions). */
  exactSourceTargetRef: string | null;
  modelProse: string;
  figuresInProse: string[];
  /** Figures the prose asserts that the candidate's own operative text never states - the target's economics, excluded from the artifact. */
  targetEconomicsExcluded: string[];
}

interface NormCtx {
  companyId: string;
  instrumentKey: string;
  documentId: string;
  inheritedCitation: string | null;
  warnings: NormalizationWarning[];
  scopePath: string;
  /** Resolves a wire localRef OR an already-real external ruleId string to a real, computed ruleId - null when neither resolves (an honest "dangling," never guessed). */
  resolveRuleRef: (ref: string) => string | null;
  resolveSharedCapRef: (ref: string) => string | null;
  /** SEMANTIC FIDELITY: reference resolution access (null in hand-built fixtures without an index). */
  referenceIndex: StructuralIndex | null;
  population: readonly OwnershipIndexCandidate[] | null;
  /** The candidate's operative text - the only text whose figures a dependency description may restate. */
  operativeText: string;
  /** Model prose stripped out of dependency descriptions, kept as non-authoritative diagnostics on the compilation (never on the unit). */
  dependencyProse: DependencyProseDiagnostic[];
  /** ENTITY-SCOPE GUARD §4: every entity tag emitted anywhere under this rule (rule fields or ENTITY_SCOPE_REFERENCE nodes) with its RECOGNIZED/UNRECOGNIZED outcome - shared by reference across child contexts, fresh per rule. */
  entityTagAudit: IREntityTagNormalization[];
}

function provenanceFor(ctx: NormCtx, citation: string | null | undefined, excerpt: string | null | undefined): SourceProvenance | undefined {
  const cite = citation ?? ctx.inheritedCitation;
  if (!cite) return undefined;
  return { documentId: ctx.documentId, sourceNodeKey: null, sourceCitation: cite, excerpt: excerpt ?? null };
}

function warn(ctx: NormCtx, message: string): void {
  ctx.warnings.push({ scope: ctx.scopePath, message });
}

function childCtx(ctx: NormCtx, wire: WireExpression, extraScope: string): NormCtx {
  return { ...ctx, inheritedCitation: wire.citation ?? ctx.inheritedCitation, scopePath: `${ctx.scopePath}.${extraScope}` };
}

function unsupportedNode(ctx: NormCtx, reason: string, wire: WireExpression, prov?: SourceProvenance, attemptedStructure?: IRExpression): IRExpression {
  warn(ctx, reason);
  return withExpressionId({
    kind: "UNSUPPORTED",
    type: null,
    sourceEvidence: wire.sourceEvidence ?? wire.excerpt ?? "(no evidence captured)",
    semanticDescription: wire.semanticDescription ?? `unrecognized or malformed expression (kind="${wire.kind}")`,
    reason,
    requiredReview: true,
    provenance: prov,
    ...(attemptedStructure ? { attemptedStructure } : {}),
  });
}

/**
 * Builds a compound node's final, correctly-typed IR object. `inferType`
 * (lib/contract-model/ir/type-check.ts) ignores a compound node's OWN
 * `.type` field entirely for every kind except DIVIDE (confirmed by
 * reading that module: ADD/SUM/MULTIPLY/MAX/MIN/COMPARE/AND/OR/NOT/IF/
 * SCHEDULE/AS_OF/DURING_PERIOD/EVENT_ACTIVE all derive their result type
 * purely from already-built child subexpressions) - so a placeholder type
 * on the draft is safe, and the REAL computed type is substituted before
 * the final withExpressionId call (which must see the correct type, since
 * it is part of the node's own content-derived identity).
 *
 * F-6 (Phase 3 Chewy remediation 3) - three outcomes, decided by
 * analyzeType's UNKNOWN/CONFLICT distinction rather than the old
 * all-or-nothing inferType:
 *   1. CONFLICT (the known operands are dimensionally inconsistent, e.g.
 *      ADD(MONEY, BOOLEAN)): collapse to an UNSUPPORTED node carrying the
 *      fully-assembled attempt as a diagnostic sidecar - unchanged.
 *   2. UNKNOWN with no typed operand at all (every operand is itself
 *      unsupported, so the composite's own dimension is undeterminable):
 *      same collapse - nothing represented is lost, and no type is guessed.
 *   3. UNKNOWN with a determinable dimension (some operand is unsupported,
 *      but the typed operands agree): KEEP the composite, typed by its
 *      known part, with the unsupported child left in place. inferType
 *      still reports UNSUPPORTED for it (never executable), the owning
 *      rule/definition is forced below COMPLETE by
 *      enforceSufficiencyConsistency, and Pass C credits the represented
 *      siblings while the unsupported child stays visibly UNSUPPORTED.
 */
function buildComposite(ctx: NormCtx, kind: string, fields: Record<string, unknown>, placeholderType: string, wire: WireExpression, prov: SourceProvenance | undefined, unsupportedMessage: string): IRExpression {
  const draft = { kind, type: placeholderType, exprId: "", ...fields, provenance: prov } as unknown as IRExpression;
  const analysis = analyzeType(draft);
  if (analysis.conflict !== null || analysis.known === null) {
    // Preserve the fully-assembled attempt (every sibling operand that DID
    // successfully normalize/type-check, exprId'd and all) as a diagnostic
    // sidecar rather than discarding it - this composite's OWN top-level
    // value genuinely cannot be typed (a real conflict, or no typed operand
    // to determine it from), but completeness-checking and review must
    // still be able to see which specific operand(s) caused it, not just an
    // opaque blob.
    const attempted = withExpressionId({ ...(draft as unknown as Record<string, unknown>), type: placeholderType } as unknown as IRExpression);
    const reason = analysis.conflict !== null ? `${unsupportedMessage}: ${analysis.conflict}` : `${unsupportedMessage}: no operand carries a determinable type (every operand is itself unsupported)`;
    return unsupportedNode(ctx, reason, wire, prov, attempted);
  }
  if (analysis.unsupported) warn(ctx, `${kind} keeps its structure with at least one UNSUPPORTED operand in place - typed ${analysis.known} from its represented operands; PARTIAL, never executable (F-6)`);
  return withExpressionId({ ...(draft as unknown as Record<string, unknown>), type: analysis.known } as unknown as IRExpression);
}

/**
 * SEMANTIC ACCOUNTABILITY (additive): attaches the wire node's own Pass A
 * lineage to the normalized IR node. Lineage is metadata (identity.ts excludes
 * it from exprId), so attaching it after withExpressionId is exactly
 * equivalent to attaching it before. Absent (never an empty array) when the
 * wire node carried none, so pre-existing fixtures/snapshots are unchanged.
 */
function withLineage<T extends object>(node: T, ids: string[] | undefined): T {
  return ids && ids.length > 0 ? ({ ...node, inventoryItemIds: [...ids] } as T) : node;
}


const METRIC_VALUE_TYPES = ["MONEY", "RATIO", "NUMBER"] as const;

/**
 * F-6 (Phase 3 Chewy remediation 3) - a reference node whose wire form
 * carries no usable valueType. The wire contract says "defaults to MONEY
 * when omitted"; that blanket default is exactly what typed a boolean
 * predicate ("Specified Event of Default", "an IPO has been consummated")
 * as MONEY and poisoned every NOT/AND/IF above it. Such a reference now
 * takes the ONE dimension its slot deterministically requires (see
 * normalizeSiblings / the `expected` parameter) and only falls back to
 * MONEY when the slot fixes nothing. An EXPLICIT valueType is never
 * overridden - a model that says MONEY in a BOOLEAN slot has made a claim
 * the type checker must reject, not one normalization should repair.
 */
function isUntypedReferenceWire(wire: WireExpression | null | undefined): boolean {
  if (!wire) return false;
  if (wire.kind === "METRIC_REFERENCE") return !matchEnum(wire.valueType, METRIC_VALUE_TYPES);
  if (wire.kind === "DEFINED_TERM_REFERENCE" || wire.kind === "TRANSACTION_INPUT_REFERENCE") return !matchEnum(wire.valueType, IR_VALUE_TYPES);
  return false;
}

const WIRE_LITERAL_TYPES: Record<string, IRValueType> = { MONEY: "MONEY", NUMBER: "NUMBER", PERCENT: "PERCENT", RATIO: "RATIO", BOOLEAN_LITERAL: "BOOLEAN", DATE_LITERAL: "DATE", RULE_REFERENCE: "CAPACITY", LEDGER_USAGE_REFERENCE: "MONEY", ENTITY_SCOPE_REFERENCE: "ENTITY_SET" };

/** The type a wire node declares on its own, independent of any sibling - a literal's kind, an explicitly typed reference's valueType; null for composites, UNSUPPORTED and untyped references. */
function wireDeclaredType(wire: WireExpression | null | undefined): IRValueType | null {
  if (!wire) return null;
  const literal = WIRE_LITERAL_TYPES[wire.kind];
  if (literal) return literal;
  if (wire.kind === "METRIC_REFERENCE") return matchEnum(wire.valueType, METRIC_VALUE_TYPES);
  if (wire.kind === "DEFINED_TERM_REFERENCE" || wire.kind === "TRANSACTION_INPUT_REFERENCE") return matchEnum(wire.valueType, IR_VALUE_TYPES);
  return null;
}

interface SiblingSlot {
  wire: WireExpression | null | undefined;
  scope: string;
}

/**
 * Normalizes the operands of one composite so that an untyped reference
 * takes the dimension its typed siblings fix for the slot. Three tiers,
 * each normalized with the expectation the earlier tiers established:
 *   1. self-declared operands (literals, explicitly typed references);
 *   2. composites/unsupported/unknown operands, with the tier-1 dimension
 *      (or the parent's inherited expectation) as their own expectation;
 *   3. untyped references, with the unique known dimension of tiers 1+2
 *      (or the inherited expectation) - MONEY only when nothing fixes it.
 * A slot type is only ever "the one dimension every typed sibling shares";
 * two different sibling dimensions fix nothing (the composite is then a
 * genuine conflict for the type checker to reject). Operand order is
 * preserved exactly. `fixed` short-circuits all of this for slots whose
 * type is fixed by the operator itself (AND/OR operands are BOOLEAN).
 */
function normalizeSiblings(ctx: NormCtx, parent: WireExpression, slots: SiblingSlot[], options: { fixed?: IRValueType; inherited?: IRValueType; excludePercent?: boolean } = {}): IRExpression[] {
  const results: (IRExpression | undefined)[] = new Array(slots.length).fill(undefined);
  if (options.fixed) {
    slots.forEach((slot, i) => (results[i] = normalizeExpression(slot.wire, childCtx(ctx, parent, slot.scope), options.fixed)));
    return results as IRExpression[];
  }
  const knownDimension = (): IRValueType | undefined => {
    const dims = new Set<IRValueType>();
    for (const node of results) {
      if (!node) continue;
      const analysis = analyzeType(node);
      if (analysis.conflict !== null || analysis.known === null) continue;
      if (options.excludePercent && analysis.known === "PERCENT") continue;
      dims.add(analysis.known);
    }
    return dims.size === 1 ? [...dims][0] : undefined;
  };
  const tierOf = (slot: SiblingSlot): 1 | 2 | 3 => (wireDeclaredType(slot.wire) !== null ? 1 : isUntypedReferenceWire(slot.wire) ? 3 : 2);
  for (const tier of [1, 2, 3] as const) {
    const expected = tier === 1 ? undefined : (knownDimension() ?? options.inherited);
    slots.forEach((slot, i) => {
      if (tierOf(slot) !== tier) return;
      results[i] = normalizeExpression(slot.wire, childCtx(ctx, parent, slot.scope), expected);
    });
  }
  return results as IRExpression[];
}

/**
 * `expected` (F-6): the one dimension the enclosing slot deterministically
 * requires, when there is one (BOOLEAN under NOT/AND/OR/IF-condition/gate/
 * trigger/condition; the typed siblings' shared dimension under ADD/MAX/
 * COMPARE/...). Consulted ONLY by references that carry no valueType of
 * their own and by composites passing it down to such references; never
 * overrides an explicit type, never changes a literal.
 */
export function normalizeExpression(wire: WireExpression | null | undefined, ctx: NormCtx, expected?: IRValueType): IRExpression {
  return withLineage(normalizeExpressionInner(wire, ctx, expected), wire?.inventoryItemIds);
}

function normalizeExpressionInner(wire: WireExpression | null | undefined, ctx: NormCtx, expected?: IRValueType): IRExpression {
  if (!wire) return unsupportedNode(ctx, "no expression was provided where one was required", { kind: "MISSING" });
  const prov = provenanceFor(ctx, wire.citation, wire.excerpt);

  switch (wire.kind) {
    case "MONEY":
      if (typeof wire.amount !== "number") return unsupportedNode(ctx, "MONEY node missing a numeric amount", wire, prov);
      return withExpressionId({ kind: "MONEY", type: "MONEY", amount: wire.amount, currency: wire.currency ?? "USD", provenance: prov });
    case "NUMBER":
      if (typeof wire.value !== "number") return unsupportedNode(ctx, "NUMBER node missing a numeric value", wire, prov);
      return withExpressionId({ kind: "NUMBER", type: "NUMBER", value: wire.value, provenance: prov });
    case "PERCENT":
      if (typeof wire.value !== "number") return unsupportedNode(ctx, "PERCENT node missing a numeric value", wire, prov);
      return withExpressionId({ kind: "PERCENT", type: "PERCENT", value: wire.value, provenance: prov });
    case "RATIO":
      if (typeof wire.value !== "number") return unsupportedNode(ctx, "RATIO node missing a numeric value", wire, prov);
      return withExpressionId({ kind: "RATIO", type: "RATIO", value: wire.value, provenance: prov });
    case "BOOLEAN_LITERAL":
      if (typeof wire.boolValue !== "boolean") return unsupportedNode(ctx, "BOOLEAN_LITERAL node missing boolValue", wire, prov);
      return withExpressionId({ kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value: wire.boolValue, provenance: prov });
    case "DATE_LITERAL":
      if (!wire.isoDate) return unsupportedNode(ctx, "DATE_LITERAL node missing isoDate", wire, prov);
      return withExpressionId({ kind: "DATE_LITERAL", type: "DATE", isoDate: wire.isoDate, provenance: prov });

    case "METRIC_REFERENCE": {
      if (!wire.metricName) return unsupportedNode(ctx, "METRIC_REFERENCE node missing metricName", wire, prov);
      const explicitMetricType = matchEnum(wire.valueType, METRIC_VALUE_TYPES);
      const slotMetricType = expected && (METRIC_VALUE_TYPES as readonly string[]).includes(expected) ? (expected as "MONEY" | "RATIO" | "NUMBER") : null;
      const valueType: "MONEY" | "RATIO" | "NUMBER" = explicitMetricType ?? slotMetricType ?? "MONEY";
      if (wire.valueType && !explicitMetricType) warn(ctx, `METRIC_REFERENCE "${wire.metricName}" had unrecognized valueType "${wire.valueType}" - ${slotMetricType ? `typed ${slotMetricType} from its slot` : "defaulted to MONEY"}`);
      return withExpressionId({ kind: "METRIC_REFERENCE", type: valueType, metricName: wire.metricName, companyId: ctx.companyId, instrumentKey: ctx.instrumentKey, resolvedDefinitionId: null });
    }
    case "DEFINED_TERM_REFERENCE": {
      if (!wire.termName) return unsupportedNode(ctx, "DEFINED_TERM_REFERENCE node missing termName", wire, prov);
      const valueType: IRValueType = matchEnum(wire.valueType, IR_VALUE_TYPES) ?? expected ?? "MONEY";
      return withExpressionId({ kind: "DEFINED_TERM_REFERENCE", type: valueType, termName: wire.termName, companyId: ctx.companyId, instrumentKey: ctx.instrumentKey, resolvedDefinitionId: null });
    }
    case "RULE_REFERENCE": {
      if (!wire.ruleRef) return unsupportedNode(ctx, "RULE_REFERENCE node missing ruleRef", wire, prov);
      const resolved = ctx.resolveRuleRef(wire.ruleRef);
      if (!resolved) return unsupportedNode(ctx, `RULE_REFERENCE targetRef "${wire.ruleRef}" does not resolve to any rule in this compilation attempt or a known external ruleId`, wire, prov);
      return withExpressionId({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId: resolved, companyId: ctx.companyId, instrumentKey: ctx.instrumentKey });
    }
    case "LEDGER_USAGE_REFERENCE": {
      const sharedCapId = wire.sharedCapRef ? ctx.resolveSharedCapRef(wire.sharedCapRef) : null;
      const ruleId = !sharedCapId && wire.ruleRef ? ctx.resolveRuleRef(wire.ruleRef) : null;
      if (!sharedCapId && !ruleId) return unsupportedNode(ctx, "LEDGER_USAGE_REFERENCE requires a resolvable sharedCapRef or ruleRef", wire, prov);
      return withExpressionId({ kind: "LEDGER_USAGE_REFERENCE", type: "MONEY", sharedCapId, ruleId });
    }
    case "TRANSACTION_INPUT_REFERENCE": {
      if (!wire.inputName) return unsupportedNode(ctx, "TRANSACTION_INPUT_REFERENCE node missing inputName", wire, prov);
      const valueType: IRValueType = matchEnum(wire.valueType, IR_VALUE_TYPES) ?? expected ?? "MONEY";
      return withExpressionId({ kind: "TRANSACTION_INPUT_REFERENCE", type: valueType, inputName: wire.inputName });
    }
    case "ENTITY_SCOPE_REFERENCE": {
      // ENTITY-SCOPE GUARD §4: every tag gets exactly one outcome; an unrecognized tag is warned about and audited, never silently dropped.
      const classify = (raw: string[] | undefined, field: "ENTITY_SCOPE_REFERENCE.include" | "ENTITY_SCOPE_REFERENCE.exclude"): EntityClassTag[] => {
        const out: EntityClassTag[] = [];
        for (const t of raw ?? []) {
          const c = classifyEntityTag(t, field);
          ctx.entityTagAudit.push(c);
          if (c.outcome === "UNRECOGNIZED_ENTITY_TAG") warn(ctx, `ENTITY_SCOPE_UNRECOGNIZED_TAG: ${field} tag "${t}" is not an EntityClassTag value - preserved in the rule's entityScopeAudit, not guessed`);
          else if (c.normalized && !out.includes(c.normalized)) out.push(c.normalized);
        }
        return out;
      };
      const include = classify(wire.entityScopeInclude, "ENTITY_SCOPE_REFERENCE.include");
      const exclude = classify(wire.entityScopeExclude, "ENTITY_SCOPE_REFERENCE.exclude");
      return withExpressionId({ kind: "ENTITY_SCOPE_REFERENCE", type: "ENTITY_SET", scope: { include, exclude } });
    }

    case "ADD":
    case "MULTIPLY":
    case "SUM":
    case "MAX":
    case "MIN":
    case "AND":
    case "OR": {
      const wireOperands = wire.operands ?? [];
      if (wireOperands.length === 0) return unsupportedNode(ctx, `${wire.kind} requires at least one operand`, wire, prov);
      const boolean = wire.kind === "AND" || wire.kind === "OR";
      const operands = normalizeSiblings(
        ctx,
        wire,
        wireOperands.map((o, i) => ({ wire: o, scope: `${wire.kind}[${i}]` })),
        boolean ? { fixed: "BOOLEAN" } : { inherited: expected, excludePercent: wire.kind === "MULTIPLY" }
      );
      return buildComposite(ctx, wire.kind, { operands }, wire.kind === "AND" || wire.kind === "OR" ? "BOOLEAN" : "NUMBER", wire, prov, `${wire.kind} operands do not type-check together under the IR's own composition rules`);
    }
    case "SUBTRACT":
    case "DIVIDE": {
      const leftKey = wire.kind === "DIVIDE" ? "numerator" : "left";
      const rightKey = wire.kind === "DIVIDE" ? "denominator" : "right";
      const leftWire = wire.kind === "DIVIDE" ? wire.numerator : wire.left;
      const rightWire = wire.kind === "DIVIDE" ? wire.denominator : wire.right;
      if (!leftWire || !rightWire) return unsupportedNode(ctx, `${wire.kind} requires both operands`, wire, prov);
      // SUBTRACT operands share one dimension (sibling-typed, inheriting the
      // slot's expectation); DIVIDE's numerator and denominator legitimately
      // differ, so each is normalized on its own with no expectation.
      const [left, right] =
        wire.kind === "SUBTRACT"
          ? normalizeSiblings(ctx, wire, [{ wire: leftWire, scope: `${wire.kind}.${leftKey}` }, { wire: rightWire, scope: `${wire.kind}.${rightKey}` }], { inherited: expected })
          : [normalizeExpression(leftWire, childCtx(ctx, wire, `${wire.kind}.${leftKey}`)), normalizeExpression(rightWire, childCtx(ctx, wire, `${wire.kind}.${rightKey}`))];
      return buildComposite(ctx, wire.kind, { [leftKey]: left, [rightKey]: right }, "NUMBER", wire, prov, `${wire.kind} operands do not type-check together`);
    }
    case "COMPARE": {
      if (!wire.left || !wire.right) return unsupportedNode(ctx, "COMPARE requires both left and right operands", wire, prov);
      const operator = matchEnum(wire.operator, ["GT", "GTE", "LT", "LTE", "EQ"] as const) ?? "EQ";
      if (!wire.operator || !matchEnum(wire.operator, ["GT", "GTE", "LT", "LTE", "EQ"] as const)) warn(ctx, `COMPARE had unrecognized operator "${wire.operator}" - defaulted to EQ`);
      // The two sides of a COMPARE share one dimension - an untyped side takes the typed side's (a ratio metric compared against an untyped "Ratio as of the last Test Period" term types that term RATIO, never MONEY).
      const [left, right] = normalizeSiblings(ctx, wire, [{ wire: wire.left, scope: "COMPARE.left" }, { wire: wire.right, scope: "COMPARE.right" }]);
      return buildComposite(ctx, "COMPARE", { left, operator, right }, "BOOLEAN", wire, prov, "COMPARE operands are not the same type");
    }
    case "NOT": {
      if (!wire.operand) return unsupportedNode(ctx, "NOT requires an operand", wire, prov);
      const operand = normalizeExpression(wire.operand, childCtx(ctx, wire, "NOT.operand"), "BOOLEAN");
      return buildComposite(ctx, "NOT", { operand }, "BOOLEAN", wire, prov, "NOT operand is not BOOLEAN");
    }
    case "IF": {
      if (!wire.condition || !wire.then) return unsupportedNode(ctx, "IF requires condition and then", wire, prov);
      const condition = normalizeExpression(wire.condition, childCtx(ctx, wire, "IF.condition"), "BOOLEAN");
      const branches = normalizeSiblings(ctx, wire, wire.else ? [{ wire: wire.then, scope: "IF.then" }, { wire: wire.else, scope: "IF.else" }] : [{ wire: wire.then, scope: "IF.then" }], { inherited: expected });
      const thenExpr = branches[0]!;
      const elseExpr = wire.else ? branches[1]! : null;
      return buildComposite(ctx, "IF", { condition, then: thenExpr, else: elseExpr }, "BOOLEAN", wire, prov, "IF condition must be BOOLEAN and both branches must resolve to the same type");
    }
    case "AS_OF": {
      // AS_OF's own value is carried on the generic `operand` field (the same field NOT/DURING_PERIOD use for their single child) rather than a dedicated one - one fewer field for the model to learn.
      const valueWire = wire.operand;
      if (!valueWire) return unsupportedNode(ctx, "AS_OF requires an operand (the value being dated)", wire, prov);
      const value = normalizeExpression(valueWire, childCtx(ctx, wire, "AS_OF.value"), expected);
      // SEMANTIC FIDELITY: a dated value needs its date. The source normally states a RELATIVE selector ("the last day of the
      // most recently ended fiscal quarter for which financial statements are available"); that selector text IS the
      // asOfDate (a string selector is a first-class IRAsOf.asOfDate). A missing selector is UNSUPPORTED, never "(unspecified)".
      const asOfDate = typeof wire.asOfDate === "string" && wire.asOfDate.trim().length > 0 ? wire.asOfDate.trim() : null;
      if (!asOfDate) return unsupportedNode(ctx, "AS_OF requires asOfDate: the source's own measurement-date selector (relative, e.g. 'last day of the most recently ended fiscal quarter', or an ISO date)", wire, prov, value);
      return buildComposite(ctx, "AS_OF", { value, asOfDate }, "RATIO", wire, prov, "AS_OF value type could not be determined");
    }
    case "DURING_PERIOD": {
      if (!wire.operand) return unsupportedNode(ctx, "DURING_PERIOD requires an operand (the value being period-scoped)", wire, prov);
      const value = normalizeExpression(wire.operand, childCtx(ctx, wire, "DURING_PERIOD.value"), expected);
      return buildComposite(ctx, "DURING_PERIOD", { value, periodDescription: wire.periodDescription ?? "(unspecified period)" }, "RATIO", wire, prov, "DURING_PERIOD value type could not be determined");
    }
    case "SCHEDULE": {
      const wireCases = wire.cases ?? [];
      if (wireCases.length === 0) return unsupportedNode(ctx, "SCHEDULE requires at least one case", wire, prov);
      const caseValues = normalizeSiblings(ctx, wire, [...wireCases.map((c, i) => ({ wire: c.value, scope: `SCHEDULE.cases[${i}]` })), ...(wire.defaultValue ? [{ wire: wire.defaultValue, scope: "SCHEDULE.defaultValue" }] : [])], { inherited: expected });
      const cases = wireCases.map((c, i) => ({ from: c.from, to: c.to, description: c.description, value: caseValues[i]! }));
      const defaultValue = wire.defaultValue ? caseValues[wireCases.length]! : null;
      return buildComposite(ctx, "SCHEDULE", { cases, defaultValue }, "RATIO", wire, prov, "SCHEDULE cases (and defaultValue, if set) do not all resolve to the same type");
    }
    case "EVENT_ACTIVE": {
      const triggerCondition = wire.triggerCondition ? normalizeExpression(wire.triggerCondition, childCtx(ctx, wire, "EVENT_ACTIVE.triggerCondition"), "BOOLEAN") : null;
      return buildComposite(ctx, "EVENT_ACTIVE", { eventDescription: wire.eventDescription ?? "(unspecified event)", triggerCondition, activeDuration: wire.activeDuration ?? null }, "BOOLEAN", wire, prov, "EVENT_ACTIVE triggerCondition must be BOOLEAN");
    }
    case "UNSUPPORTED":
      return unsupportedNode(ctx, wire.reason ?? "model marked this component UNSUPPORTED", wire, prov);
    default:
      return unsupportedNode(ctx, `unrecognized expression kind "${wire.kind}" - not a real IR node type`, wire, prov);
  }
}

export function normalizeCapacityExpression(wire: WireExpression | null | undefined, ctx: NormCtx): IRCapacityExpression | null {
  if (!wire) return null;
  if (wire.kind === "UNLIMITED_CAPACITY") {
    const prov = provenanceFor(ctx, wire.citation, wire.excerpt);
    const gatedBy = wire.gatedBy ? normalizeExpression(wire.gatedBy, childCtx(ctx, wire, "UNLIMITED_CAPACITY.gatedBy"), "BOOLEAN") : null;
    if (gatedBy && inferType(gatedBy) !== "BOOLEAN" && inferType(gatedBy) !== UNSUPPORTED_TYPE) {
      warn(ctx, "UnlimitedCapacity.gatedBy did not resolve to BOOLEAN - kept as-is for validate.ts to flag structurally");
    }
    const unlimited: UnlimitedCapacity = { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy, provenance: prov };
    return withLineage(unlimited, wire.inventoryItemIds);
  }
  return normalizeExpression(wire, ctx);
}

const COMPLIANCE_METRIC = /\b(?:compliance|complies|comply|satisfaction|satisfied|satisfies|in\s+compliance)\b/i;

function normalizeEvaluationBasis(wire: WireCondition["evaluationBasis"], prov: SourceProvenance | null): IRConditionEvaluationBasis | null {
  if (!wire) return null;
  const clean = (v: string | null | undefined) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
  const basis: IRConditionEvaluationBasis = { proForma: !!wire.proForma, transactionEffect: clean(wire.transactionEffect), asOfSelector: clean(wire.asOfSelector), deemedEffectiveAt: clean(wire.deemedEffectiveAt), testingPeriod: clean(wire.testingPeriod), provenance: prov };
  return basis.proForma || basis.transactionEffect || basis.asOfSelector || basis.deemedEffectiveAt || basis.testingPeriod ? basis : null;
}

/** True when an expression tree carries a METRIC_REFERENCE whose name is a compliance/satisfaction claim typed as a quantity - "compliance with covenants" is BOOLEAN, never MONEY. */
function misTypedComplianceMetric(expr: IRExpression | null): string | null {
  let found: string | null = null;
  const walk = (e: unknown): void => {
    if (!e || typeof e !== "object" || found) return;
    const r = e as Record<string, unknown>;
    if (r.kind === "METRIC_REFERENCE" && typeof r.metricName === "string" && COMPLIANCE_METRIC.test(r.metricName) && r.type !== "BOOLEAN") { found = r.metricName; return; }
    for (const v of Object.values(r)) if (v && typeof v === "object") walk(v);
  };
  walk(expr);
  return found;
}

function normalizeCondition(wire: WireCondition, ctx: NormCtx, index: number): IRCondition {
  const conditionType = matchEnum(wire.conditionType, CONTRACT_CONDITION_TYPES) ?? "UNSUPPORTED";
  if (!matchEnum(wire.conditionType, CONTRACT_CONDITION_TYPES)) warn(ctx, `condition[${index}].conditionType "${wire.conditionType}" not recognized - normalized to UNSUPPORTED`);
  const prov = provenanceFor(ctx, wire.citation, wire.excerpt) ?? null;
  const targets: IRSourceTargetRef[] = (wire.referencesRuleTargets ?? []).filter((t) => typeof t?.targetRef === "string" && t.targetRef.trim().length > 0).map((t) => resolveSourceTarget({ exactSourceTargetRef: t.targetRef, documentId: ctx.documentId, index: ctx.referenceIndex, population: ctx.population }));
  for (const t of targets) if (t.resolutionStatus === "DEPENDENCY_UNKNOWN") warn(ctx, `condition[${index}] references "${t.exactSourceTargetRef}", which resolves to no structural node of this document - DEPENDENCY_UNKNOWN (review required), never guessed`);
  let expression = wire.expression ? normalizeExpression(wire.expression, childCtx(ctx, wire.expression, `condition[${index}].expression`), "BOOLEAN") : null;
  // SEMANTIC FIDELITY: a compliance / satisfaction test is BOOLEAN. A MONEY/RATIO metric standing in for "compliance with
  // the covenants" is a representation error, not a quantity - replaced by UNSUPPORTED with the reason on record.
  const misTyped = expression ? misTypedComplianceMetric(expression) : null;
  if (expression && misTyped) {
    const reason = `COMPLIANCE_CONDITION_MISTYPED: "${misTyped}" is a compliance/satisfaction claim represented as a quantity-typed metric; satisfaction of a rule set is BOOLEAN and must be expressed through referencesRuleTargets, never a MONEY/RATIO metric`;
    warn(ctx, `condition[${index}].expression ${reason}`);
    expression = unsupportedNode(childCtx(ctx, wire.expression!, `condition[${index}].expression`), reason, wire.expression!, prov ?? undefined, expression);
  }
  const combinationRaw = (wire.targetCombination ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const targetCombination = targets.length === 0 ? undefined : combinationRaw === "ANY_SATISFIED" || combinationRaw === "ANY" ? "ANY_SATISFIED" : combinationRaw === "UNSPECIFIED" ? "UNSPECIFIED" : "ALL_SATISFIED";
  const evaluationBasis = normalizeEvaluationBasis(wire.evaluationBasis, prov);
  return withLineage(
    {
      conditionId: `${ctx.scopePath}.condition[${index}]`,
      conditionType,
      expression,
      referencesDefinitionId: wire.referencesDefinitionId,
      ...(targets.length > 0 ? { referencesRuleTargets: targets, targetCombination } : {}),
      ...(evaluationBasis ? { evaluationBasis } : {}),
      description: wire.description,
      provenance: prov,
    },
    wire.inventoryItemIds
  );
}


/** §17 - every ENTITY_SCOPE_REFERENCE node's include/exclude tags, collected from an expression tree. */
function collectEntityScopeNodes(roots: unknown[]): { include: string[]; exclude: string[] } {
  const include = new Set<string>(); const exclude = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object" || seen.has(n)) return; seen.add(n);
    const o = n as Record<string, unknown>;
    if (o.kind === "ENTITY_SCOPE_REFERENCE") {
      // Normalized IR nodes carry `scope.include` / `scope.exclude`; wire nodes carry `entityScopeInclude` / `entityScopeExclude`.
      const scope = (o.scope as { include?: string[]; exclude?: string[] } | undefined) ?? {};
      for (const t of [...(scope.include ?? []), ...((o.entityScopeInclude as string[] | undefined) ?? [])]) include.add(t);
      for (const t of [...(scope.exclude ?? []), ...((o.entityScopeExclude as string[] | undefined) ?? [])]) exclude.add(t);
    }
    for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === "object") visit(v);
  };
  roots.forEach(visit);
  return { include: [...include], exclude: [...exclude] };
}

function normalizeException(wire: WireException, ctx: NormCtx, index: number, appliesToRuleId: string): IRException {
  const prov = provenanceFor(ctx, wire.citation, wire.excerpt) ?? null;
  const permissionRuleId = wire.permissionRef ? ctx.resolveRuleRef(wire.permissionRef) : null;
  if (wire.permissionRef && !permissionRuleId) warn(ctx, `exception[${index}].permissionRef "${wire.permissionRef}" did not resolve to any rule in this compilation attempt`);
  return withLineage(
    {
      exceptionId: `${ctx.scopePath}.exception[${index}]`,
      appliesToRuleId,
      description: wire.description,
      permissionRuleId,
      conditions: wire.conditions.map((c, i) => normalizeCondition(c, ctx, i)),
      provenance: prov,
    },
    wire.inventoryItemIds
  );
}

/**
 * SEMANTIC ACCOUNTABILITY (docs/semantic-accountability/06-shared-cap-root-
 * cause.json, R-4): a dependsOn whose targetRef is neither a same-batch
 * localRef nor a real ir-rule: id used to be DROPPED here with only a
 * warning string left behind - which is exactly how the real, model-emitted
 * §6.04(b) -> §6.01(b)(iii)/(c)(iii) shared-cap linkage vanished. It is now
 * preserved as an explicit IRUnresolvedDependency (no fake targetRuleId, so
 * validate.ts's dangling-reference rule is untouched); Pass C dispositions
 * the corresponding DEPENDENCY/REFERENCE inventory item AMBIGUOUS (review),
 * never REPRESENTED and never silently absent. The target is never guessed.
 */
function normalizeDependency(wire: WireRule["dependsOn"][number], ctx: NormCtx, index: number): { resolved: IRRuleDependency } | { source: IRSourceDependency } {
  const relationshipType = matchEnum(wire.relationshipType, Object.values(ContractRuleRelationshipType));
  const finalType = relationshipType ?? "REQUIRES";
  if (!relationshipType) warn(ctx, `dependsOn[${index}].relationshipType "${wire.relationshipType}" not recognized - defaulted to REQUIRES`);
  const targetRuleId = ctx.resolveRuleRef(wire.targetRef);
  if (targetRuleId) return { resolved: withLineage({ relationshipType: finalType, targetRuleId, description: wire.description }, wire.inventoryItemIds) };
  // SEMANTIC FIDELITY: a cross-unit reference is first-class semantics. The reference is RESOLVED structurally when the
  // index knows the node (its semantic unit is bound at package level, never by mutating this unit) and UNKNOWN otherwise.
  // The description is deterministic; the model's prose is diagnostics - the target's own figures never enter the unit.
  const target = resolveSourceTarget({ exactSourceTargetRef: wire.targetRef, documentId: ctx.documentId, index: ctx.referenceIndex, population: ctx.population });
  const figures = numericFiguresInProse(wire.description ?? "");
  const excluded = figures.filter((f) => !figureStatedInText(f, ctx.operativeText));
  ctx.dependencyProse.push({ scope: `${ctx.scopePath}.dependsOn[${index}]`, exactSourceTargetRef: wire.targetRef, modelProse: wire.description ?? "", figuresInProse: figures, targetEconomicsExcluded: excluded });
  if (excluded.length > 0) warn(ctx, `TARGET_ECONOMICS_IN_DEPENDENCY_PROSE: dependsOn[${index}] on "${wire.targetRef}" restated ${excluded.length} figure(s) that the candidate's operative source never states; they belong to the target's own certified unit, were excluded from this unit and are recorded in the dependency-prose diagnostics`);
  if (target.resolutionStatus === "DEPENDENCY_UNKNOWN") warn(ctx, `dependsOn[${index}].targetRef "${wire.targetRef}" resolves to no structural node of this document - DEPENDENCY_UNKNOWN (review required), never guessed or dropped`);
  return { source: withLineage({ ...target, relationshipType: finalType, description: describeSourceDependency(finalType, wire.targetRef), provenance: provenanceFor(ctx, null, null) ?? null }, wire.inventoryItemIds) };
}

/** Deterministic sufficiency-consistency enforcement (task §27) - applied to every rule/definition AFTER normalization, independent of what the model itself claimed. */
export function enforceSufficiencyConsistency(sufficiency: RepresentationSufficiency, reasons: string[], expr: IRExpression | IRCapacityExpression | null, operativeLineage: OperativeLineageRef | null): { sufficiency: RepresentationSufficiency; reasons: string[] } {
  const finalReasons = [...reasons];
  let final = sufficiency;

  const containsUnsupported = (e: IRExpression | IRCapacityExpression | null): boolean => {
    if (!e) return false;
    if (e.kind === "UNLIMITED_CAPACITY") return e.gatedBy ? containsUnsupported(e.gatedBy) : false;
    if (e.kind === "UNSUPPORTED") return true;
    return inferType(e) === UNSUPPORTED_TYPE;
  };

  if (containsUnsupported(expr) && final === "COMPLETE") {
    final = "PARTIAL";
    finalReasons.push("deterministic post-processing: at least one subexpression is UNSUPPORTED or fails to type-check, so COMPLETE was downgraded to PARTIAL (task §27)");
  }
  if (operativeLineage?.operativeStatus === "OPERATIVE_STATE_CONFLICTED" && final !== "CONFLICTED") {
    final = "CONFLICTED";
    finalReasons.push("deterministic post-processing: operativeLineage.operativeStatus is OPERATIVE_STATE_CONFLICTED - the underlying text itself has an unresolved amendment conflict, so this can never be treated as authoritative (task §4/§24/§27)");
  } else if (operativeLineage?.operativeStatus === "OPERATIVE_STATE_REVIEW_REQUIRED" && final === "COMPLETE") {
    final = "AMBIGUOUS";
    finalReasons.push("deterministic post-processing: operativeLineage.operativeStatus is OPERATIVE_STATE_REVIEW_REQUIRED - downgraded from COMPLETE since the operative text itself is not yet confirmed (task §27)");
  }
  return { sufficiency: final, reasons: finalReasons };
}

export interface NormalizedCompilation {
  rules: IRRule[];
  definitions: IRDefinition[];
  sharedCapacities: IRSharedCapacity[];
  irExtensionCandidates: IRExtensionCandidate[];
  /** SEMANTIC ACCOUNTABILITY: the composition's own explicit dispositions for inventory items it did not consume (passed through verbatim for Pass C; never interpreted here). */
  inventoryDispositions: NonNullable<SubmitCompilationInput["inventoryDispositions"]>;
  warnings: NormalizationWarning[];
  /** SEMANTIC FIDELITY: units the composition emitted for source the candidate does not own - quarantined with evidence, never certified IR. */
  contextOnlyEmissions: ContextOnlyUnitEmission[];
  /** SEMANTIC FIDELITY: model prose about dependencies, kept beside the units. */
  dependencyProse: DependencyProseDiagnostic[];
}

/**
 * Top-level normalization entry point. Two passes: (1) compute every real,
 * stable ruleId/definitionId/sharedCapId up front so localRef
 * cross-references (exceptions/dependsOn/sharedCap members) resolve
 * regardless of declaration order; (2) build the full, normalized IR
 * objects using those resolved ids.
 */
export function normalizeSubmission(submission: SubmitCompilationInput, input: SemanticCompilerInput): NormalizedCompilation {
  const warnings: NormalizationWarning[] = [];
  const { companyId, instrumentKey, sourceDocumentId: documentId } = input;

  const ruleIdByLocalRef = new Map<string, string>();
  for (const wireRule of submission.rules) {
    ruleIdByLocalRef.set(wireRule.localRef, computeRuleId(companyId, instrumentKey, wireRule.sourceSectionRef, `${input.candidateRef}:${wireRule.localRef}`));
  }
  const sharedCapIdByLocalRef = new Map<string, string>();
  for (const wireCap of submission.sharedCapacities) {
    sharedCapIdByLocalRef.set(wireCap.localRef, computeSharedCapId(companyId, instrumentKey, `${input.candidateRef}:${wireCap.localRef}`));
  }
  const resolveRuleRef = (ref: string): string | null => ruleIdByLocalRef.get(ref) ?? (ref.startsWith("ir-rule:") ? ref : null);
  const resolveSharedCapRef = (ref: string): string | null => sharedCapIdByLocalRef.get(ref) ?? (ref.startsWith("ir-sharedcap:") ? ref : null);

  const dependencyProse: DependencyProseDiagnostic[] = [];
  const referenceIndex: StructuralIndex | null = input.toolAccess?.structuralIndex ?? null;
  const population = input.candidatePopulation ?? null;
  const baseCtx = (scopePath: string): NormCtx => ({ companyId, instrumentKey, documentId, inheritedCitation: input.sourceSectionRef ? `§${input.sourceSectionRef}` : null, warnings, scopePath, resolveRuleRef, resolveSharedCapRef, referenceIndex, population, operativeText: input.operativeSourceText, dependencyProse, entityTagAudit: [] });
  const ownershipScope: OwnershipScope = {
    documentId, candidateSectionRef: input.sourceSectionRef, anchorNodeId: input.contextBundle?.originatingStructuralNodeIds?.[0] ?? null,
    operativeRegionRefs: (input.sourceContext?.regions ?? []).filter((r) => r.kind === "OPERATIVE" && r.sectionRef).map((r) => r.sectionRef!),
    operativeText: input.operativeSourceText, index: referenceIndex,
    contextDefinedTerms: new Set((input.contextBundle?.items ?? []).filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY").map((i) => i.normalizedRef.trim().toLowerCase().replace(/\s+/g, " "))),
  };
  const contextOnlyEmissions: ContextOnlyUnitEmission[] = [];
  // SEMANTIC FIDELITY §7: parent scope informs (inherited attributes with PARENT_SCOPE authority); it never owns a unit.
  const parentScopeItems = (input.contextBundle?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");

  const rules: IRRule[] = submission.rules.map((wireRule) => {
    const ctx = baseCtx(`rule[${wireRule.localRef}]`);
    const ruleId = ruleIdByLocalRef.get(wireRule.localRef)!;
    const covenantFamily = matchEnum(wireRule.covenantFamily, Object.values(CovenantFamily)) ?? "QUALITATIVE_NEGATIVE_COVENANTS";
    if (!matchEnum(wireRule.covenantFamily, Object.values(CovenantFamily))) warn(ctx, `covenantFamily "${wireRule.covenantFamily}" not recognized - defaulted to QUALITATIVE_NEGATIVE_COVENANTS (verify manually)`);
    const ruleType = matchEnum(wireRule.ruleType, Object.values(ContractRuleType)) ?? "QUALITATIVE_OBLIGATION";
    if (!matchEnum(wireRule.ruleType, Object.values(ContractRuleType))) warn(ctx, `ruleType "${wireRule.ruleType}" not recognized - defaulted to QUALITATIVE_OBLIGATION (verify manually)`);
    const posture = matchEnum(wireRule.posture, Object.values(ContractRulePosture)) ?? "N_A";
    const action = wireRule.action ? matchEnum(wireRule.action, CONTRACT_ACTIONS) ?? "OTHER" : null;
    const capacityExpression = normalizeCapacityExpression(wireRule.capacityExpression, ctx);
    const conditions = wireRule.conditions.map((c, i) => normalizeCondition(c, ctx, i));
    // §17: the rule-level fields when the model supplied them; otherwise the entity-scope tags the rule's own
    // ENTITY_SCOPE_REFERENCE nodes already carry (deterministic, never invented).
    const scopeNodes = collectEntityScopeNodes([capacityExpression, ...conditions.map((c) => c.expression)]);
    // ENTITY-SCOPE GUARD §4 (replaces the former silent `matchEnum(...).filter(Boolean)` drop): every emitted tag is
    // classified RECOGNIZED/UNRECOGNIZED and audited; the guard below makes an unrecognized scope non-authoritative.
    const tagNorm = normalizeEntityTags({ entityScope: wireRule.entityScope, entityScopeExcluded: wireRule.entityScopeExcluded, nodeInclude: scopeNodes.include, nodeExclude: scopeNodes.exclude, nodeAudit: ctx.entityTagAudit });
    for (const u of tagNorm.tagNormalization) if (u.outcome === "UNRECOGNIZED_ENTITY_TAG" && (u.field === "entityScope" || u.field === "entityScopeExcluded")) warn(ctx, `ENTITY_SCOPE_UNRECOGNIZED_TAG: ${u.field} tag "${u.raw}" is not an EntityClassTag value - scope made non-authoritative, tag preserved in entityScopeAudit, not guessed`);
    const entityScope = tagNorm.entityScope;
    const entityScopeExcluded = tagNorm.entityScopeExcluded;
    const exceptions = wireRule.exceptions.map((e, i) => normalizeException(e, ctx, i, ruleId));
    const normalizedDependencies = wireRule.dependsOn.map((d, i) => normalizeDependency(d, ctx, i));
    const dependsOn = normalizedDependencies.flatMap((d) => ("resolved" in d ? [d.resolved] : []));
    const sourceDependencies = normalizedDependencies.flatMap((d) => ("source" in d ? [d.source] : []));
    // legacy readers: only the genuinely UNKNOWN references remain "unresolved"; resolved ones are first-class source dependencies
    const unresolvedDependencies: IRUnresolvedDependency[] = sourceDependencies.filter((d) => d.resolutionStatus === "DEPENDENCY_UNKNOWN").map((d) => ({ relationshipType: d.relationshipType, targetRef: d.exactSourceTargetRef, description: d.description, reason: `"${d.exactSourceTargetRef}" resolves to no structural node of this document - DEPENDENCY_UNKNOWN (review required), never guessed or dropped`, ...(d.inventoryItemIds ? { inventoryItemIds: d.inventoryItemIds } : {}) }));
    const inheritedAttributes: IRInheritedAttribute[] = [];
    if (posture === "PERMISSION" || ruleType === "QUANTITATIVE_PERMISSION") {
      for (const item of parentScopeItems) if (/\b(?:shall not|will not|may not|shall not permit|not permit)\b/i.test(item.excerptText)) { inheritedAttributes.push({ attribute: "governingProhibition", sourceAuthority: "PARENT_SCOPE", sourceSectionRef: item.normalizedRef, evidence: item.excerptText.slice(0, 240) }); break; }
    }

    const rawSufficiency = matchEnum(wireRule.sufficiency, SUFFICIENCY_VALUES) ?? "AMBIGUOUS";
    const consistent = enforceSufficiencyConsistency(rawSufficiency, wireRule.sufficiencyReasons, capacityExpression, input.operativeLineage);

    const rule: IRRule = {
      ruleId,
      irSchemaVersion: input.irSchemaVersion,
      companyId,
      instrumentKey,
      sourceDocumentId: documentId,
      sourceSectionRef: wireRule.sourceSectionRef,
      covenantFamily,
      ruleType,
      posture,
      action,
      entityScope,
      entityScopeExcluded,
      transactionScope: null,
      capacityExpression,
      conditions,
      exceptions,
      dependsOn,
      ...(unresolvedDependencies.length > 0 ? { unresolvedDependencies } : {}),
      ...(sourceDependencies.length > 0 ? { sourceDependencies } : {}),
      ...(inheritedAttributes.length > 0 ? { inheritedAttributes } : {}),
      operativeLineage: input.operativeLineage,
      sufficiency: consistent.sufficiency,
      sufficiencyReasons: [...consistent.reasons, ...(warnings.filter((w) => w.scope.startsWith(ctx.scopePath)).map((w) => w.message))],
      provenance: provenanceFor(ctx, wireRule.citation, wireRule.excerpt) ?? null,
      compilerVersion: input.compilerAlgorithmVersion,
      sourceContentVersion: null,
    };
    // ENTITY-SCOPE GUARD §5-§9: deterministic consistency check of the normalized scope against the rule's own bound
    // source (its excerpt, else the lead-in of the unit it cites). Removes false precision; never widens.
    const guarded = applyEntityScopeGuard(rule, entityScopeWitnessFor(rule, input.sourceContext?.regions ?? null, parentScopeItems.map((i) => i.excerptText)), tagNorm);
    if (guarded.entityScopeAudit?.witness.decidedBy === "PARENT_SCOPE") guarded.inheritedAttributes = [...(guarded.inheritedAttributes ?? []), { attribute: "entityScope", sourceAuthority: "PARENT_SCOPE", sourceSectionRef: parentScopeItems[0]?.normalizedRef ?? null, evidence: (parentScopeItems[0]?.excerptText ?? "").slice(0, 240) }];
    return withLineage(guarded, wireRule.inventoryItemIds);
  });
  // SEMANTIC FIDELITY §10/§11: model prose carried ON the unit (sufficiency reasons, condition/exception descriptions) may
  // not assert figures the candidate's own operative source never states - those are some target's economics. The figure
  // is redacted in the artifact and the raw prose kept as a non-authoritative diagnostic. Provenance excerpts are not
  // touched: a quoted excerpt the source lacks is the verifier's FABRICATED finding, not a redaction.
  const redact = (text: string, scope: string): string => {
    const figures = numericFiguresInProse(text);
    const unstated = figures.filter((f) => !figureStatedInText(f, input.operativeSourceText));
    if (unstated.length === 0) return text;
    dependencyProse.push({ scope, exactSourceTargetRef: null, modelProse: text, figuresInProse: figures, targetEconomicsExcluded: unstated });
    let out = text;
    for (const f of [...unstated].sort((a, b) => b.length - a.length)) out = out.split(f).join("[figure not stated by this unit's operative source; see dependency-prose diagnostics]");
    return out;
  };
  for (const rule of rules) {
    rule.sufficiencyReasons = rule.sufficiencyReasons.map((t, k) => redact(t, `rule[${rule.ruleId}].sufficiencyReasons[${k}]`));
    rule.conditions.forEach((c, k) => { c.description = redact(c.description, `rule[${rule.ruleId}].conditions[${k}].description`); });
    rule.exceptions.forEach((e, k) => { e.description = redact(e.description, `rule[${rule.ruleId}].exceptions[${k}].description`); e.conditions.forEach((c, q) => { c.description = redact(c.description, `rule[${rule.ruleId}].exceptions[${k}].conditions[${q}].description`); }); });
  }
  // SEMANTIC FIDELITY §5: ownership validation - a unit whose cited source the candidate does not own is quarantined.
  const ownedRules: IRRule[] = [];
  submission.rules.forEach((wireRule, i) => {
    const rule = rules[i]!;
    const decision = classifyUnitOwnership(wireRule.sourceSectionRef, ownershipScope);
    if (decision.ownership === "CONTEXT_ONLY_UNIT_EMISSION") {
      contextOnlyEmissions.push({ kind: "RULE", localRef: wireRule.localRef, unitId: rule.ruleId, sourceSectionRef: wireRule.sourceSectionRef, decision, unit: rule });
    } else ownedRules.push(rule);
  });

  const allDefinitions: IRDefinition[] = submission.definitions.map((wireDef) => {
    const ctx = baseCtx(`definition[${wireDef.localRef}]`);
    const covenantFamily = matchEnum(wireDef.covenantFamily, Object.values(CovenantFamily)) ?? "DEFINITIONS_CALCULATION_RULES";
    const calculationExpression = wireDef.calculationExpression ? normalizeExpression(wireDef.calculationExpression, ctx) : null;
    const rawSufficiency = matchEnum(wireDef.sufficiency, SUFFICIENCY_VALUES) ?? "AMBIGUOUS";
    const consistent = enforceSufficiencyConsistency(rawSufficiency, wireDef.sufficiencyReasons, calculationExpression, null);
    const definition: IRDefinition = {
      definitionId: computeDefinitionId(companyId, instrumentKey, wireDef.termName),
      irSchemaVersion: input.irSchemaVersion,
      companyId,
      instrumentKey,
      sourceDocumentId: documentId,
      termName: wireDef.termName,
      covenantFamily,
      calculationExpression,
      dependsOnTerms: wireDef.dependsOnTerms,
      sufficiency: consistent.sufficiency,
      sufficiencyReasons: [...consistent.reasons, ...warnings.filter((w) => w.scope.startsWith(ctx.scopePath)).map((w) => w.message)],
      provenance: provenanceFor(ctx, wireDef.citation, wireDef.excerpt) ?? null,
      compilerVersion: input.compilerAlgorithmVersion,
      sourceContentVersion: null,
    };
    return withLineage(definition, wireDef.inventoryItemIds);
  });
  // SEMANTIC FIDELITY §6: a definition is owned only when its defining text lies inside the candidate's operative source.
  const definitions: IRDefinition[] = [];
  submission.definitions.forEach((wireDef, i) => {
    const def = allDefinitions[i]!;
    const decision = classifyDefinitionOwnership(wireDef.termName, ownershipScope);
    if (decision.ownership === "CONTEXT_ONLY_UNIT_EMISSION") {
      contextOnlyEmissions.push({ kind: "DEFINITION", localRef: wireDef.localRef, unitId: def.definitionId, sourceSectionRef: null, decision, unit: def });
    } else definitions.push(def);
  });

  const sharedCapacities: IRSharedCapacity[] = submission.sharedCapacities.map((wireCap) => {
    const ctx = baseCtx(`sharedCap[${wireCap.localRef}]`);
    const capExpression = normalizeCapacityExpression(wireCap.capExpression, ctx) ?? unsupportedNode(ctx, "sharedCapacity capExpression missing or invalid", wireCap.capExpression);
    const memberRuleIds = wireCap.memberRefs.map(resolveRuleRef).filter((id): id is string => !!id);
    return withLineage(
      {
        sharedCapId: sharedCapIdByLocalRef.get(wireCap.localRef)!,
        companyId,
        instrumentKey,
        description: wireCap.description,
        capExpression,
        memberRuleIds,
        provenance: provenanceFor(ctx, wireCap.citation, wireCap.excerpt) ?? null,
        irSchemaVersion: input.irSchemaVersion,
        compilerVersion: input.compilerAlgorithmVersion,
        sourceContentVersion: null,
      },
      wireCap.inventoryItemIds
    );
  });

  // `?? []` - a hand-built SubmitCompilationInput (pre-existing fixtures/tests) may predate the inventoryDispositions field; tolerated, never a crash.
  // a shared capacity whose members were all quarantined is itself context-only
  const ownedRuleIds = new Set(ownedRules.map((r) => r.ruleId));
  const ownedCaps: IRSharedCapacity[] = [];
  submission.sharedCapacities.forEach((wireCap, i) => {
    const cap = sharedCapacities[i]!;
    const decision = classifyUnitOwnership(wireCap.citation, { ...ownershipScope });
    const membersOwned = cap.memberRuleIds.some((m) => ownedRuleIds.has(m));
    if (decision.ownership === "CONTEXT_ONLY_UNIT_EMISSION" && !membersOwned) {
      contextOnlyEmissions.push({ kind: "SHARED_CAPACITY", localRef: wireCap.localRef, unitId: cap.sharedCapId, sourceSectionRef: wireCap.citation ?? null, decision, unit: cap });
    } else ownedCaps.push(cap);
  });
  return { rules: ownedRules, definitions, sharedCapacities: ownedCaps, irExtensionCandidates: submission.irExtensionCandidates, inventoryDispositions: submission.inventoryDispositions ?? [], warnings, contextOnlyEmissions, dependencyProse };
}
