/**
 * Evaluation Methodology V2 — coverage states, DANGEROUS_UNACCOUNTED_V2, and
 * aggregate metrics.
 *
 * Phase 3F.1.5. Every metric here is computed ONLY after unit-level evidence
 * is frozen, and every published percentage carries the exact unit ids behind
 * its numerator and denominator (types.ts's RatioWithUnits). There is no
 * aggregate in this module that cannot be traced back to named units.
 */
import { currentVersions } from "./identity";
import type {
  AggregateMetrics,
  CandidateSemanticRepresentation,
  EvaluationMateriality,
  GroundTruthSemanticUnit,
  MatchStatus,
  RatioWithUnits,
  UnitEvaluationResult,
} from "./types";
import { HIGH_MATERIALITY } from "./types";

// ---------------------------------------------------------------------------
// DANGEROUS_UNACCOUNTED_SEMANTIC_UNIT_V2
// ---------------------------------------------------------------------------

export interface DangerousUnaccountedInput {
  gt: GroundTruthSemanticUnit;
  matchStatus: MatchStatus;
  explicitlySurfacedAsUnsafe: boolean;
  /** Candidates that PASSED semantic correspondence (fully or partially). A flag on a non-corresponding candidate never counts. */
  correspondingCandidates: CandidateSemanticRepresentation[];
}

export interface DangerousUnaccountedVerdict {
  dangerous: boolean;
  reason: string | null;
}

/**
 * A ground-truth unit is a DANGEROUS_UNACCOUNTED_SEMANTIC_UNIT_V2 when ALL of:
 *   1. its materiality is CRITICAL or MATERIAL;
 *   2. no semantically-corresponding representation adequately accounts for
 *      the claim;
 *   3. the system does not explicitly surface the claim as unresolved /
 *      unsupported / review-required / missing-context / otherwise-unsafe
 *      THROUGH A SEMANTICALLY-CORRESPONDING CANDIDATE;
 *   4. no candidate excerpt actually substantiates the claim.
 *
 * Condition 3's qualifier is the whole point. The historical scorer treated a
 * dangerous-unaccounted flag anywhere under the same section number as
 * accounting for the claim; that is how an unrelated intercompany-debt basket
 * came to "cover" a general Indebtedness prohibition. Here, a flag only
 * accounts for a claim when it sits on a candidate that actually represents
 * that claim.
 *
 * This function never reads a section number, a descendant/ancestor relation,
 * a nearby dollar figure, or a neighbouring unit's materiality.
 */
export function evaluateDangerousUnaccountedV2(input: DangerousUnaccountedInput): DangerousUnaccountedVerdict {
  const { gt, matchStatus, explicitlySurfacedAsUnsafe, correspondingCandidates } = input;

  if (!HIGH_MATERIALITY.has(gt.materiality)) {
    return { dangerous: false, reason: null };
  }

  if (matchStatus === "EXACT_SINGLE" || matchStatus === "EXACT_COMPOSITE") {
    return { dangerous: false, reason: null };
  }

  if (matchStatus === "HONESTLY_UNSUPPORTED" || matchStatus === "HONESTLY_UNRESOLVED") {
    return { dangerous: false, reason: null };
  }

  if (explicitlySurfacedAsUnsafe) {
    return { dangerous: false, reason: null };
  }

  const substantiating = correspondingCandidates.filter((c) => c.excerpts.some((e) => e.trim().length > 0));
  if (matchStatus === "PARTIAL" && substantiating.length > 0) {
    // Partially represented AND unflagged is still dangerous when the missing
    // piece is material — but a partial representation with real substantiating
    // excerpt text is a different (lesser) risk than a silent omission, so it
    // is reported with its own reason rather than being collapsed together.
    return {
      dangerous: true,
      reason: `CRITICAL/MATERIAL claim is only PARTIALLY represented and the system does not surface the gap. Substantiating excerpt exists on ${substantiating.length} corresponding candidate(s), but required dimensions are missing and unflagged.`,
    };
  }

  if (matchStatus === "AMBIGUOUS") {
    return {
      dangerous: true,
      reason: "CRITICAL/MATERIAL claim resolves to irreconcilable competing candidates and the system does not surface the ambiguity.",
    };
  }

  if (matchStatus === "CONTRADICTORY") {
    return {
      dangerous: true,
      reason: "CRITICAL/MATERIAL claim's best available candidate materially contradicts it, and nothing flags the discrepancy.",
    };
  }

  return {
    dangerous: true,
    reason: "CRITICAL/MATERIAL claim has no semantically-corresponding representation, no honest unresolved/unsupported declaration, and no candidate excerpt substantiating it.",
  };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

function ratio(numeratorUnits: readonly UnitEvaluationResult[], denominatorUnits: readonly UnitEvaluationResult[]): RatioWithUnits {
  const numeratorUnitIds = numeratorUnits.map((u) => u.gtUnitId).sort();
  const denominatorUnitIds = denominatorUnits.map((u) => u.gtUnitId).sort();
  return {
    numerator: numeratorUnitIds.length,
    denominator: denominatorUnitIds.length,
    rate: denominatorUnitIds.length === 0 ? 0 : Number((numeratorUnitIds.length / denominatorUnitIds.length).toFixed(6)),
    numeratorUnitIds,
    denominatorUnitIds,
  };
}

const CREDITED: ReadonlySet<MatchStatus> = new Set<MatchStatus>(["EXACT_SINGLE", "EXACT_COMPOSITE"]);

export interface AggregateInput {
  datasetKey: string;
  units: UnitEvaluationResult[];
  /** Unit ids excluded from clean aggregates by an adjudication overlay, with reasons recorded elsewhere. */
  excludedUnitIds: ReadonlySet<string>;
  /** Total candidates the evaluator was given, for candidate precision. */
  totalCandidates: number;
}

export function computeAggregateMetrics(input: AggregateInput): AggregateMetrics {
  const clean = input.units.filter((u) => !input.excludedUnitIds.has(u.gtUnitId));
  const byMateriality = (m: EvaluationMateriality) => clean.filter((u) => u.materiality === m);
  const critical = byMateriality("CRITICAL");
  const material = byMateriality("MATERIAL");
  const highMateriality = clean.filter((u) => HIGH_MATERIALITY.has(u.materiality));

  const credited = (units: readonly UnitEvaluationResult[]) => units.filter((u) => CREDITED.has(u.matchStatus));

  const byMatchStatus: Record<string, number> = {};
  const byRepresentationStatus: Record<string, number> = {};
  const bySemanticCorrectness: Record<string, number> = {};
  for (const u of clean) {
    byMatchStatus[u.matchStatus] = (byMatchStatus[u.matchStatus] ?? 0) + 1;
    byRepresentationStatus[u.representationStatus] = (byRepresentationStatus[u.representationStatus] ?? 0) + 1;
    bySemanticCorrectness[u.semanticCorrectness] = (bySemanticCorrectness[u.semanticCorrectness] ?? 0) + 1;
  }

  const dangerous = clean.filter((u) => u.dangerousUnaccountedV2);

  // False credit: a unit credited (EXACT_*) whose winning candidate set carries
  // any MATERIAL_CONFLICT. Under this evaluator's own gate that set is empty by
  // construction; it is computed and published anyway so the number is a
  // measured 0 rather than an asserted one.
  const falseCredits = credited(clean).filter((u) => u.conflicts.some((c) => c.severity === "MATERIAL_CONFLICT"));

  // Candidate precision: of the candidates the evaluator actually credited,
  // how many distinct candidates were used, over all candidates offered.
  const usedCandidateIds = new Set<string>();
  for (const u of clean) for (const id of u.matchedCandidateIds) usedCandidateIds.add(id);

  let evaluatedPairCount = 0;
  let correspondingPairCount = 0;
  for (const u of clean) {
    for (const p of u.pairAssessments) {
      evaluatedPairCount += 1;
      if (p.correspondence === "CORRESPONDS_FULLY" || p.correspondence === "CORRESPONDS_PARTIALLY") correspondingPairCount += 1;
    }
  }

  return {
    datasetKey: input.datasetKey,
    versions: currentVersions(),
    totalGroundTruthUnits: input.units.length,
    excludedByOverlay: input.units.length - clean.length,
    cleanDenominator: clean.length,

    criticalSemanticRecall: ratio(credited(critical), critical),
    materialSemanticRecall: ratio(credited(material), material),
    combinedCriticalMaterialRecall: ratio(credited(highMateriality), highMateriality),
    exactSemanticCorrectnessRate: ratio(
      clean.filter((u) => u.semanticCorrectness === "CORRECT"),
      clean,
    ),
    partialRepresentationRate: ratio(
      clean.filter((u) => u.representationStatus === "PARTIALLY_REPRESENTED"),
      clean,
    ),
    honestUnresolvedOrUnsupportedRate: ratio(
      clean.filter((u) => u.matchStatus === "HONESTLY_UNRESOLVED" || u.matchStatus === "HONESTLY_UNSUPPORTED"),
      clean,
    ),
    ambiguousMatchRate: ratio(
      clean.filter((u) => u.matchStatus === "AMBIGUOUS"),
      clean,
    ),
    falseCreditRate: ratio(falseCredits, credited(clean)),
    inventoryOnlySurfacedRate: ratio(
      clean.filter((u) => u.representationStatus === "UNREPRESENTED" && u.surfacedByInventoryOnly.length > 0),
      clean,
    ),
    noCorrespondingCandidateRate: ratio(
      clean.filter((u) => u.matchedCandidateIds.length === 0 && u.surfacedAsUnsafeBy.length === 0 && u.surfacedByInventoryOnly.length === 0),
      clean,
    ),
    candidateGenerationPrecision: {
      numerator: correspondingPairCount,
      denominator: evaluatedPairCount,
      rate: evaluatedPairCount === 0 ? 0 : Number((correspondingPairCount / evaluatedPairCount).toFixed(6)),
      numeratorUnitIds: [],
      denominatorUnitIds: [],
    },
    creditedCandidateShare: {
      numerator: usedCandidateIds.size,
      denominator: input.totalCandidates,
      rate: input.totalCandidates === 0 ? 0 : Number((usedCandidateIds.size / input.totalCandidates).toFixed(6)),
      numeratorUnitIds: [...usedCandidateIds].sort(),
      denominatorUnitIds: [],
    },

    dangerousUnaccountedCount: dangerous.length,
    dangerousUnaccountedUnitIds: dangerous.map((u) => u.gtUnitId).sort(),

    byMatchStatus,
    byRepresentationStatus,
    bySemanticCorrectness,
  };
}
