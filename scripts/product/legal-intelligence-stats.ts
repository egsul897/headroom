/**
 * One-shot structural / pattern / precedent stats for legal-intelligence report.
 */
import { prisma } from "../../lib/prisma";
import { assessStructuralQuality } from "../../lib/product/legal-reasoning/structural-quality";
import { listBenchmarkCases } from "../../lib/product/legal-reasoning/benchmark-cases";
import { allPatterns } from "../../lib/knowledge-factory/patterns/library";
import { listExercises } from "../../lib/product/covenant-intelligence-loop/exercise-library";
import { searchPrecedentClauses } from "../../lib/product/legal-reasoning/precedent-clause-search";
import { getPrecedentIndexSummary } from "../../lib/product/precedent-search";
import { scoreAgainstAdjudicated, LEGAL_BENCHMARK_CASES } from "../../lib/product/legal-reasoning/benchmark-cases";

async function main() {
  const sources = await prisma.knowledgeSource.findMany({
    where: { NOT: { provenance: "workspace-meta" } },
    select: {
      sourceId: true,
      documentTitle: true,
      documentClass: true,
      issuerName: true,
      issuerCik: true,
      issuerTicker: true,
      metadata: true,
    },
    take: 5000,
  });
  const mapped = sources.map((s) => ({
    sourceId: s.sourceId,
    title: s.documentTitle,
    documentClass: String(s.documentClass),
    issuerName: s.issuerName,
    issuerCik: s.issuerCik,
    issuerTicker: s.issuerTicker,
    metadata:
      s.metadata && typeof s.metadata === "object" && !Array.isArray(s.metadata)
        ? (s.metadata as Record<string, unknown>)
        : {},
  }));
  const report = assessStructuralQuality(mapped);
  const amdEdges = await prisma.knowledgeRelationshipEdge.count().catch(() => -1);
  const idx = getPrecedentIndexSummary();
  const prec = searchPrecedentClauses({ query: "builder_basket", limit: 3 });

  const missingInputs = LEGAL_BENCHMARK_CASES.find((c) => c.caseId === "bench.missing.financials")!;
  const noPath = LEGAL_BENCHMARK_CASES.find((c) => c.caseId === "bench.no_path")!;
  const adjScores = [
    scoreAgainstAdjudicated({
      caseDef: missingInputs,
      retrievedSectionRefs: [],
      claimedPermissions: [],
      claimedCapacityWithoutInputs: false,
      unsupportedConclusions: [],
    }),
    scoreAgainstAdjudicated({
      caseDef: noPath,
      retrievedSectionRefs: [],
      claimedPermissions: [],
      claimedCapacityWithoutInputs: false,
      unsupportedConclusions: [],
    }),
  ];

  const out = {
    neonSources: sources.length,
    structural: {
      documentsWithProvisionIntelligence: report.documentsWithProvisionIntelligence,
      provisionRows: report.provisionRows,
      unknownOrAmbiguous: report.unknownOrAmbiguousProvisions,
      definitionResolution: report.definitionResolution,
      amendmentGraph: report.amendmentGraph,
      byCategory: report.byCategory,
      topPatterns: Object.entries(report.patternCoverage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    },
    relationshipEdges: amdEdges,
    patterns: allPatterns().length,
    exercises: listExercises().length,
    benchmarkCases: listBenchmarkCases().length,
    adjudicatedBenchmarks: listBenchmarkCases({ adjudicatedOnly: true }).length,
    adjudicatedPolicyScores: adjScores,
    precedentIndex: idx.totals,
    samplePrecedentHits: prec.map((p) => ({
      title: p.title,
      issuer: p.issuer,
      class: p.documentClass,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
