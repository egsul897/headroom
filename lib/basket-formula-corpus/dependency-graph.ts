/**
 * Dependency graphs for basket/formula candidates.
 *
 * Distinguishes discoverable vs source-backed vs legally verified vs
 * sufficient-for-executable. Never promotes unresolved candidates to executable.
 */

import type { GoverningSourceBinding } from "./governing-binding";
import type { SemanticRole } from "./semantic-role";

export const DEPENDENCY_KINDS = [
  "GOVERNING_AUTHORITY",
  "DEFINITION",
  "FORMULA_INPUT",
  "MEASUREMENT_PERIOD",
  "ENTITY_RESTRICTION",
  "EXCEPTION_OR_PROVISO",
  "CROSS_DOCUMENT_LIMITATION",
  "AMENDMENT_PRECEDENCE",
  "SHARED_CAPACITY_INTERACTION",
  "UNRESOLVED_LEGAL_QUESTION",
] as const;

export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

export const DEPENDENCY_STATUSES = [
  "RESOLVED",
  "UNRESOLVED",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "REQUIRES_INDEPENDENT_REVIEW",
] as const;

export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number];

export type DependencyEpistemic =
  | "DISCOVERABLE"
  | "SOURCE_BACKED"
  | "LEGALLY_VERIFIED"
  | "SUFFICIENT_FOR_EXECUTABLE";

export interface FormulaDependencyNode {
  id: string;
  kind: DependencyKind;
  label: string;
  status: DependencyStatus;
  /** Highest epistemic claim supported — never claim verified/executable without gates. */
  epistemic: DependencyEpistemic;
  evidence: string | null;
  owner: string;
  blocker?: string;
}

export interface FormulaDependencyGraph {
  candidateId: string;
  nodes: FormulaDependencyNode[];
  /** Demonstrably closed only when every required node is RESOLVED and SOURCE_BACKED+ and authority present. */
  completeness: {
    requiredCount: number;
    resolvedCount: number;
    fullyClosed: boolean;
    reason: string;
  };
  executable: false;
}

export function buildDependencyGraph(input: {
  candidateId: string;
  semanticRole: SemanticRole;
  binding: GoverningSourceBinding;
  financialInputs: string[];
  sharedCapacityDependencies: string[];
  conditions: string[];
  peer: {
    definitionEncyclopediaAvailable: boolean;
    dependencyAtlasAvailable: boolean;
    ncedAvailable: boolean;
    financialDefinitionsAvailable: boolean;
    amendmentAuthorityAvailable: boolean;
    legalCoreVerified: boolean;
    knowledgeFactoryVerified: boolean;
  };
}): FormulaDependencyGraph {
  const nodes: FormulaDependencyNode[] = [];
  const b = input.binding;

  nodes.push({
    id: `${input.candidateId}::governing`,
    kind: "GOVERNING_AUTHORITY",
    label: b.parentSection?.label || b.governingProhibitionOrPermission?.text.slice(0, 120) || "governing authority",
    status: b.sufficientForAffirmativePermission
      ? "RESOLVED"
      : b.governingProhibitionOrPermission
        ? "REQUIRES_INDEPENDENT_REVIEW"
        : "UNRESOLVED",
    epistemic: b.governingProhibitionOrPermission?.provenance.byteExact
      ? "SOURCE_BACKED"
      : b.governingProhibitionOrPermission
        ? "DISCOVERABLE"
        : "DISCOVERABLE",
    evidence: b.governingProhibitionOrPermission
      ? `matchKind=${b.governingProhibitionOrPermission.provenance.matchKind}`
      : null,
    owner: "Basket Formula Library / Legal Core",
    blocker: b.sufficientForAffirmativePermission ? undefined : "GOVERNING_AUTHORITY_INCOMPLETE",
  });

  for (const term of b.definedTerms) {
    const available = input.peer.definitionEncyclopediaAvailable;
    nodes.push({
      id: `${input.candidateId}::def::${term}`,
      kind: "DEFINITION",
      label: term,
      status: available ? "REQUIRES_INDEPENDENT_REVIEW" : "UNRESOLVED",
      epistemic: available ? "DISCOVERABLE" : "DISCOVERABLE",
      evidence: available ? "Definition Encyclopedia export visible (not legally verified for this candidate)" : null,
      owner: "Definition Encyclopedia",
      blocker: available
        ? "DEFINITION_DISCOVERABLE_NOT_LEGALLY_VERIFIED"
        : "DEFINITION_ENCYCLOPEDIA_UNAVAILABLE",
    });
  }

  for (const fi of input.financialInputs) {
    const available = input.peer.financialDefinitionsAvailable;
    nodes.push({
      id: `${input.candidateId}::input::${fi.slice(0, 80)}`,
      kind: "FORMULA_INPUT",
      label: fi.slice(0, 160),
      status: available ? "REQUIRES_INDEPENDENT_REVIEW" : "UNRESOLVED",
      epistemic: "DISCOVERABLE",
      evidence: available ? "Financial Definitions Precedent export visible" : null,
      owner: "Financial Definitions Precedent",
      blocker: available
        ? "FINANCIAL_INPUT_DISCOVERABLE_NOT_VERIFIED"
        : "FINANCIAL_DEFINITIONS_PRECEDENT_MISSING",
    });
  }

  nodes.push({
    id: `${input.candidateId}::measurement`,
    kind: "MEASUREMENT_PERIOD",
    label: b.measurementDateOrTestingPeriod || "measurement period unspecified",
    status: b.measurementDateOrTestingPeriod ? "REQUIRES_INDEPENDENT_REVIEW" : "UNRESOLVED",
    epistemic: b.measurementDateOrTestingPeriod ? "SOURCE_BACKED" : "DISCOVERABLE",
    evidence: b.measurementDateOrTestingPeriod,
    owner: "Basket Formula Library",
    blocker: b.measurementDateOrTestingPeriod ? undefined : "MEASUREMENT_DATE_UNSPECIFIED",
  });

  nodes.push({
    id: `${input.candidateId}::entity`,
    kind: "ENTITY_RESTRICTION",
    label: b.entityScope || "entity scope unspecified",
    status: b.entityScope ? "REQUIRES_INDEPENDENT_REVIEW" : "UNRESOLVED",
    epistemic: b.entityScope ? "SOURCE_BACKED" : "DISCOVERABLE",
    evidence: b.entityScope,
    owner: "Basket Formula Library",
    blocker: b.entityScope ? undefined : "ENTITY_SCOPE_UNSPECIFIED",
  });

  for (const cond of input.conditions) {
    nodes.push({
      id: `${input.candidateId}::exception::${cond.slice(0, 60)}`,
      kind: "EXCEPTION_OR_PROVISO",
      label: cond.slice(0, 160),
      status: input.peer.ncedAvailable ? "REQUIRES_INDEPENDENT_REVIEW" : "UNRESOLVED",
      epistemic: "DISCOVERABLE",
      evidence: input.peer.ncedAvailable ? "NCED export visible" : null,
      owner: "Negative Covenant Exception Database",
      blocker: input.peer.ncedAvailable
        ? "EXCEPTION_DISCOVERABLE_NOT_LEGALLY_VERIFIED"
        : "EXCEPTION_DB_MISSING",
    });
  }

  for (const xref of b.referencedSections) {
    nodes.push({
      id: `${input.candidateId}::xref::${xref}`,
      kind: "CROSS_DOCUMENT_LIMITATION",
      label: xref,
      status: input.peer.dependencyAtlasAvailable ? "REQUIRES_INDEPENDENT_REVIEW" : "AMBIGUOUS",
      epistemic: "DISCOVERABLE",
      evidence: input.peer.dependencyAtlasAvailable ? "Dependency Atlas export visible" : null,
      owner: "Dependency Atlas",
      blocker: input.peer.dependencyAtlasAvailable
        ? "ATLAS_EDGE_DISCOVERABLE_NOT_VERIFIED"
        : "DEPENDENCY_ATLAS_UNAVAILABLE",
    });
  }

  nodes.push({
    id: `${input.candidateId}::amendment`,
    kind: "AMENDMENT_PRECEDENCE",
    label: b.amendmentVersionAuthority || "amendment/version authority",
    status: input.peer.amendmentAuthorityAvailable
      ? "REQUIRES_INDEPENDENT_REVIEW"
      : b.amendmentVersionAuthority
        ? "REQUIRES_INDEPENDENT_REVIEW"
        : "UNRESOLVED",
    epistemic: "DISCOVERABLE",
    evidence: b.amendmentVersionAuthority,
    owner: "Amendment/version authority (ACR)",
    blocker: input.peer.amendmentAuthorityAvailable
      ? "AMENDMENT_DISCOVERABLE_NOT_VERIFIED"
      : "AMENDMENT_AUTHORITY_UNSPECIFIED",
  });

  for (const shared of input.sharedCapacityDependencies) {
    nodes.push({
      id: `${input.candidateId}::shared::${shared.slice(0, 60)}`,
      kind: "SHARED_CAPACITY_INTERACTION",
      label: shared.slice(0, 160),
      status: input.peer.dependencyAtlasAvailable ? "REQUIRES_INDEPENDENT_REVIEW" : "UNRESOLVED",
      epistemic: "DISCOVERABLE",
      evidence: null,
      owner: "Dependency Atlas",
      blocker: "SHARED_CAPACITY_NOT_ATLAS_VERIFIED",
    });
  }

  if (!input.peer.legalCoreVerified) {
    nodes.push({
      id: `${input.candidateId}::legal-core`,
      kind: "UNRESOLVED_LEGAL_QUESTION",
      label: "Legal Core independent verification",
      status: "UNRESOLVED",
      epistemic: "DISCOVERABLE",
      evidence: null,
      owner: "Architecture Remediation / Legal Core",
      blocker: "LEGAL_CORE_NOT_VERIFIED",
    });
  }

  if (!input.peer.knowledgeFactoryVerified) {
    nodes.push({
      id: `${input.candidateId}::kf`,
      kind: "UNRESOLVED_LEGAL_QUESTION",
      label: "Knowledge Factory verified import",
      status: "UNRESOLVED",
      epistemic: "DISCOVERABLE",
      evidence: null,
      owner: "Covenant Knowledge Factory",
      blocker: "KNOWLEDGE_FACTORY_NOT_VERIFIED",
    });
  }

  // Fully closed requires every node RESOLVED with at least SOURCE_BACKED epistemic,
  // plus Legal Core + KF verified. Populated fields alone are insufficient.
  const required = nodes;
  const resolved = required.filter((n) => n.status === "RESOLVED" && (n.epistemic === "SOURCE_BACKED" || n.epistemic === "LEGALLY_VERIFIED" || n.epistemic === "SUFFICIENT_FOR_EXECUTABLE"));
  const fullyClosed =
    required.length > 0 &&
    resolved.length === required.length &&
    input.peer.legalCoreVerified &&
    input.peer.knowledgeFactoryVerified;

  return {
    candidateId: input.candidateId,
    nodes,
    completeness: {
      requiredCount: required.length,
      resolvedCount: resolved.length,
      fullyClosed,
      reason: fullyClosed
        ? "All required dependencies resolved and source-backed with Legal Core + KF verification."
        : "Not demonstrably closed — unresolved/review-required dependencies remain; field population alone is insufficient.",
    },
    executable: false,
  };
}

export function dependencyCountsByStatus(graph: FormulaDependencyGraph): Record<DependencyStatus, number> {
  const out: Record<DependencyStatus, number> = {
    RESOLVED: 0,
    UNRESOLVED: 0,
    AMBIGUOUS: 0,
    UNSUPPORTED: 0,
    REQUIRES_INDEPENDENT_REVIEW: 0,
  };
  for (const n of graph.nodes) out[n.status] += 1;
  return out;
}

export function dependencyCountsByKind(graph: FormulaDependencyGraph): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of graph.nodes) out[n.kind] = (out[n.kind] || 0) + 1;
  return out;
}
