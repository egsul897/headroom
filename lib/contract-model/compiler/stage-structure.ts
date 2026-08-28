/**
 * Phase C Stage 1 - STRUCTURE (task §8/§9). Deterministic, not an LLM call:
 * real evidence from Phase C0 (docs/phase-c0-analyzer-validation.md §V) shows
 * a single-call LLM design does not scale past ~117 pages at real extraction
 * density, and structural boundaries (article/section headers) are exactly
 * the kind of information a plain regex scan finds reliably and for free -
 * spending real model tokens on it would be a pure cost/latency regression
 * with no accuracy upside. Generalized across documents with different
 * numbering conventions by trying several candidate header patterns and
 * keeping whichever finds the most real matches, rather than hardcoding one
 * document's own style (the same "give the mechanism the pattern as a
 * parameter" generalization lib/contract-model/analyzer/coverage.ts already
 * established for its own marker-detection mechanism).
 *
 * Phase 2A (docs/phase-2a-structural-index.md) widens this from a flat
 * ARTICLE/SECTION-only list to the full nested DocumentNodeType tree
 * (ARTICLE -> SECTION -> SUBSECTION -> CLAUSE -> SUBCLAUSE), reusing
 * clause-hierarchy.ts's exact-sequence nested-clause parser within each
 * SECTION's own text span, and computing every node's real OWNED text span
 * (own text plus every nested descendant) via a single rank-based stack
 * pass - never a second full-document rescan per node.
 */
import { hashParts } from "./hashing";
import { computeStableKey } from "../stable-keys";
import { buildClauseTree } from "./clause-hierarchy";
import { STRUCTURAL_INDEX_VERSION, type CompilerDocumentInput, type StageRunResult, type StructuralNode } from "./types";

/**
 * Phase 2A finding: the original line-anchored (`^...$`) patterns silently
 * matched ZERO sections in FWRG's own real article-6-negative-covenants.txt
 * fixture, which contains no newline characters at all (a real, previously
 * undiagnosed defect - `^`/`$` only match string boundaries or real `\n`
 * positions, so a heading buried in one continuous line of text was simply
 * invisible to them). LSB's own fixture separately showed a heading with a
 * leading space and a doubled internal space ("\n SECTION  6.01 Indebtedness"),
 * which a strict `^Section\s+` anchor also misses. The patterns below are
 * NOT line-anchored at all; instead a genuine heading is distinguished from
 * an ordinary in-text citation ("...is permitted under Section 6.06 , and...")
 * by requiring a short, capitalized title terminating in its own period (for
 * SECTION) or an ALL-CAPS title run (for ARTICLE) immediately after the
 * number - a citation is instead followed by ordinary lowercase sentence
 * continuation or clause-marker punctuation, which fails both shapes. The
 * original line-anchored patterns are kept as fallback candidates (via
 * bestMatches's "keep whichever finds the most real matches" design) for a
 * cleanly line-broken document where they remain the simplest correct match.
 */
const ARTICLE_PATTERNS = [
  /ARTICLE\s+([IVXLC]+|\d+)\.?\s+([A-Z][A-Z ,&';-]{0,58}?)(?=\s+[A-Z][a-z]|\s*$)/g,
  /^ARTICLE\s+([IVXLC]+|\d+)\.?\s*([^\n]*)$/gim,
];

const SECTION_PATTERNS = [
  // Title characters allow "[" / "]" (a "[Reserved]" section) and ";" (a
  // real, common compound heading like "Payments of Indebtedness;
  // Modifications of Subordinated Indebtedness" - observed verbatim in both
  // real fixtures).
  /(?:Section|SECTION|§)\s+(\d+\.\d+)\.?\s+(\[?[A-Z][A-Za-z ,&';[\]-]{1,90}?\]?)\s*\.(?!\d)/g,
  /^Section\s+(\d+\.\d+)\.?\s*([^\n]*)$/gim,
  /^§\s?(\d+\.\d+)\.?\s*([^\n]*)$/gim,
  /^(\d+\.\d+)\s+([A-Z][^\n]*)$/gm,
];

/**
 * Phase 2F.1 §5 (SECTION_NUMBER_GRAMMAR) - real, confirmed finding:
 * CONMED's own real amendment documents (Second Amendment 2022, First
 * Omnibus Amendment 2026) use flat integer section numbering ("SECTION
 * 1. Amendments .", "SECTION 2. Increased Facility Activation Notice
 * .") with NO decimal sub-number at all - a genuine, ordinary amendment-
 * drafting convention SECTION_PATTERNS above never covered (it requires
 * `\d+\.\d+`). These patterns mirror SECTION_PATTERNS' own two proven
 * shapes exactly, substituted to a bare 1-2 digit integer, with a
 * `(?!\.\d)` guard so an inline citation to a REAL decimal section (e.g.
 * "Section 1.1 (Defined Terms) of the Credit Agreement", which appears
 * verbatim inside the Second Amendment's own body, referring to a
 * DIFFERENT document's section - never a heading of this document) can
 * never be mistaken for a bare integer heading: the guard rejects "1" in
 * "1.1" because a dot-digit follows it. Run as an ADDITIONAL match set,
 * unioned with (never replacing) SECTION_PATTERNS' own decimal-style
 * winner - a single real document may legitimately contain both styles
 * (task's own "mixed Section-style + integer-style document" case), and
 * this must never change matching for a decimal-only document (FWRG/LSB
 * regression) since integer patterns simply find zero matches there.
 */
const INTEGER_SECTION_PATTERNS = [
  /(?:Section|SECTION)\s+(\d{1,2})(?!\.\d)\.?\s+(\[?[A-Z][A-Za-z ,&';[\]-]{1,90}?\]?)\s*\.(?!\d)/g,
  /^(?:Section|SECTION)\s+(\d{1,2})(?!\.\d)\.?\s*([^\n]*)$/gim,
];

/**
 * Bare "N. Title" top-level headings with no "Section"/"SECTION" keyword
 * at all (task's own example: "1. Amendment ... / 2. Conditions ...").
 * Deliberately its OWN, more conservative pattern (not unioned into
 * INTEGER_SECTION_PATTERNS' own bestMatches contest) because it carries
 * real collision risk against an ordinary numbered list that happens to
 * start at a line boundary - task §5's own "do not break ordinary
 * numbered lists inside substantive sections." Guarded by: (a) line-
 * anchored (must be the literal start of a line, not mid-sentence); (b)
 * a real Title-Case heading-shaped continuation (capital letter, then
 * lowercase word characters - excludes an all-caps run-on like a
 * spaced-letter "W I T N E S S E T H" recital marker, and excludes a
 * bare number followed by more numbers/currency, e.g. a basket dollar
 * figure "1. $50,000,000" would not match: `[A-Z][a-z]` requires a
 * lowercase letter immediately after the first capital); (c) capped at
 * 1-2 digits, since real top-level amendment section counts are always
 * small - this also keeps a stray large integer (a defined dollar
 * threshold, a year, a CUSIP fragment) from ever qualifying.
 */
const BARE_INTEGER_SECTION_PATTERN = /^(\d{1,2})\.\s+([A-Z][a-z][^\n]*)$/gm;

function bestMatches(text: string, patterns: RegExp[]): RegExpExecArray[] {
  let best: RegExpExecArray[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (matches.length > best.length) best = matches;
  }
  return best;
}

/** Containment rank used to compute owned text spans - a node's span is closed by the next node of equal or shallower rank; a deeper rank always nests inside its opener without closing it. */
const RANK: Record<StructuralNode["nodeType"], number> = { ARTICLE: 0, SECTION: 1, SUBSECTION: 2, CLAUSE: 3, SUBCLAUSE: 4 };

interface RawNode {
  nodeType: StructuralNode["nodeType"];
  heading: string;
  sectionRef: string;
  charStart: number;
  parentSectionRef: string | null;
}

/** True if `candidate`'s own matched span overlaps any span already claimed by `existing` - the dedup rule that lets decimal-style and integer-style SECTION patterns run as an ADDITIVE union (task §5) without ever double-counting the same real heading twice. */
function overlapsAny(candidate: RegExpExecArray, existing: RegExpExecArray[]): boolean {
  const candStart = candidate.index;
  const candEnd = candidate.index + candidate[0].length;
  return existing.some((e) => {
    const start = e.index;
    const end = e.index + e[0].length;
    return candStart < end && candEnd > start;
  });
}

export function parseDocumentStructure(doc: CompilerDocumentInput): StructuralNode[] {
  const articleMatches = bestMatches(doc.text, ARTICLE_PATTERNS);
  const decimalSectionMatches = bestMatches(doc.text, SECTION_PATTERNS);
  const integerSectionMatches = bestMatches(doc.text, INTEGER_SECTION_PATTERNS).filter((m) => !overlapsAny(m, decimalSectionMatches));
  const bareIntegerRe = new RegExp(BARE_INTEGER_SECTION_PATTERN.source, BARE_INTEGER_SECTION_PATTERN.flags);
  const bareIntegerMatchesRaw: RegExpExecArray[] = [];
  let bm: RegExpExecArray | null;
  while ((bm = bareIntegerRe.exec(doc.text)) !== null) {
    bareIntegerMatchesRaw.push(bm);
    if (bm.index === bareIntegerRe.lastIndex) bareIntegerRe.lastIndex++;
  }
  // The bare "N. Title" pattern (no "Section" keyword at all) is the
  // riskiest of the three SECTION match sources - real prose routinely
  // contains an ordinary numbered list ("1. Indebtedness under Loan
  // Documents. 2. Intercompany Indebtedness. ...") that also happens to
  // sit at a line start. Task §5's own "distinguish document-level
  // numbered sections from enumerated items within a section": a bare
  // match is only accepted when it falls OUTSIDE every already-
  // established (decimal or keyword-"Section") match's own governed
  // span (that match's start up to the next established match, or
  // document end) - i.e. it is never accepted as a new top-level
  // section while it is textually nested inside an already-recognized
  // one. A document with NO established matches at all (the task's own
  // "1. Amendment / 2. Conditions / 3. Representations" example, with no
  // "Section" keyword anywhere) has no governed spans to fall inside, so
  // every bare match there is accepted.
  const established = [...decimalSectionMatches, ...integerSectionMatches].sort((a, b) => a.index - b.index);
  function fallsInsideAnEstablishedSpan(charStart: number): boolean {
    for (let i = 0; i < established.length; i++) {
      const spanStart = established[i]!.index;
      const spanEnd = established[i + 1]?.index ?? Infinity;
      if (charStart >= spanStart && charStart < spanEnd) return true;
    }
    return false;
  }
  const bareIntegerMatches = bareIntegerMatchesRaw.filter((m) => !overlapsAny(m, decimalSectionMatches) && !overlapsAny(m, integerSectionMatches) && !fallsInsideAnEstablishedSpan(m.index));
  // Union, not replacement: a decimal-style document's own matches are completely unaffected (FWRG/LSB regression-safe by construction), and a flat-integer-only document (no decimal matches at all) gets its headings from the integer sets instead.
  const sectionMatches = [...decimalSectionMatches, ...integerSectionMatches, ...bareIntegerMatches].sort((a, b) => a.index - b.index);

  const raws: RawNode[] = [];
  for (const m of articleMatches) {
    raws.push({ nodeType: "ARTICLE", heading: (m[2] ?? "").trim(), sectionRef: (m[1] ?? "").trim(), charStart: m.index, parentSectionRef: null });
  }
  for (const m of sectionMatches) {
    const sectionRef = (m[1] ?? "").trim();
    const parentArticle = [...articleMatches].reverse().find((a) => a.index < m.index);
    raws.push({ nodeType: "SECTION", heading: (m[2] ?? "").trim(), sectionRef, charStart: m.index, parentSectionRef: parentArticle ? (parentArticle[1] ?? "").trim() : null });
  }
  raws.sort((a, b) => a.charStart - b.charStart);

  // Parse nested SUBSECTION/CLAUSE/SUBCLAUSE markers within each SECTION's
  // own raw region (up to the next top-level node, or document end).
  const topLevel = raws.slice();
  for (let i = 0; i < topLevel.length; i++) {
    const node = topLevel[i]!;
    if (node.nodeType !== "SECTION") continue;
    const regionEnd = topLevel[i + 1]?.charStart ?? doc.text.length;
    const regionText = doc.text.slice(node.charStart, regionEnd);
    for (const c of buildClauseTree(regionText)) {
      const parentSuffix = c.parentMarkerPath.join("");
      const ownSuffix = [...c.parentMarkerPath, c.marker].join("");
      raws.push({
        nodeType: c.nodeType,
        heading: "",
        sectionRef: `${node.sectionRef}${ownSuffix}`,
        charStart: node.charStart + c.charStart,
        parentSectionRef: `${node.sectionRef}${parentSuffix}`,
      });
    }
  }
  raws.sort((a, b) => a.charStart - b.charStart);

  // Sibling ordinal - position among nodes sharing the same direct parent, in document order (never a global index across the whole document).
  const ordinalByParent = new Map<string, number>();
  const ordinals = raws.map((r) => {
    const key = r.parentSectionRef ?? " ROOT";
    const ord = ordinalByParent.get(key) ?? 0;
    ordinalByParent.set(key, ord + 1);
    return ord;
  });

  // Phase 3F.1.2 - the unique PHYSICAL SOURCE OCCURRENCE identity for each raw
  // node, computed up front from documentId + nodeType + charStart (the
  // approved ADR's "Option D" span-primary construction, via the repo's
  // existing computeStableKey convention - never a second hashing scheme).
  // Unlike sectionRef/nodeKey (labels, which real drafting can legitimately
  // repeat - a cross-reference sentence, a table-of-contents entry, a
  // duplicate/malformed section number - see
  // docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md), no two raws in this
  // array can ever collide on nodeId: charStart is unique per physical match
  // within one parse pass (overlapsAny already prevents accepting two
  // overlapping matches into the same candidate set).
  const nodeIds = raws.map((r) => computeStableKey("structural-node", doc.documentId, r.nodeType, String(r.charStart)));

  // Owned text span (own text + every descendant) AND the true physical
  // parent occurrence via one rank-based stack pass - O(n), no per-node
  // rescanning. The stack top at push time (after popping every entry whose
  // rank is >= this node's own rank) is, by construction, the nearest
  // enclosing node of shallower rank - i.e. this node's real, physical
  // parent occurrence, determined from actual nesting position, never by
  // re-matching parentSectionRef against a label (which is exactly the
  // mechanism that let two distinct physical occurrences merge children
  // under the pre-3F.1.2 label-keyed scheme).
  const charEndByIndex = new Map<number, number>();
  const parentIndexByIndex = new Map<number, number>();
  const stack: number[] = [];
  raws.forEach((r, i) => {
    while (stack.length > 0 && RANK[raws[stack[stack.length - 1]!]!.nodeType] >= RANK[r.nodeType]) {
      charEndByIndex.set(stack.pop()!, r.charStart);
    }
    if (stack.length > 0) parentIndexByIndex.set(i, stack[stack.length - 1]!);
    stack.push(i);
  });
  while (stack.length > 0) charEndByIndex.set(stack.pop()!, doc.text.length);

  return raws
    .map((r, i) => ({
      documentId: doc.documentId,
      nodeType: r.nodeType,
      heading: r.heading,
      sectionRef: r.sectionRef,
      nodeKey: `${doc.documentId}::${r.sectionRef.replace(/\s+/g, "")}`,
      nodeId: nodeIds[i]!,
      charStart: r.charStart,
      charEnd: charEndByIndex.get(i) ?? doc.text.length,
      ordinal: ordinals[i]!,
      parentSectionRef: r.parentSectionRef,
      parentNodeId: parentIndexByIndex.has(i) ? nodeIds[parentIndexByIndex.get(i)!]! : null,
    }))
    .sort((a, b) => a.charStart - b.charStart);
}

export function runStructureStage(documents: CompilerDocumentInput[]): StageRunResult<StructuralNode[]> {
  const allNodes = documents.flatMap(parseDocumentStructure);
  if (allNodes.length === 0) {
    return { status: "REVIEW_REQUIRED", output: [], notes: ["No article/section headers matched any known structural pattern - structural inventory could not be built; every downstream stage's coverage claims are unreliable for this package until this is resolved."] };
  }
  return { status: "COMPLETED", output: allNodes };
}

export function structureOutputHash(nodes: StructuralNode[]): string {
  return hashParts([STRUCTURAL_INDEX_VERSION, ...nodes.map((n) => `${n.documentId}|${n.nodeType}|${n.sectionRef}|${n.charStart}|${n.nodeId}`)]);
}
