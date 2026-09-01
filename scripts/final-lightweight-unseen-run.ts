/**
 * HEADROOM FINAL LIGHTWEIGHT GENUINELY-UNSEEN CONFIRMATION - the frozen
 * whole-package run against the genuinely unseen Superior Industries
 * International, Inc. Term Loan Credit Agreement thread (3 documents:
 * original Credit Agreement, Amended and Restated Credit Agreement, First
 * Amendment - never before touched by this codebase, acquired from public
 * SEC EDGAR filings).
 *
 * Mirrors scripts/phase-3f2-riot-unseen-run.ts's own established
 * orchestration exactly (same stage order, same "no manual section
 * selection" discipline, same incremental-persist-as-you-go safety),
 * adapted only for this package's own document set, company/package/
 * instrument keys, and a $7.50 cost ceiling (a 50-cent margin under this
 * mission's own $8.00 hard ceiling - see docs/final-lightweight-unseen/
 * 06-cost-forecast.json).
 *
 * NO MANUAL COVENANT TARGETS, NO MANUAL DEFINITION SELECTION, NO MANUAL
 * AMENDMENT LINKING, NO MANUAL SECTION SELECTION FOR COMPILATION beyond the
 * single pre-committed, content-blind ordering rule (document-then-discovery-
 * emission order, first N eligible candidates).
 *
 * Isolated tenant: a freshly-generated companyId never used by any other
 * company/document/run in this Postgres instance (Section 7 DB isolation).
 *
 * Run via: npx tsx scripts/final-lightweight-unseen-run.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

// .env.local is only auto-loaded by Next.js's own dev/build runtime, not by
// a plain `tsx` script invocation - load AI_GATEWAY_API_KEY explicitly
// before getStageCaller()/getSemanticCaller() read process.env, exactly
// like scripts/final-lightweight-unseen-provider-probe.ts's own precedent.
if (!process.env.AI_GATEWAY_API_KEY) {
  try {
    const envLocal = readFileSync(".env.local", "utf-8");
    const match = envLocal.match(/AI_GATEWAY_API_KEY=(.+)/);
    if (match) process.env.AI_GATEWAY_API_KEY = match[1]!.trim();
  } catch {
    // .env.local absent - getStageCaller()'s own real-credential check below will fail loudly.
  }
}

import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runDiscoveryPipeline } from "../lib/contract-model/compiler/discovery/pipeline";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { runAmendmentPipeline } from "../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus } from "../lib/contract-model/compiler/amendment/operative-state";
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

// Section 7 DB isolation: a freshly-generated companyId never used by any
// other company/document/run in this Postgres instance.
const COMPANY_ID = "final-lightweight-unseen-sup-968ccc2b";
const PACKAGE_KEY = "sup-term-loan-2022-2025";
const INSTRUMENT_KEY = "sup-term-loan-instrument";
const COMPILE_CAP = 15;
const BUDGET_CEILING_USD = 7.5; // 50-cent margin under the mission's own $8.00 hard ceiling.

const SRC_DIR = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text";
const OUT_DIR = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup-run";

const DOCS = [
  { documentId: "doc-a", label: "Superior Industries International, Inc. Term Loan Credit Agreement (2022-12-15)", file: "doc-a-2022-12-15-term-loan-credit-agreement.txt" },
  { documentId: "doc-b", label: "Superior Industries International, Inc. Amended and Restated Term Loan Credit Agreement (2024-08-14)", file: "doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt" },
  { documentId: "doc-c", label: "Superior Industries International, Inc. First Amendment to Amended and Restated Term Loan Credit Agreement (2025-03-31)", file: "doc-c-2025-03-31-first-amendment.txt" },
];

let runningCostUsd = 0;

// Resume support: if a prior invocation of this exact frozen run crashed on
// a real environmental blocker (e.g. the shared provider account budget was
// exhausted, unrelated to this run's own BUDGET_CEILING_USD), a human
// authorized a resume rather than a restart. Carry the REAL cumulative cost
// already spent forward so the ceiling check stays honest across both
// process invocations, and never re-call the (already-paid-for, already
// valid) Stage 2 discovery results for a document that already completed.
const FATAL_ERROR_PATH = `${OUT_DIR}/fatal-error.json`;
let resumedFromFatalError: { message: string; runningCostUsdAtFailure: number; timestamp: string } | null = null;
if (existsSync(FATAL_ERROR_PATH)) {
  const prior = JSON.parse(readFileSync(FATAL_ERROR_PATH, "utf-8"));
  resumedFromFatalError = prior;
  runningCostUsd = prior.runningCostUsdAtFailure ?? 0;
}

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
  console.log("================ FINAL_LIGHTWEIGHT_UNSEEN_RUN ================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Budget ceiling: $${BUDGET_CEILING_USD}`);
  console.log(`Isolated companyId: ${COMPANY_ID}`);
  if (resumedFromFatalError) {
    console.log(`  [resume] prior invocation of this SAME frozen run hit a real environmental blocker at ${resumedFromFatalError.timestamp}: ${resumedFromFatalError.message}`);
    console.log(`  [resume] carrying forward real cumulative cost already spent: $${runningCostUsd.toFixed(4)}`);
    console.log(`  [resume] a human authorized resuming (same provider/model/credential, no substitution) - see docs/final-lightweight-unseen/08-pipeline-run.json for the full disclosure`);
  }

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
    const cachedPath = `${OUT_DIR}/stage2-discovery-candidates-${doc.documentId}.json`;
    if (resumedFromFatalError && existsSync(cachedPath)) {
      const cached: DiscoveredCandidate[] = JSON.parse(readFileSync(cachedPath, "utf-8"));
      console.log(`  [resume] ${doc.documentId} already discovered in the prior invocation (${cached.length} candidates) - loading from ${cachedPath}, no re-call`);
      allCandidates.push(...cached);
      discoverySummaries[doc.documentId] = { resumedFromPriorInvocation: true, cachedCandidateCount: cached.length };
      continue;
    }
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached - stopping discovery early, before document ${doc.documentId}`);
      break;
    }
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

  console.log("\n=== STAGE 5: Phase 2G amendment pipeline + operative state (per real instrument-grouping scoping) ===");
  const amendmentCaller = getStageCaller();

  // Mirrors the real orchestrator's own per-instrument scoping (see
  // docs/pre-unseen-operative-integration/01-inconsistency-trace.json's own
  // finding on RESOLVED-only instrument merge) - never a single combined
  // call across the whole package.
  const grouped = new Set<string>();
  const units: { instrumentKey: string; baseDocumentId: string; documentIds: string[] }[] = [];
  for (const inst of packageGraph.instruments) {
    for (const id of inst.documentIds) grouped.add(id);
    units.push({ instrumentKey: inst.instrumentKey, baseDocumentId: inst.baseDocumentId ?? inst.documentIds[0]!, documentIds: inst.documentIds });
  }
  for (const doc of DOCS) {
    if (!grouped.has(doc.documentId)) units.push({ instrumentKey: `standalone:${doc.documentId}`, baseDocumentId: doc.documentId, documentIds: [doc.documentId] });
  }
  console.log(`  instrument units: ${JSON.stringify(units)}`);

  const operativeStatesByUnit: Record<string, ReturnType<typeof computeOperativeContractState>> = {};
  const supersessionEntries: { baseDocumentId: string; state: ReturnType<typeof computeOperativeContractState> }[] = [];
  let combinedAmendmentEffects: Awaited<ReturnType<typeof runAmendmentPipeline>>["effects"] = [];
  for (const unit of units) {
    const unitDocs = packageDocs.filter((d) => unit.documentIds.includes(d.documentId));
    const amendmentResult = await runAmendmentPipeline(amendmentCaller, { documents: unitDocs, packageGraph, index });
    logCost(`amendment pipeline (${unit.instrumentKey})`, amendmentCaller.lastTelemetry());
    combinedAmendmentEffects = combinedAmendmentEffects.concat(amendmentResult.effects);
    const unresolvedTargetEffectsForThisInstrument = amendmentResult.effects.filter((e) => e.target.targetInstrumentKey === null);
    const state = computeOperativeContractState({ instrumentKey: unit.instrumentKey, baseDocumentId: unit.baseDocumentId, asOfDate: new Date().toISOString().slice(0, 10), index, allEffects: amendmentResult.effects, unresolvedTargetEffectsForThisInstrument });
    operativeStatesByUnit[unit.instrumentKey] = state;
    supersessionEntries.push({ baseDocumentId: unit.baseDocumentId, state });
    console.log(`  [${unit.instrumentKey}] effects=${amendmentResult.effects.length} operativeDocument=${JSON.stringify(state.operativeDocument)} status=${state.status} provisions=${state.provisions.length}`);
  }
  preserve("stage5-amendment-effects", combinedAmendmentEffects);
  preserve("stage5-operative-states-by-unit", operativeStatesByUnit);

  const supersessionIndex = buildNodeSupersessionIndex(supersessionEntries);
  preserve("stage5-supersession-index-summary", { coveredDocumentIds: [...supersessionIndex.coveredDocumentIds], documentLevelSupersededDocuments: Object.fromEntries(supersessionIndex.documentLevelSupersededDocuments), supersededNodeCount: supersessionIndex.supersededByNodeId.size, ambiguousNodeCount: supersessionIndex.ambiguousNodeIds.size });

  // Use the instrument whose own document set includes doc-a as the
  // "primary" operative state for downstream semantic-compilation tool
  // access (matches how a real per-document analysis run would resolve
  // tool access for any given source document).
  const primaryUnit = units.find((u) => u.documentIds.includes("doc-a"))!;
  const operativeState = operativeStatesByUnit[primaryUnit.instrumentKey]!;

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
      toolAccess: { structuralIndex: index, operativeState, packageGraph, amendmentEffects: combinedAmendmentEffects, contextBundle: bundle },
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
      logCost(`verify ${entry.candidateRef}`, verifyCaller.lastTelemetry());
      console.log(`    -> status=${v.status} findings=${v.findings.length} semanticReviewInvoked=${v.semanticReviewInvoked}`);
    } catch (err) {
      console.error(`    -> FAILED (uncaught): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  preserve("stage7-verification-results", verificationResults);

  const verifiedCandidateRefs = new Set(verificationResults.filter((v) => v.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || v.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS").map((v) => v.candidateRef));

  console.log("\n=== STAGE 8: node/source currentness check for the deleted/superseded carve-out and control node ===");
  const nodeTrustChecks = allNodes
    .filter((n) => n.documentId === "doc-a" || n.documentId === "doc-b")
    .slice(0, 0); // placeholder narrowed below with real, discovered nodes once stage 1 output is available.
  preserve("stage8-node-trust-placeholder", { note: "Real node-trust checks performed in the scoring stage (09/13/14 artifacts) against this run's own frozen stage1-all-nodes.json, not duplicated here." });
  void nodeTrustChecks;

  console.log("\n=== STAGE 9: Phase 3E whole-package semantic coverage audit (Layers A/B only, no Layer C - budget discipline) ===");
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
  preserve("stage9-coverage-result", coverageResult);

  const wallClockMs = Date.now() - runStart;
  const finalSummary = {
    runId: "FINAL_LIGHTWEIGHT_UNSEEN_RUN",
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
    instrumentUnits: units,
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
