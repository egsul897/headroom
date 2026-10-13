/**
 * Compile contractual Consolidated EBITDA build-ups into executable IR.
 *
 * Coherent CA: CNI + tax + interest + D&A + SBC + FIXED_POINT_ADDBACK_CAP(15% RESULT)
 * on restructuring/integration/transaction costs.
 * Matthews Indenture: uncapped SUM of CNI + interest + tax + D&A + non-cash (no fixed-point).
 *
 * Does not invent component amounts. Certificate-reported EBITDA is never treated
 * as an independently derived build-up result.
 */

import type { IRDefinition, IRExpression, SourceProvenance } from "@/lib/contract-model/ir/types";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import type { EbitdaBuildupKind } from "./types";

export type { EbitdaBuildupKind };

export interface EbitdaBuildupCompileResult {
  kind: EbitdaBuildupKind;
  expression: IRExpression;
  definition: IRDefinition;
  /** Metric keys the build-up requires (never certificate EBITDA as a substitute). */
  requiredMetricKeys: string[];
  formulaDisplay: string;
  citations: string[];
  limitations: string[];
}

function metric(
  metricName: string,
  companyId: string,
  instrumentKey: string,
  prov: SourceProvenance,
): IRExpression {
  return withExpressionId({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId,
    instrumentKey,
    resolvedDefinitionId: null,
    provenance: prov,
  });
}

function sum(operands: IRExpression[], prov: SourceProvenance): IRExpression {
  return withExpressionId({ kind: "SUM", type: "MONEY", operands, provenance: prov });
}

/**
 * Coherent CA Consolidated EBITDA with 15% RESULT fixed-point cap on restructuring addbacks.
 * Cap language: "subject to a cap of 15% of Consolidated EBITDA (calculated before giving
 * effect to such add-back)" — modeled as RESULT closed form E = B + min(A, 0.15·E).
 */
export function compileCoherentEbitdaBuildup(args: {
  companyId: string;
  instrumentKey: string;
  documentId: string;
  sectionRef: string;
  excerpt: string;
}): EbitdaBuildupCompileResult {
  const prov: SourceProvenance = {
    documentId: args.documentId,
    sourceNodeKey: null,
    sourceCitation: `${args.sectionRef} — Consolidated EBITDA`,
    excerpt: args.excerpt.slice(0, 400),
  };
  const { companyId, instrumentKey } = args;
  const keys = [
    "Consolidated Net Income",
    "Income Tax Expense",
    "Consolidated Interest Expense",
    "Depreciation and Amortization",
    "Non-Cash Stock-Based Compensation",
    "Restructuring Integration Transaction Costs",
  ] as const;
  const base = sum(
    [
      metric(keys[0], companyId, instrumentKey, prov),
      metric(keys[1], companyId, instrumentKey, prov),
      metric(keys[2], companyId, instrumentKey, prov),
      metric(keys[3], companyId, instrumentKey, prov),
      metric(keys[4], companyId, instrumentKey, prov),
    ],
    prov,
  );
  const addbacks = metric(keys[5], companyId, instrumentKey, prov);
  const expression = withExpressionId({
    kind: "FIXED_POINT_ADDBACK_CAP",
    type: "MONEY",
    base,
    addbacks,
    capFraction: 0.15,
    capBase: "RESULT",
    eligibility: null,
    provenance: prov,
  });
  const definition: IRDefinition = {
    definitionId: `ir-definition:ebitda-coherent-${instrumentKey}`,
    irSchemaVersion: "contractual-leverage.ebitda.v1",
    companyId,
    instrumentKey,
    sourceDocumentId: args.documentId,
    termName: "Consolidated EBITDA",
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    calculationExpression: expression,
    dependsOnTerms: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: prov,
    compilerVersion: null,
    sourceContentVersion: null,
  };
  return {
    kind: "COHERENT_CAPPED_ADDBACK",
    expression,
    definition,
    requiredMetricKeys: [...keys],
    formulaDisplay:
      "Consolidated Net Income + tax + interest + D&A + SBC + min(restructuring costs, 15% × Consolidated EBITDA) [FIXED_POINT RESULT]",
    citations: [prov.sourceCitation],
    limitations: [
      "Build-up uses component metrics — not certificate-reported EBITDA as an independent derivation.",
      "15% addback cap uses FIXED_POINT_ADDBACK_CAP (RESULT); naive self-reference remains CYCLE.",
    ],
  };
}

/**
 * Matthews Indenture Consolidated EBITDA — uncapped additive limbs (no fixed-point).
 * Second materially different definition proving the same generalized runtime.
 */
export function compileMatthewsEbitdaBuildup(args: {
  companyId: string;
  instrumentKey: string;
  documentId: string;
  sectionRef: string;
  excerpt: string;
}): EbitdaBuildupCompileResult {
  const prov: SourceProvenance = {
    documentId: args.documentId,
    sourceNodeKey: null,
    sourceCitation: `${args.sectionRef} — Consolidated EBITDA`,
    excerpt: args.excerpt.slice(0, 400),
  };
  const { companyId, instrumentKey } = args;
  const keys = [
    "Consolidated Net Income",
    "Consolidated Interest Expense",
    "Income Tax Expense",
    "Depreciation and Amortization",
    "Non-Cash Expenses Excluding DA",
  ] as const;
  const expression = sum(
    keys.map((k) => metric(k, companyId, instrumentKey, prov)),
    prov,
  );
  const definition: IRDefinition = {
    definitionId: `ir-definition:ebitda-matthews-${instrumentKey}`,
    irSchemaVersion: "contractual-leverage.ebitda.v1",
    companyId,
    instrumentKey,
    sourceDocumentId: args.documentId,
    termName: "Consolidated EBITDA",
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    calculationExpression: expression,
    dependsOnTerms: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: prov,
    compilerVersion: null,
    sourceContentVersion: null,
  };
  return {
    kind: "MATTHEWS_UNCAPPED_SUM",
    expression,
    definition,
    requiredMetricKeys: [...keys],
    formulaDisplay: "Consolidated Net Income + interest + tax + D&A + non-cash (ex-DA) [uncapped SUM]",
    citations: [prov.sourceCitation],
    limitations: [
      "Uncapped additive build-up — no FIXED_POINT_ADDBACK_CAP limb in this definition.",
      "Component metrics required; certificate EBITDA is not substituted as derived.",
    ],
  };
}
