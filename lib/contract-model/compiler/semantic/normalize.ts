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
import { inferType } from "../../ir/type-check";
import { UNSUPPORTED_TYPE, type IRCapacityExpression, type IRCondition, type IRDefinition, type IRException, type IRExpression, type IRRule, type IRRuleDependency, type IRSharedCapacity, type IRValueType, type OperativeLineageRef, type RepresentationSufficiency, type SourceProvenance } from "../../ir/types";
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
 */
function buildComposite(ctx: NormCtx, kind: string, fields: Record<string, unknown>, placeholderType: string, wire: WireExpression, prov: SourceProvenance | undefined, unsupportedMessage: string): IRExpression {
  const draft = { kind, type: placeholderType, exprId: "", ...fields, provenance: prov } as unknown as IRExpression;
  const computed = inferType(draft);
  if (computed === UNSUPPORTED_TYPE) {
    // Preserve the fully-assembled attempt (every sibling operand that DID
    // successfully normalize/type-check, exprId'd and all) as a diagnostic
    // sidecar rather than discarding it - this composite's OWN top-level
    // value genuinely cannot be typed/executed (that verdict is correct and
    // unchanged), but completeness-checking and review must still be able
    // to see which specific operand(s) caused it, not just an opaque blob.
    const attempted = withExpressionId({ ...(draft as unknown as Record<string, unknown>), type: placeholderType } as unknown as IRExpression);
    return unsupportedNode(ctx, unsupportedMessage, wire, prov, attempted);
  }
  return withExpressionId({ ...(draft as unknown as Record<string, unknown>), type: computed } as unknown as IRExpression);
}

export function normalizeExpression(wire: WireExpression | null | undefined, ctx: NormCtx): IRExpression {
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
      const valueType = (matchEnum(wire.valueType, ["MONEY", "RATIO", "NUMBER"] as const) ?? "MONEY") as "MONEY" | "RATIO" | "NUMBER";
      if (wire.valueType && !matchEnum(wire.valueType, ["MONEY", "RATIO", "NUMBER"] as const)) warn(ctx, `METRIC_REFERENCE "${wire.metricName}" had unrecognized valueType "${wire.valueType}" - defaulted to MONEY`);
      return withExpressionId({ kind: "METRIC_REFERENCE", type: valueType, metricName: wire.metricName, companyId: ctx.companyId, instrumentKey: ctx.instrumentKey, resolvedDefinitionId: null });
    }
    case "DEFINED_TERM_REFERENCE": {
      if (!wire.termName) return unsupportedNode(ctx, "DEFINED_TERM_REFERENCE node missing termName", wire, prov);
      const valueType = (matchEnum(wire.valueType, IR_VALUE_TYPES) ?? "MONEY") as IRValueType;
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
      const valueType = (matchEnum(wire.valueType, IR_VALUE_TYPES) ?? "MONEY") as IRValueType;
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
      const operands = wireOperands.map((o, i) => normalizeExpression(o, childCtx(ctx, wire, `${wire.kind}[${i}]`)));
      return buildComposite(ctx, wire.kind, { operands }, wire.kind === "AND" || wire.kind === "OR" ? "BOOLEAN" : "NUMBER", wire, prov, `${wire.kind} operands do not type-check together under the IR's own composition rules`);
    }
    case "SUBTRACT":
    case "DIVIDE": {
      const leftKey = wire.kind === "DIVIDE" ? "numerator" : "left";
      const rightKey = wire.kind === "DIVIDE" ? "denominator" : "right";
      const leftWire = wire.kind === "DIVIDE" ? wire.numerator : wire.left;
      const rightWire = wire.kind === "DIVIDE" ? wire.denominator : wire.right;
      if (!leftWire || !rightWire) return unsupportedNode(ctx, `${wire.kind} requires both operands`, wire, prov);
      const left = normalizeExpression(leftWire, childCtx(ctx, wire, `${wire.kind}.${leftKey}`));
      const right = normalizeExpression(rightWire, childCtx(ctx, wire, `${wire.kind}.${rightKey}`));
      return buildComposite(ctx, wire.kind, { [leftKey]: left, [rightKey]: right }, wire.kind === "DIVIDE" ? "NUMBER" : "NUMBER", wire, prov, `${wire.kind} operands do not type-check together`);
    }
    case "COMPARE": {
      if (!wire.left || !wire.right) return unsupportedNode(ctx, "COMPARE requires both left and right operands", wire, prov);
      const operator = matchEnum(wire.operator, ["GT", "GTE", "LT", "LTE", "EQ"] as const) ?? "EQ";
      if (!wire.operator || !matchEnum(wire.operator, ["GT", "GTE", "LT", "LTE", "EQ"] as const)) warn(ctx, `COMPARE had unrecognized operator "${wire.operator}" - defaulted to EQ`);
      const left = normalizeExpression(wire.left, childCtx(ctx, wire, "COMPARE.left"));
      const right = normalizeExpression(wire.right, childCtx(ctx, wire, "COMPARE.right"));
      return buildComposite(ctx, "COMPARE", { left, operator, right }, "BOOLEAN", wire, prov, "COMPARE operands are not the same type");
    }
    case "NOT": {
      if (!wire.operand) return unsupportedNode(ctx, "NOT requires an operand", wire, prov);
      const operand = normalizeExpression(wire.operand, childCtx(ctx, wire, "NOT.operand"));
      return buildComposite(ctx, "NOT", { operand }, "BOOLEAN", wire, prov, "NOT operand is not BOOLEAN");
    }
    case "IF": {
      if (!wire.condition || !wire.then) return unsupportedNode(ctx, "IF requires condition and then", wire, prov);
      const condition = normalizeExpression(wire.condition, childCtx(ctx, wire, "IF.condition"));
      const thenExpr = normalizeExpression(wire.then, childCtx(ctx, wire, "IF.then"));
      const elseExpr = wire.else ? normalizeExpression(wire.else, childCtx(ctx, wire, "IF.else")) : null;
      return buildComposite(ctx, "IF", { condition, then: thenExpr, else: elseExpr }, "BOOLEAN", wire, prov, "IF condition must be BOOLEAN and both branches must resolve to the same type");
    }
    case "AS_OF": {
      // AS_OF's own value is carried on the generic `operand` field (the same field NOT/DURING_PERIOD use for their single child) rather than a dedicated one - one fewer field for the model to learn.
      const valueWire = wire.operand;
      if (!valueWire) return unsupportedNode(ctx, "AS_OF requires an operand (the value being dated)", wire, prov);
      const value = normalizeExpression(valueWire, childCtx(ctx, wire, "AS_OF.value"));
      const asOfDate = wire.asOfDate ?? "(unspecified)";
      return buildComposite(ctx, "AS_OF", { value, asOfDate }, "RATIO", wire, prov, "AS_OF value type could not be determined");
    }
    case "DURING_PERIOD": {
      if (!wire.operand) return unsupportedNode(ctx, "DURING_PERIOD requires an operand (the value being period-scoped)", wire, prov);
      const value = normalizeExpression(wire.operand, childCtx(ctx, wire, "DURING_PERIOD.value"));
      return buildComposite(ctx, "DURING_PERIOD", { value, periodDescription: wire.periodDescription ?? "(unspecified period)" }, "RATIO", wire, prov, "DURING_PERIOD value type could not be determined");
    }
    case "SCHEDULE": {
      const wireCases = wire.cases ?? [];
      if (wireCases.length === 0) return unsupportedNode(ctx, "SCHEDULE requires at least one case", wire, prov);
      const cases = wireCases.map((c, i) => ({ from: c.from, to: c.to, description: c.description, value: normalizeExpression(c.value, childCtx(ctx, wire, `SCHEDULE.cases[${i}]`)) }));
      const defaultValue = wire.defaultValue ? normalizeExpression(wire.defaultValue, childCtx(ctx, wire, "SCHEDULE.defaultValue")) : null;
      return buildComposite(ctx, "SCHEDULE", { cases, defaultValue }, "RATIO", wire, prov, "SCHEDULE cases (and defaultValue, if set) do not all resolve to the same type");
    }
    case "EVENT_ACTIVE": {
      const triggerCondition = wire.triggerCondition ? normalizeExpression(wire.triggerCondition, childCtx(ctx, wire, "EVENT_ACTIVE.triggerCondition")) : null;
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
    const gatedBy = wire.gatedBy ? normalizeExpression(wire.gatedBy, childCtx(ctx, wire, "UNLIMITED_CAPACITY.gatedBy")) : null;
    if (gatedBy && inferType(gatedBy) !== "BOOLEAN" && inferType(gatedBy) !== UNSUPPORTED_TYPE) {
      warn(ctx, "UnlimitedCapacity.gatedBy did not resolve to BOOLEAN - kept as-is for validate.ts to flag structurally");
    }
    return { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy, provenance: prov };
  }
  return normalizeExpression(wire, ctx);
}

function normalizeCondition(wire: WireCondition, ctx: NormCtx, index: number): IRCondition {
  const conditionType = matchEnum(wire.conditionType, CONTRACT_CONDITION_TYPES) ?? "UNSUPPORTED";
  if (!matchEnum(wire.conditionType, CONTRACT_CONDITION_TYPES)) warn(ctx, `condition[${index}].conditionType "${wire.conditionType}" not recognized - normalized to UNSUPPORTED`);
  const prov = provenanceFor(ctx, wire.citation, wire.excerpt) ?? null;
  return {
    conditionId: `${ctx.scopePath}.condition[${index}]`,
    conditionType,
    expression: wire.expression ? normalizeExpression(wire.expression, childCtx(ctx, wire.expression, `condition[${index}].expression`)) : null,
    referencesDefinitionId: wire.referencesDefinitionId,
    description: wire.description,
    provenance: prov,
  };
}

function normalizeException(wire: WireException, ctx: NormCtx, index: number, appliesToRuleId: string): IRException {
  const prov = provenanceFor(ctx, wire.citation, wire.excerpt) ?? null;
  const permissionRuleId = wire.permissionRef ? ctx.resolveRuleRef(wire.permissionRef) : null;
  if (wire.permissionRef && !permissionRuleId) warn(ctx, `exception[${index}].permissionRef "${wire.permissionRef}" did not resolve to any rule in this compilation attempt`);
  return {
    exceptionId: `${ctx.scopePath}.exception[${index}]`,
    appliesToRuleId,
    description: wire.description,
    permissionRuleId,
    conditions: wire.conditions.map((c, i) => normalizeCondition(c, ctx, i)),
    provenance: prov,
  };
}

function normalizeDependency(wire: WireRule["dependsOn"][number], ctx: NormCtx, index: number): IRRuleDependency | null {
  const relationshipType = matchEnum(wire.relationshipType, Object.values(ContractRuleRelationshipType));
  const finalType = relationshipType ?? "REQUIRES";
  if (!relationshipType) warn(ctx, `dependsOn[${index}].relationshipType "${wire.relationshipType}" not recognized - defaulted to REQUIRES`);
  const targetRuleId = ctx.resolveRuleRef(wire.targetRef);
  if (!targetRuleId) {
    warn(ctx, `dependsOn[${index}].targetRef "${wire.targetRef}" did not resolve - dependency dropped rather than left dangling`);
    return null;
  }
  return { relationshipType: finalType, targetRuleId, description: wire.description };
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
    const dependsOn = wireRule.dependsOn.map((d, i) => normalizeDependency(d, ctx, i)).filter((d): d is IRRuleDependency => d !== null);

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
      operativeLineage: input.operativeLineage,
      sufficiency: consistent.sufficiency,
      sufficiencyReasons: [...consistent.reasons, ...(warnings.filter((w) => w.scope.startsWith(ctx.scopePath)).map((w) => w.message))],
      provenance: provenanceFor(ctx, wireRule.citation, wireRule.excerpt) ?? null,
      compilerVersion: input.compilerAlgorithmVersion,
      sourceContentVersion: null,
    };
    return rule;
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
    return definition;
  });

  const sharedCapacities: IRSharedCapacity[] = submission.sharedCapacities.map((wireCap) => {
    const ctx = baseCtx(`sharedCap[${wireCap.localRef}]`);
    const capExpression = normalizeCapacityExpression(wireCap.capExpression, ctx) ?? unsupportedNode(ctx, "sharedCapacity capExpression missing or invalid", wireCap.capExpression);
    const memberRuleIds = wireCap.memberRefs.map(resolveRuleRef).filter((id): id is string => !!id);
    return {
      sharedCapId: sharedCapIdByLocalRef.get(wireCap.localRef)!,
      companyId,
      instrumentKey,
      description: wireCap.description,
      capExpression,
      memberRuleIds,
      provenance: provenanceFor(ctx, wireCap.citation, wireCap.excerpt) ?? null,
    };
  });

  return { rules, definitions, sharedCapacities, irExtensionCandidates: submission.irExtensionCandidates, warnings };
}
