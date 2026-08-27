/**
 * Phase 3A - deterministic pretty-printer (task §46). A development/review
 * aid, NOT the final customer-explanation layer (that is Phase 7 product
 * work, out of scope here). Purely a function of the IR's own content -
 * two prints of the same rule are always byte-identical text.
 */
import type { IRCapacityExpression, IRCondition, IRException, IRExpression, IRRule } from "./types";

function money(amount: number, currency: string): string {
  const formatted = Math.abs(amount) >= 1000 ? amount.toLocaleString("en-US") : String(amount);
  return `${currency === "USD" ? "$" : currency + " "}${formatted}`;
}

export function printExpression(expr: IRExpression): string {
  switch (expr.kind) {
    case "MONEY":
      return money(expr.amount, expr.currency);
    case "NUMBER":
      return String(expr.value);
    case "PERCENT":
      return `${(expr.value * 100).toString()}%`;
    case "RATIO":
      return `${expr.value.toFixed(2)}x`;
    case "BOOLEAN_LITERAL":
      return String(expr.value);
    case "DATE_LITERAL":
      return expr.isoDate;
    case "METRIC_REFERENCE":
      return expr.metricName;
    case "DEFINED_TERM_REFERENCE":
      return expr.termName;
    case "RULE_REFERENCE":
      return `capacity(${expr.ruleId})`;
    case "LEDGER_USAGE_REFERENCE":
      return `usage(${expr.sharedCapId ?? expr.ruleId ?? "?"})`;
    case "TRANSACTION_INPUT_REFERENCE":
      return `input(${expr.inputName})`;
    case "ENTITY_SCOPE_REFERENCE":
      return `entities(${expr.scope.include.join(", ")}${expr.scope.exclude.length ? " except " + expr.scope.exclude.join(", ") : ""})`;
    case "ADD":
      return `(${expr.operands.map(printExpression).join(" + ")})`;
    case "SUBTRACT":
      return `(${printExpression(expr.left)} - ${printExpression(expr.right)})`;
    case "MULTIPLY":
      return `(${expr.operands.map(printExpression).join(" * ")})`;
    case "DIVIDE":
      return `(${printExpression(expr.numerator)} / ${printExpression(expr.denominator)})`;
    case "MAX":
      return `max(${expr.operands.map(printExpression).join(", ")})`;
    case "MIN":
      return `min(${expr.operands.map(printExpression).join(", ")})`;
    case "SUM":
      return `sum(${expr.operands.map(printExpression).join(", ")})`;
    case "COMPARE": {
      const opText: Record<string, string> = { GT: ">", GTE: ">=", LT: "<", LTE: "<=", EQ: "=" };
      return `${printExpression(expr.left)} ${opText[expr.operator]} ${printExpression(expr.right)}`;
    }
    case "AND":
      return `(${expr.operands.map(printExpression).join(" AND ")})`;
    case "OR":
      return `(${expr.operands.map(printExpression).join(" OR ")})`;
    case "NOT":
      return `NOT (${printExpression(expr.operand)})`;
    case "IF":
      return `if ${printExpression(expr.condition)} then ${printExpression(expr.then)}${expr.else ? " else " + printExpression(expr.else) : ""}`;
    case "AS_OF":
      return `${printExpression(expr.value)} as of ${typeof expr.asOfDate === "string" ? expr.asOfDate : printExpression(expr.asOfDate)}`;
    case "DURING_PERIOD":
      return `${printExpression(expr.value)} (${expr.periodDescription})`;
    case "SCHEDULE":
      return expr.cases.map((c) => `[${c.from ?? "-inf"}, ${c.to ?? "+inf"}): ${printExpression(c.value)}`).join("; ") + (expr.defaultValue ? `; default: ${printExpression(expr.defaultValue)}` : "");
    case "EVENT_ACTIVE":
      return `active(${expr.eventDescription}${expr.activeDuration ? ` for ${expr.activeDuration}` : ""})`;
    case "UNSUPPORTED":
      return `<UNSUPPORTED: ${expr.semanticDescription}>`;
  }
}

export function printCapacityExpression(capacity: IRCapacityExpression): string {
  if (capacity.kind === "UNLIMITED_CAPACITY") {
    return capacity.gatedBy ? `unlimited (subject to: ${printExpression(capacity.gatedBy)})` : "unlimited";
  }
  return printExpression(capacity);
}

function printCondition(c: IRCondition): string {
  if (c.referencesDefinitionId) return `${c.conditionType}: see ${c.referencesDefinitionId}`;
  if (c.expression) return `${c.conditionType}: ${printExpression(c.expression)}`;
  return `${c.conditionType}: ${c.description}`;
}

function printException(e: IRException): string {
  const conds = e.conditions.length ? ` (${e.conditions.map(printCondition).join("; ")})` : "";
  return `${e.description}${conds}`;
}

/** Renders one rule as a compact, human-readable block - the "review readability" aid task §46 asks for. */
export function printRule(rule: IRRule): string {
  const lines: string[] = [];
  lines.push(`${rule.posture}: ${rule.ruleType}${rule.action ? ` (${rule.action})` : ""}`);
  if (rule.entityScope.length > 0) lines.push(`Scope: ${rule.entityScope.join(", ")}${rule.entityScopeExcluded.length ? " except " + rule.entityScopeExcluded.join(", ") : ""}`);
  if (rule.capacityExpression) lines.push(`Amount: ${printCapacityExpression(rule.capacityExpression)}`);
  if (rule.conditions.length > 0) {
    lines.push("Conditions:");
    for (const c of rule.conditions) lines.push(`  - ${printCondition(c)}`);
  }
  if (rule.exceptions.length > 0) {
    lines.push("Exceptions:");
    for (const e of rule.exceptions) lines.push(`  - ${printException(e)}`);
  }
  if (rule.sourceSectionRef) lines.push(`Source: §${rule.sourceSectionRef}`);
  lines.push(`Sufficiency: ${rule.sufficiency}`);
  return lines.join("\n");
}
