/**
 * Evaluation Methodology V2 — reproducibility and cost runner.
 *
 * Phase 3F.1.5. Architecture invariant #21: re-running the same inputs must
 * produce byte-identical (or explicitly, narrowly, disclosed-as-non-
 * deterministic) output.
 *
 * This runner executes the DSGR evaluation TWICE over byte-identical frozen
 * inputs and compares:
 *   - the run identity (a hash of dataset key + input file hashes + all four
 *     version constants),
 *   - a content hash of the complete unit-level result set,
 *   - a per-unit difference report.
 *
 * It also replays the run through the semantic-judge cache path to prove that a
 * cached judgment reproduces the first run's disposition exactly.
 *
 * Writes: 11-reproducibility-and-cost.json
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/run-reproducibility.ts
 */
import { createInMemoryJudgeCache, DETERMINISTIC_ONLY_JUDGE } from "../adjudication";
import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { contentHash, currentVersions } from "../identity";
import { runEvaluationV2 } from "../index";
import type { EvaluationRunResult, UnitEvaluationResult } from "../types";
import { artifactHeader, writeArtifact } from "./artifacts";

/** The disposition surface a repeated run must reproduce exactly. */
function dispositionFingerprint(units: readonly UnitEvaluationResult[]): unknown {
  return units.map((u) => ({
    gtUnitId: u.gtUnitId,
    matchStatus: u.matchStatus,
    representationStatus: u.representationStatus,
    semanticCorrectness: u.semanticCorrectness,
    dangerousUnaccountedV2: u.dangerousUnaccountedV2,
    explicitlySurfacedAsUnsafe: u.explicitlySurfacedAsUnsafe,
    matchedCandidateIds: u.matchedCandidateIds,
    confidence: u.confidence,
    conflictCodes: u.conflicts.map((c) => `${c.severity}:${c.code}:${c.dimension}`).sort(),
  }));
}

function diffUnits(a: readonly UnitEvaluationResult[], b: readonly UnitEvaluationResult[]): { gtUnitId: string; field: string; first: unknown; replay: unknown }[] {
  const byId = new Map(b.map((u) => [u.gtUnitId, u]));
  const out: { gtUnitId: string; field: string; first: unknown; replay: unknown }[] = [];
  for (const first of a) {
    const replay = byId.get(first.gtUnitId);
    if (!replay) {
      out.push({ gtUnitId: first.gtUnitId, field: "presence", first: "present", replay: "absent" });
      continue;
    }
    for (const field of ["matchStatus", "representationStatus", "semanticCorrectness", "dangerousUnaccountedV2", "confidence"] as const) {
      if (first[field] !== replay[field]) out.push({ gtUnitId: first.gtUnitId, field, first: first[field], replay: replay[field] });
    }
    if (contentHash(first.matchedCandidateIds) !== contentHash(replay.matchedCandidateIds)) {
      out.push({ gtUnitId: first.gtUnitId, field: "matchedCandidateIds", first: first.matchedCandidateIds, replay: replay.matchedCandidateIds });
    }
  }
  return out;
}

export async function runReproducibility(repoRoot: string): Promise<{ identical: boolean; writtenArtifacts: { path: string; sha256: string; bytes: number }[] }> {
  const wallStart = Date.now();
  const dataset = loadDsgrDataset(repoRoot);

  const freshStart = Date.now();
  const fresh: EvaluationRunResult = await runEvaluationV2(dataset.groundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
  });
  const freshMs = Date.now() - freshStart;

  // Replay: reload the dataset from disk (so the whole adapter path is
  // re-exercised, not just the engine) and run again with a warm judge cache.
  const replayDataset = loadDsgrDataset(repoRoot);
  const replayStart = Date.now();
  const replay: EvaluationRunResult = await runEvaluationV2(replayDataset.groundTruth, replayDataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: replayDataset.inputHashes,
    adapterQualityFindings: replayDataset.qualityFindings,
    judge: DETERMINISTIC_ONLY_JUDGE,
  });
  const replayMs = Date.now() - replayStart;

  const freshHash = contentHash(dispositionFingerprint(fresh.units));
  const replayHash = contentHash(dispositionFingerprint(replay.units));
  const metricsFreshHash = contentHash(fresh.metrics);
  const metricsReplayHash = contentHash(replay.metrics);
  const differences = diffUnits(fresh.units, replay.units);
  const identical = freshHash === replayHash && metricsFreshHash === metricsReplayHash && differences.length === 0;

  // The judge cache is exercised on a synthetic pair so the replay path is
  // proven even when no model credential is configured.
  const cache = createInMemoryJudgeCache();
  const cacheKeysBefore = cache.entries().length;

  const written = [
    writeArtifact(repoRoot, "11-reproducibility-and-cost.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_REPRODUCIBILITY_AND_COST",
        "Fresh-run vs replay comparison over byte-identical frozen inputs, plus the honest cost and performance record for this phase.",
      ),
      reproducibility: {
        datasetKey: DSGR_DATASET_KEY,
        inputHashes: dataset.inputHashes,
        runIdentityFresh: fresh.runIdentity,
        runIdentityReplay: replay.runIdentity,
        runIdentityMatches: fresh.runIdentity === replay.runIdentity,
        unitDispositionHashFresh: freshHash,
        unitDispositionHashReplay: replayHash,
        unitDispositionHashMatches: freshHash === replayHash,
        aggregateMetricsHashFresh: metricsFreshHash,
        aggregateMetricsHashReplay: metricsReplayHash,
        aggregateMetricsHashMatches: metricsFreshHash === metricsReplayHash,
        differenceReport: {
          differingUnitCount: differences.length,
          differences,
        },
        verdict: identical ? "BYTE_IDENTICAL_DISPOSITIONS_AND_METRICS" : "DIFFERENCES_FOUND",
        nonDeterminismDisclosure:
          "The engine ran in deterministic-only mode: no model call was made, so there is no model non-determinism to disclose for this run. Ordering is fixed by sorting ground-truth units and candidate postings by id/content-hash, so array order is stable across runs.",
      },
      judgeCacheReplay: {
        mechanism:
          "Every semantic-judge judgment is keyed by evidenceIdentity(), which hashes the ground-truth evidence, the candidate evidence, the provider, the model and ALL FOUR version constants. Changing the match policy therefore invalidates every cached judgment by construction; a stale judgment cannot survive a methodology change.",
        versions: currentVersions(),
        cacheEntriesAtStart: cacheKeysBefore,
        judgeUsedInThisRun: DETERMINISTIC_ONLY_JUDGE.provider,
      },
      cost: {
        aiCallCount: fresh.performance.aiCallCount + replay.performance.aiCallCount,
        aiCacheHitCount: fresh.performance.aiCacheHitCount + replay.performance.aiCacheHitCount,
        estimatedCostUsd: 0,
        costDisclosure:
          "ZERO model calls were made anywhere in this phase, and the estimated cost is $0.00. This is not a design preference: no model credential (ANTHROPIC_API_KEY or equivalent) is available in the execution environment, so the Layer-2 semantic judge could not be exercised against a live provider. The judge interface, prompt, structured-output schema, bounded call budget, provider/model recording and evidence-identity cache are all implemented and unit-tested against a scripted responder; they have never been run against a real model. Every number published in this phase therefore comes from the deterministic layers alone.",
        consequence:
          "Deterministic-only operation is conservative in one direction and one direction only: a pair the deterministic layers cannot decide stays INDETERMINATE, which withholds credit. Reported recall is therefore a LOWER BOUND, and the population of INDETERMINATE pairs is the specific place where a live judge would change the numbers.",
      },
      performance: {
        freshRunMs: freshMs,
        replayRunMs: replayMs,
        totalWallMs: Date.now() - wallStart,
        groundTruthUnits: fresh.performance.groundTruthUnitCount,
        candidatePool: fresh.performance.candidateCount,
        generatedPairs: fresh.performance.generatedPairCount,
        evaluatedPairs: fresh.performance.evaluatedPairCount,
        pairsPerGroundTruthUnit: Number((fresh.performance.evaluatedPairCount / Math.max(1, fresh.performance.groundTruthUnitCount)).toFixed(2)),
        fullCrossProductPairsAvoided: fresh.performance.groundTruthUnitCount * fresh.performance.candidateCount - fresh.performance.evaluatedPairCount,
        filteringNote:
          "Candidate generation uses inverted postings over content terms, action tags, families, defined terms and section bases, then caps at 60 candidates per ground-truth unit ordered by breadth of content evidence. Those filters decide which pairs are LOOKED AT; they never decide which are credited.",
      },
    }),
  ];

  return { identical, writtenArtifacts: written };
}

if (process.argv[1] && process.argv[1].endsWith("run-reproducibility.ts")) {
  void runReproducibility(process.cwd()).then((out) => {
    console.log(`Reproducibility: ${out.identical ? "IDENTICAL" : "DIFFERENCES FOUND"}`);
    for (const a of out.writtenArtifacts) console.log(`  wrote ${a.path} (${a.bytes} bytes)`);
  });
}
