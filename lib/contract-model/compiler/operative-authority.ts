/**
 * Operative-source authentication.
 *
 * A legal reference is a label. The same label can sit on a table-of-contents
 * line, a cross-reference, and the operative body. Length is not authority.
 * This module admits an occurrence as operative only with positive structural
 * evidence, and it never rewrites UNKNOWN supersession into CURRENT_OPERATIVE.
 *
 * IMPLEMENTED ≠ CERTIFIED. A diagnostic reading of unresolved text is not an
 * authoritative current covenant.
 */
import { createHash } from "node:crypto";
import type { NodeSupersessionStatus } from "./amendment/types";
import { spanContainsDefinitionDeclaration } from "./structural-definitions";
import type { StructuralIndex, TextMode } from "./structural-index";
import type { StructuralNode } from "./types";

export type StructuralOccurrenceKind = "OPERATIVE_OCCURRENCE" | "CONTENTS_LISTING" | "NO_OPERATIVE_EVIDENCE";

export interface OperativeAuthorityDecision {
  structuralKind: StructuralOccurrenceKind;
  supersessionStatus: NodeSupersessionStatus;
  /** True only for an operative occurrence the supersession index calls CURRENT_OPERATIVE, with a matching source hash. */
  authoritativeCurrent: boolean;
  /** True when this text must not be sent to a model as an operative covenant. */
  refuseModelDispatch: boolean;
  sourceSha256: string;
  reason: string;
}

export interface OperativeTextIndex {
  getNodeText(nodeId: string, mode: TextMode): string;
  getDescendants(nodeId: string): StructuralNode[];
}

/** A single contents row: a section label, a title, and a trailing page number. Dot leaders are decoration. */
const CONTENTS_LINE = /^(?:(?:section|article)\s+|§\s*)?(?:\d+\.\d+|\d{1,2})(?:\([a-z0-9]+\))*\.?\s+\S.*(?:\.{2,}|\s)\d{1,4}\s*$/i;

/** A nested marker whose text only points at another clause is not itself a covenant. */
const POINTER_LINE = /^(?:the foregoing|see\s+(?:section|article|clause)|as\s+(?:defined|set forth)\s+in)\b/i;

/**
 * Positive operative evidence. A page number at the end of a contents line is
 * not one of these. A bare character-count threshold is not one of these.
 */
const OPERATIVE_EVIDENCE = /\b(?:shall|must|may|will|agree(?:s|d)?|provided\s+that|not\s+less\s+than|not\s+exceed|at\s+least)\b|(?:\$\s?\d|\b\d+(?:\.\d+)?\s*(?:to\s*1|%|percent)\b)/i;

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Extraction turns a contents row into a non-breaking space and blank lines. Those are not separate clauses. */
function collapseExtractedWhitespace(value: string): string {
  return value.replace(/[\u00a0\s]+/g, " ").trim();
}

function isContentsListing(node: StructuralNode, index: OperativeTextIndex): boolean {
  if (index.getDescendants(node.nodeId).length > 0) return false;
  const own = index.getNodeText(node.nodeId, "OWN");
  if (!own.trim()) return false;
  // A predicate such as "shall" is operative text even when a page number follows it.
  if (OPERATIVE_EVIDENCE.test(own)) return false;
  const collapsed = collapseExtractedWhitespace(own);
  if (CONTENTS_LINE.test(collapsed)) return true;
  const lines = own.split(/\n/).map((line) => collapseExtractedWhitespace(line)).filter((line) => line.length > 0);
  return lines.length > 0 && lines.every((line) => CONTENTS_LINE.test(line));
}

function hasOperativeEvidence(node: StructuralNode, index: OperativeTextIndex): boolean {
  if (index.getDescendants(node.nodeId).some((child) => child.nodeType === "SUBSECTION" || child.nodeType === "CLAUSE" || child.nodeType === "SUBCLAUSE")) return true;
  const text = index.getNodeText(node.nodeId, "DESCENDANTS").trim();
  if (OPERATIVE_EVIDENCE.test(text)) return true;
  // A definitions section is operative text. "means" / colon declarations are the same grammar the structural index uses.
  if (spanContainsDefinitionDeclaration(text)) return true;
  // A parsed clause is structural evidence of drafted text, unless that text is only a pointer.
  if ((node.nodeType === "SUBSECTION" || node.nodeType === "CLAUSE" || node.nodeType === "SUBCLAUSE") && text.length > 0 && !POINTER_LINE.test(text)) return true;
  return false;
}

export function classifyStructuralOccurrence(node: StructuralNode, index: OperativeTextIndex): StructuralOccurrenceKind {
  if (isContentsListing(node, index)) return "CONTENTS_LISTING";
  if (hasOperativeEvidence(node, index)) return "OPERATIVE_OCCURRENCE";
  return "NO_OPERATIVE_EVIDENCE";
}

export function authenticateStructuralOccurrence(args: {
  node: StructuralNode;
  index: OperativeTextIndex;
  supersessionStatus: NodeSupersessionStatus;
  /** When set, the descendant-span hash must match. A mismatch is not operative authority. */
  expectedSha256?: string | null;
  /** The amended current text already replaced the superseded base span. */
  resolvedCurrentText?: boolean;
}): OperativeAuthorityDecision {
  const structuralKind = classifyStructuralOccurrence(args.node, args.index);
  const sourceSha256 = sha256Utf8(args.index.getNodeText(args.node.nodeId, "DESCENDANTS"));
  const hashOk = args.expectedSha256 == null || args.expectedSha256 === sourceSha256;
  const current = args.supersessionStatus === "CURRENT_OPERATIVE";
  const superseded = args.supersessionStatus === "KNOWN_SUPERSEDED" && args.resolvedCurrentText !== true;
  const structurallyOperative = structuralKind === "OPERATIVE_OCCURRENCE" && hashOk && !superseded;
  const authoritativeCurrent = structurallyOperative && current;
  const refuseModelDispatch = !structurallyOperative;
  let reason: string;
  if (!hashOk) reason = "SOURCE_HASH_MISMATCH: the span hash does not match the hash the caller authenticated.";
  else if (structuralKind === "CONTENTS_LISTING") reason = "CONTENTS_LISTING: this occurrence is a contents line. It is not an operative covenant, including when it is the only match for the label.";
  else if (structuralKind === "NO_OPERATIVE_EVIDENCE") reason = "NO_OPERATIVE_EVIDENCE: this occurrence has no clause structure and no operative predicate. It is not promoted by being the only match.";
  else if (superseded) reason = "KNOWN_SUPERSEDED: the base span is not current operative text.";
  else if (args.supersessionStatus === "UNKNOWN_SUPERSESSION_STATUS") reason = "SUPERSESSION_UNRESOLVED: operative structure is present and supersession was not established. UNKNOWN is not CURRENT_OPERATIVE.";
  else reason = "AUTHENTICATED_CURRENT: operative structure and CURRENT_OPERATIVE supersession.";
  return { structuralKind, supersessionStatus: args.supersessionStatus, authoritativeCurrent, refuseModelDispatch, sourceSha256, reason };
}

export interface ArticleSevenAuthorityRow {
  normalizedSourceRef: string;
  structuralKind: StructuralOccurrenceKind | "MISSING";
  supersessionStatus: NodeSupersessionStatus;
  sourceHashOk: boolean;
  /**
   * Physical occurrence. Discovery may emit the same node under several candidate ids.
   * Those rows are one body. Distinct ids remain distinct even when their text matches.
   * A row without an id is its own occurrence.
   */
  occurrenceId?: string | null;
}

/**
 * One diagnostic body per exact section label.
 * A contents line never wins by being the only row or the longest row.
 * Two operative occurrences are a refusal, not a tie-break.
 * KNOWN_SUPERSEDED and a hash mismatch are not selected.
 * UNKNOWN supersession may be selected for a diagnostic read and is still not current.
 */
export function selectAuthenticatedSectionBodies<T extends ArticleSevenAuthorityRow>(rows: readonly T[], refs: readonly string[]): T[] {
  const selected: T[] = [];
  for (const ref of refs) {
    const operative = rows.filter((row) => row.normalizedSourceRef === ref && row.structuralKind === "OPERATIVE_OCCURRENCE" && row.supersessionStatus !== "KNOWN_SUPERSEDED" && row.sourceHashOk);
    const unique = uniquePhysicalOccurrences(operative);
    if (unique.length === 1) selected.push(unique[0]!);
  }
  return selected;
}

function uniquePhysicalOccurrences<T extends ArticleSevenAuthorityRow>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  rows.forEach((row, index) => {
    const key = row.occurrenceId ? `occurrence:${row.occurrenceId}` : `unkeyed:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });
  return unique;
}

/** Production compile gate. No anchor means the caller did not supply structural identity; fixtures that compile raw text are unchanged. */
export function operativeModelDispatchBlock(args: {
  index: Pick<StructuralIndex, "getNodeById" | "getNodeText" | "getDescendants"> | null | undefined;
  anchorNodeId: string | null | undefined;
  supersessionStatus: NodeSupersessionStatus | null | undefined;
  operativeSourceOrigin?: "STRUCTURAL_NODE" | "OPERATIVE_STATE_CURRENT_TEXT";
  expectedSha256?: string | null;
}): OperativeAuthorityDecision | null {
  if (!args.index || !args.anchorNodeId) return null;
  const node = args.index.getNodeById(args.anchorNodeId);
  if (!node) {
    return {
      structuralKind: "NO_OPERATIVE_EVIDENCE",
      supersessionStatus: args.supersessionStatus ?? "UNKNOWN_SUPERSESSION_STATUS",
      authoritativeCurrent: false,
      refuseModelDispatch: true,
      sourceSha256: "",
      reason: "MISSING_OPERATIVE_AUTHORITY: the anchor node id is not in the structural index.",
    };
  }
  return authenticateStructuralOccurrence({
    node,
    index: args.index,
    supersessionStatus: args.supersessionStatus ?? "UNKNOWN_SUPERSESSION_STATUS",
    expectedSha256: args.expectedSha256,
    resolvedCurrentText: args.operativeSourceOrigin === "OPERATIVE_STATE_CURRENT_TEXT",
  });
}
