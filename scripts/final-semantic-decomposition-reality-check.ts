/**
 * FINAL-SEMANTIC-DECOMPOSITION whole-agreement reality check (Sections
 * 21-24 of the governing mission). 12 diversified REAL source regions
 * drawn from already-ingested packages (DSGR's two separate real credit
 * agreements - doc-a 2022, doc-d 2025 - and LSB's own real excerpt files),
 * selected SOURCE-FIRST by locating each provision family's real section
 * heading before any new compile was run, per Section 21's own explicit
 * "select source-first, before seeing the new compiler output" method.
 * NOT new GT creation for benchmarking - a zero-tuning behavioral check of
 * whether the frozen, already-committed FINAL_SEMANTIC_REMEDIATION_SHA
 * (bc4feae) generalizes across provision families, using real source this
 * codebase already has evidence for. Runs against the FROZEN production
 * code only - no code change will be made based on these results.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const COMPANY_ID = "final-semantic-decomposition-reality-check";
const PACKAGE_KEY = "whole-agreement-reality-check";
const INSTRUMENT_KEY = "reality-check-instrument";
const OUT_DIR = "tests/fixtures/unseen-packages/final-semantic-decomposition-reality-check";
const BUDGET_CEILING_USD = 8.0;

const DSGR_A = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt";
const DSGR_D = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";
const LSB_DEFS = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt";
const LSB_ART6 = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt";

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

interface RealityRegion {
  id: string;
  family: string;
  documentId: string;
  file: string;
  label: string;
  sourceSectionRef: string;
  startOffset: number;
  windowChars: number;
}

// Source-first selection: each offset located by directly searching each
// document's own real, already-extracted text for its own real section
// heading (not the document's own table-of-contents occurrence of the
// same heading text - verified by direct inspection before this script
// was written), BEFORE any new compile was run against it.
const REGIONS: RealityRegion[] = [
  { id: "definitions-lsb", family: "DEFINITIONS", documentId: "lsb-defs", file: LSB_DEFS, label: "LSB ABL Credit Agreement - definitions excerpt", sourceSectionRef: "1.01 (LSB excerpt)", startOffset: 0, windowChars: 999999 },
  { id: "definitions-dsgr", family: "DEFINITIONS", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 1.01 Defined Terms", sourceSectionRef: "1.01", startOffset: 12620, windowChars: 4000 },
  { id: "debt-dsgr", family: "DEBT", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.01 Indebtedness", sourceSectionRef: "6.01", startOffset: 436142, windowChars: 4500 },
  { id: "debt-lsb", family: "DEBT", documentId: "lsb-art6", file: LSB_ART6, label: "LSB ABL Credit Agreement - Article 6 negative covenants excerpt", sourceSectionRef: "6.xx (LSB excerpt)", startOffset: 0, windowChars: 999999 },
  { id: "liens-dsgr-a", family: "LIENS", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.02 Liens", sourceSectionRef: "6.02", startOffset: 444932, windowChars: 3500 },
  { id: "liens-dsgr-d", family: "LIENS", documentId: "dsgr-d", file: DSGR_D, label: "DSGR 2025 Second A&R Credit Agreement - SECTION 6.02 Liens", sourceSectionRef: "6.02", startOffset: 464193, windowChars: 3500 },
  { id: "investments-dsgr", family: "RESTRICTED_PAYMENTS_INVESTMENTS", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.04 Investments", sourceSectionRef: "6.04", startOffset: 455225, windowChars: 4000 },
  { id: "restricted-payments-dsgr", family: "RESTRICTED_PAYMENTS_INVESTMENTS", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.08 Restricted Payments", sourceSectionRef: "6.08", startOffset: 468878, windowChars: 4000 },
  { id: "asset-sales-dsgr", family: "ASSET_SALES_PREPAYMENT", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.05 Asset Sales", sourceSectionRef: "6.05", startOffset: 463076, windowChars: 3500 },
  { id: "financial-covenant-dsgr", family: "FINANCIAL_COVENANT", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.12 Financial Covenants", sourceSectionRef: "6.12", startOffset: 476724, windowChars: 3500 },
  { id: "reporting-dsgr", family: "REPORTING_AFFIRMATIVE", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 5.01 Financial Statements and Other Information", sourceSectionRef: "5.01", startOffset: 404706, windowChars: 3500 },
  { id: "cross-reference-dsgr", family: "CROSS_REFERENCE_SHARED_CAP_CONDITION", documentId: "dsgr-a", file: DSGR_A, label: "DSGR 2022 A&R Credit Agreement - SECTION 6.10 Restrictive Agreements", sourceSectionRef: "6.10", startOffset: 474298, windowChars: 2800 },
];

function findAnchorNode(nodes: StructuralNode[], documentId: string, idx: number): string[] {
  const docNodes = nodes.filter((n) => n.documentId === documentId);
  const cands = docNodes.filter((n) => n.charStart <= idx && idx <= n.charEnd);
  cands.sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart));
  return cands.length > 0 ? [cands[0]!.nodeKey] : [];
}

async function main() {
  console.log("================ FINAL_SEMANTIC_DECOMPOSITION_REALITY_CHECK ================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Budget ceiling: $${BUDGET_CEILING_USD}`);

  const uniqueDocFiles = new Map<string, string>();
  for (const r of REGIONS) uniqueDocFiles.set(r.documentId, r.file);
  const documents = Array.from(uniqueDocFiles.entries()).map(([documentId, file]) => ({ documentId, label: documentId, text: readFileSync(file, "utf-8") }));
  const textByDoc = new Map(documents.map((d) => [d.documentId, d.text]));

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

  const compileCaller = getSemanticCaller();
  const verifyCaller = getStageCaller();
  console.log(`  compiler provider=${compileCaller.providerName} model=${compileCaller.model} synthetic=${compileCaller.isSynthetic}`);
  console.log(`  verifier  provider=${verifyCaller.providerName} model=${verifyCaller.model} synthetic=${verifyCaller.isSynthetic}`);
  if (compileCaller.isSynthetic || verifyCaller.isSynthetic) throw new Error("FATAL: no real credential detected - refusing synthetic reality check.");

  const results: Record<string, unknown> = {};

  for (const region of REGIONS) {
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached - stopping before region ${region.id}`);
      results[region.id] = { skipped: true, reason: "budget ceiling reached before this region" };
      continue;
    }
    console.log(`\n=== Region ${region.id} (${region.family}) ===`);
    const fullText = textByDoc.get(region.documentId)!;
    const operativeSourceText = fullText.slice(region.startOffset, region.startOffset + region.windowChars);
    const structuralNodeKeys = findAnchorNode(allNodes, region.documentId, region.startOffset);
    console.log(`  charStart=${region.startOffset} chars=${operativeSourceText.length} anchorNodeKeys=${JSON.stringify(structuralNodeKeys)}`);

    const candidate: DiscoveredCandidate = {
      discoveryId: `reality-check-candidate:${region.id}`,
      documentId: region.documentId,
      structuralNodeKeys,
      structuralNodeIds: [],
      normalizedSourceRef: region.sourceSectionRef,
      families: [],
      role: "GENERAL_PROHIBITION",
      roleRaw: "",
      roleNormalizationStatus: "VALID_CANONICAL",
      familiesRaw: [],
      familiesNormalizationStatus: "VALID_CANONICAL",
      description: `Whole-agreement reality check region: ${region.label}`,
      multipleRulesLikely: true,
      definedTermDependencyLikely: true,
      discoveryMethods: ["DETERMINISTIC_SIGNAL"],
      evidenceSignals: ["headline_heading"],
      reviewStatus: "NEEDS_REVIEW",
      confidence: 1,
      sourceCitation: operativeSourceText.slice(0, 200),
      discoveryRunVersion: "final-semantic-decomposition-reality-check.v1",
      supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
      supersessionReason: "Reality-check region located directly by source-first char offset, not via the real discovery pipeline - operative-state/supersession status not independently checked for this ad-hoc anchor.",
      valueAnchors: [],
    } as unknown as DiscoveredCandidate;

    let bundle;
    try {
      bundle = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access);
    } catch (err) {
      console.log(`  [context-bundle] failed (${err instanceof Error ? err.message : String(err)}) - using empty bundle`);
      bundle = { items: [], unresolvedDependencies: [], sufficiencyState: "INCOMPLETE" } as unknown as ReturnType<typeof buildCovenantContextBundle>;
    }

    const compilerInput: SemanticCompilerInput = {
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT_KEY,
      sourceDocumentId: region.documentId,
      candidateRef: candidate.discoveryId,
      sourceSectionRef: region.sourceSectionRef,
      operativeSourceText,
      contextBundle: bundle,
      operativeLineage: null,
      toolAccess: { structuralIndex: index, operativeState: null, packageGraph, amendmentEffects: [], contextBundle: bundle },
      irSchemaVersion: IR_SCHEMA_VERSION,
      compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
      compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
      toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    };

    let compileResult;
    try {
      compileResult = await compileCovenantToIR(compilerInput, { caller: compileCaller });
      logCost(`compile ${region.id}`, compileResult.telemetry);
      console.log(`  -> compile status=${compileResult.status} rules=${compileResult.rules.length} definitions=${compileResult.definitions.length}`);
    } catch (err) {
      console.log(`  -> compile FAILED: ${err instanceof Error ? err.message : String(err)}`);
      results[region.id] = { region, error: err instanceof Error ? err.message : String(err) };
      continue;
    }

    let verifyResult = null;
    if (runningCostUsd < BUDGET_CEILING_USD && compileResult.status !== "FAILED") {
      try {
        verifyResult = await verifyCompiledCandidate({ compilerInput, compilationResult: compileResult }, { reviewCaller: verifyCaller });
        logCost(`verify ${region.id}`, verifyCaller.lastTelemetry());
        console.log(`  -> verify status=${verifyResult.status} findings=${verifyResult.findings.length} semanticReviewInvoked=${verifyResult.semanticReviewInvoked}`);
      } catch (err) {
        console.log(`  -> verify FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    results[region.id] = {
      region: { id: region.id, family: region.family, documentId: region.documentId, sourceSectionRef: region.sourceSectionRef, charStart: region.startOffset, chars: operativeSourceText.length, structuralNodeKeys },
      operativeSourceText,
      compile: { status: compileResult.status, rules: compileResult.rules, definitions: compileResult.definitions, failureReasons: compileResult.failureReasons, telemetry: compileResult.telemetry },
      verify: verifyResult,
    };
    preserve(`reality-check-${region.id}`, results[region.id]);
  }

  preserve("reality-check-summary", { finishedAt: new Date().toISOString(), totalCostUsd: runningCostUsd, budgetCeilingUsd: BUDGET_CEILING_USD, regionIds: REGIONS.map((r) => r.id) });
  console.log("\n================ FINAL SUMMARY ================");
  console.log(JSON.stringify({ totalCostUsd: runningCostUsd }, null, 2));
}
main();
