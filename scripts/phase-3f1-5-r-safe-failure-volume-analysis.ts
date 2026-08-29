/**
 * Phase 3F.1.5.R §24 - real review-event volume analysis. Runs the safe-
 * failure architecture's one wired emission point against real, zero-cost,
 * already-preserved FWRG and LSB coverage-audit evidence (the exact same
 * fixtures tests/contract-model/semantic-coverage-real-{fwrg,lsb}-regression.test.ts
 * already assert against), and reports the resulting ClaimReviewItem volume/
 * dedup/reason distribution.
 *
 * Scratch company/document rows are created and torn down within this script
 * - no permanent data. Read-only with respect to every other table.
 */
import { prisma } from "../lib/prisma";
import { loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";
import { loadRealDiscoveredCandidates as loadFwrgCandidatesLegacy, loadRealCompiledResults as loadFwrgCompiled, DOCUMENT_ID as FWRG_DOC_ID } from "./phase-3e-real-fwrg-regression";
import { loadRealDiscoveredCandidates as loadLsbCandidatesLegacy, loadRealCompiledResults as loadLsbCompiled, DOCUMENT_ID as LSB_DOC_ID } from "./phase-3e-real-lsb-regression";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { recordClaimReviewsFromDocumentCoverage } from "../lib/contract-model/compiler/safe-failure/integrate";
import type { StructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const COMPANY_ID = "phase-3f1-5-r-volume-analysis-scratch";

function withRealNodeIds(candidates: DiscoveredCandidate[], index: StructuralIndex, documentId: string): DiscoveredCandidate[] {
  return candidates.map((c) => ({
    ...c,
    structuralNodeIds: c.structuralNodeKeys.map((key) => index.getNodeByRef(documentId, key.slice(key.indexOf("::") + 2))?.nodeId ?? ""),
  }));
}

async function main() {
  const { index } = loadFwrgLsbStructuralIndex();

  await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Phase 3F.1.5.R volume-analysis scratch" }, update: {} });
  await prisma.document.upsert({ where: { id: FWRG_DOC_ID }, create: { id: FWRG_DOC_ID, companyId: COMPANY_ID, name: "FWRG scratch", type: "CREDIT_AGREEMENT" }, update: {} });
  await prisma.document.upsert({ where: { id: LSB_DOC_ID }, create: { id: LSB_DOC_ID, companyId: COMPANY_ID, name: "LSB scratch", type: "CREDIT_AGREEMENT" }, update: {} });

  const fwrgCandidates = withRealNodeIds(loadFwrgCandidatesLegacy(), index, FWRG_DOC_ID);
  const fwrgCompiled = loadFwrgCompiled(fwrgCandidates);
  const fwrgResult = await runSemanticCoverageAudit({
    companyId: COMPANY_ID,
    packageKey: "fwrg-2021-credit-agreement",
    instrumentKey: null,
    index,
    documents: [{ documentId: FWRG_DOC_ID }],
    discoveredCandidates: fwrgCandidates,
    compiledResults: fwrgCompiled,
    verifiedCandidateRefs: new Set(),
    operativeState: null,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });

  const lsbCandidates = withRealNodeIds(loadLsbCandidatesLegacy(), index, LSB_DOC_ID);
  const lsbCompiled = loadLsbCompiled(lsbCandidates);
  const lsbResult = await runSemanticCoverageAudit({
    companyId: COMPANY_ID,
    packageKey: "lsb-2023-abl-credit-agreement",
    instrumentKey: null,
    index,
    documents: [{ documentId: LSB_DOC_ID }],
    discoveredCandidates: lsbCandidates,
    compiledResults: lsbCompiled,
    verifiedCandidateRefs: new Set(),
    operativeState: null,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });

  const fwrgDoc = fwrgResult.packageCoverage.documents[0]!;
  const lsbDoc = lsbResult.packageCoverage.documents[0]!;

  const fwrgOutcome = await recordClaimReviewsFromDocumentCoverage(COMPANY_ID, "fwrg-2021-credit-agreement", fwrgDoc);
  const lsbOutcome = await recordClaimReviewsFromDocumentCoverage(COMPANY_ID, "lsb-2023-abl-credit-agreement", lsbDoc);

  const items = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID } });
  const byReasonCode: Record<string, number> = {};
  const byMateriality: Record<string, number> = {};
  const byOriginStage: Record<string, number> = {};
  for (const item of items) {
    byReasonCode[item.reasonCode] = (byReasonCode[item.reasonCode] ?? 0) + 1;
    byMateriality[item.materiality] = (byMateriality[item.materiality] ?? 0) + 1;
    byOriginStage[item.originStage] = (byOriginStage[item.originStage] ?? 0) + 1;
  }

  const materialCandidateCount = (units: { materiality: string }[]) => units.filter((u) => u.materiality === "CRITICAL" || u.materiality === "MATERIAL").length;

  const report = {
    schemaVersion: "1.0",
    phaseVersion: "phase-3f1-5-r-residual-foundation.v1",
    artifactId: "REVIEW_EVENT_VOLUME_ANALYSIS",
    generatedAt: new Date().toISOString(),
    purpose: "Section 24: real review-event volume/dedup/reason-distribution measurement against real, zero-cost, already-preserved FWRG and LSB coverage-audit evidence.",
    perPackage: {
      fwrg: {
        totalUnits: fwrgDoc.units.length,
        materialTierUnits: materialCandidateCount(fwrgDoc.units),
        gateStatus: fwrgDoc.gateStatus,
        dangerousUnaccountedCount: fwrgDoc.dangerousUnaccounted.length,
        claimReviewOutcomes: fwrgOutcome.outcomesByType,
        autoResolvedCount: fwrgOutcome.autoResolvedCount,
        skipped: fwrgOutcome.skippedBelowMaterialityOrHealthy,
      },
      lsb: {
        totalUnits: lsbDoc.units.length,
        materialTierUnits: materialCandidateCount(lsbDoc.units),
        gateStatus: lsbDoc.gateStatus,
        dangerousUnaccountedCount: lsbDoc.dangerousUnaccounted.length,
        claimReviewOutcomes: lsbOutcome.outcomesByType,
        autoResolvedCount: lsbOutcome.autoResolvedCount,
        skipped: lsbOutcome.skippedBelowMaterialityOrHealthy,
      },
    },
    totalOpenClaimReviewItemsCreated: items.length,
    byReasonCode,
    byMateriality,
    byOriginStage,
    interpretation:
      `Across ${fwrgDoc.units.length + lsbDoc.units.length} real semantic units (${materialCandidateCount(fwrgDoc.units) + materialCandidateCount(lsbDoc.units)} at CRITICAL/MATERIAL tier) from two real, independently-audited packages, ${items.length} distinct claim-level review items were created - one per genuinely distinct, still-unresolved material claim, not one per raw pipeline event (the ${Object.values(fwrgOutcome.outcomesByType).reduce((a, b) => a + b, 0) + Object.values(lsbOutcome.outcomesByType).reduce((a, b) => a + b, 0)} total recordClaimReview() calls collapsed via dedup into ${items.length} items - see CREATED vs OBSERVATION_APPENDED counts in claimReviewOutcomes for the exact aggregation ratio).`,
  };

  console.log(JSON.stringify(report, null, 2));

  // Cleanup - scratch data only.
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { id: { in: [FWRG_DOC_ID, LSB_DOC_ID] } } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
