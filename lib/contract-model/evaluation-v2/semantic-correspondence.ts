/**
 * Evaluation Methodology V2 — Layer 2: semantic correspondence analysis.
 *
 * Phase 3F.1.5. For each plausible pair produced by candidate-generation.ts,
 * this layer answers ONE question: *does this candidate substantively
 * represent this ground-truth claim?* — considering meaning, never location.
 *
 * The answer is produced dimension by dimension (types.ts's
 * CorrespondenceDimension), never as a single opaque similarity scalar. A
 * scalar `correspondenceStrength` exists, but it is used only to ORDER
 * candidates that have ALREADY passed the categorical gate; it can never
 * promote a candidate past that gate.
 *
 * Operating modes:
 *  - deterministic-only (default): no network, no cost, fully reproducible.
 *  - judge-assisted: a bounded, schema-constrained AI call is consulted ONLY
 *    for pairs the deterministic layer marks INDETERMINATE. The judge can
 *    downgrade or confirm; it can never manufacture credit on a pair the
 *    deterministic layer found materially conflicting, and it never decides an
 *    aggregate number (adjudication.ts).
 */
import { detectConflicts, MIN_SHARED_TERMS_FOR_CORRESPONDENCE, MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT, OBJECT_CORRESPONDENCE_THRESHOLD, OBJECT_MATERIAL_CONFLICT_THRESHOLD } from "./conflicts";
import { extractSignals, jaccard, overlapDetail, postureClass } from "./signals";
import type {
  CandidateGenerationReason,
  CandidateSemanticRepresentation,
  ConflictFinding,
  CorrespondenceDimension,
  DimensionAssessment,
  DimensionOutcome,
  GroundTruthSemanticUnit,
  NumericComparisonRecord,
  PairAssessment,
  PairCorrespondence,
  SemanticJudgeOutput,
  SemanticSignals,
} from "./types";
import { CORE_CREDIT_DIMENSIONS } from "./types";

export interface SemanticCorrespondenceOptions {
  /** When false, INDETERMINATE core dimensions may be referred to the semantic judge. */
  deterministicOnly: boolean;
}

export interface PairEvaluationInput {
  gt: GroundTruthSemanticUnit;
  candidate: CandidateSemanticRepresentation;
  generationReasons: CandidateGenerationReason[];
  gtSignals?: SemanticSignals;
  candidateSignals?: SemanticSignals;
}

export function signalsForGroundTruth(gt: GroundTruthSemanticUnit): SemanticSignals {
  return extractSignals({
    text: [gt.sourceExcerpt, gt.semanticDescription, gt.notes ?? ""].filter(Boolean).join("\n"),
    declaredType: gt.unitType,
    structuredHints: [gt.semanticFamily, ...gt.referencedDefinedTerms, ...gt.objectResource, ...gt.action, ...gt.scope],
  });
}

export function signalsForCandidate(candidate: CandidateSemanticRepresentation): SemanticSignals {
  return extractSignals({
    text: [...candidate.excerpts, candidate.normalizedSemantics, candidate.formulaSemantics ?? ""].filter(Boolean).join("\n"),
    declaredType: candidate.representationType === "DISCOVERY_CANDIDATE" ? candidate.provisionRoleDeclared ?? null : candidate.representationType,
    structuredHints: [candidate.semanticFamily, ...candidate.referencedDefinedTerms, ...candidate.objectResource, ...candidate.action, ...candidate.scope],
  });
}

// ---------------------------------------------------------------------------
// Dimension assessment
// ---------------------------------------------------------------------------

function worstOutcome(conflicts: readonly ConflictFinding[], dimension: CorrespondenceDimension): DimensionOutcome | null {
  const forDim = conflicts.filter((c) => c.dimension === dimension);
  if (forDim.some((c) => c.severity === "MATERIAL_CONFLICT")) return "MATERIAL_CONFLICT";
  if (forDim.some((c) => c.severity === "MISSING_REQUIRED_DIMENSION")) return "MISSING_REQUIRED_DIMENSION";
  if (forDim.some((c) => c.severity === "NON_MATERIAL_VARIANCE")) return "NON_MATERIAL_VARIANCE";
  return null;
}

interface DimensionContext {
  gt: GroundTruthSemanticUnit;
  candidate: CandidateSemanticRepresentation;
  gtSignals: SemanticSignals;
  candidateSignals: SemanticSignals;
  conflicts: ConflictFinding[];
}

function assessDimensions(ctx: DimensionContext): DimensionAssessment[] {
  const { gt, candidate, gtSignals, candidateSignals, conflicts } = ctx;
  const out: DimensionAssessment[] = [];

  const gtActions = gt.action.length > 0 ? gt.action : gtSignals.actions;
  const candActions = candidate.action.length > 0 ? candidate.action : candidateSignals.actions;
  out.push(
    build("A_SUBJECT_ACTION", gtActions.length > 0, gtActions, candActions, conflicts, () => {
      if (gtActions.length === 0) return "NOT_APPLICABLE";
      if (candActions.length === 0) return "MISSING_REQUIRED_DIMENSION";
      return gtActions.some((a) => candActions.includes(a)) ? "CORRESPONDS" : "MATERIAL_CONFLICT";
    }),
  );

  const gtPosture = gt.legalPosture;
  const candPosture = candidate.legalPosture;
  out.push(
    build("B_LEGAL_POSTURE", gtPosture !== "UNDETERMINED", [`${gtPosture} (${postureClass(gtPosture)})`], [`${candPosture} (${postureClass(candPosture)})`], conflicts, () => {
      if (gtPosture === "UNDETERMINED") return "NOT_APPLICABLE";
      if (candPosture === "UNDETERMINED") return "INDETERMINATE";
      if (gtPosture === candPosture) return "CORRESPONDS";
      const gtClass = postureClass(gtPosture);
      const candClass = postureClass(candPosture);
      if (gtClass === candClass) return "CORRESPONDS";
      const inverted = (gtClass === "RESTRICTIVE" && candClass === "PERMISSIVE") || (gtClass === "PERMISSIVE" && candClass === "RESTRICTIVE");
      return inverted ? "MATERIAL_CONFLICT" : "NON_MATERIAL_VARIANCE";
    }),
  );

  const objectOverlap = overlapDetail(gtSignals.contentTerms, candidateSignals.contentTerms);
  const familyMatch = gt.semanticFamily !== "" && gt.semanticFamily === candidate.semanticFamily;
  out.push(
    build(
      "C_OBJECT_RESOURCE",
      true,
      [`family=${gt.semanticFamily}`, `object=[${gt.objectResource.join(", ")}]`, `contentTerms=${gtSignals.contentTerms.length}`],
      [
        `family=${candidate.semanticFamily}`,
        `object=[${candidate.objectResource.join(", ")}]`,
        `overlapCoefficient=${objectOverlap.coefficient.toFixed(3)}`,
        `sharedSubstantiveTerms=${objectOverlap.sharedCount}`,
      ],
      conflicts,
      () => {
        if (gtSignals.contentTerms.length === 0 || candidateSignals.contentTerms.length === 0) return "INDETERMINATE";
        if (objectOverlap.coefficient >= OBJECT_CORRESPONDENCE_THRESHOLD && objectOverlap.sharedCount >= MIN_SHARED_TERMS_FOR_CORRESPONDENCE) return "CORRESPONDS";
        if (familyMatch && objectOverlap.coefficient >= OBJECT_MATERIAL_CONFLICT_THRESHOLD && objectOverlap.sharedCount >= MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT) return "CORRESPONDS";
        if (objectOverlap.coefficient >= OBJECT_MATERIAL_CONFLICT_THRESHOLD && objectOverlap.sharedCount >= MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT) return "INDETERMINATE";
        return "MATERIAL_CONFLICT";
      },
    ),
  );

  const gtScope = gt.scope.length > 0 ? gt.scope : gtSignals.scope;
  const candScope = candidate.scope.length > 0 ? candidate.scope : candidateSignals.scope;
  out.push(
    build("D_SCOPE_ENTITY", gtScope.length > 0, gtScope, candScope, conflicts, () => {
      if (gtScope.length === 0) return "NOT_APPLICABLE";
      if (candScope.length === 0) return "MISSING_REQUIRED_DIMENSION";
      if (gtScope.some((s) => candScope.includes(s))) return "CORRESPONDS";
      return "MATERIAL_CONFLICT";
    }),
  );

  const gtHasEconomics = gt.figures.length > 0 || gtSignals.amounts.length > 0 || gtSignals.percentages.length > 0 || gtSignals.ratios.length > 0;
  out.push(
    build(
      "E_ECONOMICS",
      gtHasEconomics,
      [...gt.figures.map((f) => f.raw), ...gtSignals.amounts.map((f) => f.raw), ...gtSignals.percentages.map((f) => f.raw), ...gtSignals.ratios.map((f) => f.raw)],
      [...candidate.figures.map((f) => f.raw), ...candidateSignals.amounts.map((f) => f.raw), ...candidateSignals.percentages.map((f) => f.raw), ...candidateSignals.ratios.map((f) => f.raw)],
      conflicts,
      () => {
        if (!gtHasEconomics) return "NOT_APPLICABLE";
        const dimConflict = worstOutcome(conflicts, "E_ECONOMICS");
        return dimConflict ?? "CORRESPONDS";
      },
    ),
  );

  const gtConditions = gt.conditions.length > 0 ? gt.conditions : gtSignals.conditions;
  out.push(
    build("F_CONDITIONS_EXCEPTIONS", gtConditions.length > 0 || gt.exceptions.length > 0 || gt.materialDependencies.length > 0, gtConditions, candidate.conditions.length > 0 ? candidate.conditions : candidateSignals.conditions, conflicts, () => {
      const dimConflict = worstOutcome(conflicts, "F_CONDITIONS_EXCEPTIONS");
      if (dimConflict) return dimConflict;
      if (gtConditions.length === 0 && gt.exceptions.length === 0 && gt.materialDependencies.length === 0) return "NOT_APPLICABLE";
      return "CORRESPONDS";
    }),
  );

  out.push(
    build("G_OPERATIVE_PROVENANCE", true, [gt.documentId, gt.operativeStateAssumption], [candidate.documentId, candidate.operativeProvenance.operativeVersionRef ?? "(no operative version ref)"], conflicts, () => {
      const dimConflict = worstOutcome(conflicts, "G_OPERATIVE_PROVENANCE");
      return dimConflict ?? "CORRESPONDS";
    }),
  );

  const gtBreadth = gt.provisionBreadth;
  const candBreadth = candidate.provisionBreadth;
  out.push(
    build(
      "H_PROVISION_ROLE_BREADTH",
      gtBreadth !== "INDETERMINATE_BREADTH",
      [`breadth=${gtBreadth}`, `role=${gt.provisionRole}`],
      [`breadth=${candBreadth}`, `role=${candidate.provisionRole}`],
      conflicts,
      () => {
        const dimConflict = worstOutcome(conflicts, "H_PROVISION_ROLE_BREADTH");
        if (dimConflict) return dimConflict;
        if (gtBreadth === "INDETERMINATE_BREADTH") return "INDETERMINATE";
        // The ground truth asserts a determinate breadth and the candidate does
        // not demonstrate one. Representation has NOT been established: a claim
        // of universal breadth is not shown to be represented by a candidate
        // that cannot be shown to be universal, and the same holds in reverse.
        // This caps such a pair at PARTIAL rather than crediting it — the
        // general rule that keeps a chapeau from being satisfied by an
        // unidentifiable fragment beneath it.
        if (candBreadth === "INDETERMINATE_BREADTH") return "MISSING_REQUIRED_DIMENSION";
        return "CORRESPONDS";
      },
    ),
  );

  return out;
}

function build(
  dimension: CorrespondenceDimension,
  requiredByGroundTruth: boolean,
  gtEvidence: readonly unknown[],
  candidateEvidence: readonly unknown[],
  conflicts: readonly ConflictFinding[],
  compute: () => DimensionOutcome,
): DimensionAssessment {
  // A material conflict recorded by Layer 3 always controls this dimension's
  // outcome. Without this, a conflict detected on a dimension whose positive
  // test happened to pass (e.g. an instrument mismatch inside an otherwise
  // well-corresponding object/resource dimension) would be silently outvoted —
  // which is exactly how a scalar-similarity evaluator buries conflicts.
  const dimConflicts = conflicts.filter((c) => c.dimension === dimension);
  const forced = worstOutcome(conflicts, dimension);
  const outcome: DimensionOutcome = forced === "MATERIAL_CONFLICT" ? "MATERIAL_CONFLICT" : compute();
  return {
    dimension,
    outcome,
    requiredByGroundTruth,
    groundTruthEvidence: gtEvidence.map(String),
    candidateEvidence: candidateEvidence.map(String),
    rationale:
      dimConflicts.length > 0
        ? dimConflicts.map((c) => `${c.code}: ${c.explanation}`).join(" || ")
        : outcome === "CORRESPONDS"
          ? "ground truth and candidate assert compatible content on this dimension"
          : outcome === "NOT_APPLICABLE"
            ? "ground truth asserts nothing on this dimension"
            : outcome === "INDETERMINATE"
              ? "insufficient content evidence on one side to decide this dimension"
              : "see conflicts",
  };
}

// ---------------------------------------------------------------------------
// Pair correspondence
// ---------------------------------------------------------------------------

export function evaluatePair(input: PairEvaluationInput, options: SemanticCorrespondenceOptions, judge?: SemanticJudgeOutput | null): PairAssessment {
  const gtSignals = input.gtSignals ?? signalsForGroundTruth(input.gt);
  const candidateSignals = input.candidateSignals ?? signalsForCandidate(input.candidate);
  const { conflicts } = detectConflicts({ gt: input.gt, candidate: input.candidate, gtSignals, candidateSignals });
  const dimensions = assessDimensions({ gt: input.gt, candidate: input.candidate, gtSignals, candidateSignals, conflicts });

  const byDim = new Map<CorrespondenceDimension, DimensionAssessment>(dimensions.map((d) => [d.dimension, d]));
  // Read from the CONFLICT record, not from the dimension outcomes, so a
  // conflict can never be lost between the two representations.
  const hasMaterialConflict = conflicts.some((c) => c.severity === "MATERIAL_CONFLICT") || dimensions.some((d) => d.outcome === "MATERIAL_CONFLICT");
  const coreOutcomes = CORE_CREDIT_DIMENSIONS.map((d) => byDim.get(d)?.outcome ?? "INDETERMINATE");
  const coreAllPresent = coreOutcomes.every((o) => o === "CORRESPONDS" || o === "NOT_APPLICABLE");
  const coreIndeterminate = coreOutcomes.some((o) => o === "INDETERMINATE");
  // A MISSING_REQUIRED_DIMENSION outcome IS the proof that the ground truth
  // asserted something on that dimension, so it is counted regardless of the
  // separately-computed `requiredByGroundTruth` flag.
  const requiredMissing = dimensions.filter((d) => d.outcome === "MISSING_REQUIRED_DIMENSION");

  let correspondence: PairCorrespondence;
  let reason: string;
  if (hasMaterialConflict) {
    correspondence = "CONTRADICTS";
    const codes = conflicts.filter((c) => c.severity === "MATERIAL_CONFLICT").map((c) => c.code);
    reason = `Material conflict on ${[...new Set(codes)].join(", ")} — the candidate asserts something the ground-truth claim contradicts, so it cannot represent it regardless of where it sits in the document.`;
  } else if (coreAllPresent && requiredMissing.length === 0) {
    correspondence = "CORRESPONDS_FULLY";
    reason = "Every dimension the ground truth asserts corresponds, including all four core dimensions (action, posture, object/resource, provision role).";
  } else if (coreAllPresent && requiredMissing.length > 0) {
    correspondence = "CORRESPONDS_PARTIALLY";
    reason = `Core dimensions correspond, but the candidate is silent on ${requiredMissing.map((d) => d.dimension).join(", ")}.`;
  } else if (coreIndeterminate) {
    correspondence = "INDETERMINATE";
    reason = `Core dimension(s) ${CORE_CREDIT_DIMENSIONS.filter((d) => byDim.get(d)?.outcome === "INDETERMINATE").join(", ")} could not be decided from the available content evidence.`;
  } else {
    correspondence = "NO_CORRESPONDENCE";
    reason = "One or more core dimensions do not correspond and the evidence is not merely thin — no substantive representation of this claim.";
  }

  // The judge may only CONFIRM or DOWNGRADE. It is consulted only for
  // INDETERMINATE pairs, and it can never override a material conflict.
  let effective = correspondence;
  if (judge && correspondence === "INDETERMINATE") {
    if (judge.corresponds === "YES") effective = "CORRESPONDS_FULLY";
    else if (judge.corresponds === "PARTIAL") effective = "CORRESPONDS_PARTIALLY";
    else if (judge.corresponds === "NO") effective = "NO_CORRESPONDENCE";
    else effective = "INDETERMINATE";
    reason = `${reason} Semantic judge (${judge.provider}/${judge.model}, prompt ${judge.promptVersion}) returned ${judge.corresponds}: ${judge.rationale}`;
  }

  return {
    gtUnitId: input.gt.gtUnitId,
    candidateId: input.candidate.candidateId,
    generationReasons: input.generationReasons,
    dimensions,
    conflicts,
    correspondence: effective,
    correspondenceStrength: strengthOf(dimensions, gtSignals, candidateSignals),
    deterministicOnly: options.deterministicOnly || !judge,
    judge: judge ?? null,
    reason,
  };
}

/**
 * Ordering signal only. Never consulted before the categorical gate above; a
 * high strength can never rescue a CONTRADICTS or NO_CORRESPONDENCE pair.
 */
function strengthOf(dimensions: readonly DimensionAssessment[], gtSignals: SemanticSignals, candidateSignals: SemanticSignals): number {
  let score = 0;
  let weight = 0;
  for (const d of dimensions) {
    if (d.outcome === "NOT_APPLICABLE") continue;
    const w = CORE_CREDIT_DIMENSIONS.includes(d.dimension) ? 2 : 1;
    weight += w;
    if (d.outcome === "CORRESPONDS") score += w;
    else if (d.outcome === "NON_MATERIAL_VARIANCE") score += w * 0.7;
    else if (d.outcome === "INDETERMINATE") score += w * 0.25;
  }
  const dimensional = weight === 0 ? 0 : score / weight;
  const lexical = jaccard(gtSignals.contentTerms, candidateSignals.contentTerms);
  return Number((dimensional * 0.85 + lexical * 0.15).toFixed(4));
}

export function numericComparisonsFor(gt: GroundTruthSemanticUnit, candidate: CandidateSemanticRepresentation): NumericComparisonRecord[] {
  const gtSignals = signalsForGroundTruth(gt);
  const candidateSignals = signalsForCandidate(candidate);
  return detectConflicts({ gt, candidate, gtSignals, candidateSignals }).numericComparisons;
}
