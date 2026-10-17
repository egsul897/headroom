/**
 * HTML → plain text for Phase 2A structural parsing.
 * Preserve block newlines so heading regexes can fire; do not collapse the
 * entire filing into a single whitespace run (that produced empty parses).
 */
import { decodeNumericEntities, dropStruckHtml } from "../../../extraction/html-hardening";

/* Struck-through (deleted) text is dropped; numeric references, decimal and hex, decode to code points. */
export function stripHtmlPreserveStructure(html: string): string {
  const text = dropStruckHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|section|article|header|footer)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
  return decodeNumericEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
