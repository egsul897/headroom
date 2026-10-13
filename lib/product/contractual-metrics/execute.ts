/**
 * Execute contractual definitions / ratios through Phase 4A evaluateExpression.
 */

import type { IRDefinition, IRExpression } from "@/lib/contract-model/ir/types";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { fixtureInputResolver } from "@/lib/contract-model/runtime/input-resolver";
import type { EvaluationResult, MetricInput } from "@/lib/contract-model/runtime/types";

export function executeContractualExpression(args: {
  expression: IRExpression;
  definitions: IRDefinition[];
  metrics: MetricInput[];
  companyId: string;
  instrumentKey: string;
  definitionId?: string;
  asOf: string;
}): EvaluationResult {
  const inputs = fixtureInputResolver({
    metrics: args.metrics,
    definitions: args.definitions,
  });
  return evaluateExpression({
    expression: args.expression,
    inputs,
    context: {
      companyId: args.companyId,
      instrumentKey: args.instrumentKey,
      definitionId: args.definitionId,
      asOf: args.asOf,
      unitId: args.definitionId ?? null,
    },
  });
}

/** Parse Phase 4A canonical numeric strings (decimal or exact fraction "a/b"). */
function numberFromCanonical(text: string): number | null {
  const t = text.trim();
  if (t.includes("/")) {
    const [num, den] = t.split("/");
    if (num == null || den == null) return null;
    const n = Number(num);
    const d = Number(den);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return n / d;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Extract a finite number from an EvaluationResult (USD millions or ratio). */
export function numericFromEvaluation(ev: EvaluationResult): number | null {
  if (ev.status !== "EXECUTABLE" || !ev.value) return null;
  const v = ev.value;
  let text: string | null = null;
  if (v.type === "MONEY") text = v.amount;
  else if (v.type === "NUMBER" || v.type === "RATIO") text = v.value;
  else if (v.type === "PERCENT") text = v.fraction;
  if (text == null) return null;
  return numberFromCanonical(text);
}
