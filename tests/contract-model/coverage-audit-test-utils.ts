/**
 * Phase 2E test helpers. Reuses Phase 2D's real buildTestIndex (the same
 * real parse -> detect -> buildStructuralIndex pipeline every phase's
 * tests use) plus small builders for DiscoveredCandidate/
 * CovenantContextBundle synthetic fixtures. Test-only - never imported by
 * production coverage-audit/* modules.
 */
import type { CovenantFamily } from "@prisma/client";
import type { DiscoveredCandidate, DiscoveryRole } from "../../lib/contract-model/compiler/discovery/types";
import type { CovenantContextBundle, ContextItem, ContextItemType, UnresolvedDependency } from "../../lib/contract-model/compiler/context-retrieval/types";
import { buildTestIndex, buildExactTermsByDocument, type TestDocument } from "./context-retrieval-test-utils";

export { buildTestIndex, buildExactTermsByDocument };
export type { TestDocument };

let seq = 0;
export function makeCandidate(overrides: Partial<DiscoveredCandidate> & { documentId: string; structuralNodeKeys: string[]; structuralNodeIds: string[]; normalizedSourceRef: string }): DiscoveredCandidate {
  seq++;
  return {
    discoveryId: `discovery-candidate:test-${seq}`,
    families: ["INDEBTEDNESS"] as CovenantFamily[],
    role: "BASKET" as DiscoveryRole,
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "synthetic test candidate",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 0.9,
    sourceCitation: `${overrides.documentId}::${overrides.normalizedSourceRef}`,
    discoveryRunVersion: "test",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "test fixture - no real supersession index applied",
    ...overrides,
  };
}

export function makeContextItem(overrides: Partial<ContextItem> & { type: ContextItemType; documentId: string; normalizedRef: string }): ContextItem {
  return {
    itemId: `item:${overrides.documentId}:${overrides.normalizedRef}:${overrides.type}`,
    structuralNodeKey: null,
    structuralNodeId: null,
    sourceCitation: `${overrides.documentId}::${overrides.normalizedRef}`,
    excerptText: "synthetic excerpt",
    reason: "synthetic test item",
    retrievalDepth: 1,
    retrievalPath: [],
    retrievalMethod: "STRUCTURAL_TRAVERSAL",
    confidence: 1,
    ...overrides,
  };
}

export function makeBundle(overrides: Partial<CovenantContextBundle> & { originatingDocumentId: string; originatingStructuralNodeKeys: string[]; originatingStructuralNodeIds: string[]; normalizedSourceRef: string }): CovenantContextBundle {
  return {
    bundleId: `bundle:${overrides.originatingDocumentId}:${overrides.normalizedSourceRef}`,
    packageKey: "test-package",
    companyId: "test-company",
    instrumentKey: null,
    originatingDiscoveryId: `discovery-candidate:${overrides.normalizedSourceRef}`,
    originatingFamilies: ["INDEBTEDNESS"] as CovenantFamily[],
    items: [],
    edges: [],
    unresolvedDependencies: [],
    retrievalAlgorithmVersion: "test",
    semanticPromptVersion: null,
    providerIdentity: null,
    contentIdentity: "test",
    sufficiencyState: "SUFFICIENT",
    stopReasons: [],
    performance: { itemsConsidered: 0, itemsRetained: 0, duplicatePathsDeduplicated: 0, maxDefinitionDepthReached: 0, maxCrossReferenceDepthReached: 0, crossReferenceTraversals: 0, crossDocumentLeads: 0, deterministicWallClockMs: 0, semanticWallClockMs: 0, semanticCalls: 0, inputTokens: 0, outputTokens: 0 },
    ...overrides,
  };
}

/** Removes any bundle item matching (type, normalizedRef) - simulates "Phase 2D never retrieved this" for fault injection (task §25). */
export function removeItem(bundle: CovenantContextBundle, type: ContextItemType, normalizedRef: string): CovenantContextBundle {
  return { ...bundle, items: bundle.items.filter((i) => !(i.type === type && i.normalizedRef === normalizedRef)) };
}

/** Removes an unresolvedDependency entry - simulates a silently-dropped unresolved-dependency signal (task §25/§26). */
export function removeUnresolved(bundle: CovenantContextBundle, sourceText: string): CovenantContextBundle {
  return { ...bundle, unresolvedDependencies: bundle.unresolvedDependencies.filter((u) => u.sourceText !== sourceText) };
}

export function addUnresolved(bundle: CovenantContextBundle, entry: Partial<UnresolvedDependency> & { sourceText: string }): CovenantContextBundle {
  const full: UnresolvedDependency = { originatingNodeKey: null, dependencyType: "OTHER", attemptedResolution: "test", reason: "test", candidateTargets: [], citation: entry.sourceText, severity: "LOW", ...entry };
  return { ...bundle, unresolvedDependencies: [...bundle.unresolvedDependencies, full] };
}
