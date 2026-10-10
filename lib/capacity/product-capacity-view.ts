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

/** Build the shared product view from a verified-remaining result. */
export function toProductCapacityView(
  surface: ProductSurface,
  result: VerifiedRemainingResult,
): ProductCapacityView {
  return {
    surface,
    capacityRuleId: result.capacityRuleId,
    asOf: result.asOf,
    grossCapacity: result.grossCapacity,
    grossUnlimited: result.grossUnlimited,
    knownUtilization: result.knownUtilization,
    unknownUtilization: result.unknownUtilization,
    utilizationKnowledge: result.utilization.knowledge,
    supportedRemainingCapacity: result.supportedRemaining,
    governingConditions: result.governingConditions,
    crossDocumentConstraints: result.crossDocumentConstraints,
    sourceCitations: result.sourceCitations,
    certificationStatus: result.certificationStatus,
    publicationLabel: result.publicationLabel,
    remainingStatus: result.remainingStatus,
    mayPublishAvailable: result.mayPublishAvailable,
    blockers: result.blockers,
    note: result.note,
    authenticityOfUtilization: utilizationAuthenticity(result),
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
