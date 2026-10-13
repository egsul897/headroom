/**
 * Project IRDefinition rows into ContractualFinancialDefinition without inventing mechanics.
 */

import type { IRDefinition, IRExpression } from "../ir/types";
import { inferMetricKindFromTermName } from "./catalog";
import type {
  AdjustmentRepresentation,
  ContractualFinancialDefinition,
  MeasurementPeriodSpec,
} from "./types";

function collectUnsupportedAdjustments(expr: IRExpression | null): AdjustmentRepresentation[] {
  if (!expr) return [];
  const out: AdjustmentRepresentation[] = [];
  const walk = (e: IRExpression): void => {
    if (e.kind === "UNSUPPORTED") {
      out.push({
        kind: "UNSUPPORTED",
        reason: e.reason,
        sourceEvidence: e.sourceEvidence,
        semanticDescription: e.semanticDescription,
      });
      if (e.attemptedStructure) walk(e.attemptedStructure);
      return;
    }
    switch (e.kind) {
      case "ADD":
      case "MULTIPLY":
      case "MAX":
      case "MIN":
      case "SUM":
      case "AND":
      case "OR":
        for (const op of e.operands) walk(op);
        break;
      case "SUBTRACT":
      case "COMPARE":
        walk(e.left);
        walk(e.right);
        break;
      case "DIVIDE":
        walk(e.numerator);
        walk(e.denominator);
        break;
      case "NOT":
        walk(e.operand);
        break;
      case "IF":
        walk(e.condition);
        walk(e.then);
        if (e.else) walk(e.else);
        break;
      case "AS_OF":
        walk(e.value);
        if (typeof e.asOfDate !== "string") walk(e.asOfDate);
        break;
      case "DURING_PERIOD":
        walk(e.value);
        break;
      case "SCHEDULE":
        for (const c of e.cases) walk(c.value);
        if (e.defaultValue) walk(e.defaultValue);
        break;
      case "EVENT_ACTIVE":
        if (e.triggerCondition) walk(e.triggerCondition);
        break;
      default:
        break;
    }
  };
  walk(expr);
  return out;
}

function defaultPeriod(): MeasurementPeriodSpec {
  return { kind: "UNSPECIFIED" };
}

/**
 * Lift an IRDefinition into the UCD financial-definition representation.
 * Does not evaluate; preserves UNSUPPORTED leaves explicitly.
 */
export function contractualDefinitionFromIr(def: IRDefinition): ContractualFinancialDefinition {
  const adjustments = collectUnsupportedAdjustments(def.calculationExpression);
  const hasUnsupported = adjustments.some((a) => a.kind === "UNSUPPORTED");
  const proFormaTreatment =
    def.sufficiency === "UNSUPPORTED" || def.sufficiency === "AMBIGUOUS"
      ? "REVIEW_REQUIRED"
      : hasUnsupported
        ? "UNSUPPORTED"
        : "NONE";

  return {
    definitionId: def.definitionId,
    companyId: def.companyId,
    instrumentKey: def.instrumentKey,
    sourceDocumentId: def.sourceDocumentId,
    termName: def.termName,
    metricKind: inferMetricKindFromTermName(def.termName),
    calculationExpression: def.calculationExpression,
    dependsOnTerms: [...def.dependsOnTerms],
    adjustments,
    measurementPeriod: defaultPeriod(),
    proFormaTreatment,
    sufficiency: def.sufficiency,
    sufficiencyReasons: [...def.sufficiencyReasons],
    provenance: def.provenance,
    irDefinition: def,
  };
}
