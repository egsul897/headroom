/**
 * Phase 4A definition / expression execution boundary.
 *
 * Product code may import THIS module — never `contract-model/runtime/*` —
 * to evaluate contractual definitions and build MetricInput fixtures.
 *
 * Capacity / transaction execution under REQUIRE remains `verified-execution.ts`.
 * Snapshot / ledger / selector remain `north-star-bridge.ts`.
 */

import type { IRDefinition, IRExpression } from "./ir/types";
import { evaluateExpression } from "./runtime/evaluate-expression";
import { fixtureInputResolver, metricInput } from "./runtime/input-resolver";
import { rationalFromString } from "./runtime/decimal";
import { money } from "./runtime/values";
import type { EvaluationResult, MetricInput } from "./runtime/types";

export type { EvaluationResult, MetricInput };
export { metricInput, rationalFromString, money };

/**
 * Evaluate a contractual IR expression with fixture metrics + definitions.
 * Does not invent values; does not claim PRODUCTION_AUTHORITY.
 */
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

/** Convenience: USD millions MetricInput for fixture / provisional packages. */
export function moneyMetricInput(
  key: string,
  millions: number,
  period: string,
  asOf: string,
  note: string,
): MetricInput {
  return metricInput(
    key,
    money(rationalFromString(String(millions)), "USD", {
      exprId: null,
      inputKeys: [key],
      rawSource: millions,
    }),
    { source: note, sourceVersion: asOf, note },
    period,
    asOf,
  );
}
