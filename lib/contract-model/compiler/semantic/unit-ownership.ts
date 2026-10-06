/**
 * SEMANTIC-UNIT OWNERSHIP (Phase 3 semantic fidelity) - "context may inform, but may not own".
 *
 * A candidate compiler may emit a rule, definition or shared capacity only for a proposition owned by the candidate's
 * OPERATIVE source: the anchor node, descendants inside its operative region(s), or a definition whose defining text lies
 * inside that region. A unit whose cited source is the parent, a sibling, a referenced section or a context-only
 * definition is a CONTEXT_ONLY_UNIT_EMISSION: quarantined with its evidence, never part of the candidate's certified IR.
 * Deterministic and agreement-agnostic: it compares section refs and structural ancestry, nothing else.
 */
import type { StructuralIndex } from "../structural-index";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../../ir/types";
import { normalizeReferenceText } from "./source-reference";

export const UNIT_OWNERSHIP_VALIDATION_VERSION = "semantic-unit-ownership.v1";

export type UnitOwnership = "OWNED_BY_OPERATIVE_SOURCE" | "CONTEXT_ONLY_UNIT_EMISSION" | "OWNERSHIP_UNDETERMINED";

export interface OwnershipScope {
  documentId: string;
  /** Normalized defined terms the context bundle retrieved as DEFINITION / DEFINITION_DEPENDENCY items (defined elsewhere in the document). */
  contextDefinedTerms?: ReadonlySet<string>;
  /** The candidate's own section ref (null for a definitions-article candidate without a ref). */
  candidateSectionRef: string | null;
  /** The anchor node and every node inside the operative region(s) (operative regions' own nodes). */
  anchorNodeId: string | null;
  operativeRegionRefs: string[];
  operativeText: string;
  index: StructuralIndex | null;
}

export interface OwnershipDecision { ownership: UnitOwnership; reason: string; unitRef: string | null; relation: "SELF" | "DESCENDANT" | "PARENT" | "SIBLING" | "OTHER_SECTION" | "DEFINITION_IN_SOURCE" | "DEFINITION_IN_CONTEXT" | "UNRESOLVED" }

const isDescendantRef = (child: string, parent: string) => child !== parent && (child.startsWith(`${parent}(`) || child.startsWith(`${parent}.`));

/** Rule / shared-capacity ownership by its cited section ref, corroborated by the structural index when available. */
export function classifyUnitOwnership(unitRef: string | null | undefined, scope: OwnershipScope): OwnershipDecision {
  const u = unitRef ? normalizeReferenceText(unitRef) : null;
  const c = scope.candidateSectionRef ? normalizeReferenceText(scope.candidateSectionRef) : null;
  if (!c) return { ownership: "OWNERSHIP_UNDETERMINED", reason: "the candidate carries no section ref; ownership cannot be judged by reference", unitRef: u, relation: "UNRESOLVED" };
  if (!u) return { ownership: "OWNERSHIP_UNDETERMINED", reason: "the unit carries no section-shaped ref; ownership cannot be judged by reference", unitRef: u, relation: "UNRESOLVED" };
  const regionRefs = new Set([c, ...scope.operativeRegionRefs.map((r) => normalizeReferenceText(r) ?? r)]);
  if (regionRefs.has(u)) return { ownership: "OWNED_BY_OPERATIVE_SOURCE", reason: "the unit cites the candidate's own operative source", unitRef: u, relation: "SELF" };
  if ([...regionRefs].some((r) => isDescendantRef(u, r))) {
    // structural corroboration when the index knows both nodes: the unit's node must sit under the anchor
    if (scope.index && scope.anchorNodeId) {
      const res = scope.index.resolveUniqueNodeByRef(scope.documentId, u);
      if (res.status === "UNIQUE" && !scope.index.getAncestors(res.node.nodeId).some((a) => a.nodeId === scope.anchorNodeId) && res.node.nodeId !== scope.anchorNodeId) {
        return { ownership: "CONTEXT_ONLY_UNIT_EMISSION", reason: `the unit's ref ${u} looks like a sub-clause of the candidate but its structural node is not inside the candidate's operative subtree`, unitRef: u, relation: "OTHER_SECTION" };
      }
    }
    return { ownership: "OWNED_BY_OPERATIVE_SOURCE", reason: "the unit cites a sub-clause inside the candidate's operative region", unitRef: u, relation: "DESCENDANT" };
  }
  if (isDescendantRef(c, u)) return { ownership: "CONTEXT_ONLY_UNIT_EMISSION", reason: `the unit cites ${u}, the PARENT of the candidate's operative source ${c}; parent scope informs the candidate but is owned by its own candidate`, unitRef: u, relation: "PARENT" };
  const parentOf = (r: string) => r.replace(/\([^)]*\)$/, "");
  if (parentOf(c) !== c && parentOf(u) === parentOf(c)) return { ownership: "CONTEXT_ONLY_UNIT_EMISSION", reason: `the unit cites ${u}, a SIBLING of the candidate's operative source ${c}`, unitRef: u, relation: "SIBLING" };
  // OTHER_SECTION: a ref outside the candidate's own section family. With structural context (an index and the candidate's
  // anchor node) ownership is judged fail-closed: a node outside the anchor's subtree - or a ref the index cannot even
  // resolve - is not owned. Without any structural context (a standalone normalization with no anchor) the reference
  // comparison alone cannot prove the unit foreign, so the decision is UNDETERMINED (kept, disclosed), never silently owned.
  if (scope.index && scope.anchorNodeId) {
    const res = scope.index.resolveUniqueNodeByRef(scope.documentId, u);
    if (res.status === "UNIQUE" && (res.node.nodeId === scope.anchorNodeId || scope.index.getAncestors(res.node.nodeId).some((a) => a.nodeId === scope.anchorNodeId))) {
      return { ownership: "OWNED_BY_OPERATIVE_SOURCE", reason: `the unit's ref ${u} resolves to a node inside the candidate's operative subtree`, unitRef: u, relation: "DESCENDANT" };
    }
    return { ownership: "CONTEXT_ONLY_UNIT_EMISSION", reason: res.status === "UNIQUE" ? `the unit cites ${u}, outside the candidate's operative source ${c} (a referenced or unrelated section; its structural node is not inside the candidate's operative subtree)` : `the unit cites ${u}, outside the candidate's operative source ${c}, and the structural index resolves it to no unique node (${res.status}); ownership cannot be established, so the unit is not owned`, unitRef: u, relation: "OTHER_SECTION" };
  }
  return { ownership: "OWNERSHIP_UNDETERMINED", reason: `the unit cites ${u}, outside the candidate's operative source ${c}, and no structural anchor is available to judge ownership; kept and disclosed, not certified as owned`, unitRef: u, relation: "OTHER_SECTION" };
}

const quote = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A definition is owned only when its DEFINING text ("Term" means ...) lies inside the candidate's operative source. */
export function classifyDefinitionOwnership(termName: string, scope: OwnershipScope): OwnershipDecision {
  const re = new RegExp(`[\\"\\u201c\\u201d']\\s*${quote(termName.trim())}\\s*[\\"\\u201c\\u201d']\\s*(?:means|shall mean|has the meaning|shall have the meaning|refers to)`, "i");
  if (re.test(scope.operativeText)) return { ownership: "OWNED_BY_OPERATIVE_SOURCE", reason: `the defining text of "${termName}" lies inside the candidate's operative source`, unitRef: null, relation: "DEFINITION_IN_SOURCE" };
  // Not defined in the operative text. Quarantine only on EVIDENCE that the term is defined elsewhere in the document: the
  // structural index knows its definition, or the context bundle retrieved it as a definition item. Without that evidence
  // the decision is UNDETERMINED (kept, disclosed) - a reference comparison alone cannot prove the unit foreign.
  const normalized = termName.trim().toLowerCase().replace(/\s+/g, " ");
  const inContext = scope.contextDefinedTerms?.has(normalized) ?? false;
  let inIndex = false;
  if (scope.index) { try { inIndex = !!scope.index.getDefinition(termName.trim(), scope.documentId); } catch { inIndex = false; } }
  if (inContext || inIndex) return { ownership: "CONTEXT_ONLY_UNIT_EMISSION", reason: `"${termName}" is not defined inside the candidate's operative source but is defined elsewhere in the document (${[inIndex ? "structural index" : null, inContext ? "context bundle" : null].filter(Boolean).join(", ")}); a referenced definition stays a reference to its separately-owned unit`, unitRef: null, relation: "DEFINITION_IN_CONTEXT" };
  return { ownership: "OWNERSHIP_UNDETERMINED", reason: `"${termName}" is not defined inside the candidate's operative source and no structural or context evidence locates its definition; kept and disclosed, not certified as owned`, unitRef: null, relation: "UNRESOLVED" };
}

export interface ContextOnlyUnitEmission {
  kind: "RULE" | "DEFINITION" | "SHARED_CAPACITY";
  localRef: string;
  unitId: string;
  sourceSectionRef: string | null;
  decision: OwnershipDecision;
  /** The quarantined unit itself, kept for review - never part of the certified IR. */
  unit: IRRule | IRDefinition | IRSharedCapacity;
}
