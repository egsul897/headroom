/**
 * Phase 2A - general deterministic cross-reference index (task §8/§9).
 *
 * Distinct from stage-dependency-resolution.ts's detectCrossReferences,
 * which only fires behind five specific relationship-connector phrases
 * ("subject to", "pursuant to", etc.) and never records which node a
 * reference came FROM (so it cannot support a reverse-reference lookup).
 * This module detects any EXPLICIT structural reference regardless of
 * surrounding phrase, and attributes every one to its enclosing source
 * node, which is what makes "what provisions reference this node?"
 * (task §9) answerable at all.
 *
 * Resolution is exact-structural-identity only (never fuzzy, never an LLM
 * guess) and scoped to the SAME document only, matching the way a real
 * agreement's own internal cross-references work: "Section 6.01" inside
 * Document A means Document A's own Section 6.01, never Document B's -
 * an unresolved reference is always preferred over a guessed one.
 */
import type { StructuralNode } from "./types";

export type ReferenceTargetKind = "ARTICLE" | "SECTION" | "CLAUSE" | "SCHEDULE" | "EXHIBIT";

export interface DetectedReference {
  documentId: string;
  /**
   * @deprecated legacy label-shaped key, kept for backward-compatible
   * display/logging only. Use `sourceNodeId` for identity.
   */
  sourceNodeKey: string | null;
  /** Phase 3F.1.2 - the enclosing structural node's real physical occurrence identity (`findEnclosingNode` is position-based, so this was always correct even before 3F.1.2 - only its DOWNSTREAM lookup via the label-keyed nodeKey was unsafe). */
  sourceNodeId: string | null;
  referenceText: string;
  targetKind: ReferenceTargetKind;
  /** Normalized target ref exactly as it would appear in a StructuralNode.sectionRef, e.g. "6.01", "6.01(a)", "VI" - or the raw schedule/exhibit label when not a section/article/clause. */
  normalizedTarget: string;
  /**
   * @deprecated legacy label-shaped key, kept for backward-compatible
   * display/logging only. Use `targetNodeId` for identity.
   */
  targetNodeKey: string | null;
  /** Phase 3F.1.2 - the resolved node's real physical occurrence identity, set ONLY when exactly one node matches normalizedTarget (never an arbitrary pick among multiple matches - see `targetAmbiguous`). */
  targetNodeId: string | null;
  /** Phase 3F.1.2 - true when normalizedTarget matched MORE THAN ONE physical occurrence in this document; `resolved` is false and `targetNodeId` is null in this case (task §11: preserve ambiguity, never guess a target). */
  targetAmbiguous: boolean;
  resolved: boolean;
  unresolvedReason: string | null;
  charStart: number;
  charEnd: number;
}

interface ReferencePattern {
  kind: ReferenceTargetKind;
  re: RegExp;
  /** Extracts the normalized target ref from a match, e.g. "6.01(a)" from "Section 6.01(a)". */
  normalize: (m: RegExpExecArray) => string;
}

const PATTERNS: ReferencePattern[] = [
  // "Section 6.01", "SECTION 6.01", "§ 6.01", optionally with trailing clause markers: "Section 6.01(a)(i)".
  { kind: "SECTION", re: /(?:Section|SECTION|§)\s?(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)/g, normalize: (m) => m[1]!.replace(/\s+/g, "") },
  // "Article VI", "ARTICLE 6".
  { kind: "ARTICLE", re: /Article\s+([IVXLC]+|\d+)/gi, normalize: (m) => m[1]!.toUpperCase() },
  // A bare relative clause/subsection reference: "clause (iv)", "subsection (b)", "clause (a)(i)" - resolved relative to the enclosing section by the caller (resolveReferences), since the marker alone has no absolute meaning.
  { kind: "CLAUSE", re: /(?:clause|subsection|paragraph)\s+(\([a-zA-Z0-9]{1,7}\)(?:\([a-zA-Z0-9]{1,7}\))*)/gi, normalize: (m) => m[1]!.replace(/\s+/g, "") },
  // "Schedule 1.01", "Schedule I".
  { kind: "SCHEDULE", re: /Schedule\s+([A-Z0-9]+(?:\.\d+)?)/g, normalize: (m) => m[1]! },
  // "Exhibit A", "Exhibit 10.1".
  { kind: "EXHIBIT", re: /Exhibit\s+([A-Z0-9]+(?:\.\d+)?)/g, normalize: (m) => m[1]! },
];

/**
 * Phase 2D reuse (docs/phase-2d-covenant-context-retrieval.md §8/§12) -
 * absolute (never relative-clause, which needs an enclosing SECTION this
 * caller's text may not have one of) Section/Article/Schedule/Exhibit
 * mentions in arbitrary text, with no enclosing-node computation - for
 * detecting references INSIDE a definition's own full text (which is
 * prose, not itself a StructuralNode Phase 2A's clause tree covers), where
 * detectStructuralReferences's own enclosing-node/relative-clause logic
 * would need char offsets relative to the whole document this caller does
 * not have. Reuses the exact same SECTION/ARTICLE/SCHEDULE/EXHIBIT
 * patterns as detectStructuralReferences, never a second pattern set.
 */
export interface RawReferenceMention {
  targetKind: ReferenceTargetKind;
  normalizedTarget: string;
  referenceText: string;
  charStart: number;
}

export function detectAbsoluteReferenceMentions(text: string): RawReferenceMention[] {
  const results: RawReferenceMention[] = [];
  for (const pattern of PATTERNS) {
    if (pattern.kind === "CLAUSE") continue; // relative-only, needs an enclosing SECTION this caller doesn't have.
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      results.push({ targetKind: pattern.kind, normalizedTarget: pattern.normalize(m), referenceText: m[0], charStart: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return results.sort((a, b) => a.charStart - b.charStart);
}

const SECTION_ANTECEDENT = /(?:Section|SECTION|§)\s?(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)/g;
/** Maximum characters to look backward from a relative clause reference for a governing antecedent Section mention (task Phase 2E.1 §6) - kept tight (real drafting places the antecedent immediately before the clause reference, e.g. "Section 6.06 (other than ... clause (j) thereof)") so a distant, unrelated Section mention elsewhere in a long sentence is never picked up. */
const ANTECEDENT_WINDOW_CHARS = 120;

/**
 * Generalized relative-clause resolution (Phase 2E.1 §4-§6 remediation).
 * A bare "clause (X)"/"subsection (X)"/"paragraph (X)" reference has no
 * absolute meaning on its own - resolving it by blindly prepending the
 * DIRECT enclosing parent's own ref (the prior behavior) is only correct
 * when the reference happens to target a sibling of the immediately
 * enclosing node, and produces a silently wrong or falsely-unresolved
 * target in every other real drafting pattern. Three real, generalized,
 * deterministic resolution strategies are tried in order, each requiring
 * the candidate to resolve against a REAL node before being accepted
 * (never a guess):
 *
 * 1. ANCESTOR SELF-MATCH - the reference is self-referential to an
 *    ancestor already enclosing it (e.g. "this clause (kk)" appearing
 *    deep inside 6.07(kk)'s own descendants really means 6.07(kk) itself).
 * 2. ANTECEDENT SECTION OVERRIDE - an explicit "Section N.NN" mention
 *    stated immediately before the clause reference (within
 *    ANTECEDENT_WINDOW_CHARS, e.g. "Section 6.06 (other than ... clause
 *    (j) thereof)") governs the clause, not the reference's own physical
 *    enclosing node.
 * 3. ANCESTOR-CHAIN CHILD SEARCH - walk from the nearest enclosing
 *    container outward through each ancestor's own ref, taking the
 *    NEAREST ancestor that has a real child matching the marker exactly
 *    (case-sensitive - a lowercase top-level "(d)" must never be
 *    conflated with an unrelated nested uppercase "(D)" formula-component
 *    label two or more levels deeper, a real, disclosed drafting
 *    collision this remediation's own root-cause analysis found).
 *
 * If none resolves, the reference stays genuinely unresolved (never
 * guessed) - callers report it with the same disambiguated best-attempt
 * target string this function always returns, so an unresolved dependency
 * is traceable to a specific attempted scope rather than a bare, ambiguous
 * marker (task §6's own "ambiguous resolution must become explicit
 * unresolved context").
 */
export interface RelativeClauseResolution {
  normalizedTarget: string;
  resolved: boolean;
  /** @deprecated legacy label-shaped key; use `targetNodeId`. */
  targetNodeKey: string | null;
  targetNodeId: string | null;
  targetAmbiguous: boolean;
}

/**
 * Phase 3F.1.2 - walks the REAL physical parent chain via `parentNodeId`
 * (assigned at parse time in stage-structure.ts from actual nesting
 * position, never re-derived from a label). No label lookup, no
 * label-keyed map, and therefore no possibility of walking into the wrong
 * physical ancestor merely because it shares a `parentSectionRef` label
 * with another occurrence.
 */
function ancestorChain(enclosing: StructuralNode, nodesById: Map<string, StructuralNode>): StructuralNode[] {
  const chain: StructuralNode[] = [enclosing];
  let current = enclosing;
  while (current.parentNodeId) {
    const parent = nodesById.get(current.parentNodeId);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/**
 * `nodesById`: this document's own nodes keyed by physical occurrence
 * identity (nodeId) - used for the ancestor walk. `byLegalRef`: this
 * document's own nodes grouped by normalized sectionRef (MULTI-valued,
 * never a silent last-write-wins singleton) - used for the composed-label
 * candidate checks in steps 2/3. Exactly one match resolves; zero falls
 * through to the next strategy; more than one is reported as ambiguous and
 * never guessed (task §11).
 */
export function resolveRelativeClauseTarget(rawMarker: string, enclosing: StructuralNode | null, text: string, referenceCharStart: number, nodesById: Map<string, StructuralNode>, byLegalRef: Map<string, StructuralNode[]>, documentId: string): RelativeClauseResolution {
  void documentId; // retained in the signature for call-site stability; candidate lookups below are already document-scoped by construction (byLegalRef/nodesById are built from one document's own nodes only).
  const directParentRef = enclosing ? (enclosing.nodeType === "SECTION" ? enclosing.sectionRef : enclosing.parentSectionRef) : null;
  const fallbackTarget = `${directParentRef ?? ""}${rawMarker}`;

  if (!enclosing) return { normalizedTarget: fallbackTarget, resolved: false, targetNodeKey: null, targetNodeId: null, targetAmbiguous: false };

  const chain = ancestorChain(enclosing, nodesById);

  // 1. Ancestor self-match - the physical ancestor object is already in hand, so this is occurrence-safe by construction (no lookup at all).
  for (const ancestor of chain) {
    if (ancestor.sectionRef.endsWith(rawMarker)) {
      return { normalizedTarget: ancestor.sectionRef, resolved: true, targetNodeKey: ancestor.nodeKey, targetNodeId: ancestor.nodeId, targetAmbiguous: false };
    }
  }

  function resolveComposedCandidate(candidate: string): RelativeClauseResolution | null {
    const matches = byLegalRef.get(candidate) ?? [];
    if (matches.length === 1) return { normalizedTarget: candidate, resolved: true, targetNodeKey: matches[0]!.nodeKey, targetNodeId: matches[0]!.nodeId, targetAmbiguous: false };
    if (matches.length > 1) return { normalizedTarget: candidate, resolved: false, targetNodeKey: null, targetNodeId: null, targetAmbiguous: true };
    return null; // no match at all - try the next strategy.
  }

  // 2. Antecedent Section override - only ever accepted if the composed candidate resolves unambiguously.
  const windowStart = Math.max(0, referenceCharStart - ANTECEDENT_WINDOW_CHARS);
  const window = text.slice(windowStart, referenceCharStart);
  let antecedentMatch: RegExpExecArray | null = null;
  const antecedentRe = new RegExp(SECTION_ANTECEDENT.source, SECTION_ANTECEDENT.flags);
  let m: RegExpExecArray | null;
  while ((m = antecedentRe.exec(window)) !== null) antecedentMatch = m;
  if (antecedentMatch) {
    const antecedentRef = antecedentMatch[1]!.replace(/\s+/g, "");
    const result = resolveComposedCandidate(`${antecedentRef}${rawMarker}`);
    if (result) return result;
  }

  // 3. Ancestor-chain child search, nearest ancestor first, case-sensitive
  // marker match only. Starts at the enclosing node's OWN parent (chain[0]
  // is the enclosing node itself, deliberately skipped here) - a clause
  // reference physically inside node N meaning "a child OF N itself" would
  // already have matched step 1's self-match if N were the target, or is
  // otherwise indistinguishable from a same-document parser artifact (a
  // reference mention inside N's own prose can itself be mis-parsed as a
  // spurious nested child of N - a real, pre-existing Phase 2A structural
  // edge case this remediation's own test suite found and must not
  // resolve against).
  for (const ancestor of chain.slice(1)) {
    const result = resolveComposedCandidate(`${ancestor.sectionRef}${rawMarker}`);
    if (result) return result;
  }

  return { normalizedTarget: fallbackTarget, resolved: false, targetNodeKey: null, targetNodeId: null, targetAmbiguous: false };
}

/** Deepest structural node whose owned span contains a given offset - shared with structural-definitions.ts so both use the identical "which node is this text physically inside" rule. */
export function findEnclosingNode(charStart: number, nodesSortedByStart: StructuralNode[]): StructuralNode | null {
  // Deepest (most specific) node whose owned span contains this offset - nodes are pre-sorted by charStart, so the LAST node starting at-or-before charStart whose charEnd covers it is the tightest containing node found by scanning candidates in reverse start order.
  let best: StructuralNode | null = null;
  for (const n of nodesSortedByStart) {
    if (n.charStart > charStart) break;
    if (n.charEnd > charStart) {
      if (!best || n.charStart >= best.charStart) best = n;
    }
  }
  return best;
}

/**
 * Detects every explicit structural reference in one document's text and
 * attributes each to its enclosing node. `nodes` must be this document's
 * own structural nodes only (never mixed across documents), matching the
 * document-scoped identity discipline the rest of this module relies on.
 */
export function detectStructuralReferences(documentId: string, text: string, nodes: StructuralNode[]): DetectedReference[] {
  const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
  // Phase 3F.1.2: occurrence-safe local structures, built directly from
  // this document's own already-correctly-identified nodes (nodeId/
  // parentNodeId are minted once, in stage-structure.ts, never re-derived
  // here from a label). `nodesById` supports the ancestor walk;
  // `byLegalRef` is a MULTI-map (never a silent last-write-wins singleton)
  // supporting composed-label candidate lookups, so a duplicate-labeled
  // section can never silently substitute for the intended target.
  const nodesById = new Map(sorted.map((n) => [n.nodeId, n] as const));
  const byLegalRef = new Map<string, StructuralNode[]>();
  for (const n of sorted) {
    const list = byLegalRef.get(n.sectionRef) ?? [];
    list.push(n);
    byLegalRef.set(n.sectionRef, list);
  }
  const results: DetectedReference[] = [];

  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const charStart = m.index;
      const charEnd = m.index + m[0].length;
      const enclosing = findEnclosingNode(charStart, sorted);
      let normalizedTarget = pattern.normalize(m);
      let targetKind = pattern.kind;
      let targetNodeKey: string | null = null;
      let targetNodeId: string | null = null;
      let targetAmbiguous = false;
      let resolved = false;

      if (pattern.kind === "CLAUSE") {
        // A bare clause/subsection reference ("clause (iv)") has no
        // absolute meaning on its own - resolveRelativeClauseTarget tries
        // ancestor self-match, an explicit nearby antecedent Section
        // override, and an ancestor-chain child search, in that order,
        // never guessing (Phase 2E.1 §4-§6; Phase 3F.1.2: each step is now
        // occurrence-safe and reports ambiguity rather than silently
        // picking among multiple same-labeled candidates).
        const resolution = resolveRelativeClauseTarget(normalizedTarget, enclosing, text, charStart, nodesById, byLegalRef, documentId);
        normalizedTarget = resolution.normalizedTarget;
        targetKind = "SECTION";
        targetNodeKey = resolution.targetNodeKey;
        targetNodeId = resolution.targetNodeId;
        targetAmbiguous = resolution.targetAmbiguous;
        resolved = resolution.resolved;
      } else {
        // SCHEDULE/EXHIBIT references can never resolve against this tree:
        // Phase 2A does not parse schedules/exhibits as structural nodes at
        // all (task §13 - deferred), so a "Schedule 6.01" reference must
        // never be matched against a SECTION node that coincidentally shares
        // the same number - a real false-resolution risk this guard closes.
        const matches = targetKind === "SCHEDULE" || targetKind === "EXHIBIT" ? [] : (byLegalRef.get(normalizedTarget) ?? []);
        if (matches.length === 1) {
          resolved = true;
          targetNodeKey = matches[0]!.nodeKey;
          targetNodeId = matches[0]!.nodeId;
        } else if (matches.length > 1) {
          targetAmbiguous = true; // never arbitrarily pick among same-labeled candidates (task §11).
        }
      }

      results.push({
        documentId,
        sourceNodeKey: enclosing?.nodeKey ?? null,
        sourceNodeId: enclosing?.nodeId ?? null,
        referenceText: m[0],
        targetKind,
        normalizedTarget,
        targetNodeKey,
        targetNodeId,
        targetAmbiguous,
        resolved,
        unresolvedReason: resolved ? null : targetAmbiguous ? `${targetKind} ref "${normalizedTarget}" matches more than one physical occurrence in this document - ambiguous, not resolved` : `no ${targetKind} node with ref "${normalizedTarget}" exists among this document's own structural nodes`,
        charStart,
        charEnd,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  return results.sort((a, b) => a.charStart - b.charStart);
}
