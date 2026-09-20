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
import { EVALUATION_DEPENDENCY_EDGE_KINDS } from "./types";

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
  // Keyed by full dependency identity: one map lookup per record, never a scan of what was merged so far.
  const byIdentity = new Map<string, DependencyRecord>();
  for (const m of manifests) {
    for (const d of m.dependencies) {
      const identity = [d.inputKind, d.key, d.companyId, d.instrumentKey, JSON.stringify(d.period), JSON.stringify(d.asOf), String(d.expectedType)].join("::");
      const same = byIdentity.get(identity);
      if (!same) { const copy = { ...d, exprIds: [...d.exprIds] }; merged.push(copy); byIdentity.set(identity, copy); continue; }
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
  const allRules = [...args.rules].filter((r) => r.companyId === companyId && r.instrumentKey === instrumentKey).sort((a, b) => (a.ruleId < b.ruleId ? -1 : 1));
  const allShared = [...(args.sharedCapacities ?? [])].filter((s) => s.companyId === companyId && s.instrumentKey === instrumentKey).sort((a, b) => (a.sharedCapId < b.sharedCapId ? -1 : 1));

  const nodes: CapacityNode[] = [];
  const edges: CapacityEdge[] = [];
  const limitations: CapacityLimitation[] = [];
  const manifests: FinancialDependencyManifest[] = [];

  // Identity is unique or fails closed (remediation R7). An id claimed by more than one object is
  // refused as a set: no node is built for it, nothing is chosen between the claimants, and the
  // refusal is reported once with every claimant. Sorting above means order cannot decide anything.
  const countBy = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return m; };
  const ruleCounts = countBy(allRules, (r) => r.ruleId);
  const sharedCounts = countBy(allShared, (c) => c.sharedCapId);
  const duplicateRuleIds = [...ruleCounts].filter(([, c]) => c > 1).map(([k]) => k).sort();
  const duplicateSharedIds = [...sharedCounts].filter(([, c]) => c > 1).map(([k]) => k).sort();
  for (const id of duplicateRuleIds) limitations.push({ code: "DUPLICATE_RULE_IDENTITY", message: `rule id ${id} is claimed by ${ruleCounts.get(id)} rules; no capacity node is built for it and nothing is chosen between the claimants`, refs: [ruleNodeId(id)] });
  for (const id of duplicateSharedIds) limitations.push({ code: "DUPLICATE_SHARED_CAPACITY_IDENTITY", message: `shared capacity id ${id} is claimed by ${sharedCounts.get(id)} resources; no pool node is built for it and nothing is chosen between the claimants`, refs: [sharedNodeId(id)] });
  const rules = allRules.filter((r) => ruleCounts.get(r.ruleId) === 1);
  const sharedCapacities = allShared.filter((c) => sharedCounts.get(c.sharedCapId) === 1);
  /** Members named by a refused duplicate pool: their constraint is unknowable, so they are treated as unquantified. */
  const membersOfRefusedPools = new Set(allShared.filter((c) => sharedCounts.get(c.sharedCapId)! > 1).flatMap((c) => c.memberRuleIds));
  const ruleById = new Map(rules.map((r) => [r.ruleId, r]));
  /** Node ids, for O(1) existence checks instead of scanning the node list. */
  const nodeIds = new Set<string>();
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
      unquantifiedSharedWith: [],
    });
    nodeIds.add(id);
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
        expressionId: exprId, componentRole: role, entityScope: null, phase3: null, dependsOnNodeIds: [], unquantifiedSharedWith: [],
      });
      nodeIds.add(cid);
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
      componentRole: null, entityScope: null, phase3: null, dependsOnNodeIds: [], unquantifiedSharedWith: [],
    });
    nodeIds.add(id);
    manifests.push(buildFinancialDependencyManifest({ expression: cap.capExpression, definitions, companyId, instrumentKey, asOf }));
    for (const memberRuleId of [...cap.memberRuleIds].sort()) {
      const memberNode = ruleNodeId(memberRuleId);
      if (!nodeIds.has(memberNode)) {
        limitations.push({ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `shared capacity ${cap.sharedCapId} names member rule ${memberRuleId}, which has no capacity node in this graph`, refs: [id, memberRuleId] });
        continue;
      }
      addEdge(memberNode, id, "MEMBER_OF_SHARED_CAP", null, cap.description);
      addEdge(memberNode, id, "CONSTRAINED_BY", null, cap.description);
    }
  }

  // --- Phase-3 rule relationships -----------------------------------------
  const nodeById = new Map(nodes.map((n) => [n.capacityNodeId, n]));
  /** Which quantified pools each member belongs to, so a share relationship can be checked against them. */
  const poolsOfMember = new Map<string, Set<string>>();
  for (const e of edges) if (e.kind === "MEMBER_OF_SHARED_CAP") { const set = poolsOfMember.get(e.from) ?? new Set<string>(); set.add(e.to); poolsOfMember.set(e.from, set); }
  const sharesQuantifiedPool = (a: string, b: string) => { const pa = poolsOfMember.get(a); const pb = poolsOfMember.get(b); if (!pa || !pb) return false; for (const p of pa) if (pb.has(p)) return true; return false; };

  for (const rule of rules) {
    const from = ruleNodeId(rule.ruleId);
    const node = nodeById.get(from);
    if (!node) continue;
    for (const dep of [...rule.dependsOn].sort((a, b) => (`${a.relationshipType}|${a.targetRuleId}` < `${b.relationshipType}|${b.targetRuleId}` ? -1 : 1))) {
      const targetNode = ruleNodeId(dep.targetRuleId);
      const targetExists = ruleById.has(dep.targetRuleId) && nodeIds.has(targetNode);
      if (dep.relationshipType === "RECLASSIFIABLE_TO") {
        if (!targetExists) { limitations.push({ code: "RECLASSIFICATION_NOT_EXECUTABLE", message: `rule ${rule.ruleId} states a reclassification right into ${dep.targetRuleId}, which has no capacity node in this graph`, refs: [from, dep.targetRuleId] }); continue; }
        addEdge(from, targetNode, "RECLASSIFIABLE_TO", dep.relationshipType, dep.description);
        continue;
      }
      if (dep.relationshipType === "SHARES_CAPACITY_WITH") {
        // An edge states that two capacities share something. It does not say how much. Without an
        // IRSharedCapacity resource quantifying a pool BOTH belong to, there is nothing to compute
        // against, Phase 4C will not invent one, and the member's effective availability cannot be
        // authoritative while an unknown constraint could bind (remediation R9).
        if (!(targetExists && sharesQuantifiedPool(from, targetNode))) {
          node.unquantifiedSharedWith.push(dep.targetRuleId);
          // Sharing is symmetric in meaning: the named counterparty is bound by the same unknown pool
          // even when Phase 3 recorded the relationship on one side only.
          const counterparty = targetExists ? nodeById.get(targetNode) : undefined;
          if (counterparty) counterparty.unquantifiedSharedWith.push(rule.ruleId);
          limitations.push({ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `rule ${rule.ruleId} shares capacity with ${dep.targetRuleId}, but no shared-capacity resource quantifies the pool; the shared limit is not computed and this capacity's effective availability is not authoritative`, refs: [from, targetNode] });
        }
        if (targetExists) addEdge(from, targetNode, "LEGAL_RELATIONSHIP", dep.relationshipType, dep.description);
        continue;
      }
      // Every other Phase-3 relationship is legal structure, carried for provenance. The evaluator
      // never follows it, so it is never an evaluation dependency and never a cycle (remediation R12).
      if (targetExists) addEdge(from, targetNode, "LEGAL_RELATIONSHIP", dep.relationshipType, dep.description);
    }
    for (const un of rule.unresolvedDependencies ?? []) {
      if (un.relationshipType !== "SHARES_CAPACITY_WITH" && un.relationshipType !== "RECLASSIFIABLE_TO") continue;
      if (un.relationshipType === "SHARES_CAPACITY_WITH") node.unquantifiedSharedWith.push(`unresolved:${un.targetRef}`);
      limitations.push({
        code: un.relationshipType === "SHARES_CAPACITY_WITH" ? "SHARED_CAPACITY_NOT_QUANTIFIED" : "RECLASSIFICATION_NOT_EXECUTABLE",
        message: `rule ${rule.ruleId} states a ${un.relationshipType} relationship to "${un.targetRef}" that Phase 3 could not resolve within this unit (${un.reason}); the relationship is reported, never guessed into an edge`,
        refs: [from],
      });
    }
    if (membersOfRefusedPools.has(rule.ruleId)) node.unquantifiedSharedWith.push("refused-duplicate-pool");
  }
  for (const n of nodes) n.unquantifiedSharedWith = [...new Set(n.unquantifiedSharedWith)].sort();

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
      if (nodeIds.has(target)) addEdge(from, target, "DEPENDS_ON", "RULE_REFERENCE", "capacity expression uses another rule's own capacity as an operand");
    }
  }

  // Dependency lists from one grouped pass over the edges, not a scan per node.
  const depsByFrom = new Map<string, string[]>();
  for (const e of edges) if (e.kind === "DEPENDS_ON" || e.kind === "BUILT_FROM") { const l = depsByFrom.get(e.from) ?? []; l.push(e.to); depsByFrom.set(e.from, l); }
  for (const n of nodes) n.dependsOnNodeIds = [...(depsByFrom.get(n.capacityNodeId) ?? [])].sort();

  // One edge per (from, to, kind, relationship). Phase 3 may state the same relationship twice with
  // different wording; the wordings are kept, sorted, and no input order decides which survives (R7).
  const edgeByIdentity = new Map<string, CapacityEdge>();
  for (const e of edges) {
    const key = `${e.from}|${e.to}|${e.kind}|${e.sourceRelationship ?? ""}`;
    const same = edgeByIdentity.get(key);
    if (!same) { edgeByIdentity.set(key, { ...e }); continue; }
    const descriptions = [...new Set([...(same.description ? same.description.split(" | ") : []), ...(e.description ? [e.description] : [])])].sort();
    same.description = descriptions.length > 0 ? descriptions.join(" | ") : null;
  }
  edges.splice(0, edges.length, ...edgeByIdentity.values());
  edges.sort((a, b) => (`${a.from}|${a.to}|${a.kind}|${a.sourceRelationship ?? ""}` < `${b.from}|${b.to}|${b.kind}|${b.sourceRelationship ?? ""}` ? -1 : 1));
  nodes.sort((a, b) => (a.capacityNodeId < b.capacityNodeId ? -1 : 1));

  // Cycle protection runs over evaluation dependencies only. A legal relationship, however
  // symmetric, is not a recursion; a reclassification right is validated per election, not here.
  const cyclic = edges.filter((e) => EVALUATION_DEPENDENCY_EDGE_KINDS.includes(e.kind));
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
