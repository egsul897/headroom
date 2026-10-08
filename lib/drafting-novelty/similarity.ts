/**
 * Lexical similarity helpers.
 *
 * IMPORTANT: high Jaccard / shingle overlap is NOT semantic equivalence.
 * Callers must keep `equivalenceClaim: "NONE_LEXICAL_ONLY"` on any neighbor
 * surfaced to reviewers.
 */
import { maskNumericLiterals } from "./normalize";

export function tokenize(masked: string): string[] {
  return masked
    .split(/[^a-z0-9<>%$.]+/)
    .filter((t) => t.length > 1);
}

export function shingles(text: string, n = 3): string[] {
  const toks = tokenize(maskNumericLiterals(text));
  if (toks.length === 0) return [];
  if (toks.length <= n) return [toks.join(" ")];
  const out: string[] = [];
  for (let i = 0; i <= toks.length - n; i++) {
    out.push(toks.slice(i, i + n).join(" "));
  }
  return out;
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = a instanceof Set ? a : new Set(a);
  const sb = b instanceof Set ? b : new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function lexicalJaccard(textA: string, textB: string): number {
  return jaccard(shingles(textA), shingles(textB));
}
