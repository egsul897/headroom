/**
 * POST-3F.2 remediation - Riot regression replay (mission Sections 23-26).
 * This is REGRESSION ONLY: reuses the frozen Phase 3F.2 Stage 1-5 output
 * (structural index, discovery candidates, package graph, amendment
 * effects, operative state) and the frozen source documents byte-for-byte
 * - never re-adjudicates ground truth, never alters thresholds, never
 * selects new evidence. Only the CODE under test changed (Unit A semantic-
 * compiler + Unit B package-graph/amendment remediation); this script
 * measures old-frozen-evidence-through-new-code, nothing else.
 *
 * Deliberately bounded (never a full 38-candidate re-run): recompiles only
 * the 3 candidates whose ORIGINAL Phase 3F.2 results are the direct
 * subject of Unit A's fix (RGT-C-008/RGT-C-029/RGT-C-022 via
 * discovery-candidate:b33c341e3169731f00d02245, RGT-C-030 via
 * discovery-candidate:3b57707452b7d665665ea2f5) plus the frozen deleted-
 * carve-out safety check candidate (discovery-candidate:5913769a32bdcaf9212050ca,
 * mirroring scripts/phase-3f2-riot-carveout-check.ts). Unit B's package-
 * graph/operative-document result is entirely deterministic (zero AI
 * cost) and is computed separately by scripts/post-3f2-riot-package-graph-replay.ts.
 *
 * Run via: (credential injected process-locally, never persisted)
 *   AI_GATEWAY_API_KEY="$KEY" npx tsx scripts/post-3f2-riot-regression-replay.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
const BUDGET_CEILING_USD = 15;

const SRC_DIR = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text";
const FROZEN_DIR = "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run";
const OUT_DIR = "tests/fixtures/unseen-packages/post-3f2-riot-regression-replay";

const DOCS = [
  { documentId: "doc-a", file: "doc-a-2025-04-22-credit-agreement.txt" },
  { documentId: "doc-b", file: "doc-b-2025-05-19-amended-restated-credit-agreement.txt" },
  { documentId: "doc-c", file: "doc-c-2026-04-21-second-amended-restated-credit-agreement.txt" },
];

const TARGETS = [
  { id: "discovery-candidate:b33c341e3169731f00d02245", note: "doc-a Section 1.01 - RGT-C-008 (Final Maturity Date), RGT-C-029 (Collateral Documents), RGT-C-022 (Day Count Fraction qualifier/truncation)" },
  { id: "discovery-candidate:3b57707452b7d665665ea2f5", note: "doc-c Section 1.01 - RGT-C-030 (Collateral Documents / Security Confirmation / Second Security Confirmation)" },
  { id: "discovery-candidate:5913769a32bdcaf9212050ca", note: "doc-a Section 6.01(d) - frozen deleted-carve-out safety check (mission Section 25)" },
];

function loadFrozen<T>(name: string): T {
  return JSON.parse(readFileSync(`${FROZEN_DIR}/${name}.json`, "utf-8")) as T;
}

let runningCostUsd = 0;
function logCost(stage: string, telemetry: { calculatedCostUsd?: number | null } | null | undefined) {
  const cost = telemetry?.calculatedCostUsd ?? 0;
  runningCostUsd += cost;
  console.log(`  [cost] ${stage}: +$${cost.toFixed(4)} (running total: $${runningCostUsd.toFixed(4)} / $${BUDGET_CEILING_USD} ceiling)`);
  if (runningCostUsd > BUDGET_CEILING_USD) throw new Error("POST_3F2_REMEDIATION_COST_BLOCKED - exceeded $15 ceiling mid-run");
}

async function main() {
  console.log("================ POST_3F2_RIOT_REGRESSION_REPLAY ================");
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

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const results: any[] = [];
  for (const target of TARGETS) {
    const candidate = allCandidates.find((c) => c.discoveryId === target.id);
    if (!candidate) throw new Error(`Target candidate ${target.id} not found in preserved discovery output`);
    console.log(`\n=== ${target.id} (${target.note}) ===`);

    const bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access);
    const operativeSourceText = candidate.structuralNodeKeys.map((k: string) => index.getNodeText(k, "DESCENDANTS")).join("\n\n");

    const compileCaller = getSemanticCaller();
    if (compileCaller.isSynthetic) throw new Error("FATAL: synthetic caller detected - real credential required for this replay");
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
    const result = await compileCovenantToIR(compilerInput, { caller: compileCaller });
    logCost(`compile ${target.id}`, result.telemetry);

    let verification = null;
    if (result.status !== "FAILED") {
      const verifyCaller = getStageCaller();
      verification = await verifyCompiledCandidate({ compilerInput, compilationResult: result }, { reviewCaller: verifyCaller });
      logCost(`verify ${target.id}`, (verification as any)?.telemetry);
    }

    const record = {
      targetCandidateId: target.id,
      note: target.note,
      documentId: candidate.documentId,
      normalizedSourceRef: candidate.normalizedSourceRef,
      compileResult: {
        status: result.status,
        rules: result.rules,
        definitions: result.definitions,
        failureReasons: (result as any).failureReasons ?? null,
        definitionCompletenessCheck: (result as any).definitionCompletenessCheck ?? null,
        toolCallLogTruncationFlags: (result as any).toolCallLog?.map((t: any) => ({ tool: t.toolName, evidenceTruncated: t.evidenceTruncated })) ?? null,
      },
      verificationResult: verification,
    };
    results.push(record);
    writeFileSync(`${OUT_DIR}/${target.id.replace(/[^a-z0-9]/gi, "-")}.json`, JSON.stringify(record, null, 2));
    console.log(`  status=${result.status} definitions=${result.definitions.length} rules=${result.rules.length}`);
  }

  writeFileSync(`${OUT_DIR}/replay-summary.json`, JSON.stringify({ generatedAt: new Date().toISOString(), totalCostUsd: runningCostUsd, results }, null, 2));
  console.log(`\nTotal replay cost: $${runningCostUsd.toFixed(4)}`);
  console.log("Preserved to", OUT_DIR);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
