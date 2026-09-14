/**
 * Phase 2A - generalized nested-clause structural parser (task §4/§5/§12).
 *
 * Legal drafting nests clauses by MARKER STYLE, not indentation: "(a)" opens
 * a lettered list, "(i)" a roman-numeral list nested inside it, "(A)"/"(1)"
 * a further nested list inside that - but the raw text is flat prose. This
 * module infers real nesting depth from marker style + strict in-sequence
 * position, never from fuzzy string similarity (the same lesson Phase 1A's
 * evaluator work drew from exact structural ancestry: "(a)" and "(A)" are
 * never confused, and a marker is only ever accepted as the CONTINUATION of
 * an open level, or the START of a new nested level, if it is exactly the
 * next value that sequence expects - never a guess).
 *
 * A genuine, disclosed ambiguity: "(i)" is simultaneously a valid single
 * letter (9th of a-z) and the first lower-case roman numeral. This is
 * resolved deterministically by always preferring to CONTINUE the
 * currently-open level's own sequence kind over starting a new nested level,
 * since that is what real legal drafting almost always means (a running
 * a..z list simply continues through "i"), and is a documented, tested
 * limitation, not a silent guess.
 */

export type MarkerSequenceKind = "LOWER_ALPHA" | "LOWER_ROMAN" | "UPPER_ALPHA" | "UPPER_ROMAN" | "NUMERIC";

/** DocumentNodeType values this parser can produce beneath a SECTION - clamped at SUBCLAUSE for any depth beyond 3, since the schema has no deeper first-class level; ancestry beyond that point is still exact (via nodeKey chaining), just represented with a repeated nodeType. */
export type ClauseNodeType = "SUBSECTION" | "CLAUSE" | "SUBCLAUSE";

function nodeTypeForDepth(depth: number): ClauseNodeType {
  if (depth === 1) return "SUBSECTION";
  if (depth === 2) return "CLAUSE";
  return "SUBCLAUSE";
}

function generateRomans(count: number): string[] {
  const values: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"],
    [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  const out: string[] = [];
  for (let n = 1; n <= count; n++) {
    let remaining = n;
    let s = "";
    for (const [value, symbol] of values) {
      while (remaining >= value) {
        s += symbol;
        remaining -= value;
      }
    }
    out.push(s);
  }
  return out;
}

const LOWER_ROMANS = generateRomans(50);
const UPPER_ROMANS = LOWER_ROMANS.map((r) => r.toUpperCase());

interface MarkerCandidate {
  kind: MarkerSequenceKind;
  /** 1-based position within that sequence kind ("a"/"i"/"A"/"1" all = 1). */
  index: number;
}

function classifyMarker(token: string): MarkerCandidate[] {
  const candidates: MarkerCandidate[] = [];
  if (/^[a-z]$/.test(token)) candidates.push({ kind: "LOWER_ALPHA", index: token.charCodeAt(0) - 96 });
  if (/^[A-Z]$/.test(token)) candidates.push({ kind: "UPPER_ALPHA", index: token.charCodeAt(0) - 64 });
  // A real, common legal-drafting convention (observed verbatim in FWRG's
  // own fixture: "...(x); (y); (z); (aa); (bb); (cc)...") continues a
  // lettered list past "z" with a DOUBLED letter, never resetting to a new
  // nested level - "aa" is index 27, "bb" is 28, etc.
  if (/^([a-z])\1$/.test(token)) candidates.push({ kind: "LOWER_ALPHA", index: 26 + (token.charCodeAt(0) - 96) });
  if (/^([A-Z])\1$/.test(token)) candidates.push({ kind: "UPPER_ALPHA", index: 26 + (token.charCodeAt(0) - 64) });
  if (/^\d+$/.test(token)) candidates.push({ kind: "NUMERIC", index: Number(token) });
  const lowerRomanIdx = LOWER_ROMANS.indexOf(token);
  if (lowerRomanIdx >= 0) candidates.push({ kind: "LOWER_ROMAN", index: lowerRomanIdx + 1 });
  const upperRomanIdx = UPPER_ROMANS.indexOf(token);
  if (upperRomanIdx >= 0) candidates.push({ kind: "UPPER_ROMAN", index: upperRomanIdx + 1 });
  return candidates;
}

/** Preferred kind to START a brand-new nested level at a given stack depth, when the marker is ambiguous between a valid start of several kinds - a documented convention (a/i/A/1 ordering), not a claim about any specific document's own style. */
const START_PREFERENCE_BY_DEPTH: MarkerSequenceKind[][] = [
  ["LOWER_ALPHA", "NUMERIC"],
  ["LOWER_ROMAN", "UPPER_ALPHA", "NUMERIC"],
  ["UPPER_ALPHA", "NUMERIC", "UPPER_ROMAN"],
];

/** A single detected marker occurrence in raw text - position is the char offset of the marker's OWN start (the opening paren). */
export interface RawMarkerOccurrence {
  token: string;
  charStart: number;
  charEnd: number;
}

/**
 * Finds candidate clause-marker occurrences in text: a short alphanumeric
 * token in parens, preceded by whitespace, and not immediately followed by
 * another open paren. The whitespace-before requirement is exactly what
 * distinguishes a real clause-marker occurrence (always its own
 * whitespace-separated token: "except: (a)", "of (i) X and (ii) Y") from a
 * compound CITATION like "Section 6.01(a)(i)", which is always written with
 * no space before the parenthesis. Deliberately permissive beyond that: a
 * token that doesn't fit any real sequence (e.g. "(other)", "(the
 * "Company")") is silently rejected later by buildClauseTree's own strict
 * sequence check, so over-detecting candidates here costs nothing.
 */
// Excludes a marker immediately preceded by ", " (comma-space): real
// fixture evidence (FWRG's own text) shows a comma-separated CITATION list
// referencing several already-existing clauses by letter ("...permitted
// under clauses (a) , (i) , (j) , (m) ... of this Section 6.01") is
// textually indistinguishable from a genuine new list item UNLESS this
// distinction is made - real new list items in this corpus are
// consistently semicolon-separated ("(a) ...; (b) ...; (c) ..."), never
// comma-separated. A disclosed, real limitation: a document that DOES use
// commas to separate genuine list items would not be handled by this rule.
/**
 * F-2: the comma exclusion targets INLINE enumeration ("..., (b) the declaration ...") and is limited to
 * horizontal whitespace; a label that begins a new line after a lead-in ending in a comma
 * ("in each case without duplication,\n(a) franchise ...") is a list item, never an inline reference.
 */
const MARKER_OCCURRENCE = /(?<!,[ \t])(?<=^|\s)\(([a-zA-Z]{1,7}|\d{1,3})\)(?!\()/g;

export function findRawMarkerOccurrences(text: string): RawMarkerOccurrence[] {
  const out: RawMarkerOccurrence[] = [];
  const re = new RegExp(MARKER_OCCURRENCE.source, MARKER_OCCURRENCE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ token: m[1] ?? "", charStart: m.index, charEnd: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * Phase 3 Chewy remediation F-2 - a local label such as (a), (b), (1), (A) does
 * NOT determine structural level by itself. Two pieces of positive structural
 * context are consulted before a marker occurrence is treated as a list label:
 *
 * 1. LEGAL NUMBERING GRAMMAR - inline cross-references and spelled numerals
 *    carry the same "(x)" token shape as list labels but are prose, never
 *    structure: "clauses (i) through (iv) above", "this clause (b) shall not",
 *    "sixty (60) days". A marker immediately preceded (across whitespace and
 *    line breaks) by a reference lead-in word or a number word, or immediately
 *    followed by a range/position word, is an inline reference and is skipped.
 *    This is grammar of legal drafting, not an enumeration of any agreement.
 *
 * 2. LIST CONTINUATION / SOURCE BOUNDARIES - a paragraph break followed by
 *    ordinary prose (a hanging paragraph) between two labels means the innermost
 *    nested list was closed and the enclosing item's own text resumed. A NEW
 *    label family that starts after such a paragraph therefore belongs to the
 *    enclosing level, not beneath the last item of the closed list. A
 *    continuation of the innermost list (the item merely had two paragraphs) is
 *    unaffected: continuation is always checked first.
 */
const REFERENCE_LEAD_IN = /\b(?:clauses?|paragraphs?|sub-?paragraphs?|subsections?|sections?|sub-?clauses?|items?|through|thru|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s*$/i;
const REFERENCE_TRAILING = /^\s*(?:through|thru|above|below|hereof|thereof|of\s+(?:this|the|such)\s+(?:section|clause|paragraph|subsection|definition|agreement)\b)/i;
/** A reference chain: "clauses (9) or (10)", "subclauses (A) and (B)", "(a) through (f)" - a marker joined to a preceding inline-reference marker only by a comma/conjunction/range word is part of the same reference. */
const REFERENCE_CHAIN_JOIN = /^\s*(?:,|and|or|and\/or|through|thru|to)\s*$/i;
const PAGE_MARKER_LINE = /^[ \t]*-\d+-[ \t]*$/;

/** True when the "(x)" occurrence is an inline cross-reference or spelled numeral rather than a list label (mechanism 1 above). */
export function isInlineReferenceMarker(text: string, occ: RawMarkerOccurrence): boolean {
  if (REFERENCE_LEAD_IN.test(text.slice(Math.max(0, occ.charStart - 40), occ.charStart))) return true;
  if (REFERENCE_TRAILING.test(text.slice(occ.charEnd, occ.charEnd + 16))) return true;
  return false;
}

/** The marker occurrences that are structural labels: every occurrence minus inline references, where reference status propagates along a comma/conjunction/range chain ("clauses (9) or (10)"). */
export function structuralMarkerOccurrences(text: string): RawMarkerOccurrence[] {
  const all = findRawMarkerOccurrences(text);
  const out: RawMarkerOccurrence[] = [];
  let prev: RawMarkerOccurrence | null = null;
  let prevWasReference = false;
  for (const occ of all) {
    const chained: boolean = prev !== null && prevWasReference && REFERENCE_CHAIN_JOIN.test(text.slice(prev.charEnd, occ.charStart));
    const isReference: boolean = chained || isInlineReferenceMarker(text, occ);
    if (!isReference) out.push(occ);
    prev = occ;
    prevWasReference = isReference;
  }
  return out;
}

/** True when the text between two labels contains a paragraph break followed by ordinary prose (mechanism 2 above); page-marker lines and the next label itself never count as prose. */
export function hasHangingParagraph(text: string, from: number, to: number, isLabelStart: (pos: number) => boolean): boolean {
  const gap = text.slice(from, to);
  const boundary = /\n[ \t]*\n/g;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(gap)) !== null) {
    let p = from + m.index + m[0].length;
    for (;;) {
      while (p < to && /\s/.test(text[p]!)) p++;
      const lineEnd = text.indexOf("\n", p);
      const line = text.slice(p, lineEnd === -1 || lineEnd > to ? to : lineEnd);
      if (p < to && PAGE_MARKER_LINE.test(line)) { p += line.length; continue; }
      break;
    }
    if (p >= to) continue;
    if (!isLabelStart(p)) return true;
  }
  return false;
}

export interface ClauseTreeNode {
  nodeType: ClauseNodeType;
  /** The marker text alone, e.g. "(a)" - callers compose this with the parent's own ref to build a fully-qualified nodeKey. */
  marker: string;
  charStart: number;
  /** End of the marker token itself, not the clause's owned text span - callers compute owned spans across the whole node list once every node in a section is known. */
  markerCharEnd: number;
  depth: number;
  parentMarkerPath: string[];
}

interface OpenLevel {
  kind: MarkerSequenceKind;
  lastIndex: number;
  /** Ancestor path shared by EVERY sibling at this level - fixed when the level is created, never mutated by later siblings. */
  ancestorPath: string[];
  /** The most recently emitted marker at this level (e.g. "(d)") - becomes the parent-path prefix for any new child level opened beneath it. */
  lastMarker: string;
}

/**
 * Builds the nested clause structure for ONE section's own text (relative
 * offsets into that text - callers add the section's own charStart to get
 * absolute document offsets). Exact-sequence-only: a marker is accepted as
 * a sibling of the current level only if it is precisely that level's next
 * value, as a child only if it is precisely a new sequence's start value,
 * or as a return to an already-open outer level only if it precisely
 * continues that level's own next value - never a fuzzy or positional
 * guess.
 */
export function buildClauseTree(sectionText: string): ClauseTreeNode[] {
  const occurrences = structuralMarkerOccurrences(sectionText);
  const labelStarts = new Set(occurrences.map((o) => o.charStart));
  const nodes: ClauseTreeNode[] = [];
  const stack: OpenLevel[] = [];
  let previousLabelEnd = 0;

  for (const occ of occurrences) {
    const candidates = classifyMarker(occ.token);
    if (candidates.length === 0) continue;

    const marker = `(${occ.token})`;
    const hangingParagraphBefore = hasHangingParagraph(sectionText, previousLabelEnd, occ.charStart, (pos) => labelStarts.has(pos));
    previousLabelEnd = occ.charEnd;

    // 1. Continue the current (deepest open) level.
    if (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const cont = candidates.find((c) => c.kind === top.kind && c.index === top.lastIndex + 1);
      if (cont) {
        top.lastIndex = cont.index;
        top.lastMarker = marker;
        nodes.push({ nodeType: nodeTypeForDepth(stack.length), marker, charStart: occ.charStart, markerCharEnd: occ.charEnd, depth: stack.length, parentMarkerPath: [...top.ancestorPath] });
        continue;
      }
    }

    // 2. Return to an already-open OUTER level (pop deeper levels first).
    let resumedOuter = false;
    // F-2 mechanism 3 (neighboring label sequence / ancestor stack): a label continues the NEAREST open
    // list of its own family. It may resume a farther outer list of that family only when no nearer open
    // list of the same family exists, or when it begins a new line (a paragraph-level return). A
    // mid-sentence "(c)" written right after an inline "(a) ..., (b) ..." at the innermost level (e.g.
    // "..., (b) the declaration ... and (c) if ...") is inline enumeration there and must never re-open
    // a distant outer subsection whose sequence merely happens to be waiting for (c).
    const atLineStart = /(?:^|\n)[ \t]*$/.test(sectionText.slice(Math.max(0, occ.charStart - 8), occ.charStart));
    // Inline-enumeration context: the label is joined to the preceding text by a bare comma or
    // conjunction ("..., (b) ... and (c) ...") rather than by the list punctuation (";" / ":") that
    // separates sibling items of an outer list ("...; (c) ..." / "...; and (c) ...").
    const beforeText = sectionText.slice(Math.max(0, occ.charStart - 16), occ.charStart);
    const inlineEnumeration = /(?:,|\band|\bor|\band\/or)\s*$/i.test(beforeText) && !/[;:]\s*(?:and\/or|and|or)?\s*$/i.test(beforeText);
    for (let level = stack.length - 2; level >= 0; level--) {
      const outer = stack[level]!;
      const cont = candidates.find((c) => c.kind === outer.kind && c.index === outer.lastIndex + 1);
      if (cont && !atLineStart && inlineEnumeration && stack.slice(level + 1).some((nearer) => nearer.kind === cont.kind)) continue;
      if (cont) {
        stack.length = level + 1;
        outer.lastIndex = cont.index;
        outer.lastMarker = marker;
        nodes.push({ nodeType: nodeTypeForDepth(stack.length), marker, charStart: occ.charStart, markerCharEnd: occ.charEnd, depth: stack.length, parentMarkerPath: [...outer.ancestorPath] });
        resumedOuter = true;
        break;
      }
    }
    if (resumedOuter) continue;

    // 3. Start a brand-new nested level under the current top, only for a
    // candidate whose index is exactly 1 (a/i/A/1) - never mid-sequence.
    const startCandidates = candidates.filter((c) => c.index === 1);
    if (startCandidates.length > 0 && stack.length < 6) {
      // F-2 mechanism 2: a new family after a hanging paragraph attaches to the enclosing level.
      if (hangingParagraphBefore && stack.length >= 2) stack.length -= 1;
      const preference = START_PREFERENCE_BY_DEPTH[Math.min(stack.length, START_PREFERENCE_BY_DEPTH.length - 1)]!;
      const preferenceRank = (kind: MarkerSequenceKind) => (preference.includes(kind) ? preference.indexOf(kind) : preference.length);
      const chosen = startCandidates.sort((a, b) => preferenceRank(a.kind) - preferenceRank(b.kind))[0]!;
      const parentPath = stack.length > 0 ? [...stack[stack.length - 1]!.ancestorPath, stack[stack.length - 1]!.lastMarker] : [];
      stack.push({ kind: chosen.kind, lastIndex: 1, ancestorPath: parentPath, lastMarker: marker });
      nodes.push({ nodeType: nodeTypeForDepth(stack.length), marker, charStart: occ.charStart, markerCharEnd: occ.charEnd, depth: stack.length, parentMarkerPath: parentPath });
      continue;
    }
    // 4. Doesn't fit any open or startable sequence - not a real clause marker (e.g. an incidental parenthetical); silently skipped.
  }

  return nodes;
}
