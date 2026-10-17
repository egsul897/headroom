/**
 * PR 414 KeyRatioModel[] — gross / net / secured / interest / fccr.
 *
 * Trust rules (stricter than a name match against generic metrics):
 * - If a MODELED covenant ratio row computed under the agreement's own definition
 *   matches the id, its actual, limit and citation are used (source = the covenant).
 * - Otherwise gross/net/secured/interest fall back to the generic position metric,
 *   labelled as generic, and are NOT paired with a covenant limit (a generic number
 *   against a contractual limit would look like a compliance test).
 * - FCCR has no generic fallback: only the agreement-defined modeled row, else
 *   value null + source "NOT DETERMINABLE: …".
 * - thresholds are always null here: band cutoffs come only from the CFO's settings
 *   (monitoring lane, PR 420), never defaulted.
 */
import { limitText } from "./build";
import type { KeyRatioId, KeyRatioModel } from "./ux-contract";

export interface MetricLike { status: string; value: number | null }
export interface GenericMetricsLike {
  genericGrossLeverage?: MetricLike;
  genericNetLeverage?: MetricLike;
  genericSecuredLeverage?: MetricLike;
  genericInterestCoverage?: MetricLike;
}
export interface RatioRowLike {
  name: string;
  documentName: string;
  sectionRef: string;
  status: string;
  currentRatio: number | null;
  ratioLimit: number;
  comparisonDirection: "at_or_below" | "at_or_above";
}

const LABEL: Record<KeyRatioId, string> = {
  gross: "Gross leverage",
  net: "Net leverage",
  secured: "Secured leverage",
  interest: "Interest coverage",
  fccr: "Fixed charge coverage",
};

export function matchesKeyRatio(id: KeyRatioId, name: string): boolean {
  const t = name.toLowerCase();
  if (id === "gross") return /gross/.test(t) && /leverage/.test(t);
  if (id === "net") return /net\s+(senior\s+)?leverage|total\s+net/.test(t) && !/secured/.test(t);
  if (id === "secured") return /secured/.test(t) && /leverage/.test(t);
  if (id === "interest") return /interest\s+coverage/.test(t);
  return /fixed[\s-]+charge/.test(t);
}

const finiteOk = (m: MetricLike | undefined) => (m && m.status === "OK" && typeof m.value === "number" && Number.isFinite(m.value) ? m.value : null);

export function buildKeyRatios(metrics: GenericMetricsLike | null, rows: readonly RatioRowLike[]): KeyRatioModel[] {
  const generic: Record<Exclude<KeyRatioId, "fccr">, number | null> = {
    gross: finiteOk(metrics?.genericGrossLeverage),
    net: finiteOk(metrics?.genericNetLeverage),
    secured: finiteOk(metrics?.genericSecuredLeverage),
    interest: finiteOk(metrics?.genericInterestCoverage),
  };
  return (["gross", "net", "secured", "interest", "fccr"] as const).map((id) => {
    const cov = rows.find((r) => r.status === "MODELED" && typeof r.currentRatio === "number" && Number.isFinite(r.currentRatio) && Number.isFinite(r.ratioLimit) && r.documentName?.trim() && r.sectionRef?.trim() && matchesKeyRatio(id, r.name));
    if (cov) {
      return {
        id,
        label: LABEL[id],
        value: cov.currentRatio,
        limitLabel: limitText(cov.ratioLimit, cov.comparisonDirection),
        thresholds: null,
        clause: `${cov.documentName} ${cov.sectionRef}`.trim(),
        source: `Covenant "${cov.name}" as defined in ${cov.documentName} ${cov.sectionRef} (engine-computed)`,
      };
    }
    if (id === "fccr") {
      return { id, label: LABEL[id], value: null, limitLabel: null, thresholds: null, clause: null, source: "NOT DETERMINABLE: the agreement's fixed charge coverage definition is not modeled for this company" };
    }
    const v = generic[id];
    return {
      id,
      label: LABEL[id],
      value: v,
      limitLabel: null,
      thresholds: null,
      clause: null,
      source: v === null ? null : "Generic position metric (standard definition, not the agreement's defined ratio)",
    };
  });
}
