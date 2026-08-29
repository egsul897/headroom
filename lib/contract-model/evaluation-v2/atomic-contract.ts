/**
 * Evaluation Contract V3 — atomic trust dimensions.
 *
 * This module implements NO new matching logic. It is a pure DERIVATION
 * layer: it reads the already-frozen, already-tested output of
 * resolveMatch()/evaluatePair() (matching.ts, semantic-correspondence.ts —
 * both untouched by this phase) and re-expresses it as a small set of
 * orthogonal, atomic facts instead of one mutually-exclusive 12-state label.
 *
 * Phase 3F.1.5.3 empirically demonstrated that independent blinded
 * adjudicators cannot reproduce the historical 12-state label at the
 * required >=85% agreement, even after one evidence-backed rubric redesign
 * (see docs/evaluation-v2-final-resolution/17-holdout-inter-reviewer-results.json).
 * Binary credit/no-credit, by contrast, WAS reproducible on both samples
 * (94.9% / 97.0%). This module is the architecture response: record the
 * atomic facts a single mutually-exclusive label used to collapse
 * (discovery, semantic correspondence, representation completeness,
 * verification, safe surfacing) SEPARATELY, so each can be validated on its
 * own reproducibility merits rather than forcing convergence on one score.
 *
 * See docs/evaluation-contract-v3/02-atomic-contract-spec.json for the full
 * design rationale and docs/evaluation-contract-v3/03-historical-taxonomy-mapping.json
 * for the historical-label migration table (including disclosed
 * terminology collisions).
 */
import type { CandidateSemanticRepresentation, MatchStatus, PairAssessment, UnitEvaluationResult } from "./types";

export type CreditEligibility = "CREDIT" | "NO_CREDIT";
export type SurfacingStatus = "SPECIFICALLY_SURFACED" | "NOT_SPECIFICALLY_SURFACED" | "NOT_APPLICABLE";
export type RepresentationCompleteness = "NONE" | "PARTIAL" | "FULL";
export type VerificationStatus = "NOT_EVALUATED" | "NOT_VERIFIED" | "VERIFICATION_INCOMPLETE" | "VERIFIED" | "CONTRADICTED";
export type EvidenceQuality = "SUFFICIENT" | "AMBIGUOUS" | "INSUFFICIENT";

/**
 * The 12 historical Phase 3F.1.5.1 taxonomy labels, preserved verbatim as a
 * DIAGNOSTIC-ONLY compatibility target. Never primary truth — see
 * docs/evaluation-contract-v3/03-historical-taxonomy-mapping.json.
 */
export type DerivedDiagnosticLabel =
  | "NOT_DISCOVERED"
  | "DISCOVERED_ONLY"
  | "DISCOVERED_REVIEW_REQUIRED"
  | "SEMANTICALLY_REPRESENTED_UNVERIFIED"
  | "SEMANTICALLY_REPRESENTED_VERIFICATION_INCOMPLETE"
  | "VERIFIED_SEMANTIC_REPRESENTATION"
  | "PARTIAL_SEMANTIC_REPRESENTATION"
  | "HONESTLY_UNSUPPORTED"
  | "HONESTLY_UNRESOLVED"
  | "CONTRADICTORY_REPRESENTATION"
  | "AMBIGUOUS"
  | "INCOMPARABLE"
  | "UNRESOLVED_FROM_ATOMIC_FACTS";

export interface AtomicEvaluationContract {
  claimId: string;
  creditEligibility: CreditEligibility;
  surfacingStatus: SurfacingStatus;
  representationCompleteness: RepresentationCompleteness;
  verificationStatus: VerificationStatus;
  evidenceQuality: EvidenceQuality;
  /** Section 9: material claim, NO_CREDIT, and no claim-specific surfacing. The core dangerous-omission concept. */
  dangerousSilentOmission: boolean;
  rationale: string;
  derivedDiagnosticLabel: DerivedDiagnosticLabel;
}

const MATERIAL_TIERS = new Set(["CRITICAL", "MATERIAL"]);

const CREDIT_STATUSES: ReadonlySet<MatchStatus> = new Set(["EXACT_SINGLE", "EXACT_COMPOSITE"]);
const REPRESENTATION_FULL_STATUSES: ReadonlySet<MatchStatus> = CREDIT_STATUSES;

/** Section 4E: evidenceQuality is derived from the ground-truth-quality audit already computed by the (frozen) engine — never a new signal. */
function deriveEvidenceQuality(unit: UnitEvaluationResult): EvidenceQuality {
  switch (unit.groundTruthQuality) {
    case "GT_CONFIRMED":
      return "SUFFICIENT";
    case "GT_AMBIGUOUS":
    case "GT_CONFLICT_WITH_SOURCE":
      return "AMBIGUOUS";
    case "GT_INCOMPLETE":
    case "GT_REQUIRES_DOMAIN_REVIEW":
      return "INSUFFICIENT";
    default:
      return "SUFFICIENT";
  }
}

/**
 * Section 18: verification evidence must never be invented. Per Phase
 * 3F.1.5.3's own finding (R4), verification-type candidates are always
 * accountingRole=SAFETY_FLAG and never enter matchedCandidateIds, so a
 * matched (SUBSTANTIVE_REPRESENTATION) candidate's own verifierFindings are
 * essentially always empty — NOT because nothing was checked, but because
 * the pipeline does not currently route verification evidence onto the
 * representation it actually credits. This function honestly reports
 * NOT_EVALUATED in that (overwhelmingly common) case rather than asserting
 * NOT_VERIFIED (which would claim to know an attempt never happened) or
 * VERIFIED (which would claim a clean pass this data cannot establish).
 */
function deriveVerificationStatus(unit: UnitEvaluationResult, candidatesById: Map<string, CandidateSemanticRepresentation>): VerificationStatus {
  if (unit.matchStatus === "CONTRADICTORY") return "CONTRADICTED";
  const applicable: ReadonlySet<MatchStatus> = new Set(["EXACT_SINGLE", "EXACT_COMPOSITE", "PARTIAL"]);
  if (!applicable.has(unit.matchStatus)) return "NOT_EVALUATED";
  const matchedFindings = unit.matchedCandidateIds
    .map((id) => candidatesById.get(id))
    .filter((c): c is CandidateSemanticRepresentation => Boolean(c))
    .flatMap((c) => c.selfReportedState.verifierFindings);
  if (matchedFindings.length === 0) return "NOT_EVALUATED";
  const hasContradiction = matchedFindings.some((f) => /contradict/i.test(f));
  if (hasContradiction) return "CONTRADICTED";
  const hasIncomplete = matchedFindings.some((f) => /incomplete|indeterminate|inconclusive/i.test(f));
  if (hasIncomplete) return "VERIFICATION_INCOMPLETE";
  const hasConfirmed = matchedFindings.some((f) => /confirm|verified|passed/i.test(f));
  return hasConfirmed ? "VERIFIED" : "VERIFICATION_INCOMPLETE";
}

function deriveRepresentationCompleteness(matchStatus: MatchStatus): RepresentationCompleteness {
  if (REPRESENTATION_FULL_STATUSES.has(matchStatus)) return "FULL";
  if (matchStatus === "PARTIAL") return "PARTIAL";
  return "NONE";
}

/**
 * Section 4B / Invariants 3-6: surfacingStatus reuses explicitlySurfacedAsUnsafe
 * verbatim. This is not a re-derivation shortcut — it is the correct answer,
 * because Workstream A's frozen I_CLAIM_IDENTITY dimension already forces a
 * sibling-anchored candidate's pair correspondence to INDETERMINATE, and
 * matching.ts's surfacedUnsafe() is scoped ONLY to pairs whose correspondence
 * resolved CORRESPONDS_FULLY/CORRESPONDS_PARTIALLY (see matching.ts's
 * `corresponding` array) — a sibling's flag can therefore never enter
 * `surfacedBy`/`explicitlySurfacedAsUnsafe` in the first place. The
 * claim-specific-correspondence requirement this section demands is already
 * structurally enforced upstream; duplicating it here would risk a second,
 * possibly inconsistent implementation of the same rule.
 */
function deriveSurfacingStatus(creditEligibility: CreditEligibility, unit: UnitEvaluationResult): SurfacingStatus {
  if (creditEligibility === "CREDIT") return "NOT_APPLICABLE";
  return unit.explicitlySurfacedAsUnsafe ? "SPECIFICALLY_SURFACED" : "NOT_SPECIFICALLY_SURFACED";
}

/** Broad (non-claim-identity-filtered) role scan across ALL evaluated pairs — used ONLY for the diagnostic label, never for a safety-critical dimension. */
function anyPairHasRole(unit: UnitEvaluationResult, candidatesById: Map<string, CandidateSemanticRepresentation>, roles: ReadonlySet<string>): boolean {
  return unit.pairAssessments.some((p: PairAssessment) => {
    const role = candidatesById.get(p.candidateId)?.accountingRole;
    return role !== undefined && roles.has(role);
  });
}

function deriveDiagnosticLabel(
  unit: UnitEvaluationResult,
  candidatesById: Map<string, CandidateSemanticRepresentation>,
  verificationStatus: VerificationStatus,
): DerivedDiagnosticLabel {
  // Ground-truth-side unresolvability takes precedence over any candidate-side finding, mirroring the historical rubric's own precedence order.
  if (unit.groundTruthQuality === "GT_REQUIRES_DOMAIN_REVIEW" || unit.groundTruthQuality === "GT_INCOMPLETE") return "INCOMPARABLE";

  switch (unit.matchStatus) {
    case "EXACT_SINGLE":
    case "EXACT_COMPOSITE":
      if (verificationStatus === "VERIFIED") return "VERIFIED_SEMANTIC_REPRESENTATION";
      if (verificationStatus === "VERIFICATION_INCOMPLETE") return "SEMANTICALLY_REPRESENTED_VERIFICATION_INCOMPLETE";
      return "SEMANTICALLY_REPRESENTED_UNVERIFIED";
    case "PARTIAL":
      return "PARTIAL_SEMANTIC_REPRESENTATION";
    case "AMBIGUOUS":
      return "AMBIGUOUS";
    case "CONTRADICTORY":
      return "CONTRADICTORY_REPRESENTATION";
    case "HONESTLY_UNRESOLVED":
      return "HONESTLY_UNRESOLVED";
    case "HONESTLY_UNSUPPORTED":
      // TERMINOLOGY COLLISION (disclosed in 03-historical-taxonomy-mapping.json):
      // the CURRENT engine's matchStatus="HONESTLY_UNSUPPORTED" means "a
      // corresponding candidate explicitly declares it cannot represent this
      // claim" (a SAFE, claim-specific self-declaration) — this is a
      // different concept from the HISTORICAL rubric's "HONESTLY_UNSUPPORTED"
      // (a SILENT, dangerous gap with no candidate and no flag at all). The
      // atomic facts available here (a corresponding, self-declaring
      // candidate) do not map cleanly onto exactly one of the historical
      // rubric's 12 labels — closest in spirit to HONESTLY_UNRESOLVED, but
      // not identical. Per Section 6, do not invent information: report the
      // genuine ambiguity rather than silently picking one.
      return "UNRESOLVED_FROM_ATOMIC_FACTS";
    case "UNREPRESENTED": {
      if (unit.pairAssessments.length === 0) return "NOT_DISCOVERED";
      if (anyPairHasRole(unit, candidatesById, new Set(["SAFETY_FLAG", "HONEST_UNRESOLVED", "HONEST_UNSUPPORTED"]))) return "DISCOVERED_REVIEW_REQUIRED";
      if (anyPairHasRole(unit, candidatesById, new Set(["INVENTORY_ONLY"]))) return "DISCOVERED_ONLY";
      return "HONESTLY_UNSUPPORTED";
    }
    default:
      return "UNRESOLVED_FROM_ATOMIC_FACTS";
  }
}

/**
 * Section 9: the core dangerous-omission concept. A NO_CREDIT result is not
 * automatically dangerous — only a NO_CREDIT result on a material claim that
 * was NOT specifically surfaced. Uses the same CRITICAL/MATERIAL materiality
 * gate as the frozen dangerousUnaccountedV2 computation (aggregate.ts),
 * unchanged this phase.
 */
function deriveDangerousSilentOmission(materiality: string, creditEligibility: CreditEligibility, surfacingStatus: SurfacingStatus): boolean {
  return MATERIAL_TIERS.has(materiality) && creditEligibility === "NO_CREDIT" && surfacingStatus === "NOT_SPECIFICALLY_SURFACED";
}

function buildRationale(unit: UnitEvaluationResult, contract: Omit<AtomicEvaluationContract, "claimId" | "rationale" | "derivedDiagnosticLabel">): string {
  const parts: string[] = [`matchStatus=${unit.matchStatus}`, `creditEligibility=${contract.creditEligibility}`];
  if (contract.creditEligibility === "NO_CREDIT") parts.push(`surfacingStatus=${contract.surfacingStatus}`);
  parts.push(`representationCompleteness=${contract.representationCompleteness}`, `verificationStatus=${contract.verificationStatus}`, `evidenceQuality=${contract.evidenceQuality}`);
  if (contract.dangerousSilentOmission) parts.push("DANGEROUS_SILENT_OMISSION on a material claim");
  const source = unit.reasonForCredit ?? unit.reasonForPartialCredit ?? unit.reasonForNoCredit ?? "";
  return `${parts.join("; ")}. ${source}`.trim();
}

/**
 * Derive the atomic evaluation contract for one ground-truth unit's already-
 * computed result. Pure function of frozen matcher output — introduces no
 * new matching decision.
 */
export function deriveAtomicContract(unit: UnitEvaluationResult, candidatesById: Map<string, CandidateSemanticRepresentation>): AtomicEvaluationContract {
  const creditEligibility: CreditEligibility = CREDIT_STATUSES.has(unit.matchStatus) ? "CREDIT" : "NO_CREDIT";
  const surfacingStatus = deriveSurfacingStatus(creditEligibility, unit);
  const representationCompleteness = deriveRepresentationCompleteness(unit.matchStatus);
  const verificationStatus = deriveVerificationStatus(unit, candidatesById);
  const evidenceQuality = deriveEvidenceQuality(unit);
  const dangerousSilentOmission = deriveDangerousSilentOmission(unit.materiality, creditEligibility, surfacingStatus);
  const derivedDiagnosticLabel = deriveDiagnosticLabel(unit, candidatesById, verificationStatus);

  const partial = { creditEligibility, surfacingStatus, representationCompleteness, verificationStatus, evidenceQuality, dangerousSilentOmission };
  return {
    claimId: unit.gtUnitId,
    ...partial,
    rationale: buildRationale(unit, partial),
    derivedDiagnosticLabel,
  };
}
