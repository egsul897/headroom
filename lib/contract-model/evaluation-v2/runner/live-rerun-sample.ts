/**
 * Phase 3F.1.5.1 — live-judge scoped rerun over the frozen 51-case
 * stratified sample only (NOT the full DSGR sweep — a full sweep triggers
 * ~14,238 real model calls, confirmed by a zero-cost counting dry run; the
 * 51-case sample is the directly-comparable, budget-appropriate scope).
 *
 * Modes:
 *   SMOKE_TEST_ONLY=1  -> exactly ONE real call, to confirm the credential/
 *                         model/gateway work and capture real token usage
 *                         before committing to a larger run. No artifact
 *                         written; costs one call.
 *   (default)          -> full scoped run against all 51 sample gtUnitIds'
 *                         generated pairs, respecting --max-calls.
 *
 * Writes docs/evaluation-v2-iteration/04-live-semantic-judge-run.json
 * (overwriting this phase's own prior BLOCKED placeholder — never touches
 * anything under docs/evaluation-v2/, which remains byte-identical to the
 * Phase 3F.1.5 freeze per this phase's own charter).
 */
import { readFileSync } from "node:fs";

import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { runEvaluationV2 } from "../index";
import { createVercelGatewaySemanticJudge } from "../live-judge";
import { currentVersions } from "../identity";

const SAMPLE_FILE = "docs/evaluation-v2/_stratified-sample-for-second-pass.json";
const SEALED_LABELS_FILE = "docs/evaluation-v2/_stratified-sample-v2-labels-SEALED.json";
const OUT_FILE = "docs/evaluation-v2-iteration/04-live-semantic-judge-run.json";

const MODEL = process.env.LIVE_JUDGE_MODEL ?? "anthropic/claude-haiku-4-5";
// Rough planning-time estimate only; the real reported cost is computed from
// actual per-call token usage in callLog against MODEL's published price.
const ESTIMATED_COST_PER_CALL_USD = 0.004;

async function main() {
  const repoRoot = process.cwd();
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY not set");

  const maxCalls = Number(process.env.LIVE_JUDGE_MAX_CALLS ?? "1");
  const smokeTestOnly = process.env.SMOKE_TEST_ONLY === "1";

  const sample = JSON.parse(readFileSync(SAMPLE_FILE, "utf-8")) as { cases: Array<{ gtUnitId: string }> };
  const sampleGtUnitIds = new Set(sample.cases.map((p) => p.gtUnitId));

  const dataset = loadDsgrDataset(repoRoot);
  const scopedGroundTruth = smokeTestOnly
    ? dataset.groundTruth.filter((g) => sampleGtUnitIds.has(g.gtUnitId)).slice(0, 1)
    : dataset.groundTruth.filter((g) => sampleGtUnitIds.has(g.gtUnitId));

  console.error(`Scoped run: ${scopedGroundTruth.length} of ${dataset.groundTruth.length} GT units (sample=${sampleGtUnitIds.size}), maxCalls=${maxCalls}, model=${MODEL}`);

  const handle = createVercelGatewaySemanticJudge({
    apiKey,
    model: MODEL,
    maxCalls,
    estimatedCostPerCallUsd: ESTIMATED_COST_PER_CALL_USD,
  });

  const startedAt = Date.now();
  const result = await runEvaluationV2(scopedGroundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
    judge: handle.judge,
  });
  const wallMs = Date.now() - startedAt;

  const callCount = handle.judge.callCount();
  const cacheHits = handle.judge.cacheHitCount();
  const totalIn = handle.totalInputTokens();
  const totalOut = handle.totalOutputTokens();
  const failures = handle.callLog.filter((c) => c.stopReason && c.stopReason !== "end_turn").length;

  console.error(JSON.stringify({
    scopedUnits: scopedGroundTruth.length,
    generatedPairCount: result.performance.generatedPairCount,
    evaluatedPairCount: result.performance.evaluatedPairCount,
    aiCallCount: callCount,
    aiCacheHitCount: cacheHits,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    wallMs,
  }, null, 2));

  if (smokeTestOnly) {
    console.error("SMOKE TEST complete, no artifact written.");
    return;
  }

  const versions = currentVersions();
  const sealed = JSON.parse(readFileSync(SEALED_LABELS_FILE, "utf-8")) as { labels: Array<{ gtUnitId: string; v2MatchStatus: string; v2RepresentationStatus: string; v2DangerousUnaccounted: boolean }> };
  const sealedByUnit = new Map(sealed.labels.map((l) => [l.gtUnitId, l]));

  const changed: Array<{ gtUnitId: string; before: { matchStatus: string; representationStatus: string }; after: { matchStatus: string; representationStatus: string } }> = [];
  for (const u of result.units) {
    const before = sealedByUnit.get(u.gtUnitId);
    if (!before) continue;
    if (before.v2MatchStatus !== u.matchStatus || before.v2RepresentationStatus !== u.representationStatus) {
      changed.push({
        gtUnitId: u.gtUnitId,
        before: { matchStatus: before.v2MatchStatus, representationStatus: before.v2RepresentationStatus },
        after: { matchStatus: u.matchStatus, representationStatus: u.representationStatus },
      });
    }
  }

  const artifact = {
    schemaVersion: "1.0",
    evaluationVersion: "phase-3f1-5-1-evaluation-calibration.v1",
    artifactId: "LIVE_SEMANTIC_JUDGE_RUN",
    generatedAt: new Date().toISOString(),
    status: "EXECUTED",
    provider: "VERCEL_AI_GATEWAY",
    model: MODEL,
    promptVersion: versions.promptVersion,
    schemaVersionUsed: versions.schemaVersion,
    algorithmVersion: versions.algorithmVersion,
    matchPolicyVersion: versions.matchPolicyVersion,
    scope: {
      description: "The frozen 51-case Phase 3F.1.5 stratified sample only (not the full DSGR dataset, which would trigger ~14,238 calls). All generated pairs for these 51 gtUnitIds were deterministically evaluated first; the live judge was consulted only for pairs the deterministic layer marked INDETERMINATE.",
      sampleFile: SAMPLE_FILE,
      scopedGroundTruthUnitCount: scopedGroundTruth.length,
      totalDsgrGroundTruthUnitCount: dataset.groundTruth.length,
    },
    callStats: {
      generatedPairCount: result.performance.generatedPairCount,
      evaluatedPairCount: result.performance.evaluatedPairCount,
      aiCallCount: callCount,
      aiCacheHitCount: cacheHits,
      failedCalls: failures,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      wallClockMs: wallMs,
    },
    inputDisciplineCompliance: "buildJudgeUserPrompt (unchanged from ./adjudication.ts) sends only the GT excerpt/semantic description and the candidate's own excerpts/normalized semantics/provenance - never V2's own historical disposition, never the second-pass result, never whether a case is one of the 14 known false credits.",
    comparisonAgainstDeterministicOnlyBaseline: {
      note: "Compares this live-informed run's per-unit matchStatus/representationStatus against the ORIGINAL deterministic-only sealed labels (docs/evaluation-v2/_stratified-sample-v2-labels-SEALED.json, byte-identical, unmodified) for the same 51 gtUnitIds.",
      unitsWithChangedDisposition: changed.length,
      unitsUnchanged: result.units.length - changed.length,
      changes: changed,
    },
  };

  writeArtifactRaw(repoRoot, OUT_FILE, artifact);
  console.error(`Wrote ${OUT_FILE}`);
}

function writeArtifactRaw(repoRoot: string, relPath: string, payload: unknown) {
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  writeFileSync(join(repoRoot, relPath), `${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
