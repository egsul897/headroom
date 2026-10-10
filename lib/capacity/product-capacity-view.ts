/**
 * Shared product capacity view for Position, Simulate, and Ask.
 *
 * Single verified-capacity result shape — no parallel calculation engine.
 * Surfaces: gross, known/unknown utilization, supported remaining,
 * governing conditions, cross-document constraints, citations, certification.
 */
import type { VerifiedRemainingResult } from "./verified-remaining";
import { computeVerifiedRemaining, type ComputeVerifiedRemainingArgs } from "./verified-remaining";

export type ProductSurface = "POSITION" | "SIMULATE" | "ASK";

export interface ProductCapacityView {
  surface: ProductSurface;
  capacityRuleId: string;
  asOf: string;
  /** Gross contractual capacity (may be known while remaining is not). */
  grossCapacity: number | null;
  grossUnlimited: boolean;
  knownUtilization: number | null;
  unknownUtilization: boolean;
  utilizationKnowledge: string;
  supportedRemainingCapacity: number | null;
  governingConditions: string[];
  crossDocumentConstraints: string[];
  sourceCitations: string[];
  certificationStatus: string;
  publicationLabel: string;
  remainingStatus: string;
  mayPublishAvailable: boolean;
  blockers: string[];
  note: string;
  authenticityOfUtilization: "AUTHENTIC" | "SYNTHETIC_LABELED" | "MIXED" | "NONE";
}

function utilizationAuthenticity(result: VerifiedRemainingResult): ProductCapacityView["authenticityOfUtilization"] {
  const applied = result.utilization.recordsApplied;
  if (applied.length === 0) return "NONE";
  const kinds = new Set(applied.map((r) => r.authenticity));
  if (kinds.size === 1) return [...kinds][0]!;
  return "MIXED";
}

/**
 * Product surfaces refuse authoritative remaining unless completeness is
 * production-authoritative. Demo/synthetic remaining is stripped for
 * POSITION / SIMULATE / ASK publication (same rule on all three).
 */
export function refuseAuthoritativeRemaining(
  result: VerifiedRemainingResult,
): {
  remaining: number | null;
  mayPublishAvailable: boolean;
  publicationLabel: string;
  remainingStatus: string;
  blockers: string[];
} {
  const productionOk =
    result.utilization.productionAuthoritative === true &&
    result.utilization.supportsRemainingClaim === true &&
    result.mayPublishAvailable &&
    result.supportedRemaining != null;
  if (productionOk) {
    return {
      remaining: result.supportedRemaining,
      mayPublishAvailable: true,
      publicationLabel: result.publicationLabel,
      remainingStatus: result.remainingStatus,
      blockers: result.blockers,
    };
  }
  const blockers = [...result.blockers];
  if (result.utilization.supportsRemainingClaim && result.utilization.productionAuthoritative !== true) {
    blockers.push(
      "authoritative remaining refused — completeness not production-authoritative (synthetic/demo certificates are not accepted on Position/Simulate/Ask)",
    );
  }
  return {
    remaining: null,
    mayPublishAvailable: false,
    publicationLabel:
      result.grossCapacity != null || result.grossUnlimited ? "GROSS_CONTRACTUAL" : result.publicationLabel,
    remainingStatus: "GROSS_ONLY",
    blockers: [...new Set(blockers)],
  };
}

/** Build the shared product view from a verified-remaining result. */
export function toProductCapacityView(
  surface: ProductSurface,
  result: VerifiedRemainingResult,
): ProductCapacityView {
  const gated = refuseAuthoritativeRemaining(result);
  const authenticity = utilizationAuthenticity(result);
  return {
    surface,
    capacityRuleId: result.capacityRuleId,
    asOf: result.asOf,
    grossCapacity: result.grossCapacity,
    grossUnlimited: result.grossUnlimited,
    knownUtilization: result.knownUtilization,
    unknownUtilization: result.unknownUtilization || result.utilization.productionAuthoritative !== true,
    utilizationKnowledge: result.utilization.knowledge,
    supportedRemainingCapacity: gated.remaining,
    governingConditions: result.governingConditions,
    crossDocumentConstraints: result.crossDocumentConstraints,
    sourceCitations: result.sourceCitations,
    certificationStatus: result.certificationStatus,
    publicationLabel: gated.publicationLabel,
    remainingStatus: gated.remainingStatus,
    mayPublishAvailable: gated.mayPublishAvailable,
    blockers: gated.blockers,
    note:
      gated.remaining != null
        ? result.note
        : `${result.note} [${surface}] authoritative remaining refused without production completeness.`,
    authenticityOfUtilization: authenticity,
  };
}

/**
 * Compute once; project to Position / Simulate / Ask without re-running formulas.
 * Consumers must not invent a second calculator.
 */
export function buildSharedProductCapacityViews(
  args: ComputeVerifiedRemainingArgs,
): Record<ProductSurface, ProductCapacityView> {
  const result = computeVerifiedRemaining(args);
  return {
    POSITION: toProductCapacityView("POSITION", result),
    SIMULATE: toProductCapacityView("SIMULATE", result),
    ASK: toProductCapacityView("ASK", result),
  };
}

/** Assert the three surfaces carry identical verified numbers (consistency gate). */
export function assertProductCapacityConsistency(
  views: Record<ProductSurface, ProductCapacityView>,
): { ok: true } | { ok: false; diffs: string[] } {
  const diffs: string[] = [];
  const base = views.POSITION;
  for (const surface of ["SIMULATE", "ASK"] as ProductSurface[]) {
    const v = views[surface];
    if (v.grossCapacity !== base.grossCapacity) diffs.push(`${surface}.grossCapacity`);
    if (v.knownUtilization !== base.knownUtilization) diffs.push(`${surface}.knownUtilization`);
    if (v.supportedRemainingCapacity !== base.supportedRemainingCapacity) {
      diffs.push(`${surface}.supportedRemainingCapacity`);
    }
    if (v.publicationLabel !== base.publicationLabel) diffs.push(`${surface}.publicationLabel`);
    if (v.utilizationKnowledge !== base.utilizationKnowledge) {
      diffs.push(`${surface}.utilizationKnowledge`);
    }
  }
  return diffs.length === 0 ? { ok: true } : { ok: false, diffs };
}
