/**
 * Phase 2D §7 - structural context retrieval: parent scope, child rules,
 * sibling/proviso context. Pure structural traversal over Phase 2A's
 * StructuralIndex - no semantic call needed for any of this (task §22:
 * "do not use an LLM where deterministic graph traversal already gives
 * the answer").
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { addEdge, addItem, makeItemInput, resolveSectionEvidenceState, withinBudget, type RetrievalState } from "./state";
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

/**
 * Phase 3F.1.4 (CTX-02 remediation, root cause: classifySiblingSignal above
 * fires on a bare keyword hit in the SIBLING's own text with zero check
 * that the matched language actually concerns the same subject/economic
 * mechanism as the specific candidate it is about to be attached to -
 * proven counterexamples: a Dispositions-of-obsolete-equipment candidate
 * pulling in an unrelated Investments-basket sibling's own local proviso
 * purely because it contains "provided that"; an Affiliate-Transactions
 * candidate pulling in a director-compensation sibling that explicitly
 * disclaims any economic relationship to it, purely because it contains
 * "in the aggregate." A keyword match alone is now only a PRECONDITION for
 * considering the sibling at all - real evidence of correspondence to the
 * SPECIFIC candidate clause is required before it is attached with normal
 * confidence/shape (see assessSiblingRelevance below).
 *
 * A sibling that explicitly disclaims a relationship to the candidate's own
 * clause is a hard veto - even if it happens to ALSO name that clause
 * letter (the real counterexample: "...bears no economic relationship to
 * clause (a) at all" literally contains "clause (a)", so a naive
 * backreference check alone would be fooled into treating the negation as
 * confirming evidence).
 */
const RELATIONSHIP_NEGATION = /\b(?:bears?\s+no\s+(?:economic\s+)?relationship\s+to|(?:is\s+)?unrelated\s+to|no\s+relation(?:ship)?\s+to|does\s+not\s+relate\s+to|is\s+not\s+related\s+to|has\s+nothing\s+to\s+do\s+with|not\s+a\s+proviso,?\s*exception,?\s*or\s+condition\s+on)\b/i;

/** A generic linkage phrase tying the sibling to the ENCLOSING section/article as a whole - since the candidate is definitionally a member of that same enclosing scope, a genuine section-/article-wide qualifier necessarily applies to it too (task's own "shared-cap references" positive-finding scenario - e.g. "the aggregate amount incurred under this Section"). */
const ENCLOSING_SCOPE_LINKAGE = /\b(?:under|of|in)\s+this\s+(?:Section|Article)\b/i;

/**
 * A sibling whose OWN text opens with a bare subordinating qualifier - never
 * stating its own independent subject/object first - is a genuine trailing
 * proviso/condition on the candidate's own enumerated list (the real
 * positive-control shape: "(a) ...; (b) provided that ..." or "(b) in each
 * case, no Default ..."). A sibling that instead opens by stating its OWN
 * distinct subject matter ("Dispositions of Investments permitted under
 * Section 6.06, provided that..."; "director compensation not exceeding
 * $5,000,000...") is introducing a separate, independently-drafted basket -
 * the qualifier there governs only ITS OWN clause, not the candidate's.
 * Tolerates an optional leading lettered/numbered marker ("(b)", "(iv)").
 */
const BARE_QUALIFIER_OPENER = /^\s*(?:\([a-z0-9]+\)\s*)?(?:provided(?:,)?\s+that\b|provided\s+further\b|in\s+each\s+case\b|except\s+that\b|except\s+as\b|so\s+long\s+as\b|notwithstanding\b)/i;

/** Explicit reference to the candidate's own clause letter/number, or to a plural range spanning it ("clauses (a) and (b)"), or the "the foregoing" backreference idiom - task's own real positive-control shape (17. "the aggregate amount outstanding under clauses (a) and (b) of this Section..."). */
function referencesCandidateClause(siblingText: string, candidateClauseLetter: string | null): boolean {
  if (/\bthe\s+foregoing\b/i.test(siblingText)) return true;
  if (!candidateClauseLetter) return false;
  const escaped = candidateClauseLetter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const backref = new RegExp(`\\b(?:clause|clauses|subsection|paragraph)s?\\s*\\(${escaped}\\)`, "i");
  return backref.test(siblingText);
}

/** Extracts the candidate's own trailing lettered/numbered clause marker from its legal reference (e.g. "a" from "6.08(a)", "iv" from "6.01(a)(iv)") - null for a bare Section/Article-level reference with no clause marker at all. */
function extractClauseLetter(sectionRef: string): string | null {
  const match = /\(([a-z0-9]+)\)\s*$/i.exec(sectionRef);
  return match ? match[1]! : null;
}

/** A specific named defined term (quoted, or a Title-Case multi-word phrase) or exact dollar figure appearing in BOTH the candidate's own text and the sibling's - the SAME named basket/resource, never merely "some dollar figure appears in both" (task's own explicit "not just any dollar figure" instruction). */
function findSharedNamedResource(candidateText: string, siblingText: string): string | null {
  const quotedTerm = /"([^"]{3,80})"/g;
  const candidateQuoted = new Set([...candidateText.matchAll(quotedTerm)].map((m) => m[1]!.toLowerCase()));
  for (const m of siblingText.matchAll(quotedTerm)) {
    const term = m[1]!.toLowerCase();
    if (candidateQuoted.has(term)) return `defined term "${m[1]}"`;
  }
  return null;
}

export interface SiblingRelevanceAssessment {
  relevant: boolean;
  signals: string[];
}

/**
 * The real evidence-gate (CTX-02 fix): a keyword hit alone is never
 * sufficient. At least one of the following must hold, and an explicit
 * relationship-negation always wins regardless of anything else matching:
 *  - the sibling explicitly references the candidate's own clause letter/
 *    number, a plural range spanning it, or "the foregoing";
 *  - the sibling shares a specific named defined term with the candidate
 *    (the SAME basket/resource, not merely any dollar figure);
 *  - the sibling scopes itself to the enclosing Section/Article as a whole,
 *    which by definition also covers the candidate;
 *  - the sibling is a direct grammatical continuation of the candidate's
 *    own enumerated list (opens with a bare qualifier, states no
 *    independent subject of its own first).
 */
function assessSiblingRelevance(candidateText: string, candidateSectionRef: string, siblingText: string): SiblingRelevanceAssessment {
  if (RELATIONSHIP_NEGATION.test(siblingText)) return { relevant: false, signals: [] };

  const signals: string[] = [];
  const candidateLetter = extractClauseLetter(candidateSectionRef);
  if (referencesCandidateClause(siblingText, candidateLetter)) signals.push("CLAUSE_BACKREFERENCE");
  const sharedResource = findSharedNamedResource(candidateText, siblingText);
  if (sharedResource) signals.push(`SHARED_RESOURCE(${sharedResource})`);
  if (ENCLOSING_SCOPE_LINKAGE.test(siblingText)) signals.push("ENCLOSING_SCOPE_LINKAGE");
  if (BARE_QUALIFIER_OPENER.test(siblingText)) signals.push("GRAMMATICAL_CONTINUATION");

  return { relevant: signals.length > 0, signals };
}

export function retrieveOperativeSource(state: RetrievalState, index: StructuralIndex, documentId: string, nodeId: string): ContextItem | null {
  const node = index.getNodeById(nodeId);
  if (!node) return null;
  const text = index.getNodeText(nodeId, "DESCENDANTS");
  const evidenceState = resolveSectionEvidenceState(state, documentId, { nodeId, sectionRef: node.sectionRef });
  return addItem(state, makeItemInput("OPERATIVE_SOURCE", documentId, node.nodeKey, nodeId, node.sectionRef, `Section ${node.sectionRef}`, text, "The discovered covenant candidate's own source text.", 0, [], "STRUCTURAL_TRAVERSAL", 1, evidenceState));
}

/** Every ancestor closer than the enclosing ARTICLE (an ARTICLE heading is never itself operative language) - task §7's "the individual exception cannot be interpreted correctly without that [parent] scope." */
export function retrieveParentScope(state: RetrievalState, index: StructuralIndex, documentId: string, nodeId: string, operativeItemId: string): void {
  const ancestors = index.getAncestors(nodeId).filter((n) => n.nodeType !== "ARTICLE");
  for (const ancestor of ancestors) {
    const text = index.getNodeText(ancestor.nodeId, "OWN");
    if (text.trim().length === 0) continue;
    if (!withinBudget(state, text.length)) return;
    const evidenceState = resolveSectionEvidenceState(state, documentId, { nodeId: ancestor.nodeId, sectionRef: ancestor.sectionRef });
    const item = addItem(state, makeItemInput("PARENT_SCOPE", documentId, ancestor.nodeKey, ancestor.nodeId, ancestor.sectionRef, `Section ${ancestor.sectionRef}`, text, `Enclosing scope for Section ${ancestor.sectionRef} - the operative prohibition/permission language a nested exception or basket depends on.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 1, evidenceState));
    addEdge(state, item.itemId, operativeItemId, "PARENT_OF", "Encloses the operative provision.");
  }
}

/** Direct children only (not a deep recursive dump) - task §7's "a discovered section may contain independently operative subclauses. Retrieve relevant descendants." */
export function retrieveChildRules(state: RetrievalState, index: StructuralIndex, documentId: string, nodeId: string, operativeItemId: string): void {
  // NOTE (Phase 2E.1): direct children of the CANDIDATE's own primary node
  // never need referenced-region expansion here - retrieveOperativeSource
  // already retrieves the primary node's full DESCENDANTS text (pipeline.ts),
  // which by definition already contains every child's own full nested
  // content. Applying region-expansion to each child here would silently
  // duplicate that same text a second time under a separate CHILD_RULE
  // item, consuming the text budget for zero new information - measured
  // directly during this remediation's own construction (see the final
  // report's "why retrieveChildRules was NOT changed" note). The genuine
  // OWN-text-boundary gap this remediation targets is real for a CROSS-
  // REFERENCE TARGET (reference-context.ts), which is a distant node the
  // primary candidate's own DESCENDANTS span never covers.
  const children = index.getChildren(nodeId);
  for (const child of children) {
    const text = index.getNodeText(child.nodeId, "OWN");
    if (text.trim().length === 0) continue;
    if (!withinBudget(state, text.length)) return;
    const evidenceState = resolveSectionEvidenceState(state, documentId, { nodeId: child.nodeId, sectionRef: child.sectionRef });
    const item = addItem(state, makeItemInput("CHILD_RULE", documentId, child.nodeKey, child.nodeId, child.sectionRef, `Section ${child.sectionRef}`, text, `A sub-rule of the discovered candidate's own section - the candidate may bundle multiple independently operative clauses.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 1, evidenceState));
    addEdge(state, operativeItemId, item.itemId, "CHILD_OF", "Independently operative sub-rule of the discovered section.");
  }
}

/**
 * Siblings included ONLY on a real textual signal (task §7 - "do not
 * automatically include every sibling"). Phase 3F.1.4 (CTX-02 remediation):
 * a keyword hit on the sibling's OWN text is a PRECONDITION, never
 * sufficient by itself - it is additionally gated on real evidence that the
 * matched sibling's language actually concerns the same subject/economic
 * mechanism as THIS specific candidate (assessSiblingRelevance above).
 * Verified correspondence is attached exactly as before (same type/edge/
 * confidence 0.7 - preserves the prior audit's own confirmed-positive
 * scenarios). Absent that evidence, the sibling is never silently attached
 * with normal confidence/shape - it is still disclosed (recall is
 * preserved, never solved via omission-by-default), but as a distinctly
 * shaped, low-confidence UNVERIFIED_SIBLING_SIGNAL item a downstream reader
 * cannot mistake for genuinely-verified context.
 */
export function retrieveSiblingContext(state: RetrievalState, index: StructuralIndex, documentId: string, nodeId: string, operativeItemId: string): void {
  const candidateText = index.getNodeText(nodeId, "DESCENDANTS");
  const candidateNode = index.getNodeById(nodeId);
  const candidateSectionRef = candidateNode?.sectionRef ?? "";
  const siblings = index.getSiblings(nodeId);
  for (const sibling of siblings) {
    const text = index.getNodeText(sibling.nodeId, "OWN");
    if (text.trim().length === 0) continue;
    const classification = classifySiblingSignal(text);
    if (!classification) continue;
    if (!withinBudget(state, text.length)) return;

    // Evidence is assessed over the sibling's own DESCENDANTS span, not
    // just its OWN-text slice: the structural parser can (correctly, for
    // its own purposes) treat a re-lettered "(a)"/"(b)" that reappears
    // INSIDE a trailing clause's prose (e.g. "...under clauses (a) and (b)
    // of this Section...") as if it introduced nested child nodes, which
    // truncates that clause's own OWN-text boundary before the very
    // backreference this evidence check needs to see. The classified/
    // stored excerpt (`text`, OWN) is unchanged - only relevance evidence
    // looks at the fuller span, since that text is still genuinely the
    // sibling's own contiguous sentence, not descendant content borrowed
    // from elsewhere.
    const siblingEvidenceText = index.getNodeText(sibling.nodeId, "DESCENDANTS");
    const assessment = assessSiblingRelevance(candidateText, candidateSectionRef, siblingEvidenceText);
    const siblingEvidenceState = resolveSectionEvidenceState(state, documentId, { nodeId: sibling.nodeId, sectionRef: sibling.sectionRef });
    if (assessment.relevant) {
      const item = addItem(
        state,
        makeItemInput(classification.type, documentId, sibling.nodeKey, sibling.nodeId, sibling.sectionRef, `Section ${sibling.sectionRef}`, text, `Sibling provision containing ${classification.type.toLowerCase().replace("_", " ")} language ("${classification.signal}") that may modify or limit the discovered candidate - subject-correspondence evidence: ${assessment.signals.join(", ")}.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 0.7, siblingEvidenceState)
      );
      addEdge(state, item.itemId, operativeItemId, "SIBLING_OF", `Trailing/neighboring ${classification.type.toLowerCase()} language.`);
    } else {
      // WRONG-CONTEXT CONTAMINATION guard: the sibling matched a generic
      // keyword only - no clause backreference, no shared named resource,
      // no enclosing-scope linkage, no grammatical continuation of the
      // candidate's own list (and possibly an explicit relationship
      // negation). Never silently attached at normal confidence/shape.
      const item = addItem(
        state,
        makeItemInput("UNVERIFIED_SIBLING_SIGNAL", documentId, sibling.nodeKey, sibling.nodeId, sibling.sectionRef, `Section ${sibling.sectionRef}`, text, `Sibling provision contains ${classification.type.toLowerCase().replace("_", " ")} language ("${classification.signal}") but subject-correspondence with the discovered candidate could NOT be verified (no clause backreference, shared named resource, enclosing-scope linkage, or grammatical continuation found) - possible context only; do not treat as equivalent to a verified ${classification.type} item.`, 1, [operativeItemId], "STRUCTURAL_TRAVERSAL", 0.2, siblingEvidenceState)
      );
      addEdge(state, item.itemId, operativeItemId, "SIBLING_OF", `Unverified/possible ${classification.type.toLowerCase()} language - relevance not established.`);
    }
  }
}

export function findEnclosingSectionNode(index: StructuralIndex, nodeId: string): StructuralNode | undefined {
  const node = index.getNodeById(nodeId);
  if (!node) return undefined;
  if (node.nodeType === "SECTION") return node;
  return index.getAncestors(nodeId).find((n) => n.nodeType === "SECTION");
}
