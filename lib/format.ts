import type { EvaluationStatus } from "./covenant-engine";
import type { MaxCapacityResult } from "./solver/types";
import type { MetricResult } from "./financial-core/types";

/** For plain financial figures (EBITDA, cash, debt principal, ...) - never used for a status-carrying capacity result, see fmtCapacity below. */
export function fmtM(n: number): string {
  if (!isFinite(n)) return "n/a";
  return "$" + Math.round(n).toLocaleString("en-US") + "M";
}

export function fmtX(n: number): string {
  return isFinite(n) ? n.toFixed(2) + "x" : "n/m";
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The ONLY formatter that should render an EvaluatedProvision/document/
 * cross-document capacity figure. "Unlimited" is shown ONLY when the engine
 * asserts status === "modeled" with an infinite capacity (an explicit
 * RATIO_GATE result) - never as a fallback for missing or incomplete
 * configuration, which instead renders "Not tested" / "Review required" so
 * an unmodeled covenant can never be mistaken for a real, uncapped basket.
 */
export function fmtCapacity(status: EvaluationStatus, capacity?: number): string {
  if (status === "not_tested") return "Not tested";
  if (status === "review_required") return "Review required";
  if (capacity === undefined || !isFinite(capacity)) return "Unlimited";
  return fmtM(capacity);
}

/**
 * The ONLY formatter that should render a solver-native `MaxCapacityResult`
 * (lib/solver/types.ts §O) - never `$0`/"Unlimited" for a non-EXACT tag, per
 * task hard requirement §3/§5. `undefined` (no maximumCapacity computed at
 * all - e.g. no governing document modeled for this side) renders "Not
 * modeled," distinct from every other explicit fail-closed state below.
 */
export function fmtMaxCapacity(mc: MaxCapacityResult | undefined): string {
  if (!mc) return "Not modeled";
  switch (mc.kind) {
    case "EXACT":
      return fmtM(mc.amount);
    case "BOUNDED_RANGE":
      return mc.upperBound !== undefined ? `${fmtM(mc.lowerBound)} – ${fmtM(mc.upperBound)}` : `≥ ${fmtM(mc.lowerBound)}`;
    case "SCENARIO_DEPENDENT":
      return "Scenario-dependent";
    case "ASSUMPTION_REQUIRED":
      return "Missing input";
    case "REVIEW_REQUIRED":
      return "Review required";
  }
}

/**
 * Renders a `GenericFinancialMetrics` field (lib/financial-core/types.ts
 * `MetricResult`) as an "x" multiple - "Missing input" / "Not evaluated"
 * (never `0x`/blank) when `status !== "OK"`, per task hard requirement §3/§5.
 */
export function fmtMetric(m: MetricResult): string {
  if (m.status === "UNAVAILABLE_MISSING_INPUT") return "Missing input";
  if (m.status === "UNAVAILABLE_INVALID_DENOMINATOR") return "Not evaluated";
  if (m.value === null) return "Not evaluated";
  return fmtX(m.value);
}

/** A short, human explanation for a non-EXACT MaxCapacityResult, for a warning/detail line beside fmtMaxCapacity's headline. Undefined for EXACT (nothing to explain) or a missing result. */
export function maxCapacityDetail(mc: MaxCapacityResult | undefined): string | undefined {
  if (!mc) return undefined;
  switch (mc.kind) {
    case "EXACT":
      return undefined;
    case "BOUNDED_RANGE":
      return mc.reason;
    case "SCENARIO_DEPENDENT":
      return `${mc.scenarios.length} scenario(s) modeled - depends on assumption selected.`;
    case "ASSUMPTION_REQUIRED":
      return `Missing: ${mc.missingFields.join("; ")}`;
    case "REVIEW_REQUIRED":
      return mc.reason;
  }
}
