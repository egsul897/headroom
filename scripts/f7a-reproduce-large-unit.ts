/**
 * F-7A §1 - reproduces, with CURRENT production code and ZERO model calls, the exact first-turn compiler conversation
 * that compileCovenantToIR -> RealSemanticCaller.compile would send today for the frozen Chewy units (1.01, 6.08,
 * 9.04). The real caller is driven with a capturing fake client (no network): every byte the provider would receive
 * (system prompt, first user turn, tool schemas) is recorded and attributed to its component.
 *   npx tsx scripts/f7a-reproduce-large-unit.ts <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import type Anthropic from "@anthropic-ai/sdk";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import { RealSemanticCaller, renderAccountabilityContext, type MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import { buildFewShotExamplesBlock, buildSystemPrompt } from "../lib/contract-model/compiler/semantic/prompt";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const RUN = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run";
const out = process.argv[2] ?? "docs/phase-3-remediation-f7a";
mkdirSync(out, { recursive: true });
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const defs = detectStructuralDefinitions("doc-a", text, nodes);
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), defs, detectStructuralReferences("doc-a", text, nodes));
// The paid run's own package access (single document, no amendment effects): the context bundle is deterministic (no model).
const packageGraph = buildPackageGraph("phase-3-validation-chwy", "phase-3-validation-chwy-package", [{ documentId: "doc-a", label: "chwy", text }]);
const access = { index, packageGraph, exactTermsByDocument: new Map([["doc-a", new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm]))]]) };
const ledger = JSON.parse(readFileSync(`${RUN}/cost-ledger.json`, "utf-8")) as { calls: { n: number; stage: string; inputTokens: number; outputTokens: number; at: string }[] };
const compileTurns = ledger.calls.filter((c) => c.stage === "compile:turn");

interface Captured { system: string; user: string; toolsJson: string; maxTokens: number }
function capturingClient(sink: Captured[]): MinimalAnthropicClient {
  return {
    messages: {
      stream: (params) => {
        const first = params.messages[0]!;
        sink.push({ system: params.system, user: typeof first.content === "string" ? first.content : JSON.stringify(first.content), toolsJson: JSON.stringify(params.tools), maxTokens: params.max_tokens });
        const message = { id: "msg_capture", type: "message", role: "assistant", model: params.model, stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "toolu_capture", name: "submit_compilation", input: {} }], usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
        return { finalMessage: async () => message };
      },
    },
  };
}

async function reproduce(sectionRef: string) {
  const unit = JSON.parse(readFileSync(`${RUN}/unit-${sectionRef}.json`, "utf-8"));
  const frozen = unit.compile.frozenInventory;
  const recordedSc = unit.compile.sourceContext;
  // The frozen unit stores only a bundle SUMMARY (items count / sufficiency); the bundle itself is rebuilt exactly as the paid run built it (same synthesized section candidate) and checked against the summary.
  const sec = index.getNodeById(unit.unit.nodeId)!;
  const operativeSourceText = index.getNodeText(sec.nodeId, "DESCENDANTS");
  const candidate = { discoveryId: unit.candidateRef, documentId: "doc-a", structuralNodeKeys: [sec.nodeKey], structuralNodeIds: [sec.nodeId], normalizedSourceRef: sec.sectionRef, families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: sec.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: operativeSourceText.slice(0, 200), discoveryRunVersion: "phase-3-validation.paid.v1", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "single-document package, no amendment effects", valueAnchors: [] } as unknown as DiscoveredCandidate;
  const contextBundle = buildCovenantContextBundle({ candidate, packageKey: "phase-3-validation-chwy-package", companyId: "phase-3-validation-chwy", instrumentKey: "chwy-2026-revolving-credit-instrument" }, access);
  const bundleMatchesFrozenSummary = { items: [contextBundle.items.length, unit.contextBundle.items], sufficiency: [contextBundle.sufficiencyState, unit.contextBundle.sufficiencyState], unresolvedDependencies: [contextBundle.unresolvedDependencies.length, unit.contextBundle.unresolvedDependencies] };
  const input: SemanticCompilerInput = {
    companyId: "phase-3-validation-chwy",
    instrumentKey: "chwy-2026-revolving-credit-instrument",
    sourceDocumentId: "doc-a",
    candidateRef: unit.candidateRef,
    sourceSectionRef: sectionRef,
    operativeSourceText,
    operativeCharStart: unit.unit.charStart,
    contextBundle,
    operativeLineage: null,
    toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle },
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
  };
  // Exactly compile.ts's own construction of the caller input (accountability on): current-code source context, frozen inventory read-only.
  const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: input.operativeSourceText, anchorNodeId: contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: input.operativeCharStart ?? null, documentText: text });
  const operativeRegion = sourceContext.regions[0]!;
  const callerInput: SemanticCompilerInput = { ...input, operativeSourceText: operativeRegion.text, operativeCharStart: operativeRegion.charStart, sourceContext, frozenInventory: frozen };

  const sink: Captured[] = [];
  const caller = new RealSemanticCaller("capture", "capture-model", capturingClient(sink));
  const result = await caller.compile(callerInput);
  const cap = sink[0]!;

  const system = buildSystemPrompt({ irSchemaVersion: input.irSchemaVersion, toolPolicyVersion: input.toolPolicyVersion });
  const fewShot = buildFewShotExamplesBlock();
  const expansions = sourceContext.regions.filter((r) => r.kind !== "OPERATIVE");
  const expansionChars = expansions.reduce((a, r) => a + r.text.length, 0);
  const inventoryRendering = renderAccountabilityContext({ ...callerInput, sourceContext: null });
  const sourceContextRendering = renderAccountabilityContext({ ...callerInput, frozenInventory: null });
  const accountabilityRendering = renderAccountabilityContext(callerInput);
  const contextBundleChars = contextBundle.items.reduce((a: number, i: { excerptText: string }) => a + i.excerptText.length, 0);
  const bundleItems = contextBundle.items.map((i) => ({ type: i.type, sourceCitation: i.sourceCitation, chars: i.excerptText.length, duplicatesOperativeText: i.excerptText === operativeRegion.text || (i.excerptText.length > 1000 && operativeRegion.text.includes(i.excerptText)) }));
  const unresolvedDepsRendered = contextBundle.unresolvedDependencies.map((u) => `- ${u.dependencyType} (${u.severity}): ${u.reason}`).join("\n").length;
  const unresolvedXrefsRendered = sourceContext.unresolvedReferences.map((u) => `- "${u.referenceText}" -> ${u.status}: ${u.reason}`).join("\n").length;
  const otherUser = cap.user.length - operativeRegion.text.length - accountabilityRendering.length;
  const totalRendered = cap.system.length + cap.user.length + cap.toolsJson.length;
  const material = frozen.items.filter((i: { materiality: string }) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").length;
  const defsInUnit = index.allDefinitions().filter((d) => d.documentId === "doc-a" && d.charStart >= operativeRegion.charStart && d.charStart < operativeRegion.charEnd).length;
  const crossRefs = sourceContext.unresolvedReferences.length + expansions.length;
  return {
    sectionRef, candidateRef: unit.candidateRef,
    contextBundleMatchesFrozenSummary: bundleMatchesFrozenSummary,
    sourceContextMatchesFrozen: { state: sourceContext.state === recordedSc.state, regions: sourceContext.regions.length === recordedSc.regions.length, operativeChars: operativeRegion.text.length === recordedSc.regions[0].text.length, operativeTextSha256Equal: sha(operativeRegion.text) === sha(recordedSc.regions[0].text), unresolvedReferences: [sourceContext.unresolvedReferences.length, recordedSc.unresolvedReferences.length] },
    sourceContext: { state: sourceContext.state, regions: sourceContext.regions.length, totalChars: sourceContext.totalChars, budgetChars: sourceContext.budgetChars, unresolvedReferences: sourceContext.unresolvedReferences.length },
    frozenInventory: { items: frozen.items.length, material, algorithmVersion: frozen.algorithmVersion, inventoryStatus: frozen.inventoryStatus, unaccountedSource: frozen.unaccountedSource.length, uninventoriedValues: frozen.uninventoriedValues.length },
    definitionsInUnit: defsInUnit,
    crossReferences: { expansionRegions: expansions.length, unresolved: sourceContext.unresolvedReferences.length, total: crossRefs },
    contextBundle: { items: contextBundle.items.length, sufficiency: contextBundle.sufficiencyState, chars: contextBundleChars, itemsByType: bundleItems, unresolvedDependencies: contextBundle.unresolvedDependencies.length, unresolvedDependenciesRenderedChars: unresolvedDepsRendered, operativeTextDuplicatedByBundleItem: bundleItems.some((b) => b.duplicatesOperativeText) },
    otherBreakdown: { CONTEXT_BUNDLE_ITEM_EXCERPTS: contextBundleChars, CONTEXT_BUNDLE_UNRESOLVED_DEPENDENCIES: unresolvedDepsRendered, SOURCE_CONTEXT_UNRESOLVED_CROSS_REFERENCES: unresolvedXrefsRendered, PROMPT_SCAFFOLDING_AND_LABELS: otherUser + (sourceContextRendering.length - expansionChars) - contextBundleChars - unresolvedDepsRendered - unresolvedXrefsRendered },
    components: { OPERATIVE_SOURCE: operativeRegion.text.length, SOURCE_CONTEXT_EXPANSIONS: expansionChars, FROZEN_INVENTORY: inventoryRendering.length, SYSTEM_PROMPT: system.length, FEW_SHOT: fewShot.length, TOOL_SCHEMAS_JSON: cap.toolsJson.length, OTHER: otherUser + (sourceContextRendering.length - expansionChars) + (cap.system.length - system.length - fewShot.length) },
    rendered: { systemChars: cap.system.length, firstUserTurnChars: cap.user.length, toolsJsonChars: cap.toolsJson.length, totalFirstTurnChars: totalRendered, maxOutputTokensSetting: cap.maxTokens },
    recorded: { firstTurnInputTokens: null as number | null, outputTokens: null as number | null, compileStatus: unit.compile.status, failureReasons: unit.compile.failureReasons, rules: unit.compile.rules.length, definitions: unit.compile.definitions.length, rawSubmissionChars: unit.compile.rawModelOutput ? JSON.stringify(unit.compile.rawModelOutput).length : 0, telemetry: unit.compile.telemetry ? { inputTokens: unit.compile.telemetry.inputTokens, outputTokens: unit.compile.telemetry.outputTokens, latencyMs: unit.compile.telemetry.latencyMs, costUsd: unit.compile.telemetry.calculatedCostUsd, error: (unit.compile.telemetry.error ?? "").slice(0, 160) } : null },
    captureSanity: { callerReturnedSubmission: result.submission !== null, toolCallsMade: result.toolCallLog.length },
    _unitFile: `${RUN}/unit-${sectionRef}.json`, _unitSha256: sha(readFileSync(`${RUN}/unit-${sectionRef}.json`)),
  };
}

(async () => {
  const units = [];
  for (const ref of ["1.01", "6.08", "9.04"]) units.push(await reproduce(ref));
  // Recorded per-turn compiler input tokens from the cost ledger, in time order: 1.01 (1 turn), 6.08 (3 turns), 9.04 (1 turn).
  const turns = compileTurns.map((c) => ({ n: c.n, inputTokens: c.inputTokens, outputTokens: c.outputTokens, at: c.at }));
  const firstTurnFor: Record<string, number> = { "1.01": turns[0]!.inputTokens, "6.08": turns[1]!.inputTokens, "9.04": turns[4]!.inputTokens };
  const outputFor: Record<string, number> = { "1.01": turns[0]!.outputTokens, "6.08": turns[3]!.outputTokens, "9.04": turns[4]!.outputTokens };
  for (const u of units) { u.recorded.firstTurnInputTokens = firstTurnFor[u.sectionRef]!; u.recorded.outputTokens = outputFor[u.sectionRef]!; }
  const calibration = units.map((u) => ({ sectionRef: u.sectionRef, renderedChars: u.rendered.totalFirstTurnChars, recordedFirstTurnInputTokens: u.recorded.firstTurnInputTokens, tokensPerChar: u.recorded.firstTurnInputTokens! / u.rendered.totalFirstTurnChars, charsPerToken: u.rendered.totalFirstTurnChars / u.recorded.firstTurnInputTokens! }));
  const ratios = calibration.map((c) => c.tokensPerChar);
  const estimator = { method: "calibrated tokens-per-rendered-char from the three recorded Chewy first turns (cost-ledger compile:turn input tokens vs. the byte-exact first turn re-rendered by current code); the CONSERVATIVE (max) ratio is used for every estimate in F-7A", ratios: Object.fromEntries(calibration.map((c) => [c.sectionRef, c.tokensPerChar])), conservativeTokensPerChar: Math.max(...ratios), meanTokensPerChar: ratios.reduce((a, b) => a + b, 0) / ratios.length };
  for (const u of units) (u as unknown as Record<string, unknown>).estimatedInputTokens = { conservative: Math.round(u.rendered.totalFirstTurnChars * estimator.conservativeTokensPerChar), mean: Math.round(u.rendered.totalFirstTurnChars * estimator.meanTokensPerChar), recorded: u.recorded.firstTurnInputTokens };
  const record = { artifact: "F-7A §1 - current large-unit compiler shape, reproduced with current code and 0 model calls", gitSha: execSync("git rev-parse HEAD").toString().trim(), at: new Date().toISOString(), documentSha256: sha(text), ledgerCompileTurns: turns, units, tokenEstimator: estimator };
  writeFileSync(`${out}/00-current-large-unit-shape.json`, JSON.stringify(record, null, 1));
  console.log(JSON.stringify({ units: units.map((u) => ({ ref: u.sectionRef, comps: u.components, rendered: u.rendered, recorded: u.recorded.firstTurnInputTokens, out: u.recorded.outputTokens, est: (u as unknown as Record<string, unknown>).estimatedInputTokens, match: u.sourceContextMatchesFrozen, inv: u.frozenInventory, defs: u.definitionsInUnit, xrefs: u.crossReferences })), estimator }, null, 1));
})();
