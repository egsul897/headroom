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
import { UNSUPPORTED_TYPE, type IRCapacityExpression, type IRCondition, type IRDefinition, type IRException, type IRExpression, type IRRule, type IRRuleDependency, type IRSharedCapacity, type IRUnresolvedDependency, type IRValueType, type OperativeLineageRef, type RepresentationSufficiency, type SourceProvenance, type UnlimitedCapacity } from "../../ir/types";
import type { SubmitCompilationInput, WireCondition, WireDefinition, WireException, WireExpression, WireRule, WireSharedCapacity } from "./wire-schema";
import type { IRExtensionCandidate, SemanticCompilerInput } from "./types";

const IR_VALUE_TYPES: readonly IRValueType[] = ["MONEY", "NUMBER", "PERCENT", "RATIO", "BOOLEAN", "DATE", "DURATION", "PERIOD", "ENTITY_SET", "CAPACITY"];
const SUFFICIENCY_VALUES: readonly RepresentationSufficiency[] = ["COMPLETE", "PARTIAL", "AMBIGUOUS", "UNSUPPORTED", "MISSING_CONTEXT", "CONFLICTED"];
const ENTITY_CLASS_TAGS: readonly string[] = Object.values(EntityClassTag);

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
      const include = (wire.entityScopeInclude ?? []).map((t) => matchEnum(t, ENTITY_CLASS_TAGS)).filter((t): t is string => !!t);
      const exclude = (wire.entityScopeExclude ?? []).map((t) => matchEnum(t, ENTITY_CLASS_TAGS)).filter((t): t is string => !!t);
      return withExpressionId({ kind: "ENTITY_SCOPE_REFERENCE", type: "ENTITY_SET", scope: { include: include as EntityClassTag[], exclude: exclude as EntityClassTag[] } });
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
      const asOfDate = wire.asOfDate ?? "(unspecified)";
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

function normalizeCondition(wire: WireCondition, ctx: NormCtx, index: number): IRCondition {
  const conditionType = matchEnum(wire.conditionType, CONTRACT_CONDITION_TYPES) ?? "UNSUPPORTED";
  if (!matchEnum(wire.conditionType, CONTRACT_CONDITION_TYPES)) warn(ctx, `condition[${index}].conditionType "${wire.conditionType}" not recognized - normalized to UNSUPPORTED`);
  const prov = provenanceFor(ctx, wire.citation, wire.excerpt) ?? null;
  return withLineage(
    {
      conditionId: `${ctx.scopePath}.condition[${index}]`,
      conditionType,
      expression: wire.expression ? normalizeExpression(wire.expression, childCtx(ctx, wire.expression, `condition[${index}].expression`), "BOOLEAN") : null,
      referencesDefinitionId: wire.referencesDefinitionId,
      description: wire.description,
      provenance: prov,
    },
    wire.inventoryItemIds
  );
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
function normalizeDependency(wire: WireRule["dependsOn"][number], ctx: NormCtx, index: number): { resolved: IRRuleDependency } | { unresolved: IRUnresolvedDependency } {
  const relationshipType = matchEnum(wire.relationshipType, Object.values(ContractRuleRelationshipType));
  const finalType = relationshipType ?? "REQUIRES";
  if (!relationshipType) warn(ctx, `dependsOn[${index}].relationshipType "${wire.relationshipType}" not recognized - defaulted to REQUIRES`);
  const targetRuleId = ctx.resolveRuleRef(wire.targetRef);
  if (!targetRuleId) {
    const reason = `dependsOn[${index}].targetRef "${wire.targetRef}" is not a rule in this compilation unit - preserved as an unresolved cross-unit dependency (review required), never guessed or dropped`;
    warn(ctx, reason);
    return { unresolved: withLineage({ relationshipType: finalType, targetRef: wire.targetRef, description: wire.description, reason }, wire.inventoryItemIds) };
  }
  return { resolved: withLineage({ relationshipType: finalType, targetRuleId, description: wire.description }, wire.inventoryItemIds) };
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

  const baseCtx = (scopePath: string): NormCtx => ({ companyId, instrumentKey, documentId, inheritedCitation: input.sourceSectionRef ? `§${input.sourceSectionRef}` : null, warnings, scopePath, resolveRuleRef, resolveSharedCapRef });

  const rules: IRRule[] = submission.rules.map((wireRule) => {
    const ctx = baseCtx(`rule[${wireRule.localRef}]`);
    const ruleId = ruleIdByLocalRef.get(wireRule.localRef)!;
    const covenantFamily = matchEnum(wireRule.covenantFamily, Object.values(CovenantFamily)) ?? "QUALITATIVE_NEGATIVE_COVENANTS";
    if (!matchEnum(wireRule.covenantFamily, Object.values(CovenantFamily))) warn(ctx, `covenantFamily "${wireRule.covenantFamily}" not recognized - defaulted to QUALITATIVE_NEGATIVE_COVENANTS (verify manually)`);
    const ruleType = matchEnum(wireRule.ruleType, Object.values(ContractRuleType)) ?? "QUALITATIVE_OBLIGATION";
    if (!matchEnum(wireRule.ruleType, Object.values(ContractRuleType))) warn(ctx, `ruleType "${wireRule.ruleType}" not recognized - defaulted to QUALITATIVE_OBLIGATION (verify manually)`);
    const posture = matchEnum(wireRule.posture, Object.values(ContractRulePosture)) ?? "N_A";
    const action = wireRule.action ? matchEnum(wireRule.action, CONTRACT_ACTIONS) ?? "OTHER" : null;
    const entityScope = (wireRule.entityScope ?? []).map((t) => matchEnum(t, ENTITY_CLASS_TAGS)).filter((t): t is string => !!t) as EntityClassTag[];
    const entityScopeExcluded = (wireRule.entityScopeExcluded ?? []).map((t) => matchEnum(t, ENTITY_CLASS_TAGS)).filter((t): t is string => !!t) as EntityClassTag[];

    const capacityExpression = normalizeCapacityExpression(wireRule.capacityExpression, ctx);
    const conditions = wireRule.conditions.map((c, i) => normalizeCondition(c, ctx, i));
    const exceptions = wireRule.exceptions.map((e, i) => normalizeException(e, ctx, i, ruleId));
    const normalizedDependencies = wireRule.dependsOn.map((d, i) => normalizeDependency(d, ctx, i));
    const dependsOn = normalizedDependencies.flatMap((d) => ("resolved" in d ? [d.resolved] : []));
    const unresolvedDependencies = normalizedDependencies.flatMap((d) => ("unresolved" in d ? [d.unresolved] : []));

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
      operativeLineage: input.operativeLineage,
      sufficiency: consistent.sufficiency,
      sufficiencyReasons: [...consistent.reasons, ...(warnings.filter((w) => w.scope.startsWith(ctx.scopePath)).map((w) => w.message))],
      provenance: provenanceFor(ctx, wireRule.citation, wireRule.excerpt) ?? null,
      compilerVersion: input.compilerAlgorithmVersion,
      sourceContentVersion: null,
    };
    return withLineage(rule, wireRule.inventoryItemIds);
  });

  const definitions: IRDefinition[] = submission.definitions.map((wireDef) => {
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
      },
      wireCap.inventoryItemIds
    );
  });

  // `?? []` - a hand-built SubmitCompilationInput (pre-existing fixtures/tests) may predate the inventoryDispositions field; tolerated, never a crash.
  return { rules, definitions, sharedCapacities, irExtensionCandidates: submission.irExtensionCandidates, inventoryDispositions: submission.inventoryDispositions ?? [], warnings };
}
