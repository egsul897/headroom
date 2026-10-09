/**
 * THE operative-source rule. Every path that compiles a discovered candidate obtains its operative text here and
 * nowhere else (architecture test: tests/contract-model/certified/architecture.test.ts).
 *
 *   STRUCTURAL_NODE               the anchor node's own text with its descendants (the unit as drafted in the base
 *                                 document);
 *   OPERATIVE_STATE_CURRENT_TEXT  when the instrument's computed OperativeContractState has RESOLVED a provision view
 *                                 for that node and carries the current (amended) text, that text governs - the base
 *                                 node is KNOWN_SUPERSEDED and compiling it would compile history.
 *
 * IPV-04: when the parent section itself was not restated but one or more descendant clauses were
 * superseded/deleted, the DESCENDANTS span is spliced from those provision views so stale $25m / deleted
 * $15m text is never handed to composition as current.
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

/**
 * Rebuild a parent section's operative text by applying descendant provision views
 * (replace superseded OWN spans; omit deleted ones). Returns null when no descendant
 * provision touches this anchor (caller falls through to structural DESCENDANTS).
 */
export function spliceOperativeDescendants(anchorNodeId: string, index: StructuralIndex, operativeState: OperativeContractState): string | null {
  const anchor = index.getNodeById(anchorNodeId);
  if (!anchor) return null;
  const descendants = index.getDescendants(anchorNodeId);
  if (descendants.length === 0) return null;

  type Edit = { start: number; end: number; replacement: string };
  const edits: Edit[] = [];

  for (const p of operativeState.provisions) {
    if (p.kind !== "SECTION" || p.appliedChain.length === 0) continue;
    if (p.sectionRef === anchor.sectionRef) continue; // parent itself handled by governingProvisionFor
    const node =
      descendants.find((d) => d.sectionRef === p.sectionRef) ??
      descendants.find((d) => p.supersededSourceNodeIds.includes(d.nodeId) || p.currentSourceNodeId === d.nodeId);
    if (!node) continue;
    const start = node.charStart;
    const end = node.charEnd;
    if (p.currentText === null || p.currentText.trim().length === 0) {
      // Deleted / text withheld — drop the clause span from the parent.
      edits.push({ start, end, replacement: "" });
    } else {
      edits.push({ start, end, replacement: p.currentText });
    }
  }

  if (edits.length === 0) return null;

  const docText = index.getDocumentText(anchor.documentId);
  if (!docText) return null;
  // Apply deepest/latest spans first so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start);
  let text = docText.slice(anchor.charStart, anchor.charEnd);
  const base = anchor.charStart;
  for (const e of edits) {
    const relStart = e.start - base;
    const relEnd = e.end - base;
    if (relStart < 0 || relEnd > text.length || relStart > relEnd) continue;
    text = text.slice(0, relStart) + e.replacement + text.slice(relEnd);
  }
  return text;
}

export function resolveOperativeSource(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, index: StructuralIndex, operativeState?: OperativeContractState | null): ResolvedOperativeSource {
  const anchorNodeId = candidate.structuralNodeIds[0] ?? null;
  const provision = governingProvisionFor(candidate, operativeState);
  if (provision && provision.status === "OPERATIVE_STATE_RESOLVED" && provision.currentText && provision.currentText.trim().length > 0 && provision.appliedChain.length > 0) {
    return { text: provision.currentText, origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision };
  }
  if (anchorNodeId && operativeState) {
    const spliced = spliceOperativeDescendants(anchorNodeId, index, operativeState);
    if (spliced !== null) {
      return { text: spliced, origin: "OPERATIVE_STATE_CURRENT_TEXT", anchorNodeId, provision };
    }
  }
  return { text: anchorNodeId ? index.getNodeText(anchorNodeId, "DESCENDANTS") : "", origin: "STRUCTURAL_NODE", anchorNodeId, provision };
}

export function operativeSourceTextFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, index: StructuralIndex, operativeState?: OperativeContractState | null): string {
  return resolveOperativeSource(candidate, index, operativeState).text;
}
