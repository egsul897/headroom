/**
 * Test-only helper: mark the company's current contract-document set as
 * analysis-ready (COMPLETED AnalysisRun) without running the full Phase 3
 * orchestrator. Used by onboarding acceptance tests that exercise
 * reviewCandidate / promoteCompanyCandidates after SyntheticExtractionProvider
 * extraction. Product E2E paths should call runContractAnalysis / runExtractionAction
 * instead.
 */
import { prisma } from "../../lib/prisma";
import {
  CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION,
  canonicalDocumentIdOrder,
  computeAnalysisPackageKey,
} from "../../lib/contract-model/analysis";
import { CONTRACT_DOCUMENT_TYPES } from "../../lib/contract-model/analysis/types";

export async function markContractAnalysisReadyForTests(companyId: string): Promise<void> {
  const docs = await prisma.document.findMany({
    where: { companyId, type: { in: [...CONTRACT_DOCUMENT_TYPES] } },
    select: { id: true },
  });
  if (docs.length === 0) return;

  const documentIds = canonicalDocumentIdOrder(docs.map((d) => d.id));
  const packageKey = computeAnalysisPackageKey(companyId, documentIds);
  const identity = {
    companyId,
    packageKey,
    analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION,
  };

  await prisma.analysisRun.upsert({
    where: { companyId_packageKey_analysisAlgorithmVersion: identity },
    create: {
      ...identity,
      documentIds,
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
      reviewItemCount: 0,
    },
    update: {
      documentIds,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
}
