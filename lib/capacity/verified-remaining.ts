/**
 * Verified remaining capacity = gross − attributed utilization, only when
 * utilization knowledge supports a remaining claim.
 *
 * A correct gross calculation is not a transaction permission. Failed gates
 * never publish AVAILABLE. Unknown utilization never yields a numeric remaining.
 */
import type { UtilizationResolution } from "./utilization-types";
import { resolveUtilization, type ResolveUtilizationArgs } from "./utilization-resolver";

export type RemainingClaimStatus =
  | "REMAINING_SUPPORTED"
  | "GROSS_ONLY"
  | "GATE_FAILED"
  | "REFUSED"
  | "NOT_DETERMINED";

export type CapacityPublicationLabel =
  | "GROSS_CONTRACTUAL"
  | "SUPPORTED_REMAINING"
  | "AVAILABLE"
  | "REVIEW_REQUIRED"
  | "REFUSED"
  | "NOT_DETERMINED";

export interface GrossCapacityInput {
  /** Gross contractual capacity in the same units as utilization amounts. */
  amount: number | null;
  /** Infinity only for explicit unlimited-gate formulas that passed. */
  unlimited?: boolean;
  /** Gate must be satisfied for AVAILABLE / remaining publication. */
  gateSatisfied: boolean;
  /** Evaluation produced a modeled number (vs review_required / error). */
  modeled: boolean;
  currency?: string | null;
  formulaLabel?: string | null;
  sectionRef?: string | null;
  capacityRuleId: string;
  refusalReason?: string | null;
}

export interface VerifiedRemainingResult {
  capacityRuleId: string;
  asOf: string;
  grossCapacity: number | null;
  grossUnlimited: boolean;
  utilization: UtilizationResolution;
  knownUtilization: number | null;
  unknownUtilization: boolean;
  supportedRemaining: number | null;
  remainingStatus: RemainingClaimStatus;
  /** Product publication label — never AVAILABLE when gate failed or util unknown. */
  publicationLabel: CapacityPublicationLabel;
  governingConditions: string[];
  crossDocumentConstraints: string[];
  sourceCitations: string[];
  certificationStatus: "PARTIAL_ADAPTER" | "NOT_CERTIFIED" | "CERTIFIED" | "N_A";
  blockers: string[];
  note: string;
  /** True only when publicationLabel is AVAILABLE and remaining is supported. */
  mayPublishAvailable: boolean;
}

export interface ComputeVerifiedRemainingArgs {
  gross: GrossCapacityInput;
  utilization: ResolveUtilizationArgs | UtilizationResolution;
  governingConditions?: string[];
  crossDocumentConstraints?: string[];
  sourceCitations?: string[];
  certificationStatus?: VerifiedRemainingResult["certificationStatus"];
  /**
   * Test/demo only. When false (default), SYNTHETIC_LABELED evidence cannot
   * publish AVAILABLE / supported remaining even with a completeness cert.
   */
  allowSyntheticRemaining?: boolean;
}

function isResolution(u: ResolveUtilizationArgs | UtilizationResolution): u is UtilizationResolution {
  return "supportsRemainingClaim" in u && "knowledge" in u && "recordsConsidered" in u;
}

/**
 * Compute verified remaining from gross + utilization resolution.
 * Never invents zero utilization. Never publishes AVAILABLE on failed gates.
 */
export function computeVerifiedRemaining(args: ComputeVerifiedRemainingArgs): VerifiedRemainingResult {
  const utilization = isResolution(args.utilization)
    ? args.utilization
    : resolveUtilization({
        ...args.utilization,
        // Propagate demo hatch into resolver so SYNTHETIC_LABELED completeness can resolve.
        allowSyntheticRemaining:
          args.utilization.allowSyntheticRemaining ?? args.allowSyntheticRemaining,
      });
  const gross = args.gross;
  const blockers = [...utilization.blockers];
  const governingConditions = args.governingConditions ?? [];
  const crossDocumentConstraints = args.crossDocumentConstraints ?? [];
  const sourceCitations = args.sourceCitations ?? [];
  const certificationStatus = args.certificationStatus ?? "NOT_CERTIFIED";

  // Synthetic-only or mixed authentic/synthetic evidence never publishes customer
  // AVAILABLE / remaining unless explicitly allowed for labeled demos/tests
  // (never set by production Position / Simulate / Ask loaders).
  const applied = utilization.recordsApplied ?? [];
  const authenticityKinds = new Set(applied.map((r) => r.authenticity));
  const syntheticOnly =
    applied.length > 0 && applied.every((r) => r.authenticity === "SYNTHETIC_LABELED");
  const mixedAuthenticity =
    authenticityKinds.has("AUTHENTIC") && authenticityKinds.has("SYNTHETIC_LABELED");
  const blockSynthetic =
    (syntheticOnly || mixedAuthenticity) &&
    utilization.supportsRemainingClaim &&
    !args.allowSyntheticRemaining;
  // Production surfaces refuse remaining unless productionAuthoritative (or demo hatch).
  const supportsRemaining =
    utilization.supportsRemainingClaim &&
    !blockSynthetic &&
    (utilization.productionAuthoritative === true || args.allowSyntheticRemaining === true);
  if (blockSynthetic) {
    blockers.push(
      mixedAuthenticity
        ? "mixed authentic and synthetic utilization evidence cannot establish production-authoritative remaining"
        : "synthetic-labeled utilization evidence cannot publish authoritative remaining",
    );
  }
  if (
    utilization.supportsRemainingClaim &&
    utilization.productionAuthoritative !== true &&
    !args.allowSyntheticRemaining
  ) {
    blockers.push(
      "authoritative remaining refused — completeness not production-authoritative (missing authenticity or unverified issuer)",
    );
  }

  if (gross.refusalReason) {
    return {
      capacityRuleId: gross.capacityRuleId,
      asOf: utilization.asOf,
      grossCapacity: null,
      grossUnlimited: false,
      utilization,
      knownUtilization: null,
      unknownUtilization: true,
      supportedRemaining: null,
      remainingStatus: "REFUSED",
      publicationLabel: "REFUSED",
      governingConditions,
      crossDocumentConstraints,
      sourceCitations,
      certificationStatus,
      blockers: [...blockers, gross.refusalReason],
      note: gross.refusalReason,
      mayPublishAvailable: false,
    };
  }

  if (!gross.modeled || (!gross.unlimited && gross.amount == null)) {
    return {
      capacityRuleId: gross.capacityRuleId,
      asOf: utilization.asOf,
      grossCapacity: gross.amount,
      grossUnlimited: false,
      utilization,
      knownUtilization: utilization.supportsRemainingClaim ? utilization.attributedAmount : null,
      unknownUtilization: !utilization.supportsRemainingClaim,
      supportedRemaining: null,
      remainingStatus: "NOT_DETERMINED",
      publicationLabel: "NOT_DETERMINED",
      governingConditions,
      crossDocumentConstraints,
      sourceCitations,
      certificationStatus,
      blockers: [...blockers, "gross capacity not modeled"],
      note: "Gross capacity not determined — remaining cannot be claimed.",
      mayPublishAvailable: false,
    };
  }

  if (!gross.gateSatisfied) {
    return {
      capacityRuleId: gross.capacityRuleId,
      asOf: utilization.asOf,
      grossCapacity: gross.amount,
      grossUnlimited: false,
      utilization,
      knownUtilization: utilization.supportsRemainingClaim ? utilization.attributedAmount : null,
      unknownUtilization: !utilization.supportsRemainingClaim,
      supportedRemaining: null,
      remainingStatus: "GATE_FAILED",
      publicationLabel: "REVIEW_REQUIRED",
      governingConditions,
      crossDocumentConstraints,
      sourceCitations,
      certificationStatus,
      blockers: [...blockers, "capacity gate not satisfied — cannot publish AVAILABLE"],
      note: "Gate failed — remaining not published as AVAILABLE (A8-01 / unsafe-favorable guard).",
      mayPublishAvailable: false,
    };
  }

  const grossCapacity = gross.unlimited ? null : gross.amount;
  const grossUnlimited = Boolean(gross.unlimited);

  if (!supportsRemaining) {
    // Known attributed amount may still be reportable; unknown/completeness gap
    // blocks remaining. Never treat known attributed rows as a complete set.
    return {
      capacityRuleId: gross.capacityRuleId,
      asOf: utilization.asOf,
      grossCapacity,
      grossUnlimited,
      utilization,
      knownUtilization: utilization.attributedAmount,
      unknownUtilization: true,
      supportedRemaining: null,
      remainingStatus: "GROSS_ONLY",
      publicationLabel: "GROSS_CONTRACTUAL",
      governingConditions,
      crossDocumentConstraints,
      sourceCitations,
      certificationStatus,
      blockers,
      note: `Gross contractual capacity known; utilization ${utilization.knowledge} — remaining not supported. ${utilization.note}`,
      mayPublishAvailable: false,
    };
  }

  const used = utilization.attributedAmount ?? 0;
  if (grossUnlimited) {
    return {
      capacityRuleId: gross.capacityRuleId,
      asOf: utilization.asOf,
      grossCapacity: null,
      grossUnlimited: true,
      utilization,
      knownUtilization: used,
      unknownUtilization: false,
      supportedRemaining: null,
      remainingStatus: "REMAINING_SUPPORTED",
      publicationLabel: "AVAILABLE",
      governingConditions,
      crossDocumentConstraints,
      sourceCitations,
      certificationStatus,
      blockers,
      note: `Unlimited gross capacity with verified utilization knowledge (${utilization.knowledge}); finite remaining not applicable.`,
      mayPublishAvailable: true,
    };
  }

  const remaining = (gross.amount as number) - used;
  const overConsumed = remaining < 0;

  return {
    capacityRuleId: gross.capacityRuleId,
    asOf: utilization.asOf,
    grossCapacity: gross.amount,
    grossUnlimited: false,
    utilization,
    knownUtilization: used,
    unknownUtilization: false,
    supportedRemaining: remaining,
    remainingStatus: "REMAINING_SUPPORTED",
    publicationLabel: overConsumed ? "REVIEW_REQUIRED" : "AVAILABLE",
    governingConditions,
    crossDocumentConstraints,
    sourceCitations,
    certificationStatus,
    blockers: overConsumed
      ? [...blockers, "attributed utilization exceeds gross capacity"]
      : blockers,
    note: overConsumed
      ? `Gross ${gross.amount} − attributed ${used} = ${remaining} (over-consumed; REVIEW_REQUIRED, not AVAILABLE).`
      : `Gross ${gross.amount} − attributed ${used} = supported remaining ${remaining} (${utilization.knowledge}).`,
    mayPublishAvailable: !overConsumed,
  };
}
