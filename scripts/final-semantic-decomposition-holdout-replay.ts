/**
 * FINAL-SEMANTIC-DECOMPOSITION holdout replay (Section 19) - the EXACT SAME
 * frozen A1-A6/B1-B4 semantic holdout as scripts/final-phase3-closure-
 * holdout-run.ts and scripts/post-holdout-semantic-remediation-rerun.ts
 * (byte-identical REGIONS/DOCS/SRC_DIR/GT/thresholds/provider-model
 * resolution), re-executed a THIRD time against the now-further-remediated
 * frozen production code (FINAL_SEMANTIC_REMEDIATION_SHA bc4feae, per
 * docs/final-semantic-decomposition/09) to measure whether this session's
 * own bounded completeness-check.ts fix moves the substantive-capture rate.
 * Output goes to a SEPARATE directory so both prior runs' evidence is
 * preserved unmodified for before/after comparison. No GT modification, no
 * new examples added, no region/claim re-selection.
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

const COMPANY_ID = "final-phase3-closure-holdout-sup";
const PACKAGE_KEY = "sup-term-loan-2022-2025";
const INSTRUMENT_KEY = "sup-term-loan-instrument";
const SRC_DIR = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text";
const OUT_DIR = "tests/fixtures/unseen-packages/final-semantic-decomposition-holdout-replay";
const BUDGET_CEILING_USD = 6.0;

const DOCS = [
  { documentId: "doc-a", label: "Superior Industries International, Inc. Term Loan Credit Agreement (2022-12-15)", file: "doc-a-2022-12-15-term-loan-credit-agreement.txt" },
  { documentId: "doc-b", label: "Superior Industries International, Inc. Amended and Restated Term Loan Credit Agreement (2024-08-14)", file: "doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt" },
  { documentId: "doc-c", label: "Superior Industries International, Inc. First Amendment to Amended and Restated Term Loan Credit Agreement (2025-03-31)", file: "doc-c-2025-03-31-first-amendment.txt" },
];

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

// Precommitted holdout regions - one compile per unique source span,
// covering all 10 A1-A6/B1-B4 GT claims (A1+B3 share the EBITDA
// definition's own text; B1+B2 share the Applicable Liquidity
// Threshold/Applicable Rate clause's own text - one real compile serves
// both claims in each pair, not a duplicate call).
interface HoldoutRegion {
  id: string;
  claimIds: string[];
  documentId: string;
  label: string;
  sourceSectionRef: string;
  startMarker: string;
  endMarker: string | null;
  fixedWindowChars?: number;
  anchorNodeKeyNeedle: string;
}
const REGIONS: HoldoutRegion[] = [
  { id: "ebitda", claimIds: ["A1", "B3"], documentId: "doc-a", label: "SECTION 1.01 - Consolidated EBITDA", sourceSectionRef: "1.01 (Consolidated EBITDA)", startMarker: "“Consolidated EBITDA” means", endMarker: null, fixedWindowChars: 5200, anchorNodeKeyNeedle: "“Consolidated EBITDA” means" },
  { id: "net-income", claimIds: ["A2"], documentId: "doc-a", label: "SECTION 1.01 - Consolidated Net Income", sourceSectionRef: "1.01 (Consolidated Net Income)", startMarker: "“Consolidated Net Income” means", endMarker: "“Consolidated", anchorNodeKeyNeedle: "“Consolidated Net Income” means" },
  { id: "interest-expense", claimIds: ["A3"], documentId: "doc-a", label: "SECTION 1.01 - Consolidated Interest Expense", sourceSectionRef: "1.01 (Consolidated Interest Expense)", startMarker: "“Consolidated\nInterest Expense” means", endMarker: null, fixedWindowChars: 3600, anchorNodeKeyNeedle: "Interest Expense” means" },
  { id: "first-lien-debt", claimIds: ["A4"], documentId: "doc-a", label: "SECTION 1.01 - Consolidated First Lien Secured Debt", sourceSectionRef: "1.01 (Consolidated First Lien Secured Debt)", startMarker: "“Consolidated First Lien Secured Debt” means", endMarker: null, fixedWindowChars: 950, anchorNodeKeyNeedle: "First Lien Secured Debt” means" },
  { id: "secured-net-leverage", claimIds: ["A5"], documentId: "doc-a", label: "SECTION 1.01 - Secured Net Leverage Ratio", sourceSectionRef: "1.01 (Secured Net Leverage Ratio)", startMarker: "“Secured Net Leverage Ratio” means", endMarker: null, fixedWindowChars: 1100, anchorNodeKeyNeedle: "Secured Net Leverage Ratio” means" },
  { id: "applicable-liquidity-rate", claimIds: ["B1", "B2"], documentId: "doc-a", label: "SECTION 1.01 - Applicable Liquidity Threshold / Applicable Rate", sourceSectionRef: "1.01 (Applicable Liquidity Threshold; Applicable Rate)", startMarker: "“Applicable Liquidity Threshold” means", endMarker: null, fixedWindowChars: 5200, anchorNodeKeyNeedle: "Applicable Liquidity Threshold” means" },
  { id: "new-definitions", claimIds: ["A6"], documentId: "doc-c", label: "SECTION 2(a) - new sibling definitions", sourceSectionRef: "2(a)", startMarker: "Section 1.01 of the Credit Agreement is\nhereby amended by adding the following definitions", endMarker: "(b) Section 2.05(2)(c)", anchorNodeKeyNeedle: "amended by adding the following definitions" },
  { id: "cash-sweep-cure", claimIds: ["B4"], documentId: "doc-c", label: "SECTION 2(b) - Section 2.05(2)(c) amendment", sourceSectionRef: "2(b)", startMarker: "(b) Section 2.05(2)(c) of the Credit Agreement is hereby", endMarker: null, fixedWindowChars: 2900, anchorNodeKeyNeedle: "Section 2.05(2)(c) of the Credit Agreement" },
];

function findRegionText(text: string, r: HoldoutRegion): { start: number; end: number; text: string } {
  const start = text.indexOf(r.startMarker);
  if (start === -1) throw new Error(`region ${r.id}: startMarker not found`);
  let end: number;
  if (r.endMarker) {
    const idx = text.indexOf(r.endMarker, start + r.startMarker.length);
    end = idx === -1 ? start + (r.fixedWindowChars ?? 3000) : idx;
  } else {
    end = start + (r.fixedWindowChars ?? 3000);
  }
  return { start, end, text: text.slice(start, end) };
}

function findAnchorNode(nodes: StructuralNode[], documentId: string, text: string, needle: string): string[] {
  const idx = text.indexOf(needle);
  if (idx === -1) return [];
  const docNodes = nodes.filter((n) => n.documentId === documentId);
  const cands = docNodes.filter((n) => n.charStart <= idx && idx <= n.charEnd);
  cands.sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart));
  return cands.length > 0 ? [cands[0]!.nodeKey] : [];
}

async function main() {
  console.log("================ FINAL_PHASE3_CLOSURE_HOLDOUT_RUN ================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Budget ceiling: $${BUDGET_CEILING_USD}`);

  const documents = DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: readFileSync(`${SRC_DIR}/${d.file}`, "utf-8") }));
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
  if (compileCaller.isSynthetic || verifyCaller.isSynthetic) throw new Error("FATAL: no real credential detected - refusing synthetic holdout.");

  const results: Record<string, unknown> = {};

  for (const region of REGIONS) {
    if (runningCostUsd >= BUDGET_CEILING_USD) {
      console.log(`  [budget] ceiling reached - stopping before region ${region.id}`);
      results[region.id] = { skipped: true, reason: "budget ceiling reached before this region" };
      continue;
    }
    console.log(`\n=== Region ${region.id} (claims: ${region.claimIds.join(", ")}) ===`);
    const text = textByDoc.get(region.documentId)!;
    const { start, text: operativeSourceText } = findRegionText(text, region);
    const structuralNodeKeys = findAnchorNode(allNodes, region.documentId, text, region.anchorNodeKeyNeedle);
    console.log(`  charStart=${start} chars=${operativeSourceText.length} anchorNodeKeys=${JSON.stringify(structuralNodeKeys)}`);

    const candidate: DiscoveredCandidate = {
      discoveryId: `holdout-candidate:${region.id}`,
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
      description: `Precommitted holdout region: ${region.label}`,
      multipleRulesLikely: true,
      definedTermDependencyLikely: true,
      discoveryMethods: ["DETERMINISTIC_SIGNAL"],
      evidenceSignals: ["headline_heading"],
      reviewStatus: "NEEDS_REVIEW",
      confidence: 1,
      sourceCitation: operativeSourceText.slice(0, 200),
      discoveryRunVersion: "final-phase3-closure-holdout.v1",
      supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
      supersessionReason: "Holdout region located directly by GT-cited source span, not via the real discovery pipeline - operative-state/supersession status not independently checked for this ad-hoc anchor.",
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
      region: { id: region.id, claimIds: region.claimIds, documentId: region.documentId, sourceSectionRef: region.sourceSectionRef, charStart: start, chars: operativeSourceText.length, structuralNodeKeys },
      operativeSourceText,
      compile: { status: compileResult.status, rules: compileResult.rules, definitions: compileResult.definitions, failureReasons: compileResult.failureReasons, telemetry: compileResult.telemetry },
      verify: verifyResult,
    };
    preserve(`holdout-${region.id}`, results[region.id]);
  }

  preserve("holdout-summary", { finishedAt: new Date().toISOString(), totalCostUsd: runningCostUsd, budgetCeilingUsd: BUDGET_CEILING_USD, regionIds: REGIONS.map((r) => r.id) });
  console.log("\n================ FINAL SUMMARY ================");
  console.log(JSON.stringify({ totalCostUsd: runningCostUsd }, null, 2));
}
main().catch((err) => {
  console.error("FATAL:", err);
  preserve("fatal-error", { message: err instanceof Error ? err.message : String(err), runningCostUsdAtFailure: runningCostUsd });
  process.exit(1);
});
