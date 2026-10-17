import type { RatioRow } from "@/lib/covenant-overview-builder";
import type { GenericFinancialMetrics, MetricResult } from "@/lib/financial-core/types";
import { emptyKeyRatio, type KeyRatioId, type KeyRatioModel } from "@/lib/ux/present";

function finiteMetric(metric: MetricResult | undefined): number | null {
  if (!metric || metric.status !== "OK" || metric.value == null || !Number.isFinite(metric.value)) return null;
  return metric.value;
}

function matches(id: KeyRatioId, name: string): boolean {
  const text = name.toLowerCase();
  if (id === "gross") return text.includes("gross") && text.includes("leverage");
  if (id === "net") return (text.includes("net leverage") || text.includes("total net")) && !text.includes("secured");
  if (id === "secured") return text.includes("secured") && text.includes("leverage");
  if (id === "interest") return text.includes("interest coverage");
  return text.includes("fixed charge");
}

function limitFor(rows: readonly RatioRow[], id: KeyRatioId): { label: string; clause: string } | null {
  const row = rows.find((item) => item.status === "MODELED" && Number.isFinite(item.ratioLimit) && matches(id, item.name));
  if (!row) return null;
  const bound = row.comparisonDirection === "at_or_above" ? "min" : "max";
  return {
    label: `${row.ratioLimit.toFixed(2)}x ${bound}`,
    clause: `${row.documentName} ${row.sectionRef}`.trim(),
  };
}

/**
 * Four generic position ratios, plus fixed-charge coverage only from a modeled
 * covenant row. No band cutoffs are invented here.
 */
export function keyRatiosFromPosition(
  metrics: GenericFinancialMetrics | null,
  ratioRows: readonly RatioRow[],
): KeyRatioModel[] {
  const generic: Record<Exclude<KeyRatioId, "fccr">, number | null> = {
    gross: finiteMetric(metrics?.genericGrossLeverage),
    net: finiteMetric(metrics?.genericNetLeverage),
    secured: finiteMetric(metrics?.genericSecuredLeverage),
    interest: finiteMetric(metrics?.genericInterestCoverage),
  };

  return (["gross", "net", "secured", "interest", "fccr"] as const).map((id) => {
    const base = emptyKeyRatio(id);
    const limit = limitFor(ratioRows, id);
    const fccrRow = id === "fccr" ? ratioRows.find((item) => item.status === "MODELED" && matches(id, item.name)) : undefined;
    const fccrValue = fccrRow?.currentRatio != null && Number.isFinite(fccrRow.currentRatio) ? fccrRow.currentRatio : null;
    return {
      ...base,
      value: id === "fccr" ? fccrValue : generic[id],
      limitLabel: limit?.label ?? null,
      clause: limit?.clause ?? null,
      source: metrics ? "Position metrics." : null,
      thresholds: null,
    };
  });
}
