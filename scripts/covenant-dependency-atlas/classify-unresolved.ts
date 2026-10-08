/**
 * Root-cause classification for unresolved / ambiguous atlas edges.
 * Does not promote any edge to RESOLVED — classification only.
 */

import type { AtlasEdge, RootCauseCode } from "./schema";
import { ROOT_CAUSE_CODES } from "./schema";

export interface ClassifiedUnresolved {
  edgeId: string;
  kind: AtlasEdge["kind"];
  resolution: "UNRESOLVED" | "AMBIGUOUS";
  rootCause: RootCauseCode;
  controllingRestrictionRisk: boolean;
  unresolvedReason: string | null;
  rationale: string;
  sourceSpans: AtlasEdge["sourceSpans"];
  documentId: string;
}

export interface RootCauseReport {
  totalUnresolved: number;
  totalAmbiguous: number;
  byRootCause: Record<RootCauseCode, number>;
  controllingRestrictionRiskCount: number;
  examples: ClassifiedUnresolved[];
  all: ClassifiedUnresolved[];
}

const CONTROLLING_KINDS = new Set([
  "COVENANT_TO_EXCEPTION",
  "COVENANT_TO_CONDITION",
  "COVENANT_TO_SHARED_BASKET",
  "COVENANT_TO_CROSS_DOCUMENT",
  "RECLASSIFICATION",
  "ENTITY_SCOPE",
  "RATIO_CALCULATION",
  "COVENANT_TO_AMENDMENT",
]);

export function classifyRootCause(edge: AtlasEdge): RootCauseCode {
  if (edge.resolution === "AMBIGUOUS") return "AMBIGUOUS_REFERENCE";
  if (edge.rootCause) return edge.rootCause;

  const reason = `${edge.unresolvedReason ?? ""} ${edge.rationale}`.toLowerCase();
  const to = edge.toNodeId.toLowerCase();

  if (edge.kind === "ENTITY_SCOPE" || /entity.scope/.test(reason)) return "ENTITY_SCOPE_UNCERTAINTY";
  if (edge.kind === "COVENANT_TO_CROSS_DOCUMENT" || to.includes("cross_document") || /outside (this|the) (document|package)|security agreements|intercreditor/.test(reason)) {
    return "MISSING_EXTERNAL_DOCUMENT";
  }
  if (edge.kind === "COVENANT_TO_AMENDMENT" || /amendment target|amended section|not inventory-local to amendment/.test(reason)) {
    return "AMENDMENT_TARGET_RESOLUTION";
  }
  if (/no definition unit|lacks a definition|missing definition|term '.*' not declared/.test(reason) || edge.kind === "COVENANT_TO_DEFINITION" || edge.kind === "DEFINITION_TO_DEFINITION") {
    if (/incorrect|false positive|spurious/.test(reason)) return "INCORRECT_CANDIDATE_EDGE";
    return "MISSING_DEFINITION";
  }
  if (/structural|parse|parser|no inventory-resolvable parent|section .* not present/.test(reason)) {
    return "STRUCTURAL_PARSING_FAILURE";
  }
  if (/incorrect|false positive|spurious|non-required/.test(reason)) return "INCORRECT_CANDIDATE_EDGE";
  return "OTHER";
}

export function classifyUnresolvedEdges(edges: AtlasEdge[]): RootCauseReport {
  const open = edges.filter((e) => e.resolution === "UNRESOLVED" || e.resolution === "AMBIGUOUS");
  const byRootCause = Object.fromEntries(ROOT_CAUSE_CODES.map((c) => [c, 0])) as Record<RootCauseCode, number>;
  const all: ClassifiedUnresolved[] = [];

  for (const e of open) {
    const rootCause = classifyRootCause(e);
    byRootCause[rootCause] += 1;
    const controllingRestrictionRisk =
      e.controllingRestrictionRisk ||
      (CONTROLLING_KINDS.has(e.kind) && (rootCause === "MISSING_EXTERNAL_DOCUMENT" || rootCause === "AMBIGUOUS_REFERENCE" || rootCause === "AMENDMENT_TARGET_RESOLUTION" || rootCause === "ENTITY_SCOPE_UNCERTAINTY"));
    const documentId = e.sourceSpans[0]?.documentId ?? "unknown";
    all.push({
      edgeId: e.edgeId,
      kind: e.kind,
      resolution: e.resolution as "UNRESOLVED" | "AMBIGUOUS",
      rootCause,
      controllingRestrictionRisk,
      unresolvedReason: e.unresolvedReason,
      rationale: e.rationale,
      sourceSpans: e.sourceSpans,
      documentId,
    });
  }

  // Prefer controlling-risk examples, then one per root cause.
  const examples: ClassifiedUnresolved[] = [];
  const seenCause = new Set<RootCauseCode>();
  for (const row of all.filter((r) => r.controllingRestrictionRisk)) {
    if (examples.length >= 12) break;
    examples.push(row);
    seenCause.add(row.rootCause);
  }
  for (const row of all) {
    if (seenCause.has(row.rootCause)) continue;
    examples.push(row);
    seenCause.add(row.rootCause);
    if (seenCause.size >= ROOT_CAUSE_CODES.length) break;
  }

  return {
    totalUnresolved: open.filter((e) => e.resolution === "UNRESOLVED").length,
    totalAmbiguous: open.filter((e) => e.resolution === "AMBIGUOUS").length,
    byRootCause,
    controllingRestrictionRiskCount: all.filter((r) => r.controllingRestrictionRisk).length,
    examples,
    all,
  };
}

/** Annotate edges in place (returns new array) with rootCause + risk flags. */
export function annotateEdgesWithRootCause(edges: AtlasEdge[]): AtlasEdge[] {
  return edges.map((e) => {
    if (e.resolution === "RESOLVED") {
      return { ...e, rootCause: e.rootCause ?? null, controllingRestrictionRisk: e.controllingRestrictionRisk ?? false };
    }
    const rootCause = classifyRootCause(e);
    const controllingRestrictionRisk =
      e.controllingRestrictionRisk ||
      (CONTROLLING_KINDS.has(e.kind) &&
        (rootCause === "MISSING_EXTERNAL_DOCUMENT" ||
          rootCause === "AMBIGUOUS_REFERENCE" ||
          rootCause === "AMENDMENT_TARGET_RESOLUTION" ||
          rootCause === "ENTITY_SCOPE_UNCERTAINTY"));
    return { ...e, rootCause, controllingRestrictionRisk };
  });
}
