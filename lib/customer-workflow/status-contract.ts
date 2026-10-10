/**
 * Unified customer-facing status contract for Position / Ask / Simulate /
 * Documents / Evidence.
 *
 * Presentation only — never invents capacity arithmetic or legal permission.
 * UNKNOWN must never collapse to zero or unlimited. GROSS_CONTRACTUAL and
 * HYPOTHETICAL must never be labeled as verified production AVAILABLE.
 */

/** Matches components/ui ChipTone — kept local so lib stays React-free. */
export type CustomerStatusTone = "pass" | "trip" | "tight" | "idle" | "navy";

/** Canonical statuses the customer workflow must present consistently. */
export type CustomerStatusCode =
  | "VERIFIED_EXECUTABLE"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "AMBIGUOUS"
  | "REVIEW_REQUIRED"
  | "NEEDS_INPUT"
  | "NOT_PRODUCTION_AUTHORITATIVE"
  | "VERIFIED_UTILIZATION_COMPLETE"
  | "UNKNOWN"
  | "GROSS_CONTRACTUAL"
  | "HYPOTHETICAL";

export interface CustomerStatusPresentation {
  code: CustomerStatusCode;
  /** Full customer label (chip / row). */
  label: string;
  /** Compact label for dense rows. */
  shortLabel: string;
  tone: CustomerStatusTone;
  /**
   * True only when a numeric remaining may be published as customer AVAILABLE.
   * False for GROSS_CONTRACTUAL, HYPOTHETICAL, UNKNOWN, NOT_PRODUCTION_AUTHORITATIVE, etc.
   */
  mayPublishAvailable: boolean;
  /** Qualifier that must accompany any numeric figure when present. */
  numericQualifier: string | null;
  /** One-line guidance for CFO/treasury readers. */
  customerGuidance: string;
}

const CONTRACT: Record<CustomerStatusCode, CustomerStatusPresentation> = {
  VERIFIED_EXECUTABLE: {
    code: "VERIFIED_EXECUTABLE",
    label: "Verified executable",
    shortLabel: "VERIFIED_EXECUTABLE",
    tone: "pass",
    mayPublishAvailable: true,
    numericQualifier: "Verified remaining (production-authoritative path)",
    customerGuidance:
      "Underlying canonical gates support an executable path. Still not a legal approval.",
  },
  PARTIAL: {
    code: "PARTIAL",
    label: "Partial",
    shortLabel: "PARTIAL",
    tone: "navy",
    mayPublishAvailable: false,
    numericQualifier: "Partial — not a complete capacity claim",
    customerGuidance: "Some evidence exists; the claim is incomplete. Do not treat as available capacity.",
  },
  UNSUPPORTED: {
    code: "UNSUPPORTED",
    label: "Unsupported",
    shortLabel: "UNSUPPORTED",
    tone: "trip",
    mayPublishAvailable: false,
    numericQualifier: null,
    customerGuidance: "The engine cannot establish this rule or path. No favorable capacity is implied.",
  },
  AMBIGUOUS: {
    code: "AMBIGUOUS",
    label: "Ambiguous",
    shortLabel: "AMBIGUOUS",
    tone: "tight",
    mayPublishAvailable: false,
    numericQualifier: null,
    customerGuidance: "Competing readings or identities prevent a single authoritative answer.",
  },
  REVIEW_REQUIRED: {
    code: "REVIEW_REQUIRED",
    label: "Review required",
    shortLabel: "REVIEW_REQUIRED",
    tone: "tight",
    mayPublishAvailable: false,
    numericQualifier: null,
    customerGuidance: "A reviewer decision is required before this claim can be treated as settled.",
  },
  NEEDS_INPUT: {
    code: "NEEDS_INPUT",
    label: "Needs input",
    shortLabel: "NEEDS_INPUT",
    tone: "tight",
    mayPublishAvailable: false,
    numericQualifier: null,
    customerGuidance: "Required financial or utilization inputs are missing. Figures stay blank — not zero.",
  },
  NOT_PRODUCTION_AUTHORITATIVE: {
    code: "NOT_PRODUCTION_AUTHORITATIVE",
    label: "Modeled / not verified",
    shortLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    tone: "navy",
    mayPublishAvailable: false,
    numericQualifier: "MODELED / NOT VERIFIED",
    customerGuidance:
      "Legacy or modeled figures may appear for evaluation. They are not production-authoritative available capacity.",
  },
  VERIFIED_UTILIZATION_COMPLETE: {
    code: "VERIFIED_UTILIZATION_COMPLETE",
    label: "Utilization verified complete",
    shortLabel: "VERIFIED_UTILIZATION_COMPLETE",
    tone: "pass",
    mayPublishAvailable: true,
    numericQualifier: "Utilization completeness certified for this path",
    customerGuidance:
      "Attributed utilization is complete for the path. Remaining still requires a satisfied capacity gate.",
  },
  UNKNOWN: {
    code: "UNKNOWN",
    label: "Unknown",
    shortLabel: "UNKNOWN",
    tone: "idle",
    mayPublishAvailable: false,
    numericQualifier: null,
    customerGuidance: "Unknown is not zero and not unlimited. No numeric capacity is invented.",
  },
  GROSS_CONTRACTUAL: {
    code: "GROSS_CONTRACTUAL",
    label: "Gross contractual",
    shortLabel: "GROSS_CONTRACTUAL",
    tone: "navy",
    mayPublishAvailable: false,
    numericQualifier: "Gross contractual — not remaining available",
    customerGuidance:
      "Gross contractual capacity is a ceiling before verified utilization. It is not actual available capacity.",
  },
  HYPOTHETICAL: {
    code: "HYPOTHETICAL",
    label: "Hypothetical",
    shortLabel: "HYPOTHETICAL",
    tone: "navy",
    mayPublishAvailable: false,
    numericQualifier: "Hypothetical — does not post to the ledger",
    customerGuidance:
      "Simulation or scenario result only. Never treat as verified production capacity or legal approval.",
  },
};

/** Resolve presentation for a canonical customer status code. */
export function presentCustomerStatus(code: CustomerStatusCode): CustomerStatusPresentation {
  return CONTRACT[code];
}

export function allCustomerStatusCodes(): CustomerStatusCode[] {
  return Object.keys(CONTRACT) as CustomerStatusCode[];
}

/**
 * Map common engine / product labels onto the unified customer contract.
 * Fail closed: unrecognized → REVIEW_REQUIRED (never AVAILABLE/CLEAR upgrade).
 */
export function mapEngineLabelToCustomerStatus(raw: string | null | undefined): CustomerStatusCode {
  if (!raw) return "UNKNOWN";
  const key = raw.trim().toUpperCase().replace(/\s+/g, "_");

  if (key === "VERIFIED_EXECUTABLE" || key === "CERTIFIED_EXECUTED") {
    return "VERIFIED_EXECUTABLE";
  }
  if (key === "AVAILABLE" || key === "SUPPORTED_REMAINING" || key === "EXECUTABLE") {
    // AVAILABLE / SUPPORTED_REMAINING / rulebook EXECUTABLE are not production-
    // authoritative on main until authenticity + trusted-issuer gates land (PR #268).
    return "NOT_PRODUCTION_AUTHORITATIVE";
  }
  if (key === "GROSS_CONTRACTUAL" || key === "GROSS_ONLY" || key === "KNOWN_ATTRIBUTED_ONLY") {
    return "GROSS_CONTRACTUAL";
  }
  if (key === "HYPOTHETICAL" || key === "LEGACY_LABELED" || key === "LEGACY_ENGINE") {
    return "HYPOTHETICAL";
  }
  if (
    key === "PARTIAL" ||
    key === "PARTIALLY_KNOWN" ||
    key === "RESOLVED_PARTIAL" ||
    key === "PARTIAL_ATTRIBUTED_USAGE" ||
    key === "SHARED_POOL" ||
    key === "SHARED_CAPACITY"
  ) {
    return "PARTIAL";
  }
  if (key === "UNSUPPORTED" || key === "NOT_TRACKED" || key === "NOT_MODELED" || key === "UNMODELED" || key === "NOT_TESTED") {
    return "UNSUPPORTED";
  }
  if (key === "AMBIGUOUS" || key === "FINANCIAL_IDENTITY_AMBIGUOUS" || key === "UNRESOLVED_PRECEDENCE") {
    return "AMBIGUOUS";
  }
  if (
    key === "REVIEW_REQUIRED" ||
    key === "REFUSED" ||
    key === "GATE_FAILED" ||
    key === "NOT_DETERMINED" ||
    key === "NOT_DETERMINABLE"
  ) {
    return "REVIEW_REQUIRED";
  }
  if (
    key === "NEEDS_INPUT" ||
    key === "ASSUMPTION_REQUIRED" ||
    key === "NO_FINANCIAL_SNAPSHOT" ||
    key === "MISSING" ||
    key === "NEEDS_CONFIRMATION" ||
    key === "INSUFFICIENT_EVIDENCE"
  ) {
    return "NEEDS_INPUT";
  }
  if (
    key === "NOT_PRODUCTION_AUTHORITATIVE" ||
    key === "MODELED" ||
    key === "NOT_CERTIFIED_4E" ||
    key === "MODELED_CROSS_DOCUMENT" ||
    key === "EXECUTABLE" ||
    key === "REVIEWED" ||
    key === "INTERPRETED" ||
    key === "DISCOVERED"
  ) {
    // RulebookStage EXECUTABLE is legacy Permission readiness — not production AVAILABLE.
    return key === "DISCOVERED" || key === "INTERPRETED" ? "PARTIAL" : "NOT_PRODUCTION_AUTHORITATIVE";
  }
  if (key === "VERIFIED_UTILIZATION_COMPLETE" || key === "VERIFIED_COMPLETE" || key === "VERIFIED_EMPTY") {
    return "VERIFIED_UTILIZATION_COMPLETE";
  }
  if (key === "UNKNOWN" || key === "NONE" || key === "DISCOVERY_ONLY" || key === "NO_DOCUMENTS") {
    return "UNKNOWN";
  }
  if (key === "CLEAR" || key === "PERMITTED") {
    // Legacy simulate "clear" is hypothetical unless verified path says otherwise.
    return "HYPOTHETICAL";
  }
  return "REVIEW_REQUIRED";
}

/**
 * Ask answer kind → customer status. Never upgrades fluent narrative to verified.
 */
export function mapAskAnswerKindToCustomerStatus(
  kind: string | null | undefined,
  opts?: { verifiedExecutable?: boolean },
): CustomerStatusCode {
  if (opts?.verifiedExecutable === true && kind === "certified") return "VERIFIED_EXECUTABLE";
  switch (kind) {
    case "certified":
      // Without verifiedExecutable flag, refuse upgrade.
      return "REVIEW_REQUIRED";
    case "legacy_labeled":
      return "HYPOTHETICAL";
    case "needs_confirmation":
    case "insufficient_evidence":
      return "NEEDS_INPUT";
    case "review_required":
      return "REVIEW_REQUIRED";
    case "refused":
      return "UNSUPPORTED";
    default:
      return "REVIEW_REQUIRED";
  }
}

/**
 * Simulate / transaction engine status → customer status.
 * `clear` is HYPOTHETICAL unless the verified path is executable.
 */
export function mapSimulateStatusToCustomerStatus(
  status: string | null | undefined,
  opts?: { verifiedExecutable?: boolean; authoritative?: boolean },
): CustomerStatusCode {
  if (opts?.verifiedExecutable === true && opts?.authoritative === true) {
    return "VERIFIED_EXECUTABLE";
  }
  const key = (status ?? "").toLowerCase();
  if (key === "clear" || key === "permitted" || key === "ok") return "HYPOTHETICAL";
  if (key === "blocked") return "UNSUPPORTED";
  if (key === "review_required") return "REVIEW_REQUIRED";
  if (key === "not_tested") return "UNSUPPORTED";
  return mapEngineLabelToCustomerStatus(status);
}

/**
 * Format a capacity amount for customers. Unknown/null → em dash, never "$0M".
 */
export function formatCustomerAmountMillions(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  if (!Number.isFinite(amount)) return "—";
  return `$${Math.round(amount).toLocaleString("en-US")}M`;
}

export interface CapacityClaimView {
  /** What the figure represents. */
  claimKind: "GROSS_CONTRACTUAL" | "ATTRIBUTED_USAGE" | "REMAINING" | "UNAVAILABLE";
  status: CustomerStatusCode;
  amountMillions: number | null;
  /** Ready-to-render value (never invents zero for unknown). */
  displayValue: string;
  /** Customer-facing claim label (e.g. MODELED / NOT VERIFIED). */
  claimLabel: string;
  guidance: string;
}

/**
 * Build a capacity claim presentation from already-computed engine outputs.
 * Does not perform arithmetic. remainingIsAuthoritative must come from the
 * canonical authority path — on current main (PR #268 unmerged) pass false
 * for legacy dashboard remainingCapacity.
 */
export function presentCapacityClaim(args: {
  claimKind: CapacityClaimView["claimKind"];
  amountMillions?: number | null;
  publicationLabel?: string | null;
  remainingIsAuthoritative?: boolean;
  utilizationComplete?: boolean;
  unavailableReason?: string | null;
}): CapacityClaimView {
  if (args.claimKind === "UNAVAILABLE" || args.amountMillions === null || args.amountMillions === undefined) {
    const status = mapEngineLabelToCustomerStatus(args.publicationLabel) === "UNKNOWN"
      ? "UNKNOWN"
      : args.unavailableReason
        ? "NEEDS_INPUT"
        : "UNKNOWN";
    const presented = presentCustomerStatus(status);
    return {
      claimKind: args.claimKind === "UNAVAILABLE" ? "UNAVAILABLE" : args.claimKind,
      status,
      amountMillions: null,
      displayValue: "—",
      claimLabel: presented.shortLabel,
      guidance: args.unavailableReason ?? presented.customerGuidance,
    };
  }

  if (args.claimKind === "GROSS_CONTRACTUAL") {
    const presented = presentCustomerStatus("GROSS_CONTRACTUAL");
    return {
      claimKind: "GROSS_CONTRACTUAL",
      status: "GROSS_CONTRACTUAL",
      amountMillions: args.amountMillions,
      displayValue: formatCustomerAmountMillions(args.amountMillions),
      claimLabel: presented.label,
      guidance: presented.customerGuidance,
    };
  }

  if (args.claimKind === "ATTRIBUTED_USAGE") {
    const status = args.utilizationComplete
      ? "VERIFIED_UTILIZATION_COMPLETE"
      : "PARTIAL";
    const presented = presentCustomerStatus(status);
    return {
      claimKind: "ATTRIBUTED_USAGE",
      status,
      amountMillions: args.amountMillions,
      displayValue: formatCustomerAmountMillions(args.amountMillions),
      claimLabel: presented.label,
      guidance: presented.customerGuidance,
    };
  }

  // REMAINING
  if (args.remainingIsAuthoritative === true) {
    const presented = presentCustomerStatus("VERIFIED_EXECUTABLE");
    return {
      claimKind: "REMAINING",
      status: "VERIFIED_EXECUTABLE",
      amountMillions: args.amountMillions,
      displayValue: formatCustomerAmountMillions(args.amountMillions),
      claimLabel: "AVAILABLE (verified)",
      guidance: presented.customerGuidance,
    };
  }

  const presented = presentCustomerStatus("NOT_PRODUCTION_AUTHORITATIVE");
  return {
    claimKind: "REMAINING",
    status: "NOT_PRODUCTION_AUTHORITATIVE",
    amountMillions: args.amountMillions,
    displayValue: formatCustomerAmountMillions(args.amountMillions),
    claimLabel: "MODELED / NOT VERIFIED",
    guidance: presented.customerGuidance,
  };
}

/** True when a favorable AVAILABLE label would be a false customer claim. */
export function wouldBeFalseFavorableAvailable(args: {
  remainingIsAuthoritative?: boolean;
  publicationLabel?: string | null;
  statusCode?: CustomerStatusCode;
}): boolean {
  if (args.remainingIsAuthoritative === true) return false;
  const code = args.statusCode ?? mapEngineLabelToCustomerStatus(args.publicationLabel);
  return !presentCustomerStatus(code).mayPublishAvailable;
}
