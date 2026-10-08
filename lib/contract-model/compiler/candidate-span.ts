/**
 * THE operative-source rule. Every path that compiles a discovered candidate obtains its operative text here and
 * nowhere else (architecture test: tests/contract-model/certified/architecture.test.ts).
 *
 *   STRUCTURAL_NODE               the anchor node's own text with its descendants (the unit as drafted in the base
 *                                 document);
 *   OPERATIVE_STATE_CURRENT_TEXT  when the instrument's computed OperativeContractState has RESOLVED a provision view
 *                                 for that node and carries the current (amended) text, that text governs - the base
 *                                 node is KNOWN_SUPERSEDED and compiling it would compile history.
 */
import type { StructuralIndex } from "./structural-index";
import type { DiscoveredCandidate } from "./discovery/types";
import type { AmendmentOperation, OperativeContractState, OperativeProvisionView } from "./amendment/types";

export type OperativeSourceOrigin = "STRUCTURAL_NODE" | "OPERATIVE_STATE_CURRENT_TEXT";

export interface ResolvedOperativeSource {
  text: string;
  origin: OperativeSourceOrigin;
  anchorNodeId: string | null;
  provision: OperativeProvisionView | null;
  /**
   * A descendant amendment applies and its text could not be spliced without guessing.
   * `text` is empty. It is not the base node, and it is not a resolved amendment.
   */
  withheld: boolean;
}

const DELETE_OPERATIONS = new Set<AmendmentOperation>(["DELETE_TEXT", "DELETE_DEFINITION", "REMOVE_COVENANT", "REMOVE_EXCEPTION"]);

function sameRef(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").replace(/\s+/g, "").toLowerCase() === (b ?? "").replace(/\s+/g, "").toLowerCase();
}

function hasCurrentText(provision: OperativeProvisionView | null): provision is OperativeProvisionView & { currentText: string } {
  return !!provision && provision.status === "OPERATIVE_STATE_RESOLVED" && !!provision.currentText && provision.currentText.trim().length > 0 && provision.appliedChain.length > 0;
}

function isResolvedDeletion(provision: OperativeProvisionView): boolean {
  const last = provision.appliedChain[provision.appliedChain.length - 1];
  return provision.status === "OPERATIVE_STATE_RESOLVED" && provision.appliedChain.length > 0 && !provision.currentText && !!last && DELETE_OPERATIONS.has(last.operation);
}

/** The provision view governing this candidate's anchor node, if the operative state has one. */
export function governingProvisionFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, operativeState: OperativeContractState | null | undefined): OperativeProvisionView | null {
  if (!operativeState) return null;
  const anchor = candidate.structuralNodeIds[0] ?? null;
  const sectionView = operativeState.provisions.find((p) => p.kind === "SECTION" && p.documentId === candidate.documentId && p.sectionRef === candidate.normalizedSourceRef) ?? null;
  const byNode = anchor ? operativeState.provisions.find((p) => p.currentSourceNodeId === anchor || p.candidateSourceNodeIds.includes(anchor) || p.supersededSourceNodeIds.includes(anchor)) : undefined;
  // A definition is often sourced on the section that houses it. That source node is not
  // authority to replace the section with the one amended term.
  if (byNode?.kind === "DEFINITION") {
    if (sameRef(byNode.definedTermRef, candidate.normalizedSourceRef)) return byNode;
    return sectionView;
  }
  if (byNode) return byNode;
  return sectionView;
}

/**
 * Clause replacements and deletions do not rewrite the parent section node. When every
 * affected descendant has a resolved text and its base span occurs once, the parent
 * operative text is the base section with those spans replaced. An unsafe descendant
 * amendment withholds the parent text instead of leaving the stale clause in place.
 */
function spliceDescendantAmendments(anchorNodeId: string, start: string, index: StructuralIndex, operativeState: OperativeContractState | null | undefined): { text: string; amended: boolean; withheld: boolean } {
  if (!operativeState) return { text: start, amended: false, withheld: false };
  const descendantIds = new Set(index.getDescendants(anchorNodeId).map((n) => n.nodeId));
  const affecting = operativeState.provisions.flatMap((provision) => {
    const nodeId = provision.supersededSourceNodeIds.find((id) => descendantIds.has(id));
    return nodeId ? [{ provision, nodeId }] : [];
  });
  if (affecting.length === 0) return { text: start, amended: false, withheld: false };
  const outer = affecting.filter((item) => !affecting.some((other) => other.nodeId !== item.nodeId && index.getDescendants(other.nodeId).some((d) => d.nodeId === item.nodeId)));
  const splices: Array<{ at: number; oldText: string; replacement: string }> = [];
  for (const item of outer) {
    if (isResolvedDeletion(item.provision)) {
      const oldText = index.getNodeText(item.nodeId, "DESCENDANTS");
      const at = oldText ? start.indexOf(oldText) : -1;
      if (!oldText || at < 0 || start.indexOf(oldText, at + oldText.length) >= 0) return { text: "", amended: false, withheld: true };
      splices.push({ at, oldText, replacement: "" });
      continue;
    }
    if (!hasCurrentText(item.provision)) return { text: "", amended: false, withheld: true };
    const oldText = index.getNodeText(item.nodeId, "DESCENDANTS");
    const at = oldText ? start.indexOf(oldText) : -1;
    if (!oldText || at < 0 || start.indexOf(oldText, at + oldText.length) >= 0) return { text: "", amended: false, withheld: true };
    splices.push({ at, oldText, replacement: item.provision.currentText });
  }
  const ordered = [...splices].sort((a, b) => a.at - b.at);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.at < ordered[i - 1]!.at + ordered[i - 1]!.oldText.length) return { text: "", amended: false, withheld: true };
  }
  let text = start;
  for (const splice of [...ordered].reverse()) {
    text = text.slice(0, splice.at) + splice.replacement + text.slice(splice.at + splice.oldText.length);
  }
  return { text, amended: true, withheld: false };
}

export function resolveOperativeSource(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, index: StructuralIndex, operativeState?: OperativeContractState | null): ResolvedOperativeSource {
  const anchorNodeId = candidate.structuralNodeIds[0] ?? null;
  const provision = governingProvisionFor(candidate, operativeState);
  const base = anchorNodeId ? index.getNodeText(anchorNodeId, "DESCENDANTS") : "";
  if (!anchorNodeId) return { text: "", origin: "STRUCTURAL_NODE", anchorNodeId, provision, withheld: false };

  const ownsAnchor = !!provision && provision.kind !== "DEFINITION" && provision.supersededSourceNodeIds.includes(anchorNodeId);
  if (ownsAnchor && provision) {
    if (hasCurrentText(provision)) return { text: provision.currentText, origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision, withheld: false };
    if (isResolvedDeletion(provision)) return { text: "", origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision, withheld: false };
    // A review-required amendment of this node does not substitute its own text. The base node remains the fallback
    // only when no descendant clause has its own applied amendment. Otherwise the base text still contains that clause.
    const descendant = spliceDescendantAmendments(anchorNodeId, base, index, operativeState);
    if (descendant.amended || descendant.withheld) return { text: "", origin: "STRUCTURAL_NODE", anchorNodeId, provision, withheld: true };
    return { text: base, origin: "STRUCTURAL_NODE", anchorNodeId, provision, withheld: false };
  }
  if (provision?.kind === "DEFINITION" && sameRef(provision.definedTermRef, candidate.normalizedSourceRef) && hasCurrentText(provision)) {
    return { text: provision.currentText, origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision, withheld: false };
  }

  const start = provision && provision.kind === "SECTION" && hasCurrentText(provision) ? provision.currentText : base;
  const spliced = spliceDescendantAmendments(anchorNodeId, start, index, operativeState);
  if (spliced.withheld) return { text: "", origin: "STRUCTURAL_NODE", anchorNodeId, provision, withheld: true };
  if (spliced.amended || start !== base) return { text: spliced.text, origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision, withheld: false };
  return { text: base, origin: "STRUCTURAL_NODE", anchorNodeId, provision, withheld: false };
}

export function operativeSourceTextFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, index: StructuralIndex, operativeState?: OperativeContractState | null): string {
  return resolveOperativeSource(candidate, index, operativeState).text;
}
