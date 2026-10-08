/**
 * Deterministic text normalization for drafting novelty.
 * Strips EDGAR/HTML artifacts and collapses whitespace without changing legal meaning tokens.
 */
import { createHash } from "node:crypto";

export function normalizeDraftingText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’‛']/g, "'")
    .replace(/[“”‟"]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/[\u00ad]/g, "")
    .replace(/\bEX-\d+\.\d+\b/gi, " ")
    .replace(/\bd\d+dex\d+\.htm\b/gi, " ")
    .replace(/\n[ \t]*\d{1,4}[ \t]*\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeForMatch(text: string): string {
  return normalizeDraftingText(text)
    .toLowerCase()
    .replace(/[^a-z0-9%$.:;()\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Amount / percentage / ratio literals → placeholders so lexical compare focuses on drafting shape. */
export function maskNumericLiterals(text: string): string {
  return normalizeForMatch(text)
    .replace(/(?:us\$|c\$|cad\s?\$|usd\s?\$|\$)\s?[0-9][0-9,]*(?:\.[0-9]+)?(?:\s*(?:million|billion|mm|bn))?/g, " <MONEY> ")
    .replace(/\b[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?\b/g, " <NUM> ")
    .replace(/\b[0-9]+(?:\.[0-9]+)?\s?%/g, " <PCT> ")
    .replace(/\b[0-9]+(?:\.[0-9]+)?\s*(?:to|:)\s*[0-9]+(?:\.[0-9]+)?\b/g, " <RATIO> ")
    .replace(/\b[0-9]+(?:\.[0-9]+)?x\b/g, " <RATIO> ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
