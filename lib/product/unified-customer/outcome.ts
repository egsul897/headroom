/**
 * Outcome taxonomy for customer results.
 *
 * Hard rule: never display SUPPORTED_PERMISSION merely because one numerical
 * ratio (or one document) clears. Affirmative permission requires every tested
 * constraint to clear with no review/missing/unsupported residue.
 */

import type { CustomerOutcomeKind, OutcomeClassification } from "./types";

export interface ConstraintSignal {
  /** Engine transaction / evaluation status when available. */
  status?: "clear" | "blocked" | "review_required" | "not_tested" | string;
  /** True when this signal is a ratio test that passed in isolation. */
  ratioClearedInIsolation?: boolean;
  /** True when the constraint was actually evaluated (not skipped). */
  tested?: boolean;
  /** Explicit missing-input / readiness blockers. */
  missingEvidence?: boolean;
  /** Explicit unsupported / not modeled. */
  unsupported?: boolean;
  label?: string;
}

/**
 * Classify a set of constraint signals into the customer outcome taxonomy.
 * Order of precedence (fail-closed):
 *   MISSING_EVIDENCE → UNSUPPORTED_CALCULATION → SUPPORTED_PROHIBITION
 *   → CONDITIONAL_OR_REVIEW_REQUIRED → SUPPORTED_PERMISSION
 */
export function classifyCustomerOutcome(signals: ConstraintSignal[]): OutcomeClassification {
  if (signals.length === 0) {
    return {
      kind: "MISSING_EVIDENCE",
      label: "Missing evidence",
      rationale: "No evaluated constraints were available — Headroom will not invent a permission.",
      isAffirmativePermission: false,
    };
  }

  if (signals.some((s) => s.missingEvidence)) {
    return {
      kind: "MISSING_EVIDENCE",
      label: "Missing evidence",
      rationale: "Required contractual or financial evidence is missing.",
      isAffirmativePermission: false,
    };
  }

  if (signals.some((s) => s.unsupported || s.status === "not_tested")) {
    const labels = signals
      .filter((s) => s.unsupported || s.status === "not_tested")
      .map((s) => s.label)
      .filter(Boolean)
      .slice(0, 3);
    return {
      kind: "UNSUPPORTED_CALCULATION",
      label: "Unsupported calculation",
      rationale:
        labels.length > 0
          ? `Not fully modeled: ${labels.join("; ")}.`
          : "One or more governing constraints are not modeled — result withheld.",
      isAffirmativePermission: false,
    };
  }

  if (signals.some((s) => s.status === "blocked")) {
    return {
      kind: "SUPPORTED_PROHIBITION",
      label: "Supported prohibition",
      rationale: "At least one tested governing constraint blocks the proposed transaction.",
      isAffirmativePermission: false,
    };
  }

  if (signals.some((s) => s.status === "review_required" || s.tested === false)) {
    return {
      kind: "CONDITIONAL_OR_REVIEW_REQUIRED",
      label: "Conditional / review required",
      rationale: "Evaluation is incomplete or requires counsel review — not an affirmative permission.",
      isAffirmativePermission: false,
    };
  }

  const tested = signals.filter((s) => s.tested !== false && s.status === "clear");
  const onlyRatioCleared =
    tested.length > 0 &&
    tested.every((s) => s.ratioClearedInIsolation) &&
    signals.some((s) => s.ratioClearedInIsolation);

  // A lone clearing ratio never upgrades to permission.
  if (onlyRatioCleared && tested.length === 1) {
    return {
      kind: "CONDITIONAL_OR_REVIEW_REQUIRED",
      label: "Conditional / review required",
      rationale:
        "A single ratio cleared in isolation. Affirmative permission requires every applicable document and basket constraint to clear — not one ratio alone.",
      isAffirmativePermission: false,
    };
  }

  const allClear = signals.every((s) => s.status === "clear" && s.tested !== false);
  if (allClear && tested.length >= 1) {
    return {
      kind: "SUPPORTED_PERMISSION",
      label: "Supported permission",
      rationale: `All ${tested.length} tested governing constraint(s) clear for this scenario.`,
      isAffirmativePermission: true,
    };
  }

  return {
    kind: "CONDITIONAL_OR_REVIEW_REQUIRED",
    label: "Conditional / review required",
    rationale: "Mixed or incomplete constraint results — not an affirmative permission.",
    isAffirmativePermission: false,
  };
}

export function outcomeTone(
  kind: CustomerOutcomeKind,
): "pass" | "trip" | "tight" | "idle" {
  switch (kind) {
    case "SUPPORTED_PERMISSION":
      return "pass";
    case "SUPPORTED_PROHIBITION":
      return "trip";
    case "CONDITIONAL_OR_REVIEW_REQUIRED":
      return "tight";
    case "MISSING_EVIDENCE":
    case "UNSUPPORTED_CALCULATION":
      return "idle";
  }
}
