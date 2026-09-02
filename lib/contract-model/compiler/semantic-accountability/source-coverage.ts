/**
 * SOURCE COVERAGE (Pass A trust boundary, v3).
 *
 * WHAT QUESTION THIS ANSWERS
 * --------------------------
 *   "What source material in this semantic unit has no semantic disposition?"
 *
 * NOT:
 *   "What source material MATCHING MY HEURISTIC VOCABULARY has no disposition?"
 *
 * The v2 detector this replaces answered the second question. It required a
 * span to clear five conjunctive filters - a closed connective vocabulary, a
 * 40-character floor, a 50%-coverage threshold, a punctuation boundary, and
 * the region literally named "operative" - before it was even ELIGIBLE to be
 * reported as a gap. An independent audit demonstrated that each filter alone
 * was sufficient to silence a material omission.
 *
 * THE INVERSION
 * -------------
 * Source is PRESUMED ACCOUNTABLE. Every character of every region in the
 * semantic unit is assigned one deterministic coverage disposition, and the
 * DEFAULT is UNACCOUNTED_SOURCE. A span leaves that default only when
 * deterministic logic can positively show one of:
 *   - an inventory item anchors it (COVERED_BY_INVENTORY);
 *   - it is a lead-in whose enumerated children are all accounted, and it
 *     carries no quantitative value of its own (COVERED_BY_CHILD_DESCENT);
 *   - another semantic unit owns it, by an explicit recorded link
 *     (ACCOUNTED_BY_EXTERNAL_UNIT);
 *   - it is deterministically non-semantic: punctuation, a bare enumerator or
 *     closed-class connective glue, a heading/label, a bare citation, a
 *     defined-term label, or page/TOC furniture.
 *
 * Heuristics here RANK AND SUPPRESS OBVIOUS NOISE. They never define the
 * trust boundary: nothing about a span's length, vocabulary, region label or
 * value type can make material text ineligible for scrutiny.
 *
 * INDEPENDENCE: this file derives only from source text + accepted item
 * spans. It imports no IR, no composition, no verifier (enforced by
 * tests/contract-model/semantic-accountability-independence.test.ts).
 */
import { scanQuantitativeValues } from "./quantitative";
import type { QuantitativeValue, SourceContextRegion } from "./types";

// ---------------------------------------------------------------------------
// Dispositions
// ---------------------------------------------------------------------------

export const COVERAGE_DISPOSITIONS = [
  "COVERED_BY_INVENTORY",
  "COVERED_BY_CHILD_DESCENT",
  "ACCOUNTED_BY_EXTERNAL_UNIT",
  "STRUCTURAL_NOISE",
  "HEADING_OR_LABEL",
  "CITATION_ONLY",
  "DEFINED_TERM_LABEL",
  "PUNCTUATION_OR_DELIMITER",
  "NON_SEMANTIC_FORMATTING",
  "UNACCOUNTED_SOURCE",
] as const;
export type CoverageDisposition = (typeof COVERAGE_DISPOSITIONS)[number];

/** The dispositions that discharge accountability. Everything else - and anything unclassified - blocks. */
const ACCOUNTED: ReadonlySet<CoverageDisposition> = new Set<CoverageDisposition>([
  "COVERED_BY_INVENTORY",
  "COVERED_BY_CHILD_DESCENT",
  "ACCOUNTED_BY_EXTERNAL_UNIT",
  "STRUCTURAL_NOISE",
  "HEADING_OR_LABEL",
  "CITATION_ONLY",
  "DEFINED_TERM_LABEL",
  "PUNCTUATION_OR_DELIMITER",
  "NON_SEMANTIC_FORMATTING",
]);

export const isAccountedDisposition = (d: CoverageDisposition): boolean => ACCOUNTED.has(d);

/** One accounted-for stretch of source. Spans tile each region completely: every non-whitespace character belongs to exactly one. */
export interface SourceCoverageSpan {
  regionId: string;
  charStart: number;
  charEnd: number;
  disposition: CoverageDisposition;
  /** Why this disposition was assigned - always populated, so an UNACCOUNTED_SOURCE span can be read without re-deriving it. */
  reason: string;
  excerpt: string;
  /** Quantitative values located inside this span. */
  values: QuantitativeValue[];
  /** For COVERED_BY_EXTERNAL_UNIT: the unit that owns it. */
  externalOwnerRef?: string;
}

export interface SourceCoverageResult {
  spans: SourceCoverageSpan[];
  /** Spans that nothing accounts for - the trust-boundary output. */
  unaccounted: SourceCoverageSpan[];
  /** Values not inside any accounting item span AND not inside a deterministically non-semantic span. */
  unaccountedValues: (QuantitativeValue & { regionId: string })[];
  countsByDisposition: Record<CoverageDisposition, number>;
  /** Non-whitespace characters per disposition - the honest denominator for "how much source is accounted for". */
  charsByDisposition: Record<CoverageDisposition, number>;
  regionsConsidered: string[];
}

/** An accepted inventory item's span, as this layer sees it: text, position, and whether it accounts for anything. */
export interface AccountingSpanInput {
  regionId: string;
  charStart: number;
  charEnd: number;
  /** Only CRITICAL/MATERIAL items account for source; an INFORMATIONAL or REVIEW_UNCERTAIN echo never closes a gap. */
  materiality: string;
}

/** An explicit, recorded statement that another semantic unit owns a dependency region's semantics (§9 option A). */
export interface ExternalAccountabilityLink {
  regionId: string;
  /** The candidateRef of the unit that inventories this region's own semantics. */
  ownerCandidateRef: string;
  /** Deterministic proof the owner exists - normally the owner's frozenContentHash. Absent => the link does not discharge anything. */
  ownerInventoryHash: string;
}

export interface SourceCoverageInput {
  regions: SourceContextRegion[];
  spans: AccountingSpanInput[];
  externalAccountability?: ExternalAccountabilityLink[];
}

// ---------------------------------------------------------------------------
// Structural segmentation (§5) - boundaries, not a vocabulary
// ---------------------------------------------------------------------------

/** Enumerators in the shapes real documents use: (a) (iv) (12) (A) as well as bare "1." / "(a)" at a line start. */
const ENUMERATOR_SRC = String.raw`\((?:[a-zA-Z]{1,3}|[ivxlcdmIVXLCDM]{1,6}|\d{1,3})\)|\d{1,3}\.(?=\s)`;
const ENUMERATOR_AT_START = new RegExp(String.raw`^\s*(?:${ENUMERATOR_SRC})\s*`);

/**
 * Splits region text into accountable structural units. Boundaries are
 * STRUCTURAL, never a word list: sentence/clause terminators, line breaks,
 * and enumerator starts. A short clause is a unit exactly like a long one -
 * there is no length floor anywhere in this function.
 */
export function segmentSourceUnits(text: string, protectedRanges: { charStart: number; charEnd: number }[] = []): { charStart: number; charEnd: number }[] {
  const boundaries = new Set<number>([0, text.length]);
  // After a clause terminator followed by whitespace.
  for (const m of text.matchAll(/[.;:!?]["')\]]?\s+/g)) boundaries.add(m.index! + m[0].length);
  // At every line break (a table row / bulleted basket is not one unit - audit finding 7).
  for (const m of text.matchAll(/\n+[ \t]*/g)) boundaries.add(m.index! + m[0].length);
  // Immediately before an enumerator, wherever it appears.
  for (const m of text.matchAll(new RegExp(String.raw`(?:^|[\s(])(?=(?:${ENUMERATOR_SRC}))`, "g"))) boundaries.add(m.index! + m[0].length);
  // Before a dash-introduced aside (em dash / spaced hyphen), which carves out exceptions in real drafting.
  for (const m of text.matchAll(/\s+[–—-]\s+/g)) boundaries.add(m.index! + m[0].length);
  // After a comma. A comma-delimited aside is where drafting hides a qualifier inside a lead-in ("... plus,
  // without duplication and to the extent deducted ..., the sum of"). Splitting there costs nothing - glue-only
  // fragments classify as STRUCTURAL_NOISE - and it stops a lead-in's discharge from ever reaching a qualifier.
  for (const m of text.matchAll(/,\s+/g)) boundaries.add(m.index! + m[0].length);
  // Never split inside a quantitative value ("March 31, 2030", "$5,000,000"): a value must stay inside one unit
  // so it can be attributed to the span that holds it.
  const sorted = [...boundaries].filter((b) => !protectedRanges.some((r) => b > r.charStart && b < r.charEnd)).sort((a, b) => a - b);
  const out: { charStart: number; charEnd: number }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (b > a && text.slice(a, b).trim().length > 0) out.push({ charStart: a, charEnd: b });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic non-semantic classification (§3, §6)
// ---------------------------------------------------------------------------

/**
 * Closed-class English function words. A fragment built ONLY from these,
 * enumerators and punctuation carries no proposition of its own - it is the
 * glue segmentation left behind when it split a parent unit. This list can
 * only ever move a fragment OUT of scrutiny when the fragment contains no
 * content word and no value, so it cannot hide a proposition: every content
 * word in the language is outside it by construction.
 */
const FUNCTION_WORDS = new Set([
  // determiners, pronouns, prepositions, auxiliaries - pure grammar
  "a", "an", "and", "andor", "any", "are", "as", "at", "be", "been", "being", "both", "but", "by", "each", "either", "for", "from", "hereby", "hereof", "hereto", "hereunder", "in", "into", "is", "it", "its", "of", "on", "or", "other", "over", "per", "such", "than", "that", "the", "their", "then", "there", "thereof", "thereto", "thereunder", "these", "this", "those", "to", "under", "was", "were", "which", "who", "whom", "whose", "with", "within", "without",
  // structural lead-in nouns that introduce a list and carry no proposition alone
  "following", "clause", "clauses", "paragraph", "paragraphs", "section", "sections", "subsection", "subsections", "article", "articles", "annex", "exhibit", "schedule", "appendix",
  // subordinating connectives. Each REQUIRES a complement to say anything: "provided that" and ", except that,"
  // are the glue segmentation leaves between two anchored clauses (mission §6 names them explicitly). A real
  // proviso or exception always carries a content word of its own besides these, so this can never hide one.
  "provided", "except", "unless", "including", "subject", "notwithstanding", "however", "pursuant", "whereas",
  // adverbial adjuncts. An adjunct modifies a proposition and cannot head one; a residue made only of these
  // sits beside text an item already anchors.
  "solely", "only", "also", "otherwise", "further", "respectively", "generally", "collectively", "individually",
  "directly", "indirectly", "together", "jointly", "severally", "hereinafter", "aforesaid", "foregoing", "above", "below",
  // arithmetic connectives joining formula components an item already anchors ("... plus, ...", ", the sum of").
  // A residue carrying an actual amount is never dismissed here - the value guard runs first.
  "plus", "minus", "less", "sum", "difference", "product", "quotient",
]);

const WORD_RE = /[A-Za-z][A-Za-z'-]*/g;

/** Strips enumerators and punctuation, returning the content words of a fragment. */
function contentWords(fragment: string): string[] {
  const words = fragment.replace(new RegExp(ENUMERATOR_SRC, "g"), " ").match(WORD_RE) ?? [];
  return words.map((w) => w.toLowerCase().replace(/[^a-z]/g, "")).filter((w) => w.length > 0 && !FUNCTION_WORDS.has(w));
}

/** "Section 6.02", "clause (iv)", "Schedule 1.01(a)" and nothing else. */
const CITATION_ONLY_RE = /^[\s(]*(?:see\s+)?(?:section|clause|paragraph|subsection|article|annex|exhibit|schedule|appendix)s?\s*[\dA-Za-z.()–—-]*\s*[.,;:)]*\s*$/i;
/** A heading or caption: no clause terminator inside, and either a numbered caption ("Section 7.11.", "6.02 Liens.") or an ALL-CAPS/Title-Case caption line. */
const NUMBERED_CAPTION_RE = /^\s*(?:section|article|annex|exhibit|schedule|appendix)?\s*\d+(?:\.\d+)*\s*[.:)]?\s*[A-Za-z][\w\s,'&/-]{0,80}?\s*[.:]?\s*$/i;
const ALLCAPS_CAPTION_RE = /^\s*[A-Z][A-Z0-9\s,'&/.-]{2,80}\s*$/;
/** Page furniture: "Page 12", "12 of 40", "- 12 -", a lone number, a dotted TOC leader line. */
const PAGE_FURNITURE_RE = /^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|[-–—\s]*\d+[-–—\s]*|\d+\s+of\s+\d+)\s*$/i;
const TOC_LEADER_RE = /\.{4,}\s*\d+\s*$/;
/** A defined-term label with no operative body: `"Permitted Liens"` or `"Permitted Liens" means` on its own. */
const DEFINED_TERM_LABEL_RE = /^\s*[“"][^”"]{1,120}[”"]\s*(?:means|shall\s+mean|has\s+the\s+meaning[^.]*)?\s*[.:;,]?\s*$/i;

/**
 * Classifies a fragment that no inventory item anchors. Returns
 * UNACCOUNTED_SOURCE unless a deterministic rule positively excludes it -
 * the conservative default required by §4 and §15.
 */
export function classifyUnaccountedFragment(fragment: string, values: QuantitativeValue[]): { disposition: CoverageDisposition; reason: string } {
  const trimmed = fragment.trim();
  if (trimmed.length === 0) return { disposition: "PUNCTUATION_OR_DELIMITER", reason: "whitespace only" };
  if (!/[A-Za-z0-9]/.test(trimmed)) return { disposition: "PUNCTUATION_OR_DELIMITER", reason: "punctuation and delimiters only, no alphanumeric content" };

  // A fragment carrying a quantitative value is never dismissed as noise, whatever its shape.
  if (values.length === 0) {
    if (PAGE_FURNITURE_RE.test(trimmed) || TOC_LEADER_RE.test(trimmed)) return { disposition: "NON_SEMANTIC_FORMATTING", reason: "page or table-of-contents furniture" };
    if (CITATION_ONLY_RE.test(trimmed)) return { disposition: "CITATION_ONLY", reason: "a bare cross-reference with no proposition of its own" };
    if (DEFINED_TERM_LABEL_RE.test(trimmed)) return { disposition: "DEFINED_TERM_LABEL", reason: "a quoted defined-term label with no operative body" };
    const words = contentWords(trimmed);
    if (words.length === 0) return { disposition: "STRUCTURAL_NOISE", reason: "enumerators, punctuation and closed-class connectives only - the residue of splitting a parent unit" };
    // Headings carry no clause terminator and no verb-bearing body; require BOTH the caption shape and the absence of an internal terminator.
    // A caption has no SENTENCE terminator inside it. A decimal point inside a section number ("7.04") is not one,
    // so the terminator must be followed by whitespace to count.
    const noInternalTerminator = !/[.;:!?]\s+\S/.test(trimmed);
    if (noInternalTerminator && (ALLCAPS_CAPTION_RE.test(trimmed) || NUMBERED_CAPTION_RE.test(trimmed))) return { disposition: "HEADING_OR_LABEL", reason: "a section caption or heading line" };
  }
  return {
    disposition: "UNACCOUNTED_SOURCE",
    reason: values.length > 0
      ? `no inventory item anchors this text, and it carries ${values.length} quantitative value(s) (${values.map((v) => v.rawText).join(", ")}) - materiality undetermined, never assumed immaterial`
      : "no inventory item anchors this text and no deterministic rule classifies it as non-semantic - materiality undetermined, never assumed immaterial",
  };
}

// ---------------------------------------------------------------------------
// The coverage pass
// ---------------------------------------------------------------------------

const emptyCounts = (): Record<CoverageDisposition, number> => Object.fromEntries(COVERAGE_DISPOSITIONS.map((d) => [d, 0])) as Record<CoverageDisposition, number>;

const accountsForSource = (materiality: string): boolean => materiality === "CRITICAL" || materiality === "MATERIAL";

/**
 * Computes source coverage over EVERY region of the semantic unit.
 *
 * There is no region-kind filter, no length floor, no vocabulary gate and no
 * coverage threshold: partial coverage of a unit yields residue spans that
 * are themselves classified, so half of a boundary-free sentence can never
 * disappear behind one broad item span.
 */
export function computeSourceCoverage(input: SourceCoverageInput): SourceCoverageResult {
  const external = new Map((input.externalAccountability ?? []).filter((l) => l.ownerCandidateRef && l.ownerInventoryHash).map((l) => [l.regionId, l]));
  const spans: SourceCoverageSpan[] = [];

  for (const region of input.regions) {
    const text = region.text;
    const regionValues = scanQuantitativeValues(text);
    const valuesIn = (a: number, b: number) => regionValues.filter((v) => v.charStart >= a && v.charEnd <= b);
    const link = external.get(region.regionId);
    if (link) {
      spans.push({ regionId: region.regionId, charStart: 0, charEnd: text.length, disposition: "ACCOUNTED_BY_EXTERNAL_UNIT", reason: `semantics owned by unit ${link.ownerCandidateRef} (inventory ${link.ownerInventoryHash})`, excerpt: text, values: regionValues, externalOwnerRef: link.ownerCandidateRef });
      continue;
    }

    const mask = new Uint8Array(text.length);
    for (const s of input.spans) {
      if (s.regionId !== region.regionId || !accountsForSource(s.materiality)) continue;
      mask.fill(1, Math.max(0, s.charStart), Math.min(text.length, s.charEnd));
    }

    const units = segmentSourceUnits(text, regionValues);
    // Structural ownership (§7): a unit ending in ':' is a chapeau owning the enumerated units that follow it.
    // A lead-in owns the enumerated clauses that follow it. Ownership is STRUCTURAL: the parent of an enumerated
    // unit is the nearest preceding non-enumerated unit, whether or not the lead-in ends in a colon (real drafting
    // runs "... shall be (a) ... (b) ..." inline just as often as "... as follows:"). No vocabulary is consulted.
    const isEnumerated = units.map((u) => ENUMERATOR_AT_START.test(text.slice(u.charStart, u.charEnd)));
    const parentOf = new Array<number>(units.length).fill(-1);
    for (let i = 0; i < units.length; i++) {
      if (!isEnumerated[i]) continue;
      let j = i - 1;
      while (j >= 0 && isEnumerated[j]) j--;
      if (j >= 0) parentOf[i] = j;
    }

    // Per unit: covered stretches and uncovered residues, each classified on its own.
    const unitSpans: SourceCoverageSpan[][] = [];
    for (const u of units) {
      const local: SourceCoverageSpan[] = [];
      let runStart = u.charStart;
      let runCovered = mask[u.charStart] === 1;
      const flush = (end: number) => {
        if (end <= runStart) return;
        const frag = text.slice(runStart, end);
        if (frag.trim().length === 0) {
          local.push({ regionId: region.regionId, charStart: runStart, charEnd: end, disposition: "PUNCTUATION_OR_DELIMITER", reason: "whitespace between accounted spans", excerpt: frag, values: [] });
          return;
        }
        const vals = valuesIn(runStart, end);
        if (runCovered) local.push({ regionId: region.regionId, charStart: runStart, charEnd: end, disposition: "COVERED_BY_INVENTORY", reason: "anchored by a CRITICAL/MATERIAL inventory item span", excerpt: frag, values: vals });
        else {
          const { disposition, reason } = classifyUnaccountedFragment(frag, vals);
          local.push({ regionId: region.regionId, charStart: runStart, charEnd: end, disposition, reason, excerpt: frag, values: vals });
        }
      };
      for (let k = u.charStart; k < u.charEnd; k++) {
        const covered = mask[k] === 1;
        if (covered !== runCovered) {
          flush(k);
          runStart = k;
          runCovered = covered;
        }
      }
      flush(u.charEnd);
      unitSpans.push(local);
    }

    // Child descent (§7): a chapeau's own unaccounted residue is discharged only when EVERY child it owns is
    // accounted for and the residue carries no quantitative value of its own. Credit flows child -> parent only:
    // a covered parent never discharges an uncovered child (that is exactly the audit's carve-out failure).
    for (let i = 0; i < units.length; i++) {
      const children = parentOf.map((p, j) => (p === i ? j : -1)).filter((j) => j >= 0);
      if (children.length === 0) continue;
      const childrenAccounted = children.every((j) => unitSpans[j]!.every((s) => isAccountedDisposition(s.disposition)));
      if (!childrenAccounted) continue;
      unitSpans[i] = unitSpans[i]!.map((s) =>
        s.disposition === "UNACCOUNTED_SOURCE" && s.values.length === 0
          ? { ...s, disposition: "COVERED_BY_CHILD_DESCENT" as const, reason: `lead-in of an enumerated list whose ${children.length} child clause(s) are each accounted for; carries no quantitative value of its own` }
          : s,
      );
    }
    for (const local of unitSpans) spans.push(...local);
  }

  const merged = mergeAdjacent(spans);
  const unaccounted = merged.filter((s) => s.disposition === "UNACCOUNTED_SOURCE");
  const countsByDisposition = emptyCounts();
  const charsByDisposition = emptyCounts();
  for (const s of merged) {
    countsByDisposition[s.disposition]++;
    charsByDisposition[s.disposition] += s.excerpt.replace(/\s+/g, "").length;
  }
  // A value is unaccounted when no CRITICAL/MATERIAL item anchors it AND the span holding it is not deterministically
  // non-semantic. Every quantitative kind counts - there is no money/percent/ratio shortlist (audit finding 2).
  const unaccountedValues: (QuantitativeValue & { regionId: string })[] = [];
  for (const s of merged) {
    if (s.disposition === "COVERED_BY_INVENTORY" || s.disposition === "ACCOUNTED_BY_EXTERNAL_UNIT") continue;
    if (isAccountedDisposition(s.disposition) && s.disposition !== "COVERED_BY_CHILD_DESCENT") continue;
    for (const v of s.values) unaccountedValues.push({ ...v, regionId: s.regionId });
  }
  return { spans: merged, unaccounted, unaccountedValues, countsByDisposition, charsByDisposition, regionsConsidered: input.regions.map((r) => r.regionId) };
}

/** Merges neighbouring spans that share a disposition, so a gap reads as one coherent stretch of text. */
function mergeAdjacent(spans: SourceCoverageSpan[]): SourceCoverageSpan[] {
  const out: SourceCoverageSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.regionId === s.regionId && last.charEnd === s.charStart && last.disposition === s.disposition) {
      last.charEnd = s.charEnd;
      last.excerpt += s.excerpt;
      last.values = [...last.values, ...s.values];
      continue;
    }
    out.push({ ...s, values: [...s.values] });
  }
  // Trim trailing/leading whitespace off unaccounted spans so an excerpt reads cleanly; offsets stay exact.
  return out.map((s) => {
    if (s.disposition !== "UNACCOUNTED_SOURCE") return s;
    const lead = s.excerpt.length - s.excerpt.trimStart().length;
    const trail = s.excerpt.length - s.excerpt.trimEnd().length;
    return { ...s, charStart: s.charStart + lead, charEnd: s.charEnd - trail, excerpt: s.excerpt.trim() };
  });
}
