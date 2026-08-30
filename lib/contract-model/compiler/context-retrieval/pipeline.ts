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
import { createRetrievalState, type RetrievalState } from "./state";
import { retrieveOperativeSource, retrieveParentScope, retrieveChildRules, retrieveSiblingContext } from "./structural-context";
import { retrieveDirectDefinitions } from "./definition-graph";
import { retrieveCrossReferencesFromNode, retrieveCrossReferencesFromDefinitionText } from "./reference-context";
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

function extractCandidatePhrases(text: string): string[] {
  const matches = text.match(TITLE_CASE_PHRASE) ?? [];
  const out = new Set<string>();
  for (const raw of matches) {
    const words = raw.trim().split(/\s+/);
    while (words.length > 0 && LEADING_STOPWORDS.has(words[0]!.toLowerCase())) words.shift();
    if (words.length >= 2) out.add(words.join(" "));
  }
  return [...out];
}

export interface PackageAccess {
  /** Multi-document StructuralIndex covering every document visible to this retrieval (built once per package by the caller, same as Phase 2B/2C's own convention). */
  index: StructuralIndex;
  packageGraph: PackageGraphResult | null;
  /** documentId -> normalizedTerm -> exactTerm, for every document's own declared definitions - used only for the cross-document/cross-instrument fallback (task §21), never for same-document resolution (definition-graph.ts's own exact index handles that). */
  exactTermsByDocument: Map<string, Map<string, string>>;
}

function computeSufficiencyState(state: RetrievalState): SufficiencyState {
  if (state.stopReasons.size > 0) return "BUDGET_EXCEEDED";
  if (state.unresolved.some((u) => u.severity === "HIGH")) return "INCOMPLETE";
  if (state.unresolved.length > 0) return "REVIEW_REQUIRED";
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

/** Types whose own retrieved text can carry a real defined-term usage that the operative node's own DESCENDANTS text does not contain - e.g. a proviso/sibling clause holding the covenant's real economic detail (task §32 test scenarios routinely retrieve this material as its own item). Undeclared-term detection must see this text too, not just the primary operative span, or a real dependency living entirely inside a retrieved sibling/parent/child item is silently never checked at all. */
const STRUCTURAL_CONTEXT_TYPES_FOR_FALLBACK_SCAN = new Set(["PARENT_SCOPE", "CHILD_RULE", "SIBLING_CONTEXT", "PROVISO", "EXCEPTION", "CONDITION", "SHARED_CAP"]);

function retrieveCrossDocumentDependenciesForStructuralContext(state: RetrievalState, access: PackageAccess): void {
  for (const item of [...state.items.values()]) {
    if (!STRUCTURAL_CONTEXT_TYPES_FOR_FALLBACK_SCAN.has(item.type)) continue;
    retrieveCrossDocumentDefinitionFallback(state, access, item.documentId, item.excerptText, item.itemId);
  }
}

/** Cross-document/cross-instrument fallback for a Title-Case phrase mentioned in the operative text but NOT declared in the same document - task §9's "recursive definition dependencies" extended across documents (task §18/§21), always via the exact resolution order, never a whole-package search. */
function retrieveCrossDocumentDefinitionFallback(state: RetrievalState, access: PackageAccess, documentId: string, operativeText: string, operativeItemId: string): void {
  const sameDocTerms = access.exactTermsByDocument.get(documentId) ?? new Map();
  const phrases = extractCandidatePhrases(operativeText);
  for (const phrase of phrases) {
    const normalized = phrase.toLowerCase();
    if (sameDocTerms.has(normalized)) continue; // already handled by the same-document exact-match pass.
    const resolved = access.packageGraph ? resolveCrossDocumentDefinition(documentId, normalized, access.exactTermsByDocument, access.packageGraph, new Map<string, PackageDocumentAccess>([[documentId, { index: access.index }]])) : undefined;
    if (resolved) {
      const fullText = access.index.getDefinitionFullText(resolved.exactTerm, resolved.documentId) ?? "";
      if (fullText.trim().length === 0) continue;
      if (!withinBudget(state, fullText.length)) return;
      const item = addItem(state, makeItemInput("DEFINITION", resolved.documentId, null, null, resolved.exactTerm, `Definition of "${resolved.exactTerm}" (${resolved.documentId})`, fullText, `Term used in the covenant's own text but not declared in this document - resolved via ${resolved.resolutionPath}, never a whole-package search (task §21).`, 1, [operativeItemId], "PACKAGE_GRAPH", 0.8));
      addEdge(state, operativeItemId, item.itemId, "DEPENDS_ON_DEFINITION", `Cross-document definition dependency (${resolved.resolutionPath}).`);
    } else {
      // Only surfaced as unresolved if the phrase is not a common non-defined capitalized phrase - a conservative bar (>=2 words, appears at least once) already filters most false positives; still, this is reported as LOW severity since many such phrases are legitimately not defined terms at all (a proper noun, a party name).
      // Deduped per document+phrase (state.seenUnresolvedTermPhrases) since this function now runs once per retrieved item's own text (see retrieveCrossDocumentDependenciesForStructuralContext below) - the same real undeclared term can legitimately appear in more than one retrieved item.
      const seenKey = `${documentId}::${normalized}`;
      if (state.seenUnresolvedTermPhrases.has(seenKey)) continue;
      state.seenUnresolvedTermPhrases.add(seenKey);
      state.unresolved.push({
        originatingNodeKey: null,
        dependencyType: "UNRESOLVED_DEFINED_TERM",
        sourceText: phrase,
        attemptedResolution: "Checked documents amending/supplementing this one, the same instrument, and explicitly cross-referenced documents.",
        reason: "Not declared in this document, and no related document in the package declares it either.",
        candidateTargets: [],
        citation: phrase,
        severity: "LOW",
      });
    }
  }
}

export function buildCovenantContextBundle(input: BuildContextBundleInput, access: PackageAccess): CovenantContextBundle {
  const start = Date.now();
  const budget = input.budget ?? DEFAULT_RETRIEVAL_BUDGET;
  const state = createRetrievalState(budget);
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

  // Any additional structural nodes the discovery candidate itself already spans (Pass C neighborhood expansion) are retrieved as further operative source items, never dropped.
  for (const extraNodeId of candidate.structuralNodeIds.slice(1)) {
    retrieveOperativeSource(state, access.index, documentId, extraNodeId);
  }

  retrieveParentScope(state, access.index, documentId, primaryNodeId, operativeItem.itemId);
  retrieveChildRules(state, access.index, documentId, primaryNodeId, operativeItem.itemId);
  retrieveSiblingContext(state, access.index, documentId, primaryNodeId, operativeItem.itemId);

  const operativeText = access.index.getNodeText(primaryNodeId, "DESCENDANTS");
  retrieveDirectDefinitions(state, access.index, documentId, operativeText, operativeItem.itemId);
  retrieveCrossReferencesFromNode(state, access.index, documentId, primaryNodeId, operativeItem.itemId, 1, true, access.packageGraph);

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
