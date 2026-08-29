/**
 * Phase 3F.1.5.1 — zero-cost, zero-network replay of the frozen 51-case
 * live-judge run, to extract the fuller per-unit fields (explicitlySurfacedAsUnsafe,
 * surfacedAsUnsafeBy, surfacedByInventoryOnly, dangerousUnaccountedV2) needed
 * to map V2's UNREPRESENTED disposition into the new second-pass protocol's
 * finer 3-way split (REVIEW_REQUIRED_FLAG_ONLY / DISCOVERY_ONLY_NOT_REPRESENTED
 * / UNSUPPORTED_SILENT), WITHOUT calling the live model again. Reconstructs
 * the exact judge outputs from the already-frozen
 * docs/evaluation-v2-iteration/06-frozen-sample-packets-BLINDED.json
 * (semanticJudgeOutputs, keyed by their own recorded cacheKey), seeded into
 * an in-memory cache-only judge that makes NO network call and returns null
 * (stays INDETERMINATE, never fabricates) on any cache miss.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { runEvaluationV2 } from "../index";
import { createInMemoryJudgeCache, type SemanticJudge } from "../adjudication";
import type { SemanticJudgeOutput } from "../types";

const SAMPLE_FILE = "docs/evaluation-v2/_stratified-sample-for-second-pass.json";
const PACKETS_FILE = "docs/evaluation-v2-iteration/06-frozen-sample-packets-BLINDED.json";
const OUT_FILE = "docs/evaluation-v2-iteration/06-frozen-sample-full-unit-detail-INTERNAL.json";

async function main() {
  const repoRoot = process.cwd();
  const sample = JSON.parse(readFileSync(SAMPLE_FILE, "utf-8")) as { cases: Array<{ gtUnitId: string }> };
  const sampleGtUnitIds = new Set(sample.cases.map((p) => p.gtUnitId));

  const packets = JSON.parse(readFileSync(PACKETS_FILE, "utf-8")) as { cases: Array<{ semanticJudgeOutputs: SemanticJudgeOutput[] }> };
  const cache = createInMemoryJudgeCache();
  let seeded = 0;
  for (const c of packets.cases) {
    for (const out of c.semanticJudgeOutputs ?? []) {
      cache.set(out.cacheKey, out);
      seeded += 1;
    }
  }
  console.error(`Seeded ${seeded} frozen judge outputs into replay cache.`);

  const cacheOnlyJudge: SemanticJudge = {
    provider: "VERCEL_AI_GATEWAY",
    model: "anthropic/claude-haiku-4-5",
    estimatedCostPerCallUsd: 0,
    async judge(request) {
      // Mirror judgeCacheKey's own evidenceIdentity computation so lookups
      // hit the exact same keys the live run produced.
      const { judgeCacheKey } = await import("../adjudication");
      const key = judgeCacheKey(request, { provider: this.provider, model: this.model });
      const hit = cache.get(key);
      return hit ? { ...hit, cached: true } : null; // miss -> stays INDETERMINATE, never fabricated
    },
  };

  const dataset = loadDsgrDataset(repoRoot);
  const scopedGroundTruth = dataset.groundTruth.filter((g) => sampleGtUnitIds.has(g.gtUnitId));

  const result = await runEvaluationV2(scopedGroundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
    judge: cacheOnlyJudge,
  });

  console.error(JSON.stringify({ aiCallCount: result.performance.aiCallCount, aiCacheHitCount: result.performance.aiCacheHitCount, units: result.units.length }));

  const detail = result.units.map((u) => ({
    gtUnitId: u.gtUnitId,
    matchStatus: u.matchStatus,
    representationStatus: u.representationStatus,
    dangerousUnaccountedV2: u.dangerousUnaccountedV2,
    explicitlySurfacedAsUnsafe: u.explicitlySurfacedAsUnsafe,
    surfacedAsUnsafeBy: u.surfacedAsUnsafeBy,
    surfacedByInventoryOnly: u.surfacedByInventoryOnly,
    matchedCandidateIds: u.matchedCandidateIds,
  }));
  writeFileSync(join(repoRoot, OUT_FILE), `${JSON.stringify(detail, null, 2)}\n`);
  console.error(`Wrote ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
