/**
 * Evaluation Methodology V2 — Layer 4: match cardinality resolution.
 *
 * Phase 3F.1.5. Resolves each ground-truth unit against its evaluated pairs
 * into exactly one disposition. Many-to-many is first class:
 *
 *  EXACT_SINGLE        one candidate fully represents the claim.
 *  EXACT_COMPOSITE     a SET of candidates jointly represents the claim, and
 *                      EVERY member individually corresponds on the core
 *                      dimensions. A union of structurally-adjacent nodes is
 *                      never a composite match — that was precisely the
 *                      historical defect this taxonomy replaces.
 *  PARTIAL             correspondence established but a required dimension is
 *                      missing.
 *  AMBIGUOUS           two or more mutually irreconcilable candidate clusters
 *                      are equally defensible. Never force a winner.
 *  CONTRADICTORY       the best available candidate materially contradicts the
 *                      claim.
 *  UNREPRESENTED       nothing substantively represents the claim.
 *  HONESTLY_UNRESOLVED the system explicitly says it could not resolve this.
 *  HONESTLY_UNSUPPORTED the system explicitly says it cannot represent this.
 *
 * The last two are GOOD safety behaviour and are never scored as a silent
 * omission (aggregate.ts keeps them in their own bucket).
 */
import type {
  CandidateSemanticRepresentation,
  MatchStatus,
  PairAssessment,
  RepresentationStatus,
  SemanticCorrectness,
} from "./types";
import { CORE_CREDIT_DIMENSIONS } from "./types";

export interface MatchResolutionInput {
  gtUnitId: string;
  pairs: PairAssessment[];
  candidatesById: Map<string, CandidateSemanticRepresentation>;
}

export interface MatchResolution {
  matchStatus: MatchStatus;
  representationStatus: RepresentationStatus;
  semanticCorrectness: SemanticCorrectness;
  matchedCandidateIds: string[];
  rejectedCandidateIds: string[];
  ambiguousClusters: string[][];
  explicitlySurfacedAsUnsafe: boolean;
  surfacedAsUnsafeBy: string[];
  /** Corresponding candidates that only prove the system NOTICED the provision - never credit-bearing. */
  surfacedByInventoryOnly: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasonForCredit: string | null;
  reasonForPartialCredit: string | null;
  reasonForNoCredit: string | null;
}

/** Two candidates are reconcilable if they can plausibly be parts of the same claim rather than competing answers to it. */
function reconcilable(a: PairAssessment, b: PairAssessment, candidates: Map<string, CandidateSemanticRepresentation>): boolean {
  const ca = candidates.get(a.candidateId);
  const cb = candidates.get(b.candidateId);
  if (!ca || !cb) return false;
  if (ca.documentId !== cb.documentId) return false;
  const aFigures = ca.figures.filter((f) => f.kind === "MONEY" || f.kind === "PERCENT" || f.kind === "RATIO");
  const bFigures = cb.figures.filter((f) => f.kind === "MONEY" || f.kind === "PERCENT" || f.kind === "RATIO");
  // Two candidates that assert DIFFERENT economics for the same claim are
  // competing answers, not complementary parts of one answer.
  if (aFigures.length > 0 && bFigures.length > 0) {
    const shared = aFigures.some((x) => bFigures.some((y) => x.kind === y.kind && Math.abs(x.value - y.value) / Math.max(Math.abs(x.value), 1) < 0.005 && (x.basis ?? null) === (y.basis ?? null)));
    if (!shared) return false;
  }
  if (ca.legalPosture !== "UNDETERMINED" && cb.legalPosture !== "UNDETERMINED" && ca.legalPosture !== cb.legalPosture) return false;
  return true;
}

function surfacedUnsafe(candidate: CandidateSemanticRepresentation): boolean {
  const s = candidate.selfReportedState;
  if (s.flaggedDangerousUnaccounted) return true;
  if (candidate.accountingRole === "HONEST_UNRESOLVED" || candidate.accountingRole === "HONEST_UNSUPPORTED" || candidate.accountingRole === "SAFETY_FLAG") return true;
  const review = (s.reviewStatus ?? "").toUpperCase();
  if (review.includes("REVIEW") || review === "UNCERTAIN") return true;
  const suff = (s.sufficiency ?? "").toUpperCase();
  if (["UNSUPPORTED", "MISSING_CONTEXT", "AMBIGUOUS", "CONFLICTED", "PARTIAL"].includes(suff)) return true;
  const cov = (s.coverageState ?? "").toUpperCase();
  if (cov.includes("REVIEW_REQUIRED") || cov.includes("UNRESOLVED")) return true;
  return s.unresolvedReasons.length > 0 || s.verifierFindings.length > 0;
}

export function resolveMatch(input: MatchResolutionInput): MatchResolution {
  const { pairs, candidatesById } = input;

  const full = pairs.filter((p) => p.correspondence === "CORRESPONDS_FULLY");
  const partial = pairs.filter((p) => p.correspondence === "CORRESPONDS_PARTIALLY");
  const contradicting = pairs.filter((p) => p.correspondence === "CONTRADICTS");
  const corresponding = [...full, ...partial];

  const rejectedCandidateIds = pairs.filter((p) => p.correspondence === "CONTRADICTS" || p.correspondence === "NO_CORRESPONDENCE" || p.correspondence === "INDETERMINATE").map((p) => p.candidateId);

  // Honest self-reports on any SEMANTICALLY CORRESPONDING candidate. A flag on
  // a non-corresponding candidate is worth nothing to this claim — that is the
  // exact false-credit vector this evaluator exists to close.
  const surfacedBy = corresponding.map((p) => candidatesById.get(p.candidateId)).filter((c): c is CandidateSemanticRepresentation => Boolean(c) && surfacedUnsafe(c as CandidateSemanticRepresentation));
  const explicitlySurfacedAsUnsafe = surfacedBy.length > 0;

  if (corresponding.length === 0) {
    // CONTRADICTORY is reserved for the case where the system ASSERTED an answer
    // that is wrong about this claim: a candidate the system offers as a
    // substantive representation, in the same operative document, that lines up
    // with the claim on most core dimensions but conflicts materially on a
    // blocking one (wrong amount, wrong scope, wrong instrument, wrong breadth).
    //
    // A neighbouring provision that simply says something different is NOT a
    // contradiction — it is a different provision, and the claim is merely
    // UNREPRESENTED. Collapsing those two together would overstate how wrong the
    // system is, which is as dishonest as understating it.
    const inPlaceContradictions = contradicting.filter((p) => {
      const c = candidatesById.get(p.candidateId);
      if (!c || c.accountingRole !== "SUBSTANTIVE_REPRESENTATION") return false;
      const conflictsOffProvenance = p.conflicts.some((k) => k.severity === "MATERIAL_CONFLICT" && k.dimension !== "G_OPERATIVE_PROVENANCE");
      if (!conflictsOffProvenance) return false;
      const coreAligned = p.dimensions.filter((d) => CORE_CREDIT_DIMENSIONS.includes(d.dimension) && (d.outcome === "CORRESPONDS" || d.outcome === "NOT_APPLICABLE")).length;
      return coreAligned >= 2;
    });
    if (inPlaceContradictions.length > 0) {
      const best = [...inPlaceContradictions].sort((a, b) => b.correspondenceStrength - a.correspondenceStrength)[0]!;
      return {
        matchStatus: "CONTRADICTORY",
        representationStatus: "UNREPRESENTED",
        semanticCorrectness: "INCORRECT",
        matchedCandidateIds: [],
        rejectedCandidateIds,
        ambiguousClusters: [],
        explicitlySurfacedAsUnsafe: false,
        surfacedAsUnsafeBy: [],
        surfacedByInventoryOnly: [],
        confidence: "HIGH",
        reasonForCredit: null,
        reasonForPartialCredit: null,
        reasonForNoCredit: `Every generated candidate materially contradicts the claim. Closest was ${best.candidateId}: ${best.reason}`,
      };
    }
    if (contradicting.length > 0) {
      const best = [...contradicting].sort((a, b) => b.correspondenceStrength - a.correspondenceStrength)[0]!;
      return {
        matchStatus: "UNREPRESENTED",
        representationStatus: "UNREPRESENTED",
        semanticCorrectness: "INCORRECT",
        matchedCandidateIds: [],
        rejectedCandidateIds,
        ambiguousClusters: [],
        explicitlySurfacedAsUnsafe: false,
        surfacedAsUnsafeBy: [],
        surfacedByInventoryOnly: [],
        confidence: "HIGH",
        reasonForCredit: null,
        reasonForPartialCredit: null,
        reasonForNoCredit:
          `Nothing represents this claim. ${contradicting.length} candidate(s) were near enough to be evaluated but each conflicts materially with it; none is a substantive representation the system offered as an answer here, so this is an omission rather than a wrong answer. ` +
          `Closest was ${best.candidateId}: ${best.reason}`,
      };
    }
    return {
      matchStatus: "UNREPRESENTED",
      representationStatus: "UNREPRESENTED",
      semanticCorrectness: pairs.length === 0 ? "NOT_VERIFIABLE" : "INCORRECT",
      matchedCandidateIds: [],
      rejectedCandidateIds,
      ambiguousClusters: [],
      explicitlySurfacedAsUnsafe: false,
      surfacedAsUnsafeBy: [],
      surfacedByInventoryOnly: [],
      confidence: pairs.length === 0 ? "MEDIUM" : "HIGH",
      reasonForCredit: null,
      reasonForPartialCredit: null,
      reasonForNoCredit:
        pairs.length === 0
          ? "No candidate shared any content-bearing signal with this claim, so no pair was even generated. Structural adjacency alone does not generate a pair, and would not have granted credit if it had."
          : `${pairs.length} candidate(s) were evaluated on content; none substantively represents this claim.`,
    };
  }

  // -------------------------------------------------------------------------
  // ACCOUNTING GATE.
  //
  // Semantic correspondence establishes that a candidate is ABOUT this claim.
  // It does not, by itself, establish that the system REPRESENTS the claim. A
  // discovery candidate that correctly describes a covenant but was never
  // compiled is an inventory finding, not a representation - the pipeline's own
  // coverage auditor treats exactly that state as a gap. Credit therefore
  // requires a corresponding candidate whose accounting role is a substantive
  // representation.
  // -------------------------------------------------------------------------
  const roleOf = (p: PairAssessment) => candidatesById.get(p.candidateId)?.accountingRole ?? "INVENTORY_ONLY";
  const substantiveFull = full.filter((p) => roleOf(p) === "SUBSTANTIVE_REPRESENTATION");
  const substantivePartial = partial.filter((p) => roleOf(p) === "SUBSTANTIVE_REPRESENTATION");
  const honestUnsupported = corresponding.find((p) => roleOf(p) === "HONEST_UNSUPPORTED");
  const honestUnresolved = corresponding.find((p) => roleOf(p) === "HONEST_UNRESOLVED");
  const correspondingSafetyFlags = corresponding.filter((p) => roleOf(p) === "SAFETY_FLAG");
  const correspondingInventoryOnly = corresponding.filter((p) => roleOf(p) === "INVENTORY_ONLY");

  // --- Ambiguity: competing, irreconcilable substantive full matches --------
  if (substantiveFull.length > 1) {
    const clusters: PairAssessment[][] = [];
    for (const p of [...substantiveFull].sort((a, b) => b.correspondenceStrength - a.correspondenceStrength)) {
      const target = clusters.find((cl) => cl.every((q) => reconcilable(p, q, candidatesById)));
      if (target) target.push(p);
      else clusters.push([p]);
    }
    if (clusters.length > 1) {
      const top = clusters[0]!;
      const second = clusters[1]!;
      const topStrength = Math.max(...top.map((p) => p.correspondenceStrength));
      const secondStrength = Math.max(...second.map((p) => p.correspondenceStrength));
      // Only genuinely competitive clusters create ambiguity; a clearly weaker
      // alternative reading does not.
      if (secondStrength >= topStrength - 0.08) {
        return {
          matchStatus: "AMBIGUOUS",
          representationStatus: "AMBIGUOUS",
          semanticCorrectness: "NOT_VERIFIABLE",
          matchedCandidateIds: [],
          rejectedCandidateIds,
          ambiguousClusters: clusters.map((cl) => cl.map((p) => p.candidateId)),
          explicitlySurfacedAsUnsafe,
          surfacedAsUnsafeBy: surfacedBy.map((c) => c.candidateId),
          surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
          confidence: "MEDIUM",
          reasonForCredit: null,
          reasonForPartialCredit: null,
          reasonForNoCredit: `${clusters.length} mutually irreconcilable candidate clusters correspond about equally well (${topStrength.toFixed(3)} vs ${secondStrength.toFixed(3)}). Forcing a winner would manufacture a match that the evidence does not support.`,
        };
      }
    }
  }

  // --- Exact (single or composite) -----------------------------------------
  if (substantiveFull.length > 0) {
    const ordered = [...substantiveFull].sort((a, b) => b.correspondenceStrength - a.correspondenceStrength);
    const primary = ordered[0]!;
    const composite = ordered.filter((p) => p !== primary && reconcilable(p, primary, candidatesById) && coreCorresponds(p));
    const matchedIds = [primary.candidateId, ...composite.map((p) => p.candidateId)];
    const isComposite = composite.length > 0;
    return {
      matchStatus: isComposite ? "EXACT_COMPOSITE" : "EXACT_SINGLE",
      representationStatus: "REPRESENTED",
      semanticCorrectness: "CORRECT",
      matchedCandidateIds: matchedIds,
      rejectedCandidateIds,
      ambiguousClusters: [],
      explicitlySurfacedAsUnsafe,
      surfacedAsUnsafeBy: surfacedBy.map((c) => c.candidateId),
      surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
      confidence: primary.deterministicOnly ? "HIGH" : (primary.judge?.confidence ?? "MEDIUM"),
      reasonForCredit: isComposite
        ? `Composite match: ${matchedIds.length} substantive representations jointly represent the claim, and EACH corresponds independently on every core dimension (action, posture, object/resource) with no material conflict on breadth, scope, economics, conditions or provenance. ${primary.reason}`
        : `Single exact match against a substantive representation. ${primary.reason}`,
      reasonForPartialCredit: null,
      reasonForNoCredit: null,
    };
  }

  // --- Partial (substantive but incomplete) ---------------------------------
  if (substantivePartial.length > 0) {
    const primary = [...substantivePartial].sort((a, b) => b.correspondenceStrength - a.correspondenceStrength)[0]!;
    const missing = primary.dimensions.filter((d) => d.outcome === "MISSING_REQUIRED_DIMENSION").map((d) => d.dimension);
    return {
      matchStatus: "PARTIAL",
      representationStatus: "PARTIALLY_REPRESENTED",
      semanticCorrectness: "PARTIALLY_CORRECT",
      matchedCandidateIds: [primary.candidateId],
      rejectedCandidateIds,
      ambiguousClusters: [],
      explicitlySurfacedAsUnsafe,
      surfacedAsUnsafeBy: surfacedBy.map((c) => c.candidateId),
      surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
      confidence: "MEDIUM",
      reasonForCredit: null,
      reasonForPartialCredit: `Core dimensions correspond against a substantive representation, but it is silent on: ${missing.join(", ") || "(unspecified)"}. ${primary.reason}`,
      reasonForNoCredit: null,
    };
  }

  // --- Honest self-declarations --------------------------------------------
  if (honestUnsupported) {
    return {
      matchStatus: "HONESTLY_UNSUPPORTED",
      representationStatus: "HONESTLY_UNSUPPORTED",
      semanticCorrectness: "NOT_APPLICABLE",
      matchedCandidateIds: [honestUnsupported.candidateId],
      rejectedCandidateIds,
      ambiguousClusters: [],
      explicitlySurfacedAsUnsafe: true,
      surfacedAsUnsafeBy: [honestUnsupported.candidateId],
      surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
      confidence: "HIGH",
      reasonForCredit: null,
      reasonForPartialCredit: null,
      reasonForNoCredit:
        "A semantically-corresponding candidate explicitly declares that the system cannot represent this claim. Poor executability, correct safety behaviour - never scored as a silent omission.",
    };
  }
  if (honestUnresolved) {
    return {
      matchStatus: "HONESTLY_UNRESOLVED",
      representationStatus: "HONESTLY_UNRESOLVED",
      semanticCorrectness: "NOT_VERIFIABLE",
      matchedCandidateIds: [honestUnresolved.candidateId],
      rejectedCandidateIds,
      ambiguousClusters: [],
      explicitlySurfacedAsUnsafe: true,
      surfacedAsUnsafeBy: [honestUnresolved.candidateId],
      surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
      confidence: "HIGH",
      reasonForCredit: null,
      reasonForPartialCredit: null,
      reasonForNoCredit: "A semantically-corresponding candidate explicitly surfaces this claim as unresolved rather than asserting a confident answer.",
    };
  }

  // --- Corresponding candidates exist, but none of them REPRESENTS anything --
  if (correspondingSafetyFlags.length > 0) {
    return {
      matchStatus: "UNREPRESENTED",
      representationStatus: "UNREPRESENTED",
      semanticCorrectness: "NOT_APPLICABLE",
      matchedCandidateIds: [],
      rejectedCandidateIds,
      ambiguousClusters: [],
      explicitlySurfacedAsUnsafe: true,
      surfacedAsUnsafeBy: correspondingSafetyFlags.map((p) => p.candidateId),
      surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
      confidence: "HIGH",
      reasonForCredit: null,
      reasonForPartialCredit: null,
      reasonForNoCredit:
        `No substantive representation of this claim exists, but ${correspondingSafetyFlags.length} semantically-corresponding candidate(s) explicitly flag the gap (review-required / dangerous-unaccounted / verifier finding). ` +
        "The flag counts here only because it sits on a candidate that actually represents this claim - a flag on an unrelated neighbouring provision would not.",
    };
  }

  return {
    matchStatus: "UNREPRESENTED",
    representationStatus: "UNREPRESENTED",
    semanticCorrectness: "INCORRECT",
    matchedCandidateIds: [],
    rejectedCandidateIds,
    ambiguousClusters: [],
    explicitlySurfacedAsUnsafe: false,
    surfacedAsUnsafeBy: [],
    surfacedByInventoryOnly: correspondingInventoryOnly.map((p) => p.candidateId),
    confidence: "HIGH",
    reasonForCredit: null,
    reasonForPartialCredit: null,
    reasonForNoCredit:
      `${corresponding.length} candidate(s) semantically correspond to this claim, but every one of them is inventory-only: the system noticed the provision and produced no representation of it, and did not flag the omission. ` +
      "Correspondence without representation is not credit.",
  };
}

function coreCorresponds(pair: PairAssessment): boolean {
  const byDim = new Map(pair.dimensions.map((d) => [d.dimension, d.outcome]));
  return CORE_CREDIT_DIMENSIONS.every((d) => {
    const o = byDim.get(d);
    return o === "CORRESPONDS" || o === "NOT_APPLICABLE";
  });
}
