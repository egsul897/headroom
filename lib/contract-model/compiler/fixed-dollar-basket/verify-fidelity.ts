/**
 * Independent legal-fidelity check for a fixed-dollar basket IR rule.
 *
 * Deliberately does NOT reuse classify/compile internals for the amount
 * assertion beyond reading the IR — amount and cap-role are re-derived from
 * operative text, then compared to the compiled capacity expression.
 */
import type { IRExpression, IRRule } from "../../ir/types";
import { classifyFixedDollarBasket, type FixedDollarClassification } from "./classify";

export type FidelityVerdict = "PASS" | "FAIL";

export interface FidelityFinding {
  code: string;
  detail: string;
  severity: "MATERIAL" | "INFO";
}

export interface FixedDollarFidelityResult {
  verdict: FidelityVerdict;
  findings: FidelityFinding[];
  classification: FixedDollarClassification;
}

function collectMoneyAmounts(expr: IRExpression | null | undefined, out: number[]): void {
  if (!expr) return;
  if (expr.kind === "MONEY") {
    out.push(expr.amount);
    return;
  }
  if (expr.kind === "IF") {
    collectMoneyAmounts(expr.then as IRExpression, out);
    if (expr.else) collectMoneyAmounts(expr.else as IRExpression, out);
    return;
  }
  if ("operands" in expr && Array.isArray((expr as { operands?: IRExpression[] }).operands)) {
    for (const o of (expr as { operands: IRExpression[] }).operands) collectMoneyAmounts(o, out);
  }
}

function collectInputGates(expr: IRExpression | null | undefined, out: Set<string>): void {
  if (!expr) return;
  if (expr.kind === "TRANSACTION_INPUT_REFERENCE") {
    out.add(expr.inputName);
    return;
  }
  if (expr.kind === "IF") {
    collectInputGates(expr.condition as IRExpression, out);
    collectInputGates(expr.then as IRExpression, out);
    if (expr.else) collectInputGates(expr.else as IRExpression, out);
    return;
  }
}

export function verifyFixedDollarLegalFidelity(args: {
  operativeSourceText: string;
  rule: IRRule;
}): FixedDollarFidelityResult {
  const findings: FidelityFinding[] = [];
  const classification = classifyFixedDollarBasket(args.operativeSourceText);

  if (classification.class === "NOT_FIXED_DOLLAR" || classification.amountUsd == null) {
    findings.push({
      code: "NOT_FIXED_DOLLAR_SOURCE",
      detail: classification.reasons.join(",") || "source is not a fixed-dollar basket",
      severity: "MATERIAL",
    });
    return { verdict: "FAIL", findings, classification };
  }

  if (args.rule.posture !== "PERMISSION") {
    findings.push({ code: "POSTURE_NOT_PERMISSION", detail: String(args.rule.posture), severity: "MATERIAL" });
  }
  if (args.rule.sufficiency !== "COMPLETE") {
    findings.push({ code: "SUFFICIENCY_NOT_COMPLETE", detail: String(args.rule.sufficiency), severity: "MATERIAL" });
  }

  const amounts: number[] = [];
  collectMoneyAmounts(args.rule.capacityExpression as IRExpression | null, amounts);
  const positive = amounts.filter((a) => a > 0);
  if (!positive.includes(classification.amountUsd)) {
    findings.push({
      code: "AMOUNT_MISMATCH",
      detail: `source=${classification.amountUsd} ir_positive_amounts=${JSON.stringify(positive)}`,
      severity: "MATERIAL",
    });
  }

  const gates = new Set<string>();
  collectInputGates(args.rule.capacityExpression as IRExpression | null, gates);
  for (const residual of classification.residuals) {
    if (!gates.has(residual.gateInputName)) {
      findings.push({
        code: "RESIDUAL_GATE_MISSING",
        detail: `${residual.kind} gate ${residual.gateInputName} not encoded in capacityExpression`,
        severity: "MATERIAL",
      });
    }
  }

  // False-favorable guard: sole-cap IR must not carry unused qualitative gates that
  // could be misread; gated IR must not evaluate to a positive amount without inputs.
  if (classification.class === "FIXED_DOLLAR_SOLE_CAP" && gates.size > 0) {
    findings.push({
      code: "UNEXPECTED_GATES_ON_SOLE_CAP",
      detail: [...gates].join(","),
      severity: "MATERIAL",
    });
  }
  if (classification.class === "FIXED_DOLLAR_WITH_QUALITATIVE_GATES" && gates.size === 0) {
    findings.push({
      code: "MISSING_ALL_GATES",
      detail: "qualitative residuals present in source but no TRANSACTION_INPUT gates in IR",
      severity: "MATERIAL",
    });
  }

  if (!classification.capRoleOk) {
    findings.push({ code: "CAP_ROLE_NOT_CONFIRMED", detail: "source dollar is not in not-to-exceed role", severity: "MATERIAL" });
  }

  const material = findings.filter((f) => f.severity === "MATERIAL");
  return {
    verdict: material.length === 0 ? "PASS" : "FAIL",
    findings,
    classification,
  };
}
