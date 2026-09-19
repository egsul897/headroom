/**
 * PHASE 4A - deterministic evaluation dependency graph (mission §14-§15).
 *
 * Nodes: IR expression nodes, runtime inputs (metrics, ledger usage,
 * transaction inputs, events) and the Phase-3 objects a reference expands
 * into (definitions, rules). Edges: explicit dependencies (parent -> operand,
 * reference -> input/object). The graph is built from the same resolver the
 * evaluator uses, so what it reports is what evaluation would touch. Cycles
 * are reported with their node path and provenance; they are never broken.
 */
import type { IRCapacityExpression, IRExpression, SourceProvenance } from "../ir/types";
import type { InputResolver } from "./types";

export type GraphNodeKind = "EXPRESSION" | "METRIC" | "TERM" | "DEFINITION" | "RULE" | "LEDGER_USAGE" | "TRANSACTION_INPUT" | "EVENT";

export interface GraphNode { id: string; kind: GraphNodeKind; label: string; provenance: SourceProvenance | null }
export interface GraphEdge { from: string; to: string }
export interface GraphCycle { nodes: string[]; edgePath: GraphEdge[]; provenance: (SourceProvenance | null)[] }

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Deterministic topological order (dependencies before dependents); empty when the graph has a cycle. */
  topologicalOrder: string[];
  cycles: GraphCycle[];
  /** Runtime inputs the evaluation depends on, in first-encounter order. */
  dependencyTrace: { kind: GraphNodeKind; key: string }[];
}

function childrenOf(expr: IRCapacityExpression): IRExpression[] {
  switch (expr.kind) {
    case "UNLIMITED_CAPACITY": return expr.gatedBy ? [expr.gatedBy] : [];
    case "ADD": case "SUM": case "MULTIPLY": case "MAX": case "MIN": case "AND": case "OR": return expr.operands;
    case "SUBTRACT": return [expr.left, expr.right];
    case "DIVIDE": return [expr.numerator, expr.denominator];
    case "COMPARE": return [expr.left, expr.right];
    case "NOT": return [expr.operand];
    case "IF": return expr.else ? [expr.condition, expr.then, expr.else] : [expr.condition, expr.then];
    case "AS_OF": return typeof expr.asOfDate === "string" ? [expr.value] : [expr.asOfDate, expr.value];
    case "DURING_PERIOD": return [expr.value];
    case "SCHEDULE": return expr.defaultValue ? [...expr.cases.map((c) => c.value), expr.defaultValue] : expr.cases.map((c) => c.value);
    case "EVENT_ACTIVE": return expr.triggerCondition ? [expr.triggerCondition] : [];
    default: return [];
  }
}

export function buildDependencyGraph(root: IRCapacityExpression, inputs: InputResolver): DependencyGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const cycles: GraphCycle[] = [];
  const dependencyTrace: DependencyGraph["dependencyTrace"] = [];
  const visiting: string[] = [];
  const done = new Set<string>();
  const postOrder: string[] = [];
  let anon = 0;

  const addNode = (n: GraphNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return n.id; };
  const addEdge = (from: string, to: string) => { if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to }); };
  const addInput = (from: string, kind: GraphNodeKind, key: string, provenance: SourceProvenance | null) => {
    const id = `${kind.toLowerCase()}:${key}`;
    addNode({ id, kind, label: key, provenance });
    addEdge(from, id);
    if (!dependencyTrace.some((d) => d.kind === kind && d.key === key)) dependencyTrace.push({ kind, key });
    if (!done.has(id)) { done.add(id); postOrder.push(id); }
  };

  /** Expand a Phase-3 object (definition/rule) once; a re-entry while it is still being expanded is a cycle reported at the object node. */
  const enterObject = (objId: string, exprId: string, expr: IRCapacityExpression) => {
    if (done.has(objId)) return;
    const at = visiting.indexOf(objId);
    if (at >= 0) {
      const path = [...visiting.slice(at), objId];
      cycles.push({ nodes: path, edgePath: path.slice(1).map((n, i) => ({ from: path[i]!, to: n })), provenance: path.map((n) => nodes.get(n)?.provenance ?? null) });
      return;
    }
    visiting.push(objId);
    visit(exprId, expr, expr.provenance ?? null);
    visiting.pop();
    done.add(objId);
    postOrder.push(objId);
  };

  const visit = (id: string, expr: IRCapacityExpression, provenance: SourceProvenance | null) => {
    if (done.has(id)) return;
    const at = visiting.indexOf(id);
    if (at >= 0) {
      const path = [...visiting.slice(at), id];
      cycles.push({ nodes: path, edgePath: path.slice(1).map((n, i) => ({ from: path[i]!, to: n })), provenance: path.map((n) => nodes.get(n)?.provenance ?? null) });
      return;
    }
    visiting.push(id);
    for (const c of childrenOf(expr)) {
      const cid = c.exprId ?? `anon-expr:${anon++}`;
      addNode({ id: cid, kind: "EXPRESSION", label: c.kind, provenance: c.provenance ?? null });
      addEdge(id, cid);
      visit(cid, c, c.provenance ?? null);
    }
    if (expr.kind !== "UNLIMITED_CAPACITY") {
      switch (expr.kind) {
        case "METRIC_REFERENCE": addInput(id, "METRIC", expr.metricName, provenance); break;
        case "LEDGER_USAGE_REFERENCE": addInput(id, "LEDGER_USAGE", expr.sharedCapId ?? expr.ruleId ?? "(unkeyed)", provenance); break;
        case "TRANSACTION_INPUT_REFERENCE": addInput(id, "TRANSACTION_INPUT", expr.inputName, provenance); break;
        case "EVENT_ACTIVE": addInput(id, "EVENT", expr.eventDescription, provenance); break;
        case "DEFINED_TERM_REFERENCE": {
          const res = inputs.resolveTerm(expr.termName, expr.resolvedDefinitionId, expr.companyId, expr.instrumentKey);
          if (res?.kind === "DEFINITION") {
            const did = `definition:${res.definition.definitionId}`;
            addNode({ id: did, kind: "DEFINITION", label: res.definition.termName, provenance: res.definition.provenance });
            addEdge(id, did);
            if (res.definition.calculationExpression) {
              const cid = res.definition.calculationExpression.exprId ?? `anon-expr:${anon++}`;
              addNode({ id: cid, kind: "EXPRESSION", label: res.definition.calculationExpression.kind, provenance: res.definition.calculationExpression.provenance ?? null });
              addEdge(did, cid);
              enterObject(did, cid, res.definition.calculationExpression);
            } else if (!done.has(did)) { done.add(did); postOrder.push(did); }
          } else addInput(id, "TERM", expr.termName, provenance);
          break;
        }
        case "RULE_REFERENCE": {
          const rule = inputs.resolveRule(expr.ruleId);
          const rid = `rule:${expr.ruleId}`;
          addNode({ id: rid, kind: "RULE", label: expr.ruleId, provenance: rule?.provenance ?? null });
          addEdge(id, rid);
          if (rule?.capacityExpression) {
            const cap = rule.capacityExpression;
            const cid = cap.kind === "UNLIMITED_CAPACITY" ? `capacity:${rule.ruleId}` : cap.exprId ?? `anon-expr:${anon++}`;
            addNode({ id: cid, kind: "EXPRESSION", label: cap.kind, provenance: cap.provenance ?? null });
            addEdge(rid, cid);
            enterObject(rid, cid, cap);
          } else if (!done.has(rid)) { done.add(rid); postOrder.push(rid); }
          break;
        }
        default: break;
      }
    }
    visiting.pop();
    done.add(id);
    postOrder.push(id);
  };

  const rootId = root.kind === "UNLIMITED_CAPACITY" ? "capacity:root" : root.exprId ?? "anon-expr:root";
  addNode({ id: rootId, kind: "EXPRESSION", label: root.kind, provenance: root.provenance ?? null });
  visit(rootId, root, root.provenance ?? null);
  return { nodes: [...nodes.values()], edges, topologicalOrder: cycles.length === 0 ? postOrder : [], cycles, dependencyTrace };
}
