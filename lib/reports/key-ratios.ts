/**
 * PR 414 KeyRatioModel[] — gross / net / secured / interest / fccr.
 *
 * Trust rules (Reviewer R1):
 * - A covenant ratio row is used ONLY when the engine itself marks it as a maintenance
 *   covenant (testKind "MAINTENANCE") computed under the agreement's own definition of that
 *   metric (agreementDefinedMetric). No name matching: the overview's coverage row is
 *   "Fixed Charge / Interest Coverage — <basket>", which the engine computes as
 *   EBITDA / interest expense for an incurrence basket, not the agreement's FCCR.
 * - Neither field exists on the overview RatioRow today, so today every key ratio is either
 *   the generic position metric (labelled generic, no covenant limit) or, for FCCR, null
 *   with source "NOT DETERMINABLE: …". FCCR has no generic fallback.
 * - thresholds are always null: band cutoffs come only from the CFO's settings (PR 420).
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
export type AgreementMetric = "GROSS_LEVERAGE" | "NET_LEVERAGE" | "SECURED_LEVERAGE" | "INTEREST_COVERAGE" | "FIXED_CHARGE_COVERAGE";
export interface RatioRowLike {
  name: string;
  documentName: string;
  sectionRef: string;
  status: string;
  currentRatio: number | null;
  ratioLimit: number;
  comparisonDirection: "at_or_below" | "at_or_above";
  /** Engine-supplied; absent today. */
  testKind?: "MAINTENANCE" | "INCURRENCE";
  /** Engine-supplied: which metric this row computes under the agreement's own definition; absent today. */
  agreementDefinedMetric?: AgreementMetric;
}

const LABEL: Record<KeyRatioId, string> = {
  gross: "Gross leverage",
  net: "Net leverage",
  secured: "Secured leverage",
  interest: "Interest coverage",
  fccr: "Fixed charge coverage",
};
const METRIC: Record<KeyRatioId, AgreementMetric> = {
  gross: "GROSS_LEVERAGE",
  net: "NET_LEVERAGE",
  secured: "SECURED_LEVERAGE",
  interest: "INTEREST_COVERAGE",
  fccr: "FIXED_CHARGE_COVERAGE",
};

export const FCCR_NOT_DETERMINABLE =
  "NOT DETERMINABLE: the engine has not computed the agreement's own fixed charge coverage definition for this company";

const finiteOk = (m: MetricLike | undefined) => (m && m.status === "OK" && typeof m.value === "number" && Number.isFinite(m.value) ? m.value : null);

export function agreementRowFor(id: KeyRatioId, rows: readonly RatioRowLike[]): RatioRowLike | undefined {
  return rows.find(
    (r) =>
      r.testKind === "MAINTENANCE" &&
      r.agreementDefinedMetric === METRIC[id] &&
      r.status === "MODELED" &&
      typeof r.currentRatio === "number" &&
      Number.isFinite(r.currentRatio) &&
      Number.isFinite(r.ratioLimit) &&
      !!r.documentName?.trim() &&
      !!r.sectionRef?.trim(),
  );
}

export function buildKeyRatios(metrics: GenericMetricsLike | null, rows: readonly RatioRowLike[]): KeyRatioModel[] {
  const generic: Record<Exclude<KeyRatioId, "fccr">, number | null> = {
    gross: finiteOk(metrics?.genericGrossLeverage),
    net: finiteOk(metrics?.genericNetLeverage),
    secured: finiteOk(metrics?.genericSecuredLeverage),
    interest: finiteOk(metrics?.genericInterestCoverage),
  };
  return (["gross", "net", "secured", "interest", "fccr"] as const).map((id) => {
    const cov = agreementRowFor(id, rows);
    if (cov) {
      return {
        id,
        label: LABEL[id],
        value: cov.currentRatio,
        limitLabel: limitText(cov.ratioLimit, cov.comparisonDirection),
        thresholds: null,
        clause: `${cov.documentName} ${cov.sectionRef}`.trim(),
        source: `Maintenance covenant "${cov.name}", computed under the agreement's definition (${cov.documentName} ${cov.sectionRef})`,
      };
    }
    if (id === "fccr") return { id, label: LABEL[id], value: null, limitLabel: null, thresholds: null, clause: null, source: FCCR_NOT_DETERMINABLE };
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
