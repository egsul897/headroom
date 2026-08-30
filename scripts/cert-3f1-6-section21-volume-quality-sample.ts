/**
 * Phase 3F.1.6 Final Foundation Certification - Section 21 support script.
 *
 * Re-runs the exact same real FWRG+LSB coverage-audit -> safe-failure
 * emission pipeline as scripts/phase-3f1-5-r-safe-failure-volume-analysis.ts
 * (same loaders, same inputs, same call sequence - this is a read-only
 * regeneration, not a new methodology), but additionally dumps the FULL
 * per-item detail (sourceEvidence, rationale, sectionRef, reasonCode,
 * materiality, family) for every created ClaimReviewItem to a local JSON
 * file BEFORE cleanup, so the independent auditor can draw a real sample and
 * manually classify it. Cleans up all scratch DB rows afterward exactly as
 * the original script does; the JSON dump is local certification working
 * data, not new production or docs content.
 */
import { prisma } from "../lib/prisma";
import { loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";
import { loadRealDiscoveredCandidates as loadFwrgCandidatesLegacy, loadRealCompiledResults as loadFwrgCompiled, DOCUMENT_ID as FWRG_DOC_ID } from "./phase-3e-real-fwrg-regression";
import { loadRealDiscoveredCandidates as loadLsbCandidatesLegacy, loadRealCompiledResults as loadLsbCompiled, DOCUMENT_ID as LSB_DOC_ID } from "./phase-3e-real-lsb-regression";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { recordClaimReviewsFromDocumentCoverage } from "../lib/contract-model/compiler/safe-failure/integrate";
import type { StructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import * as fs from "fs";

const COMPANY_ID = "cert-3f1-6-sec21-volume-sample-scratch";
const OUT_PATH = "/tmp/claude-0/-home-user-headroom/fe43ab40-ccca-5e2c-9b2f-8f264a45dc31/scratchpad/section21-review-items-full-dump.json";

function withRealNodeIds(candidates: DiscoveredCandidate[], index: StructuralIndex, documentId: string): DiscoveredCandidate[] {
  return candidates.map((c) => ({
    ...c,
    structuralNodeIds: c.structuralNodeKeys.map((key) => index.getNodeByRef(documentId, key.slice(key.indexOf("::") + 2))?.nodeId ?? ""),
  }));
}

async function main() {
  const { index } = loadFwrgLsbStructuralIndex();

  await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Cert Sec21 volume sample scratch" }, update: {} });
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

  const items = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID }, orderBy: { id: "asc" } });

  console.log(`total items: ${items.length}`);
  console.log(`fwrg outcomes: ${JSON.stringify(fwrgOutcome.outcomesByType)}, lsb outcomes: ${JSON.stringify(lsbOutcome.outcomesByType)}`);
  console.log(`fwrg total units: ${fwrgDoc.units.length}, lsb total units: ${lsbDoc.units.length}`);

  const dump = items.map((it) => ({
    id: it.id,
    packageKey: it.packageKey,
    documentId: it.documentId,
    claimKey: it.claimKey,
    sectionRef: it.sectionRef,
    covenantFamily: it.covenantFamily,
    materiality: it.materiality,
    reasonCode: it.reasonCode,
    unresolvedDimensions: it.unresolvedDimensions,
    originStage: it.originStage,
    sourceEvidence: it.sourceEvidence,
    sourceCitation: it.sourceCitation,
    rationale: it.rationale,
    relatedSemanticObjectId: it.relatedSemanticObjectId,
  }));
  fs.writeFileSync(OUT_PATH, JSON.stringify(dump, null, 2));
  console.log(`dumped ${dump.length} full items to ${OUT_PATH}`);

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
