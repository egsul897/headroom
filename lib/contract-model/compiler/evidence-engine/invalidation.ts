/**
 * Incremental invalidation. An output is invalidated only through its own
 * dependency ancestors. One changed clause does not invalidate an unrelated
 * clause. An uncertain ancestor blocks reuse of its dependents.
 */
export type DependencyNodeKind =
  | "CLAUSE"
  | "DEFINITION"
  | "AMENDMENT"
  | "PARSER"
  | "PROMPT"
  | "SCHEMA"
  | "MODEL"
  | "OPERATIVE_SOURCE"
  | "STAGE_OUTPUT";

export interface DependencyNode {
  id: string;
  kind: DependencyNodeKind;
  /** STAGE_OUTPUT nodes are the cached artifacts. Other kinds are inputs. */
  uncertain?: boolean;
}

export interface DependencyEdge {
  /** The input the output depends on. */
  from: string;
  /** The stage output, or an intermediate input. */
  to: string;
}

export interface EvidenceDependencyGraph {
  nodes: readonly DependencyNode[];
  edges: readonly DependencyEdge[];
}

export interface InvalidationPlan {
  invalidated: string[];
  preserved: string[];
  blockedUncertain: string[];
}

export function planInvalidation(args: {
  graph: EvidenceDependencyGraph;
  previousHashByNode: ReadonlyMap<string, string>;
  currentHashByNode: ReadonlyMap<string, string>;
}): InvalidationPlan {
  const byId = new Map(args.graph.nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string[]>();
  for (const edge of args.graph.edges) {
    const list = parents.get(edge.to) ?? [];
    list.push(edge.from);
    parents.set(edge.to, list);
  }
  const changed = new Set<string>();
  const uncertain = new Set<string>();
  for (const node of args.graph.nodes) {
    if (node.kind === "STAGE_OUTPUT") continue;
    if (node.uncertain) uncertain.add(node.id);
    const previous = args.previousHashByNode.get(node.id);
    const current = args.currentHashByNode.get(node.id);
    if (current == null || previous == null) uncertain.add(node.id);
    else if (current !== previous) changed.add(node.id);
  }
  const outputs = args.graph.nodes.filter((node) => node.kind === "STAGE_OUTPUT").map((node) => node.id);
  const invalidated: string[] = [];
  const preserved: string[] = [];
  const blockedUncertain: string[] = [];
  for (const outputId of outputs) {
    const ancestors = ancestorClosure(outputId, parents, byId);
    const uncertainAncestor = ancestors.some((id) => uncertain.has(id));
    const changedAncestor = ancestors.some((id) => changed.has(id));
    if (uncertainAncestor) blockedUncertain.push(outputId);
    else if (changedAncestor) invalidated.push(outputId);
    else preserved.push(outputId);
  }
  return { invalidated, preserved, blockedUncertain };
}

function ancestorClosure(start: string, parents: ReadonlyMap<string, readonly string[]>, byId: ReadonlyMap<string, DependencyNode>): string[] {
  const seen = new Set<string>();
  const stack = [...(parents.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node || node.kind === "STAGE_OUTPUT") continue;
    for (const parent of parents.get(id) ?? []) stack.push(parent);
  }
  return [...seen];
}
