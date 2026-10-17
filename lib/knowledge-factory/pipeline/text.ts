import { createHash } from "node:crypto";
import { parseDocument } from "../../extraction/parse";

export function extractTextFromBytes(bytes: Buffer, mimeHint?: string, filename?: string): { text: string; mimeType: string } {
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  let mimeType = mimeHint ?? "application/octet-stream";
  if (!mimeHint) {
    if (ext === "htm" || ext === "html") mimeType = "text/html";
    else if (ext === "txt") mimeType = "text/plain";
    else if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (bytes.slice(0, 15).toString("utf8").toLowerCase().includes("<html") || bytes.slice(0, 50).toString("utf8").includes("<!DOCTYPE")) {
      mimeType = "text/html";
    } else if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
      // Sniff: stored objects often arrive without a filename, and a PDF
      // misdetected as text/plain would be dumped as raw bytes.
      mimeType = "application/pdf";
    } else if (bytes.subarray(0, 4).toString("latin1") === "PK\u0003\u0004") {
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      mimeType = "text/plain";
    }
  }
  // parseDocument is async for PDF; for sync path use HTML/TXT only and fall back.
  return { text: "", mimeType };
}

export async function extractTextAsync(bytes: Buffer, filename?: string): Promise<{ text: string; mimeType: string; normalizedTextHash: string }> {
  const { mimeType } = extractTextFromBytes(bytes, undefined, filename);
  try {
    const parsed = await parseDocument(bytes, mimeType);
    const text = normalizeText(parsed.fullText);
    return { text, mimeType, normalizedTextHash: hashText(text) };
  } catch {
    // Unsupported / failed parse — never surface raw bytes as "text". A PDF
    // that fails to parse is binary (starts "%PDF", contains NULs); dumping
    // it as UTF-8 produced the live source-text page showing "%PDF-1.7"
    // plus compressed binary gibberish. Return empty so callers show an
    // honest "extraction unavailable" state instead of fake text.
    if (looksBinary(bytes)) {
      return { text: "", mimeType, normalizedTextHash: hashText("") };
    }
    const text = normalizeText(bytes.toString("utf8"));
    return { text, mimeType, normalizedTextHash: hashText(text) };
  }
}

/** True for PDF / ZIP-based (DOCX) / other binary bytes — never text. */
function looksBinary(bytes: Buffer): boolean {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return true;
  // ZIP containers (DOCX) and most binary formats contain NUL bytes; text
  // documents do not.
  if (bytes.includes(0)) return true;
  return false;
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
