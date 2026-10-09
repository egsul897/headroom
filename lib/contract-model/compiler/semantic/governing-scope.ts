/**
 * GOVERNING SCOPE CONTEXT (Phase 3 - governing scope, action semantics and source-reference fidelity closure).
 *
 * A structural candidate's complete legal meaning is its own operative proposition PLUS the exact governing scope it
 * inherits from its structural ancestors: the Article-level applicability preamble ("the Borrower shall not, and shall
 * not permit any Subsidiary to, directly or indirectly:"), the section-level governing action lead-in ("create, incur,
 * assume or suffer to exist any Indebtedness, except:") and, at the bottom, the candidate's own operative exception. Only
 * the candidate's own node is OPERATIVE_SOURCE; every ancestor contributes TYPED CONTEXT that may inform the child's
 * applicability, posture and action but never owns a unit and never becomes operative source.
 *
 * Deterministic and agreement-agnostic. Two derivations, both over the authenticated structural index / document text:
 *
 *   STRUCTURAL_ANCESTOR_LEAD_IN   each real structural ancestor's OWN text, cut at its first child enumerator - the
 *                                 ancestor's own lead-in / preamble, never its descendants (sibling economics never
 *                                 enter governing scope).
 *   UNPARSED_ARTICLE_PREAMBLE     when the outermost ancestor is a SECTION-level root with no ARTICLE node above it
 *                                 (a parser that recovered no ARTICLE node for that part of the document), the
 *                                 document text between the end of the preceding root node and the start of the FIRST
 *                                 root section of the same article group (sections sharing the major number) is read;
 *                                 its trailing paragraph block is a governing preamble only when it is a lead-in (ends
 *                                 in a colon) that carries a governing posture phrase. Nothing else is admitted.
 *
 * Every region carries document, structural node (null for an unparsed preamble), section ref, exact span, ancestor
 * distance and a sha256 of its text. Evidence derivation (posture / action / entity scope) is mechanical: the entity
 * vocabulary is the guard's own source-binding vocabulary mapped onto the fixed EntityClassTag enum; a phrase the
 * enum cannot name exactly leaves the inherited scope unestablished (null), never guessed.
 */
import crypto from "node:crypto";
import type { EntityClassTag } from "@prisma/client";
import type { ContractAction } from "../../types";
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { findEntityBindingSignals, mapSourcePhraseToTags } from "./entity-scope-guard";
import { classifySourceAction, type SourceActionClassification } from "./action-ontology";

export const GOVERNING_SCOPE_CONTEXT_VERSION = "governing-scope-context.v1";

export type GoverningScopeRole = "PARENT_SCOPE" | "GOVERNING_SCOPE";
export type GoverningScopeDerivation = "STRUCTURAL_ANCESTOR_LEAD_IN" | "UNPARSED_ARTICLE_PREAMBLE";

export interface GoverningScopeRegion {
  regionId: string;
  /** PARENT_SCOPE: the immediately enclosing provision (distance 1). GOVERNING_SCOPE: a farther ancestor or the article-level preamble. */
  role: GoverningScopeRole;
  derivation: GoverningScopeDerivation;
  documentId: string;
  structuralNodeId: string | null;
  nodeType: StructuralNode["nodeType"] | "UNPARSED_ARTICLE_PREAMBLE";
  /** The ancestor's section ref ("7.2"); for an unparsed article preamble, the article group label ("article-group:7"). */
  sectionRef: string;
  ancestorDistance: number;
  charStart: number;
  charEnd: number;
  /** The ancestor's OWN lead-in text only (through its first child enumerator), never its descendants. */
  text: string;
  sha256: string;
  truncatedAtCap: boolean;
  note: string;
}

export interface SourceSemanticEvidence {
  regionId: string;
  sectionRef: string;
  role: GoverningScopeRole;
  kind: "POSTURE" | "ENTITY_SCOPE";
  phrase: string;
  index: number;
  detail: string;
}

export interface SourceEntityScopeEvidence extends SourceSemanticEvidence {
  kind: "ENTITY_SCOPE";
  mentionRole: "OBLIGOR" | "MEASUREMENT_CONTEXT" | "CONDITION_SUBJECT" | "COUNTERPARTY";
  excludedContext: boolean;
  /** The exact EntityClassTag value(s) the phrase denotes under the fixed enum, or null when the enum cannot name the class exactly. */
  mappedTags: EntityClassTag[] | null;
}

export interface SourceActionEvidence {
  regionId: string;
  sectionRef: string;
  role: GoverningScopeRole;
  classification: SourceActionClassification;
}

export interface GoverningSemanticContext {
  version: typeof GOVERNING_SCOPE_CONTEXT_VERSION;
  candidateRef: string;
  documentId: string;
  anchorNodeId: string;
  anchorSectionRef: string;
  /** Nearest ancestor first. */
  ancestorRegions: GoverningScopeRegion[];
  postureEvidence: SourceSemanticEvidence[];
  actionEvidence: SourceActionEvidence[];
  entityScopeEvidence: SourceEntityScopeEvidence[];
  /** Mechanically established from the nearest region that binds an obligor class with every phrase exactly nameable; null otherwise. */
  inheritedEntityScope: EntityClassTag[] | null;
  inheritedEntityScopeBasis: { regionId: string; sectionRef: string; role: GoverningScopeRole; phrases: string[]; evidence: string } | null;
  /** The canonical action of the nearest region whose lead-in states a covered governing act; null otherwise. */
  inheritedAction: ContractAction | null;
  inheritedActionBasis: { regionId: string; sectionRef: string; role: GoverningScopeRole; evidence: string; classification: SourceActionClassification } | null;
  /** The nearest region carrying a prohibition phrase ("shall not", "shall not permit"), if any. */
  governingProhibition: { regionId: string; sectionRef: string; role: GoverningScopeRole; evidence: string } | null;
  notes: string[];
  /** sha256 over the regions (document, node, span, text hash) - the identity the compile cache and the semantic source contract bind. */
  contentHash: string;
}

const MAX_LEAD_IN_CHARS = 4_000;
const MAX_PREAMBLE_CHARS = 2_500;
const MAX_PREAMBLE_WINDOW_CHARS = 4_000;
/** A child enumerator at the start of a line / after whitespace: "(a)", "(i)", "(1)", "(A)". The ancestor's lead-in ends where its first enumerated child begins. */
const ENUM_MARKER = /(?<=^|\s)\((?:[a-z]{1,2}|[ivx]{1,5}|\d{1,3}|[A-Z]{1,2})\)/;
const PROHIBITION_PHRASE = /\b(?:shall not(?:,? and shall not permit)?|will not|may not|shall not permit|not permit)\b/g;
const OBLIGATION_PHRASE = /\b(?:shall|will|covenants? and agrees?|agrees? that|agrees? to)\b/g;

const sha256 = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** The ancestor's own lead-in: its OWN text (through the first child node), further cut at the first inline enumerator and capped. */
export function leadInOf(ownText: string, cap = MAX_LEAD_IN_CHARS): { text: string; truncatedAtCap: boolean } {
  const m = ENUM_MARKER.exec(ownText);
  const cut = m ? ownText.slice(0, m.index) : ownText;
  const trimmed = cut.trimEnd();
  if (trimmed.length > cap) return { text: trimmed.slice(0, cap), truncatedAtCap: true };
  return { text: trimmed, truncatedAtCap: false };
}

const mapPhrase = mapSourcePhraseToTags;

/** Governing material carries a posture phrase, an entity binding or a stated act; a bare heading ("ARTICLE VII NEGATIVE COVENANTS", "SECTION 9.1 Financial Covenants.") governs nothing and is not a region. */
function carriesGoverningMaterial(text: string): boolean {
  return new RegExp(PROHIBITION_PHRASE.source).test(text) || new RegExp(OBLIGATION_PHRASE.source).test(text) || findEntityBindingSignals(text).length > 0 || classifySourceAction(text).coverage !== "NO_ACTION_FOUND";
}

function regionFromNode(index: StructuralIndex, node: StructuralNode, distance: number, regionId: string): GoverningScopeRegion | null {
  const own = index.getNodeText(node.nodeId, "OWN");
  if (own.trim().length === 0) return null;
  const lead = leadInOf(own);
  if (lead.text.trim().length === 0) return null;
  if (!carriesGoverningMaterial(lead.text)) return null;
  return {
    regionId,
    role: distance === 1 ? "PARENT_SCOPE" : "GOVERNING_SCOPE",
    derivation: "STRUCTURAL_ANCESTOR_LEAD_IN",
    documentId: node.documentId,
    structuralNodeId: node.nodeId,
    nodeType: node.nodeType,
    sectionRef: node.sectionRef,
    ancestorDistance: distance,
    charStart: node.charStart,
    charEnd: node.charStart + lead.text.length,
    text: lead.text,
    sha256: sha256(lead.text),
    truncatedAtCap: lead.truncatedAtCap,
    note: `own lead-in of structural ancestor ${node.nodeType} ${node.sectionRef} (distance ${distance}); descendants excluded`,
  };
}

/** Distinct binding phrases, case-insensitively ("The Company" / "the Company" once). */
const uniquePhrases = (signals: readonly { phrase: string }[]): string[] => { const out: string[] = []; for (const s of signals) if (!out.some((p) => p.toLowerCase() === s.phrase.toLowerCase())) out.push(s.phrase); return out; };

const majorOf = (sectionRef: string): string | null => { const m = sectionRef.match(/^(\d+)(?:\.|$)/); return m ? m[1]! : null; };

/**
 * Article-preamble recovery when no ARTICLE node contributes governing material above the candidate: the document text
 * immediately preceding the FIRST section of the article group (`top`'s preceding siblings sharing its major number, in
 * document order) is read, and its trailing paragraph block is admitted only when it is a lead-in (ends in a colon),
 * carries a governing posture phrase and is not a defined-term declaration. Structural spans are not consulted for the
 * boundary: a parser that attached the preamble to the preceding section's span, or to an over-wide ARTICLE node,
 * changes nothing about where the preamble physically sits.
 */
function unparsedArticlePreamble(index: StructuralIndex, documentId: string, top: StructuralNode, distance: number, regionId: string, notes: string[]): GoverningScopeRegion | null {
  const text = index.getDocumentText(documentId);
  if (!text) { notes.push("no document text available; unparsed article preamble recovery not attempted"); return null; }
  const parent = index.getParent(top.nodeId);
  const pool = (parent ? index.getChildren(parent.nodeId) : index.roots()).filter((n) => n.documentId === documentId).sort((a, b) => a.charStart - b.charStart);
  const pos = pool.findIndex((n) => n.nodeId === top.nodeId);
  if (pos < 0) { notes.push(`outermost non-article ancestor ${top.sectionRef} is not in its sibling pool; unparsed article preamble recovery not attempted`); return null; }
  const major = majorOf(top.sectionRef);
  if (major === null) { notes.push(`outermost non-article ancestor ${top.sectionRef} has no numeric article group; unparsed article preamble recovery not attempted`); return null; }
  let first = pos;
  while (first > 0 && pool[first - 1]!.nodeType !== "ARTICLE" && majorOf(pool[first - 1]!.sectionRef) === major) first--;
  const group = pool[first]!;
  const windowStart = Math.max(0, group.charStart - MAX_PREAMBLE_WINDOW_CHARS);
  const gap = text.slice(windowStart, group.charStart);
  const blocks = gap.split(/\n[ \t]*\n/);
  let lastIdx = blocks.length - 1;
  while (lastIdx >= 0 && blocks[lastIdx]!.trim().length === 0) lastIdx--;
  if (lastIdx < 0) { notes.push(`no text precedes the first section ${group.sectionRef} of article group ${major}`); return null; }
  const block = blocks[lastIdx]!;
  const trimmed = block.replace(/\s+$/, "");
  const body = trimmed.trimStart();
  if (!trimmed.endsWith(":")) { notes.push(`the paragraph before ${group.sectionRef} is not a lead-in (does not end in a colon); not admitted as governing scope`); return null; }
  if (/^["\u201c][^"\u201d]+["\u201d]\s*(?:means|shall mean|has the meaning)/.test(body)) { notes.push(`the paragraph before ${group.sectionRef} is a defined-term declaration; not admitted as governing scope`); return null; }
  if (!new RegExp(PROHIBITION_PHRASE.source).test(body) && !new RegExp(OBLIGATION_PHRASE.source).test(body)) { notes.push(`the lead-in before ${group.sectionRef} carries no governing posture phrase; not admitted as governing scope`); return null; }
  const blockOffset = gap.lastIndexOf(block);
  const start = windowStart + (blockOffset >= 0 ? blockOffset : 0) + (block.length - block.trimStart().length);
  let admitted = body;
  let truncated = false;
  if (admitted.length > MAX_PREAMBLE_CHARS) { admitted = admitted.slice(admitted.length - MAX_PREAMBLE_CHARS); truncated = true; }
  const charStart = start + (body.length - admitted.length);
  return {
    regionId,
    role: "GOVERNING_SCOPE",
    derivation: "UNPARSED_ARTICLE_PREAMBLE",
    documentId,
    structuralNodeId: null,
    nodeType: "UNPARSED_ARTICLE_PREAMBLE",
    sectionRef: `article-group:${major}`,
    ancestorDistance: distance,
    charStart,
    charEnd: charStart + admitted.length,
    text: admitted,
    sha256: sha256(admitted),
    truncatedAtCap: truncated,
    note: `governing lead-in recovered from the document text immediately preceding the first section ${group.sectionRef} of article group ${major} (no ARTICLE node carrying governing material was parsed above ${top.sectionRef}); trailing lead-in paragraph only`,
  };
}

export interface ResolveGoverningScopeInput {
  candidateRef: string;
  documentId: string;
  anchorNodeId: string;
  index: StructuralIndex;
}

/** Walks the candidate's real ancestor chain and derives the typed governing context. Null when the anchor is unknown to the index. */
export function resolveGoverningScope(input: ResolveGoverningScopeInput): GoverningSemanticContext | null {
  const anchor = input.index.getNodeById(input.anchorNodeId);
  if (!anchor || anchor.documentId !== input.documentId) return null;
  const notes: string[] = [];
  const ancestors = input.index.getAncestors(anchor.nodeId); // outermost first
  const chain = [...ancestors].reverse(); // nearest first
  const regions: GoverningScopeRegion[] = [];
  chain.forEach((node, i) => {
    const region = regionFromNode(input.index, node, i + 1, `governing-${regions.length + 1}`);
    if (region) regions.push(region);
    else notes.push(`ancestor ${node.nodeType} ${node.sectionRef} has no own lead-in text carrying governing material (heading only or empty); not a region`);
  });
  // Article-level recovery: when no ARTICLE ancestor contributed governing material (none parsed, or a heading-only
  // node), the applicability preamble may sit unparsed in the document text before the first section of the group.
  const articleCarries = regions.some((r) => r.nodeType === "ARTICLE");
  if (!articleCarries && anchor.nodeType !== "ARTICLE") {
    const nonArticle = ancestors.filter((a) => a.nodeType !== "ARTICLE");
    const top = nonArticle[0] ?? anchor;
    const preamble = unparsedArticlePreamble(input.index, input.documentId, top, chain.length + 1, `governing-${regions.length + 1}`, notes);
    if (preamble) regions.push(preamble);
  }

  const postureEvidence: SourceSemanticEvidence[] = [];
  const entityScopeEvidence: SourceEntityScopeEvidence[] = [];
  const actionEvidence: SourceActionEvidence[] = [];
  let governingProhibition: GoverningSemanticContext["governingProhibition"] = null;
  let inheritedEntityScope: EntityClassTag[] | null = null;
  let inheritedEntityScopeBasis: GoverningSemanticContext["inheritedEntityScopeBasis"] = null;
  let inheritedAction: ContractAction | null = null;
  let inheritedActionBasis: GoverningSemanticContext["inheritedActionBasis"] = null;

  for (const r of regions) {
    const pro = new RegExp(PROHIBITION_PHRASE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = pro.exec(r.text)) !== null) postureEvidence.push({ regionId: r.regionId, sectionRef: r.sectionRef, role: r.role, kind: "POSTURE", phrase: m[0], index: m.index, detail: "PROHIBITION" });
    if (!governingProhibition && new RegExp(PROHIBITION_PHRASE.source).test(r.text)) governingProhibition = { regionId: r.regionId, sectionRef: r.sectionRef, role: r.role, evidence: r.text.slice(0, 240) };

    const signals = findEntityBindingSignals(r.text);
    const obligors = signals.filter(
      (s) => !s.excludedContext && s.role !== "MEASUREMENT_CONTEXT" && s.role !== "CONDITION_SUBJECT" && s.role !== "COUNTERPARTY",
    );
    for (const s of signals) {
      entityScopeEvidence.push({
        regionId: r.regionId,
        sectionRef: r.sectionRef,
        role: r.role,
        kind: "ENTITY_SCOPE",
        phrase: s.phrase,
        index: s.index,
        mentionRole: s.role ?? "OBLIGOR",
        excludedContext: s.excludedContext,
        mappedTags: mapPhrase(s.phrase),
        detail: s.excludedContext
          ? "carve-out mention"
          : s.role === "MEASUREMENT_CONTEXT"
            ? "measurement-group mention"
            : s.role === "CONDITION_SUBJECT"
              ? "condition-subject mention"
              : s.role === "COUNTERPARTY"
                ? "counterparty (payee) mention"
                : "obligor binding",
      });
    }
    if (inheritedEntityScope === null && inheritedEntityScopeBasis === null && obligors.length > 0) {
      const mapped = obligors.map((s) => mapPhrase(s.phrase));
      if (mapped.every((t) => t !== null)) {
        const tags: EntityClassTag[] = [];
        for (const t of mapped as EntityClassTag[][]) for (const x of t) if (!tags.includes(x)) tags.push(x);
        inheritedEntityScope = tags;
        inheritedEntityScopeBasis = { regionId: r.regionId, sectionRef: r.sectionRef, role: r.role, phrases: uniquePhrases(obligors), evidence: r.text.slice(0, 240) };
      } else {
        inheritedEntityScopeBasis = { regionId: r.regionId, sectionRef: r.sectionRef, role: r.role, phrases: uniquePhrases(obligors), evidence: r.text.slice(0, 240) };
        notes.push(`governing region ${r.regionId} (${r.sectionRef}) binds obligor class(es) ${[...new Set(obligors.filter((s) => mapPhrase(s.phrase) === null).map((s) => `"${s.phrase}"`))].join(", ")} that the EntityClassTag enum cannot name exactly; inherited entity scope not established (not guessed)`);
      }
    }

    const action = classifySourceAction(r.text);
    if (action.coverage !== "NO_ACTION_FOUND") {
      actionEvidence.push({ regionId: r.regionId, sectionRef: r.sectionRef, role: r.role, classification: action });
      if (inheritedAction === null && inheritedActionBasis === null) {
        inheritedActionBasis = { regionId: r.regionId, sectionRef: r.sectionRef, role: r.role, evidence: action.phrase, classification: action };
        if (action.coverage === "COVERED") inheritedAction = action.canonicalAction;
        else notes.push(`governing region ${r.regionId} (${r.sectionRef}) states an act "${action.phrase}" the canonical action ontology does not cover as one category (${action.coverage}); inherited action not established`);
      }
    }
  }

  const contentHash = sha256(JSON.stringify(regions.map((r) => [r.documentId, r.structuralNodeId, r.derivation, r.charStart, r.charEnd, r.sha256])));
  return {
    version: GOVERNING_SCOPE_CONTEXT_VERSION,
    candidateRef: input.candidateRef,
    documentId: input.documentId,
    anchorNodeId: anchor.nodeId,
    anchorSectionRef: anchor.sectionRef,
    ancestorRegions: regions,
    postureEvidence,
    actionEvidence,
    entityScopeEvidence,
    inheritedEntityScope,
    inheritedEntityScopeBasis,
    inheritedAction,
    inheritedActionBasis,
    governingProhibition,
    notes,
    contentHash,
  };
}

/** Deterministic rendering for the Pass B / verifier prompts: typed, labelled, never candidate-owned propositions. */
export function renderGoverningScopeForPrompt(ctx: GoverningSemanticContext | null | undefined): string {
  if (!ctx || ctx.ancestorRegions.length === 0) return "";
  const lines: string[] = [
    `GOVERNING SEMANTIC CONTEXT (${ctx.version}; authenticated structural ancestors of ${ctx.anchorSectionRef}, own lead-in text only, nearest first). This text GOVERNS how the operative provision is read - who it binds (applicability), its posture and the act it concerns - but it is NOT the provision being compiled and NOT candidate-owned source: never emit a rule for it, never inventory it as a proposition of this candidate, and never restate its own sibling clauses.`,
  ];
  for (const r of ctx.ancestorRegions) lines.push(`--- ${r.role} [${r.regionId}] ${r.nodeType} ${r.sectionRef} (ancestor distance ${r.ancestorDistance}; ${r.derivation}; ${r.documentId} chars ${r.charStart}-${r.charEnd}; sha256 ${r.sha256.slice(0, 12)}) ---\n${r.text}`);
  return lines.join("\n");
}
