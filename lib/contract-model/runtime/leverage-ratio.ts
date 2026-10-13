/**
 * Contractual leverage / coverage ratio evaluation boundary.
 *
 * Generic DIVIDE remains unchanged. This helper refuses non-positive
 * denominators for leverage/coverage tests only.
 */
import type { IRExpression } from "../ir/types";
import { evaluateExpression, type EvaluateExpressionArgs } from "./evaluate-expression";
import type { EvaluationResult, SerializedRuntimeValue } from "./types";
import * as R from "./decimal";

export type LeverageRatioKind = "LEVERAGE" | "COVERAGE";

function serializedNumeric(v: SerializedRuntimeValue | null): R.Rational | null {
  if (!v) return null;
  const raw =
    v.type === "MONEY"
      ? v.amount
      : v.type === "NUMBER" || v.type === "RATIO"
        ? v.value
        : v.type === "PERCENT"
          ? v.fraction
          : null;
  if (raw == null) return null;
  try {
    if (raw.includes("/")) {
      const [num, den] = raw.split("/");
      if (!num || !den) return null;
      return R.rational(BigInt(num), BigInt(den));
    }
    return R.rationalFromString(raw);
  } catch {
    return null;
  }
}

function isNonPositiveSerialized(v: SerializedRuntimeValue | null): boolean {
  const n = serializedNumeric(v);
  if (n === null) return true;
  return R.compare(n, R.ZERO) <= 0;
}

/**
 * Evaluate a DIVIDE expression as a leverage or coverage ratio.
 * If the denominator is ≤ 0 (after successful evaluation of both sides),
 * returns ERROR with NON_POSITIVE_DENOMINATOR — never a negative/zero ratio.
 */
export function evaluateLeverageOrCoverageRatio(
  args: EvaluateExpressionArgs & { ratioKind: LeverageRatioKind },
): EvaluationResult {
  const { expression, ratioKind, ...rest } = args;
  if (expression.kind !== "DIVIDE") {
    return evaluateExpression({ expression, ...rest });
  }

  const den = evaluateExpression({ expression: expression.denominator, ...rest });
  if (den.status === "EXECUTABLE" && isNonPositiveSerialized(den.value)) {
    const full = evaluateExpression({ expression, ...rest });
    return {
      ...full,
      status: "ERROR",
      value: null,
      diagnostics: [
        ...full.diagnostics,
        {
          code: "NON_POSITIVE_DENOMINATOR",
          status: "ERROR",
          message: `${ratioKind} ratio refused: denominator is zero or negative (contractual ${ratioKind.toLowerCase()} boundary; generic division is unchanged)`,
          exprId: expression.exprId ?? null,
          provenance: expression.provenance ?? null,
        },
      ],
    };
  }

  return evaluateExpression({ expression, ...rest });
}

/** True when an IR expression is a DIVIDE used as a ratio test numerator/denominator pair. */
export function isDivideRatioExpression(expr: IRExpression): expr is Extract<IRExpression, { kind: "DIVIDE" }> {
  return expr.kind === "DIVIDE";
}
