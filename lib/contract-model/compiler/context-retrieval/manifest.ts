/**
 * Machine-readable context completeness manifest.
 *
 * Proves what was retrieved for a covenant context bundle: root provision,
 * source spans, definition dependency graph, missing/ambiguous deps,
 * operative authority status, budget accounting, sufficiency, and provenance.
 * Derived purely from an already-built CovenantContextBundle — never a second
 * retrieval pass.
 */
import type { CovenantContextBundle, ContextItem, SufficiencyState, UnresolvedDependency } from "./types";

export type OperativeAuthorityStatus =
  | "CURRENT"
  | "KNOWN_SUPERSEDED"
  | "UNRESOLVED"
  | "AMBIGUOUS"
  | "PARTIAL_AMENDMENT"
  | "UNKNOWN";

export interface ContextManifestSourceSpan {
  itemId: string;
  type: string;
  documentId: string;
  structuralNodeId: string | null;
  normalizedRef: string;
  charLength: number;
  retrievalDepth: number;
  retrievalMethod: string;
  evidenceStatus: string | null;
  isCurrentTruth: boolean | null;
}

export interface ContextManifestDefinitionNode {
  term: string;
  itemId: string;
  documentId: string;
  depth: number;
  dependsOn: string[];
  dependedOnBy: string[];
}

export interface ContextManifestBudgetAccounting {
  maxItems: number | null;
  maxTextBudgetChars: number | null;
  maxDefinitionDepth: number | null;
  maxCrossReferenceDepth: number | null;
  itemsRetained: number;
  textCharsUsed: number;
  maxDefinitionDepthReached: number;
  maxCrossReferenceDepthReached: number;
  duplicatePathsDeduplicated: number;
  stopReasons: string[];
  continuationSupported: true;
}

export interface ContextCompletenessManifest {
  manifestVersion: "headroom-context-manifest.v1";
  bundleId: string;
  contentIdentity: string;
  retrievalAlgorithmVersion: string;
  rootProvision: {
    discoveryId: string;
    documentId: string;
    normalizedSourceRef: string;
    structuralNodeIds: string[];
    families: string[];
    supersessionStatus: string;
  };
  sourceSpans: ContextManifestSourceSpan[];
  definitionDependencyGraph: ContextManifestDefinitionNode[];
  retrievedDependencies: {
    definitions: string[];
    crossReferences: string[];
    structuralContext: string[];
    amendmentLeads: string[];
    other: string[];
  };
  missingDependencies: Array<{
    dependencyType: string;
    sourceText: string;
    severity: string;
    reason: string;
    citation: string;
  }>;
  ambiguities: Array<{
    dependencyType: string;
    sourceText: string;
    candidateTargets: string[];
    severity: string;
    reason: string;
  }>;
  operativeAuthorityStatus: OperativeAuthorityStatus;
  hasUnresolvedOperativeEvidence: boolean;
  budgetAccounting: ContextManifestBudgetAccounting;
  sufficiencyClassification: SufficiencyState;
  provenance: {
    packageKey: string;
    companyId: string;
    instrumentKey: string | null;
    originatingDiscoveryId: string;
    originatingSupersessionReason: string;
    providerIdentity: string | null;
    semanticPromptVersion: string | null;
  };
}

function operativeAuthorityFromBundle(bundle: CovenantContextBundle): OperativeAuthorityStatus {
  if (bundle.originatingSupersessionStatus === "KNOWN_SUPERSEDED") return "KNOWN_SUPERSEDED";
  const operative = bundle.items.find((i) => i.type === "OPERATIVE_SOURCE");
  const status = operative?.evidenceState?.status;
  if (!status) return bundle.hasUnresolvedOperativeEvidence ? "UNRESOLVED" : "UNKNOWN";
  if (status === "CURRENT") return "CURRENT";
  if (status === "KNOWN_SUPERSEDED") return "KNOWN_SUPERSEDED";
  if (status === "AMBIGUOUS_TARGET") return "AMBIGUOUS";
  if (status === "PARTIAL_AMENDMENT") return "PARTIAL_AMENDMENT";
  if (status === "OPERATIVE_STATE_UNRESOLVED" || status === "HISTORICAL_ONLY") return "UNRESOLVED";
  return "UNKNOWN";
}

function isDefinitionItem(item: ContextItem): boolean {
  return item.type === "DEFINITION" || item.type === "DEFINITION_DEPENDENCY";
}

export function buildContextCompletenessManifest(bundle: CovenantContextBundle): ContextCompletenessManifest {
  const defItems = bundle.items.filter(isDefinitionItem);
  const defByItemId = new Map(defItems.map((i) => [i.itemId, i]));
  const dependsOn = new Map<string, Set<string>>();
  const dependedOnBy = new Map<string, Set<string>>();
  for (const edge of bundle.edges) {
    if (edge.edgeType !== "DEPENDS_ON_DEFINITION") continue;
    if (!defByItemId.has(edge.toItemId)) continue;
    const fromTerm = defByItemId.get(edge.fromItemId)?.normalizedRef;
    const toTerm = defByItemId.get(edge.toItemId)?.normalizedRef;
    // Edges may originate from OPERATIVE_SOURCE — still record the target's inbound.
    if (toTerm) {
      if (fromTerm) {
        const set = dependsOn.get(fromTerm) ?? new Set();
        set.add(toTerm);
        dependsOn.set(fromTerm, set);
      }
      const inbound = dependedOnBy.get(toTerm) ?? new Set();
      if (fromTerm) inbound.add(fromTerm);
      else inbound.add("(root)");
      dependedOnBy.set(toTerm, inbound);
    }
  }

  const definitionDependencyGraph: ContextManifestDefinitionNode[] = defItems.map((item) => ({
    term: item.normalizedRef,
    itemId: item.itemId,
    documentId: item.documentId,
    depth: item.retrievalDepth,
    dependsOn: [...(dependsOn.get(item.normalizedRef) ?? [])].sort(),
    dependedOnBy: [...(dependedOnBy.get(item.normalizedRef) ?? [])].sort(),
  }));

  const retrievedDependencies = {
    definitions: defItems.map((i) => i.normalizedRef).sort(),
    crossReferences: bundle.items.filter((i) => i.type === "CROSS_REFERENCE" || i.type === "CALCULATION_PROVISION" || i.type === "CROSS_DOCUMENT_REFERENCE").map((i) => i.normalizedRef).sort(),
    structuralContext: bundle.items.filter((i) => ["PARENT_SCOPE", "CHILD_RULE", "SIBLING_CONTEXT", "PROVISO", "EXCEPTION", "CONDITION", "SHARED_CAP"].includes(i.type)).map((i) => i.normalizedRef).sort(),
    amendmentLeads: bundle.items.filter((i) => i.type === "AMENDMENT_LEAD" || i.type === "SUPPLEMENT_LEAD" || i.type === "INTERCREDITOR_LEAD").map((i) => i.normalizedRef).sort(),
    other: bundle.items.filter((i) => i.type === "RELATED_COVENANT" || i.type === "OTHER_REQUIRED_CONTEXT" || i.type === "UNVERIFIED_SIBLING_SIGNAL" || i.type === "ENTITY_SCOPE").map((i) => i.normalizedRef).sort(),
  };

  const missingDependencies = bundle.unresolvedDependencies
    .filter((u) => u.dependencyType !== "AMBIGUOUS_RELATIVE_REFERENCE" && u.dependencyType !== "DEFINITION_CYCLE" && u.dependencyType !== "REFERENCE_CYCLE")
    .map((u: UnresolvedDependency) => ({
      dependencyType: u.dependencyType,
      sourceText: u.sourceText,
      severity: u.severity,
      reason: u.reason,
      citation: u.citation,
    }));

  const ambiguities = bundle.unresolvedDependencies
    .filter((u) => u.dependencyType === "AMBIGUOUS_RELATIVE_REFERENCE" || u.dependencyType === "AMBIGUOUS_AMENDMENT_TARGET" || u.dependencyType === "DEFINITION_CYCLE")
    .map((u) => ({
      dependencyType: u.dependencyType,
      sourceText: u.sourceText,
      candidateTargets: u.candidateTargets,
      severity: u.severity,
      reason: u.reason,
    }));

  const textCharsUsed = bundle.items.reduce((sum, i) => sum + i.excerptText.length, 0);

  return {
    manifestVersion: "headroom-context-manifest.v1",
    bundleId: bundle.bundleId,
    contentIdentity: bundle.contentIdentity,
    retrievalAlgorithmVersion: bundle.retrievalAlgorithmVersion,
    rootProvision: {
      discoveryId: bundle.originatingDiscoveryId,
      documentId: bundle.originatingDocumentId,
      normalizedSourceRef: bundle.normalizedSourceRef,
      structuralNodeIds: bundle.originatingStructuralNodeIds,
      families: bundle.originatingFamilies,
      supersessionStatus: bundle.originatingSupersessionStatus,
    },
    sourceSpans: bundle.items.map((item) => ({
      itemId: item.itemId,
      type: item.type,
      documentId: item.documentId,
      structuralNodeId: item.structuralNodeId,
      normalizedRef: item.normalizedRef,
      charLength: item.excerptText.length,
      retrievalDepth: item.retrievalDepth,
      retrievalMethod: item.retrievalMethod,
      evidenceStatus: item.evidenceState?.status ?? null,
      isCurrentTruth: item.evidenceState?.isCurrentTruth ?? null,
    })),
    definitionDependencyGraph,
    retrievedDependencies,
    missingDependencies,
    ambiguities,
    operativeAuthorityStatus: operativeAuthorityFromBundle(bundle),
    hasUnresolvedOperativeEvidence: bundle.hasUnresolvedOperativeEvidence === true,
    budgetAccounting: {
      maxItems: null,
      maxTextBudgetChars: null,
      maxDefinitionDepth: null,
      maxCrossReferenceDepth: null,
      itemsRetained: bundle.performance.itemsRetained,
      textCharsUsed,
      maxDefinitionDepthReached: bundle.performance.maxDefinitionDepthReached,
      maxCrossReferenceDepthReached: bundle.performance.maxCrossReferenceDepthReached,
      duplicatePathsDeduplicated: bundle.performance.duplicatePathsDeduplicated,
      stopReasons: bundle.stopReasons,
      continuationSupported: true,
    },
    sufficiencyClassification: bundle.sufficiencyState,
    provenance: {
      packageKey: bundle.packageKey,
      companyId: bundle.companyId,
      instrumentKey: bundle.instrumentKey,
      originatingDiscoveryId: bundle.originatingDiscoveryId,
      originatingSupersessionReason: bundle.originatingSupersessionReason,
      providerIdentity: bundle.providerIdentity,
      semanticPromptVersion: bundle.semanticPromptVersion,
    },
  };
}
