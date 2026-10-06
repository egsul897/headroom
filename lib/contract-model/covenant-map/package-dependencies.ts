/**
 * PACKAGE-LEVEL DEPENDENCY RESOLUTION (Phase 3, semantic fidelity closure).
 *
 * A compiled unit represents a contractual cross-reference as a typed IRSourceDependency (or a cross-rule condition's
 * referencesRuleTargets): the exact reference text, the structural node it resolves to, and the sealed-population
 * candidate(s) that own that node. At compile time `boundSemanticTargetIds` is ALWAYS empty - a candidate compiler owns
 * only its operative source and cannot know which certified units another candidate will produce.
 *
 * This module performs the binding once every candidate of the package has compiled: for every source dependency it
 * finds the certified units of the owning candidate that sit at (or under) the referenced structural node, and records
 * the binding as a DERIVED ARTIFACT keyed by the target units' ids and sourceContentVersions. The verified units are
 * never mutated (Option A): a binding is a package fact about two immutable units, not a field on either of them.
 *
 * Resolution outcomes distinguish "known external, not in this target set" (a PARTIAL_TARGET_SET run that compiled only
 * one candidate), "owner compiled nothing", "owner compiled but no unit at that reference" and "genuinely unknown"
 * (the compiler could not resolve the reference text to any structural node at all).
 */
import type { StructuralIndex } from "../compiler/structural-index";
import type { IRRule, IRResolvedStructuralTarget, IRSourceTargetRef, IRSourceTargetSelector } from "../ir/types";
import { normalizeReferenceText } from "../compiler/semantic/source-reference";
import { sha256Hex } from "./source-content-version";
import type { CovenantMapNode } from "./types";

// v2 (reference fidelity closure): a whole-section reference is bound ONE-TO-MANY to the certified units that sit
// under the referenced node (bindingMode ONE_TO_MANY_EXPANSION) - a derived package artifact, the candidate keeps the
// reference as drafted. The expansion is admitted only when the referenced subtree is completely represented: every
// target-set candidate anchored at or under the referenced node produced units. Otherwise the target set is not safely
// determinable and the binding is TARGET_SET_REVIEW_REQUIRED (never a partial, silently incomplete ALL_SATISFIED set).
// v3 (source-authority closure SA-2): a one-to-many expansion honours the reference's SOURCE-DERIVED target selector.
// A WHOLE_PROVISION / EXPLICIT_SUBCLAUSE_SET reference binds as before; a QUALIFIED_RULE_SET reference ("the financial
// covenants contained in Section X") binds only the units whose independently compiled classification (covenant family /
// rule type) deterministically satisfies the qualifier, and only when such a classification mapping exists -
// otherwise TARGET_SELECTOR_REVIEW_REQUIRED (not executable). The child compiler never pre-selects target rules.
export const PACKAGE_DEPENDENCY_RESOLUTION_VERSION = "p3-package-dependency-resolution.v3" as const;

export type PackageDependencyBindingStatus =
  /** One or more certified-or-not units of the owning candidate sit at the referenced node; boundSemanticTargetIds names them. */
  | "BOUND"
  /** The reference resolved to a node owned by a sealed-population candidate that is NOT in this package's target set (a partial run). */
  | "TARGET_CANDIDATE_NOT_IN_TARGET_SET"
  /** The owning candidate is in the target set but produced no units (compile failed / unserved / ineligible). */
  | "TARGET_CANDIDATE_NOT_COMPILED"
  /** The owning candidate produced units, none of which sit at (or under) the referenced node. */
  | "TARGET_UNIT_NOT_FOUND"
  /** The compiler could not resolve the reference text to any structural node (DEPENDENCY_UNKNOWN on the unit). */
  | "DEPENDENCY_UNKNOWN"
  /** v2: units exist under the referenced node but the referenced subtree is not completely represented (a candidate anchored under it produced no units), so the one-to-many target set cannot be established safely. */
  | "TARGET_SET_REVIEW_REQUIRED"
  /** v3: the reference carries a qualified / unresolved target selector that the package cannot satisfy deterministically; the target set needs review. */
  | "TARGET_SELECTOR_REVIEW_REQUIRED";

/** v2: how a BOUND binding's target set was established. v3: QUALIFIED_ONE_TO_MANY when a qualified selector was satisfied deterministically. */
export type PackageDependencyBindingMode = "EXACT_UNIT" | "ONE_TO_MANY_EXPANSION" | "QUALIFIED_ONE_TO_MANY";

/** v3: how a qualified selector was (or was not) satisfied at package level. */
export interface PackageSelectorResolution {
  kind: IRSourceTargetSelector["kind"];
  qualifierText: string | null;
  /** The independently compiled classification the qualifier was mapped to (families / rule types), or null when no deterministic mapping exists. */
  basis: { covenantFamilies: string[]; ruleTypes: string[] } | null;
  selectedNodeIds: string[];
  excludedNodeIds: string[];
  detail: string;
}

export type PackageDependencyKind = "SOURCE_DEPENDENCY" | "CONDITION_TARGET";

export interface PackageDependencyTargetUnit {
  nodeId: string;
  candidateRef: string;
  sectionRef: string | null;
  structuralNodeId: string | null;
  /** The target unit's own identity at binding time: a later recompilation of the target invalidates this binding. */
  sourceContentVersion: string | null;
  certificationStatus: string;
}

export interface PackageDependencyBinding {
  /** Deterministic: sha256(fromNodeId | path | exactSourceTargetRef). */
  bindingId: string;
  kind: PackageDependencyKind;
  fromNodeId: string;
  fromCandidateRef: string;
  fromCertificationStatus: string;
  /** IR path on the source unit ("sourceDependencies[0]", "conditions[1].referencesRuleTargets[0]"). */
  path: string;
  relationshipType: string | null;
  exactSourceTargetRef: string;
  normalizedTargetRef: string | null;
  resolvedStructuralTarget: IRResolvedStructuralTarget | null;
  owningCandidateRefs: string[];
  /** The derived binding: target unit ids, sorted. Empty unless status is BOUND. */
  boundSemanticTargetIds: string[];
  targets: PackageDependencyTargetUnit[];
  status: PackageDependencyBindingStatus;
  /** v2: EXACT_UNIT when a unit sits at the referenced node itself and nothing else; ONE_TO_MANY_EXPANSION when the drafted reference is expanded onto the units under it (a derived package artifact). Null unless BOUND. */
  bindingMode: PackageDependencyBindingMode | null;
  /** v3: present whenever the reference carried a selector and the binding was a one-to-many question. */
  selectorResolution?: PackageSelectorResolution | null;
  /** True only when BOUND and the source unit and every target unit are CERTIFIED - the only binding Phase 4 may act on. */
  executable: boolean;
  detail: string;
}

export interface PackageSemanticGraphEdge { from: string; to: string; kind: PackageDependencyKind; relationshipType: string | null; executable: boolean; bindingId: string }

export interface PackageSemanticGraph {
  /** Every node that is a source or a bound target of a binding, sorted. */
  nodeIds: string[];
  edges: PackageSemanticGraphEdge[];
}

export interface PackageDependencyResolution {
  version: typeof PACKAGE_DEPENDENCY_RESOLUTION_VERSION;
  bindings: PackageDependencyBinding[];
  graph: PackageSemanticGraph;
  counts: { total: number; bound: number; executable: number; notInTargetSet: number; notCompiled: number; unitNotFound: number; unknown: number; reviewRequired: number; oneToMany: number; selectorReview: number; qualifiedOneToMany: number };
}

export interface ResolvePackageDependenciesArgs {
  nodes: readonly CovenantMapNode[];
  /** Every candidate of the package (the target set), with its outcome and (v2) its anchor node(s) for subtree-coverage checks. */
  candidates: readonly { candidateRef: string; outcome: string; structuralNodeIds?: readonly string[] }[];
  index?: StructuralIndex | null;
}

const normRef = (ref: string | null | undefined): string | null => (ref ? normalizeReferenceText(ref) ?? ref.trim().toLowerCase() : null);

/**
 * v3: the generic qualifier vocabulary -> independently compiled classification. Each entry maps a target-selection
 * noun ("financial covenants", "restrictions on Asset Sales", "baskets") to the covenant families / rule types a
 * target unit must carry. Deliberately small and generic; a qualifier outside it is unsupported and fails closed.
 */
const QUALIFIER_CLASSIFICATIONS: readonly { re: RegExp; covenantFamilies: string[]; ruleTypes: string[] }[] = [
  { re: /\bfinancial\s+covenants?\b|\bratio\s+covenants?\b|\bfinancial\s+(?:maintenance\s+)?tests?\b/i, covenantFamilies: ["FINANCIAL_COVENANTS"], ruleTypes: ["RATIO_TEST"] },
  { re: /\basset\s+sales?\b|\bdispositions?\b/i, covenantFamilies: ["ASSET_SALES", "DISPOSITIONS"], ruleTypes: [] },
  { re: /\brestricted\s+payments?\b|\bdividends?\b/i, covenantFamilies: ["RESTRICTED_PAYMENTS"], ruleTypes: [] },
  { re: /\binvestments?\b/i, covenantFamilies: ["INVESTMENTS"], ruleTypes: [] },
  { re: /\bliens?\b/i, covenantFamilies: ["LIENS"], ruleTypes: [] },
  { re: /\bindebtedness\b|\bdebt\b/i, covenantFamilies: ["INDEBTEDNESS"], ruleTypes: [] },
  { re: /\breporting\b|\bfinancial\s+statements?\b/i, covenantFamilies: ["REPORTING_INFORMATION"], ruleTypes: ["REPORTING_OBLIGATION"] },
  { re: /\bnotices?\b|\bnotification/i, covenantFamilies: ["NOTICE_REQUIREMENTS"], ruleTypes: ["NOTICE_OBLIGATION"] },
  { re: /\bbaskets?\b|\bpermissions?\b/i, covenantFamilies: [], ruleTypes: ["QUANTITATIVE_PERMISSION"] },
];

function classificationForQualifier(qualifier: string | null): { covenantFamilies: string[]; ruleTypes: string[] } | null {
  if (!qualifier) return null;
  const hits = QUALIFIER_CLASSIFICATIONS.filter((q) => q.re.test(qualifier));
  if (hits.length !== 1) return null; // ambiguous or unsupported qualifier: fail closed
  return { covenantFamilies: hits[0]!.covenantFamilies, ruleTypes: hits[0]!.ruleTypes };
}

/** Does this unit's independently compiled classification satisfy the qualifier's classification? */
function unitSatisfies(node: CovenantMapNode, basis: { covenantFamilies: string[]; ruleTypes: string[] }): boolean {
  if (node.kind !== "RULE") return false;
  return basis.covenantFamilies.includes(node.family) || (node.ruleType !== null && basis.ruleTypes.includes(node.ruleType));
}

/** Does `node` sit at or under the referenced structural target / section ref? */
function nodeSitsAt(node: CovenantMapNode, target: IRSourceTargetRef, index: StructuralIndex | null | undefined): boolean {
  // a defined-term reference binds to the DEFINITION unit of that term, never to every unit of the defining section
  if (target.targetDefinedTerm) return node.kind === "DEFINITION" && (node.termName ?? "").trim().toLowerCase() === target.targetDefinedTerm.trim().toLowerCase();
  const t = target.resolvedStructuralTarget;
  if (t && node.structuralNodeId) {
    if (node.structuralNodeId === t.structuralNodeId) return true;
    if (index) { try { if (index.getAncestors(node.structuralNodeId).some((a) => a.nodeId === t.structuralNodeId)) return true; } catch { /* no ancestry available */ } }
  }
  const want = target.normalizedTargetRef ?? normRef(t?.sectionRef ?? null);
  const have = normRef(node.sectionRef);
  if (!want || !have) return false;
  return have === want || have.startsWith(`${want}(`) || have.startsWith(`${want}.`);
}

export function resolvePackageDependencies(args: ResolvePackageDependenciesArgs): PackageDependencyResolution {
  const inTargetSet = new Map(args.candidates.map((c) => [c.candidateRef, c] as const));
  const nodesByCandidate = new Map<string, CovenantMapNode[]>();
  for (const n of args.nodes) { const l = nodesByCandidate.get(n.candidateRef) ?? []; l.push(n); nodesByCandidate.set(n.candidateRef, l); }
  const bindings: PackageDependencyBinding[] = [];

  const bind = (from: CovenantMapNode, kind: PackageDependencyKind, path: string, relationshipType: string | null, target: IRSourceTargetRef): void => {
    const bindingId = sha256Hex(`${from.nodeId}|${path}|${target.exactSourceTargetRef}`).slice(0, 24);
    const base = { bindingId, kind, fromNodeId: from.nodeId, fromCandidateRef: from.candidateRef, fromCertificationStatus: from.certification.status, path, relationshipType, exactSourceTargetRef: target.exactSourceTargetRef, normalizedTargetRef: target.normalizedTargetRef, resolvedStructuralTarget: target.resolvedStructuralTarget, owningCandidateRefs: [...target.owningCandidateRefs].sort() };
    if (target.resolutionStatus === "DEPENDENCY_UNKNOWN" || (!target.resolvedStructuralTarget && !target.normalizedTargetRef)) {
      bindings.push({ ...base, boundSemanticTargetIds: [], targets: [], status: "DEPENDENCY_UNKNOWN", bindingMode: null, executable: false, detail: `"${target.exactSourceTargetRef}" resolved to no structural node; the dependency is genuinely unknown` });
      return;
    }
    const owners = base.owningCandidateRefs;
    // candidate pool: the owning candidates when known, else every candidate of the same document
    const pool = owners.length > 0 ? args.nodes.filter((n) => owners.includes(n.candidateRef)) : args.nodes.filter((n) => n.documentId === (target.resolvedStructuralTarget?.documentId ?? from.documentId));
    const matched = pool.filter((n) => n.nodeId !== from.nodeId && nodeSitsAt(n, target, args.index)).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    if (matched.length > 0) {
      const targets = matched.map((n) => ({ nodeId: n.nodeId, candidateRef: n.candidateRef, sectionRef: n.sectionRef, structuralNodeId: n.structuralNodeId, sourceContentVersion: n.sourceContentVersion, certificationStatus: n.certification.status }));
      const t = target.resolvedStructuralTarget;
      const exact = !!t && matched.every((n) => n.structuralNodeId === t.structuralNodeId) || (!t && !target.targetDefinedTerm && matched.every((n) => normRef(n.sectionRef) === (target.normalizedTargetRef ?? "")));
      const bindingMode: PackageDependencyBindingMode = exact || target.targetDefinedTerm ? "EXACT_UNIT" : "ONE_TO_MANY_EXPANSION";
      // v2 target-set safety: a one-to-many expansion is admitted only when every target-set candidate anchored at or under
      // the referenced node produced units - otherwise part of the referenced provision is silently absent from the set.
      if (bindingMode === "ONE_TO_MANY_EXPANSION" && t && args.index) {
        const uncovered = args.candidates.filter((c) => (c.structuralNodeIds ?? []).length > 0 && inTargetSet.has(c.candidateRef) && (nodesByCandidate.get(c.candidateRef) ?? []).length === 0).filter((c) => {
          const anchor = c.structuralNodeIds![0]!;
          if (anchor === t.structuralNodeId) return true;
          try { return args.index!.getAncestors(anchor).some((a) => a.nodeId === t.structuralNodeId); } catch { return false; }
        });
        if (uncovered.length > 0) {
          bindings.push({ ...base, boundSemanticTargetIds: [], targets, status: "TARGET_SET_REVIEW_REQUIRED", bindingMode: null, executable: false, detail: `${targets.length} unit(s) sit under ${target.normalizedTargetRef ?? target.exactSourceTargetRef} but candidate(s) ${uncovered.map((c) => `${c.candidateRef} (${c.outcome})`).join(", ")} anchored inside the referenced provision produced no units; the one-to-many target set is not safely determinable` });
          return;
        }
      }
      // v3 selector safety: a one-to-many expansion must satisfy the SOURCE-DERIVED selector. A qualified selector binds only
      // the units whose independently compiled classification deterministically matches the qualifier; an unsupported or
      // unresolved selector fails closed. The candidate's own unit is never consulted for the selection and never mutated.
      const selector = target.selector ?? null;
      let finalTargets = targets;
      let finalMode: PackageDependencyBindingMode = bindingMode;
      let selectorResolution: PackageSelectorResolution | null = null;
      if (bindingMode === "ONE_TO_MANY_EXPANSION" && selector && selector.kind !== "WHOLE_PROVISION" && selector.kind !== "EXPLICIT_SUBCLAUSE_SET" && selector.kind !== "NAMED_CONDITION") {
        const basis = selector.kind === "QUALIFIED_RULE_SET" ? classificationForQualifier(selector.qualifierText) : null;
        const selected = basis ? matched.filter((n) => unitSatisfies(n, basis)) : [];
        selectorResolution = { kind: selector.kind, qualifierText: selector.qualifierText, basis, selectedNodeIds: selected.map((n) => n.nodeId), excludedNodeIds: matched.filter((n) => !selected.includes(n)).map((n) => n.nodeId), detail: !basis ? `selector "${selector.sourceText}" (${selector.kind}) has no deterministic classification mapping; the target set is not established` : selected.length === 0 ? `selector "${selector.sourceText}" maps to ${[...basis.covenantFamilies, ...basis.ruleTypes].join(" / ")} but no unit under ${target.normalizedTargetRef ?? target.exactSourceTargetRef} carries that classification` : `selector "${selector.sourceText}" maps to ${[...basis.covenantFamilies, ...basis.ruleTypes].join(" / ")}: ${selected.length} of ${matched.length} unit(s) under the provision selected, ${matched.length - selected.length} excluded` };
        if (!basis || selected.length === 0) {
          bindings.push({ ...base, boundSemanticTargetIds: [], targets, status: "TARGET_SELECTOR_REVIEW_REQUIRED", bindingMode: null, selectorResolution, executable: false, detail: `${targets.length} unit(s) sit under ${target.normalizedTargetRef ?? target.exactSourceTargetRef} but ${selectorResolution.detail}; review required` });
          return;
        }
        finalTargets = targets.filter((t) => selectorResolution!.selectedNodeIds.includes(t.nodeId));
        finalMode = "QUALIFIED_ONE_TO_MANY";
      }
      const executable = from.certification.status === "CERTIFIED" && finalTargets.every((t) => t.certificationStatus === "CERTIFIED");
      bindings.push({ ...base, boundSemanticTargetIds: finalTargets.map((t) => t.nodeId), targets: finalTargets, status: "BOUND", bindingMode: finalMode, ...(selectorResolution || (selector && bindingMode === "ONE_TO_MANY_EXPANSION") ? { selectorResolution: selectorResolution ?? { kind: selector!.kind, qualifierText: selector!.qualifierText, basis: null, selectedNodeIds: targets.map((t) => t.nodeId), excludedNodeIds: [], detail: `selector ${selector!.kind}: every unit under the provision is the stated target` } } : {}), executable, detail: `${finalTargets.length} target unit(s) at ${target.normalizedTargetRef ?? target.exactSourceTargetRef} (${finalMode === "EXACT_UNIT" ? "the unit at the referenced node" : finalMode === "QUALIFIED_ONE_TO_MANY" ? `qualified one-to-many expansion: ${selectorResolution!.detail}` : "one-to-many expansion of the drafted reference onto the units under it - a derived package artifact"})${executable ? "; source and every target CERTIFIED" : "; not executable: an endpoint is not CERTIFIED"}` });
      return;
    }
    if (owners.length > 0 && !owners.some((o) => inTargetSet.has(o))) {
      bindings.push({ ...base, boundSemanticTargetIds: [], targets: [], status: "TARGET_CANDIDATE_NOT_IN_TARGET_SET", bindingMode: null, executable: false, detail: `owning candidate(s) ${owners.join(", ")} are known to the sealed population but not in this package's target set` });
      return;
    }
    if (owners.length > 0 && owners.every((o) => (nodesByCandidate.get(o) ?? []).length === 0)) {
      bindings.push({ ...base, boundSemanticTargetIds: [], targets: [], status: "TARGET_CANDIDATE_NOT_COMPILED", bindingMode: null, executable: false, detail: `owning candidate(s) ${owners.join(", ")} produced no units (${owners.map((o) => inTargetSet.get(o)?.outcome ?? "ABSENT").join(", ")})` });
      return;
    }
    bindings.push({ ...base, boundSemanticTargetIds: [], targets: [], status: "TARGET_UNIT_NOT_FOUND", bindingMode: null, executable: false, detail: owners.length > 0 ? `owning candidate(s) ${owners.join(", ")} compiled units, none at ${target.normalizedTargetRef ?? target.exactSourceTargetRef}` : `no owning candidate recorded and no unit of ${target.resolvedStructuralTarget?.documentId ?? from.documentId} sits at ${target.normalizedTargetRef ?? target.exactSourceTargetRef}` });
  };

  for (const node of args.nodes) {
    if (node.kind !== "RULE") continue;
    const rule = node.unit as IRRule;
    (rule.sourceDependencies ?? []).forEach((d, i) => bind(node, "SOURCE_DEPENDENCY", `sourceDependencies[${i}]`, d.relationshipType, d));
    rule.conditions.forEach((c, i) => (c.referencesRuleTargets ?? []).forEach((t, k) => bind(node, "CONDITION_TARGET", `conditions[${i}].referencesRuleTargets[${k}]`, null, t)));
    // v2: an exception's own cross-rule conditions ("except Liens securing Indebtedness permitted under Section X") are bound too
    rule.exceptions.forEach((e, i) => e.conditions.forEach((c, j) => (c.referencesRuleTargets ?? []).forEach((t, k) => bind(node, "CONDITION_TARGET", `exceptions[${i}].conditions[${j}].referencesRuleTargets[${k}]`, null, t))));
  }
  bindings.sort((a, b) => a.fromNodeId.localeCompare(b.fromNodeId) || a.path.localeCompare(b.path) || a.bindingId.localeCompare(b.bindingId));

  const edges: PackageSemanticGraphEdge[] = [];
  const graphNodes = new Set<string>();
  for (const b of bindings) {
    if (b.status !== "BOUND") continue;
    graphNodes.add(b.fromNodeId);
    for (const t of b.boundSemanticTargetIds) { graphNodes.add(t); edges.push({ from: b.fromNodeId, to: t, kind: b.kind, relationshipType: b.relationshipType, executable: b.executable, bindingId: b.bindingId }); }
  }
  const counts = {
    total: bindings.length,
    bound: bindings.filter((b) => b.status === "BOUND").length,
    executable: bindings.filter((b) => b.executable).length,
    notInTargetSet: bindings.filter((b) => b.status === "TARGET_CANDIDATE_NOT_IN_TARGET_SET").length,
    notCompiled: bindings.filter((b) => b.status === "TARGET_CANDIDATE_NOT_COMPILED").length,
    unitNotFound: bindings.filter((b) => b.status === "TARGET_UNIT_NOT_FOUND").length,
    unknown: bindings.filter((b) => b.status === "DEPENDENCY_UNKNOWN").length,
    reviewRequired: bindings.filter((b) => b.status === "TARGET_SET_REVIEW_REQUIRED").length,
    oneToMany: bindings.filter((b) => b.bindingMode === "ONE_TO_MANY_EXPANSION").length,
    selectorReview: bindings.filter((b) => b.status === "TARGET_SELECTOR_REVIEW_REQUIRED").length,
    qualifiedOneToMany: bindings.filter((b) => b.bindingMode === "QUALIFIED_ONE_TO_MANY").length,
  };
  return { version: PACKAGE_DEPENDENCY_RESOLUTION_VERSION, bindings, graph: { nodeIds: [...graphNodes].sort(), edges }, counts };
}
