/**
 * Phase 3F.1.5.1 — builds the FULL blinded evidence packets + sealed labels
 * for the frozen 51-case sample, using the live semantic judge (same scope
 * already validated by live-rerun-sample.ts). Writes into
 * docs/evaluation-v2-iteration/ only; never touches docs/evaluation-v2/.
 */
import { readFileSync } from "node:fs";

import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { runEvaluationV2 } from "../index";
import { createVercelGatewaySemanticJudge } from "../live-judge";
import { buildEvidencePacket, blindPacket } from "../evidence";
import { writeArtifact, packetSummary, artifactHeader } from "./artifacts";

const SAMPLE_FILE = "docs/evaluation-v2/_stratified-sample-for-second-pass.json";
const MODEL = process.env.LIVE_JUDGE_MODEL ?? "anthropic/claude-haiku-4-5";
const ESTIMATED_COST_PER_CALL_USD = 0.004;

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

  console.error(`Full-packet run: ${scopedGroundTruth.length} GT units, maxCalls=${maxCalls}, model=${MODEL}`);

  const handle = createVercelGatewaySemanticJudge({
    apiKey,
    model: MODEL,
    maxCalls,
    estimatedCostPerCallUsd: ESTIMATED_COST_PER_CALL_USD,
  });

  const result = await runEvaluationV2(scopedGroundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
    judge: handle.judge,
  });

  console.error(JSON.stringify({
    aiCallCount: handle.judge.callCount(),
    totalInputTokens: handle.totalInputTokens(),
    totalOutputTokens: handle.totalOutputTokens(),
  }));

  const gtById = new Map(scopedGroundTruth.map((g) => [g.gtUnitId, g]));
  const packets = result.units
    .map((u) => {
      const gt = gtById.get(u.gtUnitId);
      if (!gt) return null;
      return buildEvidencePacket({ gt, result: u, candidatesById, maxCandidates: 5, excerptCharLimit: 1200 });
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  writeArtifact(
    repoRoot,
    "../evaluation-v2-iteration/06-frozen-sample-packets-BLINDED.json",
    {
      ...artifactHeader(
        "PHASE_3F1_5_1_FROZEN_SAMPLE_LIVE_INFORMED",
        "BLINDED evidence packets for the Phase 3F.1.5.1 independent second-pass re-adjudication, live-judge-informed. NO Evaluation V2 disposition for any case. Same 51 gtUnitIds as Phase 3F.1.5's original sample - not a new draw, per the user's explicit instruction not to change the sample before seeing results.",
      ),
      caseCount: packets.length,
      cases: packets.map((p) => blindPacket(p)).map(packetSummary),
    },
  );

  writeArtifact(
    repoRoot,
    "../evaluation-v2-iteration/06-frozen-sample-labels-live-SEALED.json",
    {
      ...artifactHeader(
        "PHASE_3F1_5_1_FROZEN_SAMPLE_LABELS_LIVE_SEALED",
        "SEALED. Live-judge-informed V2 dispositions, kept OUT of the blind packet. For post-hoc comparison only.",
      ),
      warning: "DO NOT SHOW TO THE SECOND-PASS ADJUDICATOR BEFORE ITS REVIEW IS COMPLETE.",
      caseCount: result.units.length,
      labels: result.units.map((u) => ({
        gtUnitId: u.gtUnitId,
        v2MatchStatus: u.matchStatus,
        v2RepresentationStatus: u.representationStatus,
        v2SemanticCorrectness: u.semanticCorrectness,
        v2DangerousUnaccounted: u.dangerousUnaccountedV2,
        v2Confidence: u.confidence,
        v2MatchedCandidateIds: u.matchedCandidateIds,
        v2Reason: (u.reasonForCredit ?? u.reasonForPartialCredit ?? u.reasonForNoCredit ?? "").slice(0, 1200),
      })),
    },
  );

  console.error("Wrote frozen sample packets + sealed labels under docs/evaluation-v2-iteration/");
}

main().catch((e) => { console.error(e); process.exit(1); });
