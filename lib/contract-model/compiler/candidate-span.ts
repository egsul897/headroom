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
import type { OperativeContractState, OperativeProvisionView } from "./amendment/types";

export type OperativeSourceOrigin = "STRUCTURAL_NODE" | "OPERATIVE_STATE_CURRENT_TEXT";

export interface ResolvedOperativeSource {
  text: string;
  origin: OperativeSourceOrigin;
  anchorNodeId: string | null;
  provision: OperativeProvisionView | null;
}

/** The RESOLVED provision view governing this candidate's anchor node, if the operative state has one. */
export function governingProvisionFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, operativeState: OperativeContractState | null | undefined): OperativeProvisionView | null {
  if (!operativeState) return null;
  const anchor = candidate.structuralNodeIds[0] ?? null;
  const byNode = anchor ? operativeState.provisions.find((p) => p.currentSourceNodeId === anchor || p.candidateSourceNodeIds.includes(anchor) || p.supersededSourceNodeIds.includes(anchor)) : undefined;
  if (byNode) return byNode;
  return operativeState.provisions.find((p) => p.kind === "SECTION" && p.documentId === candidate.documentId && p.sectionRef === candidate.normalizedSourceRef) ?? null;
}

export function resolveOperativeSource(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, index: StructuralIndex, operativeState?: OperativeContractState | null): ResolvedOperativeSource {
  const anchorNodeId = candidate.structuralNodeIds[0] ?? null;
  const provision = governingProvisionFor(candidate, operativeState);
  if (provision && provision.status === "OPERATIVE_STATE_RESOLVED" && provision.currentText && provision.currentText.trim().length > 0 && provision.appliedChain.length > 0) {
    return { text: provision.currentText, origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision };
  }
  return { text: anchorNodeId ? index.getNodeText(anchorNodeId, "DESCENDANTS") : "", origin: "STRUCTURAL_NODE", anchorNodeId, provision };
}

export function operativeSourceTextFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, index: StructuralIndex, operativeState?: OperativeContractState | null): string {
  return resolveOperativeSource(candidate, index, operativeState).text;
}
