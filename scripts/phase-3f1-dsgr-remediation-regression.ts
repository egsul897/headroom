/**
 * Phase 3F.1 §49-50 - the DSGR remediation regression rerun.
 *
 * DSGR is a KNOWN regression package for this run (task §3/§28) - this is
 * NOT a second "unseen" or "blind" validation and must never be reported
 * as one. Its sole purpose is to prove the four Workstream A-D fixes
 * measurably close the gaps the Phase 3F first-blind run's frozen error
 * taxonomy (F1/F2/F3/F6) documented, against the exact same real package.
 *
 * Cost discipline (task §49's explicit requirement): Phase 2A structural
 * parsing, Phase 2B discovery, Phase 2C package graph, and Phase 3B/3C
 * compilation+verification are NOT re-run and NOT re-spent - they are
 * loaded byte-for-byte from the sealed tests/fixtures/unseen-packages/
 * phase-3f-first-blind-run/ artifacts (permanent, read-only, never
 * modified by this script). Only Phase 3E (routing/inventory/materiality/
 * reconciliation/coverage) and Phase 2G's operative-state COMPUTATION
 * (Workstream C changed computeOperativeContractState itself, not the
 * amendment effect parser that produced stage5-amendment-effects.json,
 * which is also reused frozen) are recomputed, using the current
 * (post-Workstream-A-D) code. This run makes zero real LLM calls and
 * costs $0.
 *
 * Output goes to a NEW directory, tests/fixtures/unseen-packages/
 * phase-3f1-dsgr-remediation-regression/, fully separate from the
 * permanent first-blind-run artifacts, under the run identifier
 * PHASE_3F_1_DSGR_REMEDIATION_REGRESSION (task's own explicit naming
 * requirement - never reuses PHASE_3F_FIRST_BLIND_RUN's identifier).
 *
 * Run via: npx tsx scripts/phase-3f1-dsgr-remediation-regression.ts
 * (no --env-file needed - no real model credential is used).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import type { DetectedReference } from "../lib/contract-model/compiler/structural-references";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import type { AmendmentEffectCandidate } from "../lib/contract-model/compiler/amendment/types";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION, SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic-coverage/types";

const COMPANY_ID = "dsgr-phase-3f-unseen";
const PACKAGE_KEY = "dsgr-2022-2025-credit-facility";
const INSTRUMENT_KEY = "dsgr-credit-facility-instrument";

const SRC_DIR = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text";
const FROZEN_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression";

const DOCS = [
  { documentId: "doc-a", label: "DSGR 2022 Amended and Restated Credit Agreement", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
  { documentId: "doc-b", label: "DSGR 2024 Third Amendment", file: "doc-b-2024-third-amendment.txt" },
  { documentId: "doc-c", label: "DSGR 2025 Fourth Amendment", file: "doc-c-2025-fourth-amendment.txt" },
  { documentId: "doc-d", label: "DSGR 2025 Second Amended and Restated Credit Agreement", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
];

function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

function loadFrozen<T>(name: string): T {
  return JSON.parse(readFileSync(`${FROZEN_DIR}/${name}.json`, "utf-8")) as T;
}

async function main() {
  const runStart = Date.now();
  console.log("================ PHASE_3F_1_DSGR_REMEDIATION_REGRESSION ================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log("DSGR is a KNOWN regression package for this run - NOT a blind/unseen validation.");
  console.log(`Reusing frozen Phase 2A/2B/2C/3B/3C output from ${FROZEN_DIR} (zero re-spend).`);
  console.log(`Recomputing Phase 3E (routing/inventory/materiality/reconciliation/coverage) + Phase 2G operative-state computation only.`);

  // ============================================================
  // Rebuild the Phase 2A structural index from FROZEN stage1 output
  // (deterministic replay of already-sealed parse results, zero new
  // computation of the parsing algorithm itself - the parser was not
  // touched by this phase).
  // ============================================================
  console.log("\n=== Reloading frozen Phase 2A structural output ===");
  const allNodes = loadFrozen<StructuralNode[]>("stage1-all-nodes");
  const allDefinitions = loadFrozen<DetectedDefinition[]>("stage1-all-definitions");
  const allReferences = loadFrozen<DetectedReference[]>("stage1-all-references");
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of DOCS) {
    const text = readFileSync(`${SRC_DIR}/${doc.file}`, "utf-8");
    nodesByDocument.set(doc.documentId, { text, nodes: allNodes.filter((n) => n.documentId === doc.documentId) });
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  console.log(`  reloaded ${allNodes.length} structural nodes across ${DOCS.length} documents`);

  // ============================================================
  // Reload frozen Phase 2B discovery, Phase 3B compile, Phase 3C verify
  // ============================================================
  console.log("\n=== Reloading frozen Phase 2B/3B/3C output ===");
  const allCandidates = loadFrozen<DiscoveredCandidate[]>("stage2-all-discovery-candidates");
  console.log(`  reloaded ${allCandidates.length} discovery candidates`);

  const stage6 = loadFrozen<Array<{ candidateRef: string; status: string; rules: unknown[]; definitions: unknown[] }>>("stage6-compiled-results");
  const compiledResults = stage6.map((e) => ({ candidateRef: e.candidateRef, rules: e.rules as never[], definitions: e.definitions as never[] }));
  console.log(`  reloaded ${stage6.length} compiled results`);

  const stage7 = loadFrozen<Array<{ candidateRef: string; status: string }>>("stage7-verification-results");
  const verifiedCandidateRefs = new Set(stage7.filter((v) => v.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || v.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS").map((v) => v.candidateRef));
  console.log(`  reloaded ${stage7.length} verification results, ${verifiedCandidateRefs.size} fully verified`);

  // ============================================================
  // RECOMPUTE Phase 2G operative-state (Workstream C / F3) using the
  // FROZEN amendment effects as input - the amendment-effect PARSER did
  // not change, only computeOperativeContractState's status-defaulting
  // logic did.
  //
  // Evidence for unresolvedTargetEffectsForThisInstrument (task's own
  // "affirmatively asserted from real package/document topology, never
  // guessed" requirement, Architecture Invariants #20): the frozen
  // package graph (stage3-package-graph.json) shows all 4 amendment
  // effects have targetInstrumentKey=null with genuinely UNRESOLVED
  // relationship/modification candidates (2 candidate CREDIT_AGREEMENT
  // documents - doc-a vs doc-d - and the deterministic resolver correctly
  // refused to guess between them, per F3's own documented mechanism).
  // The original first-blind-run script's own framing already computed
  // ONE operativeState across the whole 4-document package under this
  // single INSTRUMENT_KEY - this script does not change that framing.
  // Under that framing, these 4 effects are real, non-hallucinated
  // activity that belongs to THIS package's own instrument scope (they
  // are literally amendments/restatements of documents inside this same
  // 4-document package); asserting them here is therefore consistent
  // with, not a departure from, the frozen modeling choice - it only
  // makes the KNOWN-BUT-UNRESOLVED nature of that activity visible
  // instead of silently invisible, which is F3's entire point. It does
  // NOT resolve the doc-a-vs-doc-d ambiguity itself - Workstream C was
  // never scoped to fix the amendment-target resolver (that would be
  // repairing DSGR compiler semantics, forbidden by task §73).
  // ============================================================
  console.log("\n=== Recomputing Phase 2G operative-state (Workstream C / F3) ===");
  const amendmentEffects = loadFrozen<AmendmentEffectCandidate[]>("stage5-amendment-effects");
  const operativeState = computeOperativeContractState({
    instrumentKey: INSTRUMENT_KEY,
    baseDocumentId: "doc-a",
    asOfDate: new Date().toISOString().slice(0, 10),
    index,
    allEffects: amendmentEffects,
    unresolvedTargetEffectsForThisInstrument: amendmentEffects,
  });
  console.log(`  operative state status: ${operativeState.status} (first-blind baseline: OPERATIVE_STATE_RESOLVED with 0 provisions - the exact F3 finding)`);
  console.log(`  provisions: ${operativeState.provisions.length}, unattachedEffects: ${operativeState.unattachedEffects.length}`);
  preserve("stage5-operative-state-recomputed", operativeState);

  // ============================================================
  // RECOMPUTE Phase 3E whole-package semantic coverage audit
  // (Workstreams A/B/C's routing/materiality/operative-state-honesty
  // wiring, all exercised end-to-end via the real pipeline).
  // ============================================================
  console.log("\n=== Recomputing Phase 3E whole-package semantic coverage audit ===");
  console.log(`  algorithm versions: ${SEMANTIC_COVERAGE_ALGORITHM_VERSION} / ${SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION} (post-remediation v2 - first-blind baseline used v1)`);
  const coverageResult = await runSemanticCoverageAudit({
    companyId: COMPANY_ID,
    packageKey: PACKAGE_KEY,
    instrumentKey: INSTRUMENT_KEY,
    index,
    documents: DOCS.map((d) => ({ documentId: d.documentId })),
    discoveredCandidates: allCandidates,
    compiledResults,
    verifiedCandidateRefs,
    operativeState,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });
  console.log(`  package status: ${coverageResult.packageCoverage.status}`);
  for (const r of coverageResult.packageCoverage.statusReasons) console.log(`    - ${r}`);
  preserve("stage8-coverage-result", coverageResult);

  // ============================================================
  // Boundedness/materiality-distribution summary (checked against the
  // frozen thresholds in tests/fixtures/unseen-packages/phase-3f1-freeze/
  // phase-3f1-freeze-manifest.json by the separate scoring script).
  // ============================================================
  const byMateriality: Record<string, number> = {};
  let totalUnits = 0;
  for (const doc of coverageResult.documentDetails) {
    for (const u of doc.units) {
      byMateriality[u.materiality] = (byMateriality[u.materiality] ?? 0) + 1;
      totalUnits += 1;
    }
  }
  const contextuallyElevatedCount = coverageResult.documentDetails.reduce((sum, doc) => sum + doc.units.filter((u) => u.contextuallyElevated).length, 0);

  const wallClockMs = Date.now() - runStart;
  const finalSummary = {
    runId: "PHASE_3F_1_DSGR_REMEDIATION_REGRESSION",
    finishedAt: new Date().toISOString(),
    wallClockMs,
    totalCostUsd: 0,
    note: "DSGR is a KNOWN regression package for this run - not a blind/unseen validation.",
    reusedFrozenFrom: FROZEN_DIR,
    recomputedStages: ["phase2gOperativeState (Workstream C)", "phase3eSemanticCoverage (Workstreams A/B/C)"],
    documentsProcessed: DOCS.length,
    totalStructuralNodes: allNodes.length,
    totalDiscoveredCandidates: allCandidates.length,
    candidatesCompiled: stage6.length,
    candidatesVerified: stage7.length,
    candidatesFullyVerified: verifiedCandidateRefs.size,
    operativeStateStatus: operativeState.status,
    operativeStateUnattachedEffectsCount: operativeState.unattachedEffects.length,
    packageCoverageStatus: coverageResult.packageCoverage.status,
    documentGateStatuses: coverageResult.packageCoverage.documents.map((d) => ({ documentId: d.documentId, gateStatus: d.gateStatus, unitCount: d.units.length, dangerousUnaccountedCount: d.dangerousUnaccounted.length })),
    unitInventory: { totalUnits, byMateriality, contextuallyElevatedCount },
    firstBlindBaselineForComparison: { totalUnits: 6210, byMateriality: { INFORMATIONAL: 2906, REVIEW_UNCERTAIN: 1090, MATERIAL: 1783, CRITICAL: 431 } },
  };
  console.log("\n================ FINAL SUMMARY ================");
  console.log(JSON.stringify(finalSummary, null, 2));
  preserve("final-summary", finalSummary);
}

main().catch((err) => {
  console.error("FATAL:", err);
  preserve("fatal-error", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null, timestamp: new Date().toISOString() });
  process.exit(1);
});
