/** The map's own consistency checks. A map that fails any of these is not a canonical map. */
import { compareSourceOrder } from "./order";
import { computeMapHash } from "./assemble";
import { COVENANT_MAP_EDGE_TYPES, COVENANT_MAP_SCHEMA_VERSION, type CanonicalCovenantMap } from "./types";

export interface MapValidationProblem { code: string; detail: string }
export interface MapValidationResult { ok: boolean; problems: MapValidationProblem[]; checks: string[] }

export const COVENANT_MAP_VALIDATION_CHECKS = [
  "SCHEMA_VERSION",
  "MAP_HASH_RECOMPUTES",
  "NODE_IDS_UNIQUE",
  "NODE_ORDER_MONOTONIC",
  "NODE_CANDIDATE_EXISTS",
  "NODE_NOT_FROM_FAILED_CANDIDATE",
  "NODE_SOURCE_CONTENT_VERSION_PRESENT",
  "NODE_VERIFICATION_PRESENT",
  "NODE_UNIT_ID_MATCHES",
  "EDGE_IDS_UNIQUE",
  "EDGE_ENDPOINTS_EXIST",
  "EDGE_TYPE_KNOWN",
  "EDGE_KIND_COMPATIBLE",
  "CANDIDATE_REFS_UNIQUE",
  "CANDIDATE_NODE_IDS_CONSISTENT",
  "UNRESOLVED_IDS_UNIQUE",
  "UNRESOLVED_REFERENCES_EXIST",
  "COMPLETENESS_ARITHMETIC",
  "COMPLETE_FLAG_HONEST",
] as const;

export function validateCovenantMap(map: CanonicalCovenantMap): MapValidationResult {
  const problems: MapValidationProblem[] = [];
  const p = (code: string, detail: string) => problems.push({ code, detail });
  if (map.schemaVersion !== COVENANT_MAP_SCHEMA_VERSION) p("SCHEMA_VERSION", `schemaVersion ${map.schemaVersion}`);
  const recomputed = computeMapHash(map);
  if (recomputed !== map.mapHash) p("MAP_HASH_RECOMPUTES", `stored ${map.mapHash} recomputed ${recomputed}`);
  const nodeIds = new Set<string>();
  for (const n of map.nodes) { if (nodeIds.has(n.nodeId)) p("NODE_IDS_UNIQUE", n.nodeId); nodeIds.add(n.nodeId); }
  for (let i = 1; i < map.nodes.length; i++) if (compareSourceOrder(map.nodes[i - 1]!.sourceOrder, map.nodes[i]!.sourceOrder) > 0) p("NODE_ORDER_MONOTONIC", `${map.nodes[i - 1]!.nodeId} precedes ${map.nodes[i]!.nodeId} out of source order`);
  const candByRef = new Map(map.candidates.map((c) => [c.candidateRef, c] as const));
  if (candByRef.size !== map.candidates.length) p("CANDIDATE_REFS_UNIQUE", "duplicate candidateRef");
  for (const n of map.nodes) {
    const c = candByRef.get(n.candidateRef);
    if (!c) { p("NODE_CANDIDATE_EXISTS", `${n.nodeId} -> ${n.candidateRef}`); continue; }
    if (c.outcome !== "MAPPED" && c.outcome !== "MAPPED_WITH_REVIEW") p("NODE_NOT_FROM_FAILED_CANDIDATE", `${n.nodeId} belongs to candidate with outcome ${c.outcome}`);
    if (!c.nodeIds.includes(n.nodeId)) p("CANDIDATE_NODE_IDS_CONSISTENT", `${c.candidateRef} does not list ${n.nodeId}`);
    if (!n.sourceContentVersion) p("NODE_SOURCE_CONTENT_VERSION_PRESENT", n.nodeId);
    if (!n.verification || typeof n.verification.status !== "string") p("NODE_VERIFICATION_PRESENT", n.nodeId);
    const unitId = (n.unit as { ruleId?: string; definitionId?: string; sharedCapId?: string });
    const expected = n.kind === "RULE" ? unitId.ruleId : n.kind === "DEFINITION" ? unitId.definitionId : unitId.sharedCapId;
    if (expected !== n.nodeId) p("NODE_UNIT_ID_MATCHES", `${n.nodeId} carries unit ${expected}`);
  }
  for (const c of map.candidates) for (const id of c.nodeIds) if (!nodeIds.has(id)) p("CANDIDATE_NODE_IDS_CONSISTENT", `${c.candidateRef} lists unknown node ${id}`);
  const edgeIds = new Set<string>();
  const kinds = new Map(map.nodes.map((n) => [n.nodeId, n.kind] as const));
  const compat: Record<string, [string[], string[]]> = {
    RULE_DEPENDS_ON_RULE: [["RULE"], ["RULE"]], RULE_USES_DEFINITION: [["RULE"], ["DEFINITION"]], DEFINITION_USES_DEFINITION: [["DEFINITION"], ["DEFINITION"]], RULE_USES_SHARED_CAPACITY: [["RULE"], ["SHARED_CAPACITY"]],
    RULE_MODIFIED_BY_EXCEPTION: [["RULE"], ["RULE"]], RULE_SUBJECT_TO_CONDITION: [["RULE"], ["RULE", "DEFINITION"]], RULE_SUBJECT_TO_PROVISO: [["RULE"], ["RULE"]], RULE_SUBJECT_TO_GENERAL_PROHIBITION: [["RULE"], ["RULE"]],
    CROSS_DOCUMENT_DEPENDENCY: [["RULE", "DEFINITION", "SHARED_CAPACITY"], ["RULE", "DEFINITION", "SHARED_CAPACITY"]], AMENDMENT_SUPERSEDES: [["RULE", "DEFINITION", "SHARED_CAPACITY"], ["RULE", "DEFINITION", "SHARED_CAPACITY"]],
  };
  for (const e of map.edges) {
    if (edgeIds.has(e.edgeId)) p("EDGE_IDS_UNIQUE", e.edgeId); edgeIds.add(e.edgeId);
    if (!(COVENANT_MAP_EDGE_TYPES as readonly string[]).includes(e.edgeType)) p("EDGE_TYPE_KNOWN", e.edgeType);
    if (!nodeIds.has(e.fromNodeId) || !nodeIds.has(e.toNodeId)) { p("EDGE_ENDPOINTS_EXIST", `${e.edgeType} ${e.fromNodeId} -> ${e.toNodeId}`); continue; }
    const c = compat[e.edgeType];
    if (c && (!c[0].includes(kinds.get(e.fromNodeId)!) || !c[1].includes(kinds.get(e.toNodeId)!))) p("EDGE_KIND_COMPATIBLE", `${e.edgeType} ${kinds.get(e.fromNodeId)} -> ${kinds.get(e.toNodeId)}`);
  }
  const unresolvedIds = new Set<string>();
  for (const u of map.unresolved) {
    if (unresolvedIds.has(u.unresolvedId)) p("UNRESOLVED_IDS_UNIQUE", u.unresolvedId); unresolvedIds.add(u.unresolvedId);
    if (u.candidateRef && !candByRef.has(u.candidateRef)) p("UNRESOLVED_REFERENCES_EXIST", `${u.kind} -> candidate ${u.candidateRef}`);
    if (u.nodeId && !nodeIds.has(u.nodeId)) p("UNRESOLVED_REFERENCES_EXIST", `${u.kind} -> node ${u.nodeId}`);
  }
  const cm = map.completeness;
  const outcomeTotal = Object.values(cm.candidatesByOutcome).reduce((a, b) => a + b, 0);
  if (outcomeTotal !== map.candidates.length || cm.candidatesDiscovered !== map.candidates.length) p("COMPLETENESS_ARITHMETIC", `outcomes ${outcomeTotal} vs candidates ${map.candidates.length}`);
  if (Object.values(cm.nodesByKind).reduce((a, b) => a + b, 0) !== map.nodes.length) p("COMPLETENESS_ARITHMETIC", "nodesByKind");
  if (Object.values(cm.edgesByType).reduce((a, b) => a + b, 0) !== map.edges.length) p("COMPLETENESS_ARITHMETIC", "edgesByType");
  if (cm.unresolvedBlocking + cm.unresolvedReview !== map.unresolved.length) p("COMPLETENESS_ARITHMETIC", "unresolved severities");
  const honest = cm.candidatesEligible > 0 && cm.candidatesMapped === cm.candidatesEligible && map.unresolved.length === 0;
  if (cm.complete !== honest) p("COMPLETE_FLAG_HONEST", `complete=${cm.complete} but mapped ${cm.candidatesMapped}/${cm.candidatesEligible}, unresolved ${map.unresolved.length}`);
  return { ok: problems.length === 0, problems, checks: [...COVENANT_MAP_VALIDATION_CHECKS] };
}
