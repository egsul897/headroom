/**
 * Phase 2D §7 - structural context retrieval: parent scope, child rules,
 * sibling/proviso context. Pure structural traversal over Phase 2A's
 * StructuralIndex - no semantic call needed for any of this (task §22:
 * "do not use an LLM where deterministic graph traversal already gives
 * the answer").
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { addEdge, addItem, makeItemInput, withinBudget, type RetrievalState } from "./state";
import type { ContextItem } from "./types";

/**
 * Task §7's own "nearby concluding language" list, plus aggregate/shared-
 * cap vocabulary - a real, disclosed, generic keyword set (never a
 * package-specific string), used only to decide whether a SIBLING is
 * worth including, never to interpret what it means.
 */
const PROVISO_SIGNALS = [/\bprovided(?:,)? that\b/i, /\bprovided further\b/i, /\bnotwithstanding\b/i, /\bso long as\b/i];
const EXCEPTION_SIGNALS = [/\bexcept that\b/i, /\bexcept as\b/i, /\bother than\b/i];
const CONDITION_SIGNALS = [/\bin each case\b/i, /\bsubject to\b/i, /\bno Default (?:or Event of Default )?(?:shall have occurred|exists)\b/i];
const SHARED_CAP_SIGNALS = [/\bin the aggregate\b/i, /\baggregate (?:amount|cap|limit)\b/i, /\bshared\b.*\bcap\b/i, /\banti-duplication\b/i];

function classifySiblingSignal(text: string): { type: "PROVISO" | "EXCEPTION" | "CONDITION" | "SHARED_CAP"; signal: string } | null {
  for (const re of PROVISO_SIGNALS) if (re.test(text)) return { type: "PROVISO", signal: re.source };
  for (const re of SHARED_CAP_SIGNALS) if (re.test(text)) return { type: "SHARED_CAP", signal: re.source };
  for (const re of EXCEPTION_SIGNALS) if (re.test(text)) return { type: "EXCEPTION", signal: re.source };
  for (const re of CONDITION_SIGNALS) if (re.test(text)) return { type: "CONDITION", signal: re.source };
  return null;
}

export function retrieveOperativeSource(state: RetrievalState, index: StructuralIndex, documentId: string, nodeKey: string): ContextItem | null {
  const node = index.getNode(nodeKey);
  if (!node) return null;
  const text = index.getNodeText(nodeKey, "DESCENDANTS");
  return addItem(state, makeItemInput("OPERATIVE_SOURCE", documentId, nodeKey, node.sectionRef, `Section ${node.sectionRef}`, text, "The discovered covenant candidate's own source text.", 0, [], "STRUCTURAL_TRAVERSAL", 1));
}

/** Every ancestor closer than the enclosing ARTICLE (an ARTICLE heading is never itself operative language) - task §7's "the individual exception cannot be interpreted correctly without that [parent] scope." */
export function retrieveParentScope(state: RetrievalState, index: StructuralIndex, documentId: string, nodeKey: string, operativeItemId: string): void {
  const ancestors = index.getAncestors(nodeKey).filter((n) => n.nodeType !== "ARTICLE");
  for (const ancestor of ancestors) {
    const text = index.getNodeText(ancestor.nodeKey, "OWN");
    if (text.trim().length === 0) continue;
    if (!withinBudget(state, text.length)) return;
    const item = addItem(state, makeItemInput("PARENT_SCOPE", documentId, ancestor.nodeKey, ancestor.sectionRef, `Section ${ancestor.sectionRef}`, text, `Enclosing scope for Section ${ancestor.sectionRef} - the operative prohibition/permission language a nested exception or basket depends on.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 1));
    addEdge(state, item.itemId, operativeItemId, "PARENT_OF", "Encloses the operative provision.");
  }
}

/** Direct children only (not a deep recursive dump) - task §7's "a discovered section may contain independently operative subclauses. Retrieve relevant descendants." */
export function retrieveChildRules(state: RetrievalState, index: StructuralIndex, documentId: string, nodeKey: string, operativeItemId: string): void {
  const children = index.getChildren(nodeKey);
  for (const child of children) {
    const text = index.getNodeText(child.nodeKey, "OWN");
    if (text.trim().length === 0) continue;
    if (!withinBudget(state, text.length)) return;
    const item = addItem(state, makeItemInput("CHILD_RULE", documentId, child.nodeKey, child.sectionRef, `Section ${child.sectionRef}`, text, `A sub-rule of the discovered candidate's own section - the candidate may bundle multiple independently operative clauses.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 1));
    addEdge(state, operativeItemId, item.itemId, "CHILD_OF", "Independently operative sub-rule of the discovered section.");
  }
}

/** Siblings included ONLY on a real textual signal (task §7 - "do not automatically include every sibling"). */
export function retrieveSiblingContext(state: RetrievalState, index: StructuralIndex, documentId: string, nodeKey: string, operativeItemId: string): void {
  const siblings = index.getSiblings(nodeKey);
  for (const sibling of siblings) {
    const text = index.getNodeText(sibling.nodeKey, "OWN");
    if (text.trim().length === 0) continue;
    const classification = classifySiblingSignal(text);
    if (!classification) continue;
    if (!withinBudget(state, text.length)) return;
    const item = addItem(
      state,
      makeItemInput(classification.type, documentId, sibling.nodeKey, sibling.sectionRef, `Section ${sibling.sectionRef}`, text, `Sibling provision containing ${classification.type.toLowerCase().replace("_", " ")} language ("${classification.signal}") that may modify or limit the discovered candidate.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 0.7)
    );
    addEdge(state, item.itemId, operativeItemId, "SIBLING_OF", `Trailing/neighboring ${classification.type.toLowerCase()} language.`);
  }
}

export function findEnclosingSectionNode(index: StructuralIndex, nodeKey: string): StructuralNode | undefined {
  const node = index.getNode(nodeKey);
  if (!node) return undefined;
  if (node.nodeType === "SECTION") return node;
  return index.getAncestors(nodeKey).find((n) => n.nodeType === "SECTION");
}
