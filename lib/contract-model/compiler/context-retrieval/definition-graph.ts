/**
 * Phase 2D §8/§9/§10/§11 - definition retrieval, recursive definition
 * dependencies, dependency-path preservation, and cycle detection.
 *
 * Reuses Phase 2A's structural-index definition index exactly as task §8
 * requires ("do not perform fuzzy matching when an exact defined-term
 * relationship exists") - term detection is always an exact, case-
 * sensitive substring match of a term this document's own
 * structural-definitions.ts already declared, never a fuzzy guess.
 */
import type { StructuralIndex } from "../structural-index";
import { addEdge, addItem, makeItemInput, resolveDefinitionEvidenceState, withinBudget, type RetrievalState } from "./state";
import { computeItemId } from "./identity";
import type { ContextItem } from "./types";

/**
 * Task §9's own "administrative/legal terms that do not materially affect
 * covenant analysis" - a small, generic, disclosed denylist of boilerplate
 * defined terms found in virtually every credit agreement/indenture,
 * never a package-specific term. Deterministic materiality gating (task
 * §9's own "use deterministic signals where possible"); anything not on
 * this list is treated as potentially material and retrieved.
 */
const ADMINISTRATIVE_TERM_DENYLIST = new Set(["person", "business day", "governmental authority", "requirements of law", "us", "united states", "dollars", "administrative agent", "collateral agent", "lender", "agent", "closing date", "code", "gaap"]);

function isAdministrativeTerm(normalizedTerm: string): boolean {
  return ADMINISTRATIVE_TERM_DENYLIST.has(normalizedTerm);
}

interface KnownTermMention {
  exactTerm: string;
  normalizedTerm: string;
}

/**
 * IPV-09: plural/inflected surface forms of a declared defined term.
 * Deterministic English inflection only (Subsidiaries/ies, Guarantors, Liens) —
 * never fuzzy synonym matching across distinct defined terms.
 */
function termSurfaceForms(exactTerm: string): string[] {
  const forms = new Set<string>([exactTerm]);
  if (/y$/i.test(exactTerm) && !/[aeiou]y$/i.test(exactTerm)) {
    forms.add(exactTerm.replace(/y$/i, exactTerm.endsWith("Y") ? "IES" : "ies"));
  } else if (/s$/i.test(exactTerm) || /x$/i.test(exactTerm) || /z$/i.test(exactTerm) || /ch$/i.test(exactTerm) || /sh$/i.test(exactTerm)) {
    forms.add(`${exactTerm}${exactTerm === exactTerm.toUpperCase() ? "ES" : "es"}`);
  } else {
    forms.add(`${exactTerm}${/[A-Z]+$/.test(exactTerm) && exactTerm === exactTerm.toUpperCase() ? "S" : "s"}`);
  }
  // Common credit-agreement plurals already ending in "Subsidiary" etc. are covered above.
  return [...forms];
}

/** Every term THIS document declared (structural-definitions.ts's own detection) that appears verbatim in `text` - exact match only, word-boundary-safe (plus deterministic plural surface forms — IPV-09). */
function findKnownTermMentions(text: string, index: StructuralIndex, documentId: string, excludeNormalizedTerm: string): KnownTermMention[] {
  const out: KnownTermMention[] = [];
  const seen = new Set<string>();
  for (const def of index.allDefinitions()) {
    if (def.documentId !== documentId) continue;
    if (def.normalizedTerm === excludeNormalizedTerm) continue;
    if (seen.has(def.normalizedTerm)) continue;
    if (isAdministrativeTerm(def.normalizedTerm)) continue;
    // Word-boundary-safe exact match of the term's own exact text (never fuzzy),
    // plus plural/inflected surface forms so "Guarantors" resolves "Guarantor".
    const hit = termSurfaceForms(def.exactTerm).some((form) => {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`).test(text);
    });
    if (hit) {
      out.push({ exactTerm: def.exactTerm, normalizedTerm: def.normalizedTerm });
      seen.add(def.normalizedTerm);
    }
  }
  return out;
}

/** Returns the existing item for this term under EITHER possible type (a term first classified DEFINITION at depth 1 must never be duplicated as a second DEFINITION_DEPENDENCY item when later reached transitively, and vice versa - task §10's "deduplicate the context node"), or undefined if this term has not been retrieved yet under any type. */
function findExistingDefinitionItem(state: RetrievalState, documentId: string, normalizedTerm: string): ContextItem | undefined {
  const definitionId = computeItemId(documentId, normalizedTerm, "DEFINITION");
  const existingAsDefinition = state.items.get(definitionId);
  if (existingAsDefinition) return existingAsDefinition;
  const dependencyId = computeItemId(documentId, normalizedTerm, "DEFINITION_DEPENDENCY");
  return state.items.get(dependencyId);
}

export function retrieveDefinitionsRecursive(state: RetrievalState, index: StructuralIndex, documentId: string, sourceText: string, parentItemId: string, depth: number, pathTermsStack: readonly string[]): void {
  const currentTerm = pathTermsStack[pathTermsStack.length - 1] ?? "";
  const mentions = findKnownTermMentions(sourceText, index, documentId, currentTerm);
  if (depth > state.budget.maxDefinitionDepth) {
    // SEMANTIC FIDELITY (v4) - the depth bound withholds something only when this text mentions a known term that is not
    // already retrieved and not a cycle. A leaf definition at the bound is not a budget stop.
    const withheld = mentions.filter((m) => !pathTermsStack.includes(m.normalizedTerm) && !findExistingDefinitionItem(state, documentId, m.normalizedTerm));
    if (withheld.length > 0) {
      state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxDefinitionDepth (${state.budget.maxDefinitionDepth}) reached`);
      state.retrievalStops.push({ reason: "DEPTH_LIMIT_WITH_UNRETRIEVED_DEPENDENCIES", fromNodeId: parentItemId, targetNodeId: parentItemId, targetSectionRef: null, owningCandidateRefs: [], depth, detail: `depth ${depth} > maxDefinitionDepth ${state.budget.maxDefinitionDepth}: ${withheld.length} defined-term mention(s) not retrieved (${withheld.map((m) => m.exactTerm).join(", ")})` });
    }
    return;
  }
  state.maxDefinitionDepthReached = Math.max(state.maxDefinitionDepthReached, depth);

  for (const mention of mentions) {
    const isCycle = pathTermsStack.includes(mention.normalizedTerm);
    const existing = findExistingDefinitionItem(state, documentId, mention.normalizedTerm);

    if (isCycle) {
      const cyclePath = [...pathTermsStack, mention.normalizedTerm].join(" -> ");
      // IPV-12 / IPV-21: when the term is ALREADY retrieved, the loop is closed against
      // material already in the bundle (diamond or mutual cross-mention). Disclose as
      // LOW so sufficiency stays honest without false REVIEW_REQUIRED refusals. MEDIUM
      // only when the cycle blocks retrieval of a term not yet in the bundle.
      if (existing) {
        addEdge(state, parentItemId, existing.itemId, "DEPENDS_ON_DEFINITION", `Cyclic/diamond dependency (${cyclePath}) - already retrieved; not re-expanded.`);
        state.duplicatePathsDeduplicated++;
        state.unresolved.push({
          originatingNodeKey: null,
          dependencyType: "DEFINITION_CYCLE",
          sourceText: mention.exactTerm,
          attemptedResolution: `Definition cycle detected: ${cyclePath}`,
          reason: "Dependency path re-enters an already-retrieved definition; edge recorded, expansion stopped. Severity LOW because the definition text is already in the bundle (IPV-21 diamond / mutual cross-mention).",
          candidateTargets: [mention.exactTerm],
          citation: `${documentId}::${mention.exactTerm}`,
          severity: "LOW",
        });
        continue;
      }
      state.unresolved.push({
        originatingNodeKey: null,
        dependencyType: "DEFINITION_CYCLE",
        sourceText: mention.exactTerm,
        attemptedResolution: `Definition cycle detected: ${cyclePath}`,
        reason: "Following this definition dependency further would re-enter a definition already open in the current traversal path - stopped safely rather than looping.",
        candidateTargets: [mention.exactTerm],
        citation: `${documentId}::${mention.exactTerm}`,
        severity: "MEDIUM",
      });
      continue;
    }

    if (existing) {
      addEdge(state, parentItemId, existing.itemId, "DEPENDS_ON_DEFINITION", "Additional dependency path to an already-retrieved definition.");
      state.duplicatePathsDeduplicated++;
      continue;
    }

    const fullText = index.getDefinitionFullText(mention.exactTerm, documentId) ?? index.getDefinition(mention.exactTerm, documentId)?.definitionExcerpt ?? "";
    if (!withinBudget(state, fullText.length)) return;

    // Phase 3F.1 FIX-2 - this is the exact defect class the reproduced
    // exploit targeted: fullText above is raw base-document text with NO
    // amendment/operative-state check of any kind. evidenceState is
    // computed here, BEFORE this item is ever placed in the bundle, so a
    // CONFLICTED/AMBIGUOUS/superseded definition is never silently
    // presented as current truth regardless of whether the model ever
    // calls getDefinition itself.
    const evidenceState = resolveDefinitionEvidenceState(state, index, documentId, mention.exactTerm);
    const type = depth === 1 ? "DEFINITION" : "DEFINITION_DEPENDENCY";
    const item = addItem(
      state,
      makeItemInput(type, documentId, null, null, mention.exactTerm, `Definition of "${mention.exactTerm}"`, fullText, depth === 1 ? `Defined term used directly in the discovered covenant's own text.` : `Defined term used within the definition of "${pathTermsStack[pathTermsStack.length - 1]}", ${depth - 1} level(s) removed from the covenant's own text.`, depth, [parentItemId], "DEFINITION_INDEX", 1, evidenceState)
    );
    addEdge(state, parentItemId, item.itemId, "DEPENDS_ON_DEFINITION", depth === 1 ? "Directly used defined term." : "Transitive definition dependency.");

    retrieveDefinitionsRecursive(state, index, documentId, fullText, item.itemId, depth + 1, [...pathTermsStack, mention.normalizedTerm]);
  }
}

/** Entry point: scan the operative source's own text for its direct defined-term dependencies. */
export function retrieveDirectDefinitions(state: RetrievalState, index: StructuralIndex, documentId: string, operativeText: string, operativeItemId: string): void {
  retrieveDefinitionsRecursive(state, index, documentId, operativeText, operativeItemId, 1, []);
}
