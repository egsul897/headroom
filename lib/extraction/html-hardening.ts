/**
 * HTML hardening shared by the text extractors (lib/extraction/parse.ts and
 * lib/contract-model/compiler/deterministic-extraction/html-text.ts).
 *
 * 1. Struck-through text is deleted text. Conformed copies and amendment
 *    exhibits filed on EDGAR show deletions as <s>, <strike>, <del> or a
 *    `text-decoration: line-through` style; reading that text as in force
 *    produces figures and terms the parties removed. It is dropped.
 *    Insertions (<ins>, underline) are kept: they are in force.
 * 2. Numeric character references, decimal (&#8220;) and hexadecimal
 *    (&#x201C;), decode to their code points. Undecoded hex quotes broke
 *    every `"Term" means` lookup in filings that encode quotes that way.
 */

const STRUCK_TAGS = new Set(["s", "strike", "del"]);
const LINE_THROUGH = /text-decoration(?:-line)?\s*:[^;"'>]*\bline-through\b/i;
const VOID_TAGS = new Set(["br", "hr", "img", "meta", "link", "input", "col", "area", "base", "wbr", "source", "param", "embed", "track"]);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*)>/g;

function isStruckOpen(name: string, attrs: string): boolean {
  if (STRUCK_TAGS.has(name)) return true;
  const style = /\bstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(attrs);
  return !!style && LINE_THROUGH.test(style[1]!);
}

/**
 * Remove every element that renders struck through, with its content. The
 * matching close tag is found by counting same-name open/close tags, so
 * nested elements inside a struck span go with it. An element whose close
 * tag never appears (malformed HTML) is left in place rather than deleting
 * the rest of the document.
 */
export function dropStruckHtml(html: string): string {
  if (!/<(?:s|strike|del)\b|line-through/i.test(html)) return html;
  let out = "";
  let last = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html))) {
    const [, slash, rawName, attrs] = m;
    const name = rawName!.toLowerCase();
    if (slash || VOID_TAGS.has(name) || /\/\s*$/.test(attrs!) || !isStruckOpen(name, attrs!)) continue;
    const end = matchingCloseEnd(html, name, TAG.lastIndex);
    if (end < 0) continue;
    // A space, not nothing: "exceed<s>$75</s>$100" must not glue the neighbours together.
    out += html.slice(last, m.index) + " ";
    last = end;
    TAG.lastIndex = end;
  }
  return out + html.slice(last);
}

function matchingCloseEnd(html: string, name: string, from: number): number {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) depth--;
    else if (!/\/\s*>$/.test(m[0])) depth++;
    if (depth === 0) return re.lastIndex;
  }
  return -1;
}

/**
 * P1 (PR #428 drift correction): an UNMATCHED struck element — a
 * <s>/<strike>/<del> (or line-through styled element) whose close tag
 * never appears — is genuinely ambiguous. The drafter may have meant
 * everything after it deleted, or the tag may be a conversion
 * artifact. dropStruckHtml leaves such an element in place (deleting
 * to end-of-document on a guess would destroy live text), but until
 * now the surviving text was indistinguishable from clean operative
 * text, so downstream stages could mint authoritative conclusions
 * (a basket cap, a compiled formula) from text the parties may have
 * deleted. The functions below RECORD the ambiguity instead: the
 * span is preserved as evidence, items whose source intersects it
 * inherit the uncertainty, and the formula compiler refuses to mint
 * from it (see lib/product/customer-intelligence/formula-parse.ts).
 *
 * Call findUnmatchedStruckSpans on the OUTPUT of dropStruckHtml:
 * there, every struck open that remains is unmatched by construction
 * (dropStruckHtml removes each open together with its balancing
 * close), so no depth bookkeeping is needed here.
 */
export interface UnmatchedStruckSpan {
  /** Lowercased tag name of the unmatched element ("strike", "s", "del", or the styled element's tag). */
  tagName: string;
  /** True when the element is struck via a line-through style rather than a struck tag name. */
  styled: boolean;
  /** Offset of the open tag in the analyzed (post-drop) HTML. */
  htmlStart: number;
  /** Offset just past the ambiguous span in the analyzed HTML (includes a terminating stray close tag when one ended the span). */
  htmlEnd: number;
  /** The ambiguous content's raw HTML (between the open tag and the span boundary), preserved as evidence. */
  innerHtml: string;
}

const BLOCK_TAGS = new Set([
  "p", "div", "tr", "td", "th", "table", "thead", "tbody", "tfoot",
  "li", "ul", "ol", "dl", "dt", "dd", "section", "article", "header",
  "footer", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
  "hr", "figure", "figcaption", "main", "nav", "aside", "address",
  "fieldset",
]);

/**
 * Find struck elements whose close tag never appears and delimit the
 * text they render ambiguous. A span runs from the unmatched open tag
 * to the EARLIEST of: a close tag for any struck tag name (a stray
 * close a reader would take as ending the redline), a block-level tag
 * boundary (inline redline formatting does not credibly span block
 * structure — text in later blocks is not swept into this span), or
 * end of document. The content is NOT removed — it stays in the text
 * as evidence, flagged by this record.
 */
export function findUnmatchedStruckSpans(html: string): UnmatchedStruckSpan[] {
  if (!/<(?:s|strike|del)\b|line-through/i.test(html)) return [];
  const spans: UnmatchedStruckSpan[] = [];
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  let open: { tagName: string; styled: boolean; htmlStart: number; contentStart: number } | null = null;
  const closeSpan = (htmlEnd: number, contentEnd: number) => {
    if (!open) return;
    spans.push({
      tagName: open.tagName,
      styled: open.styled,
      htmlStart: open.htmlStart,
      htmlEnd,
      innerHtml: html.slice(open.contentStart, contentEnd),
    });
    open = null;
  };
  while ((m = TAG.exec(html))) {
    const [, slash, rawName, attrs] = m;
    const name = rawName!.toLowerCase();
    const struckOpen = !slash && !VOID_TAGS.has(name) && !/\/\s*$/.test(attrs!) && isStruckOpen(name, attrs!);
    if (open) {
      if (slash && STRUCK_TAGS.has(name)) {
        // A stray close for a struck element ends the redline a
        // reader sees — the span ends here, whichever name opened it.
        closeSpan(TAG.lastIndex, m.index);
        continue;
      }
      if (BLOCK_TAGS.has(name)) {
        // Block boundary: the ambiguous span ends before this tag.
        // The tag itself is then processed normally below (it may
        // itself be a styled struck block element opening a new span).
        closeSpan(m.index, m.index);
      } else {
        // Any other tag inside the span (including nested struck
        // opens) is part of the ambiguous content.
        continue;
      }
    }
    if (struckOpen) {
      open = {
        tagName: name,
        styled: !STRUCK_TAGS.has(name),
        htmlStart: m.index,
        contentStart: TAG.lastIndex,
      };
    }
  }
  if (open) closeSpan(html.length, html.length);
  return spans;
}

/** dropStruckHtml + the unmatched-span record for the same input, in one call. */
export function analyzeStruckHtml(html: string): { html: string; unmatched: UnmatchedStruckSpan[] } {
  const dropped = dropStruckHtml(html);
  return { html: dropped, unmatched: findUnmatchedStruckSpans(dropped) };
}

/**
 * Locate `needle` inside `haystack`, tolerating whitespace
 * differences (the needle is typically a fragment stripped on its
 * own, whose line joins and space collapses differ from the same
 * text stripped in context). Returns offsets into the ORIGINAL
 * haystack, or null when the needle's words do not appear.
 */
export function locateTextSpan(haystack: string, needle: string): { start: number; end: number } | null {
  if (!needle) return null;
  const exact = haystack.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length };
  const collapse = (s: string): { text: string; map: number[] } => {
    let text = "";
    const map: number[] = [];
    let pendingSpaceFrom = -1;
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i]!)) {
        if (text.length > 0 && pendingSpaceFrom < 0) pendingSpaceFrom = i;
        continue;
      }
      if (pendingSpaceFrom >= 0) {
        text += " ";
        map.push(pendingSpaceFrom);
        pendingSpaceFrom = -1;
      }
      text += s[i];
      map.push(i);
    }
    return { text, map };
  };
  const h = collapse(haystack);
  const n = collapse(needle).text;
  if (!n) return null;
  const idx = h.text.indexOf(n);
  if (idx < 0) return null;
  const start = h.map[idx]!;
  const end = h.map[idx + n.length - 1]! + 1;
  return { start, end };
}

function codePoint(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
  return String.fromCodePoint(n);
}

/** Decode decimal and hexadecimal numeric character references; an invalid one becomes a space. */
export function decodeNumericEntities(text: string): string {
  return text
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (_, h: string) => codePoint(parseInt(h, 16)) ?? " ")
    .replace(/&#(\d{1,7});/g, (_, d: string) => codePoint(Number(d)) ?? " ");
}
