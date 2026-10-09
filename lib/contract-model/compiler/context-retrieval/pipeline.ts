/**
 * Phase 2D - buildCovenantContextBundle: the one entry point. Given a
 * Phase 2B DiscoveredCandidate (never a human-supplied section/benchmark
 * target - task §4), assembles the bounded, source-backed Covenant
 * Context Bundle a downstream analyzer needs.
 *
 * COST JUSTIFICATION (task §23): this V1 makes ZERO real LLM calls, for
 * the same reason Phase 2C's package-graph needed none - every relevance
 * decision this phase's own required scenarios exercise (parent/child/
 * sibling inclusion, definition materiality, cross-reference relevance
 * gating, cross-instrument resolution order) is reachable from
 * deterministic structural/textual signals alone. SEMANTIC_PROMPT_VERSION
 * is reserved below for a future semantic-relevance fallback (task §22's
 * own "the model's role is to decide relevance among structurally
 * plausible candidates, not reread the entire agreement") with the
 * version-identity convention already established, exactly mirroring
 * Phase 2C's own reserved-but-unused semantic layer - see the final
 * report for the estimate that would be required before ever calling it.
 */
import type { StructuralIndex } from "../structural-index";
import type { DiscoveredCandidate } from "../discovery/types";
import type { PackageGraphResult } from "../package-graph/types";
import type { NodeSupersessionIndex, OperativeContractState } from "../amendment/types";
import { createRetrievalState, operativeDefinitionText, resolveDefinitionEvidenceState, type RetrievalState } from "./state";
import { retrieveOperativeSource, retrieveParentScope, retrieveChildRules, retrieveSiblingContext, retrieveLinkedStructuralContext, retrieveArticleOverrideLeads } from "./structural-context";
import { isAdministrativeTerm, phraseMatchesDeclaredTerm, retrieveDirectDefinitions } from "./definition-graph";
import { retrieveCrossReferencesFromNode, retrieveCrossReferencesFromDefinitionText, retrieveInboundOverrideReferences } from "./reference-context";
import { retrieveAmendmentLeadsForSection, retrieveAmendmentLeadsForDefinition, retrieveCrossDocumentReferenceLeads, resolveCrossDocumentDefinition, type PackageDocumentAccess } from "./cross-document-context";
import { addEdge, addItem, makeItemInput, withinBudget } from "./state";
import { computeBundleId, computeContentIdentity } from "./identity";
import { DEFAULT_RETRIEVAL_BUDGET, RETRIEVAL_ALGORITHM_VERSION, type BuildContextBundleInput, type CovenantContextBundle, type SufficiencyState } from "./types";

/** Reserved, never called in this V1 (see header) - present so a future addition does not have to invent the version-identity convention from scratch. */
export const SEMANTIC_PROMPT_VERSION = "phase-2d-context-relevance.v1";

/** 2-5 consecutive Title-Case words - a conservative, generic shape match for "this looks like a defined-term usage," used ONLY to detect a term that is NOT declared in the current document at all (a genuine cross-document/unresolved lead) - never a substitute for the exact-match discipline definition-graph.ts uses for terms that ARE declared here. */
const TITLE_CASE_PHRASE = /\b(?:[A-Z][a-zA-Z]+(?:-[A-Z][a-zA-Z]+)?)(?:\s+(?:[A-Z][a-zA-Z]+(?:-[A-Z][a-zA-Z]+)?|of|and)){1,4}\b/g;

/** Ordinary English sentence-initial capitalized words, stripped from the front of a candidate phrase before it is judged - "The Borrower" is noise, "Borrower" alone (rarely 2+ words, so usually filtered by the length check anyway) is not what this heuristic is for; this only matters for a leading article/demonstrative in front of a genuinely longer candidate. */
const LEADING_STOPWORDS = new Set(["the", "this", "that", "each", "any", "such", "no", "for", "if", "in", "notwithstanding", "except", "subject", "pursuant", "unless", "until", "upon", "with", "without", "provided"]);

/** Trailing conjunctions/prepositions that make a Title-Case capture incomplete ("Notes and", "Borrower and"). */
const TRAILING_STOPWORDS = new Set(["and", "or", "of", "the", "a", "an", "to", "for", "in", "on", "by", "with"]);

/** Section/article heading noise that the Title-Case heuristic must never treat as a defined-term lead. */
const HEADING_NOISE = /^(?:SECTION|ARTICLE|SCHEDULE|EXHIBIT)\b|\b(?:SECTION|ARTICLE|SCHEDULE|EXHIBIT)$/i;

/**
 * High-confidence financial / covenant defined-term morphology (IPV-10).
 * Nested undefined phrases matching this shape degrade sufficiency to REVIEW_REQUIRED;
 * weaker Title-Case noise is disclosed at LOW so certified golden paths are not
 * refused for ordinary document names ("Security Documents") or heading fragments.
 */
const HIGH_CONFIDENCE_UNDEFINED_TERM =
  /^(?:Consolidated|Fixed|Total|Available|Adjusted|Excess|Interest|Net|Senior|Junior|Permitted|Restricted|Unrestricted|Pro Forma|Closing|Incremental|Equivalent)\b/i;

/** Mirror of definition-graph administrative denylist — nested fallback must not MEDIUM-refuse boilerplate. */
const ADMINISTRATIVE_NESTED_DENYLIST = new Set(["person", "business day", "governmental authority", "requirements of law", "us", "united states", "dollars", "administrative agent", "collateral agent", "lender", "agent", "closing date", "code", "gaap"]);

/** Deterministic plural/singular surface forms so "Restricted Payments" matches declared "Restricted Payment". */
function phraseSurfaceForms(exact: string): string[] {
  const forms = new Set<string>([exact]);
  if (/y$/i.test(exact) && !/[aeiou]y$/i.test(exact)) {
    forms.add(exact.replace(/y$/i, exact.endsWith("Y") ? "IES" : "ies"));
  } else if (/s$/i.test(exact) || /x$/i.test(exact) || /z$/i.test(exact) || /ch$/i.test(exact) || /sh$/i.test(exact)) {
    forms.add(`${exact}${exact === exact.toUpperCase() ? "ES" : "es"}`);
  } else {
    forms.add(`${exact}${/[A-Z]+$/.test(exact) && exact === exact.toUpperCase() ? "S" : "s"}`);
  }
  return [...forms];
}

function knownTermCoversPhrase(phrase: string, exactTerms: Map<string, string>): boolean {
  const normalized = phrase.toLowerCase();
  if (exactTerms.has(normalized)) return true;
  for (const exact of exactTerms.values()) {
    if (phraseSurfaceForms(exact).some((f) => f.toLowerCase() === normalized)) return true;
  }
  return false;
}

function extractCandidatePhrases(text: string): string[] {
  const matches = text.match(TITLE_CASE_PHRASE) ?? [];
  const out = new Set<string>();
  for (const raw of matches) {
    const words = raw.trim().split(/\s+/);
    while (words.length > 0 && LEADING_STOPWORDS.has(words[0]!.toLowerCase())) words.shift();
    while (words.length > 0 && TRAILING_STOPWORDS.has(words[words.length - 1]!.toLowerCase())) words.pop();
    if (words.length < 2) continue;
    const phrase = words.join(" ");
    if (HEADING_NOISE.test(phrase)) continue;
    out.add(phrase);
  }
  return [...out];
}

function unresolvedSeverityForNestedPhrase(phrase: string): "LOW" | "MEDIUM" {
  return HIGH_CONFIDENCE_UNDEFINED_TERM.test(phrase) ? "MEDIUM" : "LOW";
}

export interface PackageAccess {
  /** Multi-document StructuralIndex covering every document visible to this retrieval (built once per package by the caller, same as Phase 2B/2C's own convention). */
  index: StructuralIndex;
  packageGraph: PackageGraphResult | null;
  /** documentId -> normalizedTerm -> exactTerm, for every document's own declared definitions - used only for the cross-document/cross-instrument fallback (task §21), never for same-document resolution (definition-graph.ts's own exact index handles that). */
  exactTermsByDocument: Map<string, Map<string, string>>;
  /** SEMANTIC FIDELITY (v4): the sealed candidate population. A cross-reference whose target is owned by another candidate is retrieved as context and NOT recursed into (STOP_AT_SEPARATELY_OWNED_SEMANTIC_UNIT). */
  semanticUnitOwnership?: readonly { discoveryId: string; structuralNodeIds: readonly string[] }[] | null;
  /**
   * Phase 3F.1 FIX-2 ("trust metadata belongs to the evidence itself, not to
   * the retrieval mechanism") - this instrument's own already-computed
   * OperativeContractState (Phase 2G), and the matching NodeSupersessionIndex
   * already built from it - passed straight through from the SAME values the
   * orchestrator already threads into SemanticToolAccess for the model's own
   * evidence tools (semantic/tools.ts), never re-derived a second time here.
   * Every DEFINITION/SECTION-shaped item this pipeline retrieves is now
   * routed through the SAME amendment-aware resolution discipline those
   * tools already apply, so a CONFLICTED/AMBIGUOUS/superseded provision can
   * never be silently embedded as current truth in the model's very first
   * turn, before it has called any tool. Omitting both (undefined) degrades
   * to the pre-existing behavior for this package: no operative-state check
   * at all, every item's evidenceState conservatively defaults through the
   * fail-closed EMPTY_SUPERSESSION_INDEX path (never upgraded to a false
   * CURRENT claim - see resolveOperativeDefinitionEvidence/
   * resolveOperativeSectionEvidence's own "never amended" convention).
   */
  operativeState?: OperativeContractState | null;
  supersessionIndex?: NodeSupersessionIndex;
}

function computeSufficiencyState(state: RetrievalState): SufficiencyState {
  if (state.stopReasons.size > 0) return "BUDGET_EXCEEDED";
  if (state.unresolved.some((u) => u.severity === "HIGH")) return "INCOMPLETE";
  // Canonical-map remediation: a LOW-severity DISCLOSURE (a bounded descendant selection, a capitalized phrase that is
  // not a declared term) is recorded on the bundle but does not, by itself, make retrieval insufficient - only a
  // MEDIUM or HIGH unresolved dependency does. Before this, 103 of 104 preserved CONMED bundles were non-SUFFICIENT.
  if (state.unresolved.some((u) => u.severity === "MEDIUM")) return "REVIEW_REQUIRED";
  return "SUFFICIENT";
}

function retrieveCrossDocumentDependenciesForDefinitions(state: RetrievalState, access: PackageAccess, documentId: string): void {
  for (const item of [...state.items.values()]) {
    if (item.type !== "DEFINITION" && item.type !== "DEFINITION_DEPENDENCY") continue;
    retrieveCrossReferencesFromDefinitionText(state, access.index, item.documentId, item.excerptText, item.itemId, item.retrievalDepth + 1, access.packageGraph);
    if (access.packageGraph) retrieveAmendmentLeadsForDefinition(state, access.packageGraph, item.documentId, item.normalizedRef, item.itemId);
  }
  void documentId;
}

/** Types whose own retrieved text can carry a real defined-term usage that the operative node's own DESCENDANTS text does not contain - e.g. a proviso/sibling clause holding the covenant's real economic detail (task §32 test scenarios routinely retrieve this material as its own item). Undeclared-term detection must see this text too, not just the primary operative span, or a real dependency living entirely inside a retrieved sibling/parent/child item is silently never checked at all.
 * IPV-10: DEFINITION / DEFINITION_DEPENDENCY bodies are included so nested undefined Title-Case phrases inside a retrieved definition are reported rather than silently leaving the bundle SUFFICIENT. */
const STRUCTURAL_CONTEXT_TYPES_FOR_FALLBACK_SCAN = new Set(["PARENT_SCOPE", "CHILD_RULE", "SIBLING_CONTEXT", "PROVISO", "EXCEPTION", "CONDITION", "SHARED_CAP", "DEFINITION", "DEFINITION_DEPENDENCY"]);

function retrieveCrossDocumentDependenciesForStructuralContext(state: RetrievalState, access: PackageAccess): void {
  for (const item of [...state.items.values()]) {
    if (!STRUCTURAL_CONTEXT_TYPES_FOR_FALLBACK_SCAN.has(item.type)) continue;
    // IPV-10: scan definition bodies for nested undefined Title-Case phrases.
    // High-confidence financial/covenant morphology → MEDIUM (sufficiency not
    // SUFFICIENT). Weaker phrases stay LOW so heading fragments and ordinary
    // document names do not refuse an otherwise complete certified path.
    const nestedInDefinition = item.type === "DEFINITION" || item.type === "DEFINITION_DEPENDENCY";
    retrieveCrossDocumentDefinitionFallback(state, access, item.documentId, item.excerptText, item.itemId, nestedInDefinition ? "NESTED" : "OPERATIVE");
  }
}

/** Cross-document/cross-instrument fallback for a Title-Case phrase mentioned in the operative text but NOT declared in the same document - task §9's "recursive definition dependencies" extended across documents (task §18/§21), always via the exact resolution order, never a whole-package search. */
function retrieveCrossDocumentDefinitionFallback(
  state: RetrievalState,
  access: PackageAccess,
  documentId: string,
  operativeText: string,
  operativeItemId: string,
  scanMode: "OPERATIVE" | "NESTED" = "OPERATIVE",
): void {
  const sameDocTerms = access.exactTermsByDocument.get(documentId) ?? new Map();
  const phrases = extractCandidatePhrases(operativeText);
  for (const phrase of phrases) {
    const normalized = phrase.toLowerCase();
    if (ADMINISTRATIVE_NESTED_DENYLIST.has(normalized) || isAdministrativeTerm(normalized)) continue;
    // Same-document exact match OR IPV-09 plural/inflected surface form of a declared term —
    // already handled by findKnownTermMentions; do not re-report as undefined.
    // Prefer phraseMatchesDeclaredTerm (shared with definition-graph); keep knownTermCoversPhrase as local mirror.
    if (phraseMatchesDeclaredTerm(phrase, sameDocTerms) || knownTermCoversPhrase(phrase, sameDocTerms)) continue;
    const resolved = access.packageGraph ? resolveCrossDocumentDefinition(documentId, normalized, access.exactTermsByDocument, access.packageGraph, new Map<string, PackageDocumentAccess>([[documentId, { index: access.index }]])) : undefined;
    if (resolved) {
      const baseText = access.index.getDefinitionFullText(resolved.exactTerm, resolved.documentId) ?? "";
      const fullText = operativeDefinitionText(state, access.index, resolved.documentId, resolved.exactTerm, baseText);
      if (fullText.trim().length === 0) continue;
      if (!withinBudget(state, fullText.length)) return;
      const evidenceState = resolveDefinitionEvidenceState(state, access.index, resolved.documentId, resolved.exactTerm);
      const item = addItem(state, makeItemInput("DEFINITION", resolved.documentId, null, null, resolved.exactTerm, `Definition of "${resolved.exactTerm}" (${resolved.documentId})`, fullText, `Term used in the covenant's own text but not declared in this document - resolved via ${resolved.resolutionPath}, never a whole-package search (task §21).`, 1, [operativeItemId], "PACKAGE_GRAPH", 0.8, evidenceState));
      addEdge(state, operativeItemId, item.itemId, "DEPENDS_ON_DEFINITION", `Cross-document definition dependency (${resolved.resolutionPath}).`);
    } else {
      // Only surfaced as unresolved if the phrase is not a common non-defined capitalized phrase - a conservative bar (>=2 words, appears at least once) already filters most false positives; still, this is reported as LOW severity since many such phrases are legitimately not defined terms at all (a proper noun, a party name).
      // Deduped per document+phrase (state.seenUnresolvedTermPhrases) since this function now runs once per retrieved item's own text (see retrieveCrossDocumentDependenciesForStructuralContext below) - the same real undeclared term can legitimately appear in more than one retrieved item.
      const seenKey = `${documentId}::${normalized}`;
      if (state.seenUnresolvedTermPhrases.has(seenKey)) continue;
      state.seenUnresolvedTermPhrases.add(seenKey);
      // Administrative boilerplate (Closing Date, etc.) and same-document section
      // captions ("Restricted Payments" naming SECTION 7.06) are not undefined
      // defined-term failures — disclose LOW so IPV-10 / IPV-15 cannot refuse on
      // boilerplate or covenant-category wording.
      // Match only the SECTION/ARTICLE heading caption (e.g. "Restricted Payments"
      // naming 7.06), never definition bodies under Section 1.01 — otherwise nested
      // undefined Consolidated* terms inside a ratio definition are demoted to LOW.
      const sectionCaption = access.index.allNodes().some((n) => {
        if (n.documentId !== documentId || (n.nodeType !== "SECTION" && n.nodeType !== "ARTICLE")) return false;
        const own = access.index.getNodeText(n.nodeId, "OWN");
        const headingLine = (own.split(/\n/)[0] ?? own).trim();
        const caption = headingLine.replace(/^(?:SECTION|ARTICLE)\s+\S+\s+/i, "").split(".")[0] ?? "";
        return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(caption);
      });
      let unresolvedSeverity: "LOW" | "MEDIUM" = scanMode === "NESTED" ? unresolvedSeverityForNestedPhrase(phrase) : "LOW";
      if (isAdministrativeTerm(normalized) || sectionCaption) unresolvedSeverity = "LOW";
      state.unresolved.push({
        originatingNodeKey: null,
        dependencyType: "UNRESOLVED_DEFINED_TERM",
        sourceText: phrase,
        attemptedResolution: "Checked documents amending/supplementing this one, the same instrument, and explicitly cross-referenced documents.",
        reason:
          unresolvedSeverity === "MEDIUM"
            ? "Nested high-confidence defined-term morphology inside a retrieved definition is not declared in this document or any related package document (IPV-10) — bundle cannot claim SUFFICIENT."
            : isAdministrativeTerm(normalized)
              ? "Administrative/boilerplate Title-Case phrase is not declared; disclosed at LOW severity (does not materially affect covenant analysis)."
            : scanMode === "NESTED"
              ? "Nested Title-Case phrase inside a retrieved definition is not declared in this document or any related package document (IPV-10 disclosure; LOW severity — not high-confidence financial/covenant morphology)."
              : "Not declared in this document, and no related document in the package declares it either.",
        candidateTargets: [],
        citation: phrase,
        severity: unresolvedSeverity,
      });
    }
  }
}

export function buildCovenantContextBundle(input: BuildContextBundleInput, access: PackageAccess): CovenantContextBundle {
  const start = Date.now();
  const budget = input.budget ?? DEFAULT_RETRIEVAL_BUDGET;
  const ownership = access.semanticUnitOwnership ? new Map<string, string[]>() : null;
  if (ownership && access.semanticUnitOwnership) for (const c of access.semanticUnitOwnership) { const anchor = c.structuralNodeIds[0]; if (anchor && c.discoveryId !== input.candidate.discoveryId) ownership.set(anchor, [...(ownership.get(anchor) ?? []), c.discoveryId].sort()); }
  const state = createRetrievalState(budget, access.operativeState, access.supersessionIndex, ownership);
  const { candidate } = input;
  const documentId = candidate.documentId;

  const primaryNodeId = candidate.structuralNodeIds[0];
  if (!primaryNodeId) {
    // No structural node at all - nothing to retrieve; report INCOMPLETE honestly rather than fabricating a bundle (never SUFFICIENT merely because there was nothing to traverse - task §25).
    state.unresolved.push({ originatingNodeKey: null, dependencyType: "OTHER", sourceText: candidate.normalizedSourceRef, attemptedResolution: "The discovered candidate carries no structural node identity at all.", reason: "Cannot retrieve context for a candidate with no anchoring structural node.", candidateTargets: [], citation: candidate.sourceCitation, severity: "HIGH" });
    return finalize(input, state, documentId, start);
  }

  const operativeItem = retrieveOperativeSource(state, access.index, documentId, primaryNodeId);
  if (!operativeItem) {
    state.unresolved.push({ originatingNodeKey: primaryNodeId, dependencyType: "OTHER", sourceText: candidate.normalizedSourceRef, attemptedResolution: `Looked up nodeId "${primaryNodeId}" in the structural index.`, reason: "The candidate's own structural node does not exist in the supplied index.", candidateTargets: [], citation: candidate.sourceCitation, severity: "HIGH" });
    return finalize(input, state, documentId, start);
  }

  // F1 - LINKED CONTEXT SOURCE-TYPING. The nodes after the anchor are Pass C's neighborhood LINKS
  // (discovery/pass-c-neighborhood.ts: the section an exception/basket/proviso/condition modifies),
  // not further operative source. Retrieving them as OPERATIVE_SOURCE told the compiler that the
  // whole containing section was this candidate's own operative text - the same mistake the
  // candidate-span contract (compiler/candidate-span.ts) fixed one layer up, and the one that let a
  // 54-character clause emit its parent's cap as though it owned it. They are retrieved here with
  // their text and citation unchanged, under the contextual type that describes what they actually
  // are: PARENT_SCOPE for a containing node, SIBLING_CONTEXT for a linked neighbour that is not an
  // ancestor. Nothing is dropped; only the ownership label changes.
  const ancestorIds = new Set(access.index.getAncestors(primaryNodeId).map((n) => n.nodeId));
  for (const extraNodeId of candidate.structuralNodeIds.slice(1)) {
    retrieveLinkedStructuralContext(state, access.index, documentId, extraNodeId, operativeItem.itemId, ancestorIds.has(extraNodeId));
  }

  retrieveParentScope(state, access.index, documentId, primaryNodeId, operativeItem.itemId);
  retrieveChildRules(state, access.index, documentId, primaryNodeId, operativeItem.itemId);
  retrieveSiblingContext(state, access.index, documentId, primaryNodeId, operativeItem.itemId);

  // IPV-04: definition / undeclared-term scans must use the same amendment-aware
  // operative text already bound on OPERATIVE_SOURCE (resolveOperativeSource),
  // not the base structural DESCENDANTS span. Empty excerpt (withheld / deleted)
  // means no definition scan — never re-read DESCENDANTS here (architecture:
  // only candidate-span.ts derives operative text from the anchor span).
  const operativeText = operativeItem.excerptText;
  retrieveDirectDefinitions(state, access.index, documentId, operativeText, operativeItem.itemId);
  retrieveCrossReferencesFromNode(state, access.index, documentId, primaryNodeId, operativeItem.itemId, 1, true, access.packageGraph);
  // INV-04 / main: inbound notwithstanding + article-level override leads.
  retrieveInboundOverrideReferences(state, access.index, documentId, primaryNodeId, operativeItem.itemId);
  retrieveArticleOverrideLeads(state, access.index, documentId, primaryNodeId, operativeItem.itemId);

  // Definition-fallback and reference-detection-within-definitions run
  // regardless of whether a package graph is available - an undeclared
  // term is a real UnresolvedDependency even in a single-document package
  // (task §32 test 10); only the CROSS-DOCUMENT resolution attempt inside
  // retrieveCrossDocumentDefinitionFallback itself is gated on
  // access.packageGraph existing (see that function's own check).
  retrieveCrossDocumentDefinitionFallback(state, access, documentId, operativeText, operativeItem.itemId);
  retrieveCrossDocumentDependenciesForStructuralContext(state, access);
  retrieveCrossDocumentDependenciesForDefinitions(state, access, documentId);

  if (access.packageGraph) {
    const sectionRef = access.index.getNodeById(primaryNodeId)?.sectionRef ?? candidate.normalizedSourceRef;
    retrieveAmendmentLeadsForSection(state, access.packageGraph, documentId, sectionRef, operativeItem.itemId);
    retrieveCrossDocumentReferenceLeads(state, access.packageGraph, documentId, operativeItem.itemId);
  }

  return finalize(input, state, documentId, start);
}

/**
 * Phase 3F.1.6.RX Workstream B (BLOCKER-2 real-consumer remediation).
 *
 * ROOT CAUSE (independent runtime trace, not merely re-reading 3F.1.6.R's
 * own prose): `DiscoveredCandidate.supersessionStatus`/`supersessionReason`
 * (BLOCKER-2's own fix in discovery/pass-d-reconcile.ts) already arrive
 * here on `input.candidate` - `BuildContextBundleInput.candidate` IS a
 * DiscoveredCandidate - but until this fix, `buildCovenantContextBundle`
 * never read either field: `retrieveOperativeSource` cites the candidate's
 * own structural node(s) via raw `StructuralIndex.getNodeText` with no
 * supersession check of any kind, and neither field was ever copied onto
 * the returned `CovenantContextBundle`. A KNOWN_SUPERSEDED candidate (Pass
 * A/D already independently confirmed its own governing text no longer
 * applies) therefore produced a bundle reporting `sufficiencyState:
 * "SUFFICIENT"` with no disclosure whatsoever - of the 3 real downstream
 * consumers BLOCKER-2's own certification named (context-retrieval,
 * coverage-audit's discovery-comparison.ts, semantic-coverage's
 * reconciliation.ts), NONE actually branches on
 * `DiscoveredCandidate.supersessionStatus` in production - confirmed by
 * direct grep, not assumption. This closes that gap for THIS consumer: a
 * KNOWN_SUPERSEDED candidate now genuinely degrades this bundle's own
 * sufficiencyState (a real behavioral effect, not decorative metadata),
 * and every bundle discloses the real status/reason it was already handed.
 *
 * Deliberately NOT flagged for UNKNOWN_SUPERSESSION_STATUS (the honest
 * "discovery itself had no real supersessionIndex" default) - matching
 * every other layer's own established discipline (source-inventory.ts,
 * semantic/tools.ts) of never treating "unknown" as an affirmatively
 * confirmed problem, only ever KNOWN_SUPERSEDED is.
 *
 * DISCLOSED COUPLING (see this phase's own 04-operative-supersession-
 * remediation.json): the ONE real production caller of
 * buildCovenantContextBundle, lib/contract-model/analysis/orchestrator.ts,
 * is Workstream H's own exclusive surface (BLOCKER-10/AUDIT-F1-F3/F6/F7) -
 * this fix makes the consumer itself genuinely supersession-aware (proven
 * by the new permanent test below), but until that orchestrator is also
 * updated to read `candidate.supersessionStatus` (it does not need to -
 * this fix requires no new parameter, since `candidate` is already its own
 * input) this real capability is exercised by the real function on every
 * real call, live or test - there is no additional wiring gap.
 */
function applySupersessionDisclosure(state: RetrievalState, candidate: BuildContextBundleInput["candidate"]): void {
  if (candidate.supersessionStatus !== "KNOWN_SUPERSEDED") return;
  state.unresolved.push({
    originatingNodeKey: candidate.structuralNodeKeys[0] ?? null,
    dependencyType: "SUPERSEDED_OPERATIVE_SOURCE",
    sourceText: candidate.normalizedSourceRef,
    attemptedResolution: "Read this candidate's own supersessionStatus, already computed by Pass A/D (discovery/pass-d-reconcile.ts) from a real NodeSupersessionIndex.",
    reason: `This bundle's own originating candidate is KNOWN_SUPERSEDED: ${candidate.supersessionReason}`,
    candidateTargets: [],
    citation: candidate.sourceCitation,
    severity: "HIGH",
  });
}

function finalize(input: BuildContextBundleInput, state: RetrievalState, documentId: string, start: number): CovenantContextBundle {
  const { candidate, packageKey, companyId, instrumentKey } = input;
  applySupersessionDisclosure(state, candidate);
  const sufficiencyState = computeSufficiencyState(state);

  // Phase 3F.1 FIX-2 (§4 of the governing fix spec) - computed from the
  // bundle's OWN items alone, independent of whether the model ever calls
  // any evidence tool. semantic/compile.ts and semantic-verification/
  // verify.ts both read this directly rather than re-scanning `items`
  // themselves, so there is exactly one place this decision is made.
  const unresolvedEvidenceItemIds = [...state.items.values()].filter((item) => item.evidenceState != null && !item.evidenceState.isCurrentTruth).map((item) => item.itemId);
  const contentIdentity = computeContentIdentity({
    discoveryId: candidate.discoveryId,
    discoveryRunVersion: candidate.discoveryRunVersion,
    retrievalAlgorithmVersion: RETRIEVAL_ALGORITHM_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    readSpans: state.readSpans,
  });

  return {
    bundleId: computeBundleId(packageKey, documentId, candidate.normalizedSourceRef),
    packageKey,
    companyId,
    instrumentKey,
    originatingDocumentId: documentId,
    originatingDiscoveryId: candidate.discoveryId,
    originatingStructuralNodeKeys: candidate.structuralNodeKeys,
    originatingStructuralNodeIds: candidate.structuralNodeIds,
    normalizedSourceRef: candidate.normalizedSourceRef,
    originatingFamilies: candidate.families,
    originatingSupersessionStatus: candidate.supersessionStatus,
    originatingSupersessionReason: candidate.supersessionReason,
    items: [...state.items.values()],
    edges: state.edges,
    unresolvedDependencies: state.unresolved,
    retrievalAlgorithmVersion: RETRIEVAL_ALGORITHM_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    contentIdentity,
    sufficiencyState,
    stopReasons: [...state.stopReasons],
    retrievalStops: state.retrievalStops,
    hasUnresolvedOperativeEvidence: unresolvedEvidenceItemIds.length > 0,
    unresolvedEvidenceItemIds,
    performance: {
      itemsConsidered: state.itemsConsidered,
      itemsRetained: state.items.size,
      duplicatePathsDeduplicated: state.duplicatePathsDeduplicated,
      maxDefinitionDepthReached: state.maxDefinitionDepthReached,
      maxCrossReferenceDepthReached: state.maxCrossReferenceDepthReached,
      crossReferenceTraversals: state.crossReferenceTraversals,
      crossDocumentLeads: state.crossDocumentLeads,
      deterministicWallClockMs: Date.now() - start,
      semanticWallClockMs: 0,
      semanticCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}
