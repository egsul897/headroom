/**
 * Phase 3F.1.5.2 — reproducibility check against the remediated (algorithm
 * v2) evaluator. Mirrors run-reproducibility.ts's computation exactly but
 * writes under docs/evaluation-v2-iteration-2/ instead of docs/evaluation-v2/
 * (that file's writeArtifact() hardcodes ARTIFACT_DIR="docs/evaluation-v2",
 * which would overwrite the frozen Phase 3F.1.5 artifact of the same name).
 */
import { createInMemoryJudgeCache, DETERMINISTIC_ONLY_JUDGE } from "../adjudication";
import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { contentHash, currentVersions } from "../identity";
import { runEvaluationV2 } from "../index";
import type { EvaluationRunResult, UnitEvaluationResult } from "../types";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

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

async function main() {
  const repoRoot = process.cwd();
  const wallStart = Date.now();
  const dataset = loadDsgrDataset(repoRoot);

  const freshStart = Date.now();
  const fresh: EvaluationRunResult = await runEvaluationV2(dataset.groundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
  });
  const freshMs = Date.now() - freshStart;

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

  const cache = createInMemoryJudgeCache();
  const cacheKeysBefore = cache.entries().length;

  const payload = {
    schemaVersion: "1.0",
    evaluationVersion: "phase-3f1-5-2-targeted-semantic-match-calibration.v1",
    artifactId: "PHASE_3F1_5_2_REPRODUCIBILITY",
    generatedAt: new Date().toISOString(),
    description: "Fresh-run vs replay comparison over byte-identical frozen DSGR inputs, against the Phase 3F.1.5.2-remediated (algorithm v2) evaluator.",
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
      differenceReport: { differingUnitCount: differences.length, differences },
      verdict: identical ? "BYTE_IDENTICAL_DISPOSITIONS_AND_METRICS" : "DIFFERENCES_FOUND",
      nonDeterminismDisclosure: "The deterministic-only comparison ran with zero model calls in both passes: no model non-determinism to disclose here. The full-cost live-judge run is reported separately in 09-live-semantic-judge-run.json and is a live model call, not reproduced byte-for-byte by design (a live model is not deterministic across calls) - this artifact isolates and proves the DETERMINISTIC LAYER's reproducibility independent of that.",
    },
    judgeCacheReplay: {
      mechanism: "Every semantic-judge judgment is keyed by evidenceIdentity(), which hashes ground-truth evidence, candidate evidence, provider, model and all four version constants (including the algorithmVersion bumped to v2 this phase). A stale pre-fix judgment cannot silently survive into this phase's cache by construction.",
      versions: currentVersions(),
      cacheEntriesAtStart: cacheKeysBefore,
      judgeUsedInThisRun: DETERMINISTIC_ONLY_JUDGE.provider,
    },
    performance: {
      freshRunMs: freshMs,
      replayRunMs: replayMs,
      totalWallMs: Date.now() - wallStart,
      groundTruthUnits: fresh.performance.groundTruthUnitCount,
      candidatePool: fresh.performance.candidateCount,
      generatedPairs: fresh.performance.generatedPairCount,
      evaluatedPairs: fresh.performance.evaluatedPairCount,
    },
  };

  const outPath = join(repoRoot, "docs/evaluation-v2-iteration-2/14-reproducibility.json");
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(`Reproducibility: ${identical ? "IDENTICAL" : "DIFFERENCES FOUND"}`);
  console.error(`Wrote docs/evaluation-v2-iteration-2/14-reproducibility.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
