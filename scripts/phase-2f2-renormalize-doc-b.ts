/**
 * Phase 2F.2 - offline re-normalization of the already-captured real
 * Document B Pass B output (document-b-rerun-raw-items.json) using the
 * IMPROVED normalization.ts (camelCase/slash/singular-plural handling +
 * the small family alias table added after inspecting this exact real
 * run's own out-of-enum family values). Re-applies normalizeDiscoveryRole/
 * normalizeDiscoveryFamilies to each raw item's preserved roleRaw/
 * familiesRaw, then reruns the real Pass C/D reconciliation - NO new LLM
 * call, since the model's raw output was already captured verbatim and
 * normalization is a pure deterministic function of that raw text.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../lib/contract-model/compiler/discovery/pass-a-signals";
import { runPassCNeighborhoodExpansion } from "../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { normalizeDiscoveryRole, normalizeDiscoveryFamilies } from "../lib/contract-model/compiler/discovery/normalization";
import { DISCOVERY_RUN_VERSION } from "../lib/contract-model/compiler/discovery/pipeline";
import type { SemanticRuleItem } from "../lib/contract-model/compiler/discovery/pass-b-semantic";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f2");

interface RawItemRecord extends SemanticRuleItem {
  sectionRef: string;
}

function main() {
  const text = fs.readFileSync(path.join(PKG_DIR, "guarantee-and-collateral-agreement-full.txt"), "utf-8");
  const documentId = "conmed-doc-b-guarantee-collateral-agreement";
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const deterministic = runPassADeterministicSignals(documentId, index);
  const deterministicByNodeId = new Map(deterministic.map((c) => [c.nodeId, c] as const));

  const oldSummary = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "document-b-rerun-summary.json"), "utf-8"));
  const rawItems: RawItemRecord[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "document-b-rerun-raw-items.json"), "utf-8"));

  // Re-normalize every item's PRESERVED raw values (roleRaw/familiesRaw) with the improved normalization.ts - the model's real output is not re-fetched.
  const renormalized: RawItemRecord[] = rawItems.map((item) => {
    const roleResult = normalizeDiscoveryRole(item.roleRaw);
    const familiesResult = normalizeDiscoveryFamilies(item.familiesRaw);
    return {
      ...item,
      role: roleResult.canonical,
      roleNormalizationStatus: roleResult.status,
      families: familiesResult.canonical,
      familiesNormalizationStatus: familiesResult.status,
    };
  });

  const bySectionRef = new Map<string, RawItemRecord[]>();
  for (const item of renormalized) {
    if (!bySectionRef.has(item.sectionRef)) bySectionRef.set(item.sectionRef, []);
    bySectionRef.get(item.sectionRef)!.push(item);
  }

  const allExpanded: ReturnType<typeof runPassCNeighborhoodExpansion>["candidates"] = [];
  let discoveryIdFn: ((c: (typeof allExpanded)[number]) => string) | undefined;
  for (const [sectionRef, items] of bySectionRef) {
    const sectionNode = index.getNodeByRef(documentId, sectionRef);
    if (!sectionNode) continue;
    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, documentId, sectionNode.nodeId, sectionRef, items, DISCOVERY_RUN_VERSION);
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

  const roleStatusCounts: Record<string, number> = {};
  const familiesStatusCounts: Record<string, number> = {};
  const roleDistribution: Record<string, number> = {};
  for (const item of renormalized) {
    roleStatusCounts[item.roleNormalizationStatus] = (roleStatusCounts[item.roleNormalizationStatus] ?? 0) + 1;
    familiesStatusCounts[item.familiesNormalizationStatus] = (familiesStatusCounts[item.familiesNormalizationStatus] ?? 0) + 1;
    roleDistribution[item.role] = (roleDistribution[item.role] ?? 0) + 1;
  }

  const summary = {
    ...oldSummary,
    renormalizedAt: new Date().toISOString(),
    note: "families re-normalized offline (zero new LLM calls) against the SAME captured real raw model output, after normalization.ts's camelCase/slash/singular-plural handling + family alias table were added based on inspecting this run's own out-of-enum family values.",
    duplicatesBeforeReconciliation,
    finalCandidateCount: candidates.length,
    roleNormalizationStatusCounts: roleStatusCounts,
    familiesNormalizationStatusCounts: familiesStatusCounts,
    canonicalRoleDistribution: roleDistribution,
  };

  fs.writeFileSync(path.join(OUT_DIR, "document-b-rerun-raw-items.json"), JSON.stringify(renormalized, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "document-b-rerun-final-candidates.json"), JSON.stringify(candidates, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "document-b-rerun-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
