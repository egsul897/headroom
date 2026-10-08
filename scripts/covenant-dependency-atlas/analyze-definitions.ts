/**
 * Subtype analysis for MISSING_DEFINITION unresolved edges.
 * Coordinates with Definition Encyclopedia / Structural Compiler findings
 * without modifying production parsers.
 */

import type { AtlasEdge, AtlasNode } from "./schema";

export type DefinitionSubtype =
  | "TRULY_MISSING_DEFINITION"
  | "DEFINITION_IN_ANOTHER_DOCUMENT"
  | "FORWARDING_DEFINITION"
  | "INCORRECT_EXTRACTION_BOUNDARY"
  | "ALIAS_OR_PLURALIZATION"
  | "NON_DEFINITION_REFERENCE"
  | "INCORRECT_CANDIDATE_EDGE";

export interface DefinitionSubtypeRow {
  edgeId: string;
  documentId: string;
  kind: string;
  subtype: DefinitionSubtype;
  evidence: string;
  unresolvedReason: string | null;
  rationale: string;
  sourceExcerpt: string | null;
}

export interface DefinitionSubtypeReport {
  totalMissingDefinition: number;
  bySubtype: Record<DefinitionSubtype, number>;
  examples: DefinitionSubtypeRow[];
  coordinationNotes: string[];
}

function classifySubtype(edge: AtlasEdge, nodes: Map<string, AtlasNode>): DefinitionSubtype {
  const reason = `${edge.unresolvedReason ?? ""} ${edge.rationale}`.toLowerCase();
  const to = nodes.get(edge.toNodeId);
  const excerpt = (edge.sourceSpans[0]?.excerpt ?? "").toLowerCase();

  if (/incorrect|false positive|spurious|non-required/.test(reason)) return "INCORRECT_CANDIDATE_EDGE";
  if (/has the meaning|assigned to such term|set forth in (the definition|section)|meaning specified/.test(excerpt) || /forwarding/.test(reason)) {
    return "FORWARDING_DEFINITION";
  }
  if (/outside (this|the) (document|package)|another document|cross.document|security agreement|intercreditor/.test(reason)) {
    return "DEFINITION_IN_ANOTHER_DOCUMENT";
  }
  if (/plural|alias|also known|hereinafter|collectively/.test(excerpt) || /normalized|alias/.test(reason)) {
    return "ALIAS_OR_PLURALIZATION";
  }
  if (/charend|span|boundary|truncated|excerpt-only|declaration match/.test(reason)) {
    return "INCORRECT_EXTRACTION_BOUNDARY";
  }
  // Bare section/article references dressed as definition edges
  if (/^section\s+\d|^article\s+|exhibit\s+/i.test(to?.label ?? "") || /section reference mistaken|not a defined term/.test(reason)) {
    return "NON_DEFINITION_REFERENCE";
  }
  if (edge.kind === "COVENANT_TO_CROSS_DOCUMENT") return "DEFINITION_IN_ANOTHER_DOCUMENT";
  return "TRULY_MISSING_DEFINITION";
}

export function analyzeMissingDefinitions(edges: AtlasEdge[], nodes: AtlasNode[]): DefinitionSubtypeReport {
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));
  const missing = edges.filter((e) => {
    if (e.resolution !== "UNRESOLVED" && e.resolution !== "AMBIGUOUS") return false;
    if (e.rootCause === "MISSING_DEFINITION") return true;
    return e.kind === "COVENANT_TO_DEFINITION" || e.kind === "DEFINITION_TO_DEFINITION";
  });

  const bySubtype: Record<DefinitionSubtype, number> = {
    TRULY_MISSING_DEFINITION: 0,
    DEFINITION_IN_ANOTHER_DOCUMENT: 0,
    FORWARDING_DEFINITION: 0,
    INCORRECT_EXTRACTION_BOUNDARY: 0,
    ALIAS_OR_PLURALIZATION: 0,
    NON_DEFINITION_REFERENCE: 0,
    INCORRECT_CANDIDATE_EDGE: 0,
  };

  const rows: DefinitionSubtypeRow[] = [];
  for (const e of missing) {
    const subtype = classifySubtype(e, nodeMap);
    bySubtype[subtype] += 1;
    rows.push({
      edgeId: e.edgeId,
      documentId: e.sourceSpans[0]?.documentId ?? "unknown",
      kind: e.kind,
      subtype,
      evidence: `subtype=${subtype}`,
      unresolvedReason: e.unresolvedReason,
      rationale: e.rationale,
      sourceExcerpt: e.sourceSpans[0]?.excerpt ?? null,
    });
  }

  // Prefer diverse examples
  const examples: DefinitionSubtypeRow[] = [];
  const seen = new Set<DefinitionSubtype>();
  for (const row of rows) {
    if (seen.has(row.subtype)) continue;
    examples.push(row);
    seen.add(row.subtype);
    if (seen.size >= 7) break;
  }
  for (const row of rows) {
    if (examples.length >= 14) break;
    if (!examples.some((e) => e.edgeId === row.edgeId)) examples.push(row);
  }

  return {
    totalMissingDefinition: missing.length,
    bySubtype,
    examples,
    coordinationNotes: [
      "Definition Encyclopedia: forwarding declarations need one-hop body resolution with provenance.",
      "Structural Compiler: declaration charEnd ends at 'means' — Atlas uses definitionExcerpt/body window; production span change requires coordination.",
      "Truly missing vs another-document: do not invent targets; preserve UNRESOLVED.",
      "Alias/pluralization: coordinate normalized-term identity with encyclopedia; no unsupported merge.",
    ],
  };
}
