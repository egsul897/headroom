/**
 * PROVENANCE EXCERPT SOURCE BINDING (provenance-source-binding.v1)
 *
 * Invariant: AUTHORITATIVE PROVENANCE IS ALWAYS SOURCE-ADDRESSABLE. A model may emit an abbreviated or elided excerpt
 * ("LEFT … RIGHT"); model-authored prose becomes authoritative source evidence only when it resolves deterministically to
 * exactly one contiguous span of one admissible source text. This is SOURCE BINDING, never quote repair: the resolver
 * proves "the model's citation refers uniquely to this exact source span" and never infers what the model meant.
 *
 * Normalization is exactly the canonical rule the qualitative-grounding layer already applies (whitespace runs collapse
 * to one space, case-insensitive); every returned excerpt is the ORIGINAL source substring (original whitespace and line
 * wraps) at ORIGINAL offsets. No fuzzy matching, no edit distance, no punctuation changes, no provider calls, no time.
 *
 * Policy (frozen):
 *   - exact excerpt, one occurrence in one source            -> VERBATIM_UNIQUE (bound span)
 *   - exact excerpt, several occurrences                     -> VERBATIM_NON_UNIQUE (the quotation is real; no span claimed)
 *   - exact excerpt shorter than the locating minimum        -> VERBATIM_SHORT (not locating evidence; unchanged)
 *   - exact excerpt occurring nowhere                        -> UNRESOLVED / NOT_IN_SOURCE
 *   - elided excerpt (one or more ellipses): every segment must locate, in order, inside ONE admissible source, and
 *     exactly one ordered chain may exist across all sources; the bound span may not cross an inadmissible boundary;
 *     each segment must be at least MIN_ANCHOR_CHARS normalized chars      -> SOURCE_BOUND_ELIDED (bound span)
 *     anything else                                          -> UNRESOLVED with a deterministic reason
 *   - leading / trailing ellipses are dropped (the excerpt is what remains); an excerpt with no non-empty segment is
 *     DEGENERATE_ELLIPSIS; several interior ellipses are supported only through the same one-unique-chain proof.
 *   - SOURCE TIERS: the candidate's own OPERATIVE text is consulted first (a unit's provenance cites its own provision;
 *     a sibling / referenced copy of the same words in read-only context never makes that quotation ambiguous). The
 *     other admissible sources (resolved source-context regions, context-bundle excerpts) are consulted only when the
 *     excerpt - or one of its anchors - occurs nowhere in the operative text. An ambiguous, reversed or boundary-crossing
 *     operative match is final (it never falls through). Anchors split across the tiers are CROSS_SOURCE.
 */
import { hashParts } from "../hashing";

export const PROVENANCE_SOURCE_BINDING_VERSION = "provenance-source-binding.v1" as const;
/** An elided excerpt's segments must each carry at least this many normalized characters to act as anchors. */
export const MIN_ANCHOR_CHARS = 8;
/** Mirrors qualitative grounding: an exact excerpt shorter than this is not locating evidence. */
export const MIN_LOCATING_CHARS = 12;
/** Chains enumerated beyond this bound are treated as ambiguous (deterministic fail-closed, never a heuristic choice). */
const MAX_CHAINS = 10_000;

export type AdmissibleSourceKind = "OPERATIVE" | "SOURCE_REGION" | "CONTEXT_ITEM";

export interface AdmissibleSourceText {
  /** Stable identity of this text ("operative", a region id, a context item id). */
  sourceKey: string;
  kind: AdmissibleSourceKind;
  documentId: string | null;
  sectionRef: string | null;
  text: string;
  /** Absolute document offset of text[0] when known (>= 0), else null. */
  absCharStart: number | null;
  /** Interior spans (text-relative) a single provenance span may not straddle - e.g. clauses owned by separate candidates. */
  boundaries?: readonly [number, number][];
}

export type ProvenanceResolutionStatus = "VERBATIM_UNIQUE" | "VERBATIM_NON_UNIQUE" | "VERBATIM_SHORT" | "SOURCE_BOUND_ELIDED" | "UNRESOLVED";
export type ProvenanceResolutionReason =
  | "NOT_IN_SOURCE" | "NO_ADMISSIBLE_SOURCE" | "DEGENERATE_ELLIPSIS" | "ANCHOR_TOO_SHORT" | "LEFT_ANCHOR_MISSING" | "RIGHT_ANCHOR_MISSING" | "SEGMENT_MISSING"
  | "CROSS_SOURCE" | "REVERSED_ANCHORS" | "AMBIGUOUS_SPAN" | "CROSSES_INADMISSIBLE_BOUNDARY";

export interface ProvenanceExcerptResolution {
  version: typeof PROVENANCE_SOURCE_BINDING_VERSION;
  status: ProvenanceResolutionStatus;
  reason: ProvenanceResolutionReason | null;
  detail: string;
  /** Number of excerpt segments the model's text split into (1 = no ellipsis). */
  segments: number;
  sourceKey: string | null;
  sourceKind: AdmissibleSourceKind | null;
  sourceDocumentId: string | null;
  sourceSectionRef: string | null;
  /** Source-text-relative span of the bound excerpt (null unless a unique span was proven). */
  charStart: number | null;
  charEnd: number | null;
  absCharStart: number | null;
  absCharEnd: number | null;
  /** sha256 of the bound source substring (null unless bound). */
  boundSha256: string | null;
}

export interface ProvenanceResolutionOutcome {
  resolution: ProvenanceExcerptResolution;
  /** The authoritative excerpt: the exact source substring when bound, the verbatim model text when VERBATIM_*, null when UNRESOLVED. */
  authoritativeExcerpt: string | null;
}

interface NormalizedText { norm: string; map: number[] }

/** Canonical normalization with an index map back to the original text (norm[i] came from original[map[i]]). */
export function normalizeWithMap(text: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) { pendingSpace = chars.length > 0; continue; }
    if (pendingSpace) { chars.push(" "); map.push(i - 1); pendingSpace = false; }
    chars.push(ch.toLowerCase()); map.push(i);
  }
  return { norm: chars.join(""), map };
}

const ELLIPSIS = /\s*(?:\.{3,}|…|(?:\.\s+){2,}\.)\s*/;

/** The excerpt's segments after splitting on ellipses; leading/trailing empty segments are dropped. */
export function splitExcerptSegments(excerpt: string): { segments: string[]; hadEllipsis: boolean } {
  const parts = excerpt.split(ELLIPSIS);
  const hadEllipsis = parts.length > 1;
  const segments = parts.map((p) => p.replace(/\s+/g, " ").trim().toLowerCase()).filter((p) => p.length > 0);
  return { segments, hadEllipsis };
}

function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (needle.length === 0) return out;
  let i = hay.indexOf(needle);
  while (i >= 0) { out.push(i); i = hay.indexOf(needle, i + 1); }
  return out;
}

function crossesBoundary(start: number, end: number, boundaries: readonly [number, number][] | undefined): boolean {
  if (!boundaries) return false;
  return boundaries.some(([a, b]) => start < b && a < end && !(start >= a && end <= b));
}

interface Chain { source: AdmissibleSourceText; normStart: number; normEnd: number }

/** Every ordered chain of segment occurrences inside one normalized source (segment i+1 starts at or after segment i ends). */
function chainsIn(source: AdmissibleSourceText, nt: NormalizedText, segments: string[]): { chains: Chain[]; perSegment: number[][]; overflow: boolean } {
  const perSegment = segments.map((s) => occurrences(nt.norm, s));
  const chains: Chain[] = [];
  let overflow = false;
  const walk = (i: number, minStart: number, start: number) => {
    if (overflow) return;
    if (i === segments.length) { chains.push({ source, normStart: start, normEnd: minStart }); if (chains.length > MAX_CHAINS) overflow = true; return; }
    for (const pos of perSegment[i]!) {
      if (pos < minStart) continue;
      walk(i + 1, pos + segments[i]!.length, i === 0 ? pos : start);
    }
  };
  if (perSegment.every((o) => o.length > 0)) walk(0, 0, 0);
  return { chains, perSegment, overflow };
}

function dedupeSources(sources: readonly AdmissibleSourceText[]): { source: AdmissibleSourceText; nt: NormalizedText }[] {
  const seen = new Set<string>();
  const out: { source: AdmissibleSourceText; nt: NormalizedText }[] = [];
  for (const s of sources) {
    const nt = normalizeWithMap(s.text);
    if (nt.norm.length === 0 || seen.has(nt.norm)) continue;
    seen.add(nt.norm);
    out.push({ source: s, nt });
  }
  return out;
}

function unresolved(reason: ProvenanceResolutionReason, detail: string, segments: number): ProvenanceResolutionOutcome {
  return { authoritativeExcerpt: null, resolution: { version: PROVENANCE_SOURCE_BINDING_VERSION, status: "UNRESOLVED", reason, detail, segments, sourceKey: null, sourceKind: null, sourceDocumentId: null, sourceSectionRef: null, charStart: null, charEnd: null, absCharStart: null, absCharEnd: null, boundSha256: null } };
}

function bound(status: "VERBATIM_UNIQUE" | "SOURCE_BOUND_ELIDED", chain: Chain, nt: NormalizedText, segments: number, detail: string): ProvenanceResolutionOutcome {
  const charStart = nt.map[chain.normStart]!;
  const charEnd = nt.map[chain.normEnd - 1]! + 1;
  const excerpt = chain.source.text.slice(charStart, charEnd);
  const abs = chain.source.absCharStart !== null && chain.source.absCharStart >= 0 ? chain.source.absCharStart : null;
  return { authoritativeExcerpt: excerpt, resolution: { version: PROVENANCE_SOURCE_BINDING_VERSION, status, reason: null, detail, segments, sourceKey: chain.source.sourceKey, sourceKind: chain.source.kind, sourceDocumentId: chain.source.documentId, sourceSectionRef: chain.source.sectionRef, charStart, charEnd, absCharStart: abs === null ? null : abs + charStart, absCharEnd: abs === null ? null : abs + charEnd, boundSha256: hashParts([excerpt]) } };
}

const ABSENT: ReadonlySet<ProvenanceResolutionReason> = new Set(["NOT_IN_SOURCE", "LEFT_ANCHOR_MISSING", "RIGHT_ANCHOR_MISSING", "SEGMENT_MISSING", "NO_ADMISSIBLE_SOURCE"]);

/**
 * Resolve one model-authored excerpt against the admissible sources (tiered: OPERATIVE first, the rest only when the
 * excerpt is absent from the operative text). Pure and deterministic.
 */
export function resolveProvenanceExcerpt(excerpt: string, sources: readonly AdmissibleSourceText[]): ProvenanceResolutionOutcome {
  const operative = sources.filter((s) => s.kind === "OPERATIVE");
  const others = sources.filter((s) => s.kind !== "OPERATIVE");
  const first = resolveAgainst(excerpt, operative);
  if (first.resolution.status !== "UNRESOLVED" || !first.resolution.reason || !ABSENT.has(first.resolution.reason) || others.length === 0) return first;
  const second = resolveAgainst(excerpt, others);
  if (second.resolution.status !== "UNRESOLVED") return second;
  // anchors split across the tiers (some only in the operative text, the rest only elsewhere) are a cross-source citation
  const { segments } = splitExcerptSegments(excerpt);
  if (segments.length > 1 && second.resolution.reason && ABSENT.has(second.resolution.reason)) {
    const opNorm = dedupeSources(operative).map((d) => d.nt.norm), otNorm = dedupeSources(others).map((d) => d.nt.norm);
    const inOp = segments.map((g) => opNorm.some((n) => n.includes(g))), inOt = segments.map((g) => otNorm.some((n) => n.includes(g)));
    if (segments.every((_, i) => inOp[i] || inOt[i]) && inOp.some(Boolean) && inOt.some((x, i) => x && !inOp[i])) return unresolved("CROSS_SOURCE", "the anchors occur only across different admissible sources; a provenance span never spans sources", segments.length);
  }
  return second;
}

function resolveAgainst(excerpt: string, sources: readonly AdmissibleSourceText[]): ProvenanceResolutionOutcome {
  const { segments, hadEllipsis } = splitExcerptSegments(excerpt);
  if (segments.length === 0) return unresolved("DEGENERATE_ELLIPSIS", "the excerpt carries no text outside its ellipses", 0);
  const deduped = dedupeSources(sources);
  if (deduped.length === 0) return unresolved("NO_ADMISSIBLE_SOURCE", "no admissible source text was supplied", segments.length);

  // ---- exact (single-segment) excerpt
  if (!hadEllipsis || segments.length === 1) {
    const needle = segments[0]!;
    if (needle.length < MIN_LOCATING_CHARS) {
      return { authoritativeExcerpt: excerpt, resolution: { version: PROVENANCE_SOURCE_BINDING_VERSION, status: "VERBATIM_SHORT", reason: null, detail: `exact excerpt shorter than ${MIN_LOCATING_CHARS} normalized chars is not locating evidence; kept verbatim`, segments: 1, sourceKey: null, sourceKind: null, sourceDocumentId: null, sourceSectionRef: null, charStart: null, charEnd: null, absCharStart: null, absCharEnd: null, boundSha256: null } };
    }
    const hits: Chain[] = [];
    for (const { source, nt } of deduped) for (const pos of occurrences(nt.norm, needle)) hits.push({ source, normStart: pos, normEnd: pos + needle.length });
    if (hits.length === 0) return unresolved("NOT_IN_SOURCE", "the exact excerpt occurs in no admissible source text", 1);
    if (hits.length === 1) {
      const h = hits[0]!;
      const nt = deduped.find((d) => d.source === h.source)!.nt;
      if (crossesBoundary(nt.map[h.normStart]!, nt.map[h.normEnd - 1]! + 1, h.source.boundaries)) return unresolved("CROSSES_INADMISSIBLE_BOUNDARY", "the only occurrence straddles an inadmissible source boundary", 1);
      return bound("VERBATIM_UNIQUE", h, nt, 1, "exact excerpt located once; bound to its source span");
    }
    return { authoritativeExcerpt: excerpt, resolution: { version: PROVENANCE_SOURCE_BINDING_VERSION, status: "VERBATIM_NON_UNIQUE", reason: null, detail: "exact excerpt occurs more than once in the admissible source; the quotation is verbatim but no single span is claimed", segments: 1, sourceKey: null, sourceKind: null, sourceDocumentId: null, sourceSectionRef: null, charStart: null, charEnd: null, absCharStart: null, absCharEnd: null, boundSha256: null } };
  }

  // ---- elided excerpt: every segment is an anchor
  const short = segments.findIndex((s) => s.length < MIN_ANCHOR_CHARS);
  if (short >= 0) return unresolved("ANCHOR_TOO_SHORT", `segment ${short + 1} ("${segments[short]}") is shorter than ${MIN_ANCHOR_CHARS} normalized chars and cannot anchor a span`, segments.length);
  const presentAnywhere = segments.map((s) => deduped.some((d) => d.nt.norm.includes(s)));
  if (!presentAnywhere[0]) return unresolved("LEFT_ANCHOR_MISSING", "the left anchor occurs in no admissible source text", segments.length);
  if (!presentAnywhere[segments.length - 1]) return unresolved("RIGHT_ANCHOR_MISSING", "the right anchor occurs in no admissible source text", segments.length);
  const missingMid = presentAnywhere.findIndex((p) => !p);
  if (missingMid >= 0) return unresolved("SEGMENT_MISSING", `segment ${missingMid + 1} occurs in no admissible source text`, segments.length);

  const all: Chain[] = [];
  const crossing: Chain[] = [];
  let sameSourceAll = false;
  let overflow = false;
  const ntOf = new Map<AdmissibleSourceText, NormalizedText>();
  for (const { source, nt } of deduped) {
    ntOf.set(source, nt);
    const r = chainsIn(source, nt, segments);
    if (r.overflow) overflow = true;
    if (r.perSegment.every((o) => o.length > 0)) sameSourceAll = true;
    for (const c of r.chains) {
      if (crossesBoundary(nt.map[c.normStart]!, nt.map[c.normEnd - 1]! + 1, source.boundaries)) crossing.push(c); else all.push(c);
    }
  }
  if (overflow) return unresolved("AMBIGUOUS_SPAN", `more than ${MAX_CHAINS} ordered anchor chains; the span is not uniquely provable`, segments.length);
  if (all.length === 1) return bound("SOURCE_BOUND_ELIDED", all[0]!, ntOf.get(all[0]!.source)!, segments.length, `elided model excerpt (${segments.length} segments) bound deterministically to the one contiguous source span satisfying every anchor in order`);
  if (all.length > 1) return unresolved("AMBIGUOUS_SPAN", `${all.length} contiguous source spans satisfy the anchors in order; no span is chosen`, segments.length);
  if (crossing.length > 0) return unresolved("CROSSES_INADMISSIBLE_BOUNDARY", `the only span(s) satisfying the anchors straddle an inadmissible source boundary`, segments.length);
  if (!sameSourceAll) return unresolved("CROSS_SOURCE", "the anchors occur only in different admissible sources; a provenance span never spans sources", segments.length);
  return unresolved("REVERSED_ANCHORS", "the anchors occur in one source but never in excerpt order", segments.length);
}
