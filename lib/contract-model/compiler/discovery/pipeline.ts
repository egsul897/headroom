/**
 * Phase 2B - discovery pipeline (Pass A -> B -> C -> D), operating over
 * Phase 2A's structural index. One Pass B call per SECTION that Pass A
 * flagged at least one node inside - never per node, never the whole
 * document repeatedly (task §9/§19).
 *
 * Cache-key identity (task §9): a caller persisting this pipeline's output
 * must hash together document content, the relevant structural-node
 * content, DISCOVERY_PIPELINE_VERSION (this file's own algorithm version -
 * bump it whenever Pass A/C/D logic changes), DISCOVERY_PROMPT_VERSION
 * (pass-b-semantic.ts's own prompt/schema version), and provider/model
 * identity - so a changed discovery algorithm or prompt never silently
 * resumes stale discovery state. This module does not itself touch
 * persistence (consistent with Phase 2A's own "available as a library, not
 * yet wired into the live orchestrator" scope decision) - a caller wires
 * the returned candidates into ContractCompilerStage exactly as every other
 * stage does, using computeDiscoveryInputHash below as that stage's
 * inputHash.
 */
import { hashParts } from "../hashing";
import type { StageCaller } from "../llm-caller";
import type { StructuralIndex } from "../structural-index";
import { runPassADeterministicSignals } from "./pass-a-signals";
import { runPassBSemanticClassification, DISCOVERY_PROMPT_VERSION, type SectionBatchInput } from "./pass-b-semantic";
import { runPassCNeighborhoodExpansion } from "./pass-c-neighborhood";
import { runPassDReconciliation } from "./pass-d-reconcile";
import type { DiscoveredCandidate, DiscoveryRunSummary } from "./types";

export const DISCOVERY_PIPELINE_VERSION = "phase-2b-discovery-pipeline.v1";
export const DISCOVERY_RUN_VERSION = `${DISCOVERY_PIPELINE_VERSION}+${DISCOVERY_PROMPT_VERSION}`;

export function computeDiscoveryInputHash(documentId: string, documentText: string, providerIdentity: string): string {
  return hashParts([documentId, documentText, DISCOVERY_RUN_VERSION, providerIdentity]);
}

export interface DiscoveryPipelineResult {
  candidates: DiscoveredCandidate[];
  summary: DiscoveryRunSummary;
}

export async function runDiscoveryPipeline(caller: StageCaller, documentId: string, index: StructuralIndex): Promise<DiscoveryPipelineResult> {
  const start = performance.now();
  const allNodes = index.allNodes().filter((n) => n.documentId === documentId);

  const deterministic = runPassADeterministicSignals(documentId, index);
  const deterministicByNodeKey = new Map(deterministic.map((c) => [c.nodeKey, c] as const));
  const candidateKeys = new Set(deterministic.map((c) => c.nodeKey));

  const sections = allNodes.filter((n) => n.nodeType === "SECTION");
  let semanticCandidatesEvaluated = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;
  const allExpanded: ReturnType<typeof runPassCNeighborhoodExpansion>["candidates"] = [];
  let discoveryIdFn: ((c: (typeof allExpanded)[number]) => string) | undefined;

  for (const section of sections) {
    const descendantKeys = index.getDescendants(section.nodeKey).map((d) => d.nodeKey);
    const hasCandidate = candidateKeys.has(section.nodeKey) || descendantKeys.some((k) => candidateKeys.has(k));
    if (!hasCandidate) continue;

    const passAHints = [section.nodeKey, ...descendantKeys]
      .filter((k) => candidateKeys.has(k))
      .map((k) => index.getNode(k)?.sectionRef ?? k)
      .filter((ref) => ref !== section.sectionRef);

    const batch: SectionBatchInput = {
      documentId,
      sectionNodeKey: section.nodeKey,
      sectionRef: section.sectionRef,
      heading: section.heading,
      text: index.getNodeText(section.nodeKey, "DESCENDANTS"),
      passAHints,
    };

    const result = await runPassBSemanticClassification(caller, batch);
    modelCalls++;
    const telemetry = caller.lastTelemetry();
    inputTokens += telemetry?.inputTokens ?? 0;
    outputTokens += telemetry?.outputTokens ?? 0;
    semanticCandidatesEvaluated += result.rules.length;

    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, documentId, section.nodeKey, section.sectionRef, result.rules, DISCOVERY_RUN_VERSION);
    discoveryIdFn = discoveryId;
    allExpanded.push(...expanded);
  }

  const { candidates, duplicatesBeforeReconciliation } = runPassDReconciliation({
    documentId,
    discoveryRunVersion: DISCOVERY_RUN_VERSION,
    expanded: allExpanded,
    discoveryId: discoveryIdFn ?? (() => ""),
    deterministicByNodeKey,
  });

  return {
    candidates,
    summary: {
      documentId,
      nodesInspected: allNodes.length,
      deterministicCandidatesGenerated: deterministic.length,
      semanticCandidatesEvaluated,
      duplicatesBeforeReconciliation,
      finalCandidateCount: candidates.length,
      wallClockMs: performance.now() - start,
      modelCalls,
      inputTokens,
      outputTokens,
    },
  };
}
