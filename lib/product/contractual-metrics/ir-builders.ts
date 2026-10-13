/** Stable IR node builders for product packages (deterministic exprIds). */

import type { IRDefinition, IRExpression, SourceProvenance } from "@/lib/contract-model/ir/types";
import { IR_SCHEMA_VERSION } from "@/lib/contract-model/ir/types";

export function provenance(
  documentId: string,
  citation: string,
  excerpt: string,
): SourceProvenance {
  return { documentId, sourceNodeKey: null, sourceCitation: citation, excerpt };
}

export function metricRef(
  metricName: string,
  companyId: string,
  instrumentKey: string,
  exprId: string,
  p?: SourceProvenance,
): IRExpression {
  return {
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId,
    instrumentKey,
    resolvedDefinitionId: null,
    exprId,
    ...(p ? { provenance: p } : {}),
  };
}

export function termRef(
  termName: string,
  companyId: string,
  instrumentKey: string,
  exprId: string,
  resolvedDefinitionId: string | null,
  type: "MONEY" | "RATIO" = "MONEY",
): IRExpression {
  return {
    kind: "DEFINED_TERM_REFERENCE",
    type,
    termName,
    companyId,
    instrumentKey,
    resolvedDefinitionId,
    exprId,
  };
}

export function add(exprId: string, ...operands: IRExpression[]): IRExpression {
  return { kind: "ADD", type: "MONEY", operands, exprId };
}

export function sub(exprId: string, left: IRExpression, right: IRExpression): IRExpression {
  return { kind: "SUBTRACT", type: "MONEY", left, right, exprId };
}

export function divRatio(exprId: string, numerator: IRExpression, denominator: IRExpression): IRExpression {
  return { kind: "DIVIDE", type: "RATIO", numerator, denominator, exprId };
}

export function unsupported(
  exprId: string,
  reason: string,
  sourceEvidence: string,
  semanticDescription: string,
): IRExpression {
  return {
    kind: "UNSUPPORTED",
    type: null,
    sourceEvidence,
    semanticDescription,
    reason,
    requiredReview: true,
    exprId,
  };
}

export function makeDefinition(args: {
  definitionId: string;
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  termName: string;
  expression: IRExpression | null;
  dependsOnTerms: string[];
  sufficiency: IRDefinition["sufficiency"];
  sufficiencyReasons: string[];
  provenance: SourceProvenance;
}): IRDefinition {
  return {
    definitionId: args.definitionId,
    irSchemaVersion: IR_SCHEMA_VERSION,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    sourceDocumentId: args.sourceDocumentId,
    termName: args.termName,
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    calculationExpression: args.expression,
    dependsOnTerms: args.dependsOnTerms,
    sufficiency: args.sufficiency,
    sufficiencyReasons: args.sufficiencyReasons,
    provenance: args.provenance,
    compilerVersion: "product-contractual-metrics.v1",
    sourceContentVersion: null,
  };
}
