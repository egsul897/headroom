/**
 * Phase 2E - independent context-expectation inventory (task §14/§15/§16/
 * §17/§18/§19/§20). Builds, from raw structural navigation ONLY, what
 * material context a covenant appears to need - parent scope, child
 * rules, signal-bearing siblings, definitions (and one level of nested
 * definitions), material cross-references, and amendment/cross-document
 * leads from Phase 2C's real package topology. Never reads a Phase 2D
 * CovenantContextBundle or its dependency lists while building this
 * inventory (comparison happens in context-comparison.ts, a separate
 * module that is allowed to read the bundle).
 *
 * Proviso/exception/condition/shared-cap keyword sets below are
 * independently authored for this module (task §18) - not imported from
 * context-retrieval/structural-context.ts.
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageGraphResult, ModificationCandidate, CrossDocumentReferenceLead } from "../package-graph/types";

const PROVISO_LIKE = [/\bprovided(?:,?\s+(?:that|further|however))\b/i, /\bnotwithstanding\b/i];
const EXCEPTION_LIKE = [/\bexcept(?:\s+that|\s+as)?\b/i, /\bother than\b/i];
const CONDITION_LIKE = [/\bin each case\b/i, /\bsubject to\b/i, /\bno (?:Default|Event of Default)\b/i, /\bso long as\b/i];
const SHARED_CAP_LIKE = [/\baggregate(?:d)?\s+(?:amount|cap|limit)\b/i, /\b(?:combined|shared)\s+(?:with|capacity|basket)\b/i, /\banti.?duplication\b/i];
const CALCULATION_LIKE = [/\bcalculat/i, /\bpro forma\b/i, /\binterpretation\b/i, /\baccounting principles\b/i, /\bTest Period\b/, /\bdetermination of\b/i, /\bmethodology\b/i];
// A bare mention of "Restricted Subsidiary"/"Loan Party" etc. is nearly
// universal in real credit-agreement covenant text and, tried alone,
// fires on almost every sibling clause regardless of whether that clause
// actually SCOPES the covenant to/away-from a particular entity category
// (measured directly against the real FWRG/LSB packages - see the final
// report's disclosed precision note). Requiring a scoping/exclusion
// phrase to co-occur with an entity-type term is a real, generalizable
// precision fix, not a package-specific one: a genuine entity-scope
// provision actually LIMITS or EXCLUDES which entities the covenant
// reaches ("applies only to", "excluding", "other than", "solely with
// respect to"), while an ordinary basket that merely happens to mention
// "Restricted Subsidiary" while describing WHO may take an action does not.
const ENTITY_TYPE_TERM = /\b(?:Restricted|Unrestricted) Subsidiar(?:y|ies)\b|\bLoan Part(?:y|ies)\b|\bWholly.?Owned Subsidiar(?:y|ies)\b|\bDomestic Subsidiar(?:y|ies)\b|\bForeign Subsidiar(?:y|ies)\b|\bImmaterial Subsidiar(?:y|ies)\b|\bNon.?Guarantor\b/i;
const SCOPING_PHRASE = /\b(?:applies? only to|shall apply only to|shall not apply to|excluding|other than|solely with respect to|solely applicable to)\b/i;
const ENTITY_SCOPE_LIKE = [new RegExp(`(${SCOPING_PHRASE.source})[^.;]{0,80}(${ENTITY_TYPE_TERM.source})|(${ENTITY_TYPE_TERM.source})[^.;]{0,80}(${SCOPING_PHRASE.source})`, "i")];

function anySignal(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export type IndependentSiblingRole = "PROVISO" | "EXCEPTION" | "CONDITION" | "SHARED_CAP" | "ENTITY_SCOPE";

export interface IndependentSiblingExpectation {
  nodeKey: string;
  sectionRef: string;
  role: IndependentSiblingRole;
}

export interface IndependentDefinitionExpectation {
  exactTerm: string;
  normalizedTerm: string;
  depth: number;
}

export interface IndependentCrossReferenceExpectation {
  normalizedTarget: string;
  material: boolean;
  reason: string;
}

export interface IndependentAmendmentExpectation {
  modification: ModificationCandidate;
}

export interface IndependentCrossDocumentExpectation {
  lead: CrossDocumentReferenceLead;
}

export interface IndependentContextExpectations {
  parentSectionRefs: string[];
  childSectionRefs: string[];
  siblings: IndependentSiblingExpectation[];
  definitions: IndependentDefinitionExpectation[];
  crossReferences: IndependentCrossReferenceExpectation[];
  amendmentLeads: IndependentAmendmentExpectation[];
  crossDocumentLeads: IndependentCrossDocumentExpectation[];
}

// A small, generic, disclosed set of boilerplate defined terms that
// appear in virtually every real financing document (never
// package-specific) - independently authored for this module rather than
// imported from definition-graph.ts's own denylist, but the same generic
// category of administrative/legal-boilerplate term that does not
// materially affect covenant analysis (measured directly: without this,
// "Code" alone produced a false MISSING_DEFINITION finding against every
// real FWRG/LSB covenant that happens to mention it).
const ADMINISTRATIVE_TERM_DENYLIST = new Set(["person", "business day", "governmental authority", "requirements of law", "us", "united states", "dollars", "administrative agent", "collateral agent", "lender", "agent", "closing date", "code", "gaap"]);

function collectDefinitionsRecursive(index: StructuralIndex, documentId: string, text: string, seen: Set<string>, depth: number, maxDepth: number, out: IndependentDefinitionExpectation[]): void {
  if (depth > maxDepth) return;
  for (const def of index.allDefinitions()) {
    if (def.documentId !== documentId) continue;
    if (seen.has(def.normalizedTerm)) continue;
    if (ADMINISTRATIVE_TERM_DENYLIST.has(def.normalizedTerm)) continue;
    const escaped = def.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`);
    if (!re.test(text)) continue;
    seen.add(def.normalizedTerm);
    out.push({ exactTerm: def.exactTerm, normalizedTerm: def.normalizedTerm, depth });
    const fullText = index.getDefinitionFullText(def.exactTerm, documentId) ?? "";
    if (fullText) collectDefinitionsRecursive(index, documentId, fullText, seen, depth + 1, maxDepth, out);
  }
}

export function buildIndependentContextExpectations(documentId: string, nodeKey: string, index: StructuralIndex, packageGraph: PackageGraphResult | null): IndependentContextExpectations {
  const parentSectionRefs = index.getAncestors(nodeKey).filter((n) => n.nodeType !== "ARTICLE").map((n) => n.sectionRef);
  const childSectionRefs = index.getChildren(nodeKey).map((n) => n.sectionRef);

  const siblings: IndependentSiblingExpectation[] = [];
  for (const sib of index.getSiblings(nodeKey)) {
    // A sibling that is itself a top-level ARTICLE/SECTION is a distinct,
    // separate covenant (a different Section 6.0X entirely), never a
    // trailing proviso/exception/condition/shared-cap/entity-scope
    // modifier of the AUDITED covenant - only CLAUSE-level siblings within
    // the same enclosing section are ever genuine modifiers. Skipping
    // SECTION/ARTICLE siblings avoids a real false-positive class this
    // phase's own FWRG/LSB audit run surfaced (e.g. auditing top-level
    // Section 6.07 previously flagged unrelated Section 6.01's own
    // "except:" wording as a "missing exception" for 6.07 - measured and
    // fixed here as a generic, non-package-specific precision fix).
    if (sib.nodeType === "SECTION" || sib.nodeType === "ARTICLE") continue;
    const text = index.getNodeText(sib.nodeKey, "OWN");
    if (anySignal(text, SHARED_CAP_LIKE)) siblings.push({ nodeKey: sib.nodeKey, sectionRef: sib.sectionRef, role: "SHARED_CAP" });
    else if (anySignal(text, PROVISO_LIKE)) siblings.push({ nodeKey: sib.nodeKey, sectionRef: sib.sectionRef, role: "PROVISO" });
    else if (anySignal(text, EXCEPTION_LIKE)) siblings.push({ nodeKey: sib.nodeKey, sectionRef: sib.sectionRef, role: "EXCEPTION" });
    else if (anySignal(text, CONDITION_LIKE)) siblings.push({ nodeKey: sib.nodeKey, sectionRef: sib.sectionRef, role: "CONDITION" });
    else if (anySignal(text, ENTITY_SCOPE_LIKE)) siblings.push({ nodeKey: sib.nodeKey, sectionRef: sib.sectionRef, role: "ENTITY_SCOPE" });
  }

  const operativeText = index.getNodeText(nodeKey, "DESCENDANTS");
  const definitions: IndependentDefinitionExpectation[] = [];
  collectDefinitionsRecursive(index, documentId, operativeText, new Set(), 1, 3, definitions);

  // Note: DetectedReference.charStart/charEnd are absolute offsets into the
  // FULL document text, while `operativeText` (getNodeText DESCENDANTS) is
  // a re-based substring starting at 0 - so a reference's own charStart
  // cannot be sliced directly against operativeText without first
  // subtracting the node's own charStart. Rather than thread that
  // bookkeeping through here, this independent classifier conservatively
  // checks for a calculation/interpretation signal ANYWHERE in the
  // covenant's own operative text - coarser than per-reference proximity,
  // but never silently wrong from an offset mismatch, and still
  // distinguishes a calculation-bearing covenant from a purely
  // administrative one (task §17).
  const hasCalculationSignal = anySignal(operativeText, CALCULATION_LIKE);
  const crossReferences: IndependentCrossReferenceExpectation[] = index.findReferencesFrom(nodeKey, true).map((ref) => ({
    normalizedTarget: ref.normalizedTarget,
    material: hasCalculationSignal,
    reason: hasCalculationSignal ? "the covenant's own operative text carries a calculation/interpretation signal" : "no calculation/interpretation signal in the covenant's own operative text - administrative in nature",
  }));

  const allSectionRefs = new Set([index.getNode(nodeKey)?.sectionRef, ...parentSectionRefs].filter((x): x is string => !!x));
  const definedTermSet = new Set(definitions.map((d) => d.normalizedTerm));
  const amendmentLeads: IndependentAmendmentExpectation[] =
    packageGraph?.modificationCandidates
      .filter((m) => (m.targetSectionRef && [...allSectionRefs].some((ref) => m.targetSectionRef === ref || m.targetSectionRef?.startsWith(ref + "("))) || (m.targetDefinedTermRef && definedTermSet.has(m.targetDefinedTermRef.toLowerCase().replace(/\s+/g, " ").trim())))
      .map((modification) => ({ modification })) ?? [];

  const crossDocumentLeads: IndependentCrossDocumentExpectation[] =
    packageGraph?.crossDocumentReferenceLeads
      .filter((lead) => lead.sourceDocumentId === documentId && anySignal(operativeText, [new RegExp(lead.namedAgreementHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")]))
      .map((lead) => ({ lead })) ?? [];

  return { parentSectionRefs, childSectionRefs, siblings, definitions, crossReferences, amendmentLeads, crossDocumentLeads };
}
