/** F-7A shared zero-cost helpers: the frozen Chewy units rebuilt as today's compile.ts caller input (no model call). */
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import type { MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";

export const CHWY_SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
export const CHWY_RUN = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run";
export const COMPANY = "phase-3-validation-chwy";
export const INSTRUMENT = "chwy-2026-revolving-credit-instrument";

export function buildChewy(): { text: string; index: StructuralIndex; access: { index: StructuralIndex; packageGraph: ReturnType<typeof buildPackageGraph>; exactTermsByDocument: Map<string, Map<string, string>> } } {
  const text = readFileSync(CHWY_SRC, "utf-8");
  const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
  const defs = detectStructuralDefinitions("doc-a", text, nodes);
  const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), defs, detectStructuralReferences("doc-a", text, nodes));
  const packageGraph = buildPackageGraph(COMPANY, "phase-3-validation-chwy-package", [{ documentId: "doc-a", label: "chwy", text }]);
  return { text, index, access: { index, packageGraph, exactTermsByDocument: new Map([["doc-a", new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm]))]]) } };
}

/** The exact caller input compile.ts hands RealSemanticCaller today (accountability on), for a frozen Chewy unit. */
export function buildChewyCallerInput(sectionRef: string, chewy: ReturnType<typeof buildChewy>): { unit: any; callerInput: SemanticCompilerInput } {
  const { text, index, access } = chewy;
  const unit = JSON.parse(readFileSync(`${CHWY_RUN}/unit-${sectionRef}.json`, "utf-8"));
  const sec = index.getNodeById(unit.unit.nodeId)!;
  const operativeSourceText = index.getNodeText(sec.nodeId, "DESCENDANTS");
  const candidate = { discoveryId: unit.candidateRef, documentId: "doc-a", structuralNodeKeys: [sec.nodeKey], structuralNodeIds: [sec.nodeId], normalizedSourceRef: sec.sectionRef, families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: sec.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: operativeSourceText.slice(0, 200), discoveryRunVersion: "phase-3-validation.paid.v1", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "single-document package, no amendment effects", valueAnchors: [] } as unknown as DiscoveredCandidate;
  const contextBundle = buildCovenantContextBundle({ candidate, packageKey: "phase-3-validation-chwy-package", companyId: COMPANY, instrumentKey: INSTRUMENT }, access);
  const input: SemanticCompilerInput = { companyId: COMPANY, instrumentKey: INSTRUMENT, sourceDocumentId: "doc-a", candidateRef: unit.candidateRef, sourceSectionRef: sectionRef, operativeSourceText, operativeCharStart: sec.charStart, contextBundle, operativeLineage: null, toolAccess: { structuralIndex: index, operativeState: null, packageGraph: access.packageGraph, amendmentEffects: [], contextBundle }, irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
  const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText, anchorNodeId: contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: sec.charStart, documentText: text });
  const region = sourceContext.regions[0]!;
  return { unit, callerInput: { ...input, operativeSourceText: region.text, operativeCharStart: region.charStart, sourceContext, frozenInventory: unit.compile.frozenInventory } };
}

export interface Captured { system: string; user: string; toolsJson: string }
/** A fake client that records the first turn the real caller would send and answers with an empty submit_compilation - no network. */
export function capturingClient(sink: Captured[]): MinimalAnthropicClient {
  return {
    messages: {
      stream: (params) => {
        const first = params.messages[0]!;
        sink.push({ system: params.system, user: typeof first.content === "string" ? first.content : JSON.stringify(first.content), toolsJson: JSON.stringify(params.tools) });
        const message = { id: "msg_capture", type: "message", role: "assistant", model: params.model, stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "toolu_capture", name: "submit_compilation", input: {} }], usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
        return { finalMessage: async () => message };
      },
    },
  };
}
