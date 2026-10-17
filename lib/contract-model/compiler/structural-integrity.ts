/**
 * Phase B — Structural integrity contract (Headroom Structural
 * Intelligence Hardening Initiative).
 *
 * Enforceable invariants for structural nodes, validated at the
 * structural-index boundary BEFORE downstream interpretation
 * (discovery, summarization, grants, compile, capacity). The
 * validator REPORTS violations — it never repairs them. A node
 * that violates an invariant is structurally unresolved: its
 * parentage/span/ref is not authoritative, and downstream
 * consumers must treat it as unresolved (never auto-accept,
 * never compile from it) rather than guessing.
 *
 * Invariants:
 *  - OFFSETS_VALID: 0 <= charStart < charEnd <= textLength.
 *  - SORTED: nodes sorted by (charStart, charEnd). Array order
 *    is never authority (D15) — unsorted input is a violation,
 *    not something to silently re-sort and forget.
 *  - OCCURRENCE_IDENTITY: no two nodes share
 *    (documentId, nodeType, charStart). Labels (sectionRef,
 *    nodeKey) are NOT identity (D5).
 *  - PARENT_EXISTS: parentNodeId references a real node, or is
 *    null for a root.
 *  - PARENT_CONTAINMENT: a parent's span contains its child's
 *    span. Proximity and rank order are not parentage (D3).
 *  - REF_CONSISTENCY: a child's ref is a valid descendant of
 *    its parent's ref (article numeral matches section major;
 *    child ref = parent ref + a valid continuation). A
 *    containing node whose ref is inconsistent with the child
 *    is NOT the parent (D2/D3).
 *  - ACYCLIC: parent chains terminate (D3).
 *  - SAME_SEGMENT: parent and child share documentId. After
 *    Phase C segmentation, segments get distinct ids; a
 *    parent in another segment is a cross-document violation
 *    (D1).
 *  - ROOT_VALIDITY: in a document with ARTICLE nodes, a SECTION
 *    with no parent has an unresolved article (a missing
 *    heading must not re-parent it to the previous article,
 *    D16). SUBSECTION/CLAUSE/SUBCLAUSE roots are always
 *    unresolved. ARTICLE roots are valid.
 */

import type { StructuralNode } from "./types";

export type StructuralInvariantCode =
  | "OFFSETS_VALID"
  | "SORTED"
  | "OCCURRENCE_IDENTITY"
  | "PARENT_EXISTS"
  | "PARENT_CONTAINMENT"
  | "REF_CONSISTENCY"
  | "ACYCLIC"
  | "SAME_SEGMENT"
  | "ROOT_VALIDITY";

export interface StructuralViolation {
  /** Affected node, or null for a document-level violation (e.g. SORTED). */
  nodeId: string | null;
  invariant: StructuralInvariantCode;
  severity: "ERROR";
  /** Human-readable diagnostic with provenance (refs + offsets). */
  diagnostic: string;
}

export interface StructuralIntegrityResult {
  violations: StructuralViolation[];
  /** True when no ERROR violation exists. */
  valid: boolean;
}

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

function romanToArabic(roman: string): number | null {
  const s = roman.toUpperCase().trim();
  if (!/^[IVXLC]+$/.test(s)) return null;
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = ROMAN_VALUES[s[i]!]!;
    total = v < prev ? total - v : total + v;
    prev = v;
  }
  return total;
}

/**
 * True when `childRef` is a valid direct-or-deeper descendant of
 * `parentRef` given the parent's node type. Returns null when the
 * refs cannot be parsed (unparseable refs are not validated —
 * the ambiguous flag covers them, and the validator must not
 * invent a verdict from an unparseable label).
 */
export function isRefDescendant(
  parentRef: string,
  parentType: StructuralNode["nodeType"],
  childRef: string,
): boolean | null {
  const p = parentRef.trim();
  const c = childRef.trim();
  if (!p || !c) return null;
  if (parentType === "ARTICLE") {
    // Parent is an article numeral (roman or arabic); the child's
    // major number (leading digits before the first ".") must
    // equal it. "VII" is an ancestor of "7.01"; "5" of "5.07".
    // An article never parents another article.
    const parentNum = /^\d+$/.test(p) ? Number(p) : romanToArabic(p);
    if (parentNum === null) return null;
    const childMajor = /^(\d+)\b/.exec(c)?.[1];
    if (!childMajor) return null;
    return Number(childMajor) === parentNum;
  }
  // Non-article parent: the child ref must be the parent ref plus
  // one or more valid continuation segments (".N" or "(marker)").
  // "7.01" -> "7.01(a)"; "7.01(a)" -> "7.01(a)(i)".
  // A bare string-prefix check is not enough ("7.01" is a prefix
  // of "7.011" but not its parent).
  if (!c.startsWith(p)) return false;
  const rest = c.slice(p.length);
  if (rest.length === 0) return false; // identical refs: not parent/child
  // Phase D (adversarial): continuation markers are case-insensitive —
  // (A), (B), (I), (II) are standard clause markers. The original
  // [a-z0-9] without /i rejected them, so 7.01(a)(i)(A) fell through
  // to the ARTICLE instead of its immediate parent 7.01(a)(i).
  return /^(\.\d+|\([a-zA-Z0-9]{1,3}\))+$/.test(rest);
}

export function validateStructuralIntegrity(
  nodes: readonly StructuralNode[],
  textLength: number,
): StructuralIntegrityResult {
  const violations: StructuralViolation[] = [];
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));

  // OFFSETS_VALID + SORTED + OCCURRENCE_IDENTITY
  const seenOccurrence = new Set<string>();
  let prevStart = -1;
  let prevEnd = -1;
  for (const n of nodes) {
    if (!(n.charStart >= 0 && n.charStart < n.charEnd && n.charEnd <= textLength)) {
      violations.push({
        nodeId: n.nodeId,
        invariant: "OFFSETS_VALID",
        severity: "ERROR",
        diagnostic: `Node ${n.nodeType} ${n.sectionRef} has invalid offsets [${n.charStart}, ${n.charEnd}) for text length ${textLength}; its span is not trustworthy.`,
      });
    }
    if (n.charStart < prevStart || (n.charStart === prevStart && n.charEnd < prevEnd)) {
      violations.push({
        nodeId: n.nodeId,
        invariant: "SORTED",
        severity: "ERROR",
        diagnostic: `Node ${n.nodeType} ${n.sectionRef} at [${n.charStart}, ${n.charEnd}) is out of document order; array order is not authority and span-dependent consumers must not trust this ordering.`,
      });
    }
    prevStart = n.charStart;
    prevEnd = n.charEnd;
    const occurrence = `${n.documentId}::${n.nodeType}::${n.charStart}`;
    if (seenOccurrence.has(occurrence)) {
      violations.push({
        nodeId: n.nodeId,
        invariant: "OCCURRENCE_IDENTITY",
        severity: "ERROR",
        diagnostic: `Two nodes share occurrence (${n.documentId}, ${n.nodeType}, ${n.charStart}); occurrence identity is (document, type, charStart), never the label ${n.sectionRef}.`,
      });
    }
    seenOccurrence.add(occurrence);
  }

  const hasArticle = nodes.some((n) => n.nodeType === "ARTICLE");

  for (const n of nodes) {
    // PARENT_EXISTS + SAME_SEGMENT + PARENT_CONTAINMENT + REF_CONSISTENCY
    if (n.parentNodeId !== null) {
      const parent = byId.get(n.parentNodeId);
      if (!parent) {
        violations.push({
          nodeId: n.nodeId,
          invariant: "PARENT_EXISTS",
          severity: "ERROR",
          diagnostic: `Node ${n.nodeType} ${n.sectionRef} claims parentNodeId ${n.parentNodeId}, which matches no node; the parent relationship is unresolved, not re-rooted.`,
        });
        continue;
      }
      if (parent.documentId !== n.documentId) {
        violations.push({
          nodeId: n.nodeId,
          invariant: "SAME_SEGMENT",
          severity: "ERROR",
          diagnostic: `Node ${n.nodeType} ${n.sectionRef} (document ${n.documentId}) is parented to ${parent.nodeType} ${parent.sectionRef} in document ${parent.documentId}; cross-document relationships must use explicit authority-bearing links, never structural parentage.`,
        });
      }
      if (!(parent.charStart <= n.charStart && n.charEnd <= parent.charEnd)) {
        violations.push({
          nodeId: n.nodeId,
          invariant: "PARENT_CONTAINMENT",
          severity: "ERROR",
          diagnostic: `Node ${n.nodeType} ${n.sectionRef} [${n.charStart}, ${n.charEnd}) is parented to ${parent.nodeType} ${parent.sectionRef} [${parent.charStart}, ${parent.charEnd}), whose span does not contain it; proximity is not parentage.`,
        });
      }
      const consistent = isRefDescendant(parent.sectionRef, parent.nodeType, n.sectionRef);
      if (consistent === false) {
        violations.push({
          nodeId: n.nodeId,
          invariant: "REF_CONSISTENCY",
          severity: "ERROR",
          diagnostic: `Node ${n.nodeType} ${n.sectionRef} is parented to ${parent.nodeType} ${parent.sectionRef}, but its ref is not a valid descendant of the parent's ref; the parent assignment is unresolved, not repaired to the nearest preceding heading.`,
        });
      }
    } else {
      // ROOT_VALIDITY
      if (n.nodeType === "SUBSECTION" || n.nodeType === "CLAUSE" || n.nodeType === "SUBCLAUSE") {
        violations.push({
          nodeId: n.nodeId,
          invariant: "ROOT_VALIDITY",
          severity: "ERROR",
          diagnostic: `Node ${n.nodeType} ${n.sectionRef} has no parent but is not a top-level node; a clause without a parent section is structurally unresolved.`,
        });
      } else if (n.nodeType === "SECTION" && hasArticle) {
        violations.push({
          nodeId: n.nodeId,
          invariant: "ROOT_VALIDITY",
          severity: "ERROR",
          diagnostic: `Section ${n.sectionRef} has no parent article in a document with ARTICLE nodes; its article is unresolved (a missing heading must not re-parent it to the previous article).`,
        });
      }
      // ARTICLE roots and SECTION roots in an article-less document are valid.
    }

    // ACYCLIC: walk the parent chain with a visited set.
    const seen = new Set<string>();
    let cur: StructuralNode | undefined = n;
    while (cur?.parentNodeId !== null && cur?.parentNodeId !== undefined) {
      if (seen.has(cur.nodeId)) {
        violations.push({
          nodeId: n.nodeId,
          invariant: "ACYCLIC",
          severity: "ERROR",
          diagnostic: `Parent chain from ${n.nodeType} ${n.sectionRef} cycles through ${cur.nodeId}; hierarchy must be acyclic.`,
        });
        break;
      }
      seen.add(cur.nodeId);
      cur = byId.get(cur.parentNodeId);
      if (!cur) break; // PARENT_EXISTS already reported
    }
  }

  return { violations, valid: violations.length === 0 };
}
