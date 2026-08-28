/**
 * Phase 2F.2 §16 - the real, post-fix Phase 2B discovery rerun against the
 * real Document B (now a regression fixture, not unseen/blind - task
 * §16's own explicit framing). Runs Pass A -> B -> C -> D exactly once
 * (one real LLM call per Pass-A-flagged section, matching
 * pipeline.ts's own runDiscoveryPipeline order/logic exactly, inlined
 * here only so every RAW pre-reconciliation SemanticRuleItem's
 * normalization provenance can be captured before Pass D's dedup
 * potentially collapses distinct raw values that normalized to the same
 * canonical role at the same node) - never a second, separate call round.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { runPassADeterministicSignals } from "../lib/contract-model/compiler/discovery/pass-a-signals";
import { runPassBSemanticClassification, type SectionBatchInput, type SemanticRuleItem } from "../lib/contract-model/compiler/discovery/pass-b-semantic";
import { runPassCNeighborhoodExpansion } from "../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { DISCOVERY_RUN_VERSION, classifyDiscoveryHealth } from "../lib/contract-model/compiler/discovery/pipeline";
import type { DiscoverySectionFailure } from "../lib/contract-model/compiler/discovery/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f2");

async function main() {
  const text = fs.readFileSync(path.join(PKG_DIR, "guarantee-and-collateral-agreement-full.txt"), "utf-8");
  const documentId = "conmed-doc-b-guarantee-collateral-agreement";
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const caller = getStageCaller();
  console.error(`provider=${caller.providerName} model=${caller.model} isSynthetic=${caller.isSynthetic}`);

  const deterministic = runPassADeterministicSignals(documentId, index);
  const deterministicByNodeId = new Map(deterministic.map((c) => [c.nodeId, c] as const));
  const candidateIds = new Set(deterministic.map((c) => c.nodeId));
  const allNodes = index.allNodes().filter((n) => n.documentId === documentId);
  const sections = allNodes.filter((n) => n.nodeType === "SECTION");

  const allRawItems: Array<SemanticRuleItem & { sectionRef: string }> = [];
  const allExpanded: ReturnType<typeof runPassCNeighborhoodExpansion>["candidates"] = [];
  let discoveryIdFn: ((c: (typeof allExpanded)[number]) => string) | undefined;
  const sectionFailures: DiscoverySectionFailure[] = [];
  let sectionsAttempted = 0;
  let modelCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const start = performance.now();

  for (const section of sections) {
    const descendantIds = index.getDescendants(section.nodeId).map((d) => d.nodeId);
    const hasCandidate = candidateIds.has(section.nodeId) || descendantIds.some((id) => candidateIds.has(id));
    if (!hasCandidate) continue;

    const passAHints = [section.nodeId, ...descendantIds]
      .filter((id) => candidateIds.has(id))
      .map((id) => index.getNodeById(id)?.sectionRef ?? id)
      .filter((ref) => ref !== section.sectionRef);

    const batch: SectionBatchInput = {
      documentId,
      sectionNodeKey: section.nodeKey,
      sectionNodeId: section.nodeId,
      sectionRef: section.sectionRef,
      heading: section.heading,
      text: index.getNodeText(section.nodeId, "DESCENDANTS"),
      passAHints,
    };

    sectionsAttempted++;
    let result;
    try {
      result = await runPassBSemanticClassification(caller, batch);
    } catch (err) {
      sectionFailures.push({ sectionNodeKey: section.nodeKey, sectionRef: section.sectionRef, stage: "PASS_B_SEMANTIC_CLASSIFICATION", errorMessage: err instanceof Error ? err.message : String(err) });
      console.error(`[${section.sectionRef}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    modelCalls++;
    const telemetry = caller.lastTelemetry();
    inputTokens += telemetry?.inputTokens ?? 0;
    outputTokens += telemetry?.outputTokens ?? 0;
    for (const item of result.rules) allRawItems.push({ ...item, sectionRef: section.sectionRef });
    console.error(`[${section.sectionRef}] ${result.rules.length} rules - roles: ${result.rules.map((r) => `${r.role}(${r.roleNormalizationStatus})`).join(", ")}`);

    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, documentId, section.nodeId, section.sectionRef, result.rules, DISCOVERY_RUN_VERSION);
    discoveryIdFn = discoveryId;
    allExpanded.push(...expanded);
  }

  const { candidates, duplicatesBeforeReconciliation } = runPassDReconciliation({
    documentId,
    discoveryRunVersion: DISCOVERY_RUN_VERSION,
    expanded: allExpanded,
    discoveryId: discoveryIdFn ?? (() => ""),
    deterministicByNodeId,
  });

  const documentDiscoveryHealth = classifyDiscoveryHealth(sectionsAttempted, sectionFailures);

  const roleStatusCounts: Record<string, number> = {};
  const familiesStatusCounts: Record<string, number> = {};
  for (const item of allRawItems) {
    roleStatusCounts[item.roleNormalizationStatus] = (roleStatusCounts[item.roleNormalizationStatus] ?? 0) + 1;
    familiesStatusCounts[item.familiesNormalizationStatus] = (familiesStatusCounts[item.familiesNormalizationStatus] ?? 0) + 1;
  }
  const roleDistribution: Record<string, number> = {};
  for (const item of allRawItems) roleDistribution[item.role] = (roleDistribution[item.role] ?? 0) + 1;

  const summary = {
    runId: "PHASE_2F2_DOCUMENT_B_REGRESSION_RERUN",
    generatedAt: new Date().toISOString(),
    documentId,
    provider: caller.providerName,
    model: caller.model,
    discoveryRunVersion: DISCOVERY_RUN_VERSION,
    sectionsTotal: sections.length,
    sectionsAttempted,
    sectionFailures,
    documentDiscoveryHealth,
    modelCalls,
    inputTokens,
    outputTokens,
    wallClockMs: performance.now() - start,
    rawSemanticItemCount: allRawItems.length,
    duplicatesBeforeReconciliation,
    finalCandidateCount: candidates.length,
    roleNormalizationStatusCounts: roleStatusCounts,
    familiesNormalizationStatusCounts: familiesStatusCounts,
    canonicalRoleDistribution: roleDistribution,
  };

  fs.writeFileSync(path.join(OUT_DIR, "document-b-rerun-raw-items.json"), JSON.stringify(allRawItems, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "document-b-rerun-final-candidates.json"), JSON.stringify(candidates, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "document-b-rerun-summary.json"), JSON.stringify(summary, null, 2));
  console.error("\n=== SUMMARY ===");
  console.error(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
