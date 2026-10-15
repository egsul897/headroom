/**
 * Source text for the document page: extracted text, never raw bytes.
 *
 * The document page used to render `bytes.toString("utf8")` for stored
 * objects, so a PDF displayed raw "%PDF-1.7" bytes plus compressed binary
 * gibberish even though extracted text existed elsewhere in the pipeline.
 * This helper routes every byte source through the real extractor and
 * returns empty text (with an honest origin) when extraction yields nothing.
 */
import { extractTextAsync } from "../../knowledge-factory/pipeline/text";

export interface SourceTextResult {
  text: string;
  origin: string;
  truncated: boolean;
}

const MAX_DISPLAY_CHARS = 120_000;

export async function loadSourceTextFromBytes(
  bytes: Buffer,
  filename: string,
  origin = "stored object",
): Promise<SourceTextResult> {
  const { text } = await extractTextAsync(bytes, filename);
  if (!text) {
    return {
      text: "",
      origin: `${origin} — extracted text unavailable`,
      truncated: false,
    };
  }
  if (text.length > MAX_DISPLAY_CHARS) {
    return {
      text: `${text.slice(0, MAX_DISPLAY_CHARS)}\n\n… [truncated for display — full bytes remain in storage] …`,
      origin,
      truncated: true,
    };
  }
  return { text, origin, truncated: false };
}
