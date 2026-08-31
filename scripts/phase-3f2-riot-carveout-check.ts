/**
 * Phase 3F.2 resume S16 special check - one targeted additional compile+
 * verify of the pre-identified doc-a Section 6.01(d) EXCEPTION carve-out
 * candidate (discovery-candidate:5913769a32bdcaf9212050ca), the same
 * provision both independent blind ground-truth reviewers flagged (before
 * any Headroom compilation occurred) as present verbatim in doc-a/doc-b and
 * silently deleted in doc-c. This candidate was NOT in the deterministic
 * stratified sample - added here because the governing resume spec (S16)
 * explicitly requires evaluating Headroom's handling of this pre-existing,
 * pre-identified GT test case, not because any compile result was already
 * observed (none had been, for this specific candidate, before this script
 * ran).
 */
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
const TARGET_ID = "discovery-candidate:5913769a32bdcaf9212050ca";

const SRC_DIR = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text";
const FROZEN_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-resume-run";

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
  if (!candidate) throw new Error(`Target candidate ${TARGET_ID} not found in preserved discovery output`);
  console.log("Target candidate:", JSON.stringify({ documentId: candidate.documentId, normalizedSourceRef: candidate.normalizedSourceRef, role: candidate.role, sourceCitation: candidate.sourceCitation }, null, 2));

  const bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access);
  const operativeSourceText = candidate.structuralNodeKeys.map((k: string) => index.getNodeText(k, "DESCENDANTS")).join("\n\n");
  console.log("Operative source text:\n", operativeSourceText);

  const compileCaller = getSemanticCaller();
  if (compileCaller.isSynthetic) throw new Error("FATAL: synthetic caller detected");
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
  console.log("Compiling...");
  const result = await compileCovenantToIR(compilerInput, { caller: compileCaller });
  console.log("Compile result:", JSON.stringify({ status: result.status, rules: result.rules, definitions: result.definitions, telemetry: result.telemetry }, null, 2));

  let verification = null;
  if (result.status !== "FAILED") {
    const verifyCaller = getStageCaller();
    console.log("Verifying...");
    verification = await verifyCompiledCandidate({ compilerInput, compilationResult: result }, { reviewCaller: verifyCaller });
    console.log("Verification result:", JSON.stringify(verification, null, 2));
  }

  writeFileSync(`${OUT_DIR}/carveout-special-check.json`, JSON.stringify({
    targetCandidateId: TARGET_ID,
    documentId: candidate.documentId,
    normalizedSourceRef: candidate.normalizedSourceRef,
    role: candidate.role,
    sourceCitation: candidate.sourceCitation,
    operativeSourceText,
    compileResult: { status: result.status, rules: result.rules, definitions: result.definitions, telemetry: result.telemetry },
    verificationResult: verification,
  }, null, 2));
  console.log("Preserved to carveout-special-check.json");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
