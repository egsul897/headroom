/**
 * PHASE 3 SINGLE REAL-WORLD UNSEEN VALIDATION - Chewy, Inc. Credit Agreement (2026-06-23).
 * PAID STAGES ONLY, executing docs/phase-3-validation/09-paid-run-manifest.json unchanged:
 *   2B whole-document semantic discovery -> unit selection (exclude TOC units, rank body units by 2A signal
 *   count, top 12) -> per unit: compileCovenantToIR (Pass A run 1 + Pass B composition + Pass C reconciliation,
 *   frozen production code) -> standalone Pass A run 2 on the IDENTICAL resolved source context (stability) ->
 *   3C independent verifier -> 3E coverage audit with Layer C (bounded AI inventory).
 * Hard budget: every model call is pre-checked against the remaining budget (abort-before-call) and every
 * call's real token usage is ledgered with the production rate card. Evidence is never rewritten.
 * Run: npx tsx scripts/phase-3-validation-chwy-paid-run.ts [--cap 14]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) {
  try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch {}
}
import Anthropic from "@anthropic-ai/sdk";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { runDiscoveryPipeline } from "../lib/contract-model/compiler/discovery/pipeline";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { calculateCostUsd, type AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import { computeProductionTreeHash } from "./semantic-accountability-freeze";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { ZodType } from "zod";

const COMPANY_ID = "phase-3-validation-chwy";
const PACKAGE_KEY = "chwy-2026-credit-agreement";
const INSTRUMENT_KEY = "chwy-2026-revolving-credit-instrument";
const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const DET_DIR = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run";
const MISSION_TREE_HASH = "da7106fac07c369695156cfa0c7d8a30350ea636c5e108060c0e84f67dd4d1ef";
const MANIFEST_HARD_BUDGET_USD = 20.0;
const UNIT_CAP = 12;
const TOC_END = 8980;
const DOC = { documentId: "doc-a", label: "Chewy, Inc. Credit Agreement (2026-06-23) - EX-10.1 to 8-K 0001193125-26-281042" };

function arg(name: string, fallback: string): string { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback; }
const EFFECTIVE_CAP_USD = Math.min(MANIFEST_HARD_BUDGET_USD, Number(arg("--cap", String(MANIFEST_HARD_BUDGET_USD))));

function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

// ---------------------------------------------------------------------------
// Budget ledger + abort-before-call guards (harness only - never production).
// ---------------------------------------------------------------------------
class BudgetExhaustedError extends Error { constructor(msg: string) { super(msg); this.name = "BudgetExhaustedError"; } }
const ASSUMED_OUTPUT_TOKENS = 12_000;
const CHARS_PER_TOKEN = 3.2;
interface LedgerEntry { n: number; stage: string; model: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number; estimatedBeforeCallUsd: number; at: string }
const ledger: { cap: number; spent: number; calls: LedgerEntry[]; refusals: { stage: string; estimatedUsd: number; spentUsd: number; at: string }[] } = { cap: EFFECTIVE_CAP_USD, spent: 0, calls: [], refusals: [] };
function estimateUsd(inputChars: number, model: string): number { return calculateCostUsd(Math.ceil(inputChars / CHARS_PER_TOKEN), ASSUMED_OUTPUT_TOKENS, model) ?? 0; }
function guard(stage: string, inputChars: number, model: string): number {
  const est = estimateUsd(inputChars, model);
  if (ledger.spent + est > ledger.cap) {
    ledger.refusals.push({ stage, estimatedUsd: est, spentUsd: ledger.spent, at: new Date().toISOString() });
    throw new BudgetExhaustedError(`BUDGET_EXHAUSTED before ${stage}: spent $${ledger.spent.toFixed(4)} + est $${est.toFixed(4)} > cap $${ledger.cap.toFixed(2)}`);
  }
  return est;
}
function record(stage: string, model: string, inputTokens: number, outputTokens: number, cacheRead: number, cacheWrite: number, est: number) {
  const cost = calculateCostUsd(inputTokens + cacheRead + cacheWrite, outputTokens, model) ?? 0;
  ledger.spent += cost;
  ledger.calls.push({ n: ledger.calls.length + 1, stage, model, inputTokens, outputTokens, cacheRead, cacheWrite, costUsd: cost, estimatedBeforeCallUsd: est, at: new Date().toISOString() });
  console.log(`  [cost] ${stage}: in=${inputTokens} out=${outputTokens} +$${cost.toFixed(4)} (spent $${ledger.spent.toFixed(4)} / cap $${ledger.cap.toFixed(2)})`);
}

class GuardedStageCaller implements StageCaller {
  providerName: string; model: string; isSynthetic = false;
  constructor(private inner: StageCaller, private label: string) { this.providerName = inner.providerName; this.model = inner.model; }
  async call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T> {
    const est = guard(`${this.label}:${stage}`, systemPrompt.length + userContent.length, this.model);
    const out = await this.inner.call(schema, stage, systemPrompt, userContent);
    const t = this.inner.lastTelemetry();
    record(`${this.label}:${stage}`, this.model, t?.inputTokens ?? Math.ceil((systemPrompt.length + userContent.length) / CHARS_PER_TOKEN), t?.outputTokens ?? ASSUMED_OUTPUT_TOKENS, t?.cachedInputTokens ?? 0, t?.cacheCreationInputTokens ?? 0, est);
    return out;
  }
  lastTelemetry(): AnalyzerCallTelemetry | null { return this.inner.lastTelemetry(); }
}

function guardedClient(real: Anthropic, label: string): MinimalAnthropicClient {
  return {
    messages: {
      stream: (params) => {
        const inputChars = params.system.length + JSON.stringify(params.messages).length + JSON.stringify(params.tools).length;
        const est = guard(`${label}:turn`, inputChars, params.model);
        return {
          finalMessage: async () => {
            const m = await real.messages.stream(params as never).finalMessage();
            const u = m.usage as unknown as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
            record(`${label}:turn`, params.model, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, est);
            return m;
          },
        };
      },
    },
  };
}

async function gatewayCredits(): Promise<{ balance: string; total_used: string } | null> {
  try { const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` } }); return r.ok ? ((await r.json()) as { balance: string; total_used: string }) : null; } catch { return null; }
}

async function main() {
  console.log(`================ PHASE_3_VALIDATION_CHWY_PAID_RUN ================`);
  console.log(`Started: ${new Date().toISOString()}  manifest cap $${MANIFEST_HARD_BUDGET_USD}  effective cap $${EFFECTIVE_CAP_USD}`);
  if (existsSync(OUT_DIR)) throw new Error(`FATAL: ${OUT_DIR} already exists - evidence is never rewritten`);
  const freeze = computeProductionTreeHash();
  if (freeze.treeHash !== MISSION_TREE_HASH) throw new Error(`FATAL: production tree hash ${freeze.treeHash} != mission freeze ${MISSION_TREE_HASH}`);
  console.log(`  production tree hash ${freeze.treeHash.slice(0, 16)} (${freeze.fileCount} files) == mission freeze`);
  const creditsBefore = await gatewayCredits();
  console.log(`  gateway credits before: ${JSON.stringify(creditsBefore)}`);

  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  const stageCaller = new GuardedStageCaller(getStageCaller(), "stage");
  const inventoryCaller1 = new GuardedStageCaller(getStageCaller(), "passA-run1");
  const inventoryCaller2 = new GuardedStageCaller(getStageCaller(), "passA-run2");
  const verifyCaller = new GuardedStageCaller(getStageCaller(), "verify");
  const layerCCaller = new GuardedStageCaller(getStageCaller(), "3E-layerC");
  if (stageCaller.isSynthetic || (stageCaller.providerName as string) === "synthetic") throw new Error("FATAL: no real credential");
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), "compile"));
  console.log(`  stage model=${stageCaller.model} compiler model=${semanticCaller.model}`);

  // Deterministic inputs (recomputed in-process; asserted identical to the preserved deterministic run).
  const text = readFileSync(SRC, "utf-8");
  const structure = runStructureStage([{ documentId: DOC.documentId, label: DOC.label, text }]);
  const allNodes: StructuralNode[] = structure.output;
  const defs = detectStructuralDefinitions(DOC.documentId, text, allNodes);
  const refs = detectStructuralReferences(DOC.documentId, text, allNodes);
  const index = buildStructuralIndex(new Map([[DOC.documentId, { text, nodes: allNodes }]]), defs, refs);
  const detSummary = JSON.parse(readFileSync(`${DET_DIR}/stage1-structural-summary.json`, "utf-8"));
  if (detSummary.totalNodes !== allNodes.length || detSummary.definitionsDetected !== defs.length || detSummary.referencesDetected !== refs.length) throw new Error(`FATAL: deterministic structure drifted from preserved run (${allNodes.length}/${defs.length}/${refs.length} vs ${detSummary.totalNodes}/${detSummary.definitionsDetected}/${detSummary.referencesDetected})`);
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, [{ documentId: DOC.documentId, label: DOC.label, text }]);
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: DOC.documentId, asOfDate: new Date().toISOString().slice(0, 10), index, allEffects: [] });
  const exactTermsByDocument = new Map<string, Map<string, string>>([[DOC.documentId, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm]))]]);
  const access = { index, packageGraph, exactTermsByDocument };
  const startedAt = new Date().toISOString();

  // ---- Stage A: 2B whole-document semantic discovery.
  console.log("\n=== STAGE A: 2B whole-document semantic discovery ===");
  let discovery: Awaited<ReturnType<typeof runDiscoveryPipeline>> | null = null;
  let discoveryError: string | null = null;
  const spentBefore2B = ledger.spent;
  try { discovery = await runDiscoveryPipeline(stageCaller, DOC.documentId, index); } catch (e) { discoveryError = e instanceof Error ? e.message : String(e); console.log(`  2B FAILED: ${discoveryError}`); }
  if (discovery) {
    console.log(`  candidates=${discovery.candidates.length} sectionsAttempted=${discovery.summary.sectionsAttempted} failures=${discovery.summary.sectionFailures.length} health=${discovery.summary.documentDiscoveryHealth} modelCalls=${discovery.summary.modelCalls}`);
    preserve("stage2b-discovery", { summary: discovery.summary, costUsd: ledger.spent - spentBefore2B, candidates: discovery.candidates });
  } else preserve("stage2b-discovery", { error: discoveryError, costUsd: ledger.spent - spentBefore2B });
  const discoveredCandidates = discovery?.candidates ?? [];

  // ---- Unit selection (manifest rule): exclude TOC units, rank body units by 2A signal count, top 12.
  const detUnits: { sectionRef: string; charStart: number; charEnd: number; chars: number; deterministicSignals: number; heading: string }[] = JSON.parse(readFileSync(`${DET_DIR}/stage4-6pre-units.json`, "utf-8"));
  const ranked = detUnits.filter((u) => u.charEnd > TOC_END).sort((a, b) => b.deterministicSignals - a.deterministicSignals || a.charStart - b.charStart);
  const selected = ranked.slice(0, UNIT_CAP);
  preserve("unit-selection", { rule: "exclude TOC units (charEnd <= 8980); rank body units by 2A deterministic signal count (desc, then document order); take top 12", ranked: ranked.slice(0, 20).map((u, i) => ({ rank: i + 1, ...u, selected: i < UNIT_CAP })) });
  console.log(`\n=== UNITS (rank order): ${selected.map((u) => u.sectionRef).join(", ")} ===`);

  const unitSummaries: Record<string, unknown>[] = [];
  const compiledResults: { candidateRef: string; rules: never[]; definitions: never[] }[] = [];
  const verifiedCandidateRefs = new Set<string>();
  const sectionNodes = allNodes.filter((n) => n.nodeType === "SECTION" && n.charStart >= TOC_END);

  for (const [i, u] of selected.entries()) {
    const sec = sectionNodes.find((n) => n.sectionRef === u.sectionRef && n.charStart === u.charStart);
    if (!sec) { unitSummaries.push({ rank: i + 1, sectionRef: u.sectionRef, error: "section node not found" }); continue; }
    const candidateRef = `phase-3-validation:chwy:${sec.sectionRef}`;
    console.log(`\n=== UNIT ${i + 1}/${selected.length}: ${sec.sectionRef} ${sec.heading.slice(0, 50)} chars=${u.chars} signals=${u.deterministicSignals} (spent $${ledger.spent.toFixed(4)}) ===`);
    if (ledger.spent >= ledger.cap - 0.05) { console.log("  [budget] cap reached - unit not attempted"); unitSummaries.push({ rank: i + 1, sectionRef: sec.sectionRef, candidateRef, status: "NOT_ATTEMPTED_BUDGET_EXHAUSTED" }); continue; }
    const operativeSourceText = index.getNodeText(sec.nodeId, "DESCENDANTS");
    const discoveredInSection = discoveredCandidates.filter((c) => c.structuralNodeIds.some((id) => { const n = index.getNodeById(id); return n && n.charStart >= sec.charStart && n.charEnd <= sec.charEnd; }));
    const candidate = { discoveryId: candidateRef, documentId: DOC.documentId, structuralNodeKeys: [sec.nodeKey], structuralNodeIds: [sec.nodeId], normalizedSourceRef: sec.sectionRef, families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: sec.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: operativeSourceText.slice(0, 200), discoveryRunVersion: "phase-3-validation.paid.v1", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "single-document package, no amendment effects", valueAnchors: [] } as unknown as DiscoveredCandidate;
    let bundle; let bundleError: string | null = null;
    try { bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access); } catch (e) { bundleError = e instanceof Error ? e.message : String(e); bundle = { items: [], unresolvedDependencies: [], sufficiencyState: "INCOMPLETE" } as unknown as ReturnType<typeof buildCovenantContextBundle>; }
    const compilerInput: SemanticCompilerInput = { companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, sourceDocumentId: DOC.documentId, candidateRef, sourceSectionRef: sec.sectionRef, operativeSourceText, operativeCharStart: sec.charStart, contextBundle: bundle, operativeLineage: null, toolAccess: { structuralIndex: index, operativeState, packageGraph, amendmentEffects: [], contextBundle: bundle }, irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };

    const spentAtUnitStart = ledger.spent;
    const stageOutcome: Record<string, string> = {};
    // Pass A run 1 + Pass B + Pass C (frozen compileCovenantToIR).
    let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null;
    const spentBeforeCompile = ledger.spent;
    try { compileResult = await compileCovenantToIR(compilerInput, { caller: semanticCaller, inventoryCaller: inventoryCaller1, cache: new InMemorySemanticCompilationCache() }); stageOutcome.compile = compileResult.status; }
    catch (e) { stageOutcome.compile = `THREW: ${e instanceof Error ? e.message : String(e)}`; }
    const compileCost = ledger.spent - spentBeforeCompile;
    if (compileResult) {
      const sc = compileResult.sourceContext; const inv = compileResult.frozenInventory; const acc = compileResult.accountability;
      console.log(`  -> source context ${sc?.state} regions=${sc?.regions.length} unitChars=${sc?.regions[0]?.text.length} | inventory ${inv?.inventoryStatus} items=${inv?.items.length} | compile ${compileResult.status} rules=${compileResult.rules.length} defs=${compileResult.definitions.length} sharedCaps=${compileResult.sharedCapacities.length} failures=${JSON.stringify(compileResult.failureReasons)}`);
      if (acc) console.log(`  -> accountability complete=${acc.semanticallyComplete} material=${acc.counts.material} represented=${acc.counts.represented} missing=${acc.counts.missingFromComposition} (material ${acc.counts.materialMissingFromComposition}, critical ${acc.counts.criticalMissingFromComposition})`);
      compiledResults.push({ candidateRef, rules: compileResult.rules as never[], definitions: compileResult.definitions as never[] });
    }
    // Pass A run 2: identical configuration - the SAME resolved source context object the compile used.
    let inventoryRun2 = null; const spentBeforeRun2 = ledger.spent;
    if (compileResult?.sourceContext && compileResult.frozenInventory?.inventoryStatus !== "INVENTORY_FAILED") {
      try { inventoryRun2 = await runSemanticInventory({ candidateRef, documentId: DOC.documentId, sourceContext: compileResult.sourceContext, caller: inventoryCaller2 }); stageOutcome.passARun2 = inventoryRun2.inventoryStatus; console.log(`  -> Pass A run 2: ${inventoryRun2.inventoryStatus} items=${inventoryRun2.items.length} (run 1 items=${compileResult.frozenInventory?.items.length})`); }
      catch (e) { stageOutcome.passARun2 = `THREW: ${e instanceof Error ? e.message : String(e)}`; }
    } else stageOutcome.passARun2 = "SKIPPED_NO_SOURCE_CONTEXT_OR_RUN1_FAILED";
    const run2Cost = ledger.spent - spentBeforeRun2;
    // 3C independent verifier on the resolved operative unit.
    let verifyResult = null; let verifierOperativeSource: "RESOLVED_UNIT" | "SUPPLIED_WINDOW" = "SUPPLIED_WINDOW"; const spentBeforeVerify = ledger.spent;
    if (compileResult && compileResult.status !== "FAILED") {
      const op = compileResult.sourceContext?.regions[0];
      const verifierInput: SemanticCompilerInput = op && op.text !== operativeSourceText ? { ...compilerInput, operativeSourceText: op.text, operativeCharStart: op.charStart, sourceContext: undefined, frozenInventory: undefined } : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
      if (op && op.text !== operativeSourceText) verifierOperativeSource = "RESOLVED_UNIT";
      try { verifyResult = await verifyCompiledCandidate({ compilerInput: verifierInput, compilationResult: compileResult }, { reviewCaller: verifyCaller }); stageOutcome.verify = verifyResult.status; console.log(`  -> verify ${verifyResult.status} findings=${verifyResult.findings.length} material=${verifyResult.findings.filter((f) => f.severity === "MATERIAL").length} reviewInvoked=${verifyResult.semanticReviewInvoked}`); if (verifyResult.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || verifyResult.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS") verifiedCandidateRefs.add(candidateRef); }
      catch (e) { stageOutcome.verify = `THREW: ${e instanceof Error ? e.message : String(e)}`; }
    } else stageOutcome.verify = "SKIPPED_COMPILE_FAILED_OR_ABSENT";
    const verifyCost = ledger.spent - spentBeforeVerify;
    preserve(`unit-${sec.sectionRef}`, { rank: i + 1, unit: { sectionRef: sec.sectionRef, heading: sec.heading, nodeId: sec.nodeId, nodeKey: sec.nodeKey, charStart: sec.charStart, charEnd: sec.charEnd, chars: operativeSourceText.length, deterministicSignals: u.deterministicSignals, discoveredCandidatesInSection: discoveredInSection.map((c) => ({ discoveryId: c.discoveryId, role: c.role, families: c.families, normalizedSourceRef: c.normalizedSourceRef })) }, candidateRef, contextBundle: { items: bundle.items.length, sufficiencyState: bundle.sufficiencyState, unresolvedDependencies: bundle.unresolvedDependencies.length, error: bundleError }, stageOutcome, compile: compileResult, inventoryRun2, verify: verifyResult, verifierOperativeSource, costUsd: { compileInclPassARun1: compileCost, passARun2: run2Cost, verify: verifyCost, total: ledger.spent - spentAtUnitStart } });
    unitSummaries.push({ rank: i + 1, sectionRef: sec.sectionRef, candidateRef, chars: operativeSourceText.length, stageOutcome, sourceContextState: compileResult?.sourceContext?.state ?? null, unitChars: compileResult?.sourceContext?.regions[0]?.text.length ?? null, inventoryRun1: compileResult?.frozenInventory ? { status: compileResult.frozenInventory.inventoryStatus, items: compileResult.frozenInventory.items.length, hash: compileResult.frozenInventory.frozenContentHash } : null, inventoryRun2: inventoryRun2 ? { status: inventoryRun2.inventoryStatus, items: inventoryRun2.items.length, hash: inventoryRun2.frozenContentHash } : null, compileStatus: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, rules: compileResult?.rules.length ?? null, definitions: compileResult?.definitions.length ?? null, sharedCapacities: compileResult?.sharedCapacities.length ?? null, accountability: compileResult?.accountability ? { semanticallyComplete: compileResult.accountability.semanticallyComplete, counts: compileResult.accountability.counts } : null, verifyStatus: verifyResult?.status ?? null, materialFindings: verifyResult ? verifyResult.findings.filter((f) => f.severity === "MATERIAL").length : null, costUsd: ledger.spent - spentAtUnitStart });
  }

  // ---- 3E coverage audit with Layer C (budget-guarded).
  console.log(`\n=== STAGE 3E: coverage audit (Layers A/B + guarded Layer C) spent $${ledger.spent.toFixed(4)} ===`);
  const spentBefore3E = ledger.spent;
  let coverage = null; let coverageError: string | null = null;
  try {
    coverage = await runSemanticCoverageAudit({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, instrumentKey: INSTRUMENT_KEY, index, documents: [{ documentId: DOC.documentId }], discoveredCandidates, compiledResults: compiledResults as never, verifiedCandidateRefs, operativeState, operativeVersionRef: null, aiCaller: layerCCaller, structuralParserVersion: "phase-2a-structural-index", providerIdentity: `vercel-ai-gateway::${model}` });
    const pc = coverage.packageCoverage;
    console.log(`  package status ${pc.status}; layerC failed=${coverage.documentDetails[0]?.aiInventoryFailed} rejectedQuotes=${coverage.documentDetails[0]?.aiInventoryRejectedQuotes}`);
    for (const r of pc.statusReasons.slice(0, 8)) console.log(`   - ${r}`);
    preserve("stage3e-coverage", { costUsd: ledger.spent - spentBefore3E, layerCRefusals: ledger.refusals.filter((r) => r.stage.startsWith("3E")).length, packageCoverage: pc, documentDetails: coverage.documentDetails });
  } catch (e) { coverageError = e instanceof Error ? e.message : String(e); console.log(`  3E FAILED: ${coverageError}`); preserve("stage3e-coverage", { error: coverageError, costUsd: ledger.spent - spentBefore3E }); }

  const creditsAfter = await gatewayCredits();
  preserve("cost-ledger", { ...ledger, creditsBefore, creditsAfter, gatewayReportedSpendUsd: creditsBefore && creditsAfter ? Number(creditsAfter.total_used) - Number(creditsBefore.total_used) : null });
  preserve("run-summary", { runId: "PHASE_3_VALIDATION_CHWY_PAID", startedAt, finishedAt: new Date().toISOString(), productionSha: null, productionTreeHash: freeze.treeHash, manifestHardBudgetUsd: MANIFEST_HARD_BUDGET_USD, effectiveCapUsd: EFFECTIVE_CAP_USD, spentUsdRateCard: ledger.spent, gatewayReportedSpendUsd: creditsBefore && creditsAfter ? Number(creditsAfter.total_used) - Number(creditsBefore.total_used) : null, paidModelCalls: ledger.calls.length, budgetRefusals: ledger.refusals.length, models: { stage: stageCaller.model, compiler: semanticCaller.model }, versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, irSchema: IR_SCHEMA_VERSION }, discovery: discovery ? { ...discovery.summary, sectionFailures: discovery.summary.sectionFailures.length } : { error: discoveryError }, selectedUnits: selected.map((u) => u.sectionRef), units: unitSummaries, coverageStatus: coverage?.packageCoverage.status ?? null, coverageError, layerCFailed: coverage?.documentDetails[0]?.aiInventoryFailed ?? null });
  console.log(`\n================ DONE spent $${ledger.spent.toFixed(4)} calls=${ledger.calls.length} refusals=${ledger.refusals.length} ================`);
}
main().catch((e) => { console.error("FATAL", e); preserve("fatal-error", { message: e instanceof Error ? e.message : String(e), ledger }); process.exit(1); });
