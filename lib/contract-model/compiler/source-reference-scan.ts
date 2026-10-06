/**
 * SOURCE-REFERENCE SCANNER - the ONE deterministic citation grammar (source-authority closure SA-1 / SA-2).
 *
 * Every place that needs to know which provisions a piece of contract text references - Pass A inventory
 * normalization (source-grounded `referencedSections`), Phase 3 source-reference fidelity (the stated-reference set a
 * model-emitted target is judged against) and the verifier's source inventory (SECTION_REFERENCE items) - reads this
 * module. Two independent citation grammars would drift; one grammar is the invariant. Pure: no model, no index
 * mutation, no agreement knowledge.
 *
 * Supported forms:
 *   Section 9.1 / § 9.1 / Sections 9.1 and 9.2       absolute references
 *   Sections 9.1(a), 9.1(c) and 9.1(d)                explicit lists (full tokens)
 *   Sections 9.1(a) and (c)                           explicit lists (bare clause tokens inherit the section)
 *   clause (b) of Section 9.1 / clause (b) of this Section / paragraph (c) above   relative references (base section)
 *   clauses (a) through (d) [of this Section 9.1]     ranges - expanded ONLY through the structural index; otherwise
 *                                                     kept as the stated range (never expanded by letter arithmetic)
 *
 * Each reference carries the exact drafted text, its normalized identity, its span and a SOURCE-DERIVED target
 * selector: the target-selection language that immediately precedes the reference ("the financial covenants
 * contained in", "Liens permitted by"), classified WHOLE_PROVISION (no qualifier), QUALIFIED_RULE_SET (a noun phrase
 * selects part of the provision), EXPLICIT_SUBCLAUSE_SET (the source lists sub-clauses) or UNRESOLVED_SELECTOR
 * (a range the index could not resolve). The selector is read from the source text only - never from model prose.
 */
import type { StructuralIndex } from "./structural-index";

export const SOURCE_REFERENCE_SCAN_VERSION = "source-reference-scan.v1";

export type SourceTargetSelectorKind = "WHOLE_PROVISION" | "QUALIFIED_RULE_SET" | "EXPLICIT_SUBCLAUSE_SET" | "NAMED_CONDITION" | "UNRESOLVED_SELECTOR";

export interface SourceTargetSelector {
  /** The source text the selector was read from: the qualifier phrase plus the reference as drafted. */
  sourceText: string;
  kind: SourceTargetSelectorKind;
  /** The target-selection noun phrase as drafted ("financial covenants contained in"), or null when the reference is unqualified. */
  qualifierText: string | null;
}

export interface ScannedSourceReference {
  /** The reference as drafted / as deterministically expanded ("Section 9.1", "Section 9.1(c)"). */
  raw: string;
  /** Normalized section identity, lower-cased and whitespace-free ("9.1", "9.1(c)"); a stated-but-unresolved range keeps the form "9.1(a)..(d)". */
  normalized: string;
  charStart: number;
  charEnd: number;
  selector: SourceTargetSelector;
  /** True for a range member the structural index expanded deterministically. */
  expandedFromRange: boolean;
}

export interface ScanSourceReferencesOptions {
  /** The section the text belongs to, so a relative "clause (b) of this Section" resolves against it. */
  baseSectionRef?: string | null;
  /** Needed only to expand ranges deterministically. */
  index?: StructuralIndex | null;
  documentId?: string | null;
}

const SECTION_TOKEN = /\d+(?:\.\d+)*[A-Za-z]?(?:\s*\([^)\s]{1,6}\))*/y;
const CLAUSE_TOKEN = /(?:\(\s*[^)\s]{1,6}\s*\))+/y;
const SEP = /\s*(?:,|and|or|and\/or|,\s*and|,\s*or|through|to)\s*/y;
/**
 * The target-selection noun phrase that immediately precedes a reference: "<the> <noun phrase> <contained|set forth|
 * described|provided|specified|referred to|required|permitted|listed|enumerated> <in|under|by|pursuant to>". The noun
 * phrase is bounded to one clause fragment (no sentence punctuation) and at most eight words.
 */
// The noun phrase admits no determiner, auxiliary, verb or clause-joining word: the qualifier is the LAST determiner-headed
// phrase before the verb ("... shall be in compliance with the covenants contained in" -> "covenants contained in").
const QUALIFIER_STOP = "(?:the|any|all|such|each|every|those|a|an|shall|should|must|may|will|be|been|being|is|are|was|were|with|in|under|by|pursuant|to|that|which|and|or|not|if|unless|as|than)";
const QUALIFIER_RE = new RegExp(`(?:^|[\\s(])(?:the|any|all|such|each|every|those)\\s+((?:(?!${QUALIFIER_STOP}\\s)[A-Za-z][\\w'-]*\\s+){0,7}(?!${QUALIFIER_STOP}\\s)[A-Za-z][\\w'-]*?)\\s+(contained|set\\s+forth|described|provided|specified|referred\\s+to|required|permitted|listed|enumerated|imposed|established|prescribed)\\s+(in|under|by|pursuant\\s+to)\\s*$`, "i");
const SELECTOR_WINDOW = 110;

export const normalizeSectionToken = (s: string): string => s.replace(/\s+/g, "").toLowerCase();
const sectionBase = (n: string) => n.replace(/\(.*$/, "");
const clauseLabels = (n: string): string[] => n.match(/\([^)]+\)/g) ?? [];

/** The selector read from the text that precedes `refStart` (the start of the reference head, e.g. the "Section" keyword). */
export function readTargetSelector(text: string, refStart: number, refRaw: string, kind: SourceTargetSelectorKind | null): SourceTargetSelector {
  if (kind === "EXPLICIT_SUBCLAUSE_SET" || kind === "UNRESOLVED_SELECTOR") return { sourceText: refRaw, kind, qualifierText: null };
  const before = text.slice(Math.max(0, refStart - SELECTOR_WINDOW), refStart);
  const cut = before.split(/[;:.]\s|\n\s*\n/).pop() ?? before;
  const m = QUALIFIER_RE.exec(cut);
  if (m) {
    const qualifier = `${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, " ").trim();
    return { sourceText: `${qualifier} ${refRaw}`, kind: "QUALIFIED_RULE_SET", qualifierText: qualifier };
  }
  return { sourceText: refRaw, kind: kind ?? "WHOLE_PROVISION", qualifierText: null };
}

/** Every section-shaped reference `text` states, in source order, deduplicated by normalized identity. */
export function scanSourceReferences(text: string, opts: ScanSourceReferencesOptions = {}): ScannedSourceReference[] {
  const out: ScannedSourceReference[] = [];
  const base = opts.baseSectionRef ? sectionBase(normalizeSectionToken(opts.baseSectionRef.replace(/^(?:Section|§)\s*/i, ""))) : null;
  const push = (raw: string, normalized: string, charStart: number, charEnd: number, selector: SourceTargetSelector, expandedFromRange = false) => {
    if (!out.some((o) => o.normalized === normalized)) out.push({ raw, normalized, charStart, charEnd, selector, expandedFromRange });
  };
  const expandRange = (section: string, from: string, to: string): string[] | null => {
    if (!opts.index || !opts.documentId) return null;
    const res = opts.index.resolveUniqueNodeByRef(opts.documentId, section);
    if (res.status !== "UNIQUE") return null;
    const kids = opts.index.getChildren(res.node.nodeId).map((k) => normalizeSectionToken(k.sectionRef)).filter((k) => k.startsWith(`${section}(`));
    const a = kids.indexOf(`${section}${from}`), b = kids.indexOf(`${section}${to}`);
    if (a < 0 || b < 0 || b < a) return null;
    return kids.slice(a, b + 1);
  };

  // 1. relative references ("clause (b) of this Section 9.1", "clauses (a) through (d) of this Section", "paragraph (c) above");
  //    their spans are masked from the absolute scan so "of this Section 9.1" is not read a second time as a whole-section reference
  const masked: [number, number][] = [];
  const rel = /\b(?:clauses?|paragraphs?|subsections?|sub-clauses?)\s+((?:\([^)\s]{1,6}\)(?:\s*(?:,|and|or|through|to)\s*)?)+)(?:\s+(?:of|under)\s+this\s+Section(?:\s+(\d+(?:\.\d+)*[A-Za-z]?))?|\s+(?:above|below|hereof))?/gi;
  let m: RegExpExecArray | null;
  while ((m = rel.exec(text)) !== null) {
    const explicit = m[2] ? normalizeSectionToken(m[2]) : null;
    const section = explicit ?? base;
    if (!section) continue;
    masked.push([m.index, m.index + m[0].length]);
    const labels = (m[1]!.match(/\([^)]+\)/g) ?? []).map(normalizeSectionToken);
    const end = m.index + m[0].length;
    if (/\b(?:through|to)\b/.test(m[1]!) && labels.length === 2) {
      const members = expandRange(section, labels[0]!, labels[1]!);
      if (members) for (const x of members) push(`Section ${x}`, x, m.index, end, { sourceText: m[0], kind: "EXPLICIT_SUBCLAUSE_SET", qualifierText: null }, true);
      else push(m[0], `${section}${labels[0]}..${labels[1]}`, m.index, end, { sourceText: m[0], kind: "UNRESOLVED_SELECTOR", qualifierText: null });
    } else for (const l of labels) push(`Section ${section}${l}`, `${section}${l}`, m.index, end, { sourceText: m[0], kind: "EXPLICIT_SUBCLAUSE_SET", qualifierText: null });
  }
  const isMasked = (i: number) => masked.some(([a, b]) => i >= a && i < b);

  // 2. absolute references: Section(s) / § followed by a token list
  const head = /(?:\bSections?|§§?)\s*/g;
  while ((m = head.exec(text)) !== null) {
    if (isMasked(m.index)) continue;
    const headStart = m.index;
    let cursor = m.index + m[0].length;
    let lastSection: string | null = null;
    let pendingRange: { section: string; from: string } | null = null;
    const members: { raw: string; normalized: string; charStart: number; charEnd: number; expanded: boolean; unresolvedRange: boolean }[] = [];
    for (;;) {
      SECTION_TOKEN.lastIndex = cursor;
      const st = SECTION_TOKEN.exec(text);
      if (st && st[0].trim().length > 0 && /^\d/.test(st[0])) {
        const n = normalizeSectionToken(st[0]);
        if (pendingRange && sectionBase(n) === pendingRange.section) {
          const r = expandRange(pendingRange.section, pendingRange.from, clauseLabels(n).join(""));
          if (r) for (const x of r) members.push({ raw: `Section ${x}`, normalized: x, charStart: st.index, charEnd: st.index + st[0].length, expanded: true, unresolvedRange: false });
          else members.push({ raw: `Section ${st[0].trim()}`, normalized: n, charStart: st.index, charEnd: st.index + st[0].length, expanded: false, unresolvedRange: true });
          pendingRange = null;
        } else members.push({ raw: `Section ${st[0].trim()}`, normalized: n, charStart: st.index, charEnd: st.index + st[0].length, expanded: false, unresolvedRange: false });
        lastSection = sectionBase(n);
        cursor = st.index + st[0].length;
      } else {
        CLAUSE_TOKEN.lastIndex = cursor;
        const ct = CLAUSE_TOKEN.exec(text);
        if (ct && lastSection) {
          const label = normalizeSectionToken(ct[0]);
          if (pendingRange) {
            const r = expandRange(pendingRange.section, pendingRange.from, label);
            if (r) for (const x of r) members.push({ raw: `Section ${x}`, normalized: x, charStart: ct.index, charEnd: ct.index + ct[0].length, expanded: true, unresolvedRange: false });
            else members.push({ raw: `Section ${lastSection}${label}`, normalized: `${lastSection}${label}`, charStart: ct.index, charEnd: ct.index + ct[0].length, expanded: false, unresolvedRange: true });
            pendingRange = null;
          } else members.push({ raw: `Section ${lastSection}${label}`, normalized: `${lastSection}${label}`, charStart: ct.index, charEnd: ct.index + ct[0].length, expanded: false, unresolvedRange: false });
          cursor = ct.index + ct[0].length;
        } else break;
      }
      SEP.lastIndex = cursor;
      const sep = SEP.exec(text);
      if (!sep || sep[0].trim().length === 0) break;
      if (/\b(?:through|to)\b/.test(sep[0]) && lastSection) {
        const last = members[members.length - 1];
        if (last && sectionBase(last.normalized) === lastSection) pendingRange = { section: lastSection, from: clauseLabels(last.normalized).join("") };
      }
      cursor = sep.index + sep[0].length;
    }
    if (members.length === 0) continue;
    // the first member's span starts at the head keyword ("Section 9.1" is the literal authenticated span; an inventory
    // item whose span ends on "Section" still claims the reference by overlap); later list members keep their own token span
    members[0]!.charStart = headStart;
    // an explicit list of sub-clauses / several references after one head is an EXPLICIT_SUBCLAUSE_SET; a single
    // reference reads its selector from the preceding text
    const explicitSet = members.length > 1 || members.some((x) => x.expanded);
    for (const x of members) {
      const kind: SourceTargetSelectorKind | null = x.unresolvedRange ? "UNRESOLVED_SELECTOR" : explicitSet ? "EXPLICIT_SUBCLAUSE_SET" : null;
      push(x.raw, x.normalized, x.charStart, x.charEnd, readTargetSelector(text, headStart, x.raw, kind), x.expanded);
    }
  }
  return out.sort((a, b) => a.charStart - b.charStart);
}

/** The references whose span overlaps [charStart, charEnd) of `text` - how an inventory item's own span claims the references drafted inside it (a reference straddling two item spans belongs to both). */
export function referencesWithinSpan(scanned: readonly ScannedSourceReference[], charStart: number, charEnd: number): ScannedSourceReference[] {
  return scanned.filter((r) => r.charStart < charEnd && charStart < r.charEnd);
}
