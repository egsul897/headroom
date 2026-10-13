/**
 * Customer-facing figure semantics — explicit labels for numerical claims.
 *
 * Soft gate: reported / contractually derived / gross / verified remaining /
 * hypothetical must never silently collapse into one unlabeled number.
 *
 * This module does not compute capacity. It classifies claims for Position,
 * Dashboard, Ask, and Audit surfaces that already obtained numbers elsewhere.
 */

export type CustomerFigureKind =
  | "REPORTED_FINANCIAL"
  | "CONTRACTUALLY_DERIVED"
  | "GROSS_CONTRACTUAL_CAPACITY"
  | "VERIFIED_REMAINING_CAPACITY"
  | "HYPOTHETICAL_SIMULATION"
  | "LEGACY_ENGINE_CAPACITY"
  | "UNSUPPORTED";

export type CustomerFigureClaim = {
  kind: CustomerFigureKind;
  /** Present only when the kind permits a number; null means withheld. */
  amount: string | number | null;
  currency: string | null;
  /** Binding snapshot / ledger / path provenance keys when available. */
  provenanceRefs: string[];
  /** Human-readable limitation — required when amount is shown under non-verified kinds. */
  limitation: string;
  /** True only when kind === VERIFIED_REMAINING_CAPACITY and amount is non-null. */
  mayPresentAsAvailableHeadroom: boolean;
};

const WITHHOLD: Omit<CustomerFigureClaim, "kind" | "limitation" | "provenanceRefs"> = {
  amount: null,
  currency: null,
  mayPresentAsAvailableHeadroom: false,
};

/**
 * Classify a numerical claim. Unknown / incomplete / hypothetical inputs never
 * upgrade to VERIFIED_REMAINING_CAPACITY.
 */
export function classifyCustomerFigure(args: {
  kind: CustomerFigureKind;
  amount?: string | number | null;
  currency?: string | null;
  provenanceRefs?: string[];
  limitation?: string;
  /** Utilization completeness + trusted issuer required for verified remaining. */
  utilizationComplete?: boolean;
  trustedIssuerActive?: boolean;
  /** Snapshot / IR evidence present for contractual derivation. */
  approvedSnapshotBound?: boolean;
  verifiedExecutionExecuted?: boolean;
}): CustomerFigureClaim {
  const provenanceRefs = args.provenanceRefs ?? [];
  const baseLimitation =
    args.limitation ??
    "Figure classification refused to upgrade incomplete evidence into verified remaining.";

  if (args.kind === "VERIFIED_REMAINING_CAPACITY") {
    const complete = Boolean(args.utilizationComplete && args.trustedIssuerActive && args.verifiedExecutionExecuted);
    if (!complete || args.amount == null) {
      return {
        kind: "UNSUPPORTED",
        ...WITHHOLD,
        provenanceRefs,
        limitation:
          "VERIFIED_REMAINING_CAPACITY withheld — utilization completeness, trusted issuer, and verified execution are required. Missing history is never zero.",
        mayPresentAsAvailableHeadroom: false,
      };
    }
    return {
      kind: "VERIFIED_REMAINING_CAPACITY",
      amount: args.amount,
      currency: args.currency ?? "USD",
      provenanceRefs,
      limitation: args.limitation ?? "Verified remaining under REQUIRE gates.",
      mayPresentAsAvailableHeadroom: true,
    };
  }

  if (args.kind === "GROSS_CONTRACTUAL_CAPACITY") {
    return {
      kind: "GROSS_CONTRACTUAL_CAPACITY",
      amount: args.amount ?? null,
      currency: args.currency ?? "USD",
      provenanceRefs,
      limitation: args.limitation ?? "Gross contractual capacity — not verified remaining; prior usage not netted as available headroom.",
      mayPresentAsAvailableHeadroom: false,
    };
  }

  if (args.kind === "HYPOTHETICAL_SIMULATION") {
    return {
      kind: "HYPOTHETICAL_SIMULATION",
      amount: args.amount ?? null,
      currency: args.currency ?? "USD",
      provenanceRefs,
      limitation: args.limitation ?? "Hypothetical simulation only — must not be labeled PRODUCTION_AVAILABLE or verified remaining.",
      mayPresentAsAvailableHeadroom: false,
    };
  }

  if (args.kind === "CONTRACTUALLY_DERIVED") {
    if (!args.approvedSnapshotBound) {
      return {
        kind: "UNSUPPORTED",
        ...WITHHOLD,
        provenanceRefs,
        limitation: "Contractually derived figure requires a bound APPROVED snapshot; refusing latest-quarter substitution.",
        mayPresentAsAvailableHeadroom: false,
      };
    }
    return {
      kind: "CONTRACTUALLY_DERIVED",
      amount: args.amount ?? null,
      currency: args.currency ?? "USD",
      provenanceRefs,
      limitation: args.limitation ?? "Contractually derived from APPROVED snapshot + rulebook — not ERP-reported and not verified remaining.",
      mayPresentAsAvailableHeadroom: false,
    };
  }

  if (args.kind === "REPORTED_FINANCIAL") {
    return {
      kind: "REPORTED_FINANCIAL",
      amount: args.amount ?? null,
      currency: args.currency ?? "USD",
      provenanceRefs,
      limitation: args.limitation ?? "Reported financial figure from approved certificate / delivered reporting — not capacity.",
      mayPresentAsAvailableHeadroom: false,
    };
  }

  if (args.kind === "LEGACY_ENGINE_CAPACITY") {
    return {
      kind: "LEGACY_ENGINE_CAPACITY",
      amount: args.amount ?? null,
      currency: args.currency ?? "USD",
      provenanceRefs,
      limitation: args.limitation ?? "LEGACY_ENGINE / NOT_CERTIFIED_4E — must not be presented as certified Phase 4A–4E capacity.",
      mayPresentAsAvailableHeadroom: false,
    };
  }

  return {
    kind: "UNSUPPORTED",
    ...WITHHOLD,
    provenanceRefs,
    limitation: baseLimitation,
    mayPresentAsAvailableHeadroom: false,
  };
}
