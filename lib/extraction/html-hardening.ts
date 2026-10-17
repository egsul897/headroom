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
