/**
 * Run a subset of transaction exercises + dependency scaffold + adversarial pass
 * against one authentic Neon source with covenant summaries.
 */
import { prisma } from "../../lib/prisma";
import {
  buildContextFromMetadata,
  executeExerciseOnSource,
} from "../../lib/product/covenant-intelligence-loop/runner";
import { listExercises } from "../../lib/product/covenant-intelligence-loop/exercise-library";
import { buildTransactionAnalysisScaffold } from "../../lib/product/legal-reasoning/analysis-checklist";
import { challengeLegalConclusions } from "../../lib/product/legal-intelligence/challenge";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";

async function main() {
  const row = await prisma.knowledgeSource.findFirst({
    where: {
      NOT: { provenance: "workspace-meta" },
      metadata: { path: ["covenantSummary", "items"], not: null },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) {
    console.log(JSON.stringify({ error: "no source with covenantSummary" }));
    return;
  }
  const ctx = buildContextFromMetadata({
    sourceId: row.sourceId,
    metadata: row.metadata,
    hasFinancialSnapshot: false,
  });
  if (!ctx) {
    console.log(JSON.stringify({ error: "empty context", sourceId: row.sourceId }));
    return;
  }
  const summary = summarizeFromStoredMetadata(row.metadata)!;
  const items = ctx.items.map((i) => ({
    ...i,
    documentTitle: row.documentTitle,
  }));

  const wanted = new Set([
    "lme.debt_exchange",
    "entity.designate_unrestricted",
    "debt.secured.100",
    "rp.available_amount",
    "multi.reclass",
    "fc.equity_cure",
  ]);
  const exercises = listExercises().filter((e) => wanted.has(e.exerciseId));
  const results = [];
  for (const ex of exercises) {
    const r = executeExerciseOnSource({
      exercise: ex,
      ctx,
      runId: "legal-intel-exercise-pass",
    });
    results.push({
      id: ex.exerciseId,
      outcome: r.outcome,
      restrictions: r.restrictions.length,
      permissions: r.permissions.length,
      gaps: r.gaps.length,
      citations: r.citations.length,
    });
  }

  const scaffold = buildTransactionAnalysisScaffold({
    question: "Can we incur $100M secured debt?",
    items,
  });
  const findings = challengeLegalConclusions({
    companyId: row.companyId ?? "stats-run",
    conclusions: [
      {
        id: "ex1",
        kind: "STRUCTURE_SOURCE_BACKED",
        statement: "Secured debt pathway hypothesized",
        executability: "NOT_EXECUTABLE",
        evidenceCitations:
          scaffold?.dependencyBundle.provisions.slice(0, 3).map((p) => p.sectionRef) ?? [],
        missingInputs: scaffold?.dependencyBundle.missingCategories ?? [],
        limitations: scaffold?.limitations ?? [],
        promotedToLegalTruth: 0,
      },
    ],
    context: {
      hasApprovedFinancialSnapshot: false,
      hasUtilizationLedger: false,
      hasVerifiedIrPackage: false,
      outOfPackageAmendments: [],
      unresolvedDefinitionTerms: [],
      entityScopeUnresolved: false,
      claimsStackingWithoutSharedCapAnalysis: true,
      overlookedProvisoHints: scaffold?.steps[3]?.findings.slice(0, 2) ?? [],
    },
  });

  console.log(
    JSON.stringify(
      {
        sourceId: row.sourceId,
        title: row.documentTitle,
        itemCount: items.length,
        categories: summary.countsByCategory,
        exercises: results,
        scaffold: scaffold
          ? {
              kind: scaffold.transactionKind,
              addressed: scaffold.steps.filter((s) => s.status === "ADDRESSED").length,
              provisions: scaffold.dependencyBundle.provisions.length,
              edges: scaffold.dependencyBundle.traversedEdges.length,
              patterns: scaffold.dependencyBundle.patternHits,
            }
          : null,
        adversarialFindings: findings.map((f) => ({ cat: f.category, sev: f.severity })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
