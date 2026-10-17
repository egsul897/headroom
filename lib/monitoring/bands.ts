/**
 * Covenant bands — Healthy / Moderate / Danger — from the engine's OWN
 * actual vs limit. Pure; no figure is computed except the headroom fraction
 * from those two engine values.
 *
 * headroom fraction = (limit − actual) / limit   for "at_or_below" (max) tests
 *                   = (actual − limit) / limit   for "at_or_above" (min) tests
 * Band: < 0 ⇒ BREACH; < dangerBelow ⇒ DANGER; < moderateBelow ⇒ MODERATE; else HEALTHY.
 * No computed actual, or the engine says the row isn't MODELED ⇒ NOT_DETERMINABLE
 * (never Healthy by default).
 *
 * Thresholds are classification policy, not financial figures: a workspace may
 * set them per covenant (or "*" for all); otherwise the documented product
 * default applies and is labelled PRODUCT_DEFAULT on every band.
 */
export type Band = "HEALTHY" | "MODERATE" | "DANGER" | "BREACH" | "NOT_DETERMINABLE";

export const PRODUCT_DEFAULT_THRESHOLDS = { moderateBelow: 0.2, dangerBelow: 0.1 } as const;

export interface BandThresholds {
  moderateBelow: number;
  dangerBelow: number;
}

export type ThresholdSource = "COVENANT" | "WORKSPACE_DEFAULT" | "PRODUCT_DEFAULT";

export interface RatioRowInput {
  stableKey: string;
  name: string;
  documentName: string;
  sectionRef: string;
  currentRatio: number | null;
  ratioLimit: number;
  comparisonDirection: "at_or_below" | "at_or_above";
  status: string;
  reason?: string;
}

export interface CovenantBand {
  covenantKey: string;
  covenantName: string;
  documentName: string;
  sectionRef: string;
  band: Band;
  headroomPct: number | null;
  actual: number | null;
  limit: number;
  comparison: "at_or_below" | "at_or_above";
  thresholds: BandThresholds;
  thresholdSource: ThresholdSource;
  reason: string | null;
}

export function validateThresholds(t: { moderateBelow: unknown; dangerBelow: unknown }): BandThresholds | null {
  const m = Number(t.moderateBelow);
  const d = Number(t.dangerBelow);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (!(d > 0 && d < m && m <= 1)) return null;
  return { moderateBelow: m, dangerBelow: d };
}

export function resolveThresholds(
  covenantKey: string,
  rows: ReadonlyArray<{ covenantKey: string; moderateBelow: number; dangerBelow: number }>,
): { thresholds: BandThresholds; source: ThresholdSource } {
  const own = rows.find((r) => r.covenantKey === covenantKey);
  const ownValid = own ? validateThresholds(own) : null;
  if (ownValid) return { thresholds: ownValid, source: "COVENANT" };
  const ws = rows.find((r) => r.covenantKey === "*");
  const wsValid = ws ? validateThresholds(ws) : null;
  if (wsValid) return { thresholds: wsValid, source: "WORKSPACE_DEFAULT" };
  return { thresholds: { ...PRODUCT_DEFAULT_THRESHOLDS }, source: "PRODUCT_DEFAULT" };
}

export function headroomFraction(actual: number, limit: number, comparison: "at_or_below" | "at_or_above"): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(limit) || limit <= 0) return null;
  return comparison === "at_or_below" ? (limit - actual) / limit : (actual - limit) / limit;
}

export function bandFor(row: RatioRowInput, thresholdRows: ReadonlyArray<{ covenantKey: string; moderateBelow: number; dangerBelow: number }>): CovenantBand {
  const { thresholds, source } = resolveThresholds(row.stableKey, thresholdRows);
  const base = {
    covenantKey: row.stableKey,
    covenantName: row.name,
    documentName: row.documentName,
    sectionRef: row.sectionRef,
    limit: row.ratioLimit,
    comparison: row.comparisonDirection,
    thresholds,
    thresholdSource: source,
  };
  const actual = row.status === "MODELED" && typeof row.currentRatio === "number" && Number.isFinite(row.currentRatio) ? row.currentRatio : null;
  const pct = actual === null ? null : headroomFraction(actual, row.ratioLimit, row.comparisonDirection);
  if (actual === null || pct === null) {
    return { ...base, band: "NOT_DETERMINABLE", headroomPct: null, actual: null, reason: row.reason ?? "Actual ratio not computed by the engine." };
  }
  const band: Band = pct < 0 ? "BREACH" : pct < thresholds.dangerBelow ? "DANGER" : pct < thresholds.moderateBelow ? "MODERATE" : "HEALTHY";
  return { ...base, band, headroomPct: pct, actual, reason: null };
}

export const BAND_LABEL: Record<Band, string> = {
  HEALTHY: "Healthy",
  MODERATE: "Moderate",
  DANGER: "Danger",
  BREACH: "Breach",
  NOT_DETERMINABLE: "Not determinable",
};
