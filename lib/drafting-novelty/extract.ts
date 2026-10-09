/**
 * Window extraction over financing document text.
 * Deterministic section/definition/proviso-oriented slicing — no LLM.
 */
import { createHash } from "node:crypto";
import { normalizeDraftingText, sha256Hex } from "./normalize";
import { categoryHasCoreToken, detectCategories, extractSignatureTokens, makeSignature } from "./signatures";
import { shingles } from "./similarity";
import type { DocumentSource, DraftingUnit } from "./types";

const MIN_WINDOW = 180;
const MAX_WINDOW = 1400;

function unitIdFor(documentId: string, category: string, charStart: number, charEnd: number, excerpt: string): string {
  const h = sha256Hex(`${documentId}|${category}|${charStart}|${charEnd}|${excerpt.slice(0, 120)}`);
  return `draft-unit:${h.slice(0, 24)}`;
}

function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** Split on SECTION / Article / numbered covenant heads and definition quote leads. */
export function splitCandidateWindows(raw: string): Array<{ start: number; end: number; text: string }> {
  const text = normalizeDraftingText(raw);
  const markers: number[] = [0];
  const re =
    /(?:^|\n)\s*(?:SECTION|Section|ARTICLE|Article)\s+[0-9]+(?:\.[0-9]+)?(?:\([a-z0-9]+\))?|(?:^|\n)\s*\([a-z]\)\s+[A-Z]|(?:^|\n)\s*“[A-Z][^”]{2,80}”\s*(?:means|has the meaning)|(?:^|\n)\s*"[A-Z][^"]{2,80}"\s*(?:means|has the meaning)|(?:^|\n)\s*provided that\b|(?:^|\n)\s*Notwithstanding\b/g;

  for (const m of text.matchAll(re)) {
    if (typeof m.index === "number" && m.index > 0) markers.push(m.index);
  }
  markers.push(text.length);

  const unique = [...new Set(markers)].sort((a, b) => a - b);
  const windows: Array<{ start: number; end: number; text: string }> = [];

  for (let i = 0; i < unique.length - 1; i++) {
    const start = unique[i]!;
    let end = unique[i + 1]!;
    // Grow tiny slices forward so provisos/definitions aren't orphaned.
    while (end - start < MIN_WINDOW && i + 1 < unique.length - 1) {
      i++;
      end = unique[i + 1]!;
    }
    if (end - start < 80) continue;
    const sliceEnd = Math.min(end, start + MAX_WINDOW);
    const slice = text.slice(start, sliceEnd).trim();
    if (slice.length < 80) continue;
    windows.push({ start, end: start + slice.length, text: slice });
  }

  // Also emit sliding hotspot windows around high-signal phrases.
  const hotspot =
    /\b(reclassif(?:y|ies|ied|ication)|in the aggregate with|intercreditor|standstill|fixed amounts?|incurrence-based|yank-a-bank|greater of|non-loan part(?:y|ies)|subject to the (?:abl |first lien )?intercreditor)\b/gi;
  for (const m of text.matchAll(hotspot)) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - 220);
    const end = Math.min(text.length, idx + 900);
    const slice = text.slice(start, end).trim();
    if (slice.length >= 80) windows.push({ start, end: start + slice.length, text: slice });
  }

  // Dedup by content hash of normalized slice.
  const seen = new Set<string>();
  const deduped: typeof windows = [];
  for (const w of windows) {
    const key = contentHash(w.text.replace(/\s+/g, " ").toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(w);
  }
  return deduped;
}

export function extractUnitsFromDocument(source: DocumentSource, rawText: string): DraftingUnit[] {
  const windows = splitCandidateWindows(rawText);
  const units: DraftingUnit[] = [];

  for (const w of windows) {
    const categories = detectCategories(w.text);
    if (categories.length === 0) continue;
    for (const category of categories) {
      const tokens = extractSignatureTokens(category, w.text);
      if (!categoryHasCoreToken(category, tokens)) continue;
      const signature = makeSignature(category, tokens);
      const excerpt = w.text.replace(/\s+/g, " ").slice(0, 480);
      units.push({
        unitId: unitIdFor(source.documentId, category, w.start, w.end, excerpt),
        documentId: source.documentId,
        packageId: source.packageId,
        role: source.role,
        category,
        span: {
          documentId: source.documentId,
          path: source.path,
          charStart: w.start,
          charEnd: w.end,
          excerpt,
        },
        normalizedText: w.text.replace(/\s+/g, " ").trim(),
        signature,
        shingles: shingles(w.text),
      });
    }
  }

  return units;
}
