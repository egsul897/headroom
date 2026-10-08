/**
 * Independent validation of definition dependency edges.
 *
 * Classifies each reported edge as direct defined-term reference, forwarding
 * reference, mere lexical match risk, amendment relationship, or unresolved.
 */

import type { DefinitionExample, DependencyGraphEdge } from "./schema";

export type DependencyEdgeClass =
  | "DIRECT_DEFINED_TERM_REFERENCE"
  | "FORWARDING_REFERENCE"
  | "INDIRECT_VIA_SHARED_FAMILY"
  | "MERE_LEXICAL_MATCH_RISK"
  | "AMENDMENT_RELATIONSHIP"
  | "UNRESOLVED_REFERENCE"
  | "SELF_LOOP"
  | "UNKNOWN";

export interface ValidatedDependencyEdge {
  edge: DependencyGraphEdge;
  classification: DependencyEdgeClass;
  evidenceExcerpt: string | null;
  notes: string[];
}

export interface DependencyAuditReport {
  reportedEdgeCount: number;
  validated: ValidatedDependencyEdge[];
  countsByClass: Record<DependencyEdgeClass, number>;
  diamondPatterns: Array<{ hubNormalizedTerm: string; parents: string[]; children: string[] }>;
  cycles: string[][];
  mereLexicalMatchRiskCount: number;
  directReferenceCount: number;
}

function classifyEdge(edge: DependencyGraphEdge, byId: Map<string, DefinitionExample>): ValidatedDependencyEdge {
  const from = byId.get(edge.fromExampleId);
  if (!from) {
    return {
      edge,
      classification: "UNRESOLVED_REFERENCE",
      evidenceExcerpt: null,
      notes: ["fromExampleId not found in corpus."],
    };
  }
  if (from.normalizedTerm === edge.toNormalizedTerm) {
    return { edge, classification: "SELF_LOOP", evidenceExcerpt: null, notes: ["Edge points at self term."] };
  }

  if (from.declarationKind === "FORWARDING") {
    return {
      edge,
      classification: "FORWARDING_REFERENCE",
      evidenceExcerpt: from.exactText.slice(0, 180).replace(/\s+/g, " "),
      notes: ["Source definition is FORWARDING; edge may reflect target mention rather than economic dependency."],
    };
  }

  const body = from.exactText;
  const lower = body.toLowerCase();
  const idx = lower.indexOf(edge.toNormalizedTerm);
  if (idx < 0) {
    return {
      edge,
      classification: "UNRESOLVED_REFERENCE",
      evidenceExcerpt: null,
      notes: ["Dependency term not found as substring in source exactText — stale or lexical miss."],
    };
  }

  const before = idx === 0 ? " " : lower[idx - 1]!;
  const after = idx + edge.toNormalizedTerm.length >= lower.length ? " " : lower[idx + edge.toNormalizedTerm.length]!;
  const boundaryOk = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
  const excerpt = body.slice(Math.max(0, idx - 40), Math.min(body.length, idx + edge.toNormalizedTerm.length + 40)).replace(/\s+/g, " ");

  // Mere lexical match risk: short terms or inside larger tokens despite boundary check failures.
  if (!boundaryOk || edge.toNormalizedTerm.length < 6) {
    return {
      edge,
      classification: "MERE_LEXICAL_MATCH_RISK",
      evidenceExcerpt: excerpt,
      notes: boundaryOk
        ? ["Short dependency token — elevated lexical false-positive risk."]
        : ["Match fails word-boundary check — likely mere lexical overlap."],
    };
  }

  // Quoted or means-context strengthens direct reference.
  const window = lower.slice(Math.max(0, idx - 30), idx + edge.toNormalizedTerm.length + 30);
  const looksDefined = /["“”]/.test(window) || /\b(?:means|definition|defined|section)\b/.test(window);
  if (edge.toExampleId) {
    return {
      edge,
      classification: "DIRECT_DEFINED_TERM_REFERENCE",
      evidenceExcerpt: excerpt,
      notes: looksDefined
        ? ["Resolved to same-source definition example; mention has definitional context."]
        : ["Resolved to same-source definition example via bounded term match."],
    };
  }

  if (edge.canonicalFamily && edge.canonicalFamily !== from.canonicalTerm) {
    return {
      edge,
      classification: "INDIRECT_VIA_SHARED_FAMILY",
      evidenceExcerpt: excerpt,
      notes: ["Target is a priority-family term but no same-source exampleId was resolved."],
    };
  }

  return {
    edge,
    classification: "DIRECT_DEFINED_TERM_REFERENCE",
    evidenceExcerpt: excerpt,
    notes: ["Bounded term mention without same-source example resolution."],
  };
}

function findCycles(edges: DependencyGraphEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.toExampleId) continue;
    const list = adj.get(e.fromExampleId) ?? [];
    list.push(e.toExampleId);
    adj.set(e.fromExampleId, list);
  }
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(n: string) {
    if (visiting.has(n)) {
      const i = stack.indexOf(n);
      if (i >= 0) cycles.push(stack.slice(i).concat(n));
      return;
    }
    if (visited.has(n)) return;
    visiting.add(n);
    stack.push(n);
    for (const m of adj.get(n) ?? []) dfs(m);
    stack.pop();
    visiting.delete(n);
    visited.add(n);
  }
  for (const n of adj.keys()) dfs(n);
  return cycles.slice(0, 50);
}

function findDiamonds(edges: DependencyGraphEdge[], byId: Map<string, DefinitionExample>) {
  // Diamond: two parents share two distinct children (A→C, A→D, B→C, B→D) simplified as hub with ≥2 parents and ≥2 children via term labels.
  const parentsOf = new Map<string, Set<string>>();
  const childrenOf = new Map<string, Set<string>>();
  for (const e of edges) {
    const from = byId.get(e.fromExampleId)?.normalizedTerm;
    if (!from) continue;
    const parents = parentsOf.get(e.toNormalizedTerm) ?? new Set();
    parents.add(from);
    parentsOf.set(e.toNormalizedTerm, parents);
    const children = childrenOf.get(from) ?? new Set();
    children.add(e.toNormalizedTerm);
    childrenOf.set(from, children);
  }
  const diamonds: Array<{ hubNormalizedTerm: string; parents: string[]; children: string[] }> = [];
  for (const [hub, parents] of parentsOf) {
    if (parents.size < 2) continue;
    const childUnion = new Set<string>();
    for (const p of parents) for (const c of childrenOf.get(p) ?? []) childUnion.add(c);
    if (childUnion.size >= 2) {
      diamonds.push({ hubNormalizedTerm: hub, parents: [...parents], children: [...childUnion] });
    }
  }
  return diamonds.slice(0, 40);
}

export function auditDependencyEdges(args: {
  definitions: DefinitionExample[];
  edges: DependencyGraphEdge[];
}): DependencyAuditReport {
  const byId = new Map(args.definitions.map((d) => [d.exampleId, d]));
  const validated = args.edges.map((e) => classifyEdge(e, byId));
  const countsByClass = {
    DIRECT_DEFINED_TERM_REFERENCE: 0,
    FORWARDING_REFERENCE: 0,
    INDIRECT_VIA_SHARED_FAMILY: 0,
    MERE_LEXICAL_MATCH_RISK: 0,
    AMENDMENT_RELATIONSHIP: 0,
    UNRESOLVED_REFERENCE: 0,
    SELF_LOOP: 0,
    UNKNOWN: 0,
  } as Record<DependencyEdgeClass, number>;
  for (const v of validated) countsByClass[v.classification] += 1;

  return {
    reportedEdgeCount: args.edges.length,
    validated,
    countsByClass,
    diamondPatterns: findDiamonds(args.edges, byId),
    cycles: findCycles(args.edges),
    mereLexicalMatchRiskCount: countsByClass.MERE_LEXICAL_MATCH_RISK,
    directReferenceCount: countsByClass.DIRECT_DEFINED_TERM_REFERENCE,
  };
}
