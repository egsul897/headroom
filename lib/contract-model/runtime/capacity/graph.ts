/**
 * PHASE 4C - capacity graph construction.
 *
 * Nodes and edges come from Phase-3 relationships that already exist. Nothing here infers a legal
 * relationship from a name, a section number or a metric. A SHARES_CAPACITY_WITH edge with no
 * quantified shared resource behind it becomes an explicit limitation, never an invented pool.
 */
import type { IRDefinition, IRExpression, IRCapacityExpression, IRRule, IRSharedCapacity } from "../../ir/types";
import { CONTRACT_RUNTIME_VERSION } from "../version";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "../input/version";
import { hashOf } from "../input/identity";
import { buildFinancialDependencyManifest, buildRuleDependencyManifest } from "../input/manifest";
import type { DependencyRecord, FinancialDependencyManifest } from "../input/types";
import { CAPACITY_GRAPH_VERSION } from "./version";
import type {
  BuildCapacityGraphArgs, CapacityEdge, CapacityEdgeKind, CapacityEntityScope, CapacityGraph,
  CapacityGraphCycle, CapacityLimitation, CapacityNode, ComponentRole,
} from "./types";

/** UNLIMITED_CAPACITY is the one IR node that carries no exprId, so it is read defensively. */
const exprIdOf = (e: IRCapacityExpression | IRExpression): string | null => ("exprId" in e && typeof e.exprId === "string" ? e.exprId : null);

export const ruleNodeId = (ruleId: string) => `capacity:rule:${ruleId}`;
export const sharedNodeId = (sharedCapacityId: string) => `capacity:shared:${sharedCapacityId}`;
const componentNodeId = (ownerNodeId: string, exprId: string) => `${ownerNodeId}#component:${exprId}`;

function entityScopeOf(rule: IRRule): CapacityEntityScope {
  const audit = rule.entityScopeAudit;
  const applicability: CapacityEntityScope["applicability"] = !audit
    ? "SCOPE_UNAUDITED"
    : audit.status === "SOURCE_MATCH_CONFIRMED"
      ? "SCOPE_CONFIRMED_BY_SOURCE"
      : audit.status === "UNSPECIFIED"
        ? "SCOPE_UNSPECIFIED"
        : "SCOPE_NOT_SAFE_TO_RELY_ON";
  return {
    entityScope: rule.entityScope,
    entityScopeExcluded: rule.entityScopeExcluded,
    auditStatus: audit?.status ?? null,
    safeToRely: audit?.safeToRely ?? null,
    applicability,
  };
}

/** True when a subtree needs no runtime fact at all. Literals only. */
function isLiteralOnly(expr: IRCapacityExpression | IRExpression): boolean {
  switch (expr.kind) {
    case "MONEY": case "NUMBER": case "PERCENT": case "RATIO": case "BOOLEAN_LITERAL": case "DATE_LITERAL": case "ENTITY_SCOPE_REFERENCE": return true;
    case "ADD": case "SUM": case "MULTIPLY": case "MAX": case "MIN": case "AND": case "OR": return expr.operands.every(isLiteralOnly);
    case "SUBTRACT": return isLiteralOnly(expr.left) && isLiteralOnly(expr.right);
    case "DIVIDE": return isLiteralOnly(expr.numerator) && isLiteralOnly(expr.denominator);
    case "NOT": return isLiteralOnly(expr.operand);
    default: return false;
  }
}

/** True when a subtree reaches at least one runtime fact. */
function referencesAFact(expr: IRCapacityExpression | IRExpression): boolean {
  switch (expr.kind) {
    case "METRIC_REFERENCE": case "DEFINED_TERM_REFERENCE": case "RULE_REFERENCE": case "LEDGER_USAGE_REFERENCE": case "TRANSACTION_INPUT_REFERENCE": case "EVENT_ACTIVE": return true;
    case "ADD": case "SUM": case "MULTIPLY": case "MAX": case "MIN": case "AND": case "OR": return expr.operands.some(referencesAFact);
    case "SUBTRACT": return referencesAFact(expr.left) || referencesAFact(expr.right);
    case "DIVIDE": return referencesAFact(expr.numerator) || referencesAFact(expr.denominator);
    case "NOT": return referencesAFact(expr.operand);
    case "AS_OF": return referencesAFact(expr.value);
    case "DURING_PERIOD": return referencesAFact(expr.value);
    case "UNLIMITED_CAPACITY": return expr.gatedBy ? referencesAFact(expr.gatedBy) : false;
    default: return false;
  }
}

/**
 * Classify an operand of an additive or extremum capacity by its SHAPE alone.
 *
 * A literal operand is a base component. An operand that multiplies a percentage by a fact grows
 * with that fact, so it is a grower. Any other operand that needs a fact accumulates from one, so
 * it is a builder. No metric name, covenant form or agreement is consulted, and renaming every
 * metric in the tree leaves the classification unchanged.
 */
function classifyComponent(expr: IRCapacityExpression | IRExpression): ComponentRole {
  if (isLiteralOnly(expr)) return "BASE_COMPONENT";
  if (expr.kind === "MULTIPLY") {
    const hasPercent = expr.operands.some((o) => o.kind === "PERCENT");
    if (hasPercent && expr.operands.some(referencesAFact)) return "GROWER_COMPONENT";
  }
  if (referencesAFact(expr)) return "BUILDER_COMPONENT";
  return "OTHER_COMPONENT";
}

/** The operands a capacity is composed from, for component labelling. One level, by shape. */
function topLevelComponents(expr: IRCapacityExpression): (IRCapacityExpression | IRExpression)[] {
  switch (expr.kind) {
    case "ADD": case "SUM": case "MAX": case "MIN": return expr.operands;
    case "UNLIMITED_CAPACITY": return [];
    default: return [];
  }
}

/** Three-colour walk. Returns every cycle found, each with its node path and edge path. */
function findCycles(nodeIds: string[], edges: CapacityEdge[]): CapacityGraphCycle[] {
  const out = new Map<string, CapacityEdge[]>();
  for (const e of edges) { const list = out.get(e.from) ?? []; list.push(e); out.set(e.from, list); }
  const colour = new Map<string, 0 | 1 | 2>();
  const cycles: CapacityGraphCycle[] = [];
  const seen = new Set<string>();
  const stack: { node: string; via: CapacityEdge | null }[] = [];

  const walk = (id: string, via: CapacityEdge | null) => {
    const c = colour.get(id) ?? 0;
    if (c === 1) {
      const at = stack.findIndex((s) => s.node === id);
      if (at < 0) return;
      const path = stack.slice(at).map((s) => s.node).concat(id);
      const edgePath = stack.slice(at + 1).map((s) => s.via!).concat(via ? [via] : []).filter(Boolean)
        .map((e) => ({ from: e.from, to: e.to, kind: e.kind }));
      const key = hashOf(path);
      if (!seen.has(key)) { seen.add(key); cycles.push({ nodePath: path, edgePath, provenance: stack.slice(at).map((s) => s.via?.description ?? "").filter(Boolean) }); }
      return;
    }
    if (c === 2) return;
    colour.set(id, 1);
    stack.push({ node: id, via });
    for (const e of [...(out.get(id) ?? [])].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : 1))) walk(e.to, e);
    stack.pop();
    colour.set(id, 2);
  };
  for (const id of [...nodeIds].sort()) walk(id, null);
  return cycles;
}

/** Merge several Phase-4B manifests into the union a graph needs, keyed by full dependency identity. */
function unionManifests(manifests: FinancialDependencyManifest[], companyId: string, instrumentKey: string): FinancialDependencyManifest {
  const merged: DependencyRecord[] = [];
  for (const m of manifests) {
    for (const d of m.dependencies) {
      const same = merged.find((x) => x.inputKind === d.inputKind && x.key === d.key && x.companyId === d.companyId && x.instrumentKey === d.instrumentKey && JSON.stringify(x.period) === JSON.stringify(d.period) && JSON.stringify(x.asOf) === JSON.stringify(d.asOf) && x.expectedType === d.expectedType);
      if (!same) { merged.push({ ...d, exprIds: [...d.exprIds] }); continue; }
      for (const e of d.exprIds) if (!same.exprIds.includes(e)) same.exprIds.push(e);
      if (d.status === "REQUIRED") { same.status = "REQUIRED"; same.conditionalOn = null; }
      if (!d.safeBoundAvailableWithoutThis) same.safeBoundAvailableWithoutThis = false;
    }
  }
  merged.sort((a, b) => (`${a.inputKind}|${a.key}|${a.companyId}|${a.instrumentKey}` < `${b.inputKind}|${b.key}|${b.companyId}|${b.instrumentKey}` ? -1 : 1));
  const body = {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    companyId, instrumentKey,
    rootExprId: null, ruleId: null,
    dependencies: merged,
    expandedObjects: manifests.flatMap((m) => m.expandedObjects).filter((e, i, a) => a.findIndex((x) => x.kind === e.kind && x.id === e.id) === i),
    cycles: manifests.flatMap((m) => m.cycles),
    unsupportedNodes: manifests.flatMap((m) => m.unsupportedNodes),
    ambiguousExpansions: manifests.flatMap((m) => m.ambiguousExpansions),
    counts: {
      total: merged.length,
      required: merged.filter((d) => d.status === "REQUIRED").length,
      conditional: merged.filter((d) => d.status === "CONDITIONAL").length,
      optionalForBoundOnly: merged.filter((d) => d.status === "OPTIONAL_FOR_BOUND_ONLY").length,
    },
    manifestHash: "",
  };
  return { ...body, manifestHash: hashOf({ ...body, manifestHash: undefined }) };
}

export function buildCapacityGraph(args: BuildCapacityGraphArgs): CapacityGraph {
  const { companyId, instrumentKey } = args;
  const definitions = args.definitions ?? [];
  const asOf = args.asOf ?? null;
  // Only this company's and instrument's objects. Identity is never assumed from the argument alone.
  const rules = [...args.rules].filter((r) => r.companyId === companyId && r.instrumentKey === instrumentKey).sort((a, b) => (a.ruleId < b.ruleId ? -1 : 1));
  const sharedCapacities = [...(args.sharedCapacities ?? [])].filter((s) => s.companyId === companyId && s.instrumentKey === instrumentKey).sort((a, b) => (a.sharedCapId < b.sharedCapId ? -1 : 1));

  const nodes: CapacityNode[] = [];
  const edges: CapacityEdge[] = [];
  const limitations: CapacityLimitation[] = [];
  const manifests: FinancialDependencyManifest[] = [];
  const ruleById = new Map(rules.map((r) => [r.ruleId, r]));
  const addEdge = (from: string, to: string, kind: CapacityEdgeKind, sourceRelationship: string | null, description: string | null) => { edges.push({ from, to, kind, sourceRelationship, description }); };

  // --- rule capacity nodes -------------------------------------------------
  for (const rule of rules) {
    if (!rule.capacityExpression) continue;
    const id = ruleNodeId(rule.ruleId);
    nodes.push({
      capacityNodeId: id, kind: "RULE_CAPACITY", companyId, instrumentKey,
      ruleId: rule.ruleId, sharedCapacityId: null,
      sourceIdentity: { kind: "RULE", id: rule.ruleId, sourceSectionRef: rule.sourceSectionRef, sourceCitation: rule.provenance?.sourceCitation ?? null },
      expressionId: exprIdOf(rule.capacityExpression),
      componentRole: null,
      entityScope: entityScopeOf(rule),
      phase3: { sufficiency: rule.sufficiency, sufficiencyReasons: rule.sufficiencyReasons },
      dependsOnNodeIds: [],
    });
    manifests.push(buildRuleDependencyManifest(rule, { companyId, instrumentKey, asOf, definitions }));

    // component nodes, labelled by shape
    for (const operand of topLevelComponents(rule.capacityExpression)) {
      const role = classifyComponent(operand);
      if (role !== "BUILDER_COMPONENT" && role !== "GROWER_COMPONENT") continue;
      const exprId = exprIdOf(operand);
      if (!exprId) continue;
      const cid = componentNodeId(id, exprId);
      nodes.push({
        capacityNodeId: cid, kind: role === "GROWER_COMPONENT" ? "GROWER_COMPONENT" : "BUILDER_COMPONENT",
        companyId, instrumentKey, ruleId: rule.ruleId, sharedCapacityId: null,
        sourceIdentity: { kind: "RULE", id: rule.ruleId, sourceSectionRef: rule.sourceSectionRef, sourceCitation: rule.provenance?.sourceCitation ?? null },
        expressionId: exprId, componentRole: role, entityScope: null, phase3: null, dependsOnNodeIds: [],
      });
      addEdge(id, cid, "BUILT_FROM", null, `capacity composed from a ${role.toLowerCase().replace(/_/g, " ")}`);
    }
  }

  // --- shared capacity nodes ----------------------------------------------
  for (const cap of sharedCapacities) {
    const id = sharedNodeId(cap.sharedCapId);
    nodes.push({
      capacityNodeId: id, kind: "SHARED_CAPACITY", companyId, instrumentKey,
      ruleId: null, sharedCapacityId: cap.sharedCapId,
      sourceIdentity: { kind: "SHARED_CAPACITY", id: cap.sharedCapId, sourceSectionRef: null, sourceCitation: cap.provenance?.sourceCitation ?? null },
      expressionId: exprIdOf(cap.capExpression),
      componentRole: null, entityScope: null, phase3: null, dependsOnNodeIds: [],
    });
    manifests.push(buildFinancialDependencyManifest({ expression: cap.capExpression, definitions, companyId, instrumentKey, asOf }));
    for (const memberRuleId of [...cap.memberRuleIds].sort()) {
      const memberNode = ruleNodeId(memberRuleId);
      if (!nodes.some((n) => n.capacityNodeId === memberNode)) {
        limitations.push({ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `shared capacity ${cap.sharedCapId} names member rule ${memberRuleId}, which has no capacity node in this graph`, refs: [id, memberRuleId] });
        continue;
      }
      addEdge(memberNode, id, "MEMBER_OF_SHARED_CAP", null, cap.description);
      addEdge(memberNode, id, "CONSTRAINED_BY", null, cap.description);
    }
  }

  // --- Phase-3 rule relationships -----------------------------------------
  const quantifiedMembers = new Set(edges.filter((e) => e.kind === "MEMBER_OF_SHARED_CAP").map((e) => e.from));
  for (const rule of rules) {
    const from = ruleNodeId(rule.ruleId);
    if (!nodes.some((n) => n.capacityNodeId === from)) continue;
    for (const dep of [...rule.dependsOn].sort((a, b) => (`${a.relationshipType}|${a.targetRuleId}` < `${b.relationshipType}|${b.targetRuleId}` ? -1 : 1))) {
      const targetNode = ruleNodeId(dep.targetRuleId);
      const targetExists = ruleById.has(dep.targetRuleId) && nodes.some((n) => n.capacityNodeId === targetNode);
      if (dep.relationshipType === "RECLASSIFIABLE_TO") {
        if (!targetExists) { limitations.push({ code: "RECLASSIFICATION_NOT_EXECUTABLE", message: `rule ${rule.ruleId} states a reclassification right into ${dep.targetRuleId}, which has no capacity node in this graph`, refs: [from, dep.targetRuleId] }); continue; }
        addEdge(from, targetNode, "RECLASSIFIABLE_TO", dep.relationshipType, dep.description);
        continue;
      }
      if (dep.relationshipType === "SHARES_CAPACITY_WITH") {
        // An edge states that two capacities share something. It does not say how much. Without an
        // IRSharedCapacity resource carrying a cap expression there is no pool to compute against,
        // and Phase 4C will not invent one.
        if (!quantifiedMembers.has(from)) {
          limitations.push({ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `rule ${rule.ruleId} shares capacity with ${dep.targetRuleId}, but no shared-capacity resource quantifies the pool; the shared limit is not computed`, refs: [from, targetNode] });
        }
        if (targetExists) addEdge(from, targetNode, "DEPENDS_ON", dep.relationshipType, dep.description);
        continue;
      }
      if (targetExists) addEdge(from, targetNode, "DEPENDS_ON", dep.relationshipType, dep.description);
    }
    for (const un of rule.unresolvedDependencies ?? []) {
      if (un.relationshipType !== "SHARES_CAPACITY_WITH" && un.relationshipType !== "RECLASSIFIABLE_TO") continue;
      limitations.push({
        code: un.relationshipType === "SHARES_CAPACITY_WITH" ? "SHARED_CAPACITY_NOT_QUANTIFIED" : "RECLASSIFICATION_NOT_EXECUTABLE",
        message: `rule ${rule.ruleId} states a ${un.relationshipType} relationship to "${un.targetRef}" that Phase 3 could not resolve within this unit (${un.reason}); the relationship is reported, never guessed into an edge`,
        refs: [from],
      });
    }
  }

  // --- expression-level rule references become dependency edges ------------
  for (const rule of rules) {
    if (!rule.capacityExpression) continue;
    const from = ruleNodeId(rule.ruleId);
    const refs: string[] = [];
    const walk = (n: unknown) => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.kind === "RULE_REFERENCE" && typeof o.ruleId === "string" && !refs.includes(o.ruleId)) refs.push(o.ruleId);
      for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v);
    };
    walk(rule.capacityExpression);
    for (const r of refs.sort()) {
      const target = ruleNodeId(r);
      if (nodes.some((n) => n.capacityNodeId === target)) addEdge(from, target, "DEPENDS_ON", "RULE_REFERENCE", "capacity expression uses another rule's own capacity as an operand");
    }
  }

  for (const n of nodes) n.dependsOnNodeIds = edges.filter((e) => e.from === n.capacityNodeId && (e.kind === "DEPENDS_ON" || e.kind === "BUILT_FROM")).map((e) => e.to).sort();

  edges.sort((a, b) => (`${a.from}|${a.to}|${a.kind}` < `${b.from}|${b.to}|${b.kind}` ? -1 : 1));
  nodes.sort((a, b) => (a.capacityNodeId < b.capacityNodeId ? -1 : 1));

  // Cycles are detected over the edges that actually create evaluation dependence.
  const cyclic = edges.filter((e) => e.kind === "DEPENDS_ON" || e.kind === "MEMBER_OF_SHARED_CAP" || e.kind === "BUILT_FROM" || e.kind === "RECLASSIFIABLE_TO");
  const cycles = findCycles(nodes.map((n) => n.capacityNodeId), cyclic);
  for (const c of cycles) {
    const shared = c.nodePath.some((n) => n.startsWith("capacity:shared:"));
    limitations.push({ code: shared ? "SHARED_CAPACITY_CYCLE" : "CAPACITY_GRAPH_CYCLE", message: `cycle in the capacity graph: ${c.nodePath.join(" -> ")}`, refs: c.nodePath });
  }

  const dependencyManifest = unionManifests(manifests, companyId, instrumentKey);
  limitations.sort((a, b) => (`${a.code}|${a.message}` < `${b.code}|${b.message}` ? -1 : 1));
  const body = {
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId, instrumentKey, nodes, edges, cycles, dependencyManifest, limitations,
  };
  return { ...body, graphHash: hashOf(body) };
}
