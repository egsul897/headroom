/**
 * F-4 (Phase 3 Chewy remediation) - AUTHENTICATED RETRIEVED-SOURCE EVIDENCE.
 *
 * Root cause it closes (docs/phase-3-remediation-f4/00-diagnosis-and-reproduction.json, classification A with
 * consequence C): the compiler may legitimately retrieve source that lies OUTSIDE the candidate's operative window
 * (a defined term's definition, a cross-referenced section) via its bounded evidence tools, and compile IR from it.
 * The verifier inventoried only the operative window, so every figure that the IR correctly took from such a
 * retrieved definition was reported IR_ONLY / UNSUPPORTED_IR_ADDITION (MATERIAL) - a false discrepancy - while the
 * only trace of the retrieval was a compiler-written summary and a compiler-written IR excerpt, neither of which the
 * verifier may trust.
 *
 * ARCHITECTURE (mission §3): compiler may retrieve source -> the retrieved source is AUTHENTICATED against the
 * document / version / span -> authenticated evidence is made available to the verifier -> the verifier
 * INDEPENDENTLY compares the IR against that raw source. Concretely this module:
 *
 *   1. collects retrieval REQUESTS from two places - the compiler's tool-call log (a compiler CLAIM: "I retrieved
 *      the definition of X") and the IR itself (an IRDefinition for term X; an IR value whose provenance cites
 *      "Definition of X") - and records the full linkage chain for each;
 *   2. RE-RESOLVES every request itself through the verifier's own allowed inputs only: the structural index,
 *      Phase 2G operative state (amendment/version precedence is reused, never re-implemented) and package topology
 *      (this instrument's documents only - never another instrument's, never another company's);
 *   3. runs authentication checks A-G (document in package; span resolves; raw text byte-identical to the document
 *      slice; content hash equals any compiler-recorded hash; operative/current version; not an unrelated document;
 *      span in bounds). A failure REJECTS the evidence - the verifier never falls back to compiler metadata;
 *   4. builds a numeric inventory over each AUTHENTICATED text (the same verifier-side parser used for the local
 *      window), tagged AUTHENTICATED_RETRIEVED with the evidence id and scope, for reconciliation.ts, which admits
 *      a retrieved figure only for IR values explicitly scoped to that evidence (owner definition term / provenance
 *      citation / section) - no global numeric pooling across sources.
 *
 * TRUST INVARIANTS (mission §21): the compiler's RetrievedSourceRecord.rawText is never inventoried, never shown to
 * the reviewer and never used as a fallback - it is only compared against what this module resolved itself. A
 * compiler claim whose recorded text/hash/document differs from the authentic source is a REJECTED claim and a
 * review item. Compiler IR excerpts and outputSummary strings are never evidence. Nothing here is specific to any
 * defined term, section, company or package (Architecture Invariants #29) - "Threshold Amount" is one instance of
 * the generic "definition retrieved via tool" shape.
 *
 * Independence: this file imports only amendment/operative-state (an allowed input - operative contract state),
 * the structural index types, hashing, and this module's own inventory builder. It never imports the compiler.
 */
import { resolveOperativeDefinitionEvidence, resolveOperativeSectionEvidence, resolveUniqueDefinitionByRef, normalizeDefinedTermRef } from "../amendment/operative-state";
import type { NodeSupersessionIndex } from "../amendment/types";
import { computeSourceContentHash, hashParts } from "../hashing";
import type { RetrievedSourceRecord, SemanticToolAccess } from "../semantic/types";
import type { StructuralIndex } from "../structural-index";
import { buildSourceInventory } from "./source-inventory";
import type { AdmissibleEvidenceSet, AuthenticatedSourceEvidence, AuthenticationCheck, IrInventory, RejectedRetrievalClaim, RetrievalLinkage, RetrievedEvidenceInventory, RetrievedEvidenceInventoryEntry, SourceInventoryItem, VerificationInput } from "./types";

export const RETRIEVED_EVIDENCE_ALGORITHM_VERSION = "phase-3-f4-retrieved-evidence.v1";

/** Normalized scope identity of a defined term (lowercase, whitespace-collapsed) - the same normalization Phase 2G uses for definedTermRef. */
export function normalizeTermScopeKey(term: string): string {
  return normalizeDefinedTermRef(term);
}

/** Normalized scope identity of a section reference: a leading "Section"/"§"/"Sec." label and all whitespace removed, lowercased ("Section 6.01(b)" -> "6.01(b)"). */
export function normalizeSectionScopeKey(ref: string): string {
  return ref.replace(/^\s*(?:section|sec\.?|§)\s*/i, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * The document ids retrieval may resolve against: this candidate's own instrument as grouped by Phase 2C's package
 * graph (package topology is an allowed input), home document first; "home document only" when no package graph
 * exists. Never widened - a definition living in another instrument's or another company's document is never
 * admissible for this candidate (mission §18).
 */
export function packageDocumentIds(toolAccess: Pick<SemanticToolAccess, "packageGraph">, homeDocumentId: string): string[] {
  const instrument = toolAccess.packageGraph?.instruments.find((i) => i.documentIds.includes(homeDocumentId));
  const ids = instrument ? instrument.documentIds : [homeDocumentId];
  return [homeDocumentId, ...ids.filter((d) => d !== homeDocumentId)];
}

/** An IR provenance citation "names a definition" only in the explicit "Definition of X" / "X (definition)" / `"X"` shapes - a bare mention of a term inside a longer citation never scopes evidence to it (collision safety). */
export function citationNamesDefinition(citation: string, termScopeKey: string): boolean {
  const c = citation.replace(/[“”"']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (c === termScopeKey) return true;
  const escaped = termScopeKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)definition of ${escaped}(?:\\b|$)`).test(c) || new RegExp(`^${escaped} \\(?definition\\)?(?:\\b|$)`).test(c) || new RegExp(`^${escaped} \\(retrieved`).test(c);
}

/** An IR provenance citation is scoped to a retrieved section when, after normalization, it is that section or a sub-clause of it ("§6.01(b)(iii)" is within "6.01(b)"). */
export function citationNamesSection(citation: string, sectionScopeKey: string): boolean {
  const c = normalizeSectionScopeKey(citation.replace(/[“”"']/g, ""));
  return c === sectionScopeKey || c.startsWith(`${sectionScopeKey}(`);
}

interface RetrievalRequest {
  requestKind: "DEFINITION" | "PROVISION";
  requestKey: string;
  scopeKey: string;
  linkage: RetrievalLinkage[];
  compilerRecords: { toolCallIndex: number; record: RetrievedSourceRecord }[];
  claimedByCompiler: boolean;
  representedDefinitionIds: string[];
  representedDefinitionHasExpression: boolean;
}

/** Definition-of-X citation extraction ("Definition of \"Threshold Amount\" (retrieved via tool)" -> "Threshold Amount"). */
function definitionTermFromCitation(citation: string): string | null {
  const m = citation.match(/definition of\s+["“]?([^"”()]+?)["”]?\s*(?:\(|$)/i);
  return m ? m[1]!.trim() : null;
}

function collectRequests(input: VerificationInput, irInventory: IrInventory): RetrievalRequest[] {
  const { compilationResult } = input;
  const byKey = new Map<string, RetrievalRequest>();
  const upsert = (requestKind: "DEFINITION" | "PROVISION", requestKey: string, link: RetrievalLinkage): RetrievalRequest => {
    const scopeKey = requestKind === "DEFINITION" ? normalizeTermScopeKey(requestKey) : normalizeSectionScopeKey(requestKey);
    const id = `${requestKind}:${scopeKey}`;
    let req = byKey.get(id);
    if (!req) {
      req = { requestKind, requestKey, scopeKey, linkage: [], compilerRecords: [], claimedByCompiler: false, representedDefinitionIds: [], representedDefinitionHasExpression: false };
      byKey.set(id, req);
    }
    req.linkage.push(link);
    return req;
  };

  // (1) compiler tool-call log - CLAIMS. A refusal returned no text and is not a retrieval claim.
  compilationResult.toolCallLog.forEach((entry, i) => {
    if (entry.charsReturned <= 0 || entry.outputSummary.startsWith("refused")) return;
    const inp = (entry.input ?? {}) as Record<string, unknown>;
    let requestKind: "DEFINITION" | "PROVISION" | null = null;
    let requestKey: string | null = null;
    if (entry.toolName === "getDefinition" && typeof inp.term === "string") { requestKind = "DEFINITION"; requestKey = inp.term; }
    else if (entry.toolName === "getReferencedProvision" && typeof inp.ref === "string") { requestKind = "PROVISION"; requestKey = inp.ref; }
    else if (entry.toolName === "getOperativeProvision" && typeof inp.sectionRef === "string") { requestKind = "PROVISION"; requestKey = inp.sectionRef; }
    if (!requestKind || !requestKey) return;
    const req = upsert(requestKind, requestKey, { origin: "COMPILER_TOOL_CALL", detail: `toolCallLog[${i}] ${entry.toolName} ${JSON.stringify(entry.input)}`, compilerRecordedContentHash: entry.retrievedSource?.contentHash ?? null });
    req.claimedByCompiler = true;
    if (entry.retrievedSource) req.compilerRecords.push({ toolCallIndex: i, record: entry.retrievedSource });
  });

  // (2) IR definitions - the IR claims to REPRESENT this term; its authentic definition is compared both ways.
  compilationResult.definitions.forEach((def, i) => {
    const req = upsert("DEFINITION", def.termName, { origin: "IR_DEFINITION_TERM", detail: `definitions[${i}].termName = ${JSON.stringify(def.termName)}`, compilerRecordedContentHash: null });
    req.representedDefinitionIds.push(def.definitionId);
    if (def.calculationExpression !== null) req.representedDefinitionHasExpression = true;
  });

  // (3) IR numeric values whose own provenance cites "Definition of X" - the IR itself names the source it took the
  // value from; that named definition is resolved so the claim can be checked against the authentic text.
  for (const item of irInventory.items) {
    if (item.kind !== "AMOUNT" && item.kind !== "PERCENT" && item.kind !== "RATIO") continue;
    if (!item.sourceCitation) continue;
    const term = definitionTermFromCitation(item.sourceCitation);
    if (!term) continue;
    upsert("DEFINITION", term, { origin: "IR_PROVENANCE_CITATION", detail: `${item.irPath}.provenance.sourceCitation = ${JSON.stringify(item.sourceCitation)}`, compilerRecordedContentHash: null });
  }

  return [...byKey.values()];
}

interface ResolvedText {
  documentId: string;
  documentVersion: "BASE_DOCUMENT" | "AMENDED_OPERATIVE";
  /** The admitted evidence text (for a base-document definition: the served text bounded to its enclosing section - see boundDefinitionSpan). */
  text: string;
  /** The text the compiler's tool serves for this request (StructuralIndex.getDefinitionFullText / getNodeText("OWN") / the operative view's currentText) - what a RetrievedSourceRecord.rawText must equal. Same as `text` unless a definition was bounded. */
  servedText: string;
  sourceNodeId: string | null;
  sourceNodeKey: string | null;
  charStart: number | null;
  charEnd: number | null;
  evidenceStatus: string;
  isCurrentTruth: boolean;
  unresolvedIssues: string[];
}

type Resolution = { ok: true; resolved: ResolvedText } | { ok: false; documentId: string | null; reason: string };

function resolveDefinitionRequest(req: RetrievalRequest, index: StructuralIndex, toolAccess: SemanticToolAccess, packageDocs: string[], supersessionIndex: NodeSupersessionIndex): Resolution {
  const res = resolveOperativeDefinitionEvidence({ index, operativeState: toolAccess.operativeState, term: req.requestKey, searchDocumentIds: packageDocs, supersessionIndex });
  if (res.outcome === "NOT_FOUND") return { ok: false, documentId: null, reason: res.reason };
  if (res.outcome === "AMBIGUOUS") return { ok: false, documentId: res.documentId, reason: res.reason };
  if (res.text === null) return { ok: false, documentId: res.documentId, reason: `definition "${req.requestKey}" resolved with no confirmable text (status ${res.status}${res.unresolvedIssues.length ? `: ${res.unresolvedIssues.join("; ")}` : ""})` };
  if (res.source === "base-document") {
    const located = resolveUniqueDefinitionByRef(index, res.documentId, req.requestKey);
    if (located.status !== "UNIQUE") return { ok: false, documentId: res.documentId, reason: `definition "${req.requestKey}" text resolved but its physical location did not resolve uniquely (${located.status})` };
    const def = located.definition;
    const text = boundDefinitionText(index, def.sourceNodeId, def.charStart, res.text);
    return { ok: true, resolved: { documentId: res.documentId, documentVersion: "BASE_DOCUMENT", text, servedText: res.text, sourceNodeId: def.sourceNodeId, sourceNodeKey: def.sourceNodeKey, charStart: def.charStart, charEnd: def.charStart + text.length, evidenceStatus: res.status, isCurrentTruth: res.isCurrentTruth, unresolvedIssues: res.unresolvedIssues } };
  }
  const view = toolAccess.operativeState?.provisions.find((p) => p.kind === "DEFINITION" && normalizeDefinedTermRef(p.definedTermRef ?? "") === req.scopeKey) ?? null;
  return { ok: true, resolved: { documentId: res.documentId, documentVersion: "AMENDED_OPERATIVE", text: res.text, servedText: res.text, sourceNodeId: view?.currentSourceNodeId ?? null, sourceNodeKey: view?.currentSourceNodeKey ?? null, charStart: null, charEnd: null, evidenceStatus: res.status, isCurrentTruth: res.isCurrentTruth, unresolvedIssues: res.unresolvedIssues } };
}

/**
 * The structural index slices a definition's text "from its declaration to the next detected definition". For the
 * LAST definition before a stretch with no detected definitions (e.g. the final term of Article I), that slice runs
 * on into later articles. The verifier admits a definition's text only up to the end of the SECTION that encloses
 * its declaration (a definition never extends beyond its own section) - a generic structural bound, independent of
 * any term. The compiler record is still compared against the SERVED (unbounded) text, since that is what the tool
 * actually returned (see authenticate's D check).
 */
function boundDefinitionText(index: StructuralIndex, sourceNodeId: string | null, charStart: number, servedText: string): string {
  if (!sourceNodeId) return servedText;
  const node = index.getNodeById(sourceNodeId);
  if (!node) return servedText;
  const chain = [node, ...index.getAncestors(sourceNodeId)];
  const section = chain.find((n) => n.nodeType === "SECTION") ?? chain.find((n) => n.nodeType === "ARTICLE") ?? null;
  if (!section || section.charEnd <= charStart) return servedText;
  const maxLength = section.charEnd - charStart;
  return servedText.length > maxLength ? servedText.slice(0, maxLength) : servedText;
}

function resolveProvisionRequest(req: RetrievalRequest, index: StructuralIndex, toolAccess: SemanticToolAccess, packageDocs: string[], supersessionIndex: NodeSupersessionIndex): Resolution {
  const ref = req.requestKey.replace(/^\s*(?:section|sec\.?|§)\s*/i, "").trim();
  const hits: { documentId: string; node: { nodeId: string; nodeKey: string; sectionRef: string; charStart: number } }[] = [];
  for (const documentId of packageDocs) {
    const r = index.resolveUniqueNodeByRef(documentId, ref);
    if (r.status === "AMBIGUOUS") return { ok: false, documentId, reason: `section "${req.requestKey}" matches ${r.candidates.length} physical locations in document "${documentId}" - not uniquely resolvable` };
    if (r.status === "UNIQUE") hits.push({ documentId, node: r.node });
  }
  if (hits.length === 0) return { ok: false, documentId: null, reason: `section "${req.requestKey}" did not resolve to any section within this instrument's documents` };
  if (hits.length > 1) return { ok: false, documentId: null, reason: `section "${req.requestKey}" resolves in ${hits.length} documents of this instrument (${hits.map((h) => h.documentId).join(", ")}) - not uniquely resolvable` };
  const { documentId, node } = hits[0]!;
  const res = resolveOperativeSectionEvidence({ operativeState: toolAccess.operativeState, documentId, node, supersessionIndex });
  if (res.outcome !== "FOUND") return { ok: false, documentId, reason: res.reason };
  if (res.source === "amended") {
    if (res.text === null) return { ok: false, documentId, reason: `section "${req.requestKey}" has recorded amendment activity but no confirmable current text (status ${res.status})` };
    const view = toolAccess.operativeState?.provisions.find((p) => p.kind === "SECTION" && (p.sectionRef ?? "").replace(/\s+/g, "") === node.sectionRef.replace(/\s+/g, "")) ?? null;
    return { ok: true, resolved: { documentId: res.documentId, documentVersion: "AMENDED_OPERATIVE", text: res.text, servedText: res.text, sourceNodeId: view?.currentSourceNodeId ?? node.nodeId, sourceNodeKey: view?.currentSourceNodeKey ?? node.nodeKey, charStart: null, charEnd: null, evidenceStatus: res.status, isCurrentTruth: res.isCurrentTruth, unresolvedIssues: res.unresolvedIssues } };
  }
  const text = index.getNodeText(node.nodeId, "OWN");
  return { ok: true, resolved: { documentId, documentVersion: "BASE_DOCUMENT", text, servedText: text, sourceNodeId: node.nodeId, sourceNodeKey: node.nodeKey, charStart: node.charStart, charEnd: node.charStart + text.length, evidenceStatus: res.status, isCurrentTruth: res.isCurrentTruth, unresolvedIssues: res.unresolvedIssues } };
}

/** Authentication checks A-G over an independently resolved text. Every check runs (the record shows all of them); AUTHENTICATED iff all pass. */
function authenticate(req: RetrievalRequest, resolved: ResolvedText, index: StructuralIndex, packageDocs: string[]): { checks: AuthenticationCheck[]; contentHash: string; compilerMatched: boolean | null } {
  const checks: AuthenticationCheck[] = [];
  const contentHash = computeSourceContentHash(resolved.text);

  checks.push({ code: "A_DOCUMENT_IN_PACKAGE", passed: packageDocs.includes(resolved.documentId), detail: packageDocs.includes(resolved.documentId) ? `document "${resolved.documentId}" belongs to this instrument's package [${packageDocs.join(", ")}]` : `document "${resolved.documentId}" is not one of this instrument's documents [${packageDocs.join(", ")}]` });
  checks.push({ code: "B_SPAN_RESOLVES", passed: resolved.text.length > 0, detail: resolved.text.length > 0 ? `${req.requestKind.toLowerCase()} "${req.requestKey}" resolved to ${resolved.documentVersion === "BASE_DOCUMENT" ? `node ${resolved.sourceNodeId ?? "(none)"} span [${resolved.charStart}, ${resolved.charEnd})` : `amendment-recorded current text (node ${resolved.sourceNodeId ?? "(none)"})`}` : "resolved text is empty" });

  if (resolved.documentVersion === "BASE_DOCUMENT") {
    const docText = index.getDocumentText(resolved.documentId);
    const inBounds = docText !== undefined && resolved.charStart !== null && resolved.charEnd !== null && resolved.charStart >= 0 && resolved.charStart < resolved.charEnd && resolved.charEnd <= docText.length;
    checks.push({ code: "G_SPAN_IN_BOUNDS", passed: inBounds, detail: inBounds ? `span [${resolved.charStart}, ${resolved.charEnd}) lies within document "${resolved.documentId}" (${docText!.length} chars)` : `span [${resolved.charStart}, ${resolved.charEnd}) is outside document "${resolved.documentId}" (${docText?.length ?? "no text"} chars)` });
    const slice = inBounds ? docText!.slice(resolved.charStart!, resolved.charEnd!) : null;
    const rawMatch = slice !== null && slice === resolved.text;
    checks.push({ code: "C_RAW_TEXT_MATCH", passed: rawMatch, detail: rawMatch ? `resolved text is byte-identical to document.text.slice(${resolved.charStart}, ${resolved.charEnd})` : "resolved text does not equal the document slice at the resolved span" });
  } else {
    checks.push({ code: "G_SPAN_IN_BOUNDS", passed: true, detail: "amendment-recorded current text (Phase 2G operative state) - no base-document span to bound" });
    checks.push({ code: "C_RAW_TEXT_MATCH", passed: true, detail: "text is the operative state's own recorded current text for this provision (Phase 2G fact, not a compiler claim)" });
  }

  let compilerMatched: boolean | null = null;
  if (req.compilerRecords.length === 0) {
    checks.push({ code: "D_HASH_MATCH", passed: true, detail: `no compiler retrieval record for this request (legacy tool log or IR-derived request) - content hash ${contentHash} computed independently from the resolved text` });
    checks.push({ code: "F_NOT_UNRELATED_DOCUMENT", passed: true, detail: "no compiler-recorded document/node identity to compare - resolved within the package by this verifier alone" });
  } else {
    const servedHash = resolved.servedText === resolved.text ? contentHash : computeSourceContentHash(resolved.servedText);
    const mismatches = req.compilerRecords.filter(({ record }) => record.contentHash !== servedHash || record.rawText !== resolved.servedText);
    compilerMatched = mismatches.length === 0;
    const bounded = resolved.servedText !== resolved.text ? ` (the served text was ${resolved.servedText.length} chars; the admitted evidence is bounded to its enclosing section, ${resolved.text.length} chars, hash ${contentHash})` : "";
    checks.push({ code: "D_HASH_MATCH", passed: compilerMatched, detail: compilerMatched ? `compiler-recorded content hash ${servedHash} and raw text match the independently resolved text (${req.compilerRecords.length} record(s))${bounded}` : `compiler-recorded text/hash differs from the authentic source (recorded ${mismatches.map((m) => m.record.contentHash).join(", ")} vs authentic ${servedHash}) - the compiler was not shown this text as it exists` });
    const unrelated = req.compilerRecords.filter(({ record }) => record.documentId !== resolved.documentId || (record.sourceNodeId !== null && resolved.sourceNodeId !== null && record.sourceNodeId !== resolved.sourceNodeId));
    checks.push({ code: "F_NOT_UNRELATED_DOCUMENT", passed: unrelated.length === 0, detail: unrelated.length === 0 ? `compiler-recorded document/node (${resolved.documentId} / ${resolved.sourceNodeId ?? "(none)"}) is the same source this verifier resolved` : `compiler claims text from ${unrelated.map((u) => `${u.record.documentId} / ${u.record.sourceNodeId ?? "(none)"}`).join(", ")} but the authentic source for this request is ${resolved.documentId} / ${resolved.sourceNodeId ?? "(none)"}` });
  }

  checks.push({ code: "E_OPERATIVE_VERSION", passed: resolved.isCurrentTruth, detail: resolved.isCurrentTruth ? `confirmed current operative text (${resolved.evidenceStatus}, ${resolved.documentVersion})` : `not confirmed current (${resolved.evidenceStatus}${resolved.unresolvedIssues.length ? `: ${resolved.unresolvedIssues.join("; ")}` : ""}) - stale/superseded/unresolved source is never admitted` });

  return { checks, contentHash, compilerMatched };
}

/** Absolute offset of the candidate's operative window within its document, when it can be established (explicit operativeCharStart, else a unique substring match). Null when unknown. */
function localWindowSpan(input: VerificationInput, index: StructuralIndex): { charStart: number; charEnd: number } | null {
  const { compilerInput } = input;
  const text = compilerInput.operativeSourceText;
  if (typeof compilerInput.operativeCharStart === "number" && compilerInput.operativeCharStart >= 0) return { charStart: compilerInput.operativeCharStart, charEnd: compilerInput.operativeCharStart + text.length };
  const doc = index.getDocumentText(compilerInput.sourceDocumentId);
  if (!doc || text.length === 0) return null;
  const first = doc.indexOf(text);
  if (first < 0) return null;
  if (doc.indexOf(text, first + 1) >= 0) return null;
  return { charStart: first, charEnd: first + text.length };
}

export interface CollectAdmissibleEvidenceOptions {
  supersessionIndex: NodeSupersessionIndex;
}

/**
 * Builds the admissible evidence set for one verification: PRIMARY_LOCAL identity plus every retrieval request the
 * verifier could independently resolve and authenticate, plus every rejected claim. Pure function of the
 * VerificationInput's allowed inputs; zero model calls.
 */
export function collectAdmissibleEvidence(input: VerificationInput, irInventory: IrInventory, options: CollectAdmissibleEvidenceOptions): AdmissibleEvidenceSet {
  const { compilerInput } = input;
  const index = compilerInput.toolAccess.structuralIndex;
  const packageDocs = packageDocumentIds(compilerInput.toolAccess, compilerInput.sourceDocumentId);
  const requests = collectRequests(input, irInventory);
  const window = localWindowSpan(input, index);
  const authenticated: AuthenticatedSourceEvidence[] = [];
  const rejected: RejectedRetrievalClaim[] = [];

  for (const req of requests) {
    const resolution = req.requestKind === "DEFINITION" ? resolveDefinitionRequest(req, index, compilerInput.toolAccess, packageDocs, options.supersessionIndex) : resolveProvisionRequest(req, index, compilerInput.toolAccess, packageDocs, options.supersessionIndex);
    if (!resolution.ok) {
      const failed: AuthenticationCheck = { code: "B_SPAN_RESOLVES", passed: false, detail: resolution.reason };
      rejected.push({ requestKind: req.requestKind, requestKey: req.requestKey, scopeKey: req.scopeKey, claimedByCompiler: req.claimedByCompiler, documentId: resolution.documentId, reason: resolution.reason, linkage: req.linkage, authenticationStatus: "REJECTED", checks: [failed] });
      continue;
    }
    const { resolved } = resolution;
    const { checks, contentHash, compilerMatched } = authenticate(req, resolved, index, packageDocs);
    const failing = checks.filter((c) => !c.passed);
    if (failing.length > 0) {
      rejected.push({ requestKind: req.requestKind, requestKey: req.requestKey, scopeKey: req.scopeKey, claimedByCompiler: req.claimedByCompiler, documentId: resolved.documentId, reason: failing.map((c) => `${c.code}: ${c.detail}`).join(" | "), linkage: req.linkage, authenticationStatus: "REJECTED", checks });
      continue;
    }
    const duplicatesLocalWindow = window !== null && resolved.documentVersion === "BASE_DOCUMENT" && resolved.documentId === compilerInput.sourceDocumentId && resolved.charStart !== null && resolved.charEnd !== null && resolved.charStart < window.charEnd && resolved.charEnd > window.charStart;
    const role = req.representedDefinitionIds.length > 0 ? "REPRESENTED_DEFINITION" : "REFERENCED_ONLY";
    const origins = [...new Set(req.linkage.map((l) => l.origin))];
    authenticated.push({
      evidenceId: hashParts([resolved.documentId, resolved.sourceNodeId ?? "(none)", String(resolved.charStart), String(resolved.charEnd), contentHash, RETRIEVED_EVIDENCE_ALGORITHM_VERSION]),
      provenanceClass: "AUTHENTICATED_RETRIEVED",
      requestKind: req.requestKind,
      requestKey: req.requestKey,
      scopeKey: req.scopeKey,
      documentId: resolved.documentId,
      documentVersion: resolved.documentVersion,
      operativeEvidenceStatus: resolved.evidenceStatus,
      sourceNodeId: resolved.sourceNodeId,
      sourceNodeKey: resolved.sourceNodeKey,
      charStart: resolved.charStart,
      charEnd: resolved.charEnd,
      rawText: resolved.text,
      contentHash,
      retrievalReason: origins.map((o) => (o === "COMPILER_TOOL_CALL" ? "the compiler's own evidence tool retrieved it during compilation" : o === "IR_DEFINITION_TERM" ? "the IR contains a definition of this term" : "an IR value's provenance cites this definition")).join("; "),
      relationshipToUnit: role === "REPRESENTED_DEFINITION" ? `definition of "${req.requestKey}" represented by IR ${req.representedDefinitionIds.join(", ")} of candidate ${compilerInput.candidateRef}` : `${req.requestKind === "DEFINITION" ? "definition" : "section"} "${req.requestKey}" consulted for candidate ${compilerInput.candidateRef} (${compilerInput.sourceSectionRef ?? "no section ref"}) - support only`,
      role,
      representedDefinitionIds: req.representedDefinitionIds,
      duplicatesLocalWindow,
      provenanceOrigin: "VERIFIER_INDEPENDENT_RESOLUTION",
      compilerRecord: { present: req.compilerRecords.length > 0, matched: compilerMatched, toolCallIndexes: req.compilerRecords.map((r) => r.toolCallIndex) },
      linkage: req.linkage,
      authenticationStatus: "AUTHENTICATED",
      checks,
    });
  }

  authenticated.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  const localSourceHash = computeSourceContentHash(compilerInput.operativeSourceText);
  const evidenceSetHash = hashParts([localSourceHash, ...authenticated.map((e) => `${e.documentId}|${e.sourceNodeId ?? ""}|${e.charStart ?? ""}|${e.charEnd ?? ""}|${e.contentHash}`), RETRIEVED_EVIDENCE_ALGORITHM_VERSION]);
  return { localSourceHash, packageDocumentIds: packageDocs, authenticated, rejected, evidenceSetHash, algorithmVersion: RETRIEVED_EVIDENCE_ALGORITHM_VERSION };
}

/**
 * Numeric inventory over each authenticated (non-duplicate) evidence text, using the SAME verifier-side parser as
 * the local window (source-inventory.ts / amount-parser.ts). Only AMOUNT/PERCENT/RATIO items are kept: aggregate
 * structural signals (conditions, entity terms, enumeration) remain PRIMARY_LOCAL-only by design.
 */
export function buildRetrievedEvidenceInventory(candidateRef: string, evidence: AdmissibleEvidenceSet, definitions: readonly { definitionId: string; calculationExpression: unknown }[], supersessionIndex: NodeSupersessionIndex): RetrievedEvidenceInventory {
  const entries: RetrievedEvidenceInventoryEntry[] = [];
  for (const ev of evidence.authenticated) {
    if (ev.duplicatesLocalWindow) continue;
    const citation = ev.requestKind === "DEFINITION" ? `definition of "${ev.requestKey}" (${ev.documentId}, authenticated retrieved source)` : `section ${ev.requestKey} (${ev.documentId}, authenticated retrieved source)`;
    const inv = buildSourceInventory(candidateRef, ev.rawText, ev.documentId, citation, ev.sourceNodeKey, ev.sourceNodeId, supersessionIndex);
    const items: SourceInventoryItem[] = inv.items
      .filter((i) => i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO")
      .map((i) => ({ ...i, itemId: hashParts([ev.evidenceId, i.itemId]), provenanceClass: "AUTHENTICATED_RETRIEVED" as const, evidenceId: ev.evidenceId, documentCharStart: ev.charStart !== null ? ev.charStart + i.charStart : null }));
    const reverseComparable = ev.role === "REPRESENTED_DEFINITION" && ev.representedDefinitionIds.some((id) => definitions.find((d) => d.definitionId === id)?.calculationExpression != null);
    entries.push({ evidenceId: ev.evidenceId, requestKind: ev.requestKind, requestKey: ev.requestKey, scopeKey: ev.scopeKey, role: ev.role, representedDefinitionIds: ev.representedDefinitionIds, reverseComparable, documentId: ev.documentId, sourceNodeId: ev.sourceNodeId, charStart: ev.charStart, charEnd: ev.charEnd, contentHash: ev.contentHash, items });
  }
  return { entries, rejectedCompilerClaims: evidence.rejected.filter((r) => r.claimedByCompiler) };
}
