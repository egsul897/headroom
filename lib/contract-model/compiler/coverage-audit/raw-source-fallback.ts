/**
 * Phase 2F.1 §9/§10/§11/§13 - the auditor's raw-source fallback path.
 *
 * INDEPENDENCE (extends the same contract types.ts documents at the top
 * of this module's own directory): this file reads only raw source text
 * and this phase's own structural-coverage.ts output (which is itself
 * computed from Phase 2A's structural nodes, not from any Phase 2B/2D
 * conclusion). It never imports discovery/*, context-retrieval/pipeline.ts,
 * or a DiscoveredCandidate/CovenantContextBundle - enforced by the same
 * static-import test as every other independent-inventory module
 * (tests/contract-model/coverage-audit-independence.test.ts, extended in
 * this task per its own §22).
 *
 * Architecture (task §9):
 *   Normal path:   raw source -> Phase 2A nodes -> independent coverage regions
 *   Fallback path: raw source -> uncovered substantive spans -> raw-source audit regions
 *
 * The fallback never depends on whether Phase 2B/2D produced anything for
 * a document - it only depends on structural-coverage.ts's own uncovered-
 * span output, which is itself derived purely from Phase 2A's node list.
 */
import { hashParts } from "../hashing";
import { detectIndependentSignals, detectAmendmentAndDefinitionalSignals, type SignalHit } from "./signals";
import { COVERAGE_AUDIT_ALGORITHM_VERSION } from "./types";
import type { AuditFinding, Materiality } from "./types";
import { computeFindingId } from "./identity";

export interface RawSourceRegion {
  /** Deterministic, content-derived - never random, never array-position-derived. */
  regionId: string;
  documentId: string;
  charStart: number;
  charEnd: number;
  text: string;
  /** A short excerpt of the text immediately preceding and following this region, so a reader can see why the partitioner drew the boundary here without re-fetching the full document. */
  neighboringBoundaryEvidence: string;
  reasonFallbackRequired: string;
}

const MAX_REGION_CHARS = 3000;
const MIN_MERGE_CHARS = 400;
const BOUNDARY_EVIDENCE_CHARS = 80;

/** A line that looks like a heading/list-item opener - used only to choose good SPLIT POINTS inside an oversized paragraph, never to create a structural node (task §10's own "heading-like lines... numbering transitions" evidence list). */
const HEADING_LIKE_LINE = /^\s*(?:SECTION|Section|ARTICLE|§|\(?[a-z]\)|\(?[ivxlcdm]+\)|\d+[.)])/;

/** Splits raw text into paragraphs on blank-line boundaries (task §10's own first-listed evidence). */
function splitIntoParagraphs(text: string): { start: number; end: number }[] {
  const paragraphs: { start: number; end: number }[] = [];
  const blankLineRe = /\n\s*\n/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = blankLineRe.exec(text)) !== null) {
    if (m.index > cursor) paragraphs.push({ start: cursor, end: m.index });
    cursor = blankLineRe.lastIndex;
  }
  if (cursor < text.length) paragraphs.push({ start: cursor, end: text.length });
  return paragraphs.length > 0 ? paragraphs : [{ start: 0, end: text.length }];
}

/** Further splits one oversized paragraph at the nearest heading-like line or newline boundary to a MAX_REGION_CHARS-sized chunk - never a mid-word/mid-sentence cut, and never a single call sent to a model over the whole span (task §10's own "do not feed an entire large document to a model"). */
function splitOversizedParagraph(text: string, offset: number): { start: number; end: number }[] {
  if (text.length <= MAX_REGION_CHARS) return [{ start: offset, end: offset + text.length }];
  const lines = text.split("\n");
  const chunks: { start: number; end: number }[] = [];
  let chunkStart = 0;
  let lineStart = 0;
  let sinceChunkStart = 0;
  for (const line of lines) {
    const lineLenWithBreak = line.length + 1;
    const isBoundary = HEADING_LIKE_LINE.test(line);
    if (sinceChunkStart >= MAX_REGION_CHARS || (isBoundary && sinceChunkStart >= MIN_MERGE_CHARS)) {
      chunks.push({ start: offset + chunkStart, end: offset + lineStart });
      chunkStart = lineStart;
      sinceChunkStart = 0;
    }
    lineStart += lineLenWithBreak;
    sinceChunkStart += lineLenWithBreak;
  }
  if (chunkStart < text.length) chunks.push({ start: offset + chunkStart, end: offset + text.length });
  return chunks.filter((c) => c.end > c.start);
}

/**
 * Phase 3F.1.4 - loosened from the previous `span: UncoveredSpan` parameter
 * type to this minimal shape: only charStart/charEnd are ever actually read
 * below. This lets coverage-audit/pipeline.ts (and semantic-coverage/
 * router.ts, an existing caller elsewhere in the tree) route BOTH a real
 * genuinely-uncovered UncoveredSpan AND a structural-coverage.ts
 * BoundaryAnomalyFinding's own `span` (a SIGNIFICANT anomaly's suspect
 * region - text that IS technically "covered" by some node, but that real
 * evidence suggests should not be) through this exact same partitioning
 * and raw-text scan, without inventing a second parallel partitioner. Any
 * value shaped like `UncoveredSpan` (or a BoundaryAnomalyFinding's `span`)
 * remains directly assignable here.
 */
export interface RawScanSpanRef {
  charStart: number;
  charEnd: number;
}

/**
 * Partitions one uncovered/suspect span of a document's raw text into
 * bounded, deterministic regions (task §10). Adjacent small paragraphs are
 * merged up to MAX_REGION_CHARS; an oversized single paragraph is split at
 * heading-like/newline boundaries. Every region keeps its real absolute
 * document offsets, its own text, boundary evidence, and the reason the
 * structural fallback was required for this span.
 */
export function partitionUncoveredSpan(documentId: string, fullText: string, span: RawScanSpanRef, reasonFallbackRequired: string): RawSourceRegion[] {
  const spanText = fullText.slice(span.charStart, span.charEnd);
  const paragraphs = splitIntoParagraphs(spanText).map((p) => ({ start: span.charStart + p.start, end: span.charStart + p.end }));

  // Merge small consecutive paragraphs, split oversized ones.
  const bounded: { start: number; end: number }[] = [];
  let mergeStart: number | null = null;
  let mergeEnd: number | null = null;
  const flushMerge = () => {
    if (mergeStart !== null && mergeEnd !== null) bounded.push({ start: mergeStart, end: mergeEnd });
    mergeStart = null;
    mergeEnd = null;
  };
  for (const p of paragraphs) {
    const pLen = p.end - p.start;
    if (pLen > MAX_REGION_CHARS) {
      flushMerge();
      for (const chunk of splitOversizedParagraph(fullText.slice(p.start, p.end), p.start)) bounded.push(chunk);
      continue;
    }
    if (mergeStart === null) {
      mergeStart = p.start;
      mergeEnd = p.end;
      continue;
    }
    if (mergeEnd! - mergeStart! + pLen <= MAX_REGION_CHARS) {
      mergeEnd = p.end;
    } else {
      flushMerge();
      mergeStart = p.start;
      mergeEnd = p.end;
    }
  }
  flushMerge();

  return bounded.map((b) => {
    const text = fullText.slice(b.start, b.end);
    const before = fullText.slice(Math.max(0, b.start - BOUNDARY_EVIDENCE_CHARS), b.start).trim();
    const after = fullText.slice(b.end, Math.min(fullText.length, b.end + BOUNDARY_EVIDENCE_CHARS)).trim();
    return {
      regionId: hashParts([documentId, String(b.start), String(b.end), COVERAGE_AUDIT_ALGORITHM_VERSION]),
      documentId,
      charStart: b.start,
      charEnd: b.end,
      text,
      neighboringBoundaryEvidence: `...${before} [REGION] ${after}...`,
      reasonFallbackRequired,
    };
  });
}

export interface RawSourceSignalResult {
  region: RawSourceRegion;
  signals: SignalHit[];
  hasCovenantSignal: boolean;
  hasAmendmentSignal: boolean;
  hasDefinitionalSignal: boolean;
}

/**
 * Task §11 - deterministic signal scan over one raw fallback region, with
 * ZERO requirement that a structural node exist for this text at all
 * (unlike source-inventory.ts's own buildSourceCoverageInventory, which
 * is anchored to a real StructuralNode). Reuses signals.ts's own
 * detectIndependentSignals unmodified - the same generalized, non-
 * package-specific signal set the normal path already uses.
 */
export function scanRawSourceRegion(region: RawSourceRegion): RawSourceSignalResult {
  const covenantSignals = detectIndependentSignals(region.text);
  const fallbackSignals = detectAmendmentAndDefinitionalSignals(region.text);
  const signals = [...covenantSignals, ...fallbackSignals];
  const names = new Set(fallbackSignals.map((s) => s.name));
  return {
    region,
    signals,
    hasCovenantSignal: covenantSignals.length > 0,
    hasAmendmentSignal: fallbackSignals.some((s) => s.category === "AMENDMENT"),
    hasDefinitionalSignal: names.has("quoted_term_means") || names.has("quoted_term_colon") || names.has("defined_terms_heading"),
  };
}

function materialityForSignalCount(count: number): Materiality {
  if (count >= 3) return "MATERIAL";
  if (count >= 1) return "UNCERTAIN";
  return "NON_MATERIAL";
}

/**
 * Task §13 - builds the actual AuditFinding rows for one document's raw
 * fallback pass: one STRUCTURAL_ANALYSIS_INSUFFICIENT document-level
 * finding (only ever emitted once per document, not once per region),
 * plus one RAW_SOURCE_COVENANT_SIGNAL and/or RAW_SOURCE_AMENDMENT_SIGNAL
 * finding per region that independently showed real signal - never a
 * finding for a signal-free region (task §16 item 20's own "raw source
 * with no covenant signals" case must produce nothing).
 */
export function buildRawSourceFallbackFindings(input: {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentId: string;
  healthReasons: string[];
  /** Only STRUCTURE_HEALTHY documents skip the document-level finding - a healthy document with one small, disclosed uncovered span (e.g. a curated fixture's own non-structural preamble) still gets region-level RAW_SOURCE_* findings below where real signal exists, without also claiming its overall structural analysis was insufficient. */
  includeDocumentLevelFinding: boolean;
  scanResults: RawSourceSignalResult[];
}): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const base = {
    companyId: input.companyId,
    packageKey: input.packageKey,
    instrumentKey: input.instrumentKey,
    documentId: input.documentId,
    auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    resolutionStatus: "OPEN" as const,
    // Phase 3F.1.6.R BLOCKER-3 fix - see coverage-audit/types.ts's own
    // OPERATIVE-STATE DISCLOSURE header. These findings have no
    // structuralNodeId at all (raw, structurally-unanchored spans), so a
    // real supersessionIndex lookup at runIndependentCoverageAudit's own
    // post-hoc tagging pass will itself resolve to UNKNOWN (no node
    // identity to check) - the same fail-closed outcome as this default.
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS" as const,
    supersessionReason: "raw-source-fallback.ts findings are not anchored to a real structural node - supersession status cannot be determined for unanchored raw text.",
  };

  if (input.includeDocumentLevelFinding) {
    findings.push({
      ...base,
      findingId: computeFindingId(input.documentId, null, "STRUCTURAL_ANALYSIS_INSUFFICIENT", input.healthReasons.join(" | ")),
      structuralNodeKey: null,
      structuralNodeId: null,
      sourceCitation: `${input.documentId} (document-level)`,
      findingType: "STRUCTURAL_ANALYSIS_INSUFFICIENT",
      materiality: "UNCERTAIN",
      sourceEvidence: input.healthReasons.join(" "),
      auditorReasoning: "This document's own structural coverage/health evidence indicates the structural parser did not adequately represent it - findings below (if any) come from an independent raw-source fallback scan, not from structural-node-anchored regions.",
      comparisonResult: "N_A",
      rootCauseSubsystem: "STRUCTURAL_SUBSTRATE",
      affectedDiscoveryId: null,
      affectedBundleId: null,
      provenance: "raw-source-fallback.ts document-level health check - no Phase 2B/2D output consulted",
    });
  }

  for (const result of input.scanResults) {
    if (!result.hasCovenantSignal && !result.hasAmendmentSignal) continue; // task item 20: a signal-free region produces nothing
    const signalNames = result.signals.map((s) => s.name).sort();
    const materiality = materialityForSignalCount(signalNames.length);
    const citation = `${input.documentId}::raw[${result.region.charStart}-${result.region.charEnd}]`;

    if (result.hasAmendmentSignal) {
      findings.push({
        ...base,
        findingId: computeFindingId(input.documentId, null, "RAW_SOURCE_AMENDMENT_SIGNAL", citation),
        structuralNodeKey: null,
      structuralNodeId: null,
        sourceCitation: citation,
        findingType: "RAW_SOURCE_AMENDMENT_SIGNAL",
        materiality,
        sourceEvidence: result.region.text.slice(0, 400),
        auditorReasoning: `Structurally unavailable raw span independently shows amendment/modification-shaped signals (${signalNames.filter((n) => ["hereby_amended", "amendment_restatement", "amendment_noun", "modified_supplemented", "effective_date_of_amendment", "conditions_precedent", "reaffirm", "no_novation"].includes(n)).join(", ")}) - this may alter otherwise correctly analyzed base language and must not disappear silently.`,
        comparisonResult: "N_A",
        rootCauseSubsystem: "STRUCTURAL_SUBSTRATE",
        affectedDiscoveryId: null,
        affectedBundleId: null,
        provenance: `raw-source-fallback.ts region ${result.region.regionId} - no Phase 2B/2D output consulted`,
      });
    }
    if (result.hasCovenantSignal) {
      findings.push({
        ...base,
        findingId: computeFindingId(input.documentId, null, "RAW_SOURCE_COVENANT_SIGNAL", citation),
        structuralNodeKey: null,
      structuralNodeId: null,
        sourceCitation: citation,
        findingType: "RAW_SOURCE_COVENANT_SIGNAL",
        materiality,
        sourceEvidence: result.region.text.slice(0, 400),
        auditorReasoning: `Structurally unavailable raw span independently shows real covenant/economic signals (${signalNames.join(", ")}) that cannot yet be precisely classified because no structural node anchors this text - surfaced rather than silently dropped.`,
        comparisonResult: "N_A",
        rootCauseSubsystem: "STRUCTURAL_SUBSTRATE",
        affectedDiscoveryId: null,
        affectedBundleId: null,
        provenance: `raw-source-fallback.ts region ${result.region.regionId} - no Phase 2B/2D output consulted`,
      });
    }
  }

  return findings;
}
