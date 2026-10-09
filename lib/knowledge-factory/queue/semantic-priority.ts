/**
 * Selective semantic compilation queue.
 * Paid execution remains disabled — ranking uses deterministic estimates only.
 */

import type { CovenantCandidateRecord, KnowledgeSourceRecord } from "../types";

export interface SemanticQueueItem {
  unitId: string;
  sourceId: string;
  candidateId?: string;
  priority: number;
  factors: {
    legalSignificance: number;
    uncertainty: number;
    dependencyCentrality: number;
    reusePotential: number;
    novelty: number;
    draftingDiversity: number;
    knownFailurePattern: number;
    reviewerDemand: number;
    estimatedInferenceCost: number;
  };
  estimatedTokens: number;
  paidExecutionEnabled: false;
  reason: string;
}

export function buildSemanticPriorityQueue(
  sources: KnowledgeSourceRecord[],
  candidates: CovenantCandidateRecord[],
  opts: { knownFailureSignals?: string[]; reviewerDemandSourceIds?: string[] } = {},
): SemanticQueueItem[] {
  const failure = new Set(opts.knownFailureSignals ?? []);
  const demand = new Set(opts.reviewerDemandSourceIds ?? []);
  const sourceById = new Map(sources.map((s) => [s.sourceId, s]));

  const items: SemanticQueueItem[] = candidates.map((c) => {
    const source = sourceById.get(c.sourceId);
    const legalSignificance = Math.min(10, c.discoveryScore);
    const uncertainty = c.families.includes("UNKNOWN") ? 8 : c.signals.some((s) => s.includes("ambiguous")) ? 7 : 3;
    const dependencyCentrality = c.signals.filter((s) => /definition|cross|shared|available_amount/i.test(s)).length * 1.5;
    const reusePotential = Math.min(8, c.signals.filter((s) => s.startsWith("pattern:")).length * 2);
    const novelty = source?.documentClass === "UNKNOWN" ? 6 : 3;
    const draftingDiversity = Math.min(6, new Set(c.families).size * 2);
    const knownFailurePattern = c.signals.some((s) => failure.has(s)) ? 9 : 0;
    const reviewerDemand = demand.has(c.sourceId) ? 8 : 0;
    const estimatedTokens = Math.round(400 + c.excerpt.length / 3 + uncertainty * 80);
    const estimatedInferenceCost = estimatedTokens; // token proxy only

    const priority =
      legalSignificance * 1.4 +
      uncertainty * 1.6 +
      dependencyCentrality +
      reusePotential * 0.8 +
      novelty * 0.7 +
      draftingDiversity * 0.5 +
      knownFailurePattern * 1.5 +
      reviewerDemand * 1.2 -
      estimatedInferenceCost / 2000;

    return {
      unitId: `semq:${c.candidateId}`,
      sourceId: c.sourceId,
      candidateId: c.candidateId,
      priority: Math.round(priority * 100) / 100,
      factors: {
        legalSignificance,
        uncertainty,
        dependencyCentrality,
        reusePotential,
        novelty,
        draftingDiversity,
        knownFailurePattern,
        reviewerDemand,
        estimatedInferenceCost,
      },
      estimatedTokens,
      paidExecutionEnabled: false,
      reason: "Deterministic priority only — paid provider execution disabled.",
    };
  });

  return items.sort((a, b) => b.priority - a.priority);
}
