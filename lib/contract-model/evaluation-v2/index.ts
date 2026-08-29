/**
 * Evaluation Methodology V2 — public API and run orchestration.
 *
 * Phase 3F.1.5.
 *
 * INDEPENDENCE (see docs/evaluation-v2/02-independence-matrix.json):
 *  - This module tree consumes production OUTPUTS as EVIDENCE (compiled IR,
 *    discovery candidates, coverage units, verifier findings, amendment
 *    effects). It never consumes a production CONCLUSION as ground truth.
 *  - It never imports scripts/phase-3f*.ts or
 *    lib/contract-model/analyzer/evaluator.ts. An import-boundary test
 *    (tests/evaluation-v2/import-boundary.test.ts) enforces this mechanically.
 *  - Ground truth is loaded only from frozen, human-or-independently-authored
 *    answer-key artifacts, never from anything the compiler produced.
 */
import { buildCandidateIndex, DEFAULT_GENERATION_OPTIONS, generateCandidatePairs } from "./candidate-generation";
import type { CandidateGenerationOptions } from "./candidate-generation";
import { computeAggregateMetrics, evaluateDangerousUnaccountedV2 } from "./aggregate";
import { DETERMINISTIC_ONLY_JUDGE, overlayVerdictFor } from "./adjudication";
import type { GroundTruthOverlay, SemanticJudge } from "./adjudication";
import { currentVersions, evaluationRunIdentity } from "./identity";
import { resolveMatch } from "./matching";
import { evaluatePair, signalsForGroundTruth } from "./semantic-correspondence";
import type {
  CandidateSemanticRepresentation,
  EvaluationRunResult,
  GroundTruthQualityFinding,
  GroundTruthSemanticUnit,
  PairAssessment,
  UnitEvaluationResult,
} from "./types";

export * from "./types";
export * from "./identity";
export * from "./signals";
export * from "./candidate-generation";
export * from "./semantic-correspondence";
export * from "./conflicts";
export * from "./matching";
export * from "./aggregate";
export * from "./evidence";
export * from "./adjudication";

export interface EvaluationOptions {
  datasetKey: string;
  /** Default: deterministic-only (no network, no cost, fully reproducible). */
  judge?: SemanticJudge;
  overlay?: GroundTruthOverlay | null;
  generation?: CandidateGenerationOptions;
  /** Hashes of the frozen input artifacts, folded into the run identity. */
  inputHashes?: Record<string, string>;
  /** Ground-truth quality findings produced by the dataset adapter (e.g. an unresolvable source span). */
  adapterQualityFindings?: GroundTruthQualityFinding[];
}

export async function runEvaluationV2(
  groundTruth: readonly GroundTruthSemanticUnit[],
  candidates: readonly CandidateSemanticRepresentation[],
  options: EvaluationOptions,
): Promise<EvaluationRunResult> {
  const startedAt = Date.now();
  const judge = options.judge ?? DETERMINISTIC_ONLY_JUDGE;
  const deterministicOnly = judge === DETERMINISTIC_ONLY_JUDGE;
  const generation = options.generation ?? DEFAULT_GENERATION_OPTIONS;

  const index = buildCandidateIndex(candidates);
  const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));

  let generatedPairCount = 0;
  let evaluatedPairCount = 0;
  let aiCallCount = 0;
  let aiCacheHitCount = 0;

  const units: UnitEvaluationResult[] = [];
  const qualityFindings: GroundTruthQualityFinding[] = [...(options.adapterQualityFindings ?? [])];
  const excludedUnitIds = new Set<string>();

  // Deterministic ordering so a repeated run over identical inputs produces
  // byte-identical output.
  const orderedGroundTruth = [...groundTruth].sort((a, b) => a.gtUnitId.localeCompare(b.gtUnitId));

  for (const gt of orderedGroundTruth) {
    const gtSignals = signalsForGroundTruth(gt);
    const generated = generateCandidatePairs(gt, gtSignals, index, generation);
    generatedPairCount += generated.length;

    const pairs: PairAssessment[] = [];
    for (const g of generated) {
      const candidate = candidatesById.get(g.candidateId);
      if (!candidate) continue;
      const candidateSignals = index.signals.get(g.candidateId);
      let assessment = evaluatePair(
        { gt, candidate, generationReasons: g.reasons, gtSignals, candidateSignals },
        { deterministicOnly },
        null,
      );
      evaluatedPairCount += 1;

      if (!deterministicOnly && assessment.correspondence === "INDETERMINATE") {
        const indeterminate = assessment.dimensions.filter((d) => d.outcome === "INDETERMINATE").map((d) => d.dimension);
        const judgment = await judge.judge({ gt, candidate, indeterminateDimensions: indeterminate });
        if (judgment) {
          if (judgment.cached) aiCacheHitCount += 1;
          else aiCallCount += 1;
          assessment = evaluatePair({ gt, candidate, generationReasons: g.reasons, gtSignals, candidateSignals }, { deterministicOnly }, judgment);
        }
      }
      pairs.push(assessment);
    }

    const resolution = resolveMatch({ gtUnitId: gt.gtUnitId, pairs, candidatesById });
    const correspondingCandidates = pairs
      .filter((p) => p.correspondence === "CORRESPONDS_FULLY" || p.correspondence === "CORRESPONDS_PARTIALLY")
      .map((p) => candidatesById.get(p.candidateId))
      .filter((c): c is CandidateSemanticRepresentation => Boolean(c));

    const danger = evaluateDangerousUnaccountedV2({
      gt,
      matchStatus: resolution.matchStatus,
      explicitlySurfacedAsUnsafe: resolution.explicitlySurfacedAsUnsafe,
      correspondingCandidates,
    });

    const overlay = overlayVerdictFor(options.overlay ?? null, gt.gtUnitId);
    if (overlay.excluded) excludedUnitIds.add(gt.gtUnitId);
    if (overlay.verdict !== "GT_CONFIRMED" && !qualityFindings.some((f) => f.gtUnitId === gt.gtUnitId)) {
      qualityFindings.push({
        gtUnitId: gt.gtUnitId,
        verdict: overlay.verdict,
        evidence: overlay.reason ?? "",
        excludedFromCleanAggregates: overlay.excluded,
        exclusionReason: overlay.excluded ? overlay.reason : null,
      });
    }

    const winningConflicts = pairs
      .filter((p) => resolution.matchedCandidateIds.includes(p.candidateId))
      .flatMap((p) => p.conflicts);

    units.push({
      gtUnitId: gt.gtUnitId,
      datasetKey: gt.datasetKey,
      documentId: gt.documentId,
      sectionRef: gt.sectionRef,
      materiality: gt.materiality,
      semanticFamily: gt.semanticFamily,
      unitType: gt.unitType,
      provisionRole: gt.provisionRole,
      matchStatus: resolution.matchStatus,
      representationStatus: resolution.representationStatus,
      semanticCorrectness: resolution.semanticCorrectness,
      matchedCandidateIds: resolution.matchedCandidateIds,
      rejectedCandidateIds: resolution.rejectedCandidateIds,
      ambiguousClusters: resolution.ambiguousClusters,
      pairAssessments: pairs,
      conflicts: winningConflicts,
      explicitlySurfacedAsUnsafe: resolution.explicitlySurfacedAsUnsafe,
      surfacedAsUnsafeBy: resolution.surfacedAsUnsafeBy,
      surfacedByInventoryOnly: resolution.surfacedByInventoryOnly,
      dangerousUnaccountedV2: danger.dangerous,
      dangerousUnaccountedReason: danger.reason,
      confidence: resolution.confidence,
      reasonForCredit: resolution.reasonForCredit,
      reasonForPartialCredit: resolution.reasonForPartialCredit,
      reasonForNoCredit: resolution.reasonForNoCredit,
      groundTruthQuality: overlay.verdict,
      versions: currentVersions(),
    });
  }

  const metrics = computeAggregateMetrics({
    datasetKey: options.datasetKey,
    units,
    excludedUnitIds,
    totalCandidates: candidates.length,
  });

  const estimatedCostUsd = Number((aiCallCount * judge.estimatedCostPerCallUsd).toFixed(6));

  return {
    runIdentity: evaluationRunIdentity(options.datasetKey, options.inputHashes ?? {}),
    datasetKey: options.datasetKey,
    versions: currentVersions(),
    units,
    metrics,
    groundTruthQuality: qualityFindings.sort((a, b) => a.gtUnitId.localeCompare(b.gtUnitId)),
    performance: {
      groundTruthUnitCount: groundTruth.length,
      candidateCount: candidates.length,
      generatedPairCount,
      evaluatedPairCount,
      aiCallCount,
      aiCacheHitCount,
      estimatedCostUsd,
      runtimeMs: Date.now() - startedAt,
    },
  };
}
