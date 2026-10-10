/**
 * Independent legal-fidelity check for greater-of (fixed $ / % Total Assets) IR.
 * Re-derives limbs from operative text and compares to the compiled capacity expression.
 */
import type { IRExpression, IRRule } from "../../ir/types";
import { classifyGreaterOfAssetsBasket, type GreaterOfAssetsClassification } from "./classify";

export type FidelityVerdict = "PASS" | "FAIL";

export interface FidelityFinding {
  code: string;
  detail: string;
  severity: "MATERIAL" | "INFO";
}

export interface GreaterOfFidelityResult {
  verdict: FidelityVerdict;
  findings: FidelityFinding[];
  classification: GreaterOfAssetsClassification;
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
  if (expr.kind === "MAX" || expr.kind === "MIN" || expr.kind === "ADD" || expr.kind === "MULTIPLY") {
    for (const o of expr.operands ?? []) collectMoneyAmounts(o as IRExpression, out);
  }
  if (expr.kind === "SUBTRACT") {
    collectMoneyAmounts(expr.left as IRExpression, out);
    collectMoneyAmounts(expr.right as IRExpression, out);
  }
}

function collectPercents(expr: IRExpression | null | undefined, out: number[]): void {
  if (!expr) return;
  if (expr.kind === "PERCENT") {
    out.push(expr.value);
    return;
  }
  if (expr.kind === "IF") {
    collectPercents(expr.then as IRExpression, out);
    if (expr.else) collectPercents(expr.else as IRExpression, out);
    return;
  }
  if ("operands" in expr && Array.isArray((expr as { operands?: IRExpression[] }).operands)) {
    for (const o of (expr as { operands: IRExpression[] }).operands) collectPercents(o, out);
  }
}

function collectMetrics(expr: IRExpression | null | undefined, out: Set<string>): void {
  if (!expr) return;
  if (expr.kind === "METRIC_REFERENCE") {
    out.add(expr.metricName);
    return;
  }
  if (expr.kind === "IF") {
    collectMetrics(expr.then as IRExpression, out);
    if (expr.else) collectMetrics(expr.else as IRExpression, out);
    return;
  }
  if ("operands" in expr && Array.isArray((expr as { operands?: IRExpression[] }).operands)) {
    for (const o of (expr as { operands: IRExpression[] }).operands) collectMetrics(o, out);
  }
}

function hasMax(expr: IRExpression | null | undefined): boolean {
  if (!expr) return false;
  if (expr.kind === "MAX") return true;
  if (expr.kind === "IF") return hasMax(expr.then as IRExpression) || hasMax(expr.else as IRExpression | null);
  if ("operands" in expr && Array.isArray((expr as { operands?: IRExpression[] }).operands)) {
    return (expr as { operands: IRExpression[] }).operands.some((o) => hasMax(o));
  }
  return false;
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

export function verifyGreaterOfLegalFidelity(args: {
  operativeSourceText: string;
  rule: IRRule;
}): GreaterOfFidelityResult {
  const findings: FidelityFinding[] = [];
  const classification = classifyGreaterOfAssetsBasket(args.operativeSourceText);

  if (
    classification.class === "NOT_GREATER_OF_ASSETS" ||
    classification.fixedAmountUsd == null ||
    classification.percentFraction == null ||
    !classification.metricName
  ) {
    findings.push({
      code: "NOT_GREATER_OF_ASSETS_SOURCE",
      detail: classification.reasons.join(",") || "source is not a greater-of assets basket",
      severity: "MATERIAL",
    });
    return { verdict: "FAIL", findings, classification };
  }

  if (args.rule.posture !== "PERMISSION") {
    findings.push({ code: "POSTURE_NOT_PERMISSION", detail: String(args.rule.posture), severity: "MATERIAL" });
  }
  if (args.rule.sufficiency !== "COMPLETE" && args.rule.sufficiency !== "PARTIAL") {
    findings.push({ code: "SUFFICIENCY_NOT_USABLE", detail: String(args.rule.sufficiency), severity: "MATERIAL" });
  }

  const amounts: number[] = [];
  collectMoneyAmounts(args.rule.capacityExpression as IRExpression | null, amounts);
  const positive = amounts.filter((a) => a > 0);
  if (!positive.includes(classification.fixedAmountUsd)) {
    findings.push({
      code: "FIXED_LIMB_MISMATCH",
      detail: `source=${classification.fixedAmountUsd} ir_positive_amounts=${JSON.stringify(positive)}`,
      severity: "MATERIAL",
    });
  }

  const percents: number[] = [];
  collectPercents(args.rule.capacityExpression as IRExpression | null, percents);
  if (!percents.some((p) => Math.abs(p - classification.percentFraction!) < 1e-12)) {
    findings.push({
      code: "PERCENT_LIMB_MISMATCH",
      detail: `source=${classification.percentFraction} ir_percents=${JSON.stringify(percents)}`,
      severity: "MATERIAL",
    });
  }

  const metrics = new Set<string>();
  collectMetrics(args.rule.capacityExpression as IRExpression | null, metrics);
  if (!metrics.has(classification.metricName)) {
    findings.push({
      code: "METRIC_MISMATCH",
      detail: `source=${classification.metricName} ir_metrics=${JSON.stringify([...metrics])}`,
      severity: "MATERIAL",
    });
  }

  if (!hasMax(args.rule.capacityExpression as IRExpression | null)) {
    findings.push({ code: "MISSING_MAX", detail: "capacityExpression lacks MAX of limbs", severity: "MATERIAL" });
  }

  const gates = new Set<string>();
  collectInputGates(args.rule.capacityExpression as IRExpression | null, gates);
  for (const residual of classification.residuals) {
    if (!gates.has(residual.gateInputName)) {
      findings.push({
        code: "RESIDUAL_GATE_MISSING",
        detail: `${residual.kind} gate ${residual.gateInputName} not encoded`,
        severity: "MATERIAL",
      });
    }
  }

  const material = findings.filter((f) => f.severity === "MATERIAL");
  return {
    verdict: material.length === 0 ? "PASS" : "FAIL",
    findings,
    classification,
  };
}
