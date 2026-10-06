/**
 * SOURCE REFERENCE RESOLUTION (Phase 3 semantic fidelity) - the deterministic, agreement-agnostic machinery behind a
 * first-class source dependency: normalize the reference text the composition emitted, resolve it against the
 * structural index of the candidate's own document, and (when the sealed population is known) identify the candidate(s)
 * owning the resolved node. Nothing here reads the target's economics; it only identifies the target.
 */
import type { StructuralIndex } from "../structural-index";
import type { IRResolvedStructuralTarget, IRSourceTargetRef, SourceDependencyResolution } from "../../ir/types";

/** "Section 9.2(b)" / "§9.2(b)" / "clause (b) of Section 9.2" -> "9.2(b)". Lower-cased, whitespace-free; null when the text carries no section-shaped reference at all. */
export function normalizeReferenceText(ref: string): string | null {
  const t = ref.trim();
  const clause = t.match(/^(?:clause|paragraph|subsection)\s*(\([^)]+\)(?:\([^)]+\))*)\s+of\s+(?:Section|§)\s*([\d]+(?:\.\d+)*[A-Za-z]?(?:\([^)]+\))*)/i);
  if (clause) return `${clause[2]}${clause[1]}`.replace(/\s+/g, "").toLowerCase();
  const section = t.match(/(?:^|\b)(?:Sections?|§§?)\s*([\d]+(?:\.\d+)*[A-Za-z]?(?:\s*\([^)]+\))*)/i) ?? t.match(/^([\d]+(?:\.\d+)*[A-Za-z]?(?:\s*\([^)]+\))*)$/);
  if (section) return section[1]!.replace(/\s+/g, "").toLowerCase();
  const article = t.match(/^(?:Article)\s+([IVXLC]+|\d+)$/i);
  if (article) return article[1]!.toUpperCase();
  return null;
}

export interface OwnershipIndexCandidate { discoveryId: string; structuralNodeIds: readonly string[] }

/** Nearest owning candidate(s) of a node: a candidate whose anchor is the node itself or an ancestor of it (closest ancestor wins; ties are all reported). */
export function owningCandidatesOf(nodeId: string, index: StructuralIndex, population: readonly OwnershipIndexCandidate[] | null | undefined): string[] {
  if (!population || population.length === 0) return [];
  const chain = [nodeId, ...index.getAncestors(nodeId).map((a) => a.nodeId)];
  for (const id of chain) {
    const owners = population.filter((c) => c.structuralNodeIds[0] === id).map((c) => c.discoveryId).sort();
    if (owners.length > 0) return owners;
  }
  return [];
}

export interface ResolveSourceTargetArgs {
  exactSourceTargetRef: string;
  documentId: string;
  index: StructuralIndex | null;
  population: readonly OwnershipIndexCandidate[] | null | undefined;
}

/** Resolves one reference to its structural target. Never guesses: an ambiguous or missing node is DEPENDENCY_UNKNOWN. */
export function resolveSourceTarget(args: ResolveSourceTargetArgs): IRSourceTargetRef {
  const normalized = normalizeReferenceText(args.exactSourceTargetRef);
  let resolved: IRResolvedStructuralTarget | null = null;
  let targetDefinedTerm: string | null = null;
  if (normalized && args.index) {
    const res = args.index.resolveUniqueNodeByRef(args.documentId, normalized);
    if (res.status === "UNIQUE") resolved = { documentId: res.node.documentId, structuralNodeId: res.node.nodeId, sectionRef: res.node.sectionRef };
    else if (/^[IVXLC]+$/.test(normalized)) {
      const art = args.index.resolveUniqueNodeByRef(args.documentId, `Article ${normalized}`);
      if (art.status === "UNIQUE") resolved = { documentId: art.node.documentId, structuralNodeId: art.node.nodeId, sectionRef: art.node.sectionRef };
    }
  }
  // A named condition / defined-term reference ("the Payment Conditions", "Ratio Conditions") resolves to the structural
  // node that DEFINES the term - the definitions provision owned by its own candidate. Deterministic index lookup only.
  if (!resolved && !normalized && args.index) {
    const term = args.exactSourceTargetRef.trim().replace(/^(?:the|such|any)\s+/i, "").replace(/^["\u201c\u201d']+|["\u201c\u201d']+$/g, "").trim();
    const def = term.length >= 3 ? args.index.getDefinition(term, args.documentId) : undefined;
    if (def?.sourceNodeId) {
      const node = args.index.getNodeById(def.sourceNodeId);
      if (node) { resolved = { documentId: node.documentId, structuralNodeId: node.nodeId, sectionRef: node.sectionRef }; targetDefinedTerm = def.exactTerm; }
    }
  }
  const owningCandidateRefs = resolved && args.index ? owningCandidatesOf(resolved.structuralNodeId, args.index, args.population) : [];
  const resolutionStatus: SourceDependencyResolution = resolved ? "SOURCE_REFERENCE_RESOLVED" : "DEPENDENCY_UNKNOWN";
  return { exactSourceTargetRef: args.exactSourceTargetRef.trim(), normalizedTargetRef: normalized, ...(targetDefinedTerm ? { targetDefinedTerm } : {}), resolvedStructuralTarget: resolved, owningCandidateRefs, boundSemanticTargetIds: [], resolutionStatus };
}

/**
 * Deterministic dependency wording from the relationship type and the exact reference. The target's own figures never
 * appear here, and neither does any STATUS of the target (SA-4): at candidate compile time the target may be
 * uncompiled, review-required, not certified or outside a partial target set - the prose says only that the target's
 * semantics are separately owned and resolved at package level.
 */
export function describeSourceDependency(relationshipType: string, exactSourceTargetRef: string): string {
  const ref = exactSourceTargetRef.trim();
  switch (relationshipType) {
    case "REQUIRES": return `requires that the terms of ${ref} are satisfied; the semantics of ${ref} are separately owned and resolved at package level`;
    case "LIMITED_BY": return `is limited by ${ref}; the limit's semantics are separately owned and resolved at package level`;
    case "SHARES_CAPACITY_WITH": return `shares capacity with ${ref}`;
    case "ALTERNATIVE_TO": return `is an alternative to ${ref}`;
    case "CONCURRENT_COUNTED": return `is counted concurrently with ${ref}`;
    case "CONCURRENT_DISREGARDED": return `is disregarded concurrently with ${ref}`;
    case "INDEPENDENT_REQUIREMENT": return `is an independent requirement alongside ${ref}`;
    case "AUTOMATIC_LINKED_PERMISSION": return `is automatically linked to the permission in ${ref}`;
    case "BASKET_FEEDING": return `feeds the basket in ${ref}`;
    case "COMBINABLE": return `is combinable with ${ref}`;
    case "RECLASSIFIABLE_TO": return `is reclassifiable to ${ref}`;
    case "REDESIGNATES_TO": return `redesignates to ${ref}`;
    default: return `${relationshipType} ${ref}`;
  }
}

/** Numeric figures asserted in a prose string (money, percentages, ratios, multiples, plain numbers with scale words) - the generic scan used to keep target economics out of a child's artifact. */
export function numericFiguresInProse(text: string): string[] {
  const out = new Set<string>();
  const re = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand))?|\d+(?:\.\d+)?\s*(?::|to)\s*1(?:\.0+)?\b|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*x\b|\b\d+(?:\.\d+)?\s*(?:million|billion|thousand)\b/gi;
  for (const m of text.matchAll(re)) out.add(m[0].replace(/\s+/g, "").toLowerCase());
  return [...out].sort();
}

/** True when `figure` (a normalized match of numericFiguresInProse) occurs in `operativeText` in any spacing. */
export function figureStatedInText(figure: string, operativeText: string): boolean {
  return numericFiguresInProse(operativeText).includes(figure);
}
