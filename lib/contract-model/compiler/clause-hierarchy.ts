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
const MARKER_OCCURRENCE = /(?<!,\s)(?<=^|\s)\(([a-zA-Z]{1,7}|\d{1,3})\)(?!\()/g;

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
  const occurrences = findRawMarkerOccurrences(sectionText);
  const nodes: ClauseTreeNode[] = [];
  const stack: OpenLevel[] = [];

  for (const occ of occurrences) {
    const candidates = classifyMarker(occ.token);
    if (candidates.length === 0) continue;

    const marker = `(${occ.token})`;

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
    for (let level = stack.length - 2; level >= 0; level--) {
      const outer = stack[level]!;
      const cont = candidates.find((c) => c.kind === outer.kind && c.index === outer.lastIndex + 1);
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
