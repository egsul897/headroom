/**
 * Phase 3F.1.5.2 — Section 19 rerun. Builds the FULL blinded evidence packets
 * + sealed labels for the SAME frozen 51-case sample used in Phase 3F.1.5 /
 * 3F.1.5.1, using the NOW-REMEDIATED evaluator (algorithm v2). This is a
 * near-verbatim copy of live-rerun-full-packets.ts, retargeted to write under
 * docs/evaluation-v2-iteration-2/ instead of docs/evaluation-v2-iteration/ so
 * the prior phase's frozen historical artifacts are never touched or
 * overwritten (they remain byte-identical, per 00-freeze-manifest.json).
 *
 * The frozen sample file itself (docs/evaluation-v2/_stratified-sample-for-
 * second-pass.json) is read-only input, unchanged from Phase 3F.1.5 — no new
 * sample draw, per Section 19's "same GT; sample" requirement.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { runEvaluationV2 } from "../index";
import { createVercelGatewaySemanticJudge } from "../live-judge";
import { buildEvidencePacket, blindPacket } from "../evidence";
import { currentVersions } from "../identity";

const SAMPLE_FILE = "docs/evaluation-v2/_stratified-sample-for-second-pass.json";
const MODEL = process.env.LIVE_JUDGE_MODEL ?? "anthropic/claude-haiku-4-5";
const ESTIMATED_COST_PER_CALL_USD = 0.004;

const OUT_PACKETS = "docs/evaluation-v2-iteration-2/_frozen-sample-packets-BLINDED-v2.json";
const OUT_SEALED = "docs/evaluation-v2-iteration-2/_frozen-sample-labels-v2-SEALED.json";
const OUT_JUDGE_RUN = "docs/evaluation-v2-iteration-2/09-live-semantic-judge-run.json";

/**
 * Maps a V2 UnitEvaluationResult onto the shared 12-state taxonomy frozen in
 * docs/evaluation-v2-iteration/02-state-taxonomy.json, so the second-pass
 * reviewer's own (independently mapped) disposition can be compared to V2's
 * on equal terms without giving the reviewer any visibility into V2 itself.
 */
function mapToStateTaxonomy(u: {
  matchStatus: string;
  explicitlySurfacedAsUnsafe: boolean;
  surfacedByInventoryOnly: string[];
  groundTruthExcerptResolution: string;
  groundTruthQuality: string;
  reasonForNoCredit: string | null;
}): string {
  if (u.groundTruthExcerptResolution === "UNRESOLVED_DESCRIPTION_ONLY" || u.groundTruthQuality === "GT_REQUIRES_DOMAIN_REVIEW") return "INCOMPARABLE";
  switch (u.matchStatus) {
    case "EXACT_SINGLE":
    case "EXACT_COMPOSITE":
      return "VERIFIED_SEMANTIC_REPRESENTATION";
    case "PARTIAL":
      return "PARTIAL_SEMANTIC_REPRESENTATION";
    case "HONESTLY_UNRESOLVED":
      return "HONESTLY_UNRESOLVED";
    case "HONESTLY_UNSUPPORTED":
      return "DISCOVERED_REVIEW_REQUIRED";
    case "AMBIGUOUS":
      return "AMBIGUOUS";
    case "CONTRADICTORY":
      return "CONTRADICTORY_REPRESENTATION";
    case "UNREPRESENTED":
      if (u.explicitlySurfacedAsUnsafe) return "DISCOVERED_REVIEW_REQUIRED";
      if (u.surfacedByInventoryOnly.length > 0) return "DISCOVERED_ONLY";
      if ((u.reasonForNoCredit ?? "").includes("No candidate shared any content-bearing signal")) return "NOT_DISCOVERED";
      return "HONESTLY_UNSUPPORTED";
    default:
      return "UNRESOLVED_STATE";
  }
}

async function main() {
  const repoRoot = process.cwd();
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY not set");
  const maxCalls = Number(process.env.LIVE_JUDGE_MAX_CALLS ?? "2000");

  const sample = JSON.parse(readFileSync(SAMPLE_FILE, "utf-8")) as { cases: Array<{ gtUnitId: string }> };
  const sampleGtUnitIds = new Set(sample.cases.map((p) => p.gtUnitId));

  const dataset = loadDsgrDataset(repoRoot);
  const scopedGroundTruth = dataset.groundTruth.filter((g) => sampleGtUnitIds.has(g.gtUnitId));
  const candidatesById = new Map(dataset.candidates.map((c) => [c.candidateId, c]));

  console.error(`Full-packet rerun (algorithm v2): ${scopedGroundTruth.length} GT units, maxCalls=${maxCalls}, model=${MODEL}`);

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
    aiCallCount: callCount,
    aiCacheHitCount: cacheHits,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    wallMs,
    generatedPairCount: result.performance.generatedPairCount,
    evaluatedPairCount: result.performance.evaluatedPairCount,
  }, null, 2));

  const gtById = new Map(scopedGroundTruth.map((g) => [g.gtUnitId, g]));
  const packets = result.units
    .map((u) => {
      const gt = gtById.get(u.gtUnitId);
      if (!gt) return null;
      return buildEvidencePacket({ gt, result: u, candidatesById, maxCandidates: 5, excerptCharLimit: 1200 });
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const write = (relPath: string, payload: unknown) => writeFileSync(join(repoRoot, relPath), `${JSON.stringify(payload, null, 2)}\n`);

  write(OUT_PACKETS, {
    schemaVersion: "1.0",
    evaluationVersion: "phase-3f1-5-2-targeted-semantic-match-calibration.v1",
    artifactId: "PHASE_3F1_5_2_FROZEN_SAMPLE_LIVE_INFORMED",
    generatedAt: new Date().toISOString(),
    description:
      "BLINDED evidence packets for the Phase 3F.1.5.2 independent second-pass re-adjudication, live-judge-informed, against the REMEDIATED (algorithm v2) evaluator. Same 51 gtUnitIds as the Phase 3F.1.5 original sample and the Phase 3F.1.5.1 rerun - no new sample draw, per Section 19. NO Evaluation V2 disposition for any case is included - see reviewerInstructions for what the adjudicator must actually use instead of each packet's own legacy reviewerQuestion field (which predates the current frozen protocol and must be ignored).",
    reviewerInstructions:
      "IGNORE each packet's own 'reviewerQuestion' field (legacy text from Phase 3F.1.5, superseded). Instead follow docs/evaluation-v2-iteration/05-second-pass-protocol.json exactly: for each case, read the groundTruthExcerpt/groundTruthSemanticDescription and every listed candidate's excerpts/normalizedSemantics/selfReportedState, judge each candidate's correspondence (YES/PARTIAL/NO), then assign exactly one overallDisposition from the protocol's 10-state vocabulary (VERIFIED_OR_UNVERIFIED_REPRESENTATION, PARTIAL_REPRESENTATION, HONESTLY_UNRESOLVED, REVIEW_REQUIRED_FLAG_ONLY, DISCOVERY_ONLY_NOT_REPRESENTED, CONTRADICTORY, AMBIGUOUS, UNSUPPORTED_SILENT, GT_NOT_RESOLVABLE). Never use any label outside that list.",
    caseCount: packets.length,
    cases: packets.map((p) => blindPacket(p)),
  });

  const versions = currentVersions();
  write(OUT_SEALED, {
    schemaVersion: "1.0",
    evaluationVersion: "phase-3f1-5-2-targeted-semantic-match-calibration.v1",
    artifactId: "PHASE_3F1_5_2_FROZEN_SAMPLE_LABELS_V2_SEALED",
    generatedAt: new Date().toISOString(),
    warning: "SEALED. DO NOT SHOW TO THE SECOND-PASS ADJUDICATOR BEFORE ITS REVIEW IS COMPLETE.",
    algorithmVersion: versions.algorithmVersion,
    matchPolicyVersion: versions.matchPolicyVersion,
    caseCount: result.units.length,
    labels: result.units.map((u) => {
      const gt = gtById.get(u.gtUnitId);
      const groundTruthExcerptResolution = gt?.sourceExcerptResolution ?? "RESOLVED_FROM_RAW_SOURCE";
      return {
        gtUnitId: u.gtUnitId,
        v2MatchStatus: u.matchStatus,
        v2RepresentationStatus: u.representationStatus,
        v2SemanticCorrectness: u.semanticCorrectness,
        v2ExplicitlySurfacedAsUnsafe: u.explicitlySurfacedAsUnsafe,
        v2SurfacedByInventoryOnly: u.surfacedByInventoryOnly,
        v2GroundTruthExcerptResolution: groundTruthExcerptResolution,
        v2GroundTruthQuality: u.groundTruthQuality,
        v2DangerousUnaccounted: u.dangerousUnaccountedV2,
        v2Confidence: u.confidence,
        v2MatchedCandidateIds: u.matchedCandidateIds,
        v2Reason: (u.reasonForCredit ?? u.reasonForPartialCredit ?? u.reasonForNoCredit ?? "").slice(0, 1200),
        v2StateTaxonomyMapping: mapToStateTaxonomy({
          matchStatus: u.matchStatus,
          explicitlySurfacedAsUnsafe: u.explicitlySurfacedAsUnsafe,
          surfacedByInventoryOnly: u.surfacedByInventoryOnly,
          groundTruthExcerptResolution,
          groundTruthQuality: u.groundTruthQuality,
          reasonForNoCredit: u.reasonForNoCredit,
        }),
      };
    }),
  });

  write(OUT_JUDGE_RUN, {
    schemaVersion: "1.0",
    evaluationVersion: "phase-3f1-5-2-targeted-semantic-match-calibration.v1",
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
      description: "The SAME frozen 51-case Phase 3F.1.5 stratified sample (no new draw), evaluated against the Phase 3F.1.5.2-remediated evaluator (algorithm v2). Deterministic layer resolves first; the live judge is consulted only for pairs it marks INDETERMINATE.",
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
      estimatedCostUsd: Math.round((totalIn / 1_000_000) * 1 * 100 + (totalOut / 1_000_000) * 5 * 100) / 100,
      estimatedCostUsdNote: "Rough planning-time estimate (Claude Haiku 4.5 approximate blended per-token pricing); the safety cap (createVercelGatewaySemanticJudge's maxCalls/estimatedCostPerCallUsd) is the enforced budget control, this field is informational only.",
    },
    inputDisciplineCompliance: "buildJudgeUserPrompt (unchanged from ./adjudication.ts) sends only the GT excerpt/semantic description and the candidate's own excerpts/normalized semantics/provenance - never V2's own historical disposition, never the second-pass result, never whether a case is one of the 14 known false credits.",
    comparisonAgainstPriorPhaseSealedLabels: {
      note: "Compares this run's per-unit matchStatus against Phase 3F.1.5.1's live-informed sealed labels (docs/evaluation-v2-iteration/06-frozen-sample-labels-live-SEALED.json, byte-identical, unmodified) for the same 51 gtUnitIds - shows exactly what the evaluator fix changed, independent of anything the fresh second-pass reviewer produces.",
    },
  });

  console.error(`Wrote ${OUT_PACKETS}, ${OUT_SEALED}, ${OUT_JUDGE_RUN}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
