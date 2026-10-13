/**
 * Compile identified leverage-ratio definitions into reusable IR expressions.
 *
 * Reuses METRIC_REFERENCE / SUBTRACT / DIVIDE / MULTIPLY shapes isomorphic to
 * lib/contract-model/ir/legacy-adapter.ts — no issuer-specific trees.
 * Uses browser-safe expr ids (no node:crypto).
 */

import type { IRCapacityExpression, IRExpression, SourceProvenance } from "@/lib/contract-model/ir/types";
import { withLeverageExprId } from "./expr-id";
import type { IdentifiedLeverageComponents } from "./types";

export interface CompiledLeverageExpressions {
  /** (Debt [− Cash]) / EBITDA → RATIO */
  ratioExpression: IRExpression;
  /**
   * max(0, threshold × EBITDA − netDebt) → MONEY mathematical dollar room.
   * Null when no threshold supplied or dollar room is unsupported.
   */
  debtHeadroomExpression: IRCapacityExpression | null;
  debtMetricKey: string;
  ebitdaMetricKey: string;
  cashMetricKey: string | null;
  formulaDisplay: string;
}

function provenance(components: IdentifiedLeverageComponents): SourceProvenance {
  return {
    documentId: components.leverageTerm.documentId,
    sourceNodeKey: null,
    sourceCitation: `${components.leverageTerm.sectionRef} — ${components.leverageTerm.termName}`,
    excerpt: components.leverageTerm.fullText.slice(0, 400),
  };
}

function metricRef(
  metricName: string,
  companyId: string,
  instrumentKey: string,
  prov: SourceProvenance | undefined,
): IRExpression {
  return withLeverageExprId({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId,
    instrumentKey,
    resolvedDefinitionId: null,
    ...(prov ? { provenance: prov } : {}),
  });
}

/**
 * Compile a net (or gross) leverage ratio into executable IR.
 * Metric keys are stable engine names so any company's inputs can bind.
 */
export function compileLeverageExpressions(args: {
  components: IdentifiedLeverageComponents;
  companyId: string;
  instrumentKey: string;
  threshold?: number | null;
  /** When true, refuse to emit dollar-room expression (unsupported cash cap etc.). */
  refuseDollarRoom?: boolean;
}): CompiledLeverageExpressions {
  const { components, companyId, instrumentKey } = args;
  const prov = provenance(components);
  const debtMetricKey = components.debtBasis === "secured" ? "Secured Debt" : "Total Debt";
  const ebitdaMetricKey = "EBITDA";
  const cashMetricKey = components.netsCash ? "Cash" : null;

  const grossDebt = metricRef(debtMetricKey, companyId, instrumentKey, prov);
  const ebitda = metricRef(ebitdaMetricKey, companyId, instrumentKey, {
    documentId: components.ebitdaTerm.documentId,
    sourceNodeKey: null,
    sourceCitation: `${components.ebitdaTerm.sectionRef} — ${components.ebitdaTerm.termName}`,
    excerpt: components.ebitdaTerm.fullText.slice(0, 400),
  });

  const numerator: IRExpression = cashMetricKey
    ? withLeverageExprId({
        kind: "SUBTRACT",
        type: "MONEY",
        left: grossDebt,
        right: metricRef(cashMetricKey, companyId, instrumentKey, prov),
        provenance: prov,
      })
    : grossDebt;

  const ratioExpression = withLeverageExprId({
    kind: "DIVIDE",
    type: "RATIO",
    numerator,
    denominator: ebitda,
    provenance: prov,
  });

  let debtHeadroomExpression: IRCapacityExpression | null = null;
  if (
    !args.refuseDollarRoom &&
    args.threshold != null &&
    Number.isFinite(args.threshold) &&
    args.threshold > 0
  ) {
    const multiple = withLeverageExprId({
      kind: "NUMBER",
      type: "NUMBER",
      value: args.threshold,
      provenance: prov,
    });
    const maxDebt = withLeverageExprId({
      kind: "MULTIPLY",
      type: "MONEY",
      operands: [multiple, ebitda],
      provenance: prov,
    });
    const room = withLeverageExprId({
      kind: "SUBTRACT",
      type: "MONEY",
      left: maxDebt,
      right: numerator,
      provenance: prov,
    });
    const zero = withLeverageExprId({
      kind: "MONEY",
      type: "MONEY",
      amount: 0,
      currency: "USD",
      provenance: prov,
    });
    debtHeadroomExpression = withLeverageExprId({
      kind: "MAX",
      type: "MONEY",
      operands: [zero, room],
      provenance: prov,
    });
  }

  return {
    ratioExpression,
    debtHeadroomExpression,
    debtMetricKey,
    ebitdaMetricKey,
    cashMetricKey,
    formulaDisplay: components.formulaDisplay,
  };
}
