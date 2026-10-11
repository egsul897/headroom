/**
 * Shared Position / Simulate capacity state — presentation only.
 *
 * Consumes already-computed engine / verified-remaining results. Never
 * converts null remaining into a modeled number. Never labels GROSS or
 * HYPOTHETICAL as AVAILABLE.
 */

import type { ProductCapacityView } from "@/lib/capacity/product-capacity-view";
import {
  presentCapacityClaim,
  type CapacityClaimView,
} from "./status-contract";

export interface SeparatedCapacityClaims {
  grossContractual: CapacityClaimView;
  hypotheticalModeled: CapacityClaimView;
  verifiedRemaining: CapacityClaimView;
  unknownUnsupported: CapacityClaimView;
  bindingRestrictions: string[];
  sourceEvidence: string[];
  missingInputs: string[];
  /** True only when verified remaining may publish as AVAILABLE. */
  remainingAuthoritative: boolean;
}

/**
 * Project a shared ProductCapacityView into the separated claim columns
 * required by the CFO Position / Simulate surfaces.
 */
export function separateCapacityClaimsFromProductView(
  view: ProductCapacityView | null,
  extras?: {
    modeledAmountMillions?: number | null;
    bindingRestrictions?: string[];
    missingInputs?: string[];
  },
): SeparatedCapacityClaims {
  const missingInputs = [...(extras?.missingInputs ?? []), ...(view?.blockers ?? [])];
  const bindingRestrictions = [
    ...(extras?.bindingRestrictions ?? []),
    ...(view?.governingConditions ?? []),
    ...(view?.crossDocumentConstraints ?? []),
  ];
  const sourceEvidence = view?.sourceCitations ?? [];

  const grossContractual = presentCapacityClaim({
    claimKind: "GROSS_CONTRACTUAL",
    amountMillions: view?.grossCapacity ?? null,
    publicationLabel: "GROSS_CONTRACTUAL",
    unavailableReason:
      view?.grossCapacity == null && !view?.grossUnlimited
        ? "Gross contractual capacity not published by the shared capacity result."
        : null,
  });
  // Unlimited gross is still not AVAILABLE remaining — surface as guidance only.
  if (view?.grossUnlimited && grossContractual.amountMillions == null) {
    grossContractual.displayValue = "Unlimited (contractual ceiling)";
    grossContractual.guidance =
      "Gross contractual capacity is unlimited under the governing provision — not verified remaining.";
  }

  const modeled = extras?.modeledAmountMillions;
  const hypotheticalModeled = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: modeled ?? null,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason:
      modeled == null
        ? "No hypothetical / modeled capacity figure from the shared engine for this claim."
        : null,
  });

  const verifiedAmount =
    view?.mayPublishAvailable === true ? view.supportedRemainingCapacity : null;
  const verifiedRemaining = presentCapacityClaim({
    claimKind: verifiedAmount == null ? "UNAVAILABLE" : "REMAINING",
    amountMillions: verifiedAmount,
    remainingIsAuthoritative: view?.mayPublishAvailable === true && verifiedAmount != null,
    publicationLabel: view?.publicationLabel ?? "REFUSED",
    unavailableReason:
      verifiedAmount == null
        ? "Verified remaining refused — completeness / trusted-identity / publication gates not met. Null remaining is not converted to a modeled number."
        : null,
  });

  const unknownUnsupported = presentCapacityClaim({
    claimKind: "UNAVAILABLE",
    amountMillions: null,
    publicationLabel:
      view?.unknownUtilization || view?.utilizationKnowledge === "UNKNOWN"
        ? "UNKNOWN"
        : view?.publicationLabel === "REFUSED" || view?.publicationLabel === "NOT_DETERMINED"
          ? "UNSUPPORTED"
          : "UNKNOWN",
    unavailableReason:
      view?.unknownUtilization || view == null
        ? "Unknown or unsupported capacity — utilization incomplete or path not executable. Never treated as zero remaining."
        : view.note,
  });

  return {
    grossContractual,
    hypotheticalModeled,
    verifiedRemaining,
    unknownUnsupported,
    bindingRestrictions: [...new Set(bindingRestrictions)],
    sourceEvidence: [...new Set(sourceEvidence)],
    missingInputs: [...new Set(missingInputs)],
    remainingAuthoritative: verifiedRemaining.status === "VERIFIED_EXECUTABLE",
  };
}

/**
 * Consistency gate: Position and Simulate must show the same capacity state
 * for the same underlying ProductCapacityView pair.
 */
export function assertPositionSimulateCapacityConsistency(
  position: SeparatedCapacityClaims,
  simulate: SeparatedCapacityClaims,
): { ok: true } | { ok: false; diffs: string[] } {
  const diffs: string[] = [];
  if (position.grossContractual.amountMillions !== simulate.grossContractual.amountMillions) {
    diffs.push("grossContractual.amountMillions");
  }
  if (position.verifiedRemaining.amountMillions !== simulate.verifiedRemaining.amountMillions) {
    diffs.push("verifiedRemaining.amountMillions");
  }
  if (position.verifiedRemaining.status !== simulate.verifiedRemaining.status) {
    diffs.push("verifiedRemaining.status");
  }
  if (position.remainingAuthoritative !== simulate.remainingAuthoritative) {
    diffs.push("remainingAuthoritative");
  }
  return diffs.length === 0 ? { ok: true } : { ok: false, diffs };
}
