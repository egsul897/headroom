/**
 * Phase 3F.2 - the frozen whole-package run against the genuinely unseen
 * Riot Platforms, Inc. credit-facility package (3 documents: base Credit
 * Agreement, Amended and Restated Credit Agreement, Second Amended and
 * Restated Credit Agreement - a crypto-asset-collateralized facility from
 * Coinbase Credit, Inc., never before touched by this codebase).
 *
 * Mirrors scripts/phase-3f-first-blind-run.ts's own established orchestration
 * exactly (same stage order, same "no manual section selection" discipline,
 * same incremental-persist-as-you-go safety), adapted only for RIOT's own
 * document set, company/package/instrument keys, and a $15 cost ceiling
 * (vs DSGR's $30 - this package is proportionally smaller).
 *
 * NO MANUAL COVENANT TARGETS, NO MANUAL DEFINITION SELECTION, NO MANUAL
 * AMENDMENT LINKING, NO MANUAL SECTION SELECTION FOR COMPILATION beyond the
 * single pre-committed, content-blind ordering rule (document-then-discovery-
 * emission order, first N eligible candidates).
 *
 * Run via: (credential injected process-locally) npx tsx scripts/phase-3f2-riot-unseen-run.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runDiscoveryPipeline } from "../lib/contract-model/compiler/discovery/pipeline";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { runAmendmentPipeline } from "../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { isEligibleForSemanticCompilation } from "../lib/contract-model/compiler/semantic/package-compile";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput, type SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import type { SemanticVerificationResult } from "../lib/contract-model/compiler/semantic-verification/types";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const COMPANY_ID = "riot-phase-3f2-unseen";
const PACKAGE_KEY = "riot-2025-2026-coinbase-credit-facility";
const INSTRUMENT_KEY = "riot-coinbase-credit-facility-instrument";
const COMPILE_CAP = 15;
const BUDGET_CEILING_USD = 15;

const SRC_DIR = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run";

const DOCS = [
  { documentId: "doc-a", label: "Riot Platforms Credit Agreement (2025-04-22)", file: "doc-a-2025-04-22-credit-agreement.txt" },
  { documentId: "doc-b", label: "Riot Platforms Amended and Restated Credit Agreement (2025-05-19)", file: "doc-b-2025-05-19-amended-restated-credit-agreement.txt" },
  { documentId: "doc-c", label: "Riot Platforms Second Amended and Restated Credit Agreement (2026-04-21)", file: "doc-c-2026-04-21-second-amended-restated-credit-agreement.txt" },
];

let runningCostUsd = 0;

function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

function logCost(stage: string, telemetry: { calculatedCostUsd?: number | null } | null | undefined) {
  const cost = telemetry?.calculatedCostUsd ?? 0;
  runningCostUsd += cost;
  console.log(`  [cost] ${stage}: +$${cost.toFixed(4)} (running total: $${runningCostUsd.toFixed(4)} / $${BUDGET_CEILING_USD} ceiling)`);
}

async function main() {
  const runStart = Date.now();
  console.log("================ PHASE_3F_2_RIOT_UNSEEN_RUN ================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Budget ceiling: $${BUDGET_CEILING_USD}`);

  console.log("\n=== STAGE 1: Phase 2A structural indexing ===");
  const documents = DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: readFileSync(`${SRC_DIR}/${d.file}`, "utf-8") }));
  const structureResult = runStructureStage(documents);
  const allNodes: StructuralNode[] = structureResult.output;
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allDefinitions: DetectedDefinition[] = [];
  const allReferences: DetectedReference[] = [];
  for (const doc of documents) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const structuralSummary = documents.map((d) => {
    const nodes = allNodes.filter((n) => n.documentId === d.documentId);
    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;
    return { documentId: d.documentId, label: d.label, textChars: d.text.length, totalNodes: nodes.length, nodesByType: byType, definitionsDetected: allDefinitions.filter((x) => x.documentId === d.documentId).length, referencesDetected: allReferences.filter((x) => x.documentId === d.documentId).length };
  });
  console.log(JSON.stringify(structuralSummary, null, 2));
  preserve("stage1-structural-summary", { generatedAt: new Date().toISOString(), documents: structuralSummary, totalNodes: allNodes.length, totalDefinitions: allDefinitions.length, totalReferences: allReferences.length });
  preserve("stage1-all-nodes", allNodes);
  preserve("stage1-all-definitions", allDefinitions);
  preserve("stage1-all-references", allReferences);

  console.log("\n=== STAGE 2: Phase 2B discovery (real model calls) ===");
  const discoveryCaller = getStageCaller();
  console.log(`  provider=${discoveryCaller.providerName} model=${discoveryCaller.model} synthetic=${discoveryCaller.isSynthetic}`);
  if (discoveryCaller.isSynthetic) throw new Error("FATAL: no real credential detected - refusing to proceed with a synthetic unseen run.");

  const allCandidates: DiscoveredCandidate[] = [];
  const discoverySummaries: Record<string, unknown> = {};
  for (const doc of DOCS) {
    console.log(`  discovering ${doc.documentId} (${doc.label})...`);
    const result = await runDiscoveryPipeline(discoveryCaller, doc.documentId, index);
    allCandidates.push(...result.candidates);
    discoverySummaries[doc.documentId] = result.summary;
    logCost(`discovery ${doc.documentId}`, discoveryCaller.lastTelemetry());
    console.log(`    -> ${result.candidates.length} candidates, summary: ${JSON.stringify(result.summary)}`);
    preserve(`stage2-discovery-candidates-${doc.documentId}`, result.candidates);
  }
  preserve("stage2-discovery-summary", { generatedAt: new Date().toISOString(), perDocument: discoverySummaries, totalCandidates: allCandidates.length });
  preserve("stage2-all-discovery-candidates", allCandidates);

  console.log("\n=== STAGE 3: Phase 2C package graph (zero LLM calls) ===");
  const packageDocs: PackageDocumentInput[] = documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }));
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, packageDocs);
  console.log(`  classifications: ${packageGraph.classifications.map((c) => `${c.documentId}=${c.type}(${c.confidence})`).join(", ")}`);
  console.log(`  instruments: ${packageGraph.instruments.length}, relationshipCandidates: ${packageGraph.relationshipCandidates.length}, modificationCandidates: ${packageGraph.modificationCandidates.length}`);
  preserve("stage3-package-graph", packageGraph);

  console.log("\n=== STAGE 4: Phase 2D context retrieval (deterministic, zero LLM calls) ===");
  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }
  const access = { index, packageGraph, exactTermsByDocument };
  const bundlesByDiscoveryId = new Map<string, ReturnType<typeof buildCovenantContextBundle>>();
  for (const candidate of allCandidates) {
    const bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access);
    bundlesByDiscoveryId.set(candidate.discoveryId, bundle);
  }
  console.log(`  built ${bundlesByDiscoveryId.size} context bundles`);
  preserve("stage4-summary", { generatedAt: new Date().toISOString(), bundleCount: bundlesByDiscoveryId.size, sufficiencyBreakdown: Object.fromEntries([...bundlesByDiscoveryId.values()].reduce((m, b) => m.set(b.sufficiencyState, (m.get(b.sufficiencyState) ?? 0) + 1), new Map<string, number>())) });

  console.log("\n=== STAGE 5: Phase 2G amendment pipeline + operative state ===");
  const amendmentCaller = getStageCaller();
  const amendmentResult = await runAmendmentPipeline(amendmentCaller, { documents: packageDocs, packageGraph, index });
  logCost("amendment pipeline", amendmentCaller.lastTelemetry());
  console.log(`  effects: ${amendmentResult.effects.length}, unattached: ${amendmentResult.unattachedEffects.length}, conflicts: ${amendmentResult.totalConflictsAcrossPackage}`);
  preserve("stage5-amendment-effects", amendmentResult.effects);
  preserve("stage5-amendment-summary", amendmentResult.summary);

  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "doc-a", asOfDate: new Date().toISOString().slice(0, 10), index, allEffects: amendmentResult.effects });
  console.log(`  operative state status: ${operativeState.status}, provisions: ${operativeState.provisions.length}`);
  preserve("stage5-operative-state", operativeState);

  console.log(`\n=== STAGE 6: Phase 3B compilation (capped to first ${COMPILE_CAP} eligible candidates, document-then-discovery-emission order) ===`);
  const orderedCandidates: DiscoveredCandidate[] = [];
  for (const doc of DOCS) orderedCandidates.push(...allCandidates.filter((c) => c.documentId === doc.documentId));
  const eligibleOrdered = orderedCandidates.filter((c) => isEligibleForSemanticCompilation(c).eligible);
  const toCompile = eligibleOrdered.slice(0, COMPILE_CAP);
  console.log(`  ${eligibleOrdered.length} eligible candidates total; compiling the first ${toCompile.length} per the pre-committed cap`);

  const compileCaller = getSemanticCaller();
  console.log(`  compiler provider=${compileCaller.providerName} model=${compileCaller.model} synthetic=${compileCaller.isSynthetic}`);
  if (compileCaller.isSynthetic) throw new Error("FATAL: no real credential detected for the semantic compiler - refusing to proceed with a synthetic unseen run.");
  const compiledEntries: { candidateRef: string; compilerInput: SemanticCompilerInput; result: SemanticCompilationResult }[] = [];
  for (const candidate of toCompile) {
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached ($${runningCostUsd.toFixed(2)}) - stopping compilation early, before candidate ${candidate.discoveryId}`);
      break;
    }
    const bundle = bundlesByDiscoveryId.get(candidate.discoveryId)!;
    const operativeSourceText = candidate.structuralNodeKeys.map((k) => index.getNodeText(k, "DESCENDANTS")).join("\n\n");
    const compilerInput: SemanticCompilerInput = {
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT_KEY,
      sourceDocumentId: candidate.documentId,
      candidateRef: candidate.discoveryId,
      sourceSectionRef: candidate.normalizedSourceRef,
      operativeSourceText,
      contextBundle: bundle,
      operativeLineage: null,
      toolAccess: { structuralIndex: index, operativeState, packageGraph, amendmentEffects: amendmentResult.effects, contextBundle: bundle },
      irSchemaVersion: IR_SCHEMA_VERSION,
      compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
      compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
      toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    };
    try {
      console.log(`  compiling ${candidate.discoveryId} (${candidate.documentId}::${candidate.normalizedSourceRef})...`);
      const result = await compileCovenantToIR(compilerInput, { caller: compileCaller });
      logCost(`compile ${candidate.discoveryId}`, result.telemetry);
      console.log(`    -> status=${result.status} rules=${result.rules.length} definitions=${result.definitions.length}`);
      compiledEntries.push({ candidateRef: candidate.discoveryId, compilerInput, result });
    } catch (err) {
      console.error(`    -> FAILED (uncaught): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  preserve(
    "stage6-compiled-results",
    compiledEntries.map((e) => ({ candidateRef: e.candidateRef, sourceDocumentId: e.compilerInput.sourceDocumentId, sourceSectionRef: e.compilerInput.sourceSectionRef, status: e.result.status, rules: e.result.rules, definitions: e.result.definitions, telemetry: e.result.telemetry }))
  );

  console.log("\n=== STAGE 7: Phase 3C verification ===");
  const verifyCaller = getStageCaller();
  const verificationResults: SemanticVerificationResult[] = [];
  for (const entry of compiledEntries) {
    if (entry.result.status === "FAILED") continue;
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached - stopping verification early, before candidate ${entry.candidateRef}`);
      break;
    }
    try {
      console.log(`  verifying ${entry.candidateRef}...`);
      const v = await verifyCompiledCandidate({ compilerInput: entry.compilerInput, compilationResult: entry.result }, { reviewCaller: verifyCaller });
      verificationResults.push(v);
      console.log(`    -> status=${v.status} findings=${v.findings.length} semanticReviewInvoked=${v.semanticReviewInvoked}`);
    } catch (err) {
      console.error(`    -> FAILED (uncaught): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  logCost("verification (aggregate, telemetry per-call not separately exposed)", null);
  preserve("stage7-verification-results", verificationResults);

  const verifiedCandidateRefs = new Set(verificationResults.filter((v) => v.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || v.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS").map((v) => v.candidateRef));

  console.log("\n=== STAGE 8: Phase 3E whole-package semantic coverage audit (Layers A/B only, no Layer C - budget discipline) ===");
  const coverageResult = await runSemanticCoverageAudit({
    companyId: COMPANY_ID,
    packageKey: PACKAGE_KEY,
    instrumentKey: INSTRUMENT_KEY,
    index,
    documents: DOCS.map((d) => ({ documentId: d.documentId })),
    discoveredCandidates: allCandidates,
    compiledResults: compiledEntries.map((e) => ({ candidateRef: e.candidateRef, rules: e.result.rules, definitions: e.result.definitions })),
    verifiedCandidateRefs,
    operativeState,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: discoveryCaller.providerName,
  });
  console.log(`  package status: ${coverageResult.packageCoverage.status}`);
  for (const r of coverageResult.packageCoverage.statusReasons) console.log(`    - ${r}`);
  preserve("stage8-coverage-result", coverageResult);

  const wallClockMs = Date.now() - runStart;
  const finalSummary = {
    runId: "PHASE_3F_2_RIOT_UNSEEN_RUN",
    finishedAt: new Date().toISOString(),
    wallClockMs,
    totalCostUsd: runningCostUsd,
    budgetCeilingUsd: BUDGET_CEILING_USD,
    provider: discoveryCaller.providerName,
    model: discoveryCaller.model,
    documentsProcessed: DOCS.length,
    totalStructuralNodes: allNodes.length,
    totalDiscoveredCandidates: allCandidates.length,
    eligibleForCompilation: eligibleOrdered.length,
    candidatesCompiled: compiledEntries.length,
    candidatesVerified: verificationResults.length,
    candidatesFullyVerified: verifiedCandidateRefs.size,
    packageCoverageStatus: coverageResult.packageCoverage.status,
    documentGateStatuses: coverageResult.packageCoverage.documents.map((d) => ({ documentId: d.documentId, gateStatus: d.gateStatus, unitCount: d.units.length, dangerousUnaccountedCount: d.dangerousUnaccounted.length })),
  };
  console.log("\n================ FINAL SUMMARY ================");
  console.log(JSON.stringify(finalSummary, null, 2));
  preserve("final-summary", finalSummary);
}

main().catch((err) => {
  console.error("FATAL:", err);
  preserve("fatal-error", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null, runningCostUsdAtFailure: runningCostUsd, timestamp: new Date().toISOString() });
  process.exit(1);
});
