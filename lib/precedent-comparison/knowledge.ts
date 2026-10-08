/**
 * Adapters over existing Headroom knowledge interfaces.
 *
 * Reuses evaluation-v2 signal extraction (drafting-pattern detectors) and
 * text normalization. Does not call the semantic compiler, verifier, solver,
 * or any paid provider.
 */
import { extractSignals, normalizeText, jaccard, overlapCoefficient } from "../contract-model/evaluation-v2/signals";
import type { SemanticSignals } from "../contract-model/evaluation-v2/types";
import type { SignalExtractionInput } from "../contract-model/evaluation-v2/signals";

export { extractSignals, normalizeText, jaccard, overlapCoefficient };

export function signalsForProvision(sourceText: string, structuredHints: string[] = []): SemanticSignals {
  const input: SignalExtractionInput = { text: sourceText, structuredHints };
  return extractSignals(input);
}

/** Tokenize normalized source text for exact textual comparison. */
export function tokenizeSource(text: string): string[] {
  const n = normalizeText(text).toLowerCase();
  return n.split(/(\s+|[()[\]{},.;:"']+)/).filter((t) => t.length > 0 && !/^\s+$/.test(t));
}
