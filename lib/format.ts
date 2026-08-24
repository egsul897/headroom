import type { EvaluationStatus } from "./covenant-engine";

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
