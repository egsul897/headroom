import { readFileSync, writeFileSync } from "node:fs";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import type { DetectedReference } from "../lib/contract-model/compiler/structural-references";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { PackageGraphResult } from "../lib/contract-model/compiler/package-graph/types";
import type { OperativeContractState } from "../lib/contract-model/compiler/amendment/types";

const COMPANY_ID = "riot-phase-3f2-unseen";
const PACKAGE_KEY = "riot-2025-2026-coinbase-credit-facility";
const INSTRUMENT_KEY = "riot-coinbase-credit-facility-instrument";
const SRC_DIR = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text";
const FROZEN_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run";
const OUT_DIR = "tests/fixtures/unseen-packages/post-3f2-riot-regression-replay";
const TARGET_ID = "discovery-candidate:ae1291f397735dffa79d3f52";

const DOCS = [
  { documentId: "doc-a", file: "doc-a-2025-04-22-credit-agreement.txt" },
  { documentId: "doc-b", file: "doc-b-2025-05-19-amended-restated-credit-agreement.txt" },
  { documentId: "doc-c", file: "doc-c-2026-04-21-second-amended-restated-credit-agreement.txt" },
];
function loadFrozen<T>(name: string): T {
  return JSON.parse(readFileSync(`${FROZEN_DIR}/${name}.json`, "utf-8")) as T;
}
async function main() {
  const allNodes = loadFrozen<StructuralNode[]>("stage1-all-nodes");
  const allDefinitions = loadFrozen<DetectedDefinition[]>("stage1-all-definitions");
  const allReferences = loadFrozen<DetectedReference[]>("stage1-all-references");
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of DOCS) {
    const text = readFileSync(`${SRC_DIR}/${doc.file}`, "utf-8");
    nodesByDocument.set(doc.documentId, { text, nodes: allNodes.filter((n) => n.documentId === doc.documentId) });
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const allCandidates = loadFrozen<DiscoveredCandidate[]>("stage2-all-discovery-candidates");
  const packageGraph = loadFrozen<PackageGraphResult>("stage3-package-graph");
  const amendmentEffects = loadFrozen<any[]>("stage5-amendment-effects");
  const operativeState = loadFrozen<OperativeContractState>("stage5-operative-state");
  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }
  const access = { index, packageGraph, exactTermsByDocument };
  const candidate = allCandidates.find((c) => c.discoveryId === TARGET_ID);
  if (!candidate) throw new Error("not found");
  const bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access);
  const operativeSourceText = candidate.structuralNodeKeys.map((k: string) => index.getNodeText(k, "DESCENDANTS")).join("\n\n");
  const compileCaller = getSemanticCaller();
  if (compileCaller.isSynthetic) throw new Error("synthetic caller");
  const compilerInput: SemanticCompilerInput = {
    companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, sourceDocumentId: candidate.documentId, candidateRef: candidate.discoveryId,
    sourceSectionRef: candidate.normalizedSourceRef, operativeSourceText, contextBundle: bundle, operativeLineage: null,
    toolAccess: { structuralIndex: index, operativeState, packageGraph, amendmentEffects, contextBundle: bundle },
    irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
  };
  const result = await compileCovenantToIR(compilerInput, { caller: compileCaller });
  console.log("cost", result.telemetry);
  let verification = null;
  if (result.status !== "FAILED") {
    verification = await verifyCompiledCandidate({ compilerInput, compilationResult: result }, { reviewCaller: getStageCaller() });
  }
  const record = { targetCandidateId: TARGET_ID, note: "doc-c Section 1.01 ACTUAL definitions candidate (corrected from prior wrong ID)", documentId: candidate.documentId, normalizedSourceRef: candidate.normalizedSourceRef,
    compileResult: { status: result.status, rules: result.rules, definitions: result.definitions, failureReasons: (result as any).failureReasons ?? null, definitionCompletenessCheck: (result as any).definitionCompletenessCheck ?? null, toolCallLogTruncationFlags: (result as any).toolCallLog?.map((t: any) => ({ tool: t.toolName, evidenceTruncated: t.evidenceTruncated })) ?? null },
    verificationResult: verification };
  writeFileSync(`${OUT_DIR}/discovery-candidate-ae1291f397735dffa79d3f52.json`, JSON.stringify(record, null, 2));
  console.log("status", result.status, "defs", result.definitions.length, "rules", result.rules.length);
  console.log("terms", result.definitions.map((d:any)=>d.termName));
}
main().catch((e) => { console.error(e); process.exit(1); });
