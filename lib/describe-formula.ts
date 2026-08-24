/**
 * Renders a CovenantProvision's formula as plain English, driven entirely by
 * formulaType/thresholdValue/params - the same fields the engine evaluates.
 * No per-provision hardcoded text: a new provision row gets a description for
 * free as long as it uses one of the existing formula types.
 */
import type { CovenantProvisionInput } from "./covenant-engine";

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction * 100 % 1 === 0 ? 0 : 1)}%`;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}M`;
}

function ratioMeasure(basis: "total" | "secured" | undefined): string {
  return basis === "secured" ? "Senior Secured Net Leverage" : "Total Net Leverage";
}

export function describeFormula(p: CovenantProvisionInput): string {
  const params = p.params ?? {};

  switch (p.formulaType) {
    case "FLAT_AMOUNT":
      return `A flat ${money(p.thresholdValue)} basket.`;

    case "FLAT_NET_OF_DEBT": {
      const basis = params.netOfBasis === "secured" ? "secured" : "total";
      return `${money(p.thresholdValue)}, net of ${basis} debt already outstanding under this basket.`;
    }

    case "GREATER_OF_FLAT_OR_PCT_EBITDA":
      return `The greater of ${money(p.thresholdValue)} or ${pct(params.pctEbitda ?? 0)} of Consolidated EBITDA.`;

    case "LEVERAGE_RATIO_ROOM":
      return `The additional debt that keeps ${ratioMeasure(params.debtBasis)} at or below ${p.thresholdValue.toFixed(2)}x Consolidated EBITDA.`;

    case "COVERAGE_RATIO_ROOM":
      return `The additional debt (at the assumed new-debt rate) that keeps the coverage ratio at or above ${p.thresholdValue.toFixed(2)}x.`;

    case "BUILDER_BASKET": {
      const parts = [`the greater of ${money(p.thresholdValue)} or ${pct(params.pctEbitda ?? 0)} of Consolidated EBITDA`];
      if (params.cniSharePct) {
        parts.push(`${pct(params.cniSharePct)} of cumulative Consolidated Net Income since issuance`);
      }
      if (params.includeEquityProceeds) {
        parts.push("net cash proceeds of qualifying equity issuances since issuance");
      }
      return `The sum of ${parts.join(", plus ")}.`;
    }

    case "RATIO_GATE":
      return `Unlimited capacity, so long as ${ratioMeasure(params.debtBasis)} is at or below ${p.thresholdValue.toFixed(2)}x.`;

    default: {
      const exhaustive: never = p.formulaType;
      return `Formula not described (${String(exhaustive)}).`;
    }
  }
}
