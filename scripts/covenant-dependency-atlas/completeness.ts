/**
 * Per-document dependency-completeness report.
 *
 * Measures missing or thin coverage per edge kind against inventory-derived
 * expectations (from ground-truth unit types / notes), without claiming
 * certification completeness.
 */

import type {
  AtlasEdge,
  CompletenessBucket,
  DependencyEdgeKind,
  DocumentCompletenessReport,
} from "./schema";
import { DEPENDENCY_EDGE_KINDS } from "./schema";

export interface CompletenessExpectations {
  /** Soft minimums derived from inventory signals; 0 means "not expected". */
  expectedMinimumByKind: Partial<Record<DependencyEdgeKind, number>>;
  gapHints: string[];
}

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
    const missingOrThin = expectedMinimum > 0 && observedResolved + observedUnresolved + observedAmbiguous < expectedMinimum;
    if (missingOrThin) {
      gaps.push(
        `${kind}: expected at least ${expectedMinimum} source-backed edge(s) from inventory signals; observed ${ofKind.length} (resolved=${observedResolved}, unresolved=${observedUnresolved}, ambiguous=${observedAmbiguous})`,
      );
    }
    buckets.push({
      kind,
      expectedMinimum,
      observedResolved,
      observedUnresolved,
      observedAmbiguous,
      missingOrThin,
      notes:
        expectedMinimum === 0
          ? "No inventory signal required this kind for this document."
          : missingOrThin
            ? "Below inventory-derived expectation — incomplete atlas coverage for this kind."
            : "Meets inventory-derived soft minimum.",
    });
  }

  const resolvedEdgeCount = edges.filter((e) => e.resolution === "RESOLVED").length;
  const unresolvedEdgeCount = edges.filter((e) => e.resolution === "UNRESOLVED").length;
  const ambiguousEdgeCount = edges.filter((e) => e.resolution === "AMBIGUOUS").length;

  const kindsWithExpectation = buckets.filter((b) => b.expectedMinimum > 0);
  const kindsMet = kindsWithExpectation.filter((b) => !b.missingOrThin).length;
  const completenessScore =
    kindsWithExpectation.length === 0 ? 1 : kindsMet / kindsWithExpectation.length;

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
    completenessScore: Number(completenessScore.toFixed(4)),
    gaps,
  };
}
