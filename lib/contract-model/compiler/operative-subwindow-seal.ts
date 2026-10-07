/**
 * OPERATIVE_SUBWINDOW source-window seal.
 *
 * Arch D1 requirements 1–6 in
 * docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md. COO GRANT sole, bound
 * to C1 FROZEN sha256
 * 35907db264d8b6201189d315ee1a282e0dca008023b953652d39f71862005f4d.
 * That grant says a source window may be sealed independently of D2
 * category-to-rule edges, and it supersedes the prior seal FREEZE_NOT_READY
 * for this primitive only.
 *
 * The window is the sentence's own half-open character span in the extracted
 * document. A description, a source citation, a distinguishing quote, and a
 * verified-quote fingerprint do not define it. The enclosing marker-owned
 * container is echoed and is not replaced, split, or re-emitted. This module
 * does not call Stage-1 structure and does not mint a marker, a discovery
 * identifier, a structural node, or a pin.
 *
 * Downstream IR representability is not a seal input. Category labels are
 * not rule ids. PHASE3_CATEGORY_RECLASS_UNSUPPORTED stays the D2 refusal.
 * Edge invent is FORBIDDEN. A sealed window is not CERTIFIED.
 *
 * Soft gate. Invent-absence forever. IMPLEMENTED ≠ CERTIFIED.
 */
import { createHash } from "node:crypto";

/** COO GRANT sole. Full C1 FROZEN identity. */
export const OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256 =
  "35907db264d8b6201189d315ee1a282e0dca008023b953652d39f71862005f4d";

export const OPERATIVE_SUBWINDOW_CLASS = "OPERATIVE_SUBWINDOW" as const;

/** D2 refusal. Not a seal precondition and not an edge. */
export const PHASE3_CATEGORY_RECLASS_UNSUPPORTED = "PHASE3_CATEGORY_RECLASS_UNSUPPORTED" as const;

export const OPERATIVE_SUBWINDOW_EDGE_INVENT = "FORBIDDEN" as const;

export interface SourceSpan {
  /** Inclusive start offset into the extracted document. */
  charStart: number;
  /** Exclusive end offset. */
  charEnd: number;
}

/** Existing marker-owned structural container. Echoed, never minted here. */
export interface OperativeSubwindowContainer {
  nodeId: string;
  sectionRef: string;
  charStart: number;
  charEnd: number;
}

/**
 * Operative-state authority verdict for the container's source.
 * Only CURRENT_OPERATIVE and OPERATIVE_STATE_RESOLVED are current.
 * Any other status, including KNOWN_SUPERSEDED and UNKNOWN_SUPERSESSION_STATUS,
 * is not current. The seal does not compute operative state itself.
 */
export interface OperativeSourceAuthority {
  status: string;
}

export interface OperativeSubwindowSealInput {
  /** Stable document identity. Distinguishes the same bytes in two documents. */
  documentId: string;
  /** Extracted document text. The window is a slice of these characters. */
  documentText: string;
  /**
   * Caller-asserted sha256 of the whole document. Compared to the hash of
   * documentText. A mismatch refuses. It is not replaced with the actual hash.
   */
  assertedDocumentSha256: string;
  /** The sentence's own half-open span. Offsets are the window. */
  span: SourceSpan;
  /**
   * Caller-asserted sha256 of the exact source slice. Compared to the hash of
   * documentText.slice(charStart, charEnd). A mismatch is a stale source and
   * refuses. It is not recomputed into a seal.
   */
  requestedSourceSha256: string;
  /** Marker-owned container the sentence sits inside. */
  container: OperativeSubwindowContainer;
  /**
   * When present, the source must be current. A superseded or otherwise
   * non-current verdict refuses. Omitted authority is not invented as current
   * and is not treated as a supersession finding.
   */
  operativeAuthority?: OperativeSourceAuthority | null;
}

export type OperativeSubwindowRefusalCode =
  | "DOCUMENT_ID_ABSENT"
  | "DOCUMENT_HASH_MISMATCH"
  | "ZERO_LENGTH_SPAN"
  | "REVERSED_BOUNDS"
  | "SPAN_OUT_OF_DOCUMENT"
  | "STALE_SOURCE_HASH"
  | "SOURCE_NOT_CURRENT"
  | "CONTAINER_IDENTITY_ABSENT"
  | "CONTAINER_SPAN_INVALID"
  | "SPAN_EQUALS_CONTAINER"
  | "SPAN_NOT_INSIDE_CONTAINER"
  | "SPAN_HAS_OWN_MARKER"
  | "NOT_A_SENTENCE_SPAN";

/** Standing D2 block. Identical on SEALED and REFUSED. Never selects the verdict. */
export interface OperativeSubwindowDownstreamRepresentation {
  coupledToSeal: false;
  categoryReclass: typeof PHASE3_CATEGORY_RECLASS_UNSUPPORTED;
  edgeInvent: typeof OPERATIVE_SUBWINDOW_EDGE_INVENT;
  relationshipType: null;
  targetRuleId: null;
}

export interface SealedOperativeSubwindow {
  class: typeof OPERATIVE_SUBWINDOW_CLASS;
  verdict: "SEALED";
  certification: "NOT_CERTIFIED";
  frozenSha256: typeof OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256;
  /** Caller document identity. Part of the seal identity. */
  documentId: string;
  /** sha256 of the whole extracted document. An edit outside the window changes this. */
  documentSha256: string;
  /**
   * Deterministic OPERATIVE_SUBWINDOW identity. Length-prefixed structured hash of
   * documentId, whole-document sha256, offsets, window sha256, container nodeId,
   * and container bounds. It does not mint a candidate identity or a structural node.
   */
  identity: string;
  window: {
    charStart: number;
    charEnd: number;
    /** Exact document slice. Not a description and not a quote. */
    text: string;
    sha256: string;
  };
  container: OperativeSubwindowContainer;
  /** These sources are never the window, whether or not a caller has them. */
  refusedAsWindow: {
    description: true;
    sourceCitation: true;
    distinguishingQuote: true;
    verifiedQuoteFingerprint: true;
    pinDirtySpan: true;
  };
  nonClaims: {
    mintsCandidateIdentity: false;
    editsSealedDiscovery: false;
    manufacturesStructuralNode: false;
    mintsPin: false;
    stage1MarkerInvent: false;
    writesReclassEdge: false;
    targetRuleId: null;
    issuerSpecialCase: false;
  };
  downstreamRepresentation: OperativeSubwindowDownstreamRepresentation;
}

export interface RefusedOperativeSubwindow {
  class: typeof OPERATIVE_SUBWINDOW_CLASS;
  verdict: "REFUSED";
  certification: "NOT_CERTIFIED";
  frozenSha256: typeof OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256;
  code: OperativeSubwindowRefusalCode;
  downstreamRepresentation: OperativeSubwindowDownstreamRepresentation;
}

export type OperativeSubwindowSealResult = SealedOperativeSubwindow | RefusedOperativeSubwindow;

/** A parenthesized sequence token Stage-1 would treat as a marker occurrence. Not an emit. */
const MARKER_AT_START = /^\(([a-zA-Z]{1,7}|\d{1,3})\)(?!\()/;

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value);
  return buf;
}

/** Length-prefixed field. The length is the byte length, so delimiters inside a field cannot shift the next field. */
function lengthPrefixed(part: Buffer): Buffer {
  return Buffer.concat([u32(part.length), part]);
}

/**
 * Collision-resistant identity. Each field is length-prefixed. Offsets are
 * fixed-width integers, not decimal strings joined by a delimiter.
 */
function operativeSubwindowIdentity(parts: {
  documentId: string;
  documentSha256: string;
  charStart: number;
  charEnd: number;
  windowSha256: string;
  containerNodeId: string;
  containerCharStart: number;
  containerCharEnd: number;
}): string {
  const encoded = Buffer.concat([
    lengthPrefixed(Buffer.from("OPERATIVE_SUBWINDOW", "utf8")),
    lengthPrefixed(Buffer.from(parts.documentId, "utf8")),
    lengthPrefixed(Buffer.from(parts.documentSha256, "utf8")),
    lengthPrefixed(u32(parts.charStart)),
    lengthPrefixed(u32(parts.charEnd)),
    lengthPrefixed(Buffer.from(parts.windowSha256, "utf8")),
    lengthPrefixed(Buffer.from(parts.containerNodeId, "utf8")),
    lengthPrefixed(u32(parts.containerCharStart)),
    lengthPrefixed(u32(parts.containerCharEnd)),
  ]);
  return createHash("sha256").update(encoded).digest("hex");
}

const CURRENT_OPERATIVE_STATUSES = new Set(["CURRENT_OPERATIVE", "OPERATIVE_STATE_RESOLVED"]);

function downstreamRepresentation(): OperativeSubwindowDownstreamRepresentation {
  return {
    coupledToSeal: false,
    categoryReclass: PHASE3_CATEGORY_RECLASS_UNSUPPORTED,
    edgeInvent: OPERATIVE_SUBWINDOW_EDGE_INVENT,
    relationshipType: null,
    targetRuleId: null,
  };
}

function refused(code: OperativeSubwindowRefusalCode): RefusedOperativeSubwindow {
  return {
    class: OPERATIVE_SUBWINDOW_CLASS,
    verdict: "REFUSED",
    certification: "NOT_CERTIFIED",
    frozenSha256: OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256,
    code,
    downstreamRepresentation: downstreamRepresentation(),
  };
}

function isHalfOpenInDocument(start: number, end: number, length: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= length && start < end;
}

function identityPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * True when the span contains a marker of its own: a short parenthesized
 * token at a whitespace boundary, excluding a comma-space citation (", (ii)")
 * and a glued citation ("6.01(a)"). This refuses the span. It does not repair
 * a list and it does not emit a node.
 */
function spanHasOwnMarker(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "(") continue;
    if (i > 0) {
      const prev = text[i - 1];
      if (prev === undefined || !/\s/.test(prev)) continue;
      const beforePrev = i >= 2 ? text[i - 2] : undefined;
      if (beforePrev === "," && (prev === " " || prev === "\t")) continue;
    }
    if (MARKER_AT_START.test(text.slice(i))) return true;
  }
  return false;
}

/** The span is one sentence's own bytes: bounded, terminated, and not two sentences glued together. */
function isOwnSentenceSpan(documentText: string, start: number, end: number): boolean {
  const text = documentText.slice(start, end);
  const first = text[0];
  const last = text[text.length - 1];
  if (first === undefined || last === undefined) return false;
  if (/\s/.test(first) || /\s/.test(last)) return false;
  if (last !== "." && last !== "!" && last !== "?") return false;
  if (start > 0) {
    const prev = documentText[start - 1];
    if (prev === undefined || !/\s/.test(prev)) return false;
  }
  if (end < documentText.length) {
    const next = documentText[end];
    if (next === undefined || !/\s/.test(next)) return false;
  }
  if (/[.!?]["')\]]*\s+[A-Z(]/.test(text.slice(0, -1))) return false;
  return true;
}

function copyContainer(container: OperativeSubwindowContainer): OperativeSubwindowContainer {
  return {
    nodeId: container.nodeId,
    sectionRef: container.sectionRef,
    charStart: container.charStart,
    charEnd: container.charEnd,
  };
}

export function isSealedOperativeSubwindow(result: OperativeSubwindowSealResult): result is SealedOperativeSubwindow {
  return result.verdict === "SEALED";
}

/**
 * Seal one unenumerated sentence that sits inside a marker-owned span.
 * Success depends only on the source-window checks below. It does not read
 * category labels, rule ids, or whether a later IR can represent the sentence.
 */
export function sealOperativeSubwindow(input: OperativeSubwindowSealInput): OperativeSubwindowSealResult {
  const { documentText, span, container } = input;
  if (!identityPresent(input.documentId)) return refused("DOCUMENT_ID_ABSENT");
  if (typeof documentText !== "string") return refused("SPAN_OUT_OF_DOCUMENT");
  const documentSha256 = sha256Hex(documentText);
  if (input.assertedDocumentSha256 !== documentSha256) return refused("DOCUMENT_HASH_MISMATCH");
  if (!Number.isInteger(span.charStart) || !Number.isInteger(span.charEnd)) return refused("SPAN_OUT_OF_DOCUMENT");
  if (span.charStart === span.charEnd) return refused("ZERO_LENGTH_SPAN");
  if (span.charStart > span.charEnd) return refused("REVERSED_BOUNDS");
  if (span.charStart < 0 || span.charEnd > documentText.length) return refused("SPAN_OUT_OF_DOCUMENT");
  const text = documentText.slice(span.charStart, span.charEnd);
  const windowSha256 = sha256Hex(text);
  if (input.requestedSourceSha256 !== windowSha256) return refused("STALE_SOURCE_HASH");
  if (input.operativeAuthority != null && !CURRENT_OPERATIVE_STATUSES.has(input.operativeAuthority.status)) {
    return refused("SOURCE_NOT_CURRENT");
  }
  if (!identityPresent(container.nodeId) || !identityPresent(container.sectionRef)) return refused("CONTAINER_IDENTITY_ABSENT");
  if (!isHalfOpenInDocument(container.charStart, container.charEnd, documentText.length)) return refused("CONTAINER_SPAN_INVALID");

  const sameStart = span.charStart === container.charStart;
  const sameEnd = span.charEnd === container.charEnd;
  if (sameStart && sameEnd) return refused("SPAN_EQUALS_CONTAINER");
  const inside = span.charStart >= container.charStart && span.charEnd <= container.charEnd;
  if (!inside) return refused("SPAN_NOT_INSIDE_CONTAINER");

  if (spanHasOwnMarker(text)) return refused("SPAN_HAS_OWN_MARKER");
  if (!isOwnSentenceSpan(documentText, span.charStart, span.charEnd)) return refused("NOT_A_SENTENCE_SPAN");

  return {
    class: OPERATIVE_SUBWINDOW_CLASS,
    verdict: "SEALED",
    certification: "NOT_CERTIFIED",
    frozenSha256: OPERATIVE_SUBWINDOW_C1_FROZEN_SHA256,
    documentId: input.documentId,
    documentSha256,
    identity: operativeSubwindowIdentity({
      documentId: input.documentId,
      documentSha256,
      charStart: span.charStart,
      charEnd: span.charEnd,
      windowSha256,
      containerNodeId: container.nodeId,
      containerCharStart: container.charStart,
      containerCharEnd: container.charEnd,
    }),
    window: {
      charStart: span.charStart,
      charEnd: span.charEnd,
      text,
      sha256: windowSha256,
    },
    container: copyContainer(container),
    refusedAsWindow: {
      description: true,
      sourceCitation: true,
      distinguishingQuote: true,
      verifiedQuoteFingerprint: true,
      pinDirtySpan: true,
    },
    nonClaims: {
      mintsCandidateIdentity: false,
      editsSealedDiscovery: false,
      manufacturesStructuralNode: false,
      mintsPin: false,
      stage1MarkerInvent: false,
      writesReclassEdge: false,
      targetRuleId: null,
      issuerSpecialCase: false,
    },
    downstreamRepresentation: downstreamRepresentation(),
  };
}
