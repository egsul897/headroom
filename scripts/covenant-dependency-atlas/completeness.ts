/**
 * Phase 2 multi-metric dependency-completeness report.
 *
 * NEVER presents inventory coverage as legal completeness.
 * A missing expected priority edge category remains a gap even when the
 * inventory-derived minimum is zero.
 */

import type {
  AtlasEdge,
  CompletenessBucket,
  CompletenessMetrics,
  DependencyEdgeKind,
  DocumentCompletenessReport,
} from "./schema";
import { DEPENDENCY_EDGE_KINDS, PRIORITY_EDGE_KINDS } from "./schema";

export interface CompletenessExpectations {
  expectedMinimumByKind: Partial<Record<DependencyEdgeKind, number>>;
  gapHints: string[];
  /** Inventory units / structural sections available as potential edge sources. */
  inventoryUnitCount: number;
  /** How many inventory units produced at least one edge. */
  unitsWithEdges: number;
}

const PRIORITY = new Set<string>(PRIORITY_EDGE_KINDS);

export function buildCompletenessReport(args: {
  documentId: string;
  sourceFile: string | null;
  nodeCount: number;
  edges: AtlasEdge[];
  diamondCount: number;
  cycleCount: number;
  expectations: CompletenessExpectations;
}): DocumentCompletenessReport {
  const { documentId, sourceFile, nodeCount, edges, diamondCount, cycleCount, expectations } = args;
  const buckets: CompletenessBucket[] = [];
  const gaps: string[] = [...expectations.gapHints];

  for (const kind of DEPENDENCY_EDGE_KINDS) {
    const ofKind = edges.filter((e) => e.kind === kind);
    const observedResolved = ofKind.filter((e) => e.resolution === "RESOLVED").length;
    const observedUnresolved = ofKind.filter((e) => e.resolution === "UNRESOLVED").length;
    const observedAmbiguous = ofKind.filter((e) => e.resolution === "AMBIGUOUS").length;
    const expectedMinimum = expectations.expectedMinimumByKind[kind] ?? 0;
    const totalObserved = ofKind.length;
    const missingOrThin = expectedMinimum > 0 && totalObserved < expectedMinimum;
    const priorityGap = PRIORITY.has(kind) && totalObserved === 0;
    if (missingOrThin) {
      gaps.push(
        `${kind}: below inventory-derived minimum ${expectedMinimum}; observed ${totalObserved} (resolved=${observedResolved}, unresolved=${observedUnresolved}, ambiguous=${observedAmbiguous})`,
      );
    }
    if (priorityGap) {
      gaps.push(
        `${kind}: PRIORITY GAP — zero edges of this kind; inventory minimum may be 0 but Phase 2 still records absence as a coverage gap (not legal completeness).`,
      );
    }
    buckets.push({
      kind,
      expectedMinimum,
      observedResolved,
      observedUnresolved,
      observedAmbiguous,
      missingOrThin,
      priorityGap,
      notes: priorityGap
        ? "Priority legal-relationship kind absent — recorded as gap; does not imply legal semantic verification."
        : missingOrThin
          ? "Below inventory-derived soft minimum."
          : expectedMinimum === 0
            ? "No inventory signal required this kind; priority status checked separately."
            : "Meets inventory-derived soft minimum (inventory coverage only).",
    });
  }

  const resolvedEdgeCount = edges.filter((e) => e.resolution === "RESOLVED").length;
  const unresolvedEdgeCount = edges.filter((e) => e.resolution === "UNRESOLVED").length;
  const ambiguousEdgeCount = edges.filter((e) => e.resolution === "AMBIGUOUS").length;

  const kindsWithExpectation = buckets.filter((b) => b.expectedMinimum > 0);
  const kindsMet = kindsWithExpectation.filter((b) => !b.missingOrThin).length;
  const inventoryCoverage =
    kindsWithExpectation.length === 0 ? 1 : kindsMet / kindsWithExpectation.length;

  const edgeDiscoveryCoverage =
    expectations.inventoryUnitCount === 0
      ? 0
      : Math.min(1, expectations.unitsWithEdges / expectations.inventoryUnitCount);

  const edgeResolutionRate = edges.length === 0 ? 0 : resolvedEdgeCount / edges.length;

  const withProvenance = edges.filter(
    (e) =>
      e.sourceSpans.length > 0 &&
      e.sourceSpans.some((s) => Boolean(s.excerpt) || s.charStart != null || Boolean(s.unitId)),
  ).length;
  const sourceProvenanceCoverage = edges.length === 0 ? 0 : withProvenance / edges.length;

  const kindsPresent = new Set(edges.map((e) => e.kind));
  const dependencyTypeCoverage = DEPENDENCY_EDGE_KINDS.filter((k) => kindsPresent.has(k)).length / DEPENDENCY_EDGE_KINDS.length;

  const metrics: CompletenessMetrics = {
    inventoryCoverage: Number(inventoryCoverage.toFixed(4)),
    edgeDiscoveryCoverage: Number(edgeDiscoveryCoverage.toFixed(4)),
    edgeResolutionRate: Number(edgeResolutionRate.toFixed(4)),
    sourceProvenanceCoverage: Number(sourceProvenanceCoverage.toFixed(4)),
    dependencyTypeCoverage: Number(dependencyTypeCoverage.toFixed(4)),
    legalSemanticVerification: 0,
    legalSemanticVerificationStatus: "NOT_PERFORMED",
  };

  gaps.push(
    "LEGAL_SEMANTIC_VERIFICATION: not performed — inventory/discovery metrics must not be read as legal completeness.",
  );

  return {
    documentId,
    sourceFile,
    nodeCount,
    edgeCount: edges.length,
    resolvedEdgeCount,
    unresolvedEdgeCount,
    ambiguousEdgeCount,
    buckets,
    diamondCount,
    cycleCount,
    completenessScore: metrics.inventoryCoverage,
    metrics,
    gaps,
  };
}
