/**
 * Explicit financial-unit contract (production-readiness fixes,
 * docs/autonomous-ingestion-production-readiness.md). Root cause this closes:
 * a CSV row supplying a raw dollar figure (e.g. 125000000) was accepted with
 * no unit at all and treated as already being in this codebase's established
 * "$-millions" convention, producing a silently wrong, 10^6x-inflated
 * dashboard figure ($125,000,000M) instead of failing closed or converting
 * it correctly.
 *
 * Every financial fact must now carry an EXPLICIT declared unit - never
 * inferred from magnitude, never assumed from a global convention with no
 * accompanying metadata. This module is the ONE place that knows (a) which
 * canonical unit each metricName is expressed in internally (the existing,
 * unchanged FinancialSnapshot/FinancialState convention - dollar figures in
 * millions, e.g. Coherent's real $786,000,000 basket stored as `786`), and
 * (b) how to convert a declared (value, unit) pair into that canonical unit
 * deterministically. Callers (lib/connectors/csv-financial-connector.ts
 * today; any future connector) never invent their own conversion.
 */

export const FINANCIAL_UNITS = ["USD", "USD_THOUSANDS", "USD_MILLIONS", "RATIO", "PERCENT", "COUNT"] as const;
export type FinancialUnit = (typeof FINANCIAL_UNITS)[number];

const DOLLAR_UNITS = new Set<FinancialUnit>(["USD", "USD_THOUSANDS", "USD_MILLIONS"]);
/** How many of this unit make one dollar - e.g. 1 USD_MILLIONS = 1_000_000 USD. */
const DOLLARS_PER_UNIT: Record<"USD" | "USD_THOUSANDS" | "USD_MILLIONS", number> = {
  USD: 1,
  USD_THOUSANDS: 1_000,
  USD_MILLIONS: 1_000_000,
};

/**
 * Canonical unit per metricName - the SAME small, fixed vocabulary
 * lib/onboarding/financial.ts's FINANCIAL_METRIC_FIELD_MAP already
 * establishes (never invented independently here; kept in sync by hand,
 * both being small and rarely-changed). A metricName not listed here is
 * unrecognized - callers must fail closed, exactly like an unrecognized
 * entry in FINANCIAL_METRIC_FIELD_MAP already does at promotion time; this
 * module rejects it earlier, at ingestion time, so a bad metric name never
 * even reaches a candidate.
 */
export const CANONICAL_UNIT_BY_METRIC: Record<string, FinancialUnit> = {
  cash: "USD_MILLIONS",
  total_debt: "USD_MILLIONS",
  secured_debt: "USD_MILLIONS",
  covenant_ebitda: "USD_MILLIONS",
  interest_expense: "USD_MILLIONS",
  cumulative_net_income: "USD_MILLIONS",
  equity_proceeds: "USD_MILLIONS",
  assumed_new_debt_rate_pct: "PERCENT",
};

/**
 * Extreme-magnitude sanity ceiling per canonical unit - deliberately generous
 * (this is a last-resort "something is off by orders of magnitude" check,
 * not a plausibility model of any specific company's real financials).
 * USD_MILLIONS: 10,000,000 = $10 trillion, far beyond any real company's
 * balance sheet - exactly the kind of value a 10^6x unit-scale bug like the
 * one this fix closes would produce. PERCENT: 1,000% - no real covenant
 * rate/ratio approaches this; catches a raw dollar figure or a
 * ratio-vs-percent mixup landing in a percent field.
 */
const SANITY_CEILING_BY_UNIT: Partial<Record<FinancialUnit, number>> = {
  USD_MILLIONS: 10_000_000,
  PERCENT: 1000,
};

export class UnrecognizedMetricError extends Error {
  constructor(metricName: string) {
    super(`normalizeFinancialValue: metricName "${metricName}" is not in CANONICAL_UNIT_BY_METRIC - unrecognized metric, refusing to guess a unit for it.`);
  }
}

export class IncompatibleUnitError extends Error {
  constructor(metricName: string, declaredUnit: FinancialUnit, canonicalUnit: FinancialUnit) {
    super(`normalizeFinancialValue: metricName "${metricName}" expects a ${canonicalUnit === "PERCENT" || canonicalUnit === "RATIO" ? "percentage/ratio" : canonicalUnit === "COUNT" ? "count" : "dollar-denominated"} unit (its canonical unit is ${canonicalUnit}), but the declared unit was ${declaredUnit} - refusing to convert between incompatible unit kinds (e.g. a dollar figure declared as PERCENT, or vice versa).`);
  }
}

export interface FinancialValueNormalization {
  canonicalUnit: FinancialUnit;
  /** The value exactly as declared in the source, unmodified - preserved alongside the normalized value, never discarded. */
  originalValue: number;
  originalUnit: FinancialUnit;
  /** The declared value converted deterministically into canonicalUnit - this is what actually gets promoted into FinancialSnapshot/FinancialState. */
  normalizedValue: number;
  /** false when normalizedValue exceeds this unit's SANITY_CEILING_BY_UNIT - the value still converts and is still returned (this is not a hard rejection, unlike UnrecognizedMetricError/IncompatibleUnitError), but the caller must flag the resulting candidate REVIEW_REQUIRED rather than trust it silently. */
  withinSanityBounds: boolean;
  sanityNote?: string;
}

/**
 * Converts one declared (metricName, value, unit) into this metric's
 * canonical unit. Throws UnrecognizedMetricError/IncompatibleUnitError for
 * the two HARD failure cases (never converts across incompatible unit
 * kinds, never guesses a unit for an unknown metric) - callers must treat
 * those as ingestion errors (the row/fact is not created at all). A value
 * that converts successfully but fails the extreme-magnitude sanity check is
 * NOT thrown - it is returned with withinSanityBounds:false so the caller
 * can still create the candidate, just flagged REVIEW_REQUIRED instead of
 * the normal PENDING (a soft, human-reviewable concern, not a structural
 * error).
 */
export function normalizeFinancialValue(metricName: string, value: number, unit: FinancialUnit): FinancialValueNormalization {
  const canonicalUnit = CANONICAL_UNIT_BY_METRIC[metricName];
  if (!canonicalUnit) throw new UnrecognizedMetricError(metricName);

  let normalizedValue: number;
  if (DOLLAR_UNITS.has(canonicalUnit)) {
    if (!DOLLAR_UNITS.has(unit)) throw new IncompatibleUnitError(metricName, unit, canonicalUnit);
    const canonicalDollarUnit = canonicalUnit as "USD" | "USD_THOUSANDS" | "USD_MILLIONS";
    const declaredDollarUnit = unit as "USD" | "USD_THOUSANDS" | "USD_MILLIONS";
    normalizedValue = (value * DOLLARS_PER_UNIT[declaredDollarUnit]) / DOLLARS_PER_UNIT[canonicalDollarUnit];
  } else if (canonicalUnit === "PERCENT" || canonicalUnit === "RATIO") {
    if (unit !== "PERCENT" && unit !== "RATIO") throw new IncompatibleUnitError(metricName, unit, canonicalUnit);
    // RATIO (e.g. 0.075) <-> PERCENT (e.g. 7.5) differ by a factor of 100;
    // same-unit-to-same-unit is a no-op regardless of which of the two this
    // metric's canonical unit happens to be.
    if (unit === canonicalUnit) normalizedValue = value;
    else normalizedValue = canonicalUnit === "PERCENT" ? value * 100 : value / 100;
  } else if (canonicalUnit === "COUNT") {
    if (unit !== "COUNT") throw new IncompatibleUnitError(metricName, unit, canonicalUnit);
    normalizedValue = value;
  } else {
    // Exhaustiveness guard - every FinancialUnit is handled above.
    throw new UnrecognizedMetricError(metricName);
  }

  const ceiling = SANITY_CEILING_BY_UNIT[canonicalUnit];
  const withinSanityBounds = ceiling === undefined || Math.abs(normalizedValue) <= ceiling;
  return {
    canonicalUnit,
    originalValue: value,
    originalUnit: unit,
    normalizedValue,
    withinSanityBounds,
    sanityNote: withinSanityBounds ? undefined : `Normalized value ${normalizedValue} ${canonicalUnit} exceeds the extreme-magnitude sanity ceiling of ${ceiling} ${canonicalUnit} for metric "${metricName}" - flagged for human review rather than silently trusted.`,
  };
}

export function isFinancialUnit(value: unknown): value is FinancialUnit {
  return typeof value === "string" && (FINANCIAL_UNITS as readonly string[]).includes(value);
}
