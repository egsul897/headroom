/**
 * Document parsing (docs/document-onboarding-pipeline-foundation.md). Turns
 * an uploaded file's raw bytes into plain text, page by page where the
 * source format has a real page concept. Pure - no Prisma, no
 * DocumentStorageProvider dependency; callers fetch bytes via
 * lib/document-storage/** first, then hand them here.
 *
 * PDF: unpdf (https://www.npmjs.com/package/unpdf) - a zero-hard-dependency,
 * pure-JS wrapper around a serverless-optimized PDF.js build, chosen
 * specifically because it has no native addon to compile (the task's own
 * hard requirement for Vercel's serverless runtime - a `pdf-parse`/
 * `canvas`-style native-binding library would break there). Its optional
 * peer dependency (`@napi-rs/canvas`) is only needed for image rendering,
 * which this file never calls.
 *
 * DOCX: mammoth (https://www.npmjs.com/package/mammoth) - also pure JS, no
 * native deps. Raw-text extraction only (`extractRawText`) - this pipeline
 * needs the document's prose, not its visual formatting.
 *
 * TXT: read directly, no library needed.
 *
 * HTML: additive (docs/autonomous-retrieval-phase-a-foundation.md) - SEC
 * EDGAR exhibit documents (credit agreements/indentures/amendments) are
 * almost always filed as plain .htm, not PDF/DOCX, so EdgarConnector-fetched
 * bytes need a real parse path here for the connector to actually work
 * end-to-end. A small regex-based tag-stripper (this codebase's own
 * established "pragmatic heuristic, not a new dependency" preference - same
 * rationale as lib/extraction/chunk.ts's own segmenter), not a full HTML/DOM
 * parser - strips <script>/<style> blocks, turns block-level tags into
 * paragraph breaks, decodes the small set of entities SEC filings actually
 * use, and drops every remaining tag.
 */

import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { analyzeStruckHtml, decodeNumericEntities, dropStruckHtml, locateTextSpan } from "./html-hardening";

export interface ParsedPage {
  /** 1-indexed. Always 1 for formats with no real page concept (DOCX, TXT). */
  pageNumber: number;
  text: string;
}

/**
 * A span of extracted text whose operative status is AMBIGUOUS
 * because it follows an unmatched struck-through (redline deletion)
 * element: the element's close tag never appears, so the span may be
 * text the parties deleted — or live text after a stray tag. The
 * text is preserved in the document (evidence is never destroyed on
 * a guess); this record is how the uncertainty propagates: items
 * whose source intersects the span are flagged, and authoritative
 * conclusions (compiled formulas, capacity) must not rest on it.
 */
export interface RedlineAmbiguity {
  reason: "UNMATCHED_REDLINE_ELEMENT";
  /** Tag name of the unmatched element ("strike" | "s" | "del" | styled element's tag). */
  tagName: string;
  /** The ambiguous span's plain text, as it appears in the document text ("" when it carried no text). */
  text: string;
  /** Offsets into ParsedDocument.fullText; -1 when the span text could not be located verbatim. */
  start: number;
  end: number;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  /** pages' text joined with "\n\n" - what lib/extraction/chunk.ts actually segments. */
  fullText: string;
  /** Redline-ambiguous spans found during HTML extraction (HTML inputs only). */
  redlineAmbiguities?: RedlineAmbiguity[];
}

const PDF_CONTENT_TYPES = new Set(["application/pdf"]);
const DOCX_CONTENT_TYPES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const TXT_CONTENT_TYPES = new Set(["text/plain"]);
const HTML_CONTENT_TYPES = new Set(["text/html"]);

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&sect;": "§",
  "&hellip;": "…",
  "&bull;": "•",
  "&middot;": "·",
  "&shy;": "",
  "&ensp;": " ",
  "&emsp;": " ",
  "&thinsp;": " ",
};

function decodeHtmlEntities(text: string): string {
  // Numeric references, hex (&#x24;) and decimal (&#36;), decode to code points (lib/extraction/html-hardening.ts).
  return decodeNumericEntities(text).replace(/&[a-zA-Z0-9]+;/g, (entity) => HTML_ENTITIES[entity] ?? HTML_ENTITIES[entity.toLowerCase()] ?? entity);
}

function stripHtmlToText(html: string): string {
  const withoutNonContent = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  // Blackline/amendment exhibits mark DELETED text with <strike>, <s> or
  // <del>, or with a `text-decoration: line-through` style. Struck text is not
  // operative: keeping it made the engine compute a deleted basket cap as if
  // it were live. Drop the element AND its contents (nested markup included)
  // before tag stripping, like script/style above (lib/extraction/html-hardening.ts).
  const withoutStruck = dropStruckHtml(withoutNonContent);
  const withBreaks = withoutStruck.replace(/<\/(p|div|tr|h[1-6]|li|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(stripped);
  return decoded
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1] !== ""))
    .join("\n")
    .trim();
}

function parseHtml(data: Buffer): ParsedDocument {
  const rawHtml = data.toString("utf-8");
  const withoutNonContent = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const { html: withoutStruck, unmatched } = analyzeStruckHtml(withoutNonContent);
  const text = stripHtmlToText(withoutStruck);
  const pages: ParsedPage[] = [{ pageNumber: 1, text }];
  const fullText = joinPages(pages);
  // Record every unmatched struck element's span in fullText
  // coordinates. The span text is produced by running the span's own
  // HTML fragment through the same strip pipeline, then located in
  // the document text; when it cannot be located verbatim the record
  // keeps the text with start/end = -1 (consumers fall back to text
  // containment — the uncertainty is never dropped).
  const redlineAmbiguities: RedlineAmbiguity[] = unmatched.map((span) => {
    const spanText = stripHtmlToText(withoutStruck.slice(span.htmlStart, span.htmlEnd));
    if (!spanText) {
      return { reason: "UNMATCHED_REDLINE_ELEMENT" as const, tagName: span.tagName, text: "", start: fullText.length, end: fullText.length };
    }
    const located = locateTextSpan(fullText, spanText);
    return {
      reason: "UNMATCHED_REDLINE_ELEMENT" as const,
      tagName: span.tagName,
      text: spanText,
      start: located?.start ?? -1,
      end: located?.end ?? -1,
    };
  });
  return { pages, fullText, redlineAmbiguities };
}

function joinPages(pages: ParsedPage[]): string {
  return pages.map((p) => p.text).join("\n\n");
}

async function parsePdf(data: Buffer): Promise<ParsedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: ParsedPage[] = text.map((pageText, index) => ({ pageNumber: index + 1, text: pageText }));
  return { pages, fullText: joinPages(pages) };
}

async function parseDocx(data: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer: data });
  // DOCX has no page concept without rendering it - the whole document is
  // page 1; DocumentChunk.page is nullable precisely for this case.
  const pages: ParsedPage[] = [{ pageNumber: 1, text: result.value }];
  return { pages, fullText: joinPages(pages) };
}

function parseTxt(data: Buffer): ParsedDocument {
  const pages: ParsedPage[] = [{ pageNumber: 1, text: data.toString("utf-8") }];
  return { pages, fullText: joinPages(pages) };
}

/** Throws on an unsupported contentType - callers must not silently treat unparseable bytes as empty text. */
export async function parseDocument(data: Buffer, contentType: string): Promise<ParsedDocument> {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (PDF_CONTENT_TYPES.has(normalized)) return parsePdf(data);
  if (DOCX_CONTENT_TYPES.has(normalized)) return parseDocx(data);
  if (TXT_CONTENT_TYPES.has(normalized)) return parseTxt(data);
  if (HTML_CONTENT_TYPES.has(normalized)) return parseHtml(data);
  throw new Error(`parseDocument: unsupported contentType "${contentType}" (supported: PDF, DOCX, TXT, HTML)`);
}
