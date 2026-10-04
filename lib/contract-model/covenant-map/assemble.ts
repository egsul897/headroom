/**
 * Assembly of the canonical map from per-candidate verified results. Pure and deterministic: no provider, no clock in
 * the hashed content, no environment. Every node is placed in SOURCE ORDER, every relationship becomes a typed edge,
 * every gap becomes an explicit unresolved item, and the completeness is measured against the discovered population.
 */
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import type { StructuralIndex } from "../compiler/structural-index";
import type { StructuralNode } from "../compiler/types";
import type { OperativeContractState, OperativeProvisionView } from "../compiler/amendment/types";
import type { CovenantContextBundle } from "../compiler/context-retrieval/types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../compiler/semantic/types";
import type { SemanticVerificationResult } from "../compiler/semantic-verification/types";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "../compiler/semantic-verification/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../compiler/semantic/types";
import { IR_SCHEMA_VERSION, type IRDefinition, type IRRule, type IRSharedCapacity } from "../ir/types";
import { normalizeDefinedTermRef } from "../compiler/amendment/chain";
import { documentOrdinals, sortBySourceOrder, sourceOrderOf, STRUCTURAL_DEPTH } from "./order";
import { canonicalJson, sha256Hex } from "./source-content-version";
import { resolvePackageDependencies } from "./package-dependencies";
import type { CandidateCertification } from "../phase3-certification/types";
import type { SemanticSourceContract } from "../phase3-certification/semantic-source-contract";
import type { PersistedVerifiedUnitPackage, UnitSnapshot } from "../verified-units";
import { COVENANT_MAP_ALGORITHM_VERSION, COVENANT_MAP_EDGE_TYPES, COVENANT_MAP_SCHEMA_VERSION, type CandidateExecutionTelemetry, type CandidateOutcome, type CanonicalCovenantMap, type CovenantMapCandidateRecord, type CovenantMapCompleteness, type CovenantMapDiscoveryPopulation, type CovenantMapDocument, type CovenantMapEdge, type CovenantMapEdgeType, type CovenantMapNode, type CovenantMapNodeCertification, type CovenantMapNodeKind, type CovenantMapUnresolvedItem, type CovenantMapUnresolvedKind, type EdgeAuthority, type EdgeDerivation, type SourceOrder } from "./types";

/** What ONE candidate contributes to assembly. Produced by pipeline.ts (live) or reconstructed offline from preserved evidence. */
export interface CandidateMapResult {
  candidate: DiscoveredCandidate;
  input: SemanticCompilerInput | null;
  bundle: CovenantContextBundle | null;
  compilation: SemanticCompilationResult | null;
  verification: SemanticVerificationResult | null;
  operativeProvision: OperativeProvisionView | null;
  /** The exact operative text compiled (offline reconstruction supplies it when `input` is not rebuilt). */
  operativeSourceText?: string | null;
  /** The operative (scv1) identity of the candidate's source. */
  sourceContentVersion: string | null;
  identityStrength: "STRONG" | "WEAK";
  outcome: CandidateOutcome;
  failure: { kind: string; detail: string } | null;
  telemetry: CandidateExecutionTelemetry | null;
  /** The certification decision for the candidate's artifacts; absent/null on reconstructed results (then NOT_CERTIFIED: CERTIFICATION_NOT_PERFORMED). */
  certification?: CandidateCertification | null;
  /** The semantic source contract stamped on the units before the snapshot. */
  semanticSourceContract?: SemanticSourceContract | null;
  /** The exact units the verifier saw, taken BEFORE verification. */
  snapshot?: UnitSnapshot | null;
  /** The paired artifact package built from that snapshot and the verification. */
  verifiedPackage?: PersistedVerifiedUnitPackage | null;
}

export interface AssembleCovenantMapInput {
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  asOfDate: string | null;
  documents: { documentId: string; label: string; text: string; role?: CovenantMapDocument["role"] }[];
  index: StructuralIndex;
  operativeState: OperativeContractState | null;
  certifiedConfigIdentity: string | null;
  discoveryRunVersion: string | null;
  discoveryPopulation?: CovenantMapDiscoveryPopulation | null;
  /** Every discovered candidate, including ones that were never attempted (they become unresolved items). */
  candidates: DiscoveredCandidate[];
  results: CandidateMapResult[];
}

const OK_VERIFICATION = new Set(["VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS"]);
/** One edge per (type, from, to): the first derivation that establishes it (IR-derived before structural/context) is recorded. */
const edgeId = (t: CovenantMapEdgeType, from: string, to: string) => sha256Hex(`${t}|${from}|${to}`).slice(0, 24);
const unresolvedId = (kind: CovenantMapUnresolvedKind, candidateRef: string | null, nodeId: string | null, detail: string) => sha256Hex(`${kind}|${candidateRef ?? ""}|${nodeId ?? ""}|${detail}`).slice(0, 24);

/** Every DEFINED_TERM_REFERENCE inside an IR expression tree (conditions, exceptions, capacity, calculation). */
export function collectDefinedTermReferences(root: unknown): { termName: string; resolvedDefinitionId: string | null; path: string }[] {
  const out: { termName: string; resolvedDefinitionId: string | null; path: string }[] = [];
  const walk = (v: unknown, path: string): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    const r = v as Record<string, unknown>;
    if (r.kind === "DEFINED_TERM_REFERENCE" && typeof r.termName === "string") out.push({ termName: r.termName, resolvedDefinitionId: typeof r.resolvedDefinitionId === "string" ? r.resolvedDefinitionId : null, path });
    for (const [k, x] of Object.entries(r)) if (x && typeof x === "object") walk(x, `${path}.${k}`);
  };
  walk(root, "");
  return out;
}

function anchorFor(unit: { sourceSectionRef?: string | null; sourceDocumentId: string }, candidate: DiscoveredCandidate, index: StructuralIndex): StructuralNode | null {
  const candidateAnchor = candidate.structuralNodeIds[0] ? index.getNodeById(candidate.structuralNodeIds[0]) ?? null : null;
  const ref = unit.sourceSectionRef ?? null;
  if (ref && ref !== candidate.normalizedSourceRef) {
    const res = index.resolveUniqueNodeByRef(unit.sourceDocumentId, ref);
    if (res.status === "UNIQUE") {
      // only a node INSIDE the candidate's own span (or the candidate itself) may re-anchor a unit; anything else keeps the candidate anchor
      if (!candidateAnchor || res.node.nodeId === candidateAnchor.nodeId || index.getAncestors(res.node.nodeId).some((a) => a.nodeId === candidateAnchor.nodeId)) return res.node;
    }
  }
  return candidateAnchor;
}

export function assembleCovenantMap(input: AssembleCovenantMapInput): CanonicalCovenantMap {
  const ordinals = documentOrdinals(input.documents);
  const ordinalOf = (documentId: string): number => ordinals.get(documentId) ?? input.documents.length;
  const documents: CovenantMapDocument[] = input.documents.map((d, i) => ({ documentId: d.documentId, label: d.label, documentOrdinal: i, textSha256: sha256Hex(d.text), role: d.role ?? "UNKNOWN" }));
  const resultByRef = new Map(input.results.map((r) => [r.candidate.discoveryId, r] as const));

  const nodes: CovenantMapNode[] = [];
  const edges: CovenantMapEdge[] = [];
  const unresolved: CovenantMapUnresolvedItem[] = [];
  const candidates: CovenantMapCandidateRecord[] = [];
  const nodesByAnchor = new Map<string, CovenantMapNode[]>();
  const nodeById = new Map<string, CovenantMapNode>();
  const definitionsByTerm = new Map<string, CovenantMapNode[]>();
  const addUnresolved = (kind: CovenantMapUnresolvedKind, severity: "BLOCKING" | "REVIEW", candidateRef: string | null, nodeId: string | null, documentId: string | null, sectionRef: string | null, sourceOrder: SourceOrder | null, detail: string) => {
    const id = unresolvedId(kind, candidateRef, nodeId, detail);
    if (!unresolved.some((u) => u.unresolvedId === id)) unresolved.push({ unresolvedId: id, kind, severity, candidateRef, nodeId, documentId, sectionRef, sourceOrder, detail });
  };
  const addEdge = (edgeType: CovenantMapEdgeType, from: string, to: string, derivedFrom: EdgeDerivation, reason: string, candidateRef: string, relationshipType: string | null = null) => {
    if (from === to) return;
    const id = edgeId(edgeType, from, to);
    const existing = edges.find((e) => e.edgeId === id);
    if (existing) { if (!existing.corroboratedBy.includes(derivedFrom)) existing.corroboratedBy.push(derivedFrom); return; }
    edges.push({ edgeId: id, edgeType, fromNodeId: from, toNodeId: to, relationshipType, derivedFrom, corroboratedBy: [derivedFrom], edgeAuthority: "REVIEW_ONLY", reason, candidateRef });
  };
  const certificationOf = (r: CandidateMapResult | null, candidateRef: string): { status: CovenantMapNodeCertification["status"]; blockers: string[]; version: string | null; hashes: Record<string, string> } => {
    const c = r?.certification ?? null;
    if (!c) return { status: "NOT_CERTIFIED", blockers: ["CERTIFICATION_NOT_PERFORMED"], version: null, hashes: {} };
    void candidateRef;
    return { status: c.status, blockers: c.blockers.map((b) => b.code), version: c.semanticSourceContractVersion, hashes: c.unitArtifactHashes };
  };
  const candidateOrder = (c: DiscoveredCandidate): SourceOrder | null => { const n = c.structuralNodeIds[0] ? input.index.getNodeById(c.structuralNodeIds[0]) : undefined; return n ? sourceOrderOf(n, ordinalOf(n.documentId)) : null; };

  // ---- PASS 1: nodes + candidate records --------------------------------------------------------------------
  for (const candidate of input.candidates) {
    const r = resultByRef.get(candidate.discoveryId) ?? null;
    const order = candidateOrder(candidate);
    const opText = r?.operativeSourceText ?? r?.input?.operativeSourceText ?? null;
    const cert = certificationOf(r, candidate.discoveryId);
    const record: CovenantMapCandidateRecord = {
      candidateRef: candidate.discoveryId, discoveryId: candidate.discoveryId, documentId: candidate.documentId, sectionRef: candidate.normalizedSourceRef, sourceOrder: order,
      structuralNodeIds: [...candidate.structuralNodeIds], families: [...candidate.families], role: candidate.role,
      operativeSourceSha256: opText === null ? null : sha256Hex(opText), operativeSourceChars: opText?.length ?? 0, sourceContentVersion: r?.sourceContentVersion ?? null,
      outcome: r?.outcome ?? "UNSERVED", compilationStatus: r?.compilation?.status ?? null, compilationFailureReasons: [...(r?.compilation?.failureReasons ?? [])], verificationStatus: r?.verification?.status ?? null,
      certificationStatus: cert.status, certificationBlockers: cert.blockers, semanticSourceContractVersion: cert.version,
      nodeIds: [], failure: r?.failure ?? null, telemetry: r?.telemetry ?? null,
    };
    candidates.push(record);
    if (!r) { addUnresolved("CANDIDATE_UNSERVED", "BLOCKING", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, "candidate was never attempted in this run"); continue; }
    switch (r.outcome) {
      case "INELIGIBLE": addUnresolved("CANDIDATE_INELIGIBLE", "REVIEW", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, r.failure?.detail ?? "ineligible for semantic compilation"); continue;
      case "EMPTY_OPERATIVE_TEXT": addUnresolved("CANDIDATE_EMPTY_OPERATIVE_TEXT", "BLOCKING", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, r.failure?.detail ?? "operative text is empty"); continue;
      case "NO_STRUCTURAL_ANCHOR": addUnresolved("CANDIDATE_NO_STRUCTURAL_ANCHOR", "BLOCKING", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, r.failure?.detail ?? "no structural node resolves for this candidate"); continue;
      case "UNSERVED": addUnresolved("CANDIDATE_UNSERVED", "BLOCKING", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, r.failure?.detail ?? "unserved"); continue;
      case "COMPILE_FAILED": addUnresolved("CANDIDATE_COMPILE_FAILED", "BLOCKING", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, `${(r.compilation?.failureReasons ?? []).join(",") || r.failure?.kind || "FAILED"}: ${r.failure?.detail ?? r.compilation?.errorDetail?.sanitizedMessage ?? ""}`.trim()); continue;
      default: break;
    }
    const comp = r.compilation!;
    const ver = r.verification;
    if (!ver) addUnresolved("CANDIDATE_NOT_VERIFIED", "BLOCKING", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, r.failure?.detail ?? "compiled units were never verified");
    else if (!OK_VERIFICATION.has(ver.status)) addUnresolved("CANDIDATE_VERIFICATION_NOT_PASSED", "REVIEW", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, `verification ${ver.status}: ${ver.findings.filter((f) => f.severity === "MATERIAL").length} material finding(s)`);
    if (comp.status !== "COMPLETED") addUnresolved("CANDIDATE_COMPILE_REVIEW_REQUIRED", "REVIEW", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, `compilation ${comp.status}: ${comp.failureReasons.join(", ") || comp.unresolvedIssues[0] || "see unresolvedIssues"}`);
    for (const u of (r.bundle?.unresolvedDependencies ?? []).filter((d) => d.severity === "HIGH" || d.severity === "MEDIUM")) addUnresolved("UNRESOLVED_CONTEXT_DEPENDENCY", "REVIEW", candidate.discoveryId, null, candidate.documentId, candidate.normalizedSourceRef, order, `${u.dependencyType} "${u.sourceText}": ${u.reason}`);

    const verificationOf = (unitId: string) => {
      const findings = (ver?.findings ?? []).filter((f) => f.ruleOrDefinitionId === unitId);
      return { status: ver?.status ?? ("NOT_VERIFIED" as const), findingIds: findings.map((f) => f.findingId).sort(), materialFindings: findings.filter((f) => f.severity === "MATERIAL").length };
    };
    const nodeCertification = (unitId: string): CovenantMapNodeCertification => ({ status: cert.status, artifactHash: cert.hashes[unitId] ?? null, semanticSourceContractVersion: cert.version, blockers: cert.blockers });
    const operativeOf = (): CovenantMapNode["operative"] => r.operativeProvision ? { provisionKey: r.operativeProvision.provisionKey, status: r.operativeProvision.status, currentSourceDocumentId: r.operativeProvision.currentSourceDocumentId, appliedEffectIds: r.operativeProvision.appliedChain.map((e) => e.effectId), supersededStructuralNodeIds: [...r.operativeProvision.supersededSourceNodeIds] } : null;
    const push = (node: CovenantMapNode) => {
      if (nodeById.has(node.nodeId)) { addUnresolved("WEAK_IDENTITY", "REVIEW", candidate.discoveryId, node.nodeId, node.documentId, node.sectionRef, node.sourceOrder, `unit id ${node.nodeId} emitted by more than one candidate; the first occurrence in source order is kept`); return; }
      nodes.push(node); nodeById.set(node.nodeId, node); record.nodeIds.push(node.nodeId);
      if (node.structuralNodeId) { const l = nodesByAnchor.get(node.structuralNodeId) ?? []; l.push(node); nodesByAnchor.set(node.structuralNodeId, l); }
      if (node.identityStrength === "WEAK") addUnresolved("WEAK_IDENTITY", "REVIEW", candidate.discoveryId, node.nodeId, node.documentId, node.sectionRef, node.sourceOrder, "no structural anchor or empty operative text: identity is not STRONG");
    };
    for (const rule of comp.rules) {
      const anchor = anchorFor(rule, candidate, input.index);
      const node: CovenantMapNode = {
        nodeId: rule.ruleId, kind: "RULE", candidateRef: candidate.discoveryId, documentId: rule.sourceDocumentId, sectionRef: rule.sourceSectionRef, structuralNodeId: anchor?.nodeId ?? null, structuralNodeKey: anchor?.nodeKey ?? null,
        sourceOrder: anchor ? sourceOrderOf(anchor, ordinalOf(anchor.documentId)) : { documentOrdinal: ordinalOf(rule.sourceDocumentId), charStart: Number.MAX_SAFE_INTEGER, structuralDepth: 9, localOrdinal: 0 },
        family: rule.covenantFamily, ruleType: rule.ruleType, posture: rule.posture, termName: null, sufficiency: rule.sufficiency,
        sourceContentVersion: rule.sourceContentVersion ?? r.sourceContentVersion, operativeSourceVersion: r.sourceContentVersion, identityStrength: anchor && (rule.sourceContentVersion ?? r.sourceContentVersion) ? r.identityStrength : "WEAK",
        verification: verificationOf(rule.ruleId), certification: nodeCertification(rule.ruleId), operative: operativeOf(), unit: rule,
      };
      push(node);
      if (rule.sufficiency !== "COMPLETE") addUnresolved("UNIT_SUFFICIENCY_NOT_SUFFICIENT", "REVIEW", candidate.discoveryId, rule.ruleId, node.documentId, node.sectionRef, node.sourceOrder, `rule sufficiency ${rule.sufficiency}: ${rule.sufficiencyReasons.join("; ")}`);
    }
    for (const def of comp.definitions) {
      const detected = input.index.getDefinition(def.termName, def.sourceDocumentId);
      const host = detected?.sourceNodeId ? input.index.getNodeById(detected.sourceNodeId) ?? null : null;
      const candidateAnchor = candidate.structuralNodeIds[0] ? input.index.getNodeById(candidate.structuralNodeIds[0]) ?? null : null;
      const anchor = host ?? candidateAnchor;
      const order: SourceOrder = detected && host ? { documentOrdinal: ordinalOf(host.documentId), charStart: detected.charStart, structuralDepth: STRUCTURAL_DEPTH[host.nodeType] + 1, localOrdinal: 0 }
        : anchor ? sourceOrderOf(anchor, ordinalOf(anchor.documentId), 1) : { documentOrdinal: ordinalOf(def.sourceDocumentId), charStart: Number.MAX_SAFE_INTEGER, structuralDepth: 9, localOrdinal: 0 };
      const node: CovenantMapNode = {
        nodeId: def.definitionId, kind: "DEFINITION", candidateRef: candidate.discoveryId, documentId: def.sourceDocumentId, sectionRef: anchor?.sectionRef ?? null, structuralNodeId: anchor?.nodeId ?? null, structuralNodeKey: anchor?.nodeKey ?? null,
        sourceOrder: order, family: def.covenantFamily, ruleType: null, posture: null, termName: def.termName, sufficiency: def.sufficiency,
        sourceContentVersion: def.sourceContentVersion ?? r.sourceContentVersion, operativeSourceVersion: r.sourceContentVersion, identityStrength: anchor && (def.sourceContentVersion ?? r.sourceContentVersion) ? r.identityStrength : "WEAK",
        verification: verificationOf(def.definitionId), certification: nodeCertification(def.definitionId), operative: operativeOf(), unit: def,
      };
      push(node);
      const key = normalizeDefinedTermRef(def.termName);
      const l = definitionsByTerm.get(key) ?? []; l.push(node); definitionsByTerm.set(key, l);
      if (def.sufficiency !== "COMPLETE") addUnresolved("UNIT_SUFFICIENCY_NOT_SUFFICIENT", "REVIEW", candidate.discoveryId, def.definitionId, node.documentId, node.sectionRef, node.sourceOrder, `definition "${def.termName}" sufficiency ${def.sufficiency}: ${def.sufficiencyReasons.join("; ")}`);
    }
    for (const cap of comp.sharedCapacities) {
      const anchor = candidate.structuralNodeIds[0] ? input.index.getNodeById(candidate.structuralNodeIds[0]) ?? null : null;
      push({
        nodeId: cap.sharedCapId, kind: "SHARED_CAPACITY", candidateRef: candidate.discoveryId, documentId: candidate.documentId, sectionRef: candidate.normalizedSourceRef, structuralNodeId: anchor?.nodeId ?? null, structuralNodeKey: anchor?.nodeKey ?? null,
        sourceOrder: anchor ? sourceOrderOf(anchor, ordinalOf(anchor.documentId), 1) : { documentOrdinal: ordinalOf(candidate.documentId), charStart: Number.MAX_SAFE_INTEGER, structuralDepth: 9, localOrdinal: 0 },
        family: "SHARED_CAPACITY", ruleType: null, posture: null, termName: null, sufficiency: null,
        sourceContentVersion: cap.sourceContentVersion ?? r.sourceContentVersion, operativeSourceVersion: r.sourceContentVersion, identityStrength: anchor && (cap.sourceContentVersion ?? r.sourceContentVersion) ? r.identityStrength : "WEAK",
        verification: verificationOf(cap.sharedCapId), certification: nodeCertification(cap.sharedCapId), operative: operativeOf(), unit: cap,
      });
    }
  }

  // ---- PASS 2: edges (only now, when every node of the package exists) ---------------------------------------
  const resolveDefinition = (termName: string, resolvedDefinitionId: string | null, preferDocumentId: string): CovenantMapNode | null => {
    if (resolvedDefinitionId && nodeById.get(resolvedDefinitionId)?.kind === "DEFINITION") return nodeById.get(resolvedDefinitionId)!;
    const l = definitionsByTerm.get(normalizeDefinedTermRef(termName)) ?? [];
    return l.find((n) => n.documentId === preferDocumentId) ?? l[0] ?? null;
  };
  for (const node of nodes) {
    const ref = node.candidateRef;
    if (node.kind === "RULE") {
      const rule = node.unit as IRRule;
      for (const d of rule.dependsOn) {
        if (nodeById.has(d.targetRuleId)) addEdge("RULE_DEPENDS_ON_RULE", rule.ruleId, d.targetRuleId, "IR_DEPENDS_ON", d.description || d.relationshipType, ref, d.relationshipType);
        else addUnresolved("DANGLING_RULE_DEPENDENCY", "REVIEW", ref, rule.ruleId, node.documentId, node.sectionRef, node.sourceOrder, `dependsOn ${d.relationshipType} -> ${d.targetRuleId} is not a node of this map`);
      }
      for (const t of collectDefinedTermReferences({ capacityExpression: rule.capacityExpression, conditions: rule.conditions.map((c) => c.expression), exceptions: rule.exceptions.map((e) => e.conditions.map((c) => c.expression)) })) {
        const target = resolveDefinition(t.termName, t.resolvedDefinitionId, node.documentId);
        if (target) addEdge("RULE_USES_DEFINITION", rule.ruleId, target.nodeId, "IR_EXPRESSION_TERM_REFERENCE", `references defined term "${t.termName}" at ${t.path}`, ref);
        else addUnresolved("UNRESOLVED_DEFINED_TERM", "REVIEW", ref, rule.ruleId, node.documentId, node.sectionRef, node.sourceOrder, `defined term "${t.termName}" referenced at ${t.path} has no definition node in this map`);
      }
      for (const c of rule.conditions) if (c.referencesDefinitionId) {
        const target = nodeById.get(c.referencesDefinitionId);
        if (target) addEdge(target.kind === "DEFINITION" ? "RULE_USES_DEFINITION" : "RULE_SUBJECT_TO_CONDITION", rule.ruleId, target.nodeId, "IR_CONDITION_REFERENCE", `condition ${c.conditionId} (${c.conditionType}) references ${target.nodeId}`, ref);
        else addUnresolved("UNRESOLVED_DEFINED_TERM", "REVIEW", ref, rule.ruleId, node.documentId, node.sectionRef, node.sourceOrder, `condition ${c.conditionId} references ${c.referencesDefinitionId}, not a node of this map`);
      }
      for (const e of rule.exceptions) if (e.permissionRuleId) {
        if (nodeById.has(e.permissionRuleId)) { addEdge("RULE_MODIFIED_BY_EXCEPTION", rule.ruleId, e.permissionRuleId, "IR_EXCEPTION_PERMISSION", e.description || e.exceptionId, ref); addEdge("RULE_SUBJECT_TO_GENERAL_PROHIBITION", e.permissionRuleId, rule.ruleId, "IR_EXCEPTION_PERMISSION", `permission carved out of ${rule.ruleId} by exception ${e.exceptionId}`, ref); }
        else addUnresolved("DANGLING_EXCEPTION_PERMISSION", "REVIEW", ref, rule.ruleId, node.documentId, node.sectionRef, node.sourceOrder, `exception ${e.exceptionId} names permission rule ${e.permissionRuleId}, not a node of this map`);
      }
    } else if (node.kind === "DEFINITION") {
      const def = node.unit as IRDefinition;
      const seen = new Set<string>();
      for (const t of [...def.dependsOnTerms.map((termName) => ({ termName, resolvedDefinitionId: null as string | null, path: "dependsOnTerms" })), ...collectDefinedTermReferences(def.calculationExpression)]) {
        const key = normalizeDefinedTermRef(t.termName);
        if (seen.has(key) || key === normalizeDefinedTermRef(def.termName)) continue;
        seen.add(key);
        const target = resolveDefinition(t.termName, t.resolvedDefinitionId, node.documentId);
        if (target) addEdge("DEFINITION_USES_DEFINITION", def.definitionId, target.nodeId, t.path === "dependsOnTerms" ? "IR_DEFINITION_DEPENDS_ON_TERMS" : "IR_EXPRESSION_TERM_REFERENCE", `"${def.termName}" depends on "${t.termName}"`, ref);
        else addUnresolved("UNRESOLVED_DEFINED_TERM", "REVIEW", ref, def.definitionId, node.documentId, node.sectionRef, node.sourceOrder, `"${def.termName}" depends on "${t.termName}", which has no definition node in this map`);
      }
    } else {
      const cap = node.unit as IRSharedCapacity;
      for (const m of cap.memberRuleIds) {
        if (nodeById.has(m)) addEdge("RULE_USES_SHARED_CAPACITY", m, cap.sharedCapId, "IR_SHARED_CAPACITY_MEMBERS", cap.description || cap.sharedCapId, ref);
        else addUnresolved("DANGLING_SHARED_CAPACITY_MEMBER", "REVIEW", ref, cap.sharedCapId, node.documentId, node.sectionRef, node.sourceOrder, `shared capacity member ${m} is not a node of this map`);
      }
    }
  }
  // ---- PASS 2a: package-level binding of typed source dependencies and cross-rule condition targets -----------------
  // Derived artifacts only: the units are never mutated. A BOUND binding becomes an IR-backed edge (the IR stated the
  // dependency; the package resolved its target); anything else is an UNRESOLVED_SOURCE_DEPENDENCY the map discloses.
  const packageDependencies = resolvePackageDependencies({ nodes, candidates: input.candidates.map((c) => ({ candidateRef: c.discoveryId, outcome: resultByRef.get(c.discoveryId)?.outcome ?? "UNSERVED" })), index: input.index });
  for (const b of packageDependencies.bindings) {
    const from = nodeById.get(b.fromNodeId)!;
    if (b.status === "BOUND") {
      for (const t of b.targets) {
        const target = nodeById.get(t.nodeId)!;
        if (b.kind === "CONDITION_TARGET") addEdge(target.kind === "DEFINITION" ? "RULE_USES_DEFINITION" : "RULE_SUBJECT_TO_CONDITION", b.fromNodeId, t.nodeId, "IR_CONDITION_REFERENCE", `${b.path} references ${b.exactSourceTargetRef} -> ${t.nodeId} (package binding ${b.bindingId})`, from.candidateRef);
        else addEdge(target.kind === "DEFINITION" ? "RULE_USES_DEFINITION" : "RULE_DEPENDS_ON_RULE", b.fromNodeId, t.nodeId, "IR_SOURCE_DEPENDENCY", `${b.relationshipType} ${b.exactSourceTargetRef} -> ${t.nodeId} (package binding ${b.bindingId})`, from.candidateRef, b.relationshipType);
      }
    } else {
      addUnresolved("UNRESOLVED_SOURCE_DEPENDENCY", "REVIEW", from.candidateRef, from.nodeId, from.documentId, from.sectionRef, from.sourceOrder, `${b.path} ${b.relationshipType ?? "CONDITION_TARGET"} "${b.exactSourceTargetRef}" [${b.status}]: ${b.detail}`);
    }
  }
  // structural + context-bundle + operative-state edges
  for (const node of nodes) {
    if (node.kind !== "RULE") continue;
    const rule = node.unit as IRRule;
    const r = resultByRef.get(node.candidateRef)!;
    // general prohibition by structural ancestry: a PROHIBITION rule anchored on an ancestor node (or the same candidate's chapeau)
    if (node.structuralNodeId) {
      const ancestors = input.index.getAncestors(node.structuralNodeId).map((a) => a.nodeId);
      for (const a of [node.structuralNodeId, ...ancestors]) for (const g of nodesByAnchor.get(a) ?? []) {
        if (g.kind !== "RULE" || g.nodeId === node.nodeId || g.posture !== "PROHIBITION" || rule.posture === "PROHIBITION") continue;
        addEdge("RULE_SUBJECT_TO_GENERAL_PROHIBITION", node.nodeId, g.nodeId, "STRUCTURAL_ANCESTRY", a === node.structuralNodeId ? `${g.nodeId} is the prohibition of the same structural unit` : `${g.nodeId} is the prohibition of ancestor ${a}`, node.candidateRef);
      }
    }
    for (const item of r.bundle?.items ?? []) {
      if (!item.structuralNodeId || item.structuralNodeId === node.structuralNodeId) continue;
      const targets = nodesByAnchor.get(item.structuralNodeId) ?? [];
      if (item.type === "PARENT_SCOPE") for (const g of targets) if (g.kind === "RULE" && g.posture === "PROHIBITION") addEdge("RULE_SUBJECT_TO_GENERAL_PROHIBITION", node.nodeId, g.nodeId, "CONTEXT_BUNDLE_ITEM", `parent scope ${item.normalizedRef}: ${item.reason}`, node.candidateRef);
      if (item.type === "PROVISO") for (const g of targets) if (g.kind === "RULE") addEdge("RULE_SUBJECT_TO_PROVISO", node.nodeId, g.nodeId, "CONTEXT_BUNDLE_ITEM", `proviso ${item.normalizedRef}: ${item.reason}`, node.candidateRef);
      if (item.type === "CONDITION") for (const g of targets) if (g.kind === "RULE") addEdge("RULE_SUBJECT_TO_CONDITION", node.nodeId, g.nodeId, "CONTEXT_BUNDLE_ITEM", `condition ${item.normalizedRef}: ${item.reason}`, node.candidateRef);
      if (item.type === "CROSS_DOCUMENT_REFERENCE" && item.documentId !== node.documentId) {
        if (targets.length > 0) for (const g of targets) addEdge("CROSS_DOCUMENT_DEPENDENCY", node.nodeId, g.nodeId, "CONTEXT_BUNDLE_ITEM", `cross-document reference ${item.normalizedRef} (${item.documentId}): ${item.reason}`, node.candidateRef);
        else addUnresolved("CROSS_DOCUMENT_UNRESOLVED", "REVIEW", node.candidateRef, node.nodeId, item.documentId, item.normalizedRef, null, `cross-document reference ${item.normalizedRef} in ${item.documentId} resolves to no node of this map`);
      }
    }
    if (node.operative) {
      for (const s of node.operative.supersededStructuralNodeIds) for (const g of nodesByAnchor.get(s) ?? []) addEdge("AMENDMENT_SUPERSEDES", node.nodeId, g.nodeId, "OPERATIVE_STATE", `provision ${node.operative.provisionKey}: ${node.operative.appliedEffectIds.join(",")} supersede ${s}`, node.candidateRef);
      if (node.operative.status !== "OPERATIVE_STATE_RESOLVED") addUnresolved("OPERATIVE_STATE_UNRESOLVED", "REVIEW", node.candidateRef, node.nodeId, node.documentId, node.sectionRef, node.sourceOrder, `operative state ${node.operative.status} for provision ${node.operative.provisionKey}`);
    }
  }

  // ---- PASS 2b: edge authority ------------------------------------------------------------------------------------
  // An edge is authoritative for Phase 4 only when the compiled IR established it AND both endpoints are CERTIFIED.
  // Structural ancestry alone is a fact about the tree; a context-bundle classification alone is an inference.
  const IR_DERIVATIONS: ReadonlySet<EdgeDerivation> = new Set<EdgeDerivation>(["IR_DEPENDS_ON", "IR_EXPRESSION_TERM_REFERENCE", "IR_CONDITION_REFERENCE", "IR_EXCEPTION_PERMISSION", "IR_DEFINITION_DEPENDS_ON_TERMS", "IR_SHARED_CAPACITY_MEMBERS", "IR_SOURCE_DEPENDENCY"]);
  for (const e of edges) {
    const irBacked = e.corroboratedBy.some((d) => IR_DERIVATIONS.has(d));
    const structural = e.corroboratedBy.some((d) => d === "STRUCTURAL_ANCESTRY" || d === "OPERATIVE_STATE");
    const bothCertified = nodeById.get(e.fromNodeId)?.certification.status === "CERTIFIED" && nodeById.get(e.toNodeId)?.certification.status === "CERTIFIED";
    const authority: EdgeAuthority = irBacked ? (bothCertified ? "CERTIFIED_SEMANTIC" : "REVIEW_ONLY") : structural ? "DETERMINISTIC_STRUCTURAL" : "CONTEXTUAL_INFERENCE";
    e.edgeAuthority = authority;
  }

  // ---- PASS 3: order everything ----------------------------------------------------------------------------------
  const orderedNodes = sortBySourceOrder(nodes, (n) => n.sourceOrder, (n) => `${n.kind}|${n.nodeId}`);
  const nodePos = new Map(orderedNodes.map((n, i) => [n.nodeId, i] as const));
  const orderedEdges = [...edges].sort((a, b) => (nodePos.get(a.fromNodeId)! - nodePos.get(b.fromNodeId)!) || (nodePos.get(a.toNodeId)! - nodePos.get(b.toNodeId)!) || a.edgeType.localeCompare(b.edgeType) || a.edgeId.localeCompare(b.edgeId));
  const orderedCandidates = sortBySourceOrder(candidates, (c) => c.sourceOrder, (c) => c.candidateRef);
  for (const c of orderedCandidates) c.nodeIds.sort((a, b) => nodePos.get(a)! - nodePos.get(b)!);
  const orderedUnresolved = sortBySourceOrder(unresolved, (u) => u.sourceOrder, (u) => `${u.kind}|${u.unresolvedId}`);

  // ---- completeness ------------------------------------------------------------------------------------------------
  const byOutcome: Record<string, number> = {};
  for (const c of orderedCandidates) byOutcome[c.outcome] = (byOutcome[c.outcome] ?? 0) + 1;
  const nodesByKind: Record<CovenantMapNodeKind, number> = { RULE: 0, DEFINITION: 0, SHARED_CAPACITY: 0 };
  for (const n of orderedNodes) nodesByKind[n.kind]++;
  const edgesByType = Object.fromEntries(COVENANT_MAP_EDGE_TYPES.map((t) => [t, 0])) as Record<CovenantMapEdgeType, number>;
  for (const e of orderedEdges) edgesByType[e.edgeType]++;
  const unresolvedByKind: Record<string, number> = {};
  for (const u of orderedUnresolved) unresolvedByKind[u.kind] = (unresolvedByKind[u.kind] ?? 0) + 1;
  const eligible = orderedCandidates.filter((c) => c.outcome !== "INELIGIBLE").length;
  const mapped = byOutcome.MAPPED ?? 0, mappedReview = byOutcome.MAPPED_WITH_REVIEW ?? 0;
  const certifiedCandidates = orderedCandidates.filter((c) => c.outcome !== "INELIGIBLE" && c.certificationStatus === "CERTIFIED").length;
  const reviewCandidates = orderedCandidates.filter((c) => c.outcome !== "INELIGIBLE" && c.certificationStatus === "REVIEW_REQUIRED").length;
  const edgesByAuthority: Record<EdgeAuthority, number> = { CERTIFIED_SEMANTIC: 0, DETERMINISTIC_STRUCTURAL: 0, CONTEXTUAL_INFERENCE: 0, REVIEW_ONLY: 0 };
  for (const e of orderedEdges) edgesByAuthority[e.edgeAuthority]++;
  const completeness: CovenantMapCompleteness = {
    candidatesDiscovered: orderedCandidates.length, candidatesEligible: eligible,
    candidatesAttempted: orderedCandidates.filter((c) => c.outcome !== "INELIGIBLE" && c.outcome !== "UNSERVED").length,
    candidatesMapped: mapped, candidatesMappedWithReview: mappedReview,
    candidatesFailed: (byOutcome.COMPILE_FAILED ?? 0) + (byOutcome.VERIFICATION_FAILED ?? 0) + (byOutcome.EMPTY_OPERATIVE_TEXT ?? 0) + (byOutcome.NO_STRUCTURAL_ANCHOR ?? 0),
    candidatesUnserved: byOutcome.UNSERVED ?? 0, candidatesByOutcome: byOutcome, nodesByKind, edgesByType, unresolvedByKind,
    unresolvedBlocking: orderedUnresolved.filter((u) => u.severity === "BLOCKING").length, unresolvedReview: orderedUnresolved.filter((u) => u.severity === "REVIEW").length,
    nodesVerifiedNoMaterialGap: orderedNodes.filter((n) => OK_VERIFICATION.has(n.verification.status)).length, nodesUnderReview: orderedNodes.filter((n) => !OK_VERIFICATION.has(n.verification.status)).length,
    nodesStrongIdentity: orderedNodes.filter((n) => n.identityStrength === "STRONG").length,
    mappedFraction: eligible === 0 ? null : mapped / eligible,
    complete: eligible > 0 && mapped === eligible && orderedUnresolved.length === 0,
    mapComplete: eligible > 0 && mapped === eligible && orderedUnresolved.length === 0,
    certificationComplete: eligible > 0 && certifiedCandidates === eligible,
    candidatesCertified: certifiedCandidates, candidatesReviewRequired: reviewCandidates, candidatesNotCertified: eligible - certifiedCandidates - reviewCandidates,
    semanticUnits: orderedNodes.length, semanticUnitsCertified: orderedNodes.filter((n) => n.certification.status === "CERTIFIED").length,
    edgesByAuthority,
  };

  const body: Omit<CanonicalCovenantMap, "mapHash"> = {
    schemaVersion: COVENANT_MAP_SCHEMA_VERSION, companyId: input.companyId, packageKey: input.packageKey, instrumentKey: input.instrumentKey, asOfDate: input.asOfDate, documents,
    identity: { mapAlgorithmVersion: COVENANT_MAP_ALGORITHM_VERSION, certifiedConfigIdentity: input.certifiedConfigIdentity, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, irSchemaVersion: IR_SCHEMA_VERSION, verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION, discoveryRunVersion: input.discoveryRunVersion },
    operativeState: input.operativeState ? { status: input.operativeState.status, asOfDate: input.operativeState.asOfDate, provisions: input.operativeState.provisions.length, unattachedEffects: input.operativeState.unattachedEffects.length } : null,
    discoveryPopulation: input.discoveryPopulation ?? null,
    nodes: orderedNodes, edges: orderedEdges, candidates: orderedCandidates, unresolved: orderedUnresolved, packageDependencies, completeness,
  };
  return { ...body, mapHash: computeMapHash(body) };
}

/** Content identity: everything except mapHash itself and per-candidate execution telemetry. */
export function computeMapHash(map: Omit<CanonicalCovenantMap, "mapHash"> | CanonicalCovenantMap): string {
  const { mapHash: _ignored, ...rest } = map as CanonicalCovenantMap;
  void _ignored;
  const hashed = { ...rest, candidates: rest.candidates.map((c) => ({ ...c, telemetry: null })) };
  return sha256Hex(canonicalJson(hashed));
}
