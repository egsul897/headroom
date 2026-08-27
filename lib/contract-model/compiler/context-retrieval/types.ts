/**
 * Phase 2D - Recursive Cross-Document Covenant Context Retrieval V1
 * (docs/phase-2d-covenant-context-retrieval.md).
 *
 * Standalone, in-memory pipeline - same precedent as Phase 2B's discovery
 * pipeline and Phase 2C's package-graph pipeline (neither is wired into
 * ContractCompilerRun's persisted stage machine either). This phase's own
 * audit (see the final report §3-6) found no clean existing persistence
 * home for a Covenant Context Bundle: UnresolvedContractItem requires an
 * already-persisted ContractRule/DefinedTermNode/ContractReferenceEdge row,
 * but this phase's input is a Phase 2B DiscoveredCandidate, which is
 * deliberately NOT a ContractRule (RULE_EXTRACTION's own, later, more
 * precise concept) - forcing that dependency here would conflate two
 * stages Phase 2B's own design kept separate. Persistence/invalidation/
 * idempotency are instead demonstrated through deterministic content-hash
 * identity over a pure function (see identity.ts), exactly the same
 * "real, testable, hash-keyed, but not yet a DB table" discipline Phase 2B
 * used for computeDiscoveryInputHash.
 */
import type { CovenantFamily } from "@prisma/client";
import type { DiscoveredCandidate } from "../discovery/types";

export type ContextItemType =
  | "OPERATIVE_SOURCE"
  | "PARENT_SCOPE"
  | "CHILD_RULE"
  | "SIBLING_CONTEXT"
  | "PROVISO"
  | "EXCEPTION"
  | "CONDITION"
  | "SHARED_CAP"
  | "DEFINITION"
  | "DEFINITION_DEPENDENCY"
  | "CALCULATION_PROVISION"
  | "ENTITY_SCOPE"
  | "CROSS_REFERENCE"
  | "CROSS_DOCUMENT_REFERENCE"
  | "AMENDMENT_LEAD"
  | "SUPPLEMENT_LEAD"
  | "INTERCREDITOR_LEAD"
  | "RELATED_COVENANT"
  | "OTHER_REQUIRED_CONTEXT";

export type RetrievalMethod = "STRUCTURAL_TRAVERSAL" | "DEFINITION_INDEX" | "CROSS_REFERENCE_INDEX" | "PACKAGE_GRAPH" | "SEMANTIC_RELEVANCE";

/** One retrieved piece of contractual evidence, with an explicit reason it is here (task §6/§27 - "why is this here, and where did it come from"). */
export interface ContextItem {
  /** Deterministic, content-derived (documentId + normalizedRef + type) - stable across rebuilds, never derived from array position (task §31). */
  itemId: string;
  type: ContextItemType;
  documentId: string;
  /** Null only for a definition whose full-text span is not itself a StructuralNode (definitions live in prose, not the lettered-clause tree Phase 2A parses). */
  structuralNodeKey: string | null;
  /** sectionRef for a structural item, or the exact defined term name for a definition/definition-dependency item. */
  normalizedRef: string;
  sourceCitation: string;
  /** Bounded excerpt - the full text where it fits the item budget, truncated with an explicit marker otherwise (task §5 - "do not store huge duplicated raw-text blobs unnecessarily"). */
  excerptText: string;
  reason: string;
  retrievalDepth: number;
  /** Chain of itemIds that led to this item being retrieved, root first. */
  retrievalPath: string[];
  retrievalMethod: RetrievalMethod;
  confidence: number | null;
}

export type DependencyEdgeType = "PARENT_OF" | "CHILD_OF" | "SIBLING_OF" | "DEFINES" | "DEPENDS_ON_DEFINITION" | "REFERENCES" | "CROSS_DOCUMENT_LEAD" | "AMENDMENT_CANDIDATE";

export interface DependencyEdge {
  fromItemId: string;
  toItemId: string;
  edgeType: DependencyEdgeType;
  reason: string;
}

export type UnresolvedDependencyType =
  | "UNRESOLVED_DEFINED_TERM"
  | "AMBIGUOUS_RELATIVE_REFERENCE"
  | "MISSING_SCHEDULE"
  | "REFERENCED_DOCUMENT_ABSENT"
  | "AMBIGUOUS_AMENDMENT_TARGET"
  | "DEFINITION_CYCLE"
  | "REFERENCE_CYCLE"
  | "BUDGET_EXCEEDED_DEPENDENCY"
  | "OTHER";

export type UnresolvedSeverity = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface UnresolvedDependency {
  originatingNodeKey: string | null;
  dependencyType: UnresolvedDependencyType;
  sourceText: string;
  attemptedResolution: string;
  reason: string;
  candidateTargets: string[];
  citation: string;
  severity: UnresolvedSeverity;
}

export type SufficiencyState = "SUFFICIENT" | "REVIEW_REQUIRED" | "INCOMPLETE" | "BUDGET_EXCEEDED";

export interface RetrievalBudget {
  maxDefinitionDepth: number;
  maxCrossReferenceDepth: number;
  maxItems: number;
  maxTextBudgetChars: number;
}

export const DEFAULT_RETRIEVAL_BUDGET: RetrievalBudget = {
  maxDefinitionDepth: 5,
  maxCrossReferenceDepth: 3,
  maxItems: 60,
  maxTextBudgetChars: 40_000,
};

export interface ContextRetrievalPerformance {
  itemsConsidered: number;
  itemsRetained: number;
  duplicatePathsDeduplicated: number;
  maxDefinitionDepthReached: number;
  maxCrossReferenceDepthReached: number;
  crossReferenceTraversals: number;
  crossDocumentLeads: number;
  deterministicWallClockMs: number;
  semanticWallClockMs: number;
  semanticCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export const RETRIEVAL_ALGORITHM_VERSION = "phase-2d-context-retrieval.v1";

export interface CovenantContextBundle {
  /** Deterministic, content-derived (never random) - see identity.ts. */
  bundleId: string;
  packageKey: string;
  companyId: string;
  instrumentKey: string | null;
  originatingDocumentId: string;
  originatingDiscoveryId: string;
  originatingStructuralNodeKeys: string[];
  normalizedSourceRef: string;
  originatingFamilies: CovenantFamily[];

  items: ContextItem[];
  edges: DependencyEdge[];
  unresolvedDependencies: UnresolvedDependency[];

  retrievalAlgorithmVersion: string;
  semanticPromptVersion: string | null;
  providerIdentity: string | null;
  /** Hash of every input this bundle's content actually depends on - the cache/invalidation identity (task §29/§31). Two builds with an unchanged contentIdentity are guaranteed to produce byte-identical items/edges/unresolvedDependencies. */
  contentIdentity: string;

  sufficiencyState: SufficiencyState;
  stopReasons: string[];

  performance: ContextRetrievalPerformance;
}

export interface BuildContextBundleInput {
  candidate: DiscoveredCandidate;
  packageKey: string;
  companyId: string;
  instrumentKey: string | null;
  budget?: RetrievalBudget;
}
