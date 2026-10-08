/**
 * Source-span validation — verifies corpus excerpts against on-disk files.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeText } from "./knowledge";
import type { PrecedentProvision } from "./types";

export interface SourceSpanValidation {
  provisionId: string;
  ok: boolean;
  reason: string;
}

export function validateSourceSpan(provision: PrecedentProvision, baseDir: string = process.cwd()): SourceSpanValidation {
  const abs = join(baseDir, provision.locator.sourcePath);
  if (!existsSync(abs)) {
    return { provisionId: provision.provisionId, ok: false, reason: `missing source file ${provision.locator.sourcePath}` };
  }
  if (provision.locator.sourcePath.includes("reviewed-examples.ts")) {
    // Quality-suite synthetic provisions are intentionally in-module.
    return { provisionId: provision.provisionId, ok: true, reason: "synthetic quality-suite provision" };
  }
  const fileText = readFileSync(abs, "utf8");
  const { charStart, charEnd } = provision.locator;
  if (charStart < 0 || charEnd > fileText.length || charStart >= charEnd) {
    return { provisionId: provision.provisionId, ok: false, reason: `invalid offsets ${charStart}:${charEnd} (file ${fileText.length})` };
  }
  const window = fileText.slice(Math.max(0, charStart - 40), Math.min(fileText.length, charEnd + 40));
  const excerpt = normalizeText(provision.sourceText).slice(0, 80);
  const hay = normalizeText(window);
  if (!hay.includes(excerpt.slice(0, Math.min(40, excerpt.length)))) {
    // Fall back: search whole file for a distinctive prefix
    if (!normalizeText(fileText).includes(excerpt.slice(0, Math.min(40, excerpt.length)))) {
      return { provisionId: provision.provisionId, ok: false, reason: "excerpt not found near offsets or in file" };
    }
    return { provisionId: provision.provisionId, ok: true, reason: "excerpt found in file (offset drift tolerated)" };
  }
  return { provisionId: provision.provisionId, ok: true, reason: "excerpt matches near offsets" };
}

export function validateCorpusSpans(
  provisions: PrecedentProvision[],
  baseDir: string = process.cwd(),
  sampleSize = 40,
): { checked: number; ok: number; failures: SourceSpanValidation[] } {
  const step = Math.max(1, Math.floor(provisions.length / sampleSize));
  const sample = provisions.filter((_, i) => i % step === 0).slice(0, sampleSize);
  const failures: SourceSpanValidation[] = [];
  let ok = 0;
  for (const p of sample) {
    const v = validateSourceSpan(p, baseDir);
    if (v.ok) ok += 1;
    else failures.push(v);
  }
  return { checked: sample.length, ok, failures };
}
