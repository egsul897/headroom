/**
 * HTML → plain text for Phase 2A structural parsing.
 * Preserve block newlines so heading regexes can fire; do not collapse the
 * entire filing into a single whitespace run (that produced empty parses).
 */
/**
 * Decode common HTML character references that survive tag stripping.
 * Hex numeric entities (`&#x201c;`) appear routinely in EDGAR HTML exhibits;
 * leaving them literal breaks definition/covenant detectors that expect real
 * quotation marks. Decimal `&#NNN;` was already handled; hex was not —
 * Agent 6 authentic-package validation surfaced this on Benchmark (BHE).
 */
function decodeHtmlCharacterReferences(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    // EDGAR HTML is often Windows-1252. When those bytes are misread as
    // Latin-1/Unicode, curly quotes land in the C1 controls (U+0091–U+0094)
    // instead of U+2018–U+201D. Map them so definition detectors see real quotes.
    // Surfaced on authentic Insulet Credit Agreement (Agent 6).
    .replace(/\u0091/g, "\u2018")
    .replace(/\u0092/g, "\u2019")
    .replace(/\u0093/g, "\u201c")
    .replace(/\u0094/g, "\u201d");
}

export function stripHtmlPreserveStructure(html: string): string {
  return decodeHtmlCharacterReferences(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<\/(p|div|tr|h[1-6]|li|table|section|article|header|footer)[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
