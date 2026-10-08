/**
 * Source provenance for basket/formula corpus spans.
 * Distinguishes byte-exact matches from whitespace-normalized matches.
 */
import { createHash } from "node:crypto";

export const NORMALIZATION_VERSION = "whitespace-collapse.v1";

export type SpanMatchKind = "BYTE_EXACT" | "WHITESPACE_NORMALIZED" | "NOT_FOUND";

export interface SourceProvenance {
  documentPath: string;
  sourceHashSha256: string;
  sourceByteLength: number;
  exactSourceSpan: string;
  extractedSpanHashSha256: string;
  matchKind: SpanMatchKind;
  /** Inclusive start / exclusive end into the ORIGINAL source bytes (utf8), only when BYTE_EXACT. */
  byteOffsetStart: number | null;
  byteOffsetEnd: number | null;
  /** Character offsets into the original utf8 string, only when BYTE_EXACT. */
  charOffsetStart: number | null;
  charOffsetEnd: number | null;
  normalizedSpan: string;
  normalizationVersion: string;
  /** True only when matchKind === BYTE_EXACT. */
  byteExact: boolean;
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildProvenance(sourceText: string, exactSourceSpan: string, documentPath: string): SourceProvenance {
  const sourceHashSha256 = sha256Text(sourceText);
  const extractedSpanHashSha256 = sha256Text(exactSourceSpan);
  const normalizedSpan = normalizeWhitespace(exactSourceSpan);
  const byteExactIdx = sourceText.indexOf(exactSourceSpan);
  if (byteExactIdx >= 0) {
    const charOffsetStart = byteExactIdx;
    const charOffsetEnd = byteExactIdx + exactSourceSpan.length;
    const before = Buffer.from(sourceText.slice(0, charOffsetStart), "utf8");
    const spanBuf = Buffer.from(exactSourceSpan, "utf8");
    return {
      documentPath,
      sourceHashSha256,
      sourceByteLength: Buffer.byteLength(sourceText, "utf8"),
      exactSourceSpan,
      extractedSpanHashSha256,
      matchKind: "BYTE_EXACT",
      byteOffsetStart: before.length,
      byteOffsetEnd: before.length + spanBuf.length,
      charOffsetStart,
      charOffsetEnd,
      normalizedSpan,
      normalizationVersion: NORMALIZATION_VERSION,
      byteExact: true,
    };
  }
  const normSource = normalizeWhitespace(sourceText);
  const normIdx = normSource.indexOf(normalizedSpan);
  if (normIdx >= 0) {
    return {
      documentPath,
      sourceHashSha256,
      sourceByteLength: Buffer.byteLength(sourceText, "utf8"),
      exactSourceSpan,
      extractedSpanHashSha256,
      matchKind: "WHITESPACE_NORMALIZED",
      byteOffsetStart: null,
      byteOffsetEnd: null,
      charOffsetStart: null,
      charOffsetEnd: null,
      normalizedSpan,
      normalizationVersion: NORMALIZATION_VERSION,
      byteExact: false,
    };
  }
  return {
    documentPath,
    sourceHashSha256,
    sourceByteLength: Buffer.byteLength(sourceText, "utf8"),
    exactSourceSpan,
    extractedSpanHashSha256,
    matchKind: "NOT_FOUND",
    byteOffsetStart: null,
    byteOffsetEnd: null,
    charOffsetStart: null,
    charOffsetEnd: null,
    normalizedSpan,
    normalizationVersion: NORMALIZATION_VERSION,
    byteExact: false,
  };
}
