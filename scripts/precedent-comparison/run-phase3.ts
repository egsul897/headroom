/**
 * Phase 3 harness: corpus audit, independent benchmark, diff benchmarks, peer status.
 * Usage: npx tsx scripts/precedent-comparison/run-phase3.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPrecedentComparisonApi, getDefaultCorpus } from "../../lib/precedent-comparison";
import { runBenchmarkSuite } from "../../lib/precedent-comparison/benchmark/evaluate";
import { benchmarkScenarioCounts } from "../../lib/precedent-comparison/benchmark/scenarios";
import { runDiffBenchmarkSuite } from "../../lib/precedent-comparison/diff-benchmark";
import { auditCorpus } from "../../lib/precedent-comparison/validation/corpus-audit";

function main(): void {
  const root = process.cwd();
  const outDir = join(root, "docs/precedent-comparison");
  mkdirSync(outDir, { recursive: true });

  const corpus = getDefaultCorpus();
  const api = createPrecedentComparisonApi(corpus);
  const peers = api.peerStatus();

  const audit = auditCorpus(corpus, root, 100);
  writeFileSync(join(outDir, "phase-3-corpus-audit.json"), JSON.stringify(audit, null, 2) + "\n");

  const counts = benchmarkScenarioCounts();
  const bench = runBenchmarkSuite(root);
  writeFileSync(
    join(outDir, "phase-3-benchmark-results.json"),
    JSON.stringify(
      {
        schemaVersion: "precedent-comparison-benchmark.v1",
        generatedAt: new Date().toISOString(),
        scenarioCounts: counts,
        metrics: bench.metrics,
        falseLegalDifferenceFindings: bench.falseLegalDifferenceFindings.map((e) => ({
          scenarioId: e.scenarioId,
          category: e.category,
          split: e.split,
          notes: e.notes,
        })),
        heldOutEvaluations: bench.evaluations.filter((e) => e.split === "HELD_OUT"),
      },
      null,
      2,
    ) + "\n",
  );

  const diffs = runDiffBenchmarkSuite();
  writeFileSync(join(outDir, "phase-3-diff-benchmark.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ...diffs }, null, 2) + "\n");

  const ckfBlocker =
    peers.knowledgeFactory.availability === "AVAILABLE"
      ? null
      : {
          blocked: true,
          reason: peers.knowledgeFactory.note,
          peerStatsHint:
            "CKF sibling branch reports SEC acquisitions in manifests, but published provision corpus export is not mounted in this worktree; PCI will not build a second SEC downloader.",
          targetAdditionalAgreements: 25,
          integrated: 0,
        };

  writeFileSync(
    join(outDir, "phase-3-peer-status.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        peers: {
          dependencyAtlas: { availability: peers.dependencyAtlas.availability, note: peers.dependencyAtlas.note },
          definitionEncyclopedia: {
            availability: peers.definitionEncyclopedia.availability,
            note: peers.definitionEncyclopedia.note,
          },
          edgarBackfill: { availability: peers.edgarBackfill.availability, note: peers.edgarBackfill.note },
          knowledgeFactory: { availability: peers.knowledgeFactory.availability, note: peers.knowledgeFactory.note },
          amendmentChain: { availability: peers.amendmentChain.availability, note: peers.amendmentChain.note },
          financialDefinitionsPrecedent: {
            availability: peers.financialDefinitionsPrecedent.availability,
            note: peers.financialDefinitionsPrecedent.note,
          },
          negativeCovenantExceptions: {
            availability: peers.negativeCovenantExceptions.availability,
            note: peers.negativeCovenantExceptions.note,
          },
        },
        ckfExpansion: ckfBlocker,
      },
      null,
      2,
    ) + "\n",
  );

  console.log("Corpus audit: deduped", audit.deduplicatedComparableProvisionCount, "/", audit.rawProvisionCount);
  console.log(
    "Span audit exact",
    audit.spanAudit.exactMatchCount,
    "/",
    audit.spanAudit.sampleSize,
    "context",
    audit.spanAudit.contextCompleteCount,
    "/",
    audit.spanAudit.sampleSize,
  );
  console.log("Benchmark scenarios", counts.total, "held-out precision", bench.metrics.heldOut.materialPrecision, "recall", bench.metrics.heldOut.materialRecall);
  console.log("CKF expansion:", ckfBlocker ? "BLOCKED" : "AVAILABLE");
  console.log("Wrote phase-3-*.json under docs/precedent-comparison/");
}

main();
