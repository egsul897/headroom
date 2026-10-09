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
    // Unsupported / failed parse — retain raw utf8 best-effort without inventing structure.
    const text = normalizeText(bytes.toString("utf8"));
    return { text, mimeType, normalizedTextHash: hashText(text) };
  }
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
