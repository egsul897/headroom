/**
 * Graph analysis for the Covenant Dependency Atlas.
 *
 * Distinguishes:
 * - DIAMOND_SHARED_DEPENDENCY: two (or more) parents share a common child
 *   without a cycle among them (shared basket / shared definition fan-in).
 * - GENUINE_CYCLE: a directed cycle in the dependency graph.
 */

import { createHash } from "node:crypto";
import type { AtlasEdge, AtlasNode, GraphMotif } from "./schema";

export interface GraphAnalysisResult {
  motifs: GraphMotif[];
  diamondCount: number;
  cycleCount: number;
}

function motifId(type: string, nodeIds: string[]): string {
  const h = createHash("sha256").update(`${type}|${[...nodeIds].sort().join("|")}`).digest("hex").slice(0, 16);
  return `motif:${type.toLowerCase()}:${h}`;
}

/** Tarjan SCC for directed cycle detection. */
export function findCycles(nodes: AtlasNode[], edges: AtlasEdge[]): GraphMotif[] {
  const ids = nodes.map((n) => n.nodeId);
  const adj = new Map<string, string[]>();
  const edgeByPair = new Map<string, string>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (!adj.has(e.fromNodeId) || !adj.has(e.toNodeId)) continue;
    // Cycles only count resolved/ambiguous dependency edges that actually point at modeled nodes.
    if (e.resolution === "UNRESOLVED" && e.toNodeId.startsWith("node:") && e.toNodeId.includes(":unresolved:")) {
      // keep — unresolved target nodes are still in the graph when present
    }
    adj.get(e.fromNodeId)!.push(e.toNodeId);
    edgeByPair.set(`${e.fromNodeId}->${e.toNodeId}`, e.edgeId);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const motifs: GraphMotif[] = [];

  const strongConnect = (v: string) => {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }
    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      if (scc.length > 1 || (scc.length === 1 && (adj.get(scc[0]!) ?? []).includes(scc[0]!))) {
        const nodeIds = [...scc].sort();
        const edgeIds: string[] = [];
        for (const a of scc) {
          for (const b of adj.get(a) ?? []) {
            if (scc.includes(b)) {
              const eid = edgeByPair.get(`${a}->${b}`);
              if (eid) edgeIds.push(eid);
            }
          }
        }
        motifs.push({
          motifId: motifId("GENUINE_CYCLE", nodeIds),
          motifType: "GENUINE_CYCLE",
          nodeIds,
          edgeIds: [...new Set(edgeIds)].sort(),
          explanation:
            scc.length === 1
              ? `Self-loop cycle at ${scc[0]} — a definition or provision that depends on itself.`
              : `Directed cycle among ${scc.length} nodes — genuine circular dependency, not mere shared fan-in.`,
        });
      }
    }
  };

  for (const id of ids) if (!indices.has(id)) strongConnect(id);
  return motifs;
}

const MATERIAL_DIAMOND_CHILD_KINDS = new Set(["SHARED_BASKET", "FINANCIAL_INPUT"]);
const MATERIAL_DIAMOND_EDGE_KINDS = new Set([
  "COVENANT_TO_SHARED_BASKET",
  "FINANCIAL_INPUT",
  "RATIO_CALCULATION",
  "RECLASSIFICATION",
  "COVENANT_TO_CROSS_DOCUMENT",
]);

/**
 * Material diamond = two distinct parents share a common child, the three-node
 * subgraph has no cycle, AND the share is legally material (shared basket /
 * financial input / ratio component / reclass / cross-document) — not merely
 * two covenants both inventory-listing a ubiquitous defined term.
 */
export function findDiamonds(nodes: AtlasNode[], edges: AtlasEdge[]): GraphMotif[] {
  const nodeById = new Map(nodes.map((n) => [n.nodeId, n]));
  const parentsOf = new Map<string, Set<string>>();
  const edgeByPair = new Map<string, AtlasEdge>();
  for (const e of edges) {
    if (e.resolution === "UNRESOLVED") continue;
    if (!parentsOf.has(e.toNodeId)) parentsOf.set(e.toNodeId, new Set());
    parentsOf.get(e.toNodeId)!.add(e.fromNodeId);
    edgeByPair.set(`${e.fromNodeId}->${e.toNodeId}`, e);
  }

  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.resolution === "UNRESOLVED") continue;
    if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, new Set());
    adj.get(e.fromNodeId)!.add(e.toNodeId);
  }

  const hasPath = (from: string, to: string, allow: Set<string>): boolean => {
    const seen = new Set<string>();
    const q = [from];
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const nxt of adj.get(cur) ?? []) {
        if (allow.has(nxt) || nxt === to) q.push(nxt);
      }
    }
    return false;
  };

  const motifs: GraphMotif[] = [];
  const seenKeys = new Set<string>();

  for (const [child, parents] of parentsOf) {
    const childNode = nodeById.get(child);
    const plist = [...parents].sort();
    if (plist.length < 2) continue;
    for (let i = 0; i < plist.length; i++) {
      for (let j = i + 1; j < plist.length; j++) {
        const a = plist[i]!;
        const b = plist[j]!;
        const e1 = edgeByPair.get(`${a}->${child}`);
        const e2 = edgeByPair.get(`${b}->${child}`);
        if (!e1 || !e2) continue;
        const material =
          (childNode && MATERIAL_DIAMOND_CHILD_KINDS.has(childNode.kind)) ||
          MATERIAL_DIAMOND_EDGE_KINDS.has(e1.kind) ||
          MATERIAL_DIAMOND_EDGE_KINDS.has(e2.kind);
        if (!material) continue;
        const nodeIds = [a, b, child].sort();
        const key = nodeIds.join("|");
        if (seenKeys.has(key)) continue;
        const allow = new Set(nodeIds);
        const cyclic =
          (hasPath(a, b, allow) && hasPath(b, a, allow)) ||
          hasPath(child, a, allow) ||
          hasPath(child, b, allow);
        if (cyclic) continue;
        seenKeys.add(key);
        motifs.push({
          motifId: motifId("DIAMOND_SHARED_DEPENDENCY", nodeIds),
          motifType: "DIAMOND_SHARED_DEPENDENCY",
          nodeIds,
          edgeIds: [e1.edgeId, e2.edgeId],
          explanation: `Material shared-dependency diamond: ${a} and ${b} both depend on ${child} (${e1.kind}/${e2.kind}) with no cycle among them.`,
        });
      }
    }
  }
  return motifs;
}

export function analyzeGraph(nodes: AtlasNode[], edges: AtlasEdge[]): GraphAnalysisResult {
  const diamonds = findDiamonds(nodes, edges);
  const cycles = findCycles(nodes, edges);
  const motifs = [...diamonds, ...cycles];
  return { motifs, diamondCount: diamonds.length, cycleCount: cycles.length };
}
