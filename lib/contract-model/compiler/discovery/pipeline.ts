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
import { EMPTY_SUPERSESSION_INDEX } from "../amendment/operative-state";
import type { NodeSupersessionIndex } from "../amendment/types";
import { runPassBSemanticClassification, DISCOVERY_PROMPT_VERSION, type SectionBatchInput } from "./pass-b-semantic";
import { runPassCNeighborhoodExpansion } from "./pass-c-neighborhood";
import { runPassDReconciliation } from "./pass-d-reconcile";
import type { DiscoveredCandidate, DiscoveryHealthState, DiscoveryRunSummary, DiscoverySectionFailure } from "./types";

// Phase 2F.2 §8/§22 bump: a single section's Pass B call failure no longer
// aborts the whole document (see the try/catch in the loop below) - this
// is an algorithm-level behavior change, so any cache keyed on
// DISCOVERY_RUN_VERSION correctly treats prior runs as stale rather than
// silently resuming a pre-fault-isolation result as if it were equivalent.
//
// Phase 3F.1.6.R BLOCKER-8 bump (v2 -> v3): pass-c-neighborhood.ts's
// discoveryId formula and pass-d-reconcile.ts's mergeKey both now fold in
// computeCandidateContentFingerprint (families-derived) - a real identity
// formula change (see 11-claim-identity-remediation.json), so any
// previously-persisted discoveryId/candidateRef computed under v2 is
// correctly treated as a different, stale identity space rather than
// silently reused as if unchanged.
export const DISCOVERY_PIPELINE_VERSION = "phase-2b-discovery-pipeline.v3";
export const DISCOVERY_RUN_VERSION = `${DISCOVERY_PIPELINE_VERSION}+${DISCOVERY_PROMPT_VERSION}`;

/**
 * Phase 2F.2 §18 - document-level discovery health, mirroring
 * structural-coverage.ts's own classifyHealth in spirit (several signals,
 * never a bare count alone) but scoped to Pass B section-call outcomes.
 * FAILED only when every section that was actually attempted failed
 * (never merely "some sections had zero candidates" - a section can
 * legitimately produce zero rules without that being a failure).
 */
export function classifyDiscoveryHealth(sectionsAttempted: number, sectionFailures: DiscoverySectionFailure[]): DiscoveryHealthState {
  if (sectionsAttempted === 0 || sectionFailures.length === 0) return "DISCOVERY_HEALTHY";
  if (sectionFailures.length >= sectionsAttempted) return "DISCOVERY_FAILED";
  return "DISCOVERY_PARTIAL";
}

export function computeDiscoveryInputHash(documentId: string, documentText: string, providerIdentity: string): string {
  return hashParts([documentId, documentText, DISCOVERY_RUN_VERSION, providerIdentity]);
}

export interface DiscoveryPipelineResult {
  candidates: DiscoveredCandidate[];
  summary: DiscoveryRunSummary;
}

/**
 * Phase 3F.1.5 Workstream B (P1-11/Q8 fix) - `supersessionIndex` is
 * optional and threads straight through to runPassADeterministicSignals;
 * see that function's own comment for the fail-closed default when a
 * caller omits it (no wiring changes to Pass B/C/D below - they consume
 * `deterministic`/`deterministicByNodeId` for candidate merging/hinting
 * only, never for a currentness claim of their own).
 */
export async function runDiscoveryPipeline(caller: StageCaller, documentId: string, index: StructuralIndex, supersessionIndex: NodeSupersessionIndex = EMPTY_SUPERSESSION_INDEX): Promise<DiscoveryPipelineResult> {
  const start = performance.now();
  const allNodes = index.allNodes().filter((n) => n.documentId === documentId);

  const deterministic = runPassADeterministicSignals(documentId, index, supersessionIndex);
  // Phase 3F.1.2: keyed by nodeId (real physical occurrence identity),
  // never the label-shaped nodeKey - see pass-d-reconcile.ts for the
  // highest-consequence consumer of this map (candidate merging).
  const deterministicByNodeId = new Map(deterministic.map((c) => [c.nodeId, c] as const));
  const candidateIds = new Set(deterministic.map((c) => c.nodeId));

  const sections = allNodes.filter((n) => n.nodeType === "SECTION");
  let semanticCandidatesEvaluated = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;
  let sectionsAttempted = 0;
  const sectionFailures: DiscoverySectionFailure[] = [];
  const allExpanded: ReturnType<typeof runPassCNeighborhoodExpansion>["candidates"] = [];
  let discoveryIdFn: ((c: (typeof allExpanded)[number]) => string) | undefined;

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
    // Phase 2F.2 §8 fault isolation: a single section's Pass B call
    // failing (network error, provider error, or any other unrecoverable
    // exception) is recorded and skipped, never allowed to abort every
    // remaining section in the document the way the pre-fix un-guarded
    // loop did (see baseline-diagnostic.json's "did one invalid item
    // destroy valid siblings" finding).
    let result: Awaited<ReturnType<typeof runPassBSemanticClassification>>;
    try {
      result = await runPassBSemanticClassification(caller, batch);
    } catch (err) {
      sectionFailures.push({
        sectionNodeKey: section.nodeKey,
        sectionRef: section.sectionRef,
        stage: "PASS_B_SEMANTIC_CLASSIFICATION",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    modelCalls++;
    const telemetry = caller.lastTelemetry();
    inputTokens += telemetry?.inputTokens ?? 0;
    outputTokens += telemetry?.outputTokens ?? 0;
    semanticCandidatesEvaluated += result.rules.length;

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
      sectionsAttempted,
      sectionFailures,
      documentDiscoveryHealth: classifyDiscoveryHealth(sectionsAttempted, sectionFailures),
    },
  };
}
