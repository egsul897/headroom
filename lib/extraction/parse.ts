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

export interface ParsedPage {
  /** 1-indexed. Always 1 for formats with no real page concept (DOCX, TXT). */
  pageNumber: number;
  text: string;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  /** pages' text joined with "\n\n" - what lib/extraction/chunk.ts actually segments. */
  fullText: string;
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
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec))).replace(/&[a-zA-Z#0-9]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function stripHtmlToText(html: string): string {
  const withoutNonContent = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const withBreaks = withoutNonContent.replace(/<\/(p|div|tr|h[1-6]|li|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
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
  const pages: ParsedPage[] = [{ pageNumber: 1, text: stripHtmlToText(data.toString("utf-8")) }];
  return { pages, fullText: joinPages(pages) };
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
