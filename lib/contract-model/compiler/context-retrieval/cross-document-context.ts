/**
 * Phase 2D §18/§19/§20/§21 - cross-document retrieval, amendment leads
 * (never applied - task §19's "AMENDMENT_RESOLUTION_REQUIRED"), and
 * cross-instrument isolation (task §21's exact resolution order). Reuses
 * Phase 2C's own PackageGraphResult shape directly - no re-detection of
 * document relationships here.
 */
import type { StructuralIndex } from "../structural-index";
import type { InstrumentGroupingResult, ModificationCandidate, PackageGraphResult, RelationshipCandidate } from "../package-graph/types";
import { addEdge, addItem, makeItemInput, withinBudget, type RetrievalState } from "./state";

export interface PackageDocumentAccess {
  index: StructuralIndex;
}

/** Task §21's exact resolution order for a defined term NOT found in `fromDocumentId`'s own document: (1) same document already tried by the caller before this is ever invoked; (2) documents known to amend/restate/supplement fromDocumentId; (3) same instrument; (4) explicitly cross-referenced instrument; (5) otherwise unresolved. Never searches the whole package indiscriminately. */
export function resolveCrossDocumentDefinition(fromDocumentId: string, normalizedTerm: string, exactTermsByDocument: Map<string, Map<string, string>>, packageGraph: PackageGraphResult, documentAccess: Map<string, PackageDocumentAccess>): { documentId: string; exactTerm: string; resolutionPath: string } | undefined {
  const tryDocument = (documentId: string, pathLabel: string): { documentId: string; exactTerm: string; resolutionPath: string } | undefined => {
    const exact = exactTermsByDocument.get(documentId)?.get(normalizedTerm);
    return exact ? { documentId, exactTerm: exact, resolutionPath: pathLabel } : undefined;
  };

  // (2) documents that amend/restate/supplement fromDocumentId, per Phase 2C's own resolved relationship graph.
  const modifyingDocs = packageGraph.relationshipCandidates.filter((r: RelationshipCandidate) => r.status === "RESOLVED" && r.targetDocumentId === fromDocumentId && ["AMENDS", "RESTATES", "SUPPLEMENTS"].includes(r.relationshipType)).map((r) => r.sourceDocumentId);
  for (const docId of modifyingDocs) {
    const found = tryDocument(docId, `a document that amends/restates/supplements ${fromDocumentId}`);
    if (found) return found;
  }

  // (3) same instrument.
  const instrument = packageGraph.instruments.find((i: InstrumentGroupingResult) => i.documentIds.includes(fromDocumentId));
  if (instrument) {
    for (const docId of instrument.documentIds) {
      if (docId === fromDocumentId) continue;
      const found = tryDocument(docId, `another document in the same instrument (${instrument.name})`);
      if (found) return found;
    }
  }

  // (4) explicitly cross-referenced instrument (via a RESOLVED cross-document reference lead sourced from fromDocumentId or one of its own instrument's documents).
  const referencedDocIds = packageGraph.crossDocumentReferenceLeads.filter((l) => l.sourceDocumentId === fromDocumentId && l.status !== "UNRESOLVED" && l.targetDocumentId).map((l) => l.targetDocumentId!);
  for (const docId of referencedDocIds) {
    const found = tryDocument(docId, "an explicitly cross-referenced document/instrument");
    if (found) return found;
  }

  void documentAccess; // reserved for a future semantic-fallback path (none used in V1 - see pipeline.ts's own cost-justification header).
  return undefined;
}

/** Amendment/supplement leads targeting this covenant's own section, or a definition it depends on - never resolved into operative text (task §19). */
export function retrieveAmendmentLeadsForSection(state: RetrievalState, packageGraph: PackageGraphResult, documentId: string, sectionRef: string, parentItemId: string): void {
  const candidates = packageGraph.modificationCandidates.filter((mc: ModificationCandidate) => mc.targetDocumentId === documentId && mc.targetSectionRef === sectionRef);
  for (const mc of candidates) {
    addAmendmentLeadItem(state, packageGraph, mc, parentItemId);
  }
}

export function retrieveAmendmentLeadsForDefinition(state: RetrievalState, packageGraph: PackageGraphResult, documentId: string, exactTerm: string, parentItemId: string): void {
  const candidates = packageGraph.modificationCandidates.filter((mc: ModificationCandidate) => mc.targetDocumentId === documentId && mc.targetDefinedTermRef?.toLowerCase() === exactTerm.toLowerCase());
  for (const mc of candidates) {
    addAmendmentLeadItem(state, packageGraph, mc, parentItemId);
  }
}

function addAmendmentLeadItem(state: RetrievalState, packageGraph: PackageGraphResult, mc: ModificationCandidate, parentItemId: string): void {
  const sourceRel = packageGraph.relationshipCandidates.find((r) => r.sourceDocumentId === mc.sourceDocumentId && r.targetDocumentId === mc.targetDocumentId);
  const itemType = sourceRel?.relationshipType === "SUPPLEMENTS" ? "SUPPLEMENT_LEAD" : "AMENDMENT_LEAD";
  const excerpt = `[AMENDMENT_RESOLUTION_REQUIRED] ${mc.sourceNodeCitation}: ${mc.sourceText}`;
  if (!withinBudget(state, excerpt.length)) return;
  const item = addItem(state, makeItemInput(itemType, mc.sourceDocumentId, null, mc.targetSectionRef ?? mc.targetDefinedTermRef ?? "document-level", mc.sourceNodeCitation, excerpt, `A modification candidate from ${mc.sourceNodeCitation} appears to target this provision/definition - operative precedence is NOT determined here (task §19); flagged for the later amendment-precedence phase.`, 1, [parentItemId], "PACKAGE_GRAPH", mc.confidence));
  addEdge(state, item.itemId, parentItemId, "AMENDMENT_CANDIDATE", "Candidate amendment target - resolution required before treating as operative.");
  state.crossDocumentLeads++;
}

/** Cross-document reference leads (task §12/§18) sourced from this document - e.g. "subject to the Intercreditor Agreement." Included whenever resolved OR review-required; a fully unresolved lead becomes an UnresolvedDependency instead (task §26 - "referenced document absent from package"). */
export function retrieveCrossDocumentReferenceLeads(state: RetrievalState, packageGraph: PackageGraphResult, documentId: string, parentItemId: string): void {
  const leads = packageGraph.crossDocumentReferenceLeads.filter((l) => l.sourceDocumentId === documentId);
  for (const lead of leads) {
    if (lead.status === "UNRESOLVED") {
      state.unresolved.push({
        originatingNodeKey: null,
        dependencyType: "REFERENCED_DOCUMENT_ABSENT",
        sourceText: lead.referenceText,
        attemptedResolution: `Looked for a document matching "${lead.namedAgreementHint}" elsewhere in this package.`,
        reason: lead.unresolvedReason ?? "The referenced agreement is not part of this package.",
        candidateTargets: [],
        citation: lead.referenceText,
        severity: "MEDIUM",
      });
      continue;
    }
    const itemType = /intercreditor/i.test(lead.namedAgreementHint) ? "INTERCREDITOR_LEAD" : "CROSS_DOCUMENT_REFERENCE";
    const excerpt = `Reference to "${lead.namedAgreementHint}": ${lead.referenceText}`;
    if (!withinBudget(state, excerpt.length)) return;
    const item = addItem(state, makeItemInput(itemType, documentId, null, lead.namedAgreementHint, lead.referenceText, excerpt, `This document's own text references another agreement in the package (resolution status: ${lead.status}).`, 1, [parentItemId], "PACKAGE_GRAPH", lead.status === "RESOLVED" ? 0.9 : 0.5));
    addEdge(state, parentItemId, item.itemId, "CROSS_DOCUMENT_LEAD", `"${lead.referenceText}"`);
    state.crossDocumentLeads++;
  }
}
