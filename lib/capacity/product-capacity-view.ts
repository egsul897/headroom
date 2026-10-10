/**
 * Shared product capacity view for Position, Simulate, and Ask.
 *
 * Single verified-capacity result shape — no parallel calculation engine.
 * Surfaces: gross, known/unknown utilization, supported remaining,
 * governing conditions, cross-document constraints, citations, certification.
 *
 * Authoritative remaining is refused when completeness is not production-
 * authoritative. Synthetic demo remaining must not be presented as production truth.
 */
import type { VerifiedRemainingResult } from "./verified-remaining";
import { computeVerifiedRemaining, type ComputeVerifiedRemainingArgs } from "./verified-remaining";

export type ProductSurface = "POSITION" | "SIMULATE" | "ASK" | "VERIFIED_EXECUTION";

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
  /** True only when remaining is backed by production-authoritative completeness. */
  productionAuthoritativeRemaining: boolean;
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
 * production-authoritative. Demo/synthetic remaining may exist on the
 * underlying result but is stripped for POSITION / SIMULATE / ASK /
 * VERIFIED_EXECUTION publication.
 */
export function refuseAuthoritativeRemaining(
  result: VerifiedRemainingResult,
): { remaining: number | null; mayPublishAvailable: boolean; publicationLabel: string; blockers: string[] } {
  const productionOk = result.utilization.productionAuthoritative && result.utilization.supportsRemainingClaim;
  if (productionOk && result.mayPublishAvailable && result.supportedRemaining != null) {
    return {
      remaining: result.supportedRemaining,
      mayPublishAvailable: true,
      publicationLabel: result.publicationLabel,
      blockers: result.blockers,
    };
  }
  const blockers = [
    ...result.blockers,
    ...result.utilization.certificateValidationBlockers,
  ];
  if (!result.utilization.productionAuthoritative) {
    blockers.push(
      "authoritative remaining refused — completeness not production-authoritative (synthetic/demo certificates are not accepted on Position/Simulate/Ask/verified-execution)",
    );
  }
  return {
    remaining: null,
    mayPublishAvailable: false,
    publicationLabel: result.grossCapacity != null || result.grossUnlimited ? "GROSS_CONTRACTUAL" : result.publicationLabel,
    blockers: [...new Set(blockers)],
  };
}

/** Build the shared product view from a verified-remaining result. */
export function toProductCapacityView(
  surface: ProductSurface,
  result: VerifiedRemainingResult,
): ProductCapacityView {
  const gated = refuseAuthoritativeRemaining(result);
  return {
    surface,
    capacityRuleId: result.capacityRuleId,
    asOf: result.asOf,
    grossCapacity: result.grossCapacity,
    grossUnlimited: result.grossUnlimited,
    knownUtilization: result.knownUtilization,
    unknownUtilization: result.unknownUtilization || !result.utilization.productionAuthoritative,
    utilizationKnowledge: result.utilization.knowledge,
    supportedRemainingCapacity: gated.remaining,
    governingConditions: result.governingConditions,
    crossDocumentConstraints: result.crossDocumentConstraints,
    sourceCitations: result.sourceCitations,
    certificationStatus: result.certificationStatus,
    publicationLabel: gated.publicationLabel,
    remainingStatus: gated.remaining != null ? result.remainingStatus : "GROSS_ONLY",
    mayPublishAvailable: gated.mayPublishAvailable,
    productionAuthoritativeRemaining: gated.mayPublishAvailable && result.utilization.productionAuthoritative,
    blockers: gated.blockers,
    note:
      gated.remaining != null
        ? result.note
        : `${result.note} [${surface}] authoritative remaining refused without production completeness.`,
    authenticityOfUtilization: utilizationAuthenticity(result),
  };
}

/**
 * Compute once; project to Position / Simulate / Ask / verified-execution
 * without re-running formulas. Consumers must not invent a second calculator.
 */
export function buildSharedProductCapacityViews(
  args: ComputeVerifiedRemainingArgs,
): Record<"POSITION" | "SIMULATE" | "ASK" | "VERIFIED_EXECUTION", ProductCapacityView> {
  const result = computeVerifiedRemaining(args);
  return {
    POSITION: toProductCapacityView("POSITION", result),
    SIMULATE: toProductCapacityView("SIMULATE", result),
    ASK: toProductCapacityView("ASK", result),
    VERIFIED_EXECUTION: toProductCapacityView("VERIFIED_EXECUTION", result),
  };
}

/** Assert product surfaces carry identical verified numbers (consistency gate). */
export function assertProductCapacityConsistency(
  views: Record<"POSITION" | "SIMULATE" | "ASK" | "VERIFIED_EXECUTION", ProductCapacityView>,
): { ok: true } | { ok: false; diffs: string[] } {
  const diffs: string[] = [];
  const base = views.POSITION;
  for (const surface of ["SIMULATE", "ASK", "VERIFIED_EXECUTION"] as const) {
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
    if (v.productionAuthoritativeRemaining !== base.productionAuthoritativeRemaining) {
      diffs.push(`${surface}.productionAuthoritativeRemaining`);
    }
  }
  return diffs.length === 0 ? { ok: true } : { ok: false, diffs };
}
