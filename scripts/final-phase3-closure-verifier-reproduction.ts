/**
 * FINAL PHASE 3 CLOSURE - Unit B Section 11 investigation. Reconstructs the
 * REAL compilerInput (operativeSourceText + contextBundle) that the actual
 * frozen Superior run built for its FIRST failing verify candidate
 * (discovery-candidate:38b229b984193e98fa1586dc, doc-a::2.11), then re-runs
 * the real production verifier against it, to determine whether payload
 * size/shape (not a schema or wiring defect - already ruled out by the
 * clean small-fixture probe) explains the 13/13 VERIFICATION_FAILED
 * pattern. Stages 1/3/4 are free/deterministic and reused verbatim from
 * scripts/final-lightweight-unseen-run.ts's own logic.
 */
import { readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) {
  try {
    const envLocal = readFileSync(".env.local", "utf-8");
    const match = envLocal.match(/AI_GATEWAY_API_KEY=(.+)/);
    if (match) process.env.AI_GATEWAY_API_KEY = match[1]!.trim();
  } catch {}
}

import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { runAdversarialSemanticReview } from "../lib/contract-model/compiler/semantic-verification/reviewer";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { ReconciliationResult, VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const COMPANY_ID = "final-lightweight-unseen-sup-968ccc2b";
const PACKAGE_KEY = "sup-term-loan-2022-2025";
const INSTRUMENT_KEY = "sup-term-loan-instrument";
const SRC_DIR = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text";
const RUN_DIR = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup-run";
const TARGET_CANDIDATE_ID = "discovery-candidate:38b229b984193e98fa1586dc";

const DOCS = [
  { documentId: "doc-a", label: "Superior Industries International, Inc. Term Loan Credit Agreement (2022-12-15)", file: "doc-a-2022-12-15-term-loan-credit-agreement.txt" },
  { documentId: "doc-b", label: "Superior Industries International, Inc. Amended and Restated Term Loan Credit Agreement (2024-08-14)", file: "doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt" },
  { documentId: "doc-c", label: "Superior Industries International, Inc. First Amendment to Amended and Restated Term Loan Credit Agreement (2025-03-31)", file: "doc-c-2025-03-31-first-amendment.txt" },
];

async function main() {
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

  const packageDocs: PackageDocumentInput[] = documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }));
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, packageDocs);

  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }
  const access = { index, packageGraph, exactTermsByDocument };

  const docACandidates: DiscoveredCandidate[] = JSON.parse(readFileSync(`${RUN_DIR}/stage2-discovery-candidates-doc-a.json`, "utf-8"));
  const candidate = docACandidates.find((c) => c.discoveryId === TARGET_CANDIDATE_ID);
  if (!candidate) throw new Error(`candidate ${TARGET_CANDIDATE_ID} not found`);

  const bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access);
  const operativeSourceText = candidate.structuralNodeKeys.map((k) => index.getNodeText(k, "DESCENDANTS")).join("\n\n");

  const stage6: Array<{ candidateRef: string; sourceDocumentId: string; sourceSectionRef: string; status: string; rules: unknown[]; definitions: unknown[] }> = JSON.parse(readFileSync(`${RUN_DIR}/stage6-compiled-results.json`, "utf-8"));
  const compiledEntry = stage6.find((e) => e.candidateRef === TARGET_CANDIDATE_ID)!;

  const operativeStatesByUnit = JSON.parse(readFileSync(`${RUN_DIR}/stage5-operative-states-by-unit.json`, "utf-8"));
  const operativeState = operativeStatesByUnit["instrument:doc-a"];
  const amendmentEffects = JSON.parse(readFileSync(`${RUN_DIR}/stage5-amendment-effects.json`, "utf-8"));

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
    compilerAlgorithmVersion: "reproduction-probe",
    compilerPromptVersion: "reproduction-probe",
    toolPolicyVersion: "reproduction-probe",
  };

  const compilationResult: SemanticCompilationResult = {
    status: compiledEntry.status as SemanticCompilationResult["status"],
    failureReasons: [],
    errorDetail: null,
    rules: compiledEntry.rules as SemanticCompilationResult["rules"],
    definitions: compiledEntry.definitions as SemanticCompilationResult["definitions"],
    sharedCapacities: [],
    irExtensionCandidates: [],
    unresolvedIssues: [],
    toolCallLog: [],
    rawModelOutput: {},
    provider: "reproduction",
    model: "reproduction",
    telemetry: null,
    cacheKey: "reproduction",
    compiledAt: new Date().toISOString(),
  };

  console.log(
    JSON.stringify({
      operativeSourceTextChars: operativeSourceText.length,
      contextBundleItems: bundle.items.length,
      contextBundleJsonChars: JSON.stringify(bundle).length,
      unresolvedDependencies: bundle.unresolvedDependencies.length,
      proposedIrRules: compilationResult.rules.length,
      proposedIrDefinitions: compilationResult.definitions.length,
    })
  );

  const reconciliation: ReconciliationResult = { candidateRef: candidate.discoveryId, items: [], materialUnresolvedCount: 0 };
  const input: VerificationInput = { compilerInput, compilationResult };
  const caller = getStageCaller();
  console.log(JSON.stringify({ provider: caller.providerName, model: caller.model }));
  const start = Date.now();
  const result = await runAdversarialSemanticReview(input, reconciliation, caller);
  console.log(
    JSON.stringify(
      {
        elapsedMs: Date.now() - start,
        failed: result.failed,
        failureDetail: result.failureDetail,
        findingsCount: result.findings.length,
        telemetry: result.telemetry,
      },
      null,
      2
    )
  );
}
main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
