import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  AdversarialExampleSchema,
  BasketCandidateSchema,
  FormulaTaxonomyEntrySchema,
} from "./schema";
import type { AdversarialExample, BasketCandidate, FormulaTaxonomyEntry } from "./types";

export interface SpanCheckResult {
  id: string;
  ok: boolean;
  reason?: string;
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function spanExistsInSource(exactSourceSpan: string, sourceText: string): boolean {
  if (sourceText.includes(exactSourceSpan)) return true;
  // PDF/EDGAR extracts often collapse whitespace across line wraps.
  return normalizeForMatch(sourceText).includes(normalizeForMatch(exactSourceSpan));
}

export function loadSourceText(workspaceRoot: string, documentPath: string): string {
  const abs = resolve(workspaceRoot, documentPath);
  if (!existsSync(abs)) {
    throw new Error(`Source document missing: ${documentPath}`);
  }
  return readFileSync(abs, "utf8");
}

export function validateBasketCandidate(
  candidate: unknown,
  workspaceRoot: string,
  sourceCache: Map<string, string> = new Map(),
): { record: BasketCandidate; span: SpanCheckResult } {
  const record = BasketCandidateSchema.parse(candidate);
  const path = record.sourceVersion.documentPath;
  let text = sourceCache.get(path);
  if (!text) {
    text = loadSourceText(workspaceRoot, path);
    sourceCache.set(path, text);
  }
  const ok = spanExistsInSource(record.exactSourceSpan, text);
  return {
    record,
    span: {
      id: record.id,
      ok,
      reason: ok ? undefined : "exactSourceSpan not found in cited document (raw or whitespace-normalized)",
    },
  };
}

export function validateAdversarialExample(
  example: unknown,
  workspaceRoot: string,
  sourceCache: Map<string, string> = new Map(),
): { record: AdversarialExample; span: SpanCheckResult } {
  const record = AdversarialExampleSchema.parse(example);
  const path = record.sourceVersion.documentPath;
  let text = sourceCache.get(path);
  if (!text) {
    text = loadSourceText(workspaceRoot, path);
    sourceCache.set(path, text);
  }
  const ok = spanExistsInSource(record.exactSourceSpan, text);
  return {
    record,
    span: {
      id: record.id,
      ok,
      reason: ok ? undefined : "exactSourceSpan not found in cited document (raw or whitespace-normalized)",
    },
  };
}

export function validateTaxonomy(entries: unknown[]): FormulaTaxonomyEntry[] {
  return entries.map((e) => FormulaTaxonomyEntrySchema.parse(e));
}
