/**
 * SEMANTIC ACCOUNTABILITY - generic cross-reference target resolution
 * (mission §15; root cause 06 R-3). Three generic drafting realities the
 * structural index alone does not handle, each resolved WITH DISCLOSURE and
 * never by a silent pick:
 *
 *  1. PREFIX: "Section 6.04(b)" / "§ 6.04(b)" / "Article VI" - the index keys
 *     bare legal refs ("6.04(b)"), so the query side must strip the prefix.
 *  2. INLINE SUB-CLAUSE: "6.01(b)(iii)" where the (iii) proviso is inline
 *     prose inside the lettered clause, not its own node - resolved to the
 *     nearest ENCLOSING node that exists ("6.01(b)") and reported as
 *     RESOLVED_VIA_ENCLOSING_NODE, so the consumer knows it received the
 *     containing clause, not a dedicated node.
 *  3. DEGENERATE DUPLICATE OCCURRENCE: a table-of-contents entry is indexed
 *     as a second SECTION occurrence sharing the body section's label. When
 *     exactly one candidate is SUBSTANTIVE (has children or non-trivial text)
 *     and every other candidate is degenerate (no children AND tiny text),
 *     the substantive one is returned as UNIQUE_AFTER_DEGENERATE_EXCLUSION
 *     with the excluded occurrences listed. Two substantive occurrences stay
 *     AMBIGUOUS - never guessed (mission §15).
 *
 * No package/section-specific logic: every rule above is a structural
 * property of any indexed document.
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import type { ReferenceResolutionStatus } from "./types";

export interface ResolvedReference {
  status: ReferenceResolutionStatus;
  node: StructuralNode | null;
  /** The bare legal ref actually looked up (after prefix stripping and, for RESOLVED_VIA_ENCLOSING_NODE, after trailing sub-clause groups were removed). */
  normalizedRef: string;
  /** The exact ref requested, normalized but before any enclosing-node fallback. */
  requestedRef: string;
  candidateNodeIds: string[];
  excludedDegenerateNodeIds: string[];
  note: string;
}

/** Text shorter than this, with no children, is a heading-only (degenerate) occurrence when a substantive sibling occurrence exists. Generic: a real operative section carries operative prose; a table-of-contents line does not. */
const DEGENERATE_TEXT_CHARS = 200;

/** Strips a leading "Section"/"Sections"/"Sec."/"§"/"Article"/"Clause" label and surrounding whitespace/punctuation, leaving the bare legal ref the structural index keys on. */
export function normalizeReferenceQuery(ref: string): string {
  return ref
    .trim()
    .replace(/^(?:sections?|sec\.?|§+|articles?|clauses?)\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[.,;:]+$/, "");
}

function isSubstantive(index: StructuralIndex, node: StructuralNode): boolean {
  if (index.getChildren(node.nodeId).length > 0) return true;
  return index.getNodeText(node.nodeId, "DESCENDANTS").trim().length >= DEGENERATE_TEXT_CHARS;
}

function pick(index: StructuralIndex, matches: StructuralNode[], requestedRef: string, lookedUp: string, viaEnclosing: boolean): ResolvedReference {
  const candidateNodeIds = matches.map((n) => n.nodeId);
  if (matches.length === 1) {
    return { status: viaEnclosing ? "RESOLVED_VIA_ENCLOSING_NODE" : "UNIQUE", node: matches[0]!, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: [], note: viaEnclosing ? `"${requestedRef}" is not its own structural node; resolved to the nearest enclosing node "${lookedUp}" - the requested sub-clause is inline text within it` : `unique occurrence of "${lookedUp}"` };
  }
  const substantive = matches.filter((n) => isSubstantive(index, n));
  const degenerate = matches.filter((n) => !isSubstantive(index, n));
  if (substantive.length === 1 && degenerate.length === matches.length - 1) {
    return { status: viaEnclosing ? "RESOLVED_VIA_ENCLOSING_NODE" : "UNIQUE_AFTER_DEGENERATE_EXCLUSION", node: substantive[0]!, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: degenerate.map((n) => n.nodeId), note: `${matches.length} occurrences share "${lookedUp}"; ${degenerate.length} are heading-only (no children, <${DEGENERATE_TEXT_CHARS} chars - e.g. a table-of-contents entry) and were excluded; the single substantive occurrence was taken${viaEnclosing ? ` as the enclosing node of "${requestedRef}"` : ""}` };
  }
  return { status: "AMBIGUOUS", node: null, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: degenerate.map((n) => n.nodeId), note: `${substantive.length} substantive occurrences share "${lookedUp}" - genuinely ambiguous, not resolved (never guessed)` };
}

/** Resolves a legal reference string to a real structural occurrence within one document, per the three generic rules in the module header. */
export function resolveReferenceTarget(index: StructuralIndex, documentId: string, ref: string): ResolvedReference {
  const requestedRef = normalizeReferenceQuery(ref);
  if (!requestedRef) return { status: "NOT_FOUND", node: null, normalizedRef: "", requestedRef, candidateNodeIds: [], excludedDegenerateNodeIds: [], note: "empty reference" };

  const direct = index.findNodesByRef(documentId, requestedRef);
  if (direct.length > 0) return pick(index, direct, requestedRef, requestedRef, false);

  // Enclosing-node fallback: strip trailing "(...)" groups one at a time.
  let candidate = requestedRef;
  while (/\([^()]*\)$/.test(candidate)) {
    candidate = candidate.replace(/\([^()]*\)$/, "");
    if (!candidate) break;
    const matches = index.findNodesByRef(documentId, candidate);
    if (matches.length > 0) return pick(index, matches, requestedRef, candidate, true);
  }
  return { status: "NOT_FOUND", node: null, normalizedRef: requestedRef, requestedRef, candidateNodeIds: [], excludedDegenerateNodeIds: [], note: `no structural occurrence matches "${requestedRef}" or any enclosing node of it` };
}
