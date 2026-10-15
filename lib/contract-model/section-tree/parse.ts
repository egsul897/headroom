/**
 * Deterministic section tree: ARTICLE > SECTION > (a) > (i) > (A) > (1).
 *
 * - Exact spans: every node has [start, end) offsets into the ORIGINAL text,
 *   plus headingEnd (end of "Section 6.01 Indebtedness.").
 * - Table of contents and page furniture are excluded (recorded, not parsed).
 * - Never throws on odd input: each section's clause parse is wrapped and fails
 *   closed with an explicit status.
 * - Zero AI / LLM calls. No issuer-specific logic.
 */

export type NodeKind = "ROOT" | "ARTICLE" | "SECTION" | "CLAUSE";
export type ClauseLevel = "LOWER_ALPHA" | "LOWER_ROMAN" | "UPPER_ALPHA" | "DIGIT";
export type NodeStatus = "OK" | "SEQUENCE_GAP" | "FAIL_CLOSED";

export interface TreeNode {
  id: string;
  kind: NodeKind;
  /** "ARTICLE VI", "6.01", "(a)" */
  label: string;
  /** Section number "6.1" (normalized) for SECTION and CLAUSE nodes. */
  sectionNumber: string | null;
  /** Full path e.g. "6.1(a)(i)". */
  path: string;
  title: string | null;
  level: ClauseLevel | null;
  start: number;
  headingEnd: number;
  end: number;
  parentId: string | null;
  childIds: string[];
  depth: number;
  status: NodeStatus;
  issues: string[];
}

export interface FurnitureSpan {
  kind: "TOC" | "PAGE_NUMBER" | "RUNNING_HEADER";
  start: number;
  end: number;
}

export interface SectionTree {
  textLength: number;
  nodes: TreeNode[];
  byId: Map<string, TreeNode>;
  furniture: FurnitureSpan[];
  tocExcluded: boolean;
  parseErrors: string[];
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx", "xxi", "xxii", "xxiii", "xxiv", "xxv"];

export function normalizeSectionNumber(n: string): string {
  const [a, b] = n.replace(/\.$/, "").split(".");
  return b == null || b === "" ? `${Number(a)}` : `${Number(a)}.${Number(b)}`;
}

/** Ordinal of a marker within its level (1-based), or null when it is not of that level. */
function ordinal(marker: string, level: ClauseLevel): number | null {
  switch (level) {
    case "LOWER_ALPHA": {
      if (/^[a-z]$/.test(marker)) return marker.charCodeAt(0) - 96;
      if (/^([a-z])\1$/.test(marker)) return 26 + marker.charCodeAt(0) - 96; // (aa)
      return null;
    }
    case "LOWER_ROMAN": {
      const i = ROMAN.indexOf(marker);
      return i >= 0 ? i + 1 : null;
    }
    case "UPPER_ALPHA":
      if (/^[A-Z]$/.test(marker)) return marker.charCodeAt(0) - 64;
      if (/^([A-Z])\1$/.test(marker)) return 26 + marker.charCodeAt(0) - 64;
      return null;
    case "DIGIT":
      return /^\d{1,2}$/.test(marker) ? Number(marker) : null;
  }
}

function labelFor(level: ClauseLevel, ord: number): string | null {
  if (ord < 1) return null;
  switch (level) {
    case "LOWER_ALPHA": return ord <= 26 ? String.fromCharCode(96 + ord) : null;
    case "LOWER_ROMAN": return ROMAN[ord - 1] ?? null;
    case "UPPER_ALPHA": return ord <= 26 ? String.fromCharCode(64 + ord) : null;
    case "DIGIT": return String(ord);
  }
}

const LEVEL_ORDER: ClauseLevel[] = ["LOWER_ALPHA", "LOWER_ROMAN", "UPPER_ALPHA", "DIGIT"];

// ---------- headings ----------

interface Heading {
  kind: "ARTICLE" | "SECTION";
  label: string;
  number: string | null;
  title: string | null;
  start: number;
  headingEnd: number;
}

const ARTICLE_RE = /(^|\n)[^\S\n]*(ARTICLE|Article)[^\S\n]+([IVXLC]+|\d{1,2})\b\.?[^\S\n]*(?:\n[^\S\n]*)?([A-Z][A-Z ,;'’&\-]{2,100})?/g;
const SECTION_RE =
  /(^|\n|\s{2,}|\.\s+)[^\S\n]*(?:(?:SECTION|Section)[^\S\n]+|§[^\S\n]*)?(\d{1,2}\.\d{1,3})(?:[^\S\n]*\.)?(?:[^\S\n]+|[^\S\n]*\n[^\S\n]*)([A-Z][^.\n]{1,160}?)[^\S\n]*[.:]/g;
/** Amendment-style single-number sections: "SECTION 3. Conditions." (requires the word). */
const SECTION_SINGLE_RE = /(^|\n)[^\S\n]*(?:SECTION|Section)[^\S\n]+(\d{1,2})\.(?:[^\S\n]+|[^\S\n]*\n[^\S\n]*)([A-Z][^.\n]{1,120}?)[^\S\n]*[.:\n]/g;

function findHeadings(text: string): Heading[] {
  const out: Heading[] = [];
  for (const m of text.matchAll(ARTICLE_RE)) {
    const start = m.index! + m[1]!.length;
    const title = m[4] ? m[4].trim() : null;
    out.push({ kind: "ARTICLE", label: `ARTICLE ${m[3]}`, number: m[3]!, title, start, headingEnd: m.index! + m[0].length });
  }
  for (const m of text.matchAll(SECTION_RE)) {
    const lead = m[1]!;
    // A bare "6.01 Title." after a sentence (not line start / wide gap) needs the "Section" word.
    const hasWord = /section|§/i.test(m[0].slice(lead.length, lead.length + 12));
    // (A lead of ".\s+" that crosses a newline is a line start: the previous section's last sentence
    // ended the line — the acn under-parse, 96 of 116 body headings dropped.)
    if (/^\.\s+$/.test(lead) && !lead.includes("\n") && !hasWord) continue;
    const title = m[3]!.replace(/\s+/g, " ").trim();
    // Cross-reference shapes, not headings: "Section 6.01 hereof", "Section 7.02 of the Credit Agreement".
    if (/^(hereof|herein|of the|of this|above|below|and|or|to|shall|is|has)\b/i.test(title)) continue;
    if (title.split(" ").length > 18) continue;
    const start = m.index! + lead.length;
    out.push({ kind: "SECTION", label: m[2]!, number: normalizeSectionNumber(m[2]!), title, start, headingEnd: m.index! + m[0].length });
  }
  // Single-number sections only when the document has no dotted section numbering.
  if (out.filter((h) => h.kind === "SECTION").length < 3) {
    for (const m of text.matchAll(SECTION_SINGLE_RE)) {
      const title = m[3]!.replace(/\s+/g, " ").trim();
      if (title.split(" ").length > 18) continue;
      const start = m.index! + m[1]!.length;
      out.push({ kind: "SECTION", label: m[2]!, number: normalizeSectionNumber(m[2]!), title, start, headingEnd: m.index! + m[0].length });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// ---------- furniture / TOC ----------

function findFurniture(text: string, headings: Heading[]): { furniture: FurnitureSpan[]; tocIdx: Set<number> } {
  const furniture: FurnitureSpan[] = [];
  for (const m of text.matchAll(/(^|\n)([^\S\n]*(?:-\s*)?\d{1,3}(?:\s*-)?[^\S\n]*)(?=\n)/g)) {
    furniture.push({ kind: "PAGE_NUMBER", start: m.index! + m[1]!.length, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/(^|\n)([^\S\n]*(?:Table of Contents|TABLE OF CONTENTS)[^\S\n]*)(?=\n)/g)) {
    furniture.push({ kind: "RUNNING_HEADER", start: m.index! + m[1]!.length, end: m.index! + m[0].length });
  }
  // TOC: a heading whose body (to the next heading) is short and looks like "Title .... 45".
  // A run of >= 3 such headings is a table of contents.
  const tocIdx = new Set<number>();
  const isTocEntry = (i: number) => {
    const h = headings[i]!;
    const next = headings[i + 1]?.start ?? text.length;
    const body = text.slice(h.headingEnd, next);
    return body.replace(/\s+/g, " ").trim().length < 160 && (/\d{1,3}\s*$/.test(body.trim()) || body.trim().length < 40);
  };
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 3) for (const i of run) tocIdx.add(i);
    run = [];
  };
  for (let i = 0; i < headings.length; i++) {
    if (isTocEntry(i)) run.push(i);
    else flush();
  }
  flush();
  // Explicit "TABLE OF CONTENTS" block: from the marker to the first heading that is
  // followed by prose (not by another dense run of section numbers / page numbers).
  const marker = /table\s+of\s+contents/i.exec(text.slice(0, Math.max(20000, Math.floor(text.length * 0.2))));
  if (marker) {
    const dense = /(?:^|\n)\s*(?:(?:section|article)\s+)?(?:\d{1,2}\.\d{1,3}|[IVXLC]+)\b/gi;
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i]!;
      if (h.start <= marker.index) continue;
      const after = text.slice(h.headingEnd, h.headingEnd + 1500);
      const n = (after.match(dense) ?? []).length;
      if (n < 4) {
        furniture.push({ kind: "TOC", start: marker.index, end: h.start });
        for (let k = 0; k < i; k++) if (headings[k]!.start >= marker.index) tocIdx.add(k);
        break;
      }
    }
  }
  if (tocIdx.size > 0) {
    const idx = [...tocIdx].sort((a, b) => a - b);
    let s = headings[idx[0]!]!.start;
    let prev = idx[0]!;
    for (const i of idx.slice(1).concat([-1])) {
      if (i !== prev + 1) {
        const e = headings[prev + 1]?.start ?? text.length;
        furniture.push({ kind: "TOC", start: s, end: e });
        if (i >= 0) s = headings[i]!.start;
      }
      if (i >= 0) prev = i;
    }
  }
  return { furniture, tocIdx };
}

// ---------- clauses ----------

interface Marker {
  marker: string;
  /** Enumerator begins a line (after optional indentation / merged page number). */
  lineStart: boolean;
  start: number;
  bodyStart: number;
}

/** Candidate enumerators at structural positions (line start or after ":" / ";" / "; and" / "; or"). */
function candidateMarkers(text: string, from: number, to: number): Marker[] {
  const out: Marker[] = [];
  const slice = text.slice(from, to);
  // Line-start leads tolerate indentation and a merged page number ("\n 161 (4) ...") from page furniture.
  const re = /(^\s*|\n[ \t\u00a0]*(?:\d{1,3}[ \t\u00a0]+)?|[:;]\s*(?:and|or)?\s*|\.\s{2,}|—\s*)\(([a-z]{1,2}|[ivxl]{1,6}|[A-Z]{1,2}|\d{1,2})\)[ \t\u00a0]*/g;
  for (const m of slice.matchAll(re)) {
    const lead = m[1]!;
    const start = from + m.index! + lead.length;
    out.push({ marker: m[2]!, start, bodyStart: from + m.index! + m[0].length, lineStart: lead.includes("\n") || m.index === 0 });
  }
  // A clause immediately after the section heading "(a)" at headingEnd.
  return out;
}

function parseClauses(
  text: string,
  section: TreeNode,
  make: (n: Omit<TreeNode, "id" | "childIds">) => TreeNode,
): void {
  const markers = candidateMarkers(text, section.headingEnd, section.end);
  // Stack of open levels: { level, ord, node }
  const stack: { level: ClauseLevel; ord: number; node: TreeNode; prefix?: string }[] = [];
  let listNo = 1;
  const opened: TreeNode[] = [];
  const close = (n: TreeNode, at: number) => {
    n.end = Math.max(n.headingEnd, at);
  };
  for (const mk of markers) {
    // Option 1: next sibling at an open level (search from deepest).
    let placed = false;
    for (let d = stack.length - 1; d >= 0; d--) {
      const top = stack[d]!;
      const o = ordinal(mk.marker, top.level);
      if (o != null && o === top.ord + 1) {
        // Inline run guard: a shallower sibling that would close deeper open levels is treated as an
        // inline enumerator when the deepest open level's NEXT ordinal still appears later at a line
        // start in this section, and the candidate does not open a new paragraph (e.g. "(8) ... in respect of (a) ...\n(c) customer deposits ... (f) ...;\n(9) ...").
        const paraBreak = /\n[ \t\u00a0]*\n[ \t\u00a0\d]*$/.test(text.slice(Math.max(0, mk.start - 200), mk.start));
        if (d < stack.length - 1 && !paraBreak) {
          const deep = stack[stack.length - 1]!;
          const nextLabel = labelFor(deep.level, deep.ord + 1);
          if (nextLabel) {
            // Follow this candidate's run (c, d, e, ...); if the first marker that breaks the run is the
            // deep level's next ordinal, the run was inline inside the deep item.
            let expect = o + 1;
            let inline = false;
            for (const m2 of markers) {
              if (m2.start <= mk.start) continue;
              const o2 = ordinal(m2.marker, top.level);
              if (o2 != null && o2 >= expect && o2 <= expect + 2) { expect = o2 + 1; continue; }
              inline = m2.marker === nextLabel;
              break;
            }
            if (inline) break;
          }
        }
        // close deeper levels and this sibling
        for (let k = stack.length - 1; k >= d; k--) close(stack[k]!.node, mk.start);
        stack.length = d;
        const parent = d === 0 ? section : stack[d - 1]!.node;
        const prefix = d === 0 ? top.prefix : undefined;
        const node = make({
          kind: "CLAUSE", label: `(${mk.marker})`, sectionNumber: section.sectionNumber,
          path: `${prefix ?? parent.path}(${mk.marker})`, title: null, level: top.level,
          start: mk.start, headingEnd: mk.bodyStart, end: section.end, parentId: parent.id,
          depth: parent.depth + 1, status: "OK", issues: [],
        });
        stack.push({ level: top.level, ord: o, node, prefix });
        opened.push(node);
        placed = true;
        break;
      }
    }
    if (placed) continue;
    // Option 1b: a first marker (a)/(1)/(i)/(A) for a level that is ALREADY open, introduced by a colon
    // lead-in. Either (i) a nested list under the deepest open item ("(3) ...; provided, however, that:
    // (a) ..."), or (ii) a NEW list after hanging text that closes the previous list — an unnumbered
    // paragraph ("For purposes of ...:") or text after the deepest item's terminal ";" that is not a
    // proviso ("(4) ...; (all such payments ...) unless ...: (a)"). A restart is attached to the
    // section as list #k (path "7.5[2](a)") so paths never collide.
    if (stack.length) {
      const reopenOpen = LEVEL_ORDER.find((lv) => stack.some((x) => x.level === lv) && ordinal(mk.marker, lv) === 1);
      const fresh = LEVEL_ORDER.find((lv) => !stack.some((x) => x.level === lv) && ordinal(mk.marker, lv) === 1);
      const before = text.slice(stack[stack.length - 1]!.node.headingEnd, mk.start).replace(/\s+$/, "");
      const restartCheck = (reopenOpen || fresh) && /:$/.test(before);
      const paraStart0 = before.lastIndexOf("\n\n");
      const leadPara0 = before.slice(paraStart0 + 1).trimStart();
      const semi0 = before.lastIndexOf(";");
      const tail0 = semi0 >= 0 ? before.slice(semi0 + 1).trimStart() : "";
      const isRestart =
        !!restartCheck &&
        ((paraStart0 >= 0 && !/^\(([a-z]{1,2}|[ivxl]{1,6}|[A-Z]{1,2}|\d{1,2})\)/.test(leadPara0)) ||
          /\.\s+[A-Z](?:[^.;:]|\.(?=\d))*:$/.test(before) ||
          (semi0 >= 0 && tail0.length > 0 &&
            !/^(provided|except|other than|subject to|and\b|or\b|in each case|so long as|however|but\b)/i.test(tail0)));
      const reopen = isRestart ? (reopenOpen ?? fresh) : reopenOpen;
      if (reopen && restartCheck) {
        const deepest = stack[stack.length - 1]!.node;
        const paraStart = Math.max(before.lastIndexOf("\n\n"), -1);
        const leadPara = before.slice(paraStart + 1).trimStart();
        const unnumberedPara = paraStart >= 0 && !/^\(([a-z]{1,2}|[ivxl]{1,6}|[A-Z]{1,2}|\d{1,2})\)/.test(leadPara);
        const semi = before.lastIndexOf(";");
        const tail = semi >= 0 ? before.slice(semi + 1).trimStart() : "";
        const hanging =
          semi >= 0 && tail.length > 0 &&
          !/^(provided|except|other than|subject to|and\b|or\b|in each case|so long as|however|but\b)/i.test(tail);
        let parent: TreeNode;
        let path: string;
        let issues: string[] = [];
        void unnumberedPara; void hanging;
        if (isRestart) {
          for (let k = stack.length - 1; k >= 0; k--) close(stack[k]!.node, mk.start);
          stack.length = 0;
          listNo += 1;
          parent = section;
          path = `${section.path}[${listNo}](${mk.marker})`;
          issues = ["LIST_RESTART"];
        } else {
          parent = deepest;
          path = `${deepest.path}(${mk.marker})`;
        }
        const node = make({
          kind: "CLAUSE", label: `(${mk.marker})`, sectionNumber: section.sectionNumber,
          path, title: null, level: reopen,
          start: mk.start, headingEnd: mk.bodyStart, end: parent === section ? section.end : parent.end, parentId: parent.id,
          depth: parent.depth + 1, status: "OK", issues,
        });
        stack.push({ level: reopen, ord: 1, node, prefix: parent === section && issues.length ? `${section.path}[${listNo}]` : undefined });
        opened.push(node);
        continue;
      }
    }
    // Option 2: open a new deeper level with a first marker (a)/(i)/(A)/(1) not already open.
    const used = new Set(stack.map((s) => s.level));
    for (const level of LEVEL_ORDER) {
      if (used.has(level)) continue;
      if (ordinal(mk.marker, level) !== 1) continue;
      // (i) right after an open (h) is handled above as a sibling; here it opens roman.
      const parent = stack.length ? stack[stack.length - 1]!.node : section;
      const node = make({
        kind: "CLAUSE", label: `(${mk.marker})`, sectionNumber: section.sectionNumber,
        path: `${parent.path}(${mk.marker})`, title: null, level,
        start: mk.start, headingEnd: mk.bodyStart, end: parent.end, parentId: parent.id,
        depth: parent.depth + 1, status: "OK", issues: [],
      });
      stack.push({ level, ord: 1, node });
      opened.push(node);
      placed = true;
      break;
    }
    // Otherwise: an inline reference or out-of-sequence marker; not structure.
  }
  for (const s of stack) close(s.node, section.end);
  // Sequence sanity: siblings must be contiguous ordinals (checked by construction); a lone
  // non-(a) marker cannot open. Flag sections whose markers mostly failed to place.
  const placedCount = opened.length;
  if (markers.length >= 6 && placedCount < markers.length / 3) {
    section.status = "SEQUENCE_GAP";
    section.issues.push(`only ${placedCount}/${markers.length} enumerators placed`);
  }
}

// ---------- main ----------

export function parseSectionTree(text: string): SectionTree {
  const parseErrors: string[] = [];
  const nodes: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  let seq = 0;
  const make = (n: Omit<TreeNode, "id" | "childIds">): TreeNode => {
    const node: TreeNode = { ...n, id: `n${seq++}`, childIds: [] };
    nodes.push(node);
    byId.set(node.id, node);
    if (node.parentId) byId.get(node.parentId)?.childIds.push(node.id);
    return node;
  };
  const root = make({
    kind: "ROOT", label: "ROOT", sectionNumber: null, path: "", title: null, level: null,
    start: 0, headingEnd: 0, end: text.length, parentId: null, depth: 0, status: "OK", issues: [],
  });

  let headings: Heading[] = [];
  let furniture: FurnitureSpan[] = [];
  let tocIdx = new Set<number>();
  try {
    headings = findHeadings(text);
    ({ furniture, tocIdx } = findFurniture(text, headings));
  } catch (e) {
    parseErrors.push(`heading scan failed: ${e instanceof Error ? e.message : String(e)}`);
    root.status = "FAIL_CLOSED";
    return { textLength: text.length, nodes, byId, furniture, tocExcluded: false, parseErrors };
  }
  const body = headings.filter((_, i) => !tocIdx.has(i));
  // Drop repeated identical section numbers within 200 chars (heading echoes).
  const kept: Heading[] = [];
  for (const h of body) {
    const prev = kept[kept.length - 1];
    if (prev && prev.kind === h.kind && prev.number === h.number && h.start - prev.start < 200) continue;
    kept.push(h);
  }

  let article: TreeNode | null = null;
  let section: TreeNode | null = null;
  for (let i = 0; i < kept.length; i++) {
    const h = kept[i]!;
    if (h.kind === "ARTICLE") {
      if (section) section.end = h.start;
      if (article) article.end = h.start;
      section = null;
      article = make({
        kind: "ARTICLE", label: h.label, sectionNumber: null, path: h.label, title: h.title, level: null,
        start: h.start, headingEnd: h.headingEnd, end: text.length, parentId: root.id, depth: 1, status: "OK", issues: [],
      });
    } else {
      if (section) section.end = h.start;
      const parent = article ?? root;
      section = make({
        kind: "SECTION", label: h.label, sectionNumber: h.number, path: h.number!, title: h.title, level: null,
        start: h.start, headingEnd: h.headingEnd, end: article ? article.end : text.length, parentId: parent.id,
        depth: parent.depth + 1, status: "OK", issues: [],
      });
    }
  }
  // Fix section ends to their article end when they are last in the article.
  for (const n of nodes) {
    if (n.kind !== "SECTION") continue;
    const p = byId.get(n.parentId!)!;
    if (n.end > p.end) n.end = p.end;
  }
  // Clauses per section, failing closed per section.
  for (const n of nodes.filter((x) => x.kind === "SECTION")) {
    try {
      parseClauses(text, n, make);
    } catch (e) {
      n.status = "FAIL_CLOSED";
      n.issues.push(`clause parse failed: ${e instanceof Error ? e.message : String(e)}`);
      parseErrors.push(`${n.path}: clause parse failed`);
    }
  }
  return { textLength: text.length, nodes, byId, furniture, tocExcluded: tocIdx.size > 0 || furniture.some((f) => f.kind === "TOC"), parseErrors };
}

/** Deepest node whose span contains [start, end). */
export function deepestContaining(tree: SectionTree, start: number, end: number): TreeNode {
  let best = tree.nodes[0]!;
  for (const n of tree.nodes) {
    if (n.start <= start && n.end >= end && n.depth >= best.depth) best = n;
  }
  return best;
}

/** Nearest SECTION ancestor-or-self. */
export function sectionOf(tree: SectionTree, node: TreeNode): TreeNode | null {
  let cur: TreeNode | undefined = node;
  while (cur) {
    if (cur.kind === "SECTION") return cur;
    cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined;
  }
  return null;
}

export interface TreeStats {
  articles: number;
  sections: number;
  clauses: number;
  maxDepth: number;
  unparsedPct: number;
  tocExcluded: boolean;
  failClosedSections: number;
  sequenceGapSections: number;
  parseErrors: number;
}

/** Unparsed = non-whitespace chars not inside any SECTION node and not furniture. */
export function treeStats(tree: SectionTree, text: string): TreeStats {
  const covered = new Uint8Array(text.length);
  for (const n of tree.nodes) if (n.kind === "SECTION") covered.fill(1, n.start, n.end);
  for (const f of tree.furniture) covered.fill(1, f.start, f.end);
  let total = 0, un = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!)) continue;
    total++;
    if (!covered[i]) un++;
  }
  const kinds = (k: NodeKind) => tree.nodes.filter((n) => n.kind === k).length;
  return {
    articles: kinds("ARTICLE"),
    sections: kinds("SECTION"),
    clauses: kinds("CLAUSE"),
    maxDepth: Math.max(0, ...tree.nodes.map((n) => n.depth)),
    unparsedPct: total ? Math.round((1000 * un) / total) / 10 : 100,
    tocExcluded: tree.tocExcluded,
    failClosedSections: tree.nodes.filter((n) => n.status === "FAIL_CLOSED").length,
    sequenceGapSections: tree.nodes.filter((n) => n.status === "SEQUENCE_GAP").length,
    parseErrors: tree.parseErrors.length,
  };
}

import { stripHtmlPreserveStructure } from "../compiler/deterministic-extraction/html-text";

export type TextBasis = "PLAIN" | "HTML_STRIPPED";

export function looksLikeHtml(raw: string): boolean {
  return (raw.slice(0, 200000).match(/<(?:p|div|td|tr|font|span|br)\b/gi) ?? []).length >= 20;
}

/**
 * Canonical text the tree is parsed over. HTML filings are stripped with the repo's
 * structure-preserving stripper; NBSP is mapped to a space (same length). All spans
 * are exact offsets into the returned text.
 */
export function treeText(raw: string): { text: string; basis: TextBasis } {
  const basis: TextBasis = looksLikeHtml(raw) ? "HTML_STRIPPED" : "PLAIN";
  let t = basis === "HTML_STRIPPED" ? stripHtmlPreserveStructure(raw) : raw;
  t = t
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(ldquo|rdquo|lsquo|rsquo|mdash|ndash|sect|quot|apos);/g, (_, n: string) =>
      ({ ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019", mdash: "\u2014", ndash: "\u2013", sect: "\u00a7", quot: '"', apos: "'" })[n] ?? " ",
    );
  return { text: t.replace(/\u00a0/g, " "), basis };
}

export function parseDocumentTree(raw: string): SectionTree & { text: string; basis: TextBasis } {
  const { text, basis } = treeText(raw);
  return { ...parseSectionTree(text), text, basis };
}
