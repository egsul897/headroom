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
  throw new Error(`parseDocument: unsupported contentType "${contentType}" (supported: PDF, DOCX, TXT)`);
}
