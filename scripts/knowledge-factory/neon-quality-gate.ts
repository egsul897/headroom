/**
 * Knowledge Factory corpus quality gate — READ-ONLY Neon + optional SEC discovery dry-run.
 *
 *   npx tsx scripts/knowledge-factory/neon-quality-gate.ts
 *   npx tsx scripts/knowledge-factory/neon-quality-gate.ts --skip-network
 *
 * Does NOT write KnowledgeSource / BYTEA / relationship edges.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runRelationshipAudit } from "../../lib/knowledge-factory/quality-gate/relationship-audit";
import { runOperativeAudit } from "../../lib/knowledge-factory/quality-gate/operative-audit";
import { runRetrievalCompleteness } from "../../lib/knowledge-factory/quality-gate/retrieval-completeness";
import { runDiversityDryRun } from "../../lib/knowledge-factory/quality-gate/diversity-dry-run";
import { reportDatabaseEffects } from "../../lib/knowledge-factory/quality-gate/database-effects";
import {
  FINANCING_PACKAGE_REGISTRY_PROPOSAL,
  renderPackageRegistryProposalMarkdown,
} from "../../lib/knowledge-factory/quality-gate/package-registry-proposal";
import { prisma } from "../../lib/prisma";

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const outDir = path.join(process.cwd(), "docs/knowledge-factory/quality-gate");
  mkdirSync(outDir, { recursive: true });
  const skipNetwork = flag("--skip-network");

  console.error("quality-gate: relationship audit…");
  const relationships = await runRelationshipAudit({ perKind: 20 });
  writeFileSync(path.join(outDir, "relationship-audit.json"), JSON.stringify(relationships, null, 2) + "\n");

  console.error("quality-gate: operative resolution audit…");
  const operative = await runOperativeAudit();
  writeFileSync(path.join(outDir, "operative-audit.json"), JSON.stringify(operative, null, 2) + "\n");

  console.error("quality-gate: retrieval completeness…");
  const retrieval = await runRetrievalCompleteness();
  writeFileSync(path.join(outDir, "retrieval-completeness.json"), JSON.stringify(retrieval, null, 2) + "\n");

  console.error("quality-gate: database effects…");
  const dbEffects = await reportDatabaseEffects();
  writeFileSync(path.join(outDir, "database-effects.json"), JSON.stringify(dbEffects, null, 2) + "\n");

  console.error("quality-gate: diversity dry-run…");
  if (!process.env.SEC_EDGAR_USER_AGENT && process.env.SEC_EDGAR_CONTACT_EMAIL) {
    process.env.SEC_EDGAR_USER_AGENT = `HeadroomQualityGate/1.0 (contact: ${process.env.SEC_EDGAR_CONTACT_EMAIL}; research; respectful fair-access; WS-CKF)`;
  }
  const diversity = await runDiversityDryRun({
    network: !skipNetwork,
    filingLimit: 100,
    maxPerIssuer: 3,
  });
  writeFileSync(path.join(outDir, "diversity-dry-run.json"), JSON.stringify(diversity, null, 2) + "\n");

  writeFileSync(
    path.join(outDir, "financing-package-registry-PROPOSAL.md"),
    renderPackageRegistryProposalMarkdown(),
  );
  writeFileSync(
    path.join(outDir, "financing-package-registry-PROPOSAL.json"),
    JSON.stringify(FINANCING_PACKAGE_REGISTRY_PROPOSAL, null, 2) + "\n",
  );

  const certified = dbEffects.representationLevels["CERTIFIED"] ?? 0;
  const reviewer = dbEffects.representationLevels["REVIEWER_VERIFIED"] ?? 0;

  const summary = {
    schema: "kf-quality-gate-summary.v1",
    generatedAt: new Date().toISOString(),
    neonMutations: false,
    paidInferenceUsd: 0,
    relationship: {
      totalEdges: relationships.population.totalEdges,
      sampled: relationships.sampling.sampled,
      supportedOrWeakRate: relationships.precisionEstimate.supportedOrWeakRate,
      unsupportedRate: relationships.precisionEstimate.unsupportedRate,
      exactTripleDuplicates: relationships.duplicateAmplification.exactTripleDuplicates,
      missingHints: relationships.missingRelationshipHints.length,
      verdicts: relationships.verdicts,
    },
    operative: {
      passRate: operative.passRate,
      cases: operative.cases.map((c) => ({
        id: c.caseId,
        pass: c.pass,
        engine: c.engineStatus,
        expected: c.expectedStatus,
      })),
    },
    retrieval: retrieval.metrics,
    diversity: {
      baselineSparse: diversity.baselineSparse,
      promisingNotInNeon: diversity.summary.notYetInNeon,
      byPredictedClass: diversity.summary.byPredictedClass,
    },
    database: {
      liveCounts: dbEffects.liveCounts,
      storage: dbEffects.storage,
      batchTotals: dbEffects.totalsFromBatches,
      representationLevels: dbEffects.representationLevels,
    },
    legalAuthority: {
      certifiedCount: certified,
      reviewerVerifiedCount: reviewer,
      note: "All automated corpus rows remain non-certified until existing review gates.",
    },
    packageRegistryProposal: "docs/knowledge-factory/quality-gate/financing-package-registry-PROPOSAL.md",
    productionSafetyConcerns: [
      ...operative.productionSafety,
      relationships.precisionEstimate.unsupportedRate > 0.25
        ? "Relationship unsupported/weak rate elevated — do not treat edges as operative authority"
        : null,
      retrieval.metrics.missingCriticalCount > 0
        ? `Retrieval missing ${retrieval.metrics.missingCriticalCount} critical question(s)`
        : null,
      (diversity.baselineSparse.ABL_AGREEMENT ?? 0) < 5 ||
      (diversity.baselineSparse.INTERCREDITOR_AGREEMENT ?? 0) < 5 ||
      (diversity.baselineSparse.GUARANTEE_AGREEMENT ?? 0) < 5
        ? "ABL / intercreditor / guarantee coverage still sparse — diversity dry-run queued candidates only"
        : null,
      certified > 0
        ? "Unexpected CERTIFIED KnowledgeSource rows present — investigate promotion path"
        : null,
      "Relationship graph regeneration during prior expand batches may have amplified provision edges — see duplicate metrics",
      "No automatic merge; no Neon mutations in this quality-gate run",
    ].filter(Boolean),
  };

  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
