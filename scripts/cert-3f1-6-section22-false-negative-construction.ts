/**
 * Phase 3F.1.6 Final Foundation Certification - Section 22 (artifact 20):
 * FALSE-NEGATIVE construction. Distinct from Section 20/artifact-18 (which
 * confirms the five canonical failure classes DO each produce a review item
 * when derive.ts + recordClaimReview are exercised on a clean, internally-
 * consistent DocumentCoverageResult). This script instead hunts for a
 * SYSTEMATIC INTEGRATION-LEVEL class of encountered material claim that can
 * vanish with NEITHER a trusted representation NOR an explicit review state,
 * by stress-testing recordClaimReviewsFromDocumentCoverage's own documented
 * contract (a 1:1 correspondence between DocumentCoverageResult.units and
 * .coverageEntries) rather than assuming every future caller maintains it.
 *
 * Two distinct failure-reason families sampled, both real and currently
 * latent (the one real wired caller today happens to always preserve the
 * 1:1 invariant, per pipeline.ts's own construction - see the certification
 * narrative for why this is a live risk for a FUTURE caller, exactly the
 * kind Section 19 would require):
 *
 *  FN-1: a coverage ENTRY (CRITICAL, UNREPRESENTED, fully-populated
 *        reasoning) exists with no corresponding `unit` in `units[]`.
 *  FN-2: a material `unit` (CRITICAL, real anchor) exists with NO
 *        corresponding entry in `coverageEntries[]` at all - the
 *        integration loop iterates over entries only, so this unit is
 *        never even visited, not even counted in the `skipped` metric.
 *
 * For each, confirms: (a) recordClaimReviewsFromDocumentCoverage returns
 * successfully with NO error/exception raised (a silent path, not a loud
 * one), (b) zero ClaimReviewItem rows are created for the missing claim,
 * (c) nothing anywhere records that this specific claim was ever
 * "trusted" either - i.e. neither state of Invariant #37 is satisfied.
 */
import { prisma } from "../lib/prisma";
import { recordClaimReviewsFromDocumentCoverage } from "../lib/contract-model/compiler/safe-failure/integrate";
import { claimKeyFromSemanticUnit } from "../lib/contract-model/compiler/safe-failure/identity";
import type { DocumentCoverageResult, MaterialSemanticUnit, SemanticUnitCoverageEntry } from "../lib/contract-model/compiler/semantic-coverage/types";

const COMPANY = "cert-3f1-6-sec22-fn-co";
const DOC = "cert-3f1-6-sec22-fn-doc";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS (i.e. confirmed): ${label}`);
  else {
    failures += 1;
    console.log(`UNEXPECTED (did not reproduce as predicted): ${label}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function makeUnit(overrides: Partial<MaterialSemanticUnit> & { semanticUnitId: string }): MaterialSemanticUnit {
  return {
    companyId: COMPANY,
    packageKey: "cert-sec22-pkg",
    instrumentKey: null,
    operativeVersionRef: null,
    granularity: "SEMANTIC_UNIT",
    anchors: [{ documentId: DOC, structuralNodeKey: `${DOC}::8.01`, structuralNodeId: "cert-sec22-node", sectionRef: "8.01", charStart: 0, charEnd: 50, sourceCitation: `${DOC}::8.01` }],
    family: "FINANCIAL_COVENANTS",
    familyEvidence: null,
    postureSignal: "OBLIGATION_SIGNAL",
    materiality: "CRITICAL",
    materialityReasoning: "cert-sec22 injected fixture",
    contextuallyElevated: false,
    excerptText: "cert-sec22 injected excerpt - a real material covenant claim",
    detectedSignals: ["currency_value"],
    fromRawSourceFallback: false,
    detectionMethod: "STRUCTURAL_HYPOTHESIS",
    aiInventoryPromptVersion: null,
    confidence: "HIGH",
    uncertaintyReasons: [],
    inventoryAlgorithmVersion: "cert-sec22-v1",
    provenance: "cert-sec22-injected",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<SemanticUnitCoverageEntry> & { semanticUnitId: string }): SemanticUnitCoverageEntry {
  return {
    coverageState: "UNREPRESENTED",
    matchedIrIds: [],
    missingEconomicElement: null,
    reasoning: "cert-sec22 injected reasoning",
    materiality: "CRITICAL",
    coverageAlgorithmVersion: "cert-sec22-v1",
    ...overrides,
  };
}

function makeCoverageResult(units: MaterialSemanticUnit[], entries: SemanticUnitCoverageEntry[]): DocumentCoverageResult {
  return {
    documentId: DOC,
    units,
    coverageEntries: entries,
    dangerousUnaccounted: [],
    familySummaries: [],
    rawFullyRepresentedFraction: 0,
    materialityWeightedFullyRepresentedFraction: 0,
    gateStatus: "DOCUMENT_GATE_FAILED",
    gateFailureReasons: ["cert-sec22 synthetic fixture"],
  };
}

async function main() {
  await prisma.company.createMany({ data: [{ id: COMPANY, name: "Cert Sec22 FN Co" }], skipDuplicates: true });
  await prisma.document.createMany({ data: [{ id: DOC, companyId: COMPANY, name: "Cert Sec22 FN Doc", type: "CREDIT_AGREEMENT" }], skipDuplicates: true });

  try {
    // --- FN-1: orphaned CRITICAL entry, no matching unit in units[] ---
    const orphanEntryUnitId = "cert-sec22-fn1-orphan-entry-unit";
    const fn1Entries = [makeEntry({ semanticUnitId: orphanEntryUnitId, coverageState: "UNREPRESENTED", reasoning: "a genuinely material $40,000,000 debt basket with no compiled IR representation - this entry has NO corresponding unit in units[]" })];
    const fn1Result = makeCoverageResult([], fn1Entries); // units[] deliberately empty

    let fn1Threw = false;
    let fn1Outcome;
    try {
      fn1Outcome = await recordClaimReviewsFromDocumentCoverage(COMPANY, "cert-sec22-pkg", fn1Result);
    } catch {
      fn1Threw = true;
    }
    check("FN-1: recordClaimReviewsFromDocumentCoverage does NOT throw/error on an orphaned entry (fails silently, not loudly)", !fn1Threw);
    check("FN-1: the orphaned entry is counted only in the generic `skipped` bucket (indistinguishable from a healthy skip)", fn1Outcome?.skippedBelowMaterialityOrHealthy === 1, fn1Outcome);
    check("FN-1: outcomesByType shows zero CREATED (no review item was made for this CRITICAL claim)", fn1Outcome?.outcomesByType.CREATED === 0, fn1Outcome?.outcomesByType);
    const fn1ClaimKey = claimKeyFromSemanticUnit({ semanticUnitId: orphanEntryUnitId });
    const fn1Row = await prisma.claimReviewItem.findUnique({ where: { companyId_claimKey: { companyId: COMPANY, claimKey: fn1ClaimKey } } });
    check("FN-1: NO ClaimReviewItem row exists for this CRITICAL, UNREPRESENTED claim - it has neither trusted representation nor review state", fn1Row === null);

    // --- FN-2: material unit present, but NO corresponding entry in coverageEntries[] at all ---
    const orphanUnitId = "cert-sec22-fn2-orphan-unit-no-entry";
    const fn2Unit = makeUnit({ semanticUnitId: orphanUnitId, materiality: "CRITICAL", excerptText: "cert-sec22: a real $55,000,000 restricted-payments basket, present in units[] but never given a coverage entry at all" });
    const fn2Result = makeCoverageResult([fn2Unit], []); // coverageEntries[] deliberately empty

    let fn2Threw = false;
    let fn2Outcome;
    try {
      fn2Outcome = await recordClaimReviewsFromDocumentCoverage(COMPANY, "cert-sec22-pkg", fn2Result);
    } catch {
      fn2Threw = true;
    }
    check("FN-2: recordClaimReviewsFromDocumentCoverage does NOT throw/error when a material unit has no entry at all", !fn2Threw);
    check("FN-2: the loop never even VISITS this unit - it is not counted in `skipped` at all (worse than FN-1: not even a silent counter bump)", fn2Outcome?.skippedBelowMaterialityOrHealthy === 0 && fn2Outcome?.outcomesByType.CREATED === 0, fn2Outcome);
    const fn2ClaimKey = claimKeyFromSemanticUnit({ semanticUnitId: orphanUnitId });
    const fn2Row = await prisma.claimReviewItem.findUnique({ where: { companyId_claimKey: { companyId: COMPANY, claimKey: fn2ClaimKey } } });
    check("FN-2: NO ClaimReviewItem row exists for this CRITICAL unit - it has neither trusted representation nor review state, and is invisible to every metric this function reports", fn2Row === null);

    // --- Control: confirm the SAME two units/entries DO produce a review item when correctly paired (proves the gap is specifically the mismatch, not a general derive/record failure) ---
    const controlUnitId = "cert-sec22-control-paired-unit";
    const controlUnit = makeUnit({ semanticUnitId: controlUnitId, materiality: "CRITICAL" });
    const controlEntry = makeEntry({ semanticUnitId: controlUnitId, coverageState: "UNREPRESENTED", reasoning: "cert-sec22 control: correctly paired unit+entry" });
    const controlResult = makeCoverageResult([controlUnit], [controlEntry]);
    const controlOutcome = await recordClaimReviewsFromDocumentCoverage(COMPANY, "cert-sec22-pkg", controlResult);
    check("CONTROL: when unit and entry ARE correctly paired, a review item IS created (proves FN-1/FN-2 are specifically about the pairing gap, not a general malfunction)", controlOutcome.outcomesByType.CREATED === 1, controlOutcome);

    console.log(`\n${failures === 0 ? "ALL PREDICTED FALSE-NEGATIVE BEHAVIORS CONFIRMED" : `${failures} CHECK(S) DID NOT MATCH PREDICTION`}`);
  } finally {
    await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY } });
    await prisma.document.deleteMany({ where: { id: DOC } });
    await prisma.company.deleteMany({ where: { id: COMPANY } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
