/**
 * Independent corpus replay / count verification against pilot targets.
 */

import type { CorpusStore } from "../store/corpus-store";
import { isFinancingDoc, isFixtureDoc } from "../corpus/financing-filter";
import { STRUCTURAL_INDEX_VERSION } from "../../contract-model/compiler/types";
import { KNOWLEDGE_FACTORY_VERSION } from "../types";

export const PILOT_REPLAY_TARGETS = {
  acquiredFinancingDocuments: 113,
  uniqueInstrumentIdentities: 112,
  structuralNodes: 37789,
  covenantCandidates: 4590,
  definitions: 257,
  dependencyEdges: 23876,
  conditionExceptionRecords: 14975,
} as const;

export interface ReplayCounts {
  acquiredFinancingDocuments: number;
  uniqueInstrumentIdentities: number;
  structuralNodes: number;
  covenantCandidates: number;
  definitions: number;
  dependencyEdges: number;
  conditionExceptionRecords: number;
  fixtureDocuments: number;
  ambiguousStructuralNodes: number;
  documentRelationships: number;
  unresolvedUncertaintyItems: number;
}

export interface ReplayDrift {
  metric: keyof typeof PILOT_REPLAY_TARGETS;
  expected: number;
  actual: number;
  delta: number;
  explanation: string;
}

export interface ReplayResult {
  ok: boolean;
  knowledgeFactoryVersion: string;
  structuralParserVersion: string;
  counts: ReplayCounts;
  targets: typeof PILOT_REPLAY_TARGETS;
  drift: ReplayDrift[];
  methodology: string;
}

export function measureReplayCounts(store: CorpusStore): ReplayCounts {
  const financing = store.listSources().filter(isFinancingDoc);
  const fixtures = store.listSources().filter(isFixtureDoc);
  let structuralNodes = 0;
  let ambiguousStructuralNodes = 0;
  let covenantCandidates = 0;
  let definitions = 0;
  let dependencyEdges = 0;
  let conditionExceptionRecords = 0;
  const instruments = new Set<string>();

  for (const s of [...financing, ...fixtures]) {
    const nodes = store.loadStructuralNodes(s.sourceId);
    structuralNodes += nodes.length;
    ambiguousStructuralNodes += nodes.filter((n) => n.ambiguous).length;
    covenantCandidates += store.loadCandidates(s.sourceId).length;
    definitions += store.loadDefinitions(s.sourceId).length;
    dependencyEdges += store.loadCrossReferences(s.sourceId).length;
    conditionExceptionRecords += store.loadConditions(s.sourceId).length;
    if (s.instrumentIdentity) instruments.add(s.instrumentIdentity);
  }

  const uncertainty = (store.readJson("uncertainty-queue.json") as unknown[] | null) ?? [];

  return {
    acquiredFinancingDocuments: financing.length,
    uniqueInstrumentIdentities: instruments.size,
    structuralNodes,
    covenantCandidates,
    definitions,
    dependencyEdges,
    conditionExceptionRecords,
    fixtureDocuments: fixtures.length,
    ambiguousStructuralNodes,
    documentRelationships: store.loadRelationships().length,
    unresolvedUncertaintyItems: uncertainty.length,
  };
}

export function replayAgainstPilotTargets(store: CorpusStore): ReplayResult {
  const counts = measureReplayCounts(store);
  const drift: ReplayDrift[] = [];

  for (const [metric, expected] of Object.entries(PILOT_REPLAY_TARGETS) as Array<
    [keyof typeof PILOT_REPLAY_TARGETS, number]
  >) {
    const actual = counts[metric];
    if (actual !== expected) {
      drift.push({
        metric,
        expected,
        actual,
        delta: actual - expected,
        explanation:
          `Count drift on ${metric}: expected ${expected}, actual ${actual} ` +
          `(parser=${STRUCTURAL_INDEX_VERSION}, extraction=${KNOWLEDGE_FACTORY_VERSION}). ` +
          `Explain by source identity set and parser version; do not silently retarget.`,
      });
    }
  }

  return {
    ok: drift.length === 0,
    knowledgeFactoryVersion: KNOWLEDGE_FACTORY_VERSION,
    structuralParserVersion: STRUCTURAL_INDEX_VERSION,
    counts,
    targets: PILOT_REPLAY_TARGETS,
    drift,
    methodology:
      "Financing = sec-edgar|ehb sources excluding non-debt title false positives. " +
      "Structural/candidate/definition/edge/condition totals sum financing + fixtures (fixtures reported separately). " +
      "Instruments = distinct instrumentIdentity among that union.",
  };
}
