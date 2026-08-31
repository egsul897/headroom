/**
 * Phase 3F.2 RESUME - completes the frozen Riot semantic execution from
 * preserved state. Reuses Stage 1-5 output byte-for-byte (zero re-spend);
 * reuses the 3 prior real compile+verify successes (zero re-spend); retries
 * the 12 prior environment-blocked candidates (their first attempt cost $0,
 * so retrying is not a double-spend); compiles+verifies 23 new candidates
 * selected via the deterministic stratified sample in
 * tests/fixtures/unseen-packages/phase-3f2-riot-resume-run/resume-sample-manifest.json
 * (built per 00-validation-contract.json's own precommitted
 * compilationScope fallback rule). Then recomputes Stage 8 coverage over
 * the full union (38 candidates).
 *
 * Run via: (credential injected process-locally) npx tsx scripts/phase-3f2-riot-resume-run.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import type { DetectedReference } from "../lib/contract-model/compiler/structural-references";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { isEligibleForSemanticCompilation } from "../lib/contract-model/compiler/semantic/package-compile";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput, type SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import type { SemanticVerificationResult } from "../lib/contract-model/compiler/semantic-verification/types";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { PackageGraphResult } from "../lib/contract-model/compiler/package-graph/types";
import type { OperativeContractState } from "../lib/contract-model/compiler/amendment/types";

const COMPANY_ID = "riot-phase-3f2-unseen";
const PACKAGE_KEY = "riot-2025-2026-coinbase-credit-facility";
const INSTRUMENT_KEY = "riot-coinbase-credit-facility-instrument";
const BUDGET_CEILING_USD = 15;
const PRIOR_SPEND_USD = 0.820356;

const SRC_DIR = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text";
const FROZEN_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-resume-run";

const DOCS = [
  { documentId: "doc-a", label: "Riot Platforms Credit Agreement (2025-04-22)", file: "doc-a-2025-04-22-credit-agreement.txt" },
  { documentId: "doc-b", label: "Riot Platforms Amended and Restated Credit Agreement (2025-05-19)", file: "doc-b-2025-05-19-amended-restated-credit-agreement.txt" },
  { documentId: "doc-c", label: "Riot Platforms Second Amended and Restated Credit Agreement (2026-04-21)", file: "doc-c-2026-04-21-second-amended-restated-credit-agreement.txt" },
];

let runningCostUsd = PRIOR_SPEND_USD;

function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

function loadFrozen<T>(name: string): T {
  return JSON.parse(readFileSync(`${FROZEN_DIR}/${name}.json`, "utf-8")) as T;
}

function logCost(stage: string, telemetry: { calculatedCostUsd?: number | null } | null | undefined) {
  const cost = telemetry?.calculatedCostUsd ?? 0;
  runningCostUsd += cost;
  console.log(`  [cost] ${stage}: +$${cost.toFixed(4)} (running total: $${runningCostUsd.toFixed(4)} / $${BUDGET_CEILING_USD} ceiling)`);
}

async function main() {
  const runStart = Date.now();
  console.log("================ PHASE_3F_2_RIOT_RESUME_RUN ================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Starting running cost (prior spend, carried forward): $${runningCostUsd.toFixed(6)}`);

  console.log("\n=== Reloading frozen Stage 1 structural output (zero re-spend) ===");
  const allNodes = loadFrozen<StructuralNode[]>("stage1-all-nodes");
  const allDefinitions = loadFrozen<DetectedDefinition[]>("stage1-all-definitions");
  const allReferences = loadFrozen<DetectedReference[]>("stage1-all-references");
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of DOCS) {
    const text = readFileSync(`${SRC_DIR}/${doc.file}`, "utf-8");
    nodesByDocument.set(doc.documentId, { text, nodes: allNodes.filter((n) => n.documentId === doc.documentId) });
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  console.log(`  reloaded ${allNodes.length} nodes, ${allDefinitions.length} definitions, ${allReferences.length} references`);

  console.log("\n=== Reloading frozen Stage 2 discovery output (zero re-spend) ===");
  const allCandidates = loadFrozen<DiscoveredCandidate[]>("stage2-all-discovery-candidates");
  console.log(`  reloaded ${allCandidates.length} discovered candidates`);

  console.log("\n=== Reloading frozen Stage 3 package graph (zero re-spend) ===");
  const packageGraph = loadFrozen<PackageGraphResult>("stage3-package-graph");

  console.log("\n=== Reloading frozen Stage 5 amendment effects + operative state (zero re-spend) ===");
  const amendmentEffects = loadFrozen<any[]>("stage5-amendment-effects");
  const operativeState = loadFrozen<OperativeContractState>("stage5-operative-state");

  console.log("\n=== Rebuilding Stage 4 context bundles (deterministic, zero re-spend) ===");
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
  console.log(`  rebuilt ${bundlesByDiscoveryId.size} context bundles`);

  console.log("\n=== Loading resume sample manifest (frozen, committed before this run) ===");
  const sampleManifest = JSON.parse(readFileSync(`${OUT_DIR}/resume-sample-manifest.json`, "utf-8"));
  const priorCompiled = loadFrozen<any[]>("stage6-compiled-results");
  const priorVerified = loadFrozen<any[]>("stage7-verification-results");

  const reuseRefs: string[] = sampleManifest.priorSuccessReused;
  const retryRefs: string[] = sampleManifest.retryPicks;
  const newPickRefs: string[] = sampleManifest.newStratifiedPicks.map((p: any) => p.discoveryId);
  console.log(`  reuse=${reuseRefs.length} retry=${retryRefs.length} newPicks=${newPickRefs.length}`);

  const candidateById = new Map(allCandidates.map((c) => [c.discoveryId, c]));
  const toAttemptRefs = [...retryRefs, ...newPickRefs];
  const toAttempt = toAttemptRefs.map((id) => candidateById.get(id)!).filter(Boolean);
  console.log(`  candidates to attempt this run: ${toAttempt.length} (expected ${toAttemptRefs.length})`);

  console.log("\n=== STAGE 6 (resume): compiling new/retry candidates ===");
  const compileCaller = getSemanticCaller();
  console.log(`  compiler provider=${compileCaller.providerName} model=${compileCaller.model} synthetic=${compileCaller.isSynthetic}`);
  if (compileCaller.isSynthetic) throw new Error("FATAL: no real credential detected - refusing to proceed with a synthetic resume run.");

  type Entry = { candidateRef: string; compilerInput: SemanticCompilerInput; result: SemanticCompilationResult };
  const newCompiledEntries: Entry[] = [];
  const newCompiledSummaries: any[] = [];
  for (const candidate of toAttempt) {
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached ($${runningCostUsd.toFixed(2)}) - stopping compilation early, before candidate ${candidate.discoveryId}`);
      break;
    }
    const bundle = bundlesByDiscoveryId.get(candidate.discoveryId)!;
    const operativeSourceText = candidate.structuralNodeKeys.map((k: string) => index.getNodeText(k, "DESCENDANTS")).join("\n\n");
    const compilerInput: SemanticCompilerInput = {
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT_KEY,
      sourceDocumentId: candidate.documentId,
      candidateRef: candidate.discoveryId,
      sourceSectionRef: candidate.normalizedSourceRef,
      operativeSourceText,
      contextBundle: bundle,
      operativeLineage: null,
      toolAccess: { structuralIndex: index, operativeState, packageGraph, amendmentEffects, contextBundle: bundle },
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
      newCompiledEntries.push({ candidateRef: candidate.discoveryId, compilerInput, result });
      newCompiledSummaries.push({ candidateRef: candidate.discoveryId, sourceDocumentId: compilerInput.sourceDocumentId, sourceSectionRef: compilerInput.sourceSectionRef, status: result.status, rules: result.rules, definitions: result.definitions, telemetry: result.telemetry });
    } catch (err) {
      console.error(`    -> FAILED (uncaught): ${err instanceof Error ? err.message : String(err)}`);
      newCompiledSummaries.push({ candidateRef: candidate.discoveryId, status: "FAILED", error: err instanceof Error ? err.message : String(err) });
    }
  }
  preserve("stage6-new-compiled-results", newCompiledSummaries);

  console.log("\n=== STAGE 7 (resume): verifying newly compiled candidates ===");
  const verifyCaller = getStageCaller();
  const newVerificationResults: SemanticVerificationResult[] = [];
  for (const entry of newCompiledEntries) {
    if (entry.result.status === "FAILED") continue;
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached - stopping verification early, before candidate ${entry.candidateRef}`);
      break;
    }
    try {
      console.log(`  verifying ${entry.candidateRef}...`);
      const v = await verifyCompiledCandidate({ compilerInput: entry.compilerInput, compilationResult: entry.result }, { reviewCaller: verifyCaller });
      newVerificationResults.push(v);
      console.log(`    -> status=${v.status} findings=${v.findings.length} semanticReviewInvoked=${v.semanticReviewInvoked}`);
    } catch (err) {
      console.error(`    -> FAILED (uncaught): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  preserve("stage7-new-verification-results", newVerificationResults);

  console.log("\n=== Combining reused + retried + new results into the full 38-candidate frozen sample ===");
  const reuseCompiled = priorCompiled.filter((c) => reuseRefs.includes(c.candidateRef));
  const reuseVerified = priorVerified.filter((v) => reuseRefs.includes(v.candidateRef));
  const allCompiledResults = [...reuseCompiled, ...newCompiledSummaries];
  const allVerificationResults = [...reuseVerified, ...newVerificationResults];
  preserve("combined-compiled-results", allCompiledResults);
  preserve("combined-verification-results", allVerificationResults);

  const verifiedCandidateRefs = new Set(
    allVerificationResults
      .filter((v: any) => v.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || v.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS")
      .map((v: any) => v.candidateRef)
  );

  console.log("\n=== STAGE 8 (resume): whole-package semantic coverage audit over combined results ===");
  const coverageResult = await runSemanticCoverageAudit({
    companyId: COMPANY_ID,
    packageKey: PACKAGE_KEY,
    instrumentKey: INSTRUMENT_KEY,
    index,
    documents: DOCS.map((d) => ({ documentId: d.documentId })),
    discoveredCandidates: allCandidates,
    compiledResults: allCompiledResults.filter((c: any) => c.rules).map((c: any) => ({ candidateRef: c.candidateRef, rules: c.rules, definitions: c.definitions })),
    verifiedCandidateRefs,
    operativeState,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: compileCaller.providerName,
  });
  console.log(`  package status: ${coverageResult.packageCoverage.status}`);
  preserve("stage8-combined-coverage-result", coverageResult);

  const wallClockMs = Date.now() - runStart;
  const finalSummary = {
    runId: "PHASE_3F_2_RIOT_RESUME_RUN",
    finishedAt: new Date().toISOString(),
    wallClockMs,
    priorSpendUsd: PRIOR_SPEND_USD,
    totalCostUsd: runningCostUsd,
    incrementalResumeCostUsd: runningCostUsd - PRIOR_SPEND_USD,
    budgetCeilingUsd: BUDGET_CEILING_USD,
    provider: compileCaller.providerName,
    model: compileCaller.model,
    reuseCount: reuseCompiled.length,
    retriedCount: retryRefs.length,
    newAttemptedCount: newCompiledSummaries.length,
    totalCombinedCompiled: allCompiledResults.length,
    totalCombinedVerified: allVerificationResults.length,
    totalCombinedFullyVerified: verifiedCandidateRefs.size,
    packageCoverageStatus: coverageResult.packageCoverage.status,
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
