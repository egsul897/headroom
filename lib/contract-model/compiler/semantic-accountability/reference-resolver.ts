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
 *  4. RESTARTED ENUMERATION (PHASE 3 / 6.01 remediation): a parent whose children restart their numbering ("(1) ...
 *     (33) ... For purposes of determining compliance: (1) ... (2) ...") indexes several SUBSTANTIVE occurrences of
 *     "6.01(b)(1)". When the reference is made FROM a known node, the candidate that sits in the SAME enumeration run
 *     as the referrer (the maximal stretch of consecutive siblings in which no label repeats) is returned as
 *     RESOLVED_WITHIN_ENUMERATION_RUN with every candidate listed. Two candidates in the referrer's run, or no
 *     referrer, stay AMBIGUOUS - never guessed.
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

/** The enumeration label of a node: its last parenthesized group ("6.01(b)(1)" -> "(1)"), or the whole ref when none. */
function enumerationLabel(node: StructuralNode): string {
  const m = node.sectionRef.match(/\(([^()]*)\)\s*$/);
  return (m ? m[1]! : node.sectionRef).toLowerCase();
}

/** Splits a parent's children (source order) into enumeration runs: a new run starts whenever a label already seen in the current run repeats. Returns the run index of each child. */
function enumerationRuns(children: StructuralNode[]): Map<string, number> {
  const runOf = new Map<string, number>();
  let run = 0;
  let seen = new Set<string>();
  for (const c of [...children].sort((a, b) => a.charStart - b.charStart)) {
    const label = enumerationLabel(c);
    if (seen.has(label)) { run++; seen = new Set(); }
    seen.add(label);
    runOf.set(c.nodeId, run);
  }
  return runOf;
}

/** Rule 4: among substantive candidates sharing a label, the one in the referrer's own enumeration run (null unless exactly one). */
function disambiguateWithinEnumerationRun(index: StructuralIndex, candidates: StructuralNode[], fromNodeId: string): { node: StructuralNode; note: string } | null {
  const referrer = index.getNodeById(fromNodeId);
  if (!referrer) return null;
  const chain: StructuralNode[] = [];
  for (let n: StructuralNode | undefined = referrer; n; n = n.parentNodeId ? index.getNodeById(n.parentNodeId) : undefined) chain.push(n);
  const inRun: { node: StructuralNode; sibling: StructuralNode }[] = [];
  for (const c of candidates) {
    if (!c.parentNodeId) continue;
    const sibling = chain.find((a) => a.parentNodeId === c.parentNodeId && a.nodeId !== c.nodeId);
    if (!sibling) continue;
    const runs = enumerationRuns(index.getChildren(c.parentNodeId));
    if (runs.get(c.nodeId) !== undefined && runs.get(c.nodeId) === runs.get(sibling.nodeId)) inRun.push({ node: c, sibling });
  }
  if (inRun.length !== 1) return null;
  const hit = inRun[0]!;
  return { node: hit.node, note: `${candidates.length} substantive occurrences share the label; the reference is made from ${referrer.sectionRef}, whose enumeration run (children of the same parent with no repeated label) contains exactly one of them (${hit.node.sectionRef} at ${hit.node.charStart}) - the others belong to restarted enumerations of the same parent` };
}

function pick(index: StructuralIndex, matches: StructuralNode[], requestedRef: string, lookedUp: string, viaEnclosing: boolean, fromNodeId: string | null = null): ResolvedReference {
  const candidateNodeIds = matches.map((n) => n.nodeId);
  if (matches.length === 1) {
    return { status: viaEnclosing ? "RESOLVED_VIA_ENCLOSING_NODE" : "UNIQUE", node: matches[0]!, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: [], note: viaEnclosing ? `"${requestedRef}" is not its own structural node; resolved to the nearest enclosing node "${lookedUp}" - the requested sub-clause is inline text within it` : `unique occurrence of "${lookedUp}"` };
  }
  const substantive = matches.filter((n) => isSubstantive(index, n));
  const degenerate = matches.filter((n) => !isSubstantive(index, n));
  if (substantive.length === 1 && degenerate.length === matches.length - 1) {
    return { status: viaEnclosing ? "RESOLVED_VIA_ENCLOSING_NODE" : "UNIQUE_AFTER_DEGENERATE_EXCLUSION", node: substantive[0]!, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: degenerate.map((n) => n.nodeId), note: `${matches.length} occurrences share "${lookedUp}"; ${degenerate.length} are heading-only (no children, <${DEGENERATE_TEXT_CHARS} chars - e.g. a table-of-contents entry) and were excluded; the single substantive occurrence was taken${viaEnclosing ? ` as the enclosing node of "${requestedRef}"` : ""}` };
  }
  if (fromNodeId) {
    const run = disambiguateWithinEnumerationRun(index, substantive, fromNodeId);
    if (run) return { status: "RESOLVED_WITHIN_ENUMERATION_RUN", node: run.node, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: degenerate.map((n) => n.nodeId), note: run.note };
  }
  return { status: "AMBIGUOUS", node: null, normalizedRef: lookedUp, requestedRef, candidateNodeIds, excludedDegenerateNodeIds: degenerate.map((n) => n.nodeId), note: `${substantive.length} substantive occurrences share "${lookedUp}" - genuinely ambiguous, not resolved (never guessed)${fromNodeId ? "; the referring node's own enumeration run does not single one out" : ""}` };
}

/** Resolves a legal reference string to a real structural occurrence within one document, per the three generic rules in the module header. */
export function resolveReferenceTarget(index: StructuralIndex, documentId: string, ref: string, opts: { fromNodeId?: string | null } = {}): ResolvedReference {
  const requestedRef = normalizeReferenceQuery(ref);
  if (!requestedRef) return { status: "NOT_FOUND", node: null, normalizedRef: "", requestedRef, candidateNodeIds: [], excludedDegenerateNodeIds: [], note: "empty reference" };
  const fromNodeId = opts.fromNodeId ?? null;

  const direct = index.findNodesByRef(documentId, requestedRef);
  if (direct.length > 0) return pick(index, direct, requestedRef, requestedRef, false, fromNodeId);

  // Enclosing-node fallback: strip trailing "(...)" groups one at a time.
  let candidate = requestedRef;
  while (/\([^()]*\)$/.test(candidate)) {
    candidate = candidate.replace(/\([^()]*\)$/, "");
    if (!candidate) break;
    const matches = index.findNodesByRef(documentId, candidate);
    if (matches.length > 0) return pick(index, matches, requestedRef, candidate, true, fromNodeId);
  }
  return { status: "NOT_FOUND", node: null, normalizedRef: requestedRef, requestedRef, candidateNodeIds: [], excludedDegenerateNodeIds: [], note: `no structural occurrence matches "${requestedRef}" or any enclosing node of it` };
}
