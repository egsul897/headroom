/**
 * Covenant bands (Healthy / Moderate / Danger), matching the Designer's
 * `BandCutoffs` / `BandReading` contract on #414 (lib/ux/present.ts).
 *
 * Cutoffs are on the ratio's own scale and come ONLY from the CFO's settings
 * for that covenant (covenant_band_thresholds). There is NO product default:
 * no cutoffs ⇒ band null, status NEEDS_INPUT ("Band thresholds not set").
 * Agreements rarely state band cutoffs; when an extraction path supplies
 * them it can feed the same `BandCutoffs` shape.
 *
 * direction: "lower-is-safer" for maximum tests (at_or_below),
 *            "higher-is-safer" for minimum tests (at_or_above).
 * Valid cutoffs: lower-is-safer  ⇒ healthyUntil < moderateUntil ≤ limit
 *                higher-is-safer ⇒ healthyUntil > moderateUntil ≥ limit
 * Band (same rule as present.ts currentBand): within healthyUntil ⇒ Healthy,
 * within moderateUntil ⇒ Moderate, else Danger. Past the limit is still
 * Danger, with pastLimit = true.
 * No computed actual, or the engine row isn't MODELED ⇒ band null, NOT_EVALUATED.
 */
export type BandName = "Healthy" | "Moderate" | "Danger";
export type Direction = "lower-is-safer" | "higher-is-safer";

export interface BandCutoffs {
  direction: Direction;
  healthyUntil: number;
  moderateUntil: number;
  limit: number;
  limitLabel: string;
}

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

export interface ThresholdRow {
  covenantKey: string;
  healthyUntil: number;
  moderateUntil: number;
}

export type BandStatus = "EVALUATED" | "NEEDS_INPUT" | "NOT_EVALUATED";

/** One covenant's band, a superset of the Designer's BandReading. */
export interface CovenantBand {
  covenantKey: string;
  name: string;
  documentName: string;
  sectionRef: string;
  /** The covenant's own limit and direction from the engine row (always present). */
  limit: number;
  direction: Direction;
  actual: number | null;
  actualLabel: string | null;
  thresholds: BandCutoffs | null;
  /** Current band; null unless status is EVALUATED. */
  band: BandName | null;
  previousBand: BandName | null;
  trendingToward: BandName | null;
  pastLimit: boolean;
  status: BandStatus;
  thresholdSource: "CFO_SETTINGS" | null;
  reason: string | null;
}

export const directionOf = (c: "at_or_below" | "at_or_above"): Direction => (c === "at_or_below" ? "lower-is-safer" : "higher-is-safer");

export const fmtX = (n: number) => `${n.toFixed(2)}x`;

export function limitLabelFor(limit: number, direction: Direction): string {
  return `${fmtX(limit)} ${direction === "lower-is-safer" ? "max" : "min"}`;
}

/** Ordering check without the limit (used when saving). */
export function validateCutoffOrder(direction: Direction, healthyUntil: unknown, moderateUntil: unknown): { healthyUntil: number; moderateUntil: number } | null {
  const h = Number(healthyUntil);
  const m = Number(moderateUntil);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h <= 0 || m <= 0) return null;
  if (direction === "lower-is-safer" ? !(h < m) : !(h > m)) return null;
  return { healthyUntil: h, moderateUntil: m };
}

/** Full check against the covenant's own limit; null when inconsistent. */
export function cutoffsFor(row: RatioRowInput, t: ThresholdRow | undefined): BandCutoffs | null {
  if (!t || !Number.isFinite(row.ratioLimit) || row.ratioLimit <= 0) return null;
  const direction = directionOf(row.comparisonDirection);
  const ok = validateCutoffOrder(direction, t.healthyUntil, t.moderateUntil);
  if (!ok) return null;
  if (direction === "lower-is-safer" ? ok.moderateUntil > row.ratioLimit : ok.moderateUntil < row.ratioLimit) return null;
  return { direction, ...ok, limit: row.ratioLimit, limitLabel: limitLabelFor(row.ratioLimit, direction) };
}

export function bandOf(actual: number, c: BandCutoffs): BandName {
  if (c.direction === "lower-is-safer") {
    if (actual <= c.healthyUntil) return "Healthy";
    if (actual <= c.moderateUntil) return "Moderate";
    return "Danger";
  }
  if (actual >= c.healthyUntil) return "Healthy";
  if (actual >= c.moderateUntil) return "Moderate";
  return "Danger";
}

const WORSE: Record<BandName, BandName | null> = { Healthy: "Moderate", Moderate: "Danger", Danger: null };
const BETTER: Record<BandName, BandName | null> = { Healthy: null, Moderate: "Healthy", Danger: "Moderate" };

/**
 * Trend from the two most recent engine actuals only (no forecast): moving
 * toward the limit ⇒ the next worse band; away ⇒ the next better band.
 */
export function trendFrom(band: BandName, actual: number, previousActual: number | null, c: BandCutoffs): BandName | null {
  if (previousActual === null || !Number.isFinite(previousActual) || previousActual === actual) return null;
  const worsening = c.direction === "lower-is-safer" ? actual > previousActual : actual < previousActual;
  return worsening ? WORSE[band] : BETTER[band];
}

export function bandFor(
  row: RatioRowInput,
  thresholds: readonly ThresholdRow[],
  prior: { band: BandName | null; actual: number | null } = { band: null, actual: null },
): CovenantBand {
  const cut = cutoffsFor(row, thresholds.find((t) => t.covenantKey === row.stableKey));
  const actual = row.status === "MODELED" && typeof row.currentRatio === "number" && Number.isFinite(row.currentRatio) ? row.currentRatio : null;
  const base: CovenantBand = {
    covenantKey: row.stableKey,
    name: row.name,
    documentName: row.documentName,
    sectionRef: row.sectionRef,
    limit: row.ratioLimit,
    direction: directionOf(row.comparisonDirection),
    actual,
    actualLabel: actual === null ? null : fmtX(actual),
    thresholds: cut,
    band: null,
    previousBand: prior.band,
    trendingToward: null,
    pastLimit: false,
    status: "NOT_EVALUATED",
    thresholdSource: cut ? "CFO_SETTINGS" : null,
    reason: null,
  };
  if (actual === null) return { ...base, reason: row.reason ?? "Actual ratio not computed by the engine." };
  if (!cut) {
    const set = thresholds.some((t) => t.covenantKey === row.stableKey);
    return { ...base, status: "NEEDS_INPUT", reason: set ? "Band thresholds are inconsistent with this covenant's limit." : "Band thresholds not set" };
  }
  const band = bandOf(actual, cut);
  const pastLimit = cut.direction === "lower-is-safer" ? actual > cut.limit : actual < cut.limit;
  return { ...base, band, pastLimit, status: "EVALUATED", trendingToward: trendFrom(band, actual, prior.actual, cut) };
}

/**
 * Fill previousBand / trendingToward from recorded history (newest first).
 * previousBand = the most recent recorded band that differs from the current one.
 * Trend compares the current actual with the most recent recorded actual that differs.
 */
export function withHistory(b: CovenantBand, events: ReadonlyArray<{ toBand: string; actual: number | null }>): CovenantBand {
  if (b.status !== "EVALUATED" || !b.band || !b.thresholds || b.actual === null) return { ...b, previousBand: null, trendingToward: null };
  const prev = events.find((e) => e.toBand !== b.band && e.toBand !== "NOT_EVALUATED");
  const prevActual = events.find((e) => e.actual !== null && e.actual !== b.actual)?.actual ?? null;
  return {
    ...b,
    previousBand: prev ? (prev.toBand as BandName) : null,
    trendingToward: trendFrom(b.band, b.actual, prevActual, b.thresholds),
  };
}
