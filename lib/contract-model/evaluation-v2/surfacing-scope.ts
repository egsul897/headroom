/**
 * Evaluation Contract V3.1 — atomic surfacing scope.
 *
 * AMB-1, resolved by specification (see
 * docs/phase-3-final-closure-resolution/02-v31-atomic-surfacing-contract.json):
 * a claim-specific unsafe/review flag attached to ONE sub-part of a composite
 * claim surfaces THAT sub-part. It does not surface sibling propositions
 * merely because they were bundled into the same benchmark unit.
 *
 * This module decides coverage from two signals that the frozen matcher
 * already computes, and from nothing else:
 *
 *   1. the structural scope relation between the ground-truth unit's
 *      sectionRef and the flagging candidate's sectionRef, via the existing
 *      splitSectionRef() — a pure comparison of two reference SHAPES;
 *   2. the pair's PairCorrespondence, used ONLY where structure is silent,
 *      and only CORRESPONDS_FULLY is treated as positive evidence of
 *      whole-claim coverage.
 *
 * CORRESPONDS_PARTIALLY is deliberately NOT read as sub-proposition
 * anchoring. Partial semantic correspondence means an imperfect meaning
 * match, which is a different axis from coverage; reading it as narrower
 * anchoring was measured before adoption and rejected (it would have moved
 * 407 of 1,115 units on an inference rather than on evidence).
 *
 * The module carries no package, document, section, covenant or case
 * knowledge. It only ever compares reference shapes and reads two enums.
 */
import { splitSectionRef } from "./source-excerpt";
import type { CandidateSemanticRepresentation, PairCorrespondence, UnitEvaluationResult } from "./types";

export type SectionRefScopeRelation = "COVERS_WHOLE_UNIT" | "COVERS_SUB_PART" | "NOT_STRUCTURALLY_DECISIVE";
export type FlagCoverage = "WHOLE" | "SUB_PART" | "WHOLE_UNPROVEN" | "UNDETERMINED";

export type CompositeSurfacing =
  | "FULLY_SURFACED"
  | "FULLY_SURFACED_UNVERIFIED_SCOPE"
  | "PARTIALLY_SURFACED"
  | "SURFACING_SCOPE_UNDETERMINED"
  | "NOT_SPECIFICALLY_SURFACED"
  | "NOT_APPLICABLE";

export interface FlagCoverageRecord {
  candidateId: string;
  candidateSectionRef: string | null;
  groundTruthSectionRef: string;
  scopeRelation: SectionRefScopeRelation;
  correspondence: PairCorrespondence | null;
  coverage: FlagCoverage;
}

/**
 * Compares the claim's address with the flagging candidate's address.
 *
 * COVERS_WHOLE_UNIT   the flag's enumerated path is a prefix of (or equal to)
 *                     the claim's — the flag sits at the claim's own address
 *                     or at an ancestor of it.
 * COVERS_SUB_PART     the claim's enumerated path is a STRICT prefix of the
 *                     flag's — the flag sits at a proper descendant, i.e. at
 *                     one enumerated sub-part inside the claim.
 * NOT_STRUCTURALLY_DECISIVE
 *                     different document, different base section, divergent
 *                     enumerated paths, or no candidate sectionRef at all.
 */
export function sectionRefScopeRelation(
  groundTruthSectionRef: string,
  groundTruthDocumentId: string,
  candidate: CandidateSemanticRepresentation,
): SectionRefScopeRelation {
  if (!candidate.sectionRef) return "NOT_STRUCTURALLY_DECISIVE";
  if (groundTruthDocumentId && candidate.documentId && groundTruthDocumentId !== candidate.documentId) return "NOT_STRUCTURALLY_DECISIVE";

  const gt = splitSectionRef(groundTruthSectionRef);
  const cand = splitSectionRef(candidate.sectionRef);
  if (!gt.base || !cand.base) return "NOT_STRUCTURALLY_DECISIVE";
  if (gt.base.toLowerCase() !== cand.base.toLowerCase()) return "NOT_STRUCTURALLY_DECISIVE";

  const gtParts = gt.parts.map((p) => p.toLowerCase());
  const candParts = cand.parts.map((p) => p.toLowerCase());
  const shared = Math.min(gtParts.length, candParts.length);
  for (let i = 0; i < shared; i++) {
    // The paths diverge at an enumerated level: siblings or cousins, which
    // prove nothing about coverage either way.
    if (gtParts[i] !== candParts[i]) return "NOT_STRUCTURALLY_DECISIVE";
  }
  return candParts.length > gtParts.length ? "COVERS_SUB_PART" : "COVERS_WHOLE_UNIT";
}

function coverageOf(scopeRelation: SectionRefScopeRelation, correspondence: PairCorrespondence | null): FlagCoverage {
  if (scopeRelation === "COVERS_SUB_PART") return "SUB_PART";
  if (scopeRelation === "COVERS_WHOLE_UNIT") return "WHOLE";
  if (correspondence === "CORRESPONDS_FULLY") return "WHOLE";
  if (correspondence === "CORRESPONDS_PARTIALLY") return "WHOLE_UNPROVEN";
  return "UNDETERMINED";
}

export interface SurfacingScopeResult {
  compositeSurfacing: CompositeSurfacing;
  coverage: FlagCoverageRecord[];
}

/**
 * Derives the V3.1 composite surfacing state for one already-evaluated unit.
 * Pure function of frozen matcher output — introduces no matching decision.
 */
export function deriveSurfacingScope(
  unit: UnitEvaluationResult,
  candidatesById: Map<string, CandidateSemanticRepresentation>,
  creditEligible: boolean,
): SurfacingScopeResult {
  if (creditEligible) return { compositeSurfacing: "NOT_APPLICABLE", coverage: [] };
  if (unit.surfacedAsUnsafeBy.length === 0) return { compositeSurfacing: "NOT_SPECIFICALLY_SURFACED", coverage: [] };

  const coverage: FlagCoverageRecord[] = unit.surfacedAsUnsafeBy.map((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    const correspondence = unit.pairAssessments.find((p) => p.candidateId === candidateId)?.correspondence ?? null;
    const scopeRelation = candidate ? sectionRefScopeRelation(unit.sectionRef, unit.documentId, candidate) : "NOT_STRUCTURALLY_DECISIVE";
    return {
      candidateId,
      candidateSectionRef: candidate?.sectionRef ?? null,
      groundTruthSectionRef: unit.sectionRef,
      scopeRelation,
      correspondence,
      coverage: coverageOf(scopeRelation, correspondence),
    };
  });

  // A flag that covers the whole unit necessarily covers every atomic
  // proposition inside it, so it dominates any narrower flag.
  if (coverage.some((c) => c.coverage === "WHOLE")) return { compositeSurfacing: "FULLY_SURFACED", coverage };
  // Every warning the system produced is anchored at a proper sub-part: the
  // siblings were not warned about.
  if (coverage.some((c) => c.coverage === "SUB_PART")) return { compositeSurfacing: "PARTIALLY_SURFACED", coverage };
  // A claim-specific warning exists and nothing shows it is anchored more
  // narrowly than the claim — but whole-claim coverage is not proven either.
  if (coverage.some((c) => c.coverage === "WHOLE_UNPROVEN")) return { compositeSurfacing: "FULLY_SURFACED_UNVERIFIED_SCOPE", coverage };
  return { compositeSurfacing: "SURFACING_SCOPE_UNDETERMINED", coverage };
}

/** The legacy binary projection. The composite state is always kept alongside it. */
export function toBinarySurfacing(state: CompositeSurfacing): "SPECIFICALLY_SURFACED" | "NOT_SPECIFICALLY_SURFACED" | "NOT_APPLICABLE" {
  switch (state) {
    case "NOT_APPLICABLE":
      return "NOT_APPLICABLE";
    case "FULLY_SURFACED":
    case "FULLY_SURFACED_UNVERIFIED_SCOPE":
      return "SPECIFICALLY_SURFACED";
    default:
      return "NOT_SPECIFICALLY_SURFACED";
  }
}
