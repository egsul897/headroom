/**
 * Phase 3C Layer 1b - IR-side canonicalized semantic inventory (task §10).
 * Walks a proposed IRRule/IRDefinition's own expression tree, preserving
 * enough AST path/context information that a MONEY(50_000_000) inside
 * MAX($50M, 15% EBITDA) is distinguishable from an unconditional,
 * independently-operative MONEY(50_000_000) basket (isAlternativeWithinSelection).
 * Operates purely on the already-compiled IR objects - never re-derives or
 * re-interprets source text (that is source-inventory.ts's job).
 */
import type { IRCondition, IRDefinition, IRException, IRExpression, IRRule } from "../../ir/types";
import { hashParts } from "../hashing";
import type { IrInventory, IrInventoryItem, IrInventoryItemKind } from "./types";

export const IR_INVENTORY_ALGORITHM_VERSION = "phase-3c-ir-inventory.v1";

interface WalkCtx {
  candidateRef: string;
  ruleOrDefinitionId: string;
  items: IrInventoryItem[];
}

function pushItem(ctx: WalkCtx, kind: IrInventoryItemKind, irPath: string, numericValue: number | null, textValue: string | null, isAlternative: boolean, sourceCitation: string | null, sourceExcerpt: string | null): void {
  ctx.items.push({
    itemId: hashParts([ctx.candidateRef, ctx.ruleOrDefinitionId, irPath, kind, String(numericValue), textValue ?? "", IR_INVENTORY_ALGORITHM_VERSION]),
    kind,
    ruleOrDefinitionId: ctx.ruleOrDefinitionId,
    irPath,
    numericValue,
    textValue,
    isAlternativeWithinSelection: isAlternative,
    sourceCitation,
    sourceExcerpt,
  });
}

function walkExpression(ctx: WalkCtx, expr: IRExpression | null, path: string, isAlternative: boolean): void {
  if (!expr) return;
  const citation = expr.provenance?.sourceCitation ?? null;
  const excerpt = expr.provenance?.excerpt ?? null;

  switch (expr.kind) {
    case "MONEY":
      pushItem(ctx, "AMOUNT", path, expr.amount, null, isAlternative, citation, excerpt);
      return;
    case "NUMBER":
      pushItem(ctx, "AMOUNT", path, expr.value, null, isAlternative, citation, excerpt);
      return;
    case "PERCENT":
      pushItem(ctx, "PERCENT", path, expr.value, null, isAlternative, citation, excerpt);
      return;
    case "RATIO":
      pushItem(ctx, "RATIO", path, expr.value, null, isAlternative, citation, excerpt);
      return;
    case "METRIC_REFERENCE":
      pushItem(ctx, "METRIC_REFERENCE", path, null, expr.metricName, isAlternative, citation, excerpt);
      return;
    case "DEFINED_TERM_REFERENCE":
      pushItem(ctx, "DEFINED_TERM_REFERENCE", path, null, expr.termName, isAlternative, citation, excerpt);
      return;
    case "RULE_REFERENCE":
      pushItem(ctx, "DEPENDENCY", path, null, `RULE_REFERENCE:${expr.ruleId}`, isAlternative, citation, excerpt);
      return;
    case "LEDGER_USAGE_REFERENCE":
      pushItem(ctx, "SHARED_CAP_RELATIONSHIP", path, null, expr.sharedCapId ?? expr.ruleId, isAlternative, citation, excerpt);
      return;
    case "TRANSACTION_INPUT_REFERENCE":
      pushItem(ctx, "DEPENDENCY", path, null, `TRANSACTION_INPUT:${expr.inputName}`, isAlternative, citation, excerpt);
      return;
    case "ENTITY_SCOPE_REFERENCE":
      pushItem(ctx, "ENTITY_SCOPE", path, null, JSON.stringify(expr.scope), isAlternative, citation, excerpt);
      return;
    case "BOOLEAN_LITERAL":
    case "DATE_LITERAL":
      return; // no numeric/textual reconciliation signal of interest
    case "ADD":
    case "SUM":
    case "MULTIPLY":
      expr.operands.forEach((op, i) => walkExpression(ctx, op, `${path}.operands[${i}]`, isAlternative));
      return;
    case "MAX":
    case "MIN":
      // MAX/MIN are alternative-SELECTION constructs (task §10's own example) - every operand is
      // a candidate value, only one of which is ever actually selected at evaluation time.
      expr.operands.forEach((op, i) => walkExpression(ctx, op, `${path}.operands[${i}]`, true));
      return;
    case "SUBTRACT":
      walkExpression(ctx, expr.left, `${path}.left`, isAlternative);
      walkExpression(ctx, expr.right, `${path}.right`, isAlternative);
      return;
    case "DIVIDE":
      walkExpression(ctx, expr.numerator, `${path}.numerator`, isAlternative);
      walkExpression(ctx, expr.denominator, `${path}.denominator`, isAlternative);
      return;
    case "COMPARE":
      // Phase 3F.1.6.R Workstream D (BLOCKER-9 fix). A COMPARE node is a
      // real, semantically-operative qualifying condition wherever it
      // appears in the tree - not only when the compiler happens to have
      // also duplicated it into rule.conditions[]/IRException.conditions[]
      // (walkCondition/walkException below). The most common real-world
      // counter-example: a ratio-gated UNLIMITED_CAPACITY permission ("may
      // pay dividends so long as the Leverage Ratio does not exceed 4.00 to
      // 1.00") is correctly represented entirely inside
      // capacityExpression.gatedBy, with rule.conditions[] legitimately
      // empty - before this fix that left irConditionOrExceptionCount at 0
      // for a rule that in fact fully and correctly represents its source
      // condition, which is exactly the false-positive
      // reconciliation.ts's buildAggregateSignals must not raise (task
      // §28). Marking every COMPARE node (also reached via IF.condition,
      // EVENT_ACTIVE.triggerCondition, and AND/OR combinations of these)
      // as its own CONDITION item makes "does the IR represent a
      // qualifying condition anywhere" match what is actually true of the
      // compiled semantics, not merely one particular storage location for
      // it.
      pushItem(ctx, "CONDITION", path, null, `COMPARE:${expr.operator}`, isAlternative, citation, excerpt);
      walkExpression(ctx, expr.left, `${path}.left`, isAlternative);
      walkExpression(ctx, expr.right, `${path}.right`, isAlternative);
      return;
    case "AND":
    case "OR":
      expr.operands.forEach((op, i) => walkExpression(ctx, op, `${path}.operands[${i}]`, isAlternative));
      return;
    case "NOT":
      walkExpression(ctx, expr.operand, `${path}.operand`, isAlternative);
      return;
    case "IF":
      walkExpression(ctx, expr.condition, `${path}.condition`, isAlternative);
      // then/else are mutually exclusive outcomes - only one is ever actually operative for a
      // given evaluation, the same "not simultaneously all true" property MAX/MIN have.
      walkExpression(ctx, expr.then, `${path}.then`, true);
      if (expr.else) walkExpression(ctx, expr.else, `${path}.else`, true);
      return;
    case "AS_OF":
      walkExpression(ctx, expr.value, `${path}.value`, isAlternative);
      return;
    case "DURING_PERIOD":
      walkExpression(ctx, expr.value, `${path}.value`, isAlternative);
      return;
    case "SCHEDULE":
      expr.cases.forEach((c, i) => walkExpression(ctx, c.value, `${path}.cases[${i}].value`, true));
      if (expr.defaultValue) walkExpression(ctx, expr.defaultValue, `${path}.defaultValue`, true);
      return;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) walkExpression(ctx, expr.triggerCondition, `${path}.triggerCondition`, isAlternative);
      return;
    case "UNSUPPORTED":
      pushItem(ctx, "UNSUPPORTED_MARKER", path, null, expr.semanticDescription, isAlternative, citation, excerpt);
      return;
    default: {
      // Exhaustiveness guard: a future new IRExpression kind must be handled explicitly here
      // rather than silently falling through unwalked - a compile error is the correct failure
      // mode (Architecture Invariants #9's "unsupported semantics must be surfaced, not coerced"
      // applies to this walker's own completeness too).
      const _exhaustive: never = expr;
      throw new Error(`ir-inventory.ts: unhandled IRExpression kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function walkCondition(ctx: WalkCtx, condition: IRCondition, path: string): void {
  pushItem(ctx, "CONDITION", path, null, condition.description || condition.conditionType, false, condition.provenance?.sourceCitation ?? null, condition.provenance?.excerpt ?? null);
  if (condition.expression) walkExpression(ctx, condition.expression, `${path}.expression`, false);
}

function walkException(ctx: WalkCtx, exception: IRException, path: string): void {
  pushItem(ctx, "EXCEPTION", path, null, exception.description, false, exception.provenance?.sourceCitation ?? null, exception.provenance?.excerpt ?? null);
  exception.conditions.forEach((c, i) => walkCondition(ctx, c, `${path}.conditions[${i}]`));
}

function walkRule(candidateRef: string, rule: IRRule, rulePath: string): IrInventoryItem[] {
  const ctx: WalkCtx = { candidateRef, ruleOrDefinitionId: rule.ruleId, items: [] };
  const ruleCitation = rule.provenance?.sourceCitation ?? null;
  const ruleExcerpt = rule.provenance?.excerpt ?? null;

  if (rule.action) pushItem(ctx, "ACTION", `${rulePath}.action`, null, rule.action, false, ruleCitation, ruleExcerpt);
  pushItem(ctx, "POSTURE", `${rulePath}.posture`, null, rule.posture, false, ruleCitation, ruleExcerpt);

  if (rule.entityScope.length > 0 || rule.entityScopeExcluded.length > 0) {
    pushItem(ctx, "ENTITY_SCOPE", `${rulePath}.entityScope`, null, JSON.stringify({ include: rule.entityScope, exclude: rule.entityScopeExcluded }), false, ruleCitation, ruleExcerpt);
  }

  rule.conditions.forEach((c, i) => walkCondition(ctx, c, `${rulePath}.conditions[${i}]`));
  rule.exceptions.forEach((e, i) => walkException(ctx, e, `${rulePath}.exceptions[${i}]`));
  rule.dependsOn.forEach((d, i) => pushItem(ctx, "DEPENDENCY", `${rulePath}.dependsOn[${i}]`, null, `${d.relationshipType}:${d.targetRuleId}`, false, null, null));

  if (rule.capacityExpression) {
    if (rule.capacityExpression.kind === "UNLIMITED_CAPACITY") {
      pushItem(ctx, "UNLIMITED_CAPACITY_MARKER", `${rulePath}.capacityExpression`, null, null, false, rule.capacityExpression.provenance?.sourceCitation ?? null, rule.capacityExpression.provenance?.excerpt ?? null);
      if (rule.capacityExpression.gatedBy) walkExpression(ctx, rule.capacityExpression.gatedBy, `${rulePath}.capacityExpression.gatedBy`, false);
    } else {
      walkExpression(ctx, rule.capacityExpression, `${rulePath}.capacityExpression`, false);
    }
  }

  return ctx.items;
}

function walkDefinition(candidateRef: string, definition: IRDefinition, defPath: string): IrInventoryItem[] {
  const ctx: WalkCtx = { candidateRef, ruleOrDefinitionId: definition.definitionId, items: [] };
  definition.dependsOnTerms.forEach((term, i) => pushItem(ctx, "DEPENDENCY", `${defPath}.dependsOnTerms[${i}]`, null, `DEFINED_TERM:${term}`, false, null, null));
  if (definition.calculationExpression) walkExpression(ctx, definition.calculationExpression, `${defPath}.calculationExpression`, false);
  return ctx.items;
}

export function buildIrInventory(candidateRef: string, rules: IRRule[], definitions: IRDefinition[]): IrInventory {
  const items: IrInventoryItem[] = [];
  rules.forEach((rule, i) => items.push(...walkRule(candidateRef, rule, `rules[${i}]`)));
  definitions.forEach((def, i) => items.push(...walkDefinition(candidateRef, def, `definitions[${i}]`)));

  return {
    candidateRef,
    items,
    ruleCount: rules.length,
    definitionCount: definitions.length,
    inventoryAlgorithmVersion: IR_INVENTORY_ALGORITHM_VERSION,
  };
}
