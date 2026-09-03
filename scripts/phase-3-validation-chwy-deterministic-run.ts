/**
 * PHASE 3 SINGLE REAL-WORLD UNSEEN VALIDATION - Chewy, Inc. Credit Agreement (2026-06-23).
 * Zero-cost deterministic stages of the frozen stack (2A structure/definitions/references/index, 2C package
 * graph + document classification, 2B Pass A deterministic discovery signals, 2D context bundles, 2G operative
 * state, source-context sufficiency, 3C deterministic source inventory, 3E coverage audit Layers A/B).
 * Every paid stage (2B Pass B discovery, Pass A semantic inventory, 3B compile, 3C review, 3E Layer C) is
 * recorded as ENVIRONMENT_BLOCKED by the provider (HTTP 402) - see docs/phase-3-validation.
 * Run: npx tsx scripts/phase-3-validation-chwy-deterministic-run.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { buildSourceInventory } from "../lib/contract-model/compiler/semantic-verification/source-inventory";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { computeProductionTreeHash } from "./semantic-accountability-freeze";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const COMPANY_ID = "phase-3-validation-chwy";
const PACKAGE_KEY = "chwy-2026-credit-agreement";
const INSTRUMENT_KEY = "chwy-2026-revolving-credit-instrument";
const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run";
const DOC = { documentId: "doc-a", label: "Chewy, Inc. Credit Agreement (2026-06-23) - EX-10.1 to 8-K 0001193125-26-281042" };

function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

async function main() {
  const text = readFileSync(SRC, "utf-8");
  const freeze = computeProductionTreeHash();
  console.log(`production tree hash ${freeze.treeHash.slice(0, 16)} files=${freeze.fileCount}`);
  console.log(`source sha256 ${createHash("sha256").update(text).digest("hex")} chars=${text.length}`);

  console.log("\n=== STAGE 1: Phase 2A structure / definitions / references / index (zero LLM) ===");
  const documents = [{ documentId: DOC.documentId, label: DOC.label, text }];
  const structureResult = runStructureStage(documents);
  const allNodes: StructuralNode[] = structureResult.output;
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>([[DOC.documentId, { text, nodes: allNodes }]]);
  const allDefinitions: DetectedDefinition[] = detectStructuralDefinitions(DOC.documentId, text, allNodes);
  const allReferences: DetectedReference[] = detectStructuralReferences(DOC.documentId, text, allNodes);
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const byType: Record<string, number> = {};
  for (const n of allNodes) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;
  const structuralSummary = { textChars: text.length, totalNodes: allNodes.length, nodesByType: byType, definitionsDetected: allDefinitions.length, referencesDetected: allReferences.length, articles: allNodes.filter((n) => n.nodeType === "ARTICLE").map((n) => ({ sectionRef: n.sectionRef, heading: n.heading.slice(0, 60), charStart: n.charStart, charEnd: n.charEnd })), sections: allNodes.filter((n) => n.nodeType === "SECTION").length };
  console.log(JSON.stringify({ ...structuralSummary, articles: structuralSummary.articles.length }));
  preserve("stage1-structural-summary", structuralSummary);
  preserve("stage1-all-nodes", allNodes.map((n) => ({ nodeId: n.nodeId, nodeKey: n.nodeKey, nodeType: n.nodeType, sectionRef: n.sectionRef, heading: n.heading, charStart: n.charStart, charEnd: n.charEnd })));
  preserve("stage1-all-definitions", allDefinitions);
  preserve("stage1-all-references-summary", { count: allReferences.length, sample: allReferences.slice(0, 50) });

  console.log("\n=== STAGE 2A: Phase 2B Pass A deterministic discovery signals (zero LLM); Pass B semantic classification ENVIRONMENT_BLOCKED ===");
  const deterministic = runPassADeterministicSignals(DOC.documentId, index);
  const bySection = new Map<string, number>();
  for (const c of deterministic) bySection.set(c.sectionRef.split("(")[0]!, (bySection.get(c.sectionRef.split("(")[0]!) ?? 0) + 1);
  console.log(`  deterministic candidates: ${deterministic.length}; top-level sections with signals: ${bySection.size}`);
  preserve("stage2a-deterministic-candidates", deterministic.map((c) => ({ nodeId: c.nodeId, sectionRef: c.sectionRef, signals: c.signals, signalScore: c.signalScore, supersessionStatus: (c as unknown as { supersessionStatus?: string }).supersessionStatus ?? null })));
  preserve("stage2b-discovery-pass-b", { status: "ENVIRONMENT_BLOCKED", reason: "Vercel AI Gateway credential HTTP 402 quota_for_entity_exceeded ($150.49 / $150.00) - Pass B semantic classification requires a real model call", sectionsThatWouldBeAttempted: [...bySection.keys()].length });

  console.log("\n=== STAGE 3: Phase 2C package graph + document classification (zero LLM) ===");
  const packageDocs: PackageDocumentInput[] = [{ documentId: DOC.documentId, label: DOC.label, text }];
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, packageDocs);
  console.log(`  classifications: ${packageGraph.classifications.map((c) => `${c.documentId}=${c.type}(${c.confidence})`).join(", ")}; instruments=${packageGraph.instruments.length}; relationshipCandidates=${packageGraph.relationshipCandidates.length}; modificationCandidates=${packageGraph.modificationCandidates.length}`);
  preserve("stage3-package-graph", packageGraph);

  console.log("\n=== STAGE 5: Phase 2G operative state (single document, zero amendment effects; amendment interpreter not needed) ===");
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: DOC.documentId, asOfDate: new Date().toISOString().slice(0, 10), index, allEffects: [] });
  console.log(`  operative state status: ${operativeState.status}, provisions: ${operativeState.provisions.length}`);
  preserve("stage5-operative-state", { status: operativeState.status, provisionCount: operativeState.provisions.length, sample: operativeState.provisions.slice(0, 5) });

  console.log("\n=== STAGE 4/6-pre: context bundles + source-context sufficiency for every deterministic SECTION-level candidate (zero LLM) ===");
  const exactTermsByDocument = new Map<string, Map<string, string>>([[DOC.documentId, new Map(allDefinitions.map((d) => [d.normalizedTerm, d.exactTerm]))]]);
  const access = { index, packageGraph, exactTermsByDocument };
  const sectionNodes = allNodes.filter((n) => n.nodeType === "SECTION");
  const sectionIdsWithSignals = new Set<string>();
  for (const c of deterministic) { const n = index.getNodeById(c.nodeId); if (n) { let cur: StructuralNode | null = n; while (cur && cur.nodeType !== "SECTION") { cur = cur.parentNodeId ? index.getNodeById(cur.parentNodeId) ?? null : null; } if (cur) sectionIdsWithSignals.add(cur.nodeId); } }
  const unitRecords: Record<string, unknown>[] = [];
  const sufficiency: Record<string, number> = {};
  for (const sec of sectionNodes.filter((s) => sectionIdsWithSignals.has(s.nodeId))) {
    const operativeSourceText = index.getNodeText(sec.nodeId, "DESCENDANTS");
    const candidate = { discoveryId: `phase-3-validation:chwy:${sec.sectionRef}`, documentId: DOC.documentId, structuralNodeKeys: [sec.nodeKey], structuralNodeIds: [sec.nodeId], normalizedSourceRef: sec.sectionRef, families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: sec.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: operativeSourceText.slice(0, 200), discoveryRunVersion: "phase-3-validation.deterministic.v1", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "single-document package, no amendment effects", valueAnchors: [] } as unknown as DiscoveredCandidate;
    let bundleItems = -1, bundleSufficiency = "ERROR", bundleErr: string | null = null;
    try { const b = buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access); bundleItems = b.items.length; bundleSufficiency = b.sufficiencyState; } catch (e) { bundleErr = e instanceof Error ? e.message : String(e); }
    const sc = resolveSourceContext({ index, documentId: DOC.documentId, operativeSourceText, anchorNodeId: sec.nodeId, operativeCharStart: sec.charStart, documentText: text });
    sufficiency[sc.state] = (sufficiency[sc.state] ?? 0) + 1;
    const inv = buildSourceInventory(candidate.discoveryId, operativeSourceText, DOC.documentId, sec.sectionRef, sec.nodeKey, sec.nodeId);
    unitRecords.push({ sectionRef: sec.sectionRef, heading: sec.heading.slice(0, 80), chars: operativeSourceText.length, charStart: sec.charStart, charEnd: sec.charEnd, deterministicSignals: deterministic.filter((c) => index.getNodeById(c.nodeId)?.charStart! >= sec.charStart && index.getNodeById(c.nodeId)?.charEnd! <= sec.charEnd).length, contextBundle: { items: bundleItems, sufficiency: bundleSufficiency, error: bundleErr }, sourceContext: { state: sc.state, regions: sc.regions.length, totalChars: sc.totalChars, unresolvedReferences: sc.unresolvedReferences.length, reasons: sc.reasons.slice(0, 3) }, verifierSourceInventory: { items: inv.items.length, byKind: inv.items.reduce((m: Record<string, number>, i) => { m[i.kind] = (m[i.kind] ?? 0) + 1; return m; }, {}) } });
  }
  console.log(`  section-level units with deterministic signals: ${unitRecords.length}; source-context states: ${JSON.stringify(sufficiency)}`);
  preserve("stage4-6pre-units", unitRecords);

  console.log("\n=== STAGE 8: Phase 3E coverage audit Layers A/B (deterministic; Layer C, 3B compile, 3C review ENVIRONMENT_BLOCKED) ===");
  const coverage = await runSemanticCoverageAudit({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, instrumentKey: INSTRUMENT_KEY, index, documents: [{ documentId: DOC.documentId }], discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set<string>(), operativeState, operativeVersionRef: null, structuralParserVersion: "phase-2a-structural-index", providerIdentity: "none-environment-blocked" } as never);
  console.log(`  package status: ${coverage.packageCoverage.status}`);
  for (const r of coverage.packageCoverage.statusReasons.slice(0, 6)) console.log(`    - ${r}`);
  preserve("stage8-coverage-layers-ab", { status: coverage.packageCoverage.status, statusReasons: coverage.packageCoverage.statusReasons, documents: coverage.packageCoverage.documents.map((d) => ({ documentId: d.documentId, gateStatus: d.gateStatus, units: d.units.length, dangerousUnaccounted: (d as unknown as { dangerousUnaccounted?: unknown[] }).dangerousUnaccounted?.length ?? null })) });

  preserve("run-summary", { runId: "PHASE_3_VALIDATION_CHWY_DETERMINISTIC", finishedAt: new Date().toISOString(), productionTreeHash: freeze.treeHash, paidModelCalls: 0, paidCostUsd: 0, blockedStages: ["2B Pass B discovery", "Pass A semantic inventory (x2 stability)", "3B compile", "3C semantic review", "3E Layer C"], structural: { ...structuralSummary, articles: structuralSummary.articles.length }, deterministicCandidates: deterministic.length, sectionUnitsWithSignals: unitRecords.length, sourceContextStates: sufficiency, classification: packageGraph.classifications, operativeStateStatus: operativeState.status, coverageStatus: coverage.packageCoverage.status });
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
